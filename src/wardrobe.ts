import { architecturalGeometry, bounds, footprintCorners, furnitureVolumes, itemBottom, overlap, overlapsShape, wallMountPose } from './geometry'
import type { Box, Rect, WallEdge } from './geometry'
import { fmt, furnitureAngle, wardrobeZones } from './model'
import type { DoorLeaf, Furniture, Point, Project, Wardrobe } from './model'
import { openingLeaf } from './opening-door'

const radians = Math.PI / 180
const defaultLimit = 78

export function rotateAround(point: Point, pivot: Point, angle: number): Point {
  const x = point.x - pivot.x, z = point.z - pivot.z
  const cos = Math.cos(angle), sin = Math.sin(angle)
  return { x: pivot.x + x * cos - z * sin, z: pivot.z + x * sin + z * cos }
}

export function localToRoom(item: Furniture, point: Point) {
  const rotated = rotateAround(point, { x: 0, z: 0 }, furnitureAngle(item) * radians)
  return { x: item.x + rotated.x, z: item.z + rotated.z }
}

export function cabinetSize(item: Furniture, doors: number) {
  const leaf = item.width / doors
  const board = Math.min(18, leaf / 10, item.depth / 8, item.height / 10)
  return { leaf, board }
}

export function doorLeaf(wardrobe: Wardrobe, index: number) {
  const value = wardrobe.leaves?.[index]
  const hinge = value?.hinge ?? ((index % wardrobe.doors) % 2 ? 'right' : 'left')
  const limit = value?.limit ?? defaultLimit
  return { hinge, limit, side: hinge === 'left' ? 1 : -1,
    angle: wardrobe.pose === 'open' ? Math.min(limit, value?.angle ?? limit) : 0 }
}

export function changeDoor(wardrobe: Wardrobe, index: number, patch: Partial<DoorLeaf>): Wardrobe {
  const leaves = Array.from({ length: Math.max(wardrobe.leaves?.length ?? 0, index + 1) },
    (_, i) => i === index ? { ...wardrobe.leaves?.[i], ...patch } : wardrobe.leaves?.[i] ?? null)
  return { ...wardrobe, leaves }
}

export function resizeWardrobeDoors(wardrobe: Wardrobe, doors: number): Wardrobe {
  if (wardrobe.doors === doors) return wardrobe
  const previous = wardrobe.leaves
  const leaves = wardrobe.stack && previous ? Array.from({ length: doors * 2 }, (_, i) =>
    i % doors < wardrobe.doors ? previous[Math.floor(i / doors) * wardrobe.doors + i % doors] ?? null : null) : previous
  return { ...wardrobe, doors, leaves, motion: doors !== 2 && wardrobe.motion === 'sliding' ? 'hinged' : wardrobe.motion }
}

export function openDoor(wardrobe: Wardrobe, index: number, angle: number): Wardrobe {
  const initial = wardrobe.pose === 'open' ? wardrobe : {
    ...wardrobe, pose: 'open' as const,
    leaves: Array.from({ length: wardrobe.doors * (wardrobe.stack ? 2 : 1) }, (_, i) => ({ ...wardrobe.leaves?.[i], angle: 0 })),
  }
  return changeDoor(initial, index, { angle })
}

export function defaultInterior(index: number) {
  return { shelves: index % 2 ? [.25, .5, .75] : [.82], rail: index % 2 ? undefined : .73, drawers: 0 }
}

