import { footprintCorners, furnitureVolumes, itemBottom, moveAlongWall, obstructionVolume, placement, pointInRoom, trimVolume, wallMountPose, wallPoint } from './geometry'
import type { Box, Rect, WallEdge } from './geometry'
import { furnitureParts } from './furniture'
import { furnitureAngle } from './model'
import type { Furniture, Passage, Point, Project } from './model'
import { openingLeaf } from './opening-door'
import type { DoorState } from './opening-door'
import { isCabinetDoorBox, localToRoom } from './wardrobe'
import { trimLabels, wallTrimPieces } from './wall-trim'

export type Axis = keyof Point
type Direction = { axis: Axis; sign: -1 | 1; label: string }
type Span = { low: number; high: number }
type Blocker = { shape: Point[]; name: string; bottom: number; top: number }
export type Gap = Direction & { start: Point; end: Point; distance: number; name: string; overlap: boolean }
export type SnapGuide = { axis: Axis; at: number; low: number; high: number; name: string }
type PassageReading = { start: Point; end: Point; width: number; reason?: 'outside' | 'ceiling' | 'blocked' }
export const gapDirections = [
  { axis: 'x', sign: -1, label: 'Sol' }, { axis: 'x', sign: 1, label: 'Sağ' },
  { axis: 'z', sign: -1, label: 'Üst' }, { axis: 'z', sign: 1, label: 'Alt' },
] as const satisfies readonly Direction[]
export const passageStates: { mode: DoorState; label: string }[] = [
  { mode: 'closed', label: 'Kapaklar kapalı' }, { mode: 'saved', label: 'Kayıtlı durum' }, { mode: 'open', label: 'Kapaklar açık' },
]
const otherAxis = (axis: Axis): Axis => axis === 'x' ? 'z' : 'x'
const at = (axis: Axis, along: number, across: number): Point => axis === 'x' ? { x: along, z: across } : { x: across, z: along }
const epsilon = 1e-6

function projectOnto(shape: Point[], dx: number, dz: number): Span {
  const values = shape.map(point => point.x * dx + point.z * dz)
  return { low: Math.min(...values), high: Math.max(...values) }
}

function along(shape: Point[], axis: Axis) {
  return projectOnto(shape, axis === 'x' ? 1 : 0, axis === 'z' ? 1 : 0)
}

function section(shape: Point[], axis: Axis, cross: number): Span | undefined {
  const transverse = otherAxis(axis)
  const crossings: number[] = []
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i], b = shape[(i + 1) % shape.length]
    if (cross < Math.min(a[transverse], b[transverse]) - epsilon || cross > Math.max(a[transverse], b[transverse]) + epsilon) continue
    const span = b[transverse] - a[transverse]
    if (Math.abs(span) < epsilon) crossings.push(a[axis], b[axis])
    else crossings.push(a[axis] + (b[axis] - a[axis]) * (cross - a[transverse]) / span)
  }
  if (crossings.length) return { low: Math.min(...crossings), high: Math.max(...crossings) }
}

function happensAtHeight(entry: Blocker, bottom: number, top: number) {
  return entry.bottom < top && entry.top > bottom
}

function rectShape({ x, z, width, depth }: Rect): Point[] {
  return [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }]
}

function structuralBlocks(edges: WallEdge[], height: number) {
  return edges.flatMap(edge => [...edge.wall.obstacles.map(obstacle => {
    const volume = obstructionVolume(edge, obstacle)
    return { shape: rectShape(volume), bottom: volume.bottom, top: volume.top, name: obstacle.name }
  }), ...wallTrimPieces(edge.wall, height).map(piece => ({ shape: rectShape(trimVolume(edge, piece)),
    bottom: piece.bottom, top: piece.top, name: trimLabels[piece.kind] }))])
}

function itemBlock(item: Furniture, roomHeight: number): Blocker {
  const bottom = itemBottom(item, roomHeight)
  return { shape: footprintCorners(item), bottom, top: bottom + item.height, name: item.name }
}

function roomDoorBlocks(edges: WallEdge[], state: DoorState, exceptDoor?: string) {
  return edges.flatMap(edge => edge.wall.openings.flatMap(opening => {
    if (opening.id === exceptDoor) return []
    const leaf = openingLeaf(edge, opening, state)
    return leaf ? [{ shape: footprintCorners({ ...leaf, rotation: 0 }), name: `Duvar ${edge.index + 1} kapısı`,
      bottom: leaf.bottom, top: leaf.top }] : []
  }))
}

