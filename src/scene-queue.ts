import { localCyclesAvailable } from './distribution'
import { localRenderJobsPath } from './cycles-settings'
import type { LocalRenderPreset } from './cycles-settings'
import { uid } from './model'
import type { Project } from './model'
import type { RenderJobSpec, SceneJob } from './render-jobs'
import { idbResult } from './workspace-db'
import { listProjectImages, projectImage, projectImageSnapshot, removeProjectImage } from './project-images'
import { readProject } from './storage'

const eventName = 'myhome-render-jobs'
let legacyDb: Promise<IDBDatabase> | undefined

function legacy() {
  if (!legacyDb) {
    const request = indexedDB.open('myhome-scene-queue', 1)
    request.onupgradeneeded = () => {
      for (const store of ['jobs', 'frames', 'images']) request.result.createObjectStore(store)
    }
    legacyDb = idbResult(request).catch(error => { legacyDb = undefined; throw error })
  }
  return legacyDb
}

async function request(path: string, body: unknown = {}, signal?: AbortSignal) {
  if (!localCyclesAvailable) throw new Error('Cycles için Windows sürümünü açın.')
  const response = await fetch(`${localRenderJobsPath}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  })
  if (!response.ok) {
    const data = await response.json().catch(() => undefined)
    throw new Error(data?.error ?? 'Yerel render işleyicisine ulaşılamadı.')
  }
  return response
}

export function announceSceneJobs() { window.dispatchEvent(new Event(eventName)) }
export function onSceneJobsChange(listener: () => void) {
  window.addEventListener(eventName, listener)
  return () => window.removeEventListener(eventName, listener)
}

export async function listSceneJobs(requireServer = false): Promise<SceneJob[]> {
  const [server, older, restored] = await Promise.all([
    localCyclesAvailable ? (request('list').then(response => response.json()) as Promise<SceneJob[]>).catch(error => error as Error) : [],
    legacy().then(db => idbResult(db.transaction('jobs').objectStore('jobs').getAll())).catch(() => []) as Promise<SceneJob[]>,
    listProjectImages(),
  ])
  if (server instanceof Error) {
    if (requireServer) throw server
    if (restored.length || older.length) return [...restored, ...older.map(job => ({ ...job, browser: true }))]
    throw server
  }
  const ids = new Set(server.map(row => row.id))
  return [...server, ...restored, ...older.filter(row => !ids.has(row.id)).map((row): SceneJob => ({
    ...row, browser: true, state: row.state === 'rendering' || row.state === 'queued' ? 'failed' : row.state,
    error: row.state === 'rendering' || row.state === 'queued' ? 'Eski tarayıcı işi. Yerel kuyruğa aktarabilirsiniz.' : row.error,
  }))]
}

export async function submitSceneJob(spec: RenderJobSpec, preset: LocalRenderPreset) {
  const body = { ...spec, id: spec.id ?? uid(), preset }
  const response = await request('submit', body).catch(error => {
    if (!(error instanceof TypeError)) throw error
    return request('submit', body)
  })
  const { id } = await response.json() as { id: string }
  announceSceneJobs()
  return id
}

export async function waitForSceneJob(id: string, signal?: AbortSignal) {
  const deadline = Date.now() + 45 * 60_000
  while (Date.now() < deadline) {
    const job = await request('status', { id }, signal).then(response => response.json()) as SceneJob
    if (job.state === 'succeeded') return request('image', { id }, signal).then(response => response.blob())
    if (job.state === 'failed') throw new Error(job.error ?? 'Cycles render tamamlanamadı.')
    await new Promise(resolve => setTimeout(resolve, 1500))
  }
  throw new Error('İş yerel kuyrukta sürüyor. Galeriden takip edebilirsiniz.')
}

export async function sceneJobImage(job: SceneJob): Promise<Blob> {
  if (job.archived) return projectImage(job.id)
  if (!job.browser) return request('image', { id: job.id }).then(response => response.blob())
  const db = await legacy()
  const image = await idbResult(db.transaction('images').objectStore('images').get(job.id)) as Blob | undefined
  if (!image) throw new Error('Tarayıcıdaki PNG dosyası bulunamadı.')
  return image
}

export async function sceneJobSnapshot(job: SceneJob): Promise<Project> {
  if (job.archived) return projectImageSnapshot(job.id)
  return readProject(await request('snapshot', { id: job.id }).then(response => response.json()))
}

async function removeLegacy(id: string) {
  const db = await legacy()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['jobs', 'frames', 'images'], 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error)
    for (const store of ['jobs', 'frames', 'images']) tx.objectStore(store).delete(id)
  })
}

export async function retrySceneJob(job: SceneJob) {
  if (job.browser) {
    const db = await legacy()
    const project = await idbResult(db.transaction('frames').objectStore('frames').get(job.id)) as Project | undefined
    if (!project) throw new Error('Tarayıcıdaki sahne verisi bulunamadı.')
    await submitSceneJob({ id: job.id, project, context: { projectName: project.title, cameraLabel: 'Kayıtlı kadraj' } },
      job.preset === 'png' ? 'preview' : job.preset)
    await removeLegacy(job.id)
  } else await request('retry', { id: job.id })
  announceSceneJobs()
}

export async function removeSceneJob(job: SceneJob) {
  if (job.archived) await removeProjectImage(job.id)
  else if (job.browser) await removeLegacy(job.id)
  else await request('remove', { id: job.id })
  announceSceneJobs()
}
