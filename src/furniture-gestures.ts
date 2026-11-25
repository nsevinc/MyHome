import { attachToWall, mountOffset, moveAlongWall, placement, wallPoint } from './geometry'
import type { WallEdge } from './geometry'
import { furnitureAngle, normalizeAngle } from './model'
import type { Furniture, Point, Project } from './model'

export type FurniturePose = Pick<Furniture, 'id' | 'x' | 'z' | 'angle' | 'mount'>

export function movedPose(before: Furniture, after: FurniturePose) {
  return before.x !== after.x || before.z !== after.z || furnitureAngle(before) !== furnitureAngle({ ...before, angle: after.angle })
    || before.mount?.wallId !== after.mount?.wallId || before.mount?.offset !== after.mount?.offset
}

export function dragWallTarget(item: Furniture, point: Point, edges: WallEdge[], reach: number) {
  const mount = item.mount
  if (item.curtain || item.locked) return { item }
  if (!mount) return { item: moveAlongWall(item, point, edges) }
  const candidates = edges.map(edge => {
    const along = (point.x - edge.a.x) * edge.dx + (point.z - edge.a.z) * edge.dz
    const contact = wallPoint(edge, Math.max(0, Math.min(edge.wall.length, along)))
    return { edge, along, distance: Math.hypot(contact.x - point.x, contact.z - point.z) }
  })
  const nearest = candidates.reduce<(typeof candidates)[number] | undefined>(
    (best, row) => !best || row.distance < best.distance ? row : best, undefined)
  const current = candidates.find(({ edge }) => edge.wall.id === mount.wallId)
  if (!nearest || nearest.edge.wall.id === mount.wallId || nearest.distance > reach + item.depth / 2 ||
    (current && nearest.distance + Math.min(45, reach / 4) >= current.distance)) {
    return { item: moveAlongWall(item, point, edges) }
  }
  const { edge, along } = nearest
  return { item: attachToWall(item, { ...mount, wallId: edge.wall.id, offset: mountOffset(edge, item.width, along) }, edges), destination: edge }
}

export function wallMountFit(project: Project, item: Furniture, edges: WallEdge[]) {
  const fit = placement(project, item, edges, true)
  const blocked = fit.warning.find(warning => warning !== 'Başka bir eşyanın alanıyla örtüşüyor.')
    ?? (fit.overlapping?.length ? `${fit.overlapping.join(', ')} ile örtüşüyor.` : undefined)
  return { clearance: fit.clearance, obstruction: fit.obstruction, blocked }
}

export function wallDropWarning(project: Project, item: Furniture, edges: WallEdge[]) {
  return wallMountFit(project, item, edges).blocked
}

export const pointerAngle = (center: Point, point: Point) => Math.atan2(point.z - center.z, point.x - center.x) * 180 / Math.PI

export function angleFromDrag(item: Furniture, point: Point, offset: number, snap: boolean) {
  const angle = pointerAngle(item, point) - offset
  return normalizeAngle(snap ? Math.round(angle / 15) * 15 : angle)
}
