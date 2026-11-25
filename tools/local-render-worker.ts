import { setTimeout as wait } from 'node:timers/promises'
import { cyclesPanorama, renderDevices, renderPresets } from '../src/cycles-settings'
import type { RenderDevice } from '../src/cycles-settings'
import { readProject } from '../src/storage'
import { renderImage } from './cycles'
import { LocalRenderStore } from './local-render-store'

const path = process.argv[2]
const device = (process.env.MYHOME_CYCLES_DEVICE ?? 'CPU') as RenderDevice
if (!path || !renderDevices.includes(device)) throw new Error('Yerel render işleyicisi ayarları geçersiz.')
const store = new LocalRenderStore(path)
let idle = Date.now()
try {
  while (Date.now() - idle < 30_000) {
    const job = store.claim()
    if (!job) {
      if (store.hasWork()) idle = Date.now()
      await wait(600)
      continue
    }
    const timer = setInterval(() => {
      try { store.heartbeat(job.owner) } catch { /* The lease will expire if storage is unavailable. */ }
    }, 4000)
    try {
      const project = readProject(JSON.parse(job.frame))
      const preset = job.preset === 'panorama' ? cyclesPanorama : renderPresets[job.preset]
      const image = await renderImage(project, { ...preset, device })
      store.finish(job.id, job.owner, { image })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      store.finish(job.id, job.owner, { error: message.startsWith('Blender başlatılamadı')
        ? 'Blender başlatılamadı. BLENDER_BIN ayarını kontrol edin.' : 'Cycles işi tamamlanamadı. Blender ve render cihazı ayarlarını kontrol edin.' })
    } finally {
      clearInterval(timer)
      idle = Date.now()
    }
  }
} finally { store.close() }
