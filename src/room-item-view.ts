import { architecturalGeometry, bounds, footprintCorners, itemBottom, roomEdges, wallMountPose } from './geometry'
import type { Box, Rect } from './geometry'
import { selectedFurniture } from './group-placement'
import { furnitureAngle, meters } from './model'
import type { Furniture, Project } from './model'
import { nearWalls } from './scene-data'

const categories = {
  sofa: 'Oturma', bed: 'Yatak odası', table: 'Masa ve sehpalar', wardrobe: 'Gardıroplar',
  'wall-cabinet': 'Duvar dolapları', sconce: 'Aydınlatma', pendant: 'Aydınlatma', radiator: 'Isıtma',
  curtain: 'Dekorasyon', rug: 'Dekorasyon', mirror: 'Dekorasyon', box: 'Özel ölçü', model: '3B modeller',
} satisfies Record<Furniture['kind'], string>

export const itemCategory = (item: Furniture) => item.bedroomModel ? 'Yatak odası' : categories[item.kind]
const searchText = (value: string) => value.toLocaleLowerCase('tr-TR').normalize('NFD')
  .replace(/\p{M}/gu, '').replaceAll('ı', 'i')

export function filterRoomItems(items: Furniture[], query: string, category: string) {
  const tokens = searchText(query).trim().split(/\s+/).filter(Boolean)
  return items.filter(item => {
    if (category && itemCategory(item) !== category) return false
    const name = searchText(item.name)
    return tokens.every(token => name.includes(token))
  })
}

type Camera = NonNullable<Project['camera']>
type Position = Camera['position']
export type FurnitureFocus = { ids: string[]; plan: Rect; camera: Camera }

function blocksView(from: Position, to: Position, box: Box) {
  let enter = 0, leave = .99
  for (let axis = 0; axis < 3; axis++) {
    const low = box.position[axis] - box.size[axis] / 2
    const high = box.position[axis] + box.size[axis] / 2
    const delta = to[axis] - from[axis]
    if (Math.abs(delta) < 1e-8) {
      if (from[axis] < low || from[axis] > high) return false
    } else {
      const start = (low - from[axis]) / delta, end = (high - from[axis]) / delta
      enter = Math.max(enter, Math.min(start, end))
      leave = Math.min(leave, Math.max(start, end))
      if (leave < enter) return false
    }
  }
  return true
}

function cameraForItems(project: Project, edges: ReturnType<typeof roomEdges>, target: Position, angle: number,
  distance: number, plan: Rect, height: number): Position {
  const architecture = architecturalGeometry(project).boxes
  const checks: Position[] = [
    target,
    [target[0], target[1] - height * .28, target[2]],
    [target[0], target[1] + height * .28, target[2]],
    [target[0] - meters(plan.width) * .28, target[1], target[2]],
    [target[0] + meters(plan.width) * .28, target[1], target[2]],
    [target[0], target[1], target[2] - meters(plan.depth) * .28],
    [target[0], target[1], target[2] + meters(plan.depth) * .28],
  ]
  let best: Position | undefined
  let leastBlocked = Infinity
  for (const rise of [.52, 1.35]) {
    for (const side of [.43, -.43, 0, .95, -.95, 1.8, -1.8]) {
      const dx = -Math.sin(angle) + side * Math.cos(angle)
      const dz = Math.cos(angle) + side * Math.sin(angle)
      const scale = distance / Math.hypot(dx, rise, dz)
      const eye: Position = [target[0] + dx * scale, target[1] + rise * scale, target[2] + dz * scale]
      const hidden = nearWalls(edges, eye)
      const walls = architecture.filter(box => !box.wallIds?.some(id => hidden.has(id)))
      const blocked = checks.filter(point => walls.some(box => blocksView(eye, point, box))).length
      if (blocked === 0) return eye
      if (blocked < leastBlocked) { leastBlocked = blocked; best = eye }
    }
  }
  return best!
}

export function focusFurniture(project: Project, ids: readonly string[]): FurnitureFocus | undefined {
  const edges = roomEdges(project.walls)
  const items = selectedFurniture(project.items, ids).map(item => wallMountPose(item, edges))
  if (!items.length) return

  const plan = bounds(items.flatMap(footprintCorners))
  const bottom = Math.min(...items.map(item => itemBottom(item, project.height)))
  const top = Math.max(...items.map(item => itemBottom(item, project.height) + item.height))
  const target: Position = [
    meters(plan.x + plan.width / 2), meters((top + bottom) / 2), meters(plan.z + plan.depth / 2),
  ]
  const radius = meters(Math.hypot(plan.width, plan.depth, top - bottom)) / 2
  const fov = 44
  const distance = Math.max(.42, radius / Math.sin(fov * Math.PI / 360) * 1.13)
  const angle = items.length === 1 ? furnitureAngle(items[0]) * Math.PI / 180 : 0
  const position = cameraForItems(project, edges, target, angle, distance, plan, meters(top - bottom))
  return { ids: items.map(item => item.id), plan, camera: { target, fov, position } }
}
