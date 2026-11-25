import { furnitureParts } from './furniture'
import { bounds, itemBottom, roomEdges, wallMountPose } from './geometry'
import type { Box } from './geometry'
import { fmt, furnitureAngle, meters } from './model'
import type { Furniture, Point, Project } from './model'
import { clipAtX, contactCenter, firstSlideOverlap, rectanglePoints } from './sweep'
import { cabinetDoors, firstOverlap, localToRoom, movedDoorPoint, rotateAround } from './wardrobe'
import { assemblyObstacles } from './wardrobe-assembly'

type Part = { id: string; name: string; max: number; boxes: Box[]; pivot?: Point }
export type TrialSelection = { itemId: string; partId: string; amount: number }
const rad = Math.PI / 180

export function motionParts(item: Furniture): Part[] {
  if (!item.drawerTravel && !item.liftAngle && item.wardrobe?.stack?.type !== 'drawers'
    && !item.wardrobe?.interior?.some(compartment => compartment?.drawers)) return []
  const groups = new Map<string, Box[]>()
  for (const box of furnitureParts(item)) {
    if (!box.motionPart) continue
    const group = groups.get(box.motionPart) ?? []
    group.push(box)
    groups.set(box.motionPart, group)
  }
  return [...groups].map(([id, boxes]) => {
    if (id === 'lid') return { id, name: 'Baza kapağı', max: item.liftAngle!, boxes,
      pivot: { x: -.406 * item.depth, z: .32 * item.height } }
    if (id === 'drawer') return { id, name: 'Çekmece', max: item.drawerTravel!, boxes }
    if (id.startsWith('outer-drawer:')) return { id, name: `Dış çekmece ${Number(id.split(':')[1]) + 1}`,
      max: Math.max(1, Math.round(item.depth * .62)), boxes }
    const [, compartment, drawer] = id.split(':').map(Number)
    const front = boxes[0]
    const [x, y, z] = front.position
    const depth = Math.min(item.depth * .6, (z + item.depth / 2000) * 950)
    const tray: Box = { ...front, position: [x, y - front.size[1] * .44, z - meters(depth) / 2],
      size: [front.size[0], Math.min(front.size[1] * .12, .018), meters(depth)], surface: 'wood' }
    return { id, name: `${compartment + 1}. bölme · ${drawer + 1}. çekmece`, max: Math.max(1, Math.round(depth)),
      boxes: [...boxes, tray] }
  })
}

export function solveMotion(project: Project, source: Furniture, part: Part, obstacles = assemblyObstacles(project)) {
  const edges = roomEdges(project.walls)
  const item = wallMountPose(source, edges)
  const bottom = itemBottom(item, project.height)
  const heading = furnitureAngle(item) * rad
  const candidates = obstacles.filter(block => block.id !== item.id)
  if (!part.pivot && item.wardrobe && item.wardrobe.pose !== 'none') for (const door of cabinetDoors(item)) {
    const closed = rectanglePoints(door.center.x - door.width / 2, door.center.z - door.depth / 2, door.width, door.depth)
    candidates.push({ name: door.label, id: undefined,
      shape: closed.map(p => localToRoom(item, movedDoorPoint(door, p))),
      bottom: bottom + door.y - door.height / 2, top: bottom + door.y + door.height / 2 })
  }
  const forward = { x: -Math.sin(heading), z: Math.cos(heading) }
  let contact: { name: string; amount: number; point?: Point } | undefined
  const record = (name: string, amount: number | undefined, point: (amount: number) => Point | undefined) => {
    if (amount !== undefined && (!contact || amount < contact.amount)) contact = { name, amount, point: point(amount) }
  }
  for (const { position: [xm, ym, zm], size: [wm, hm, dm] } of part.boxes) {
    const [x, y, z, w, h, d] = [xm, ym, zm, wm, hm, dm].map(value => value * 1000)
    if (part.pivot) {
      const pivot = part.pivot
      const moving = rectanglePoints(z - d / 2 - pivot.x, y - h / 2 - pivot.z, d, h)
      const plane = (left: number, low: number, width: number, height: number) =>
        rectanglePoints(left - pivot.x, low - pivot.z - bottom, width, height)
      const rotationContact = (name: string, polygon: Point[], slice?: Point[]) => {
        const hit = firstOverlap(moving, polygon, 1, part.max * rad)
        record(name, hit === undefined ? undefined : hit / rad, amount => {
          const rotated = moving.map(point => rotateAround(point, { x: 0, z: 0 }, amount * rad + 1e-6))
          const overlap = contactCenter(rotated, polygon)
          if (!overlap) return
          const z = overlap.x + pivot.x
          if (!slice) return localToRoom(item, { x, z })
          const side = slice.map(point => ({ x: point.z, z: point.x }))
          const span = clipAtX(clipAtX(side, z - .01, 1), z + .01, -1)
          const extent = bounds(span.length ? span : side)
          return localToRoom(item, { x: extent.z + extent.depth / 2, z })
        })
      }
      const extent = Math.hypot(item.depth, item.height) * 2
      rotationContact('Tavan', plane(-extent, project.height, extent * 2, extent))
      for (const block of candidates) {
        const local = block.shape.map(point => rotateAround({ x: point.x - item.x, z: point.z - item.z }, { x: 0, z: 0 }, -heading))
        const slice = clipAtX(clipAtX(local, x - w / 2 + 1e-6, 1), x + w / 2 - 1e-6, -1)
        if (slice.length < 3) continue
        const range = bounds(slice)
        if (range.depth > 1e-6) rotationContact(block.name, plane(range.z, block.bottom, range.depth, block.top - block.bottom), slice)
      }
    } else {
      const moving = rectanglePoints(x - w / 2, z - d / 2, w, d).map(point => localToRoom(item, point))
      for (const block of candidates) {
        if (bottom + y + h / 2 <= block.bottom + 1e-6 || bottom + y - h / 2 >= block.top - 1e-6) continue
        record(block.name, firstSlideOverlap(moving, block.shape, forward, part.max), amount =>
          contactCenter(moving.map(point => ({ x: point.x + forward.x * (amount + .001),
            z: point.z + forward.z * (amount + .001) })), block.shape))
      }
    }
  }
  return { item, part, bottom, forward, contact }
}