// Intersect the times when the two footprints overlap on every separating axis.
function approach(source: Point[], target: Point[], axis: Axis, sign: number) {
  let enter = -Infinity, leave = Infinity
  for (const polygon of [source, target]) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length]
      const dx = a.z - b.z, dz = b.x - a.x
      const length = Math.hypot(dx, dz)
      if (length < epsilon) continue
      const speed = sign * (axis === 'x' ? dx : dz) / length
      const m = projectOnto(source, dx / length, dz / length)
      const n = projectOnto(target, dx / length, dz / length)
      if (Math.abs(speed) < epsilon) {
        if (m.high <= n.low + epsilon || n.high <= m.low + epsilon) return
        continue
      }
      const times = [(n.low - m.high) / speed, (n.high - m.low) / speed]
      enter = Math.max(enter, Math.min(...times))
      leave = Math.min(leave, Math.max(...times))
      if (leave <= Math.max(0, enter) + epsilon) return
    }
  }
  return { distance: Math.max(0, enter), overlap: enter < -epsilon }
}

function contactLine(source: Point[], target: Point[], axis: Axis, sign: number, distance: number) {
  const transverse = otherAxis(axis)
  const a = along(source, transverse), b = along(target, transverse)
  const low = Math.max(a.low, b.low), high = Math.min(a.high, b.high)
  const gapAt = (cross: number) => {
    const s = section(source, axis, cross)!, t = section(target, axis, cross)!
    return sign > 0 ? t.low - s.high : s.low - t.high
  }
  // Distance along this axis is piecewise linear between polygon vertices.
  const points = [low, high, ...[...source, ...target].map(point => point[transverse]).filter(value => value > low && value < high)]
  const distances = points.map(gapAt)
  const best = Math.min(...distances)
  const contacts = points.filter((_, index) => distances[index] <= best + epsilon)
  const cross = (Math.min(...contacts) + Math.max(...contacts)) / 2
  const s = section(source, axis, cross)!
  const start = at(axis, sign > 0 ? s.high : s.low, cross)
  return { start, end: { ...start, [axis]: start[axis] + sign * distance } }
}

export function measureGaps(project: Project, item: Furniture, edges: WallEdge[]): Gap[] {
  const resolved = wallMountPose(item, edges)
  const body = itemBlock(resolved, project.height)
  const blocks = [...structuralBlocks(edges, project.height), ...roomDoorBlocks(edges, 'saved'),
    ...project.items.filter(other => other.id !== item.id && item.kind !== 'rug').flatMap(other =>
      furnitureVolumes(wallMountPose(other, edges), project.height).map(volume => ({ ...volume, name: other.name })))]
    .filter(block => happensAtHeight(block, body.bottom, body.top))
  return gapDirections.flatMap(direction => {
    const walls = edges.filter(edge => (direction.axis === 'x' ? edge.nx : edge.nz) === -direction.sign)
      .map(edge => ({ name: `Duvar ${edge.index + 1}`, shape: [
        edge.a, edge.b, wallPoint(edge, edge.wall.length, -project.thickness), wallPoint(edge, 0, -project.thickness),
      ] }))
    let nearest: { name: string; shape: Point[]; distance: number; overlap: boolean } | undefined
    const here = resolved[direction.axis]
    for (const entry of [...walls, ...blocks]) {
      const candidate = approach(body.shape, entry.shape, direction.axis, direction.sign)
      if (!candidate || (nearest && nearest.distance <= candidate.distance)) continue
      const target = along(entry.shape, direction.axis)
      if (candidate.overlap && ((target.low + target.high) / 2 - here) * direction.sign < 0) continue
      nearest = { ...entry, ...candidate }
    }
    if (!nearest) return []
    const { distance, name, overlap } = nearest
    return [{ ...direction, ...contactLine(body.shape, nearest.shape, direction.axis, direction.sign, distance), distance, name, overlap }]
  })
}

