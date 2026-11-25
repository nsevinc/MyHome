import { z } from 'zod'
import { readDataUrl } from './catalog'
import { uid } from './model'
import type { Project } from './model'
import { renderMetadataSchema } from './render-jobs'
import type { RenderMetadata, SceneJob } from './render-jobs'
import { idbResult, workspaceDatabase, writeWorkspace } from './workspace-db'
import { readProject } from './storage'

export const projectImageStores = ['render-outputs', 'render-png', 'render-snapshots']
const maxImageBytes = 40 * 1024 * 1024
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
const outputDetails = z.object({
  projectId: z.string().min(1).max(100), name: z.string().trim().min(1).max(100),
  preset: z.enum(['4k', 'preview', 'panorama', 'png']), metadata: renderMetadataSchema.optional(),
  snapshotId: z.string().regex(/^[a-f0-9]{64}$/).optional(),
})
export const portableImageSchema = outputDetails.extend({
  png: z.string().min(44).max(Math.ceil(maxImageBytes / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/),
})
type OutputDetails = z.infer<typeof outputDetails>
export type PortableImage = z.infer<typeof portableImageSchema>
type ProjectImageRow = OutputDetails & { id: string; order: number }

export async function listProjectImages(): Promise<SceneJob[]> {
  const db = await workspaceDatabase()
  const rows: ProjectImageRow[] = await idbResult(db.transaction('render-outputs').objectStore('render-outputs').getAll())
  return rows.sort((a, b) => b.order - a.order).map(({ snapshotId, ...row }) =>
    ({ ...row, state: 'succeeded', archived: true, hasSnapshot: Boolean(snapshotId) }))
}

export async function projectImageSnapshot(id: string) {
  const db = await workspaceDatabase()
  const tx = db.transaction(['render-outputs', 'render-snapshots'])
  // Queue the dependent read in the request callback to keep the transaction active.
  const raw = await new Promise<unknown>((resolve, reject) => {
    const output = tx.objectStore('render-outputs').get(id)
    output.onerror = () => reject(output.error)
    output.onsuccess = () => {
      const row = output.result as ProjectImageRow | undefined
      if (!row?.snapshotId) { resolve(undefined); return }
      idbResult(tx.objectStore('render-snapshots').get(row.snapshotId)).then(resolve, reject)
    }
  })
  if (!raw) throw new Error('Bu görüntünün sahne kaydı bulunamadı.')
  return readProject(raw)
}

export async function snapshotKey(project: Project) {
  const bytes = new TextEncoder().encode(JSON.stringify(project))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('')
}

export async function projectImage(id: string): Promise<Blob> {
  const db = await workspaceDatabase()
  const blob = await idbResult(db.transaction('render-png').objectStore('render-png').get(id)) as Blob | undefined
  if (!blob) throw new Error('Projeye eklenen PNG bulunamadı.')
  return blob
}

export async function removeProjectImage(id: string) {
  await writeWorkspace(projectImageStores, tx => {
    const outputs = tx.objectStore('render-outputs')
    const current = outputs.get(id)
    outputs.delete(id)
    tx.objectStore('render-png').delete(id)
    current.onsuccess = () => {
      const snapshotId = (current.result as ProjectImageRow | undefined)?.snapshotId
      if (!snapshotId) return
      const reference = outputs.index('snapshotId').getKey(snapshotId)
      reference.onsuccess = () => { if (reference.result === undefined) tx.objectStore('render-snapshots').delete(snapshotId) }
    }
  })
}

async function validatePng(file: Blob) {
  if (file.size < 33 || file.size > maxImageBytes) throw new Error('40 MB’a kadar geçerli bir PNG seçin.')
  const header = new Uint8Array(await file.slice(0, 24).arrayBuffer())
  const view = new DataView(header.buffer)
  const width = view.getUint32(16), height = view.getUint32(20)
  if (!pngSignature.every((value, i) => header[i] === value) || view.getUint32(12) !== 0x49484452
    || !width || !height || width * height > 64_000_000) throw new Error('PNG başlığı veya görüntü boyutları geçersiz.')
  const png = file.slice(0, file.size, 'image/png')
  try {
    const image = await createImageBitmap(png)
    image.close()
  } catch { throw new Error('PNG görüntüsü okunamadı.') }
  return png
}

export function putProjectImage(tx: IDBTransaction, details: OutputDetails, png: Blob, snapshot?: Project) {
  const id = uid()
  const metadata = details.metadata && { ...details.metadata, projectId: details.projectId }
  tx.objectStore('render-outputs').add({ ...details, metadata, id, order: Date.now() } satisfies ProjectImageRow)
  tx.objectStore('render-png').add(png, id)
  if (details.snapshotId && snapshot) tx.objectStore('render-snapshots').put(snapshot, details.snapshotId)
}

export async function saveProjectPng(projectId: string, name: string, file: Blob, metadata?: RenderMetadata, project?: Project) {
  const snapshot = project && readProject(project)
  const snapshotId = snapshot && await snapshotKey(snapshot)
  const details = outputDetails.parse({ projectId, name: name.trim().slice(0, 100) || 'PNG görüntüsü', preset: 'png', metadata, snapshotId })
  const png = await validatePng(file)
  await writeWorkspace(projectImageStores, tx => putProjectImage(tx, details, png, snapshot))
}

export async function portableProjectImage(job: SceneJob, file: Blob, snapshotId?: string): Promise<PortableImage> {
  const details = outputDetails.parse({ projectId: job.projectId ?? job.metadata?.projectId,
    name: job.name, preset: job.preset, metadata: job.metadata, snapshotId })
  if (file.size > maxImageBytes) throw new Error('Bir PNG 40 MB sınırını aşıyor.')
  const data = await readDataUrl(file.slice(0, file.size, 'image/png'))
  return { ...details, png: data.slice(data.indexOf(',') + 1) }
}

export async function decodePortableImage({ png }: PortableImage) {
  let buffer: string
  try { buffer = atob(png) }
  catch { throw new Error('Yedekteki PNG verisi geçersiz.') }
  const bytes = new Uint8Array(buffer.length)
  for (let i = 0; i < bytes.length; i++) bytes[i] = buffer.charCodeAt(i)
  return validatePng(new Blob([bytes], { type: 'image/png' }))
}
