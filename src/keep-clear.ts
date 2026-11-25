import { footprintCorners, furnitureVolumes, overlapsShape, placement, wallPoint } from './geometry'
import type { WallEdge } from './geometry'
import { cabinetDoorBlocks } from './layout'
import type { Furniture, KeepClearRule, Point, Project } from './model'
import { clipAtX, firstSlideOverlap } from './sweep'
import { cabinetDoorEnvironment } from './wardrobe'

type Block = { shape: Point[]; label: string; id?: string }
const edgeIndex = { back: 0, right: 1, front: 2, left: 3 }
const tolerance = 1e-6
const shifted = (p: Point, n: Point, d: number) => ({ x: p.x + n.x * d, z: p.z + n.z * d })

export function clearanceArchitecture(project: Project, edges: WallEdge[]) {
  const walls = cabinetDoorEnvironment({ ...project, items: [] }, edges)
  // An open doorway still marks the end of the usable floor in this room.
  const perimeter = edges.map(edge => ({ label: `Duvar ${edge.index + 1} · oda sınırı`, bottom: 0, top: project.height,
    shape: [edge.a, edge.b, wallPoint(edge, edge.wall.length, -1), wallPoint(edge, 0, -1)] }))
  return [...walls, ...perimeter]
}

function readFace(owner: Furniture, rule: KeepClearRule, blocks: Block[]) {
  const corners = footprintCorners(owner), i = edgeIndex[rule.side]
  const a = corners[i], b = corners[(i + 1) % 4]
  const width = Math.hypot(b.x - a.x, b.z - a.z)
  const t = { x: (b.x - a.x) / width, z: (b.z - a.z) / width }
  const n = { x: t.z, z: -t.x }
  const polygon = [a, b, shifted(b, n, rule.distance), shifted(a, n, rule.distance)]
  let nearest: { id?: string; label: string; offset: number; along: number } | undefined
  for (const block of blocks) {
    if (block.id === owner.id) continue
    const local = block.shape.map(p => ({
      x: (p.x - a.x) * t.x + (p.z - a.z) * t.z, z: (p.x - a.x) * n.x + (p.z - a.z) * n.z,
    }))
    if (local.every(p => p.x <= tolerance) || local.every(p => p.x >= width - tolerance)) continue
    const clipped = clipAtX(clipAtX(local, 0, 1), width, -1)
    if (!clipped.length || clipped.every(p => p.z <= tolerance)) continue
    const offset = Math.min(...clipped.map(p => p.z))
    if (nearest && nearest.offset <= offset + tolerance) continue
    const edge = clipped.filter(p => Math.abs(p.z - offset) < tolerance)
    nearest = { id: block.id, label: block.label, offset, along: edge.reduce((sum, p) => sum + p.x, 0) / edge.length }
  }
  const gap = nearest && Math.max(0, nearest.offset)
  const shortage = gap === undefined ? 0 : Math.max(0, rule.distance - gap)
  const start = shifted(a, t, nearest?.along ?? width / 2)
  return { owner, rule, polygon, n, nearest, gap, shortage: shortage < tolerance ? 0 : shortage,
    start, end: shifted(start, n, Math.min(gap ?? rule.distance, rule.distance)) }
}

export type ClearanceReading = ReturnType<typeof readFace>

// Items are the posed items currently drawn on the plan, including drag previews.
type PhysicalBlock = Block & { top: number; bottom: number }

function furnitureBlocks(items: Furniture[], height: number) {
  return items.flatMap(item => {
    const parts = [...furnitureVolumes(item, height), ...(item.wardrobe?.pose === 'open' ? cabinetDoorBlocks([item], 'saved', height) : [])]
    return parts.map(p => ({ ...p, id: item.id, label: item.name }))
  })
}

export function readClearances(rules: KeepClearRule[], items: Furniture[], height: number, architecture: PhysicalBlock[]) {
  if (!rules.length) return []
  const headroom = Math.min(height, 2000)
  const blocks = [...architecture, ...furnitureBlocks(items, height)].filter(p => p.bottom < headroom && p.top > 0)
  return rules.flatMap(rule => items.filter(item => (rule.owner === 'run' ? item.wardrobeRun?.id : item.id) === rule.ownerId)
    .map(item => readFace(item, rule, blocks)))
}

export function clearanceCorrection(row: ClearanceReading, rows: ClearanceReading[], project: Project, edges: WallEdge[], architecture: PhysicalBlock[],
  movedId?: string, original?: Furniture) {
  if (!row.shortage || !row.nearest) return
  const movingOwner = movedId === row.owner.id
  const mover = movingOwner ? row.owner : project.items.find(item => item.id === row.nearest?.id)
  if (!mover || mover.locked || mover.mount || (movedId && movedId !== mover.id)) return
  const sources = rows.filter(r => r.owner.id !== mover.id)
  const parts = furnitureVolumes(mover, project.height)
  const obstacles = [...architecture, ...furnitureBlocks(project.items.filter(item => item.id !== mover.id), project.height)]
  function available(direction: Point, distance: number) {
    let room = distance
    for (const part of parts) for (const obstacle of obstacles) {
      if (part.top <= obstacle.bottom || part.bottom >= obstacle.top || overlapsShape(part.shape, obstacle.shape)) continue
      const contact = firstSlideOverlap(part.shape, obstacle.shape, direction, room)
      if (contact !== undefined) room = contact
    }
    return room
  }
  function check(direction: Point, distance: number) {
    const candidate = { ...mover!, ...shifted(mover!, direction, distance) }
    const fit = placement(project, candidate, edges)
    if (fit.warning.length) return fit.warning[0]
    if (movingOwner) {
      const again = readFace(candidate, row.rule, obstacles.filter(p => p.top > 0 && p.bottom < 2000))
      if (again.shortage) return `Geçişi ${again.nearest!.label} sınırlıyor.`
    }
    for (const part of furnitureVolumes(candidate, project.height)) {
      if (part.bottom >= 2000 || part.top <= 0) continue
      if (sources.some(r => overlapsShape(part.shape, r.polygon))) return 'Başka bir bölümün geçiş alanı daralıyor.'
    }
  }
  // With a sideways or diagonal drag, backing up along the actual pointer path
  // can free the strip sooner than moving the bed away along the cabinet normal.
  if (original && !movingOwner && original.id === mover.id) {
    const dx = mover.x - original.x, dz = mover.z - original.z, travel = Math.hypot(dx, dz)
    if (travel > tolerance && mover.angle === original.angle && mover.rotation === original.rotation) {
      const direction = { x: dx / travel, z: dz / travel }
      let rollback = 0
      for (const part of parts) for (const source of sources) {
        if (!overlapsShape(part.shape, source.polygon)) continue
        const before = part.shape.map(p => ({ x: p.x - dx, z: p.z - dz }))
        const entry = firstSlideOverlap(before, source.polygon, direction, travel)
        if (entry !== undefined) rollback = Math.max(rollback, travel - entry)
      }
      const back = { x: -direction.x, z: -direction.z }
      if (rollback > 0 && available(back, rollback) >= rollback - tolerance && !check(back, rollback)) {
        return { distance: rollback, direction: back, retrace: true }
      }
    }
  }
  const distance = row.rule.distance - row.nearest.offset
  const direction = movingOwner ? { x: -row.n.x, z: -row.n.z } : row.n
  const room = available(direction, distance)
  const obstruction = check(direction, distance) ?? (room < distance - tolerance ? 'Hareket yolu kapalı.' : undefined)
  return { distance, direction, retrace: false, obstruction, available: room < distance - tolerance ? room : undefined }
}