export function moveForGap(item: Furniture, gaps: Gap[], gap: Gap, distance: number, edges: WallEdge[]): Point | undefined {
  const resolved = wallMountPose(item, edges)
  const edge = resolved.mount && edges.find(edge => edge.wall.id === resolved.mount?.wallId)
  if (resolved.mount && (!edge || (edge.dx ? 'x' : 'z') !== gap.axis)) return
  if (gap.overlap || distance === Math.round(gap.distance)) return
  const away = gaps.find(candidate => candidate.axis === gap.axis && candidate.sign !== gap.sign)
  const displacement = gap.distance - distance
  if (displacement < 0 && (!away || -displacement > away.distance + epsilon)) return
  const unrounded = resolved[gap.axis] + gap.sign * displacement
  const low = resolved[gap.axis] - (gap.sign < 0 ? gap.distance : away?.distance ?? Infinity)
  const high = resolved[gap.axis] + (gap.sign > 0 ? gap.distance : away?.distance ?? Infinity)
  const target = Math.max(Math.ceil(low - epsilon), Math.min(Math.floor(high + epsilon), Math.round(unrounded)))
  if (Math.abs(target - unrounded) >= 1 || Math.abs(target) > 200000) return
  const point = { x: resolved.x, z: resolved.z, [gap.axis]: target }
  if (resolved.mount && Math.abs(wallMountPose(moveAlongWall(resolved, point, edges), edges)[gap.axis] - target) > epsilon) return
  return point
}

export function snapFurniture(project: Project, item: Furniture, edges: WallEdge[], threshold: number) {
  const position = { x: item.x, z: item.z }
  const source = footprintCorners(item)
  const mountEdge = item.mount && edges.find(edge => edge.wall.id === item.mount?.wallId)
  const guides: SnapGuide[] = []
  const deltas: Point = { x: 0, z: 0 }
  const neighbors = project.items.filter(other => other.id !== item.id).map(other => ({
    name: other.name, shape: footprintCorners(wallMountPose(other, edges)),
  }))
  for (const axis of ['x', 'z'] as const) {
    if (item.mount && (!mountEdge || (mountEdge.dx ? 'x' : 'z') !== axis)) continue
    const transverse = otherAxis(axis)
    const moving = along(source, axis), across = along(source, transverse)
    const anchor = (moving.low + moving.high) / 2
    let best: (SnapGuide & { delta: number }) | undefined
    const consider = (delta: number, at: number, span: Span, name: string) => {
      if (Math.abs(delta) > threshold || (best && Math.abs(best.delta) <= Math.abs(delta))) return
      best = { axis, at, name, low: Math.min(across.low, span.low), high: Math.max(across.high, span.high), delta }
    }
    for (const edge of edges) {
      const normal = axis === 'x' ? edge.nx : edge.nz
      if (!normal) continue
      const wallSpan = along([edge.a, edge.b], transverse)
      if (across.high <= wallSpan.low || across.low >= wallSpan.high) continue
      const edgeAt = normal > 0 ? moving.low : moving.high
      consider(edge.a[axis] - edgeAt, edge.a[axis], wallSpan, `Duvar ${edge.index + 1}`)
    }
    for (const neighbor of neighbors) {
      const cross = along(neighbor.shape, transverse)
      if (cross.low - across.high > 1800 || across.low - cross.high > 1800) continue
      const target = along(neighbor.shape, axis)
      const center = (target.low + target.high) / 2
      for (const to of [target.low, target.high]) for (const from of [moving.low, moving.high]) {
        consider(to - from, to, cross, neighbor.name)
      }
      consider(center - anchor, center, cross, neighbor.name)
    }
    if (best) {
      deltas[axis] = best.delta
      guides.push(best)
    }
  }
  if (!guides.length) return { position, guides }
  const warnings = placement(project, item, edges).warning
  for (const matches of [guides, ...guides.map(guide => [guide])]) {
    let points = [position]
    for (const { axis } of matches) {
      const exact = position[axis] + deltas[axis]
      const rounded = Math.round(exact)
      const other = rounded >= exact ? Math.floor(exact) : Math.ceil(exact)
      points = points.flatMap(point => [...new Set([rounded, other])].map(value => ({ ...point, [axis]: value })))
    }
    for (const point of points) {
      if (matches.some(guide => Math.abs(point[guide.axis]) > 200000)) continue
      const candidate = wallMountPose(moveAlongWall(item, point, edges), edges)
      if (matches.some(guide => Math.abs(candidate[guide.axis] - point[guide.axis]) > .5)) continue
      if (!placement(project, candidate, edges).warning.some(warning => !warnings.includes(warning))) {
        return { position: { x: candidate.x, z: candidate.z }, guides: matches }
      }
    }
  }
  return { position, guides: [] }
}

