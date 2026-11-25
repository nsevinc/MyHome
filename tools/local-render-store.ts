import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { SceneJob, RenderMetadata } from '../src/render-jobs'
import type { LocalRenderPreset } from '../src/cycles-settings'

const leaseMs = 30_000
const maxJobs = 24
type RecordRow = { id: string; name: string; preset: LocalRenderPreset; ordinal: number;
  state: SceneJob['state']; metadata: string; error: string | null; hasSnapshot: number }
const summaries = `SELECT ordinal,id,name,preset,state,metadata,error, state='succeeded'
  AND EXISTS(SELECT 1 FROM job_snapshots WHERE job_id=jobs.id) AS hasSnapshot FROM jobs`

function summary(row: RecordRow): SceneJob {
  return { id: row.id, name: row.name, preset: row.preset, order: row.ordinal, state: row.state,
    error: row.error ?? undefined, metadata: JSON.parse(row.metadata) as RenderMetadata,
    hasSnapshot: Boolean(row.hasSnapshot) }
}

export class LocalRenderStore {
  private readonly db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS jobs (
        ordinal INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        preset TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued',
        metadata TEXT NOT NULL, digest TEXT NOT NULL, frame TEXT, image BLOB, error TEXT,
        attempts INTEGER NOT NULL DEFAULT 0, lease TEXT
      );
      CREATE TABLE IF NOT EXISTS render_snapshots (hash TEXT PRIMARY KEY, frame TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS job_snapshots (
        job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
        hash TEXT NOT NULL REFERENCES render_snapshots(hash)
      );
      CREATE INDEX IF NOT EXISTS job_snapshot_hash ON job_snapshots(hash);
      CREATE TABLE IF NOT EXISTS render_lane (id INTEGER PRIMARY KEY, owner TEXT, expires INTEGER NOT NULL);
      INSERT OR IGNORE INTO render_lane (id, expires) VALUES (1, 0);
    `)
  }

  private saveSnapshot(id: string, frame: string) {
    const hash = createHash('sha256').update(frame).digest('hex')
    this.db.prepare('INSERT OR IGNORE INTO render_snapshots VALUES (?,?)').run(hash, frame)
    this.db.prepare('INSERT INTO job_snapshots VALUES (?,?)').run(id, hash)
  }

  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const value = action()
      this.db.exec('COMMIT')
      return value
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  add(id: string, name: string, preset: LocalRenderPreset, metadata: RenderMetadata, frame: string) {
    const info = JSON.stringify(metadata)
    const { layoutCode: _layoutCode, ...submitted } = metadata
    const digest = createHash('sha256').update(preset).update(JSON.stringify(submitted)).update(frame).digest('hex')
    return this.transaction(() => {
      const prior = this.db.prepare('SELECT digest FROM jobs WHERE id=?').get(id)
      if (prior) return prior.digest === digest ? 'existing' : 'conflict'
      const count = this.db.prepare("SELECT count(*) AS total FROM jobs WHERE state IN ('queued','rendering')").get()!.total as number
      if (count >= maxJobs) return 'full'
      // A worker started before the schema upgrade still reads the transient job frame.
      this.db.prepare('INSERT INTO jobs (id,name,preset,metadata,digest,frame) VALUES (?,?,?,?,?,?)')
        .run(id, name, preset, info, digest, frame)
      this.saveSnapshot(id, frame)
      return 'created'
    })
  }

  list(): SceneJob[] {
    return (this.db.prepare(`${summaries} ORDER BY ordinal DESC`)
      .all() as unknown as RecordRow[]).map(summary)
  }

  get(id: string) {
    const row = this.db.prepare(`${summaries} WHERE id=?`)
      .get(id) as unknown as RecordRow | undefined
    return row && summary(row)
  }

  hasWork() {
    return Boolean(this.db.prepare("SELECT 1 FROM jobs WHERE state IN ('queued','rendering') LIMIT 1").get())
  }

  image(id: string) {
    return this.db.prepare("SELECT image FROM jobs WHERE id=? AND state='succeeded'").get(id)?.image as Uint8Array | undefined
  }

  snapshot(id: string) {
    return this.db.prepare(`SELECT snapshot.frame FROM jobs JOIN job_snapshots ON jobs.id=job_id
      JOIN render_snapshots AS snapshot USING(hash) WHERE jobs.id=? AND jobs.state='succeeded'`).get(id)?.frame as string | undefined
  }

  retry(id: string) {
    return this.db.prepare(`UPDATE jobs SET state='queued', attempts=0, error=NULL WHERE id=? AND state='failed'
      AND (frame IS NOT NULL OR EXISTS(SELECT 1 FROM job_snapshots WHERE job_id=jobs.id))`)
      .run(id).changes > 0
  }

  remove(id: string) {
    return this.transaction(() => {
      const link = this.db.prepare('SELECT hash FROM job_snapshots WHERE job_id=?').get(id)
      const removed = this.db.prepare("DELETE FROM jobs WHERE id=? AND state IN ('failed','succeeded')").run(id).changes > 0
      if (removed && typeof link?.hash === 'string') this.db.prepare(
        'DELETE FROM render_snapshots WHERE hash=? AND NOT EXISTS(SELECT 1 FROM job_snapshots WHERE hash=?)'
      ).run(link.hash, link.hash)
      return removed
    })
  }

  private lock(now: number) {
    const owner = randomUUID()
    const changed = this.db.prepare('UPDATE render_lane SET owner=?,expires=? WHERE id=1 AND expires<=?')
      .run(owner, now + leaseMs, now).changes
    return changed ? owner : undefined
  }

  tryDirect(now = Date.now()) {
    return this.transaction(() => this.hasWork() ? undefined : this.lock(now))
  }

  claim(now = Date.now()) {
    return this.transaction(() => {
      const owner = this.lock(now)
      if (!owner) return
      this.db.prepare(`UPDATE jobs
        SET state=CASE WHEN attempts < 2 THEN 'queued' ELSE 'failed' END, lease=NULL,
        error=CASE WHEN attempts < 2 THEN NULL ELSE 'Render işleyicisi kesildi. İşi yeniden deneyin.' END
        WHERE state='rendering'`).run()
      const job = this.db.prepare(`SELECT id,preset,COALESCE(snapshot.frame,jobs.frame) AS frame FROM jobs
        LEFT JOIN job_snapshots ON jobs.id=job_id LEFT JOIN render_snapshots AS snapshot USING(hash)
        WHERE state='queued' ORDER BY ordinal LIMIT 1`)
        .get() as { id: string; preset: LocalRenderPreset; frame: string } | undefined
      if (!job) { this.release(owner); return }
      this.db.prepare("UPDATE jobs SET state='rendering',lease=?,attempts=attempts+1 WHERE id=?").run(owner, job.id)
      return { ...job, owner }
    })
  }

  heartbeat(owner: string, now = Date.now()) {
    return this.db.prepare('UPDATE render_lane SET expires=? WHERE id=1 AND owner=?').run(now + leaseMs, owner).changes > 0
  }

  release(owner: string) {
    this.db.prepare('UPDATE render_lane SET owner=NULL,expires=0 WHERE id=1 AND owner=?').run(owner)
  }

  finish(id: string, owner: string, result: { image: Uint8Array } | { error: string }) {
    return this.transaction(() => {
      const holdsLane = this.db.prepare('SELECT 1 FROM render_lane WHERE id=1 AND owner=?').get(owner)
      if (!holdsLane) return false
      if ('image' in result) {
        const row = this.db.prepare(`SELECT frame FROM jobs WHERE id=? AND lease=?
          AND NOT EXISTS(SELECT 1 FROM job_snapshots WHERE job_id=jobs.id)`).get(id, owner)
        if (typeof row?.frame === 'string') this.saveSnapshot(id, row.frame)
      }
      const finished = 'image' in result
        ? this.db.prepare("UPDATE jobs SET state='succeeded',image=?,frame=NULL,lease=NULL WHERE id=? AND lease=?")
          .run(result.image, id, owner).changes
        : this.db.prepare("UPDATE jobs SET state='failed',error=?,lease=NULL WHERE id=? AND lease=?")
          .run(result.error, id, owner).changes
      this.release(owner)
      return finished > 0
    })
  }

  close() { this.db.close() }
}
