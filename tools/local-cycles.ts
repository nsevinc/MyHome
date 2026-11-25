import { spawn } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { z } from 'zod'
import { cyclesPanorama, localCyclesPath, localRenderJobsPath, renderDevices, renderPresets } from '../src/cycles-settings'
import type { RenderDevice } from '../src/cycles-settings'
import { isInteriorCamera, projectCamera } from '../src/scene-data'
import { readProject } from '../src/storage'
import { renderJobInput } from '../src/render-jobs'
import { renderImage } from './cycles'
import { LocalRenderStore } from './local-render-store'
import { mountingLayoutCode } from '../src/mounting-codes'
import { renderFixtureStates } from '../src/lighting'

const maxBytes = 60 * 1024 * 1024
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function isLocalRequest(req: IncomingMessage) {
  if (!loopbackAddresses.has(req.socket.remoteAddress ?? '')) return false
  try {
    const origin = new URL(req.headers.origin ?? '')
    return loopbackHosts.has(origin.hostname) && origin.host === req.headers.host
      && (origin.protocol === 'http:' || origin.protocol === 'https:')
  } catch { return false }
}

function jsonResponse(res: ServerResponse, status: number, body: unknown) {
  if (res.destroyed) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

function errorResponse(res: ServerResponse, status: number, error: string) { return jsonResponse(res, status, { error }) }

function pngResponse(res: ServerResponse, image: Uint8Array, filename: string) {
  if (res.destroyed) return
  res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': image.length, 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${filename}"` })
  res.end(image)
}

async function requestBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length
    if (length > maxBytes) {
      req.resume()
      return undefined
    }
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export function createLocalCycles(blender: string | undefined, configuredDevice = 'CPU', database?: string,
  workerCommand = ['--import', 'tsx', fileURLToPath(new URL('./local-render-worker.ts', import.meta.url))],
  unavailable?: string) {
  const device = configuredDevice as RenderDevice
  const databasePath = resolve(database || '.myhome/local-renders.sqlite')
  let store: LocalRenderStore | undefined
  const jobs = () => store ??= new LocalRenderStore(databasePath)
  let worker: ReturnType<typeof spawn> | undefined
  function wakeWorker() {
    if (unavailable || worker || !renderDevices.includes(device) || !jobs().hasWork()) return
    const child = spawn(process.execPath, [...workerCommand, databasePath], {
      detached: true, windowsHide: true, stdio: 'ignore',
      env: { ...process.env, BLENDER_BIN: blender || process.env.BLENDER_BIN, MYHOME_CYCLES_DEVICE: device },
    })
    worker = child
    const reset = () => { if (worker === child) worker = undefined }
    child.once('error', reset)
    child.once('exit', reset)
    child.unref()
  }

  function guard(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      errorResponse(res, 405, 'Render için POST isteği gerekli.')
      return false
    }
    const error = !isLocalRequest(req) ? [403, 'Yerel Cycles bu MyHome adresinden kullanılabilir.'] as const
      : req.headers['content-type']?.split(';')[0].trim() !== 'application/json' ? [415, 'Render isteği JSON verisi içermeli.'] as const
      : Number(req.headers['content-length']) > maxBytes ? [413, 'Proje dosyası en fazla 60 MB olmalı.'] as const
      : !renderDevices.includes(device) ? [503, 'MYHOME_CYCLES_DEVICE ayarı geçersiz.'] as const : undefined
    if (error) { errorResponse(res, error[0], error[1]); return false }
    return true
  }

  async function manage(req: IncomingMessage, res: ServerResponse) {
    if (!guard(req, res)) return
    const route = new URL(req.url ?? '/', 'http://localhost').pathname
    try {
      if (route === '/list') {
        wakeWorker()
        return jsonResponse(res, 200, jobs().list())
      }
      let body: unknown
      try { body = await requestBody(req) }
      catch { return errorResponse(res, 422, 'Render isteği doğrulanamadı.') }
      if (body === undefined) return errorResponse(res, 413, 'Proje dosyası en fazla 60 MB olmalı.')
      if (route === '/submit') {
        if (unavailable) return errorResponse(res, 503, unavailable)
        const input = renderJobInput.safeParse(body)
        if (!input.success) return errorResponse(res, 422, 'Render bilgileri doğrulanamadı.')
        const { id, preset, context } = input.data
        let project
        try { project = readProject(input.data.project) }
        catch { return errorResponse(res, 422, 'MyHome projesi veya gömülü dosyaları doğrulanamadı.') }
        const camera = projectCamera(project)
        if (preset === 'panorama' && !isInteriorCamera(project, camera.position)) {
          return errorResponse(res, 422, '360° panorama için oda içindeki bir kamerayı seçin.')
        }
        const status = jobs().add(id, project.title, preset, { ...context, camera, layoutCode: await mountingLayoutCode(project),
          light: project.style.light, sun: project.style.sun, fixtures: renderFixtureStates(project) }, JSON.stringify(project))
        if (status === 'conflict') return errorResponse(res, 409, 'Bu iş numarası başka bir sahneye ait.')
        if (status === 'full') return errorResponse(res, 409, 'Render kuyruğu dolu. Önce sıradaki işlerin tamamlanmasını bekleyin.')
        wakeWorker()
        return jsonResponse(res, 202, { id })
      }
      const input = z.object({ id: z.uuid() }).safeParse(body)
      if (!input.success) return errorResponse(res, 422, 'Render iş numarası geçersiz.')
      const { id } = input.data
      const job = jobs().get(id)
      if (!job) return errorResponse(res, 404, 'Render işi bulunamadı.')
      if (route === '/status') {
        wakeWorker()
        return jsonResponse(res, 200, job)
      }
      if (route === '/image') {
        const image = jobs().image(id)
        return image ? pngResponse(res, image, 'myhome-cycles.png') : errorResponse(res, 409, 'PNG henüz hazır değil.')
      }
      if (route === '/snapshot') {
        const frame = jobs().snapshot(id)
        return frame ? jsonResponse(res, 200, JSON.parse(frame)) : errorResponse(res, 404, 'Bu görüntünün sahne kaydı bulunamadı.')
      }
      if (route === '/retry') {
        if (unavailable) return errorResponse(res, 503, unavailable)
        if (jobs().retry(id)) {
          wakeWorker()
          return jsonResponse(res, 202, { id })
        }
      }
      if (route === '/remove' && jobs().remove(id)) return jsonResponse(res, 200, { id })
      return errorResponse(res, 409, 'Bu işlem render işinin mevcut durumunda kullanılamıyor.')
    } catch {
      return errorResponse(res, 500, 'Yerel render kuyruğuna erişilemedi.')
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    if (!guard(req, res)) return
    if (unavailable) return errorResponse(res, 503, unavailable)
    const preset = new URLSearchParams(req.url?.split('?')[1]).get('preset') ?? '4k'
    if (preset !== '4k' && preset !== 'preview' && preset !== 'panorama') return errorResponse(res, 400, 'Geçerli bir Cycles çıktı türü seçin.')
    let lease: string | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      lease = jobs().tryDirect()
      if (!lease) {
        wakeWorker()
        return errorResponse(res, 409, 'Bir Cycles render’ı sürüyor. Tamamlandıktan sonra tekrar deneyin.')
      }
      const running = lease
      timer = setInterval(() => { try { jobs().heartbeat(running) } catch { /* lease recovery handles temporary failures */ } }, 4000)
      let project
      try {
        const raw = await requestBody(req)
        if (raw === undefined) return errorResponse(res, 413, 'Proje dosyası en fazla 60 MB olmalı.')
        project = readProject(raw)
      } catch { return errorResponse(res, 422, 'MyHome projesi veya gömülü dosyaları doğrulanamadı.') }
      if (preset === 'panorama' && !isInteriorCamera(project, projectCamera(project).position)) {
        return errorResponse(res, 422, '360° panorama için oda içindeki bir kamerayı seçin.')
      }
      const image = await renderImage(project, { ...(preset === 'panorama' ? cyclesPanorama : renderPresets[preset]), device, blender })
      pngResponse(res, image, `myhome-cycles-${preset}.png`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('MyHome Cycles:', message)
      if (message.startsWith('Blender başlatılamadı')) {
        return errorResponse(res, 503, 'Blender başlatılamadı. BLENDER_BIN yolunu kontrol edin.')
      }
      return errorResponse(res, 500, 'Cycles render tamamlanamadı. Blender ve render cihazı ayarlarını kontrol edin.')
    } finally {
      clearInterval(timer)
      if (lease) { try { jobs().release(lease) } catch { /* next worker can recover the expired lease */ } }
    }
  }
  return {
    manage, handle, wakeWorker,
    close: () => { store?.close(); store = undefined },
  }
}

export function localCyclesPlugin(blender: string | undefined, configuredDevice = 'CPU', database?: string): Plugin {
  const local = createLocalCycles(blender, configuredDevice, database)
  const mount = (server: { httpServer?: { once: (event: 'close', close: () => void) => unknown } | null
    middlewares: { use: (route: string, middleware: (req: IncomingMessage, res: ServerResponse) => void) => unknown } }) => {
    server.httpServer?.once('close', local.close)
    try { local.wakeWorker() } catch { /* The queue endpoint can surface a storage error when opened. */ }
    server.middlewares.use(localRenderJobsPath, (req, res) => { void local.manage(req, res) })
    server.middlewares.use(localCyclesPath, (req, res) => { void local.handle(req, res) })
  }
  return { name: 'myhome-local-cycles', configureServer: mount, configurePreviewServer: mount }
}