export function cabinetInDoorState(item: Furniture, state: DoorState): Furniture {
  const wardrobe = item.wardrobe
  if (!wardrobe || wardrobe.pose === 'none' || state === 'saved') return item
  return { ...item, wardrobe: state === 'closed' ? { ...wardrobe, pose: 'closed' }
    : { ...wardrobe, pose: 'open', slide: 1, leaves: wardrobe.leaves?.map(leaf => leaf && { ...leaf, angle: undefined }) } }
}

export function furniturePartBlock(item: Furniture, box: Box, roomHeight: number) {
  const center = localToRoom(item, { x: box.position[0] * 1000, z: box.position[2] * 1000 })
  const y = itemBottom(item, roomHeight) + box.position[1] * 1000
  const tilt = Math.abs(box.pitch ?? 0)
  const depth = (box.size[2] * Math.cos(tilt) + box.size[1] * Math.sin(tilt)) * 1000
  const half = (box.size[1] * Math.cos(tilt) + box.size[2] * Math.sin(tilt)) * 500
  return { shape: footprintCorners({ ...center, width: box.size[0] * 1000, depth,
    rotation: 0, angle: furnitureAngle(item) + (box.angle ?? 0) * 180 / Math.PI }),
    bottom: y - half, top: y + half, name: item.name, id: item.id }
}

export function cabinetDoorBlocks(items: Furniture[], state: DoorState, roomHeight: number) {
  return items.flatMap(item => {
    if (!item.wardrobe || item.wardrobe.pose === 'none') return []
    return furnitureParts(cabinetInDoorState(item, state)).filter(isCabinetDoorBox)
      .map(box => furniturePartBlock(item, box, roomHeight))
  })
}

export function walkingObstacles(project: Project, edges: WallEdge[], exceptDoor?: string) {
  const furniture = project.items.map(item => wallMountPose(item, edges))
  return [...structuralBlocks(edges, project.height), ...roomDoorBlocks(edges, 'saved', exceptDoor), ...cabinetDoorBlocks(furniture, 'saved', project.height),
    ...furniture.flatMap(item => furnitureVolumes(item, project.height).map(volume => ({ ...volume, name: item.name })))]
}

export function passageReader(project: Project, edges: WallEdge[], items: Furniture[]) {
  const barriers = [...structuralBlocks(edges, project.height), ...items.flatMap(item =>
    furnitureVolumes(item, project.height).map(volume => ({ ...volume, name: item.name })))]
  const byMode = new Map<DoorState, Blocker[]>()
  function blocks(mode: DoorState) {
    let value = byMode.get(mode)
    if (!value) {
      value = [...barriers, ...roomDoorBlocks(edges, mode), ...cabinetDoorBlocks(items, mode, project.height)]
      byMode.set(mode, value)
    }
    return value
  }
  return (passage: Passage) => {
    const { origin, axis, headroom } = passage
    const across = otherAxis(axis)
    const rail = edges.filter(edge => edge.a[axis] === edge.b[axis]
      && origin[across] >= Math.min(edge.a[across], edge.b[across]) && origin[across] <= Math.max(edge.a[across], edge.b[across]))
      .map(edge => edge.a[axis])
    const originAxis = origin[axis]
    const start = Math.max(-Infinity, ...rail.filter(value => value <= originAxis))
    const end = Math.min(Infinity, ...rail.filter(value => value >= originAxis))
    const outside = !pointInRoom(origin, edges) || !Number.isFinite(start) || !Number.isFinite(end)

    function read(mode: DoorState): PassageReading {
      const zero = { start: origin, end: origin, width: 0 }
      if (outside) return { ...zero, reason: 'outside' }
      if (headroom > project.height) return { ...zero, reason: 'ceiling' }
      let low = start, high = end
      for (const block of blocks(mode)) {
        if (!happensAtHeight(block, 0, headroom)) continue
        const span = section(block.shape, axis, origin[across])
        if (!span) continue
        if (span.low <= originAxis && span.high >= originAxis) return { ...zero, reason: 'blocked' }
        if (span.high < originAxis) low = Math.max(low, span.high)
        if (span.low > originAxis) high = Math.min(high, span.low)
      }
      return { start: at(axis, low, origin[across]), end: at(axis, high, origin[across]), width: Math.max(0, high - low) }
    }

    return passageStates.map(state => ({ ...state, ...read(state.mode) }))
  }
}

export function passageReadings(project: Project, passage: Passage, edges: WallEdge[], items: Furniture[]) {
  return passageReader(project, edges, items)(passage)
}
