import { architecturalGeometry, bounds, footprintCorners, furnitureVolumes, roomEdges, wallMountPose } from './geometry'
import { fmt, furnitureAngle } from './model'
import type { Furniture, Point, Project } from './model'
import { firstOverlap, rotateAround } from './wardrobe'
import { openingLeaf } from './opening-door'

const radians = Math.PI / 180
const rectangle = (left: number, bottom: number, width: number, height: number): Point[] =>
  [{ x: left, z: bottom }, { x: left + width, z: bottom }, { x: left + width, z: bottom + height }, { x: left, z: bottom + height }]

export function assemblyObstacles(project: Project) {
  const walls = architecturalGeometry(project).boxes.map(box => {
    const [x, y, z] = box.position.map(value => value * 1000)
    const [width, height, depth] = box.size.map(value => value * 1000)
    return { shape: rectangle(x - width / 2, z - depth / 2, width, depth), bottom: y - height / 2,
      top: y + height / 2, name: box.obstacleName ?? 'Duvar', id: undefined }
  })
  const edges = roomEdges(project.walls)
  const doors = edges.flatMap(edge => edge.wall.openings.flatMap(opening => {
    const leaf = openingLeaf(edge, opening)
    return leaf ? [{ shape: footprintCorners({ ...leaf, rotation: 0 }), bottom: leaf.bottom, top: leaf.top,
      name: `Duvar ${edge.index + 1} kapısı`, id: undefined }] : []
  }))
  return [...walls, ...doors, ...project.items.flatMap(item => furnitureVolumes(wallMountPose(item, edges), project.height)
    .map(volume => ({ ...volume, name: item.name, id: item.id })))]
}

export function wardrobeAssembly(project: Project, item: Furniture, obstacles = assemblyObstacles(project)) {
  const angle = furnitureAngle(item) * radians
  const height = item.height, depth = item.depth
  const allowance = item.assembly?.allowance ?? 0
  const local = (p: Point) => rotateAround({ x: p.x - item.x, z: p.z - item.z }, { x: 0, z: 0 }, -angle)
  const diagonal = Math.ceil(Math.hypot(height, depth) - 1e-9)
  const lift = rectangle(-depth, 0, depth, height)
  const upright = rectangle(-depth, 0, depth, height + allowance)
  const raiseHits = new Set<string>()
  const standHits = new Set<string>()
  if (diagonal > project.height) raiseHits.add('Tavan')
  if (height + allowance > project.height) standHits.add('Tavan')
  for (const block of obstacles) {
    if (block.id === item.id || block.bottom >= Math.max(diagonal, height + allowance)) continue
    const span = bounds(block.shape.map(local))
    if (span.x >= item.width / 2 - 1e-6 || span.x + span.width <= -item.width / 2 + 1e-6) continue
    const section = rectangle(span.z - depth / 2, block.bottom, span.depth, block.top - block.bottom)
    if (firstOverlap(lift, section, -1, Math.PI / 2) !== undefined) raiseHits.add(block.name)
    if (firstOverlap(upright, section, 1, 0) !== undefined) standHits.add(block.name)
  }
  return { diagonal, uprightHeight: height + allowance, roomwardFloorLength: height,
    raiseHits: [...raiseHits], standHits: [...standHits] }
}

type Route = NonNullable<NonNullable<Furniture['assembly']>['transport']>
export type TransportOrientation = Route['orientation']
export const transportOrientations = [
  ['upright', 'Dik'], ['side', 'Yan yatırılmış'], ['back', 'Sırt üstü'],
] as const
export const emptyRoute: Route = { orientation: 'upright', doorWidth: 0, doorHeight: 0, corridorWidth: 0, turnWidth: 0, turnDepth: 0 }

export function transportSize(item: Furniture, orientation: TransportOrientation) {
  return orientation === 'upright' ? [item.width, item.depth, item.height] as const
    : orientation === 'side' ? [item.depth, item.height, item.width] as const : [item.width, item.height, item.depth] as const
}

export function checkTransport(item: Furniture, route: Route) {
  const [width, length, height] = transportSize(item, route.orientation)
  const turn = Math.ceil(Math.hypot(width, length) - 1e-9)
  return {
    door: route.doorWidth && route.doorHeight ? route.doorWidth >= width && route.doorHeight >= height : undefined,
    corridor: route.corridorWidth ? route.corridorWidth >= width : undefined,
    turn: route.turnWidth && route.turnDepth ? Math.min(route.turnWidth, route.turnDepth) >= turn : undefined,
    width, height, turnClearance: turn,
  }
}

export function assemblyText(result: ReturnType<typeof wardrobeAssembly>, mode: 'raise' | 'stand') {
  const hits = mode === 'raise' ? result.raiseHits : result.standHits
  return hits.length ? `Çakışma · ${hits.join(', ')}` : 'Geometrik boşluk yeterli'
}