export function cabinetDoors(item: Furniture) {
  const wardrobe = item.wardrobe
  if (!wardrobe) return []
  const sliding = wardrobe.motion === 'sliding'
  const { lowerTop, upperBottom, top } = wardrobeZones(item)
  const rows = wardrobe.stack ? [
    { start: 0, end: lowerTop, slot: 'lower-doors', label: 'Alt dolap' },
    { start: upperBottom, end: top, slot: 'upper-doors', label: 'Üst dolap' },
  ] : [{ start: 0, end: top, slot: 'doors', label: undefined }]
  return rows.flatMap(({ start, end, slot, label }, row) => Array.from({ length: wardrobe.doors }, (_, column) => {
    const index = row * wardrobe.doors + column
    const sectionHeight = end - start
    const { leaf, board } = cabinetSize({ ...item, height: sectionHeight }, wardrobe.doors)
    const state = doorLeaf(wardrobe, index)
    const width = sliding ? leaf + board * .4 : leaf - board * .35
    const height = sectionHeight - board
    const center = { x: sliding ? (column === 0 ? -1 : 1) * (item.width - width) / 2 : (column + .5) * leaf - item.width / 2,
      z: item.depth / 2 - board / 2 - (sliding ? column * board * 1.2 : 0) }
    const frame = Math.min(45, width / 6, height / 6)
    // The overlay hinge on the wall cabinets clears the shared carcass edge.
    // A pivot halfway through the panel swings its nose into a flush neighbour.
    const hinge = { x: center.x - state.side * width / 2,
      z: !sliding && item.kind === 'wall-cabinet' ? center.z + board / 2 : center.z }
    const handle = { x: center.x + state.side * (width / 2 - Math.max(frame / 2, board)),
      z: sliding ? center.z + board * .492 : item.depth / 2 + board * .45 }
    const moving = sliding && (wardrobe.parking === 'right' ? index === 0 : index === 1) && wardrobe.pose === 'open'
    const travel = moving ? (index === 0 ? 1 : -1) * (item.width - width) * (wardrobe.slide ?? 1) : 0
    const yaw = sliding ? 0 : state.side * state.angle * radians
    const y = start + sectionHeight / 2
    return { ...state, index, width, height, depth: board, frame, center, hinge, handle, yaw, travel, sliding, slot, y,
      label: [label, `${column + 1}. kapak`].filter(Boolean).join(' · '),
      handleY: start + sectionHeight * .52, handleHeight: Math.min(160, sectionHeight * .12) }
  }))
}

export function isCabinetDoorBox(box: Pick<Box, 'slot'>) {
  return box.slot === 'doors' || box.slot === 'handles' || box.slot === 'lower-doors' || box.slot === 'upper-doors'
}

export function movedDoorPoint(door: ReturnType<typeof cabinetDoors>[number], point: Point) {
  const moved = rotateAround(point, door.hinge, door.yaw)
  return { x: moved.x + door.travel, z: moved.z }
}

function lineAngles(a: number, b: number, c: number, limit: number, angles: number[]) {
  const length = Math.hypot(a, b)
  if (!length || Math.abs(c) > length) return
  const phase = Math.atan2(b, a)
  const separation = Math.acos(c / length)
  for (const root of [phase - separation, phase + separation]) {
    const angle = (root + 2 * Math.PI) % (2 * Math.PI)
    if (angle > 0 && angle < limit) angles.push(angle)
  }
}

// Collision can change only when a vertex crosses an opposing edge's line.
// These events partition the whole sweep, including contacts between sampled angles.
export function firstOverlap(moving: Point[], still: Point[], side: number, limit: number) {
  if (overlapsShape(moving, still)) return 0
  const angles = [0, limit]
  for (const [shape, vertices, direction] of [[still, moving, side], [moving, still, -side]] as const) {
    for (let i = 0; i < shape.length; i++) {
      const a = shape[i], b = shape[(i + 1) % shape.length]
      const nx = a.z - b.z, nz = b.x - a.x
      const c = a.x * nx + a.z * nz
      for (const point of vertices) lineAngles(point.x * nx + point.z * nz,
        direction * (point.x * nz - point.z * nx), c, limit, angles)
    }
  }
  angles.sort((a, b) => a - b)
  const pivot = { x: 0, z: 0 }
  for (let i = 1; i < angles.length; i++) {
    const angle = side * (angles[i - 1] + angles[i]) / 2
    if (overlapsShape(moving.map(point => rotateAround(point, pivot, angle)), still)) return angles[i - 1]
  }
}

const rectangle = (x: number, z: number, width: number, depth: number): Point[] =>
  [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }]

type DoorObstacle = { id: string | undefined; wallId?: string; label: string; shape: Point[]; bounds: Rect; bottom: number; top: number }

export function leafVolumes(door: ReturnType<typeof cabinetDoors>[number], base: number) {
  const handleDepth = door.depth * (door.sliding ? .16 : .9)
  return [
    { points: rectangle(door.center.x - door.width / 2, door.center.z - door.depth / 2, door.width, door.depth),
      bottom: base + door.y - door.height / 2, top: base + door.y + door.height / 2 },
    { points: rectangle(door.handle.x - door.depth * .325, door.handle.z - handleDepth / 2, door.depth * .65, handleDepth),
      bottom: base + door.handleY - door.handleHeight / 2, top: base + door.handleY + door.handleHeight / 2 },
  ]
}

