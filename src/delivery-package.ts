import { Zip, ZipPassThrough } from 'fflate'
import { designScene } from './design-variants'
import { installationPdf } from './installation-pdf'
import { layoutName, layoutScene } from './layout-variants'
import type { Project } from './model'
import { mountingCodes, mountingLayoutCode } from './mounting-codes'
import { exportRevisionArchive } from './project-archive'
import type { ArchiveImage, Revision } from './project-archive'
import { compareRevisions } from './revision-comparison'
import type { SceneJob } from './render-jobs'
import { sceneJobImage, sceneJobSnapshot } from './scene-queue'
import { projectFilename } from './storage'

export async function deliveryVersion(revision: Revision, project: Project) {
  const scene = designScene(layoutScene(project))
  const layout = layoutName(project) ?? 'Mevcut yerleşim'
  return { revision, project, scene, layout, codes: await mountingCodes(scene) }
}

export type DeliveryVersion = Awaited<ReturnType<typeof deliveryVersion>>

export function deliveryRenderStatus(job: SceneJob, layout: string, verified?: string) {
  const code = verified ?? job.metadata?.layoutCode
  if (!code) return 'unknown'
  return code === layout ? 'match' : 'different'
}

export async function recordedLayoutCode(job: SceneJob) {
  return mountingLayoutCode(await sceneJobSnapshot(job))
}

type PackageFile = { name: string; data: Blob }
const textFile = (text: string) => new Blob([text], { type: 'text/plain;charset=utf-8' })
const safeName = (name: string) => projectFilename(name.replace(/[\u0000-\u001F\u007F]/g, '-'))

async function zipDelivery(files: PackageFile[]) {
  const chunks: BlobPart[] = []
  const stream = new Zip()
  const finished = new Promise<Blob>((resolve, reject) => {
    stream.ondata = (error, chunk, final) => {
      if (error) { reject(error); return }
      chunks.push(chunk)
      if (final) resolve(new Blob(chunks, { type: 'application/zip' }))
    }
  })
  // A ZIP callback may reject while the current file is still being read.
  void finished.catch(() => {})
  try {
    for (const { name, data } of files) {
      const entry = new ZipPassThrough(name)
      stream.add(entry)
      const reader = data.stream().getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          entry.push(value)
        }
        entry.push(new Uint8Array(), true)
      } finally { reader.releaseLock() }
    }
    stream.end()
    return await finished
  } catch (error) {
    stream.terminate()
    throw error
  }
}

export async function createDeliveryPackage(version: DeliveryVersion, jobs: readonly SceneJob[], previous?: DeliveryVersion) {
  const { revision, project, scene, layout, codes } = version
  if (previous && (previous.revision.projectId !== revision.projectId || previous.revision.id === revision.id
    || previous.revision.updated > revision.updated)) {
    throw new Error('Değişiklik özeti için bu projeye ait önceki bir sürüm seçin.')
  }
  const renders: PackageFile[] = []
  async function* pictures(): AsyncGenerator<ArchiveImage> {
    const selected = new Set<string>()
    for (const job of jobs) {
      if (selected.has(job.id) || job.state !== 'succeeded' || (job.projectId ?? job.metadata?.projectId) !== revision.projectId) {
        throw new Error('Seçilen renderlardan biri bu proje için erişilebilir değil.')
      }
      selected.add(job.id)
      const snapshot = job.hasSnapshot ? await sceneJobSnapshot(job) : undefined
      const code = snapshot ? await mountingLayoutCode(snapshot) : job.metadata?.layoutCode
      if (code !== codes.layout) throw new Error(`${job.name} · renderın yerleşimi seçilen sürümle doğrulanamadı.`)
      const png = await sceneJobImage(job)
      const metadata = job.metadata && { ...job.metadata, layoutCode: code }
      renders.push({ name: `Renderlar/${String(renders.length + 1).padStart(2, '0')}-${safeName(job.name)}.png`, data: png })
      yield { job: { ...job, metadata }, png, snapshot }
    }
  }

  const backup = await exportRevisionArchive(revision, project, pictures())
  const summary = previous && { from: previous.revision.name, fromCode: previous.codes.revision, toCode: codes.revision,
    comparison: compareRevisions(previous.scene, scene) }
  const pdf = await installationPdf(scene, layout, new Set(scene.walls.map(wall => wall.id)), true, revision.name, summary)
  const date = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Istanbul' })
  const guide = [
    'MyHome · Teslim paketi', project.title, `Sürüm · ${revision.name}`, `Kaydedildi · ${date.format(revision.updated)}`,
    `Yerleşim · ${layout}`, `Yerleşim kodu · ${codes.layout}`, `Kontrol sürümü · ${codes.revision}`, '',
    'Montaj-Plani.pdf · Ölçülü plan, kesitler ve montaj kontrol özeti',
    ...(previous ? [`PDF değişiklik özeti · ${previous.revision.name} → ${revision.name}`] : []),
    'Proje.workspace.json · MyHome’da Proje → Projeyi aç ile düzenlenebilir bir kopya açar.', '',
    ...renders.map(file => file.name),
  ].join('\r\n')
  return {
    zip: await zipDelivery([{ name: 'Montaj-Plani.pdf', data: pdf }, { name: 'Proje.workspace.json', data: backup },
      { name: 'Teslim-Bilgileri.txt', data: textFile(guide) }, ...renders]),
    filename: `${safeName(revision.name)}-Teslim.zip`,
  }
}
