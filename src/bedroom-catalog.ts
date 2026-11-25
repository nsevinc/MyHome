import { defaultWardrobe, makeFurniture, makeStackedWardrobe } from './model'
import type { BedroomModel, Furniture, Point, WallMount } from './model'
import { bedroomCatalog } from './bedroom-models'
export { bedroomCatalog } from './bedroom-models'

export const bedroomHeadboards = ['upholstered-headboard', 'wood-headboard', 'slatted-panel', 'quilted-headboard'] as const
export type BedroomHeadboard = typeof bedroomHeadboards[number]

export function makeBedroomFurniture(model: BedroomModel, point: Point, mount?: WallMount): Furniture {
  const template = bedroomCatalog[model]
  const kind = template.kind
  const [width, depth, height] = template.size
  const item: Furniture = { ...makeFurniture(kind, point), bedroomModel: model, name: template.name,
    color: template.color, width, depth, height, mount }
  if (template.family === 'overhead' || template.family === 'side') {
    const doors = model === 'triple-upper' ? 3 : model === 'side-cabinet' || model === 'side-vitrine' ? 1 : 2
    const glass = model === 'glass-upper' || model === 'side-vitrine'
    return { ...item, wardrobe: { ...defaultWardrobe, doors, front: glass ? 'glass' : 'solid',
      interior: Array.from({ length: doors }, () => ({ shelves: model === 'side-vitrine' ? [.3, .65] : [.50], drawers: 0 })) } }
  }
  if (model === 'niche-wardrobe') return { ...item, wardrobe: makeStackedWardrobe('niche', point).wardrobe }
  if (model === 'glass-wardrobe') return { ...item, wardrobe: { ...defaultWardrobe, doors: 3, front: 'glass' } }
  if (model === 'sliding-wardrobe') return { ...item, wardrobe: { ...defaultWardrobe, motion: 'sliding' } }
  if (model === 'drawer-nightstand' || model === 'floating-nightstand' || template.family === 'dressers') {
    return { ...item, drawerTravel: Math.round(depth * .65) }
  }
  return item
}
