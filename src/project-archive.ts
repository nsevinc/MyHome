import { z } from 'zod'
import { makeProject, uid } from './model'
import type { Project } from './model'
import { readProject } from './storage'
import { readPersonalModel } from './personal-library'
import type { PersonalModel } from './personal-library'
import { idbResult, workspaceDatabase, writeWorkspace } from './workspace-db'
import { decodePortableImage, portableImageSchema, portableProjectImage, projectImageStores, putProjectImage, snapshotKey } from './project-images'
import type { PortableImage } from './project-images'
import { listSceneJobs, sceneJobImage, sceneJobSnapshot } from './scene-queue'
import type { SceneJob } from './render-jobs'

export const initialProjectId = 'initial'
export const maxBackupBytes = 256 * 1024 * 1024
export type ArchiveProject = { id: string; title: string; updated: number; itemCount: number }
export type Revision = { id: string; projectId: string; name: string; updated: number }
export type OpenProject = { id: string; project: Project }
const projectKey = (id: string) => `project:${id}`
const revisionKey = (id: string) => `revision:${id}`

function putProject(tx: IDBTransaction, id: string, project: Project, updated = Date.now()) {
  tx.objectStore('projects').put(project, projectKey(id))
  tx.objectStore('archive').put({ id, title: project.title, updated, itemCount: project.items.length } satisfies ArchiveProject)
}

export async function openLocalProject(): Promise<OpenProject | undefined> {
  const db = await workspaceDatabase()
  const active = await idbResult(db.transaction('projects').objectStore('projects').get('active')) as string | undefined
  if (active) return archiveProject(active)
  const legacy = await idbResult(db.transaction('projects').objectStore('projects').get('current'))
  return legacy === undefined ? undefined : { id: initialProjectId, project: readProject(legacy) }
}

export async function saveLocalProject(id: string, project: Project) {
  await writeWorkspace(['projects', 'archive'], tx => {
    putProject(tx, id, project)
    const store = tx.objectStore('projects')
    const active = store.get('active')
    active.onsuccess = () => { if (!active.result) store.put(id, 'active') }
  })
}

export async function archiveProject(id: string): Promise<OpenProject> {
  const db = await workspaceDatabase()
  const raw = await idbResult(db.transaction('projects').objectStore('projects').get(projectKey(id)))
  if (!raw) throw new Error('Proje arşivde bulunamadı.')
  return { id, project: readProject(raw) }
}

export async function activateProject(next: OpenProject, previous?: OpenProject, baseline?: Revision) {
  await writeWorkspace(baseline ? ['projects', 'archive', 'revisions'] : ['projects', 'archive'], tx => {
    if (previous && previous.id !== next.id) putProject(tx, previous.id, previous.project)
    putProject(tx, next.id, next.project)
    const projects = tx.objectStore('projects')
    if (baseline) {
      tx.objectStore('revisions').add(baseline)
      projects.add(next.project, revisionKey(baseline.id))
    }
    projects.put(next.id, 'active')
  })
}

export const newArchiveProject = (title: string, from?: Project): OpenProject =>
  ({ id: uid(), project: { ...(from ?? makeProject(false)), title: title.trim().slice(0, 100) || 'Yeni oda' } })

export async function listArchive() {
  const db = await workspaceDatabase()
  const projects: ArchiveProject[] = await idbResult(db.transaction('archive').objectStore('archive').getAll())
  return projects.sort((a, b) => b.updated - a.updated)
}

export async function listRevisions(projectId: string) {
  const db = await workspaceDatabase()
  const revisions: Revision[] = await idbResult(db.transaction('revisions').objectStore('revisions').index('projectId').getAll(projectId))
  return revisions.sort((a, b) => b.updated - a.updated)
}

export async function saveRevision(source: OpenProject, name: string, snapshot?: Project) {
  const row: Revision = { id: uid(), projectId: source.id, name: name.trim().slice(0, 100), updated: Date.now() }
  if (!row.name) return
  await writeWorkspace(['projects', 'archive', 'revisions'], tx => {
    if (!snapshot) putProject(tx, source.id, source.project)
    tx.objectStore('revisions').add(row)
    tx.objectStore('projects').add(snapshot ?? source.project, revisionKey(row.id))
  })
  return row
}

