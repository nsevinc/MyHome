import { mm, uid } from './model'
import type { Furniture, ModelReference, Point } from './model'

export const modelCatalog = [
  { id: 'luna-armchair', name: 'Luna berjer', category: 'Oturma', width: 820, depth: 790, height: 890, color: '#59746b', version: 1 },
  { id: 'pera-console', name: 'Pera konsol', category: 'Depolama', width: 1320, depth: 440, height: 760, color: '#ac7f59', version: 1 },
  { id: 'ada-side-table', name: 'Ada yan sehpa', category: 'Masa ve sehpalar', width: 520, depth: 520, height: 490, color: '#af825d', version: 1 },
] as const

export const catalogEntry = (id: string) => modelCatalog.find(model => model.id === id)
export function catalogUrl(id: string, variant: 'web' | 'render' = 'web') {
  if (!catalogEntry(id)) throw new Error('Katalog modeli bulunamadı.')
  return `${import.meta.env.BASE_URL}models/${id}.v1.${variant}.glb`
}

export function makeCatalogFurniture(id: string, point: Point): Furniture {
  const model = catalogEntry(id)
  if (!model) throw new Error('Katalog modeli bulunamadı.')
  const { name, width, depth, height, color } = model
  return { id: uid(), name, width, depth, height, color, ...point, rotation: 0, kind: 'model',
    model: { source: 'catalog', id, version: 1 } }
}

const maxGlbBytes = 10 * 1024 * 1024
const glbPrefix = 'data:model/gltf-binary;base64,'

export function glbBytes(data: string): Uint8Array<ArrayBuffer> {
  if (!data.startsWith(glbPrefix) || data.length > glbPrefix.length + Math.ceil(maxGlbBytes / 3) * 4) {
    throw new Error('Model GLB biçiminde ve en fazla 10 MB olmalı.')
  }
  try {
    return Uint8Array.from(atob(data.slice(glbPrefix.length)), char => char.charCodeAt(0))
  } catch {
    throw new Error('Model dosyası okunamadı.')
  }
}

export function validateGlb(bytes: Uint8Array<ArrayBuffer>) {
  if (bytes.byteLength < 20 || bytes.byteLength > maxGlbBytes) throw new Error('GLB dosyası en fazla 10 MB olmalı.')
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2
    || header.getUint32(8, true) !== bytes.byteLength || header.getUint32(16, true) !== 0x4e4f534a
    || header.getUint32(12, true) > bytes.byteLength - 20) throw new Error('Geçerli bir GLB 2.0 dosyası seçin.')
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + header.getUint32(12, true))))
  if (json.asset?.version !== '2.0' || !Array.isArray(json.meshes) || json.meshes.length === 0
    || json.meshes.length > 200 || (json.nodes?.length ?? 0) > 500) throw new Error('Modelin sahnesi geçersiz veya çok karmaşık.')
  const permittedExtensions = new Set(['KHR_materials_unlit', 'KHR_texture_transform'])
  if (json.extensionsRequired?.some((name: string) => !permittedExtensions.has(name))) {
    throw new Error('Modeli standart, sıkıştırılmamış GLB olarak yeniden dışa aktarın.')
  }
  if ([...(json.buffers ?? []), ...(json.images ?? [])].some(entry => 'uri' in entry)) {
    throw new Error('Modelin doku ve verileri GLB dosyasının içine gömülü olmalı.')
  }
  if (json.skins?.length || json.animations?.length) throw new Error('Sabit bir mobilya veya obje modeli seçin.')
  return json
}

export async function modelMaterialSlots(model: ModelReference, signal?: AbortSignal) {
  let bytes: Uint8Array<ArrayBuffer>
  if (model.source === 'upload') bytes = glbBytes(model.data)
  else {
    const response = await fetch(catalogUrl(model.id), { signal })
    if (!response.ok) throw new Error('Model yüzeyleri okunamadı.')
    bytes = new Uint8Array(await response.arrayBuffer())
  }
  const document = validateGlb(bytes)
  const names = (document.materials ?? []).slice(0, 64).map((material: { name?: string }, index: number) => ({
    id: `glb-${index}`, label: `${index + 1}. ${typeof material.name === 'string' && material.name.trim() ? material.name : 'Yüzey'}`,
  }))
  if (names.length < 64 && document.meshes.some((mesh: { primitives: { material?: number }[] }) =>
    mesh.primitives.some(primitive => primitive.material === undefined))) {
    names.push({ id: 'glb-default', label: 'Varsayılan yüzey' })
  }
  return names as { id: string; label: string }[]
}

export function validateModel(reference: ModelReference) {
  if (reference.source === 'upload') validateGlb(glbBytes(reference.data))
  else if (!catalogEntry(reference.id)) throw new Error('Projedeki katalog modeli bulunamadı.')
}

export async function importModel(file: File, point: Point): Promise<Furniture> {
  if (!/\.glb$/i.test(file.name) || file.size > maxGlbBytes) throw new Error('En fazla 10 MB boyutunda bir GLB seçin.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  validateGlb(bytes)
  const [{ GLTFLoader }, { Box3, Vector3 }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'), import('three'),
  ])
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '')
  const size = new Box3().setFromObject(gltf.scene, true).getSize(new Vector3())
  const dimensions = [size.x, size.z, size.y].map(value => mm(value * 100))
  if (dimensions.some(value => !Number.isFinite(value) || value < 1 || value > 50_000)) {
    throw new Error('Modelin genişlik, derinlik ve yüksekliği 1 mm ile 50 m arasında olmalı.')
  }
  const [width, depth, height] = dimensions
  const data = await readDataUrl(new Blob([bytes], { type: 'model/gltf-binary' }))
  return { id: uid(), name: file.name.replace(/\.glb$/i, '').slice(0, 100).trim() || '3B model',
    kind: 'model', width, depth, height, ...point, rotation: 0, color: '#9c8b77', model: { source: 'upload', data } }
}

export function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Dosya okunamadı.'))
    reader.readAsDataURL(blob)
  })
}
