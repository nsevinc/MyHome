import { footprintCorners, pointInRoom, roomEdges, wallPoint } from './geometry'
import { furnitureAngle } from './model'
import type { Furniture, Point, Project, TransportPath } from './model'
import { firstSlideOverlap, rectanglePoints } from './sweep'
import { firstOverlap, rotateAround } from './wardrobe'
import { assemblyObstacles, transportSize } from './wardrobe-assembly'
import type { TransportOrientation } from './wardrobe-assembly'

type PathContact = { point: Point; name: string; step: number; type: 'straight' | 'turn' }
type Turn = { point: Point; step: number; direction: 'clockwise' | 'counterclockwise' }
const tau = Math.PI * 2
const rad = Math.PI / 180
const same = (a: Point, b: Point) => a.x === b.x && a.z === b.z
const subtract = (point: Point, origin: Point) => ({ x: point.x - origin.x, z: point.z - origin.z })
export const defaultEntryDepth = (item: Furniture) => Math.ceil(Math.max(item.depth, item.height) / 2) + 5

export function routeDoors(project: Project) {
  return roomEdges(project.walls).flatMap(edge => edge.wall.openings
    .filter(opening => opening.kind === 'door')
    .map((opening, index) => ({ edge, opening, label: `Duvar ${edge.index + 1} · Kapı ${index + 1}`,
      center: wallPoint(edge, opening.offset + opening.width / 2) })))
}

export function snapRoutePoint(previous: Point, position: Point, axis?: TransportPath['finish']) {
  const direction = axis ?? (Math.abs(position.x - previous.x) >= Math.abs(position.z - previous.z) ? 'x' : 'z')
  return direction === 'x' ? { x: Math.round(position.x), z: previous.z } : { x: previous.x, z: Math.round(position.z) }
}

export function inspectTransportPath(project: Project, item: Furniture, path: TransportPath, orientation: TransportOrientation,
  obstacles = assemblyObstacles(project)) {
  const [width, length, height] = transportSize(item, orientation)
  const points: Point[] = []
  const turns: Turn[] = []
  const door = routeDoors(project).find(row => row.opening.id === path.entrance)
  const incomplete = (problem: string) => ({ points, turns, width, length, height, problem, contact: undefined })
  const blocked = (contact: PathContact) => ({ points, turns, width, length, height, contact, problem: undefined })
  if (!door) return incomplete('Odanın giriş kapısını seçin.')

  const { edge, opening, center } = door
  const a = wallPoint(edge, opening.offset + opening.width / 2, -length / 2 - project.thickness - 5)
  const depth = path.entryDepth ?? defaultEntryDepth(item)
  const b = wallPoint(edge, opening.offset + opening.width / 2, depth)
  const delta = item
  points.push(a, b, ...path.points)
  const previous = points[points.length - 1]
  const elbow = snapRoutePoint(previous, delta, path.finish)
  if (!same(previous, elbow)) points.push(elbow)
  if (!same(points[points.length - 1], delta)) points.push({ x: item.x, z: item.z })
  const edges = roomEdges(project.walls)
  if (!pointInRoom(b, edges)) return incomplete('Kapıdan düz girişte gövdenin tamamına yetecek oda boyu yok.')
  if (points.slice(2).some(point => !pointInRoom(point, edges))) return incomplete('Rota noktaları oda içinde olmalı.')
  if (points.some((point, index) => index > 0 && (same(points[index - 1], point)
    || (points[index - 1].x !== point.x && points[index - 1].z !== point.z)))) {
    return incomplete('Her rota parçasını yatay veya dikey çizin.')
  }
  if (height > opening.height || width > opening.width || opening.bottom > 0) {
    return blocked({ point: center, name: `${door.label} net açıklığı`, step: 1, type: 'straight' })
  }
  if (height > project.height) return blocked({ point: b, name: 'Tavan', step: 1, type: 'straight' })
  if (depth < length / 2) return incomplete('İlk düz giriş mesafesi gövde boyunun yarısından kısa.')
  const candidates = obstacles.filter(block => block.id !== item.id && block.bottom < height - 1e-6 && block.top > 0)
  const base = rectanglePoints(-width / 2, -length / 2, width, length)
  const origin = { x: 0, z: 0 }
  const entryHeading = Math.atan2(-edge.nx, edge.nz)
  let heading = entryHeading
  function turn(at: Point, next: number, step: number) {
    const delta = ((next - heading + Math.PI / 2 + tau) % Math.PI) - Math.PI / 2
    if (Math.abs(delta) < 1e-7) { heading = next; return }
    const shape = base.map(point => rotateAround(point, origin, heading))
    const alternate = delta > 0 ? delta - Math.PI : delta + Math.PI
    type Block = { name: string; angle: number }
    let firstBlock: Block | undefined
    for (const angle of [delta, alternate]) {
      let hit: Block | undefined
      for (const block of candidates) {
        const first = firstOverlap(shape, block.shape.map(point => subtract(point, at)), Math.sign(angle), Math.abs(angle))
        if (first !== undefined && (!hit || first < hit.angle)) hit = { name: block.name, angle: first }
      }
      if (!hit) {
        turns.push({ point: at, step, direction: angle > 0 ? 'clockwise' : 'counterclockwise' })
        heading = next
        return
      }
      firstBlock ??= hit
    }
    if (firstBlock) return { point: at, name: firstBlock.name, step, type: 'turn' as const }
  }

  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index]
    const by = subtract(end, start)
    const distance = Math.hypot(by.x, by.z)
    const forward = { x: by.x / distance, z: by.z / distance }
    const next = Math.atan2(-forward.x, forward.z)
    const conflict = turn(start, next, index)
    if (conflict) return blocked(conflict)
    const moving = footprintCorners({ ...start, width, depth: length, rotation: 0, angle: heading / rad })
    let first: { amount: number; name: string } | undefined
    for (const block of candidates) {
      const amount = firstSlideOverlap(moving, block.shape, forward, distance)
      if (amount !== undefined && (!first || amount < first.amount)) first = { amount, name: block.name }
    }
    if (first) return blocked({ point: { x: start.x + forward.x * first.amount, z: start.z + forward.z * first.amount },
      name: first.name, step: index, type: 'straight' })
  }
  if (orientation === 'upright') {
    const conflict = turn(item, furnitureAngle(item) * rad, points.length)
    if (conflict) return blocked(conflict)
  }
  return { points, turns, width, length, height, contact: undefined, problem: undefined }
}