export async function revisionProject(row: Revision) {
  const db = await workspaceDatabase()
  const raw = await idbResult(db.transaction('projects').objectStore('projects').get(revisionKey(row.id)))
  if (!raw) throw new Error('Bu sürüm arşivde bulunamadı.')
  return readProject(raw)
}

export async function revisionCopy(row: Revision) {
  const project = await revisionProject(row)
  const next = newArchiveProject(`${project.title} · ${row.name}`, project)
  return { next, baseline: { ...row, id: uid(), projectId: next.id } }
}

const key = z.string().min(1).max(100)
const named = z.string().trim().min(1).max(100)
const date = z.number().int().nonnegative().max(8.64e15)
const backupSchema = z.object({
  format: z.literal('myhome-workspace'), version: z.literal(1), active: key,
  projects: z.array(z.object({ id: key, updated: date, project: z.unknown() })).min(1),
  revisions: z.array(z.object({ id: key, projectId: key, updated: date, name: named, project: z.unknown() })),
  models: z.array(z.unknown()),
  renders: z.array(portableImageSchema).optional(),
  snapshots: z.record(z.string().regex(/^[a-f0-9]{64}$/), z.unknown()).optional(),
})

type ArchiveContents = Omit<z.infer<typeof backupSchema>, 'renders' | 'snapshots'>
export type ArchiveImage = { job: SceneJob; png: Blob; snapshot?: Project }

async function* archiveImages(jobs: SceneJob[]) {
  for (const job of jobs) {
    const [png, snapshot] = await Promise.all([sceneJobImage(job), job.hasSnapshot ? sceneJobSnapshot(job) : undefined])
    yield { job, png, snapshot }
  }
}

async function serializeArchive(contents: ArchiveContents, images: AsyncIterable<ArchiveImage> | Iterable<ArchiveImage>) {
  const archive = { ...contents, renders: [] as PortableImage[], snapshots: {} as Record<string, Project> }
  let bytes = new Blob([JSON.stringify(archive)]).size
  if (bytes > maxBackupBytes) throw new Error('Çalışma alanı 256 MB yedek sınırını aşıyor.')
  for await (const { job, png, snapshot } of images) {
    const snapshotId = snapshot && await snapshotKey(snapshot)
    if (snapshot && snapshotId && !archive.snapshots[snapshotId]) {
      bytes += new Blob([JSON.stringify(snapshot)]).size
      archive.snapshots[snapshotId] = snapshot
    }
    bytes += Math.ceil(png.size / 3) * 4
    if (bytes > maxBackupBytes) throw new Error('Yedek 256 MB sınırını aşıyor. Daha az render seçin veya PNG dosyalarını galeriden ayrı indirin.')
    archive.renders.push(await portableProjectImage(job, png, snapshotId))
  }
  const file = new Blob([JSON.stringify(archive)], { type: 'application/json' })
  if (file.size > maxBackupBytes) throw new Error('Çalışma alanı 256 MB yedek sınırını aşıyor.')
  return file
}

export function exportRevisionArchive(row: Revision, project: Project, images: AsyncIterable<ArchiveImage> | Iterable<ArchiveImage>) {
  return serializeArchive({
    format: 'myhome-workspace', version: 1, active: row.projectId,
    projects: [{ id: row.projectId, updated: row.updated, project }],
    revisions: [{ ...row, project }],
    models: [],
  }, images)
}