export function cabinetFurnitureObstacles(item: Furniture, height: number, includeLeaves = true, excludeLeaf?: number) {
  const body = furnitureVolumes(item, height)
  const leaves = includeLeaves && item.wardrobe && item.wardrobe.pose !== 'none' ? cabinetDoors(item).filter(door => door.index !== excludeLeaf).flatMap(door =>
    leafVolumes(door, itemBottom(item, height)).filter((_, index) => index === 1 || door.yaw || door.travel)
      .map(({ points, bottom, top }) => ({
        shape: points.map(p => localToRoom(item, movedDoorPoint(door, p))), bottom, top,
      }))) : []
  return [...body, ...leaves].map(volume => ({ ...volume, id: item.id, label: item.name, bounds: bounds(volume.shape) }))
}

export function cabinetDoorEnvironment(project: Project, edges: WallEdge[], includeLeaves = true): DoorObstacle[] {
  const architecture = architecturalGeometry(project).boxes.map(box => {
    const [x, y, z] = box.position.map(value => value * 1000)
    const [width, height, depth] = box.size.map(value => value * 1000)
    const label = box.obstacleName ?? `Duvar ${(edges.find(edge => edge.wall.id === box.wallIds?.[0])?.index ?? 0) + 1}`
    const wallId = box.windowSill || box.architecturalTrim ? undefined : box.wallIds?.[0]
    return { id: undefined, wallId, label, shape: rectangle(x - width / 2, z - depth / 2, width, depth),
      bottom: y - height / 2, top: y + height / 2 }
  })
  const roomDoors = edges.flatMap(edge => edge.wall.openings.flatMap(opening => {
    const leaf = openingLeaf(edge, opening)
    return leaf ? [{ id: undefined, label: `Duvar ${edge.index + 1} kapısı`, shape: footprintCorners({ ...leaf, rotation: 0 }),
      bottom: leaf.bottom, top: leaf.top }] : []
  }))
  return [...[...architecture, ...roomDoors].map(candidate => ({ ...candidate, bounds: bounds(candidate.shape) })),
    ...project.items.flatMap(source => cabinetFurnitureObstacles(wallMountPose(source, edges), project.height, includeLeaves))]
}

export function cabinetDoorClearance(project: Project, source: Furniture, edges: WallEdge[],
  environment?: ReturnType<typeof cabinetDoorEnvironment>) {
  const item = wallMountPose(source, edges)
  if (!item.wardrobe || item.wardrobe.pose === 'none' || item.wardrobe.motion === 'sliding') return []
  const candidates = (environment ?? cabinetDoorEnvironment(project, edges)).filter(candidate => candidate.id !== item.id)
  return cabinetDoors(item).map(door => {
    const pivot = localToRoom(item, door.hinge)
    const end = localToRoom(item, { x: door.hinge.x + door.side * door.width, z: door.hinge.z })
    const base = itemBottom(item, project.height)
    const shapes = leafVolumes(door, base)
    let hit: { angle: number; label: string; wallId?: string; itemId?: string } | undefined
    for (const shape of shapes) {
      const moving = shape.points.map(local => {
        const point = localToRoom(item, local)
        return { x: point.x - pivot.x, z: point.z - pivot.z }
      })
      const radius = Math.max(...moving.map(point => Math.hypot(point.x, point.z)))
      const envelope = { x: pivot.x - radius, z: pivot.z - radius, width: 2 * radius, depth: 2 * radius }
      for (const obstacle of candidates) {
        if (shape.top <= obstacle.bottom + .001 || shape.bottom >= obstacle.top - .001 || !overlap(envelope, obstacle.bounds)) continue
        const angle = firstOverlap(moving, obstacle.shape.map(point => ({ x: point.x - pivot.x, z: point.z - pivot.z })),
          door.side, (hit?.angle ?? door.limit) * radians)
        if (angle !== undefined && (!hit || angle < hit.angle * radians)) {
          hit = { angle: angle / radians, label: obstacle.label, wallId: obstacle.wallId, itemId: obstacle.id }
        }
      }
    }
    return { ...door, pivot, end, hit }
  })
}

export function doorCollisionText(index: number, hit: { angle: number; label: string }, label = `${index + 1}. kapak`) {
  return `${label} · ${fmt(Math.round(hit.angle * 10))}° · ${hit.label} ile çakışıyor.`
}
