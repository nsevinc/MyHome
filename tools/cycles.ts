import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { glbBytes, validateGlb } from '../src/catalog'
import type { RenderDevice } from '../src/cycles-settings'
import { textureBytes } from '../src/materials'
import type { Appearance, Project, SurfaceTexture } from '../src/model'
import { sceneData } from '../src/scene-data'

export type RenderOptions = { width: number; height: number; samples: number; device: RenderDevice; blender?: string
  projection?: 'equirectangular' }

function labelModelSlots(bytes: Uint8Array<ArrayBuffer>) {
  const document = validateGlb(bytes)
  document.materials ??= []
  for (const [index, material] of document.materials.entries()) material.name = `myhome-slot-${index}`
  const defaultIndex = document.materials.length
  for (const mesh of document.meshes) for (const primitive of mesh.primitives) primitive.material ??= defaultIndex
  document.materials.push({ name: 'myhome-slot-default' })
  const original = Buffer.from(bytes)
  const binary = original.subarray(20 + original.readUInt32LE(12))
  const json = Buffer.from(JSON.stringify(document))
  const paddedLength = Math.ceil(json.length / 4) * 4
  const header = Buffer.from(original.subarray(0, 20))
  header.writeUInt32LE(20 + paddedLength + binary.length, 8)
  header.writeUInt32LE(paddedLength, 12)
  return Buffer.concat([header, json, Buffer.alloc(paddedLength - json.length, 32), binary])
}

export async function renderImage(project: Project, settings: RenderOptions): Promise<Buffer> {
  const work = await mkdtemp(join(tmpdir(), 'myhome-render-'))
  try {
    const scene = sceneData(project)
    const assets = new Map<string, string>()
    const itemPaths = new Map<string, string>()
    for (const item of scene.items) {
      if (!item.asset) continue
      const tagged = Object.values(item.appearances ?? {}).some(Boolean)
      const key = (tagged ? 'tagged:' : '') + (item.asset.source === 'upload' ? item.asset.data : item.asset.id)
      let filename = assets.get(key)
      if (!filename) {
        const catalogPath = item.asset.source === 'catalog'
          ? fileURLToPath(new URL(`../assets/models/${item.asset.id}.v1.render.glb`, import.meta.url)) : undefined
        if (catalogPath && !tagged) filename = catalogPath
        else {
          const bytes = item.asset.source === 'upload' ? glbBytes(item.asset.data) : new Uint8Array(await readFile(catalogPath!))
          filename = join(work, `model-${assets.size}.glb`)
          await writeFile(filename, tagged ? labelModelSlots(bytes) : bytes)
        }
        assets.set(key, filename)
      }
      itemPaths.set(item.id, filename)
    }
    const { floorTexture, wallTexture, ...style } = scene.style
    const texturesByData = new Map<string, { data: string; path: string }>()
    function textureSettings(texture?: SurfaceTexture, color = true) {
      if (!texture) return
      const { data, tileMm, originalColors } = texture
      const key = (color ? 'color:' : 'data:') + data
      let entry = texturesByData.get(key)
      if (!entry) {
        entry = { data, path: join(work, `texture-${texturesByData.size}.png`) }
        texturesByData.set(key, entry)
      }
      return { path: entry.path, tileMm, originalColors }
    }
    function appearanceSettings(value?: Appearance | null) {
      if (!value) return value
      return { ...value, texture: textureSettings(value.texture),
        roughnessMap: textureSettings(value.roughnessMap, false), normalMap: textureSettings(value.normalMap, false) }
    }
    const textures = { floor: textureSettings(floorTexture), wall: textureSettings(wallTexture) }
    const boxes = scene.boxes.map(box => ({ ...box, appearance: appearanceSettings(box.appearance) }))
    const items = scene.items.map(({ asset, fallback, appearances, ...item }) => ({
      ...item, path: itemPaths.get(item.id),
      appearances: appearances && Object.fromEntries(Object.entries(appearances).map(([slot, value]) => [slot, appearanceSettings(value)])),
      fallback: asset ? undefined : fallback.map(box => ({ ...box, appearance: appearanceSettings(box.appearance) })),
    }))
    for (const { data, path } of texturesByData.values()) await writeFile(path, textureBytes(data))
    const scenePath = join(work, 'scene.json')
    await writeFile(scenePath, JSON.stringify({ ...scene, style, textures, boxes, items, projection: settings.projection }))
    const tempImage = join(work, 'render.png')
    await new Promise<void>((accept, reject) => {
      const child = spawn(settings.blender || process.env.BLENDER_BIN || 'blender', [
        '--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '4',
        '--python', fileURLToPath(new URL('./render-scene.py', import.meta.url)), '--',
        scenePath, tempImage, String(settings.width), String(settings.height), String(settings.samples), settings.device,
      ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], timeout: 20 * 60 * 1000 })
      let log = ''
      child.stderr.setEncoding('utf8').on('data', chunk => { log = (log + chunk).slice(-8000) })
      child.once('error', error => {
        reject(new Error(`Blender başlatılamadı. BLENDER_BIN değerini kontrol edin. ${error.message}`, { cause: error }))
      })
      child.once('close', (code, signal) => {
        if (code === 0) accept()
        else reject(new Error(`Cycles render tamamlanamadı (${code ?? signal}). ${log}`))
      })
    })
    const image = await readFile(tempImage)
    if (image.length < 33 || image.readUInt32BE(0) !== 0x89504e47
      || image.readUInt32BE(16) !== settings.width || image.readUInt32BE(20) !== settings.height) {
      throw new Error('Cycles beklenen çözünürlükte geçerli bir PNG üretemedi.')
    }
    return image
  } finally {
    for (const file of await readdir(work)) await unlink(join(work, file))
    await rmdir(work)
  }
}

export async function renderProject(project: Project, path: string, settings: RenderOptions) {
  const target = resolve(path)
  if (!target.toLowerCase().endsWith('.png')) throw new Error('Render dosyası .png uzantılı olmalı.')
  const image = await renderImage(project, settings)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, image)
}
