import { maxTextureBytes, textureBytes, textureLibrary, texturePixels, texturePrefix } from './materials'
import type { SurfaceTexture } from './model'

export function libraryTextureUrl(id: keyof typeof textureLibrary) {
  return `${import.meta.env.BASE_URL}textures/${id}.png`
}

export async function readLibraryTexture(id: keyof typeof textureLibrary): Promise<SurfaceTexture> {
  const response = await fetch(libraryTextureUrl(id))
  if (!response.ok) throw new Error('Hazır doku yüklenemedi.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  const data = texturePrefix + btoa(Array.from(bytes, value => String.fromCharCode(value)).join(''))
  textureBytes(data)
  const { label, tileMm } = textureLibrary[id]
  return { name: label, data, tileMm, originalColors: false, libraryId: id }
}

export async function importTexture(file: File, tileMm: number, dataMap = false): Promise<SurfaceTexture> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > maxTextureBytes) {
    throw new Error('En fazla 10 MB boyutunda bir JPG veya PNG seçin.')
  }
  const bitmap = await createImageBitmap(file, { colorSpaceConversion: dataMap ? 'none' : 'default' })
  try {
    const factor = Math.min(1, texturePixels / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * factor))
    canvas.height = Math.max(1, Math.round(bitmap.height * factor))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Doku görseli hazırlanamadı.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/png')
    textureBytes(data)
    return { data, tileMm, name: file.name.slice(0, 100), originalColors: true }
  } finally { bitmap.close() }
}
