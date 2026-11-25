import type { Appearance, BedroomModel, Furniture } from './model'
import { bedroomCatalog } from './bedroom-models'

export function appearanceFor(slots: Furniture['appearances'], slot?: string): Appearance | null | undefined {
  if (slot && slots && Object.hasOwn(slots, slot)) return slots[slot]
  if ((slot === 'lower-doors' || slot === 'upper-doors') && slots && Object.hasOwn(slots, 'doors')) return slots.doors
  return slots?.all
}

const nativeSlots: Partial<Record<Furniture['kind'], { id: string; label: string }[]>> = {
  wardrobe: [{ id: 'body', label: 'Gövde' }, { id: 'doors', label: 'Kapaklar' }, { id: 'handles', label: 'Kulplar' },
    { id: 'inside', label: 'İç bölmeler' }],
  bed: [{ id: 'base', label: 'Baza' }, { id: 'headboard', label: 'Başlık' }, { id: 'cover', label: 'Örtü' },
    { id: 'linen', label: 'Yastık ve yatak' }],
  sofa: [{ id: 'upholstery', label: 'Döşeme' }, { id: 'base', label: 'Gövde ve ayaklar' }],
  table: [{ id: 'top', label: 'Tabla' }, { id: 'base', label: 'Ayaklar' }],
  'wall-cabinet': [{ id: 'body', label: 'Gövde' }, { id: 'doors', label: 'Kapaklar' }, { id: 'handles', label: 'Kulplar' }],
  sconce: [{ id: 'body', label: 'Montaj gövdesi' }, { id: 'shade', label: 'Işık başlığı' }],
  radiator: [{ id: 'body', label: 'Panel' }, { id: 'grille', label: 'Üst ızgara' }, { id: 'valves', label: 'Vanalar' }],
  rug: [{ id: 'pile', label: 'Dokuma' }, { id: 'edge', label: 'Kenar şeridi' }],
  curtain: [{ id: 'cloth', label: 'Kumaş' }, { id: 'rail', label: 'Ray' }],
  mirror: [{ id: 'frame', label: 'Çerçeve' }],
  pendant: [{ id: 'shade', label: 'Başlık' }, { id: 'mount', label: 'Tavan bağlantısı ve kablo' }],
}
const board = { id: 'body', label: 'Gövde ve zemin' }
const face = { id: 'face', label: 'Ön yüz' }
const drawers = [board, { id: 'face', label: 'Çekmece önleri' }, { id: 'handles', label: 'Kulplar' }]
const bedroomSlots: Partial<Record<BedroomModel, { id: string; label: string }[]>> = {
  'upholstered-headboard': [board, { id: 'face', label: 'Kumaş paneller' }],
  'wood-headboard': [board, { id: 'face', label: 'Ahşap şeritler' }],
  'slatted-panel': [board, { id: 'face', label: 'Çıtalar' }],
  'upper-cabinet': nativeSlots.wardrobe!,
  'side-cabinet': nativeSlots.wardrobe!,
  'floating-nightstand': drawers,
  'drawer-nightstand': drawers,
  dresser: drawers,
  'bed-bench': [{ id: 'top', label: 'Döşeme' }, { id: 'base', label: 'Gövde ve ayaklar' }],
  vanity: [{ id: 'top', label: 'Tabla' }, { id: 'base', label: 'Gövde ve ayaklar' }],
  'wall-shelf': [{ id: 'face', label: 'Raf' }, { id: 'body', label: 'Askılar' }],
  'wall-art': [{ id: 'body', label: 'Çerçeve' }, face],
}

export function editableParts(item: Furniture) {
  if (item.bedroomModel) {
    const slots = bedroomSlots[item.bedroomModel]
    if (slots) return slots
    switch (bedroomCatalog[item.bedroomModel].family) {
      case 'headboards': case 'art': return [board, face]
      case 'dressers': return drawers
      case 'shelves': return bedroomSlots['wall-shelf']!
      case 'side': case 'overhead': return nativeSlots.wardrobe!
      case 'benches': return item.bedroomModel === 'slat-bench' ? nativeSlots.table! : bedroomSlots['bed-bench']!
      case 'vanities': return item.bedroomModel === 'bridge-vanity' ? nativeSlots.table! :
        [...nativeSlots.table!, { id: 'frame', label: 'Ayna çerçevesi' }]
    }
  }
  if (item.wardrobe?.stack) return [
    { id: 'body', label: 'Gövde' }, { id: 'lower-doors', label: 'Alt kapaklar' }, { id: 'upper-doors', label: 'Üst kapaklar' },
    ...(item.wardrobe.stack.type === 'drawers' ? [{ id: 'drawer-fronts', label: 'Çekmece önleri' }, { id: 'drawer-handles', label: 'Çekmece kulpları' }] : []),
    { id: 'handles', label: 'Kapak kulpları' }, { id: 'inside', label: 'İç bölmeler' },
  ]
  return nativeSlots[item.kind]?.filter(part => (item.wardrobe || part.id !== 'inside')
    && (!item.separateHeadboard || part.id !== 'headboard')) ?? []
}

export function legacyAppearance(item: Furniture, slot: string): Appearance | undefined {
  if (!item.material || !['body', 'doors', 'lower-doors', 'upper-doors', 'drawer-fronts', 'headboard', 'cover'].includes(slot)) return
  return item.material
}
