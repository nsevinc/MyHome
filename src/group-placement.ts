import { footprint, mountOffset, moveAlongWall, roomEdges, wallMountPose } from './geometry'
import type { WallEdge } from './geometry'
import type { Furniture, Point, Project } from './model'

type Axis = keyof Point
export type Alignment = 'start' | 'center' | 'end'

export function selectedFurniture(items: Furniture[], ids: readonly string[]) {
  const byId = new Map(items.map(item => [item.id, item]))
  return ids.flatMap(id => {
    const item = byId.get(id)
    return item ? [item] : []
  })
}

export function movementAxes(items: Furniture[], edges: WallEdge[]): Axis[] {
  if (!items.length || items.some(item => item.locked || item.curtain)) return []
  const wallId = items[0].mount?.wallId
  if (items.some(item => item.mount?.wallId !== wallId)) return []
  if (!wallId) return ['x', 'z']
  const edge = edges.find(edge => edge.wall.id === wallId)
  return edge ? [edge.dx ? 'x' : 'z'] : []
}

export function translateFurniture(project: Project, ids: readonly string[], anchorId: string, target: Point,
  edges = roomEdges(project.walls)): Furniture[] {
  const items = selectedFurniture(project.items, ids).map(item => wallMountPose(item, edges))
  const anchor = items.find(item => item.id === anchorId)
  if (!anchor || items.length !== ids.length || !movementAxes(items, edges).length) return []
  const delta = { x: Math.round(target.x - anchor.x), z: Math.round(target.z - anchor.z) }
  if (anchor.mount) {
    const edge = edges.find(edge => edge.wall.id === anchor.mount?.wallId)!
    const along = delta.x * edge.dx + delta.z * edge.dz
    let min = -Infinity, max = Infinity
    for (const item of items) {
      const offset = (item.x - edge.a.x) * edge.dx + (item.z - edge.a.z) * edge.dz
      min = Math.max(min, mountOffset(edge, item.width, 0) - offset)
      max = Math.min(max, mountOffset(edge, item.width, edge.wall.length) - offset)
    }
    const adjusted = Math.max(min, Math.min(max, along))
    delta.x = adjusted * edge.dx
    delta.z = adjusted * edge.dz
  }
  return items.map(item => moveAlongWall(item, { x: item.x + delta.x, z: item.z + delta.z }, edges))
}

function boundsOnAxis(item: Furniture, axis: Axis) {
  const rect = footprint(item)
  return { start: rect[axis], span: axis === 'x' ? rect.width : rect.depth }
}

function withOffsets(items: Furniture[], axis: Axis, offsets: number[], edges: WallEdge[]): Furniture[] | undefined {
  const moved = items.map((item, index) =>
    moveAlongWall(item, { x: item.x, z: item.z, [axis]: Math.round(item[axis] + offsets[index]) }, edges))
  if (moved.some((item, index) => Math.abs(wallMountPose(item, edges)[axis] - items[index][axis] - offsets[index]) > 1)) return
  return moved
}

export function alignFurniture(items: Furniture[], edges: WallEdge[], axis: Axis, mode: Alignment) {
  if (items.length < 2 || !movementAxes(items, edges).includes(axis)) return
  const posed = items.map(item => wallMountPose(item, edges))
  const factor = mode === 'start' ? 0 : mode === 'center' ? .5 : 1
  const positions = posed.map(item => {
    const { start, span } = boundsOnAxis(item, axis)
    return start + span * factor
  })
  return withOffsets(posed, axis, positions.map(position => positions[0] - position), edges)
}

export function spaceFurniture(items: Furniture[], edges: WallEdge[], axis: Axis) {
  if (items.length < 3 || !movementAxes(items, edges).includes(axis)) return
  const ordered = items.map(item => wallMountPose(item, edges)).map(item => ({ item, ...boundsOnAxis(item, axis) }))
    .sort((first, second) => first.start - second.start)
  const first = ordered[0], last = ordered[ordered.length - 1]
  const span = last.start + last.span - first.start
  const gap = (span - ordered.reduce((total, entry) => total + entry.span, 0)) / (ordered.length - 1)
  if (gap < 0) return
  let position = first.start
  const offsets = ordered.map(entry => {
    const delta = position - entry.start
    position += entry.span + gap
    return delta
  })
  return withOffsets(ordered.map(entry => entry.item), axis, offsets, edges)
}

export function equalizeMountHeight(items: Furniture[]): Furniture[] | undefined {
  if (items.length < 2 || items.some(item => !item.mount || item.locked)) return
  const bottom = items[0].mount!.bottom
  return items.map(item => ({ ...item, mount: { ...item.mount!, bottom } }))
}

export function replaceFurniture(items: Furniture[], replacements: Furniture[]) {
  const byId = new Map(replacements.map(item => [item.id, item]))
  return items.map(item => byId.get(item.id) ?? item)
}
