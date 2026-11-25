export const finishes = ['plain', 'wood', 'concrete', 'tile'] as const
export type Finish = typeof finishes[number]
export const finishNames: Record<Finish, string> = {
  plain: 'Mat yüzey', wood: 'Ahşap damar', concrete: 'Dokulu beton', tile: 'Seramik karo',
}

export const furnitureMaterialPresets = ['matte-oak', 'woven-linen'] as const
export type FurnitureMaterialPreset = typeof furnitureMaterialPresets[number]
export const appearancePresets = ['original', 'plain', 'matte-oak', 'woven-linen', 'concrete', 'tile',
  'cotton', 'pique', 'matte-lacquer', 'gloss-lacquer', 'walnut', 'marble'] as const
export const appearanceNames: Record<typeof appearancePresets[number], string> = {
  original: 'Özgün malzeme', plain: 'Düz renk', 'matte-oak': 'Mat doğal meşe', 'woven-linen': 'Dokulu keten',
  concrete: 'Dokulu beton', tile: 'Seramik karo',
  cotton: 'Pamuklu kumaş', pique: 'Dokuma pike', 'matte-lacquer': 'Mat lake', 'gloss-lacquer': 'Parlak lake',
  walnut: 'Doğal ceviz', marble: 'Damarlı mermer',
}
export const furnitureMaterialDefaults = {
  'matte-oak': { label: 'Mat doğal meşe', color: '#b0895b', scale: 1, relief: 1.3, roughness: .72 },
  'woven-linen': { label: 'Dokulu keten', color: '#7d8874', scale: 1, relief: 1.35, roughness: .86 },
} as const

export const textureLibraryIds = ['oak', 'walnut', 'linen', 'cotton', 'pique', 'herringbone', 'marble',
  'gray-marble', 'concrete', 'ceramic'] as const
type AppearancePreset = typeof appearancePresets[number]
type TextureId = typeof textureLibraryIds[number]
export type MaterialFamily = 'ref' | 'fabric' | 'wood' | 'lacquer' | 'stone'
export const materialFamilies: Record<MaterialFamily, string> = {
  ref: 'Temel', fabric: 'Kumaş', wood: 'Ahşap', lacquer: 'Lake', stone: 'Taş ve seramik',
}
export const textureLibrary: Record<TextureId, { label: string; family: MaterialFamily; tileMm: number; tint: string }> = {
  oak: { label: 'Açık meşe damarı', family: 'wood', tileMm: 420, tint: '#c49c73' },
  walnut: { label: 'Koyu ceviz damarı', family: 'wood', tileMm: 450, tint: '#946443' },
  linen: { label: 'Keten dokuması', family: 'fabric', tileMm: 72, tint: '#c5b29b' },
  cotton: { label: 'İnce pamuk', family: 'fabric', tileMm: 65, tint: '#dad0bc' },
  pique: { label: 'Petek pike', family: 'fabric', tileMm: 130, tint: '#e9dfcd' },
  herringbone: { label: 'Balıksırtı kumaş', family: 'fabric', tileMm: 110, tint: '#a4aa9c' },
  marble: { label: 'Beyaz damarlı mermer', family: 'stone', tileMm: 650, tint: '#ede6db' },
  'gray-marble': { label: 'Gri damarlı mermer', family: 'stone', tileMm: 680, tint: '#a5a3a5' },
  concrete: { label: 'İnce gözenekli beton', family: 'stone', tileMm: 420, tint: '#b6b5af' },
  ceramic: { label: 'Açık derzli seramik', family: 'stone', tileMm: 440, tint: '#e7e2d9' },
}
export const materialSamples: Record<AppearancePreset, {
  family: MaterialFamily; textureId?: TextureId; color?: string; relief?: number; roughness?: number;
}> = {
  original: { family: 'ref' },
  plain: { family: 'ref', roughness: .8 },
  'matte-oak': { family: 'wood', textureId: 'oak', color: '#c49c73', roughness: .72, relief: .85 },
  'woven-linen': { family: 'fabric', textureId: 'linen', color: '#c5b29b', roughness: .86, relief: 1.05 },
  cotton: { family: 'fabric', textureId: 'cotton', color: '#dad0bc', roughness: .84, relief: .8 },
  pique: { family: 'fabric', textureId: 'pique', color: '#e9dfcd', roughness: .88, relief: 1.25 },
  'matte-lacquer': { family: 'lacquer', color: '#d5d7cc', roughness: .72, relief: 0 },
  'gloss-lacquer': { family: 'lacquer', color: '#d6dbe0', roughness: .16, relief: 0 },
  walnut: { family: 'wood', textureId: 'walnut', color: '#946443', roughness: .51, relief: .8 },
  marble: { family: 'stone', textureId: 'marble', color: '#ede6db', roughness: .28, relief: .23 },
  concrete: { family: 'stone', textureId: 'concrete', color: '#b6b5af', roughness: .84, relief: 1 },
  tile: { family: 'stone', textureId: 'ceramic', color: '#e7e2d9', roughness: .42, relief: 1 },
}

export function furnitureMaterialPreset(kind: string): FurnitureMaterialPreset | undefined {
  if (kind === 'wardrobe') return 'matte-oak'
  if (kind === 'bed') return 'woven-linen'
}

export function saturateSurface(color: string, saturation = 1): string {
  if (saturation === 1) return color
  const channels = [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16))
  const peak = Math.max(...channels), spread = peak - Math.min(...channels)
  if (!spread) return color
  const scale = Math.min(saturation, peak / spread)
  return '#' + channels.map(channel => Math.round(peak - (peak - channel) * scale).toString(16).padStart(2, '0')).join('')
}

export const texturePrefix = 'data:image/png;base64,'
export const maxTextureBytes = 10 * 1024 * 1024
export const texturePixels = 1536

export function textureBytes(data: string): Uint8Array<ArrayBuffer> {
  if (!data.startsWith(texturePrefix) || data.length > texturePrefix.length + Math.ceil(maxTextureBytes / 3) * 4) {
    throw new Error('Geçerli bir PNG dokusu seçin.')
  }
  const bytes = Uint8Array.from(atob(data.slice(texturePrefix.length)), value => value.charCodeAt(0))
  if (bytes.length < 45 || bytes.length > maxTextureBytes) throw new Error('Doku dosyası geçersiz veya çok büyük.')
  const header = new DataView(bytes.buffer)
  const width = header.getUint32(16)
  const height = header.getUint32(20)
  if (header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a
    || header.getUint32(8) !== 13 || header.getUint32(12) !== 0x49484452
    || width < 1 || height < 1 || width > texturePixels || height > texturePixels) {
    throw new Error(`Doku boyutları en fazla ${texturePixels} × ${texturePixels} piksel olmalı.`)
  }
  return bytes
}