export function motionTrial(solution: ReturnType<typeof solveMotion>, request: number) {
  const { item, part, bottom, contact } = solution
  const amount = Math.min(request, contact?.amount ?? part.max)
  const move = (box: Box): Box => {
    if (!part.pivot) return { ...box, position: [box.position[0], box.position[1], box.position[2] + meters(amount)] }
    const pivot = { x: meters(part.pivot.x), z: meters(part.pivot.z) }
    const center = rotateAround({ x: box.position[2], z: box.position[1] }, pivot, amount * rad)
    return { ...box, pitch: -amount * rad, position: [box.position[0], center.z, center.x] }
  }
  const parts = part.boxes.map(move)
  const front = parts[0]
  const local = { x: front.position[0] * 1000, z: (front.position[2] + (part.pivot ? front.size[2] / 2 * Math.cos(amount * rad) : front.size[2] / 2)) * 1000 }
  const handle = { ...localToRoom(item, local),
    y: bottom + (front.position[1] + (part.pivot ? front.size[2] / 2 * Math.sin(amount * rad) : 0)) * 1000 }
  const footprint = (boxes: Box[]) => bounds(boxes.flatMap(({ position: [x, , z], size: [w, h, d], pitch }) => {
    const angle = pitch ?? 0
    const depth = Math.abs(d * Math.cos(angle)) + Math.abs(h * Math.sin(angle))
    return rectanglePoints((x - w / 2) * 1000, (z - depth / 2) * 1000, w * 1000, depth * 1000)
  }))
  const reached = Boolean(contact && request > contact.amount + .001)
  const actual = footprint(parts)
  const outline = footprint([...part.boxes, ...parts])
  const unfulfilled = !part.pivot && reached ? { ...actual, z: actual.z + request - amount } : undefined
  const polygon = ({ x, z, width, depth }: typeof outline) =>
    rectanglePoints(x, z, width, depth).map(point => localToRoom(item, point))
  return { ...solution, amount, request, parts, handle, outline: polygon(outline), actual: polygon(actual),
    beyond: unfulfilled && polygon(unfulfilled), reached }
}

export type MotionTrial = ReturnType<typeof motionTrial>

export function motionFromHandle(trial: MotionTrial, [x, y, z]: [number, number, number]) {
  const { part, bottom, handle, forward, amount } = trial
  const first = part.boxes[0]
  const delta = part.pivot
    ? Math.asin(Math.max(0, Math.min(1, (y * 1000 - bottom - part.pivot.z) /
      ((first.position[2] + first.size[2] / 2) * 1000 - part.pivot.x)))) / rad
    : amount + (x * 1000 - handle.x) * forward.x + (z * 1000 - handle.z) * forward.z
  return Math.max(0, Math.min(part.max, Math.round(delta)))
}

export const motionValue = (part: Part, amount: number) => part.pivot
  ? `${(Math.round(amount * 10) / 10).toLocaleString('tr-TR')}°` : `${fmt(Math.round(amount))} cm`