export async function exportArchive(active: OpenProject, onlyActive = false) {
  await saveLocalProject(active.id, active.project)
  const db = await workspaceDatabase()
  const tx = db.transaction(['archive', 'projects', 'revisions', 'models'])
  const records = tx.objectStore('projects')
  const [metadata, revisions, models, keys, values] = await Promise.all([
    idbResult(tx.objectStore('archive').getAll()) as Promise<ArchiveProject[]>,
    idbResult(tx.objectStore('revisions').getAll()) as Promise<Revision[]>,
    idbResult(tx.objectStore('models').getAll()) as Promise<PersonalModel[]>,
    idbResult(records.getAllKeys()), idbResult(records.getAll()),
  ])
  const data = new Map(keys.map((key, i) => [key, values[i]]))
  const projects = onlyActive ? metadata.filter(row => row.id === active.id) : metadata
  const projectIds = new Set(projects.map(row => row.id))
  const archive: ArchiveContents = { format: 'myhome-workspace', version: 1, active: active.id,
    projects: projects.map(row => ({ id: row.id, updated: row.updated, project: data.get(projectKey(row.id)) })),
    revisions: revisions.filter(row => projectIds.has(row.projectId)).map(row => ({ ...row, project: data.get(revisionKey(row.id)) })),
    models: onlyActive ? [] : models }
  const jobs = (await listSceneJobs(true)).filter(job =>
    job.state === 'succeeded' && projectIds.has(job.projectId ?? job.metadata?.projectId ?? ''))
  return serializeArchive(archive, archiveImages(jobs))
}

export function readArchive(raw: unknown) {
  const backup = backupSchema.parse(raw)
  const projectIds = new Set(backup.projects.map(row => row.id))
  if (projectIds.size !== backup.projects.length || !projectIds.has(backup.active)
    || new Set(backup.revisions.map(row => row.id)).size !== backup.revisions.length
    || backup.revisions.some(row => !projectIds.has(row.projectId))
    || backup.renders?.some(row => !projectIds.has(row.projectId) || (row.snapshotId && !backup.snapshots?.[row.snapshotId]))) {
    throw new Error('Yedek proje, sürüm veya görüntü bağlantıları geçersiz.')
  }
  return { ...backup, projects: backup.projects.map(row => ({ ...row, project: readProject(row.project) })),
    revisions: backup.revisions.map(row => ({ ...row, project: readProject(row.project) })),
    models: backup.models.map(readPersonalModel),
    snapshots: Object.fromEntries(Object.entries(backup.snapshots ?? {}).map(([id, project]) => [id, readProject(project)])) }
}

export async function importArchive(file: File, previous?: OpenProject): Promise<OpenProject> {
  if (file.size > maxBackupBytes) throw new Error('Çalışma alanı yedeği en fazla 256 MB olabilir.')
  return restoreArchive(JSON.parse(await file.text()), previous)
}

export async function restoreArchive(raw: unknown, previous?: OpenProject): Promise<OpenProject> {
  const backup = readArchive(raw)
  const map = new Map(backup.projects.map(row => [row.id, uid()]))
  const active = backup.projects.find(row => row.id === backup.active)!
  const next = { id: map.get(active.id)!, project: active.project }
  const images: { details: Omit<PortableImage, 'png'>; image: Blob; snapshot?: Project }[] = []
  const keys = new Map<string, string>()
  for (const render of backup.renders ?? []) {
    const { png, ...details } = render
    const snapshot = details.snapshotId ? backup.snapshots[details.snapshotId] : undefined
    if (snapshot && details.snapshotId) {
      const originalId = details.snapshotId
      details.snapshotId = keys.get(originalId) ?? await snapshotKey(snapshot)
      keys.set(originalId, details.snapshotId)
    }
    images.push({ details, image: await decodePortableImage(render), snapshot })
  }
  await writeWorkspace(['archive', 'projects', 'revisions', 'models', ...projectImageStores], tx => {
    if (previous) putProject(tx, previous.id, previous.project)
    for (const row of backup.projects) putProject(tx, map.get(row.id)!, row.project, row.updated)
    for (const { project, ...row } of backup.revisions) {
      const id = uid()
      tx.objectStore('revisions').add({ ...row, id, projectId: map.get(row.projectId) })
      tx.objectStore('projects').add(project, revisionKey(id))
    }
    for (const model of backup.models) tx.objectStore('models').add({ ...model, id: uid() })
    for (const { details, image, snapshot } of images) {
      putProjectImage(tx, { ...details, projectId: map.get(details.projectId)! }, image, snapshot)
    }
    tx.objectStore('projects').put(next.id, 'active')
  })
  return next
}
