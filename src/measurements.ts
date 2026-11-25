import { footprintCorners, itemBottom, obstructionVolume, overlapsShape, roomEdges, wallMountPose } from './geometry'
import type { WallEdge } from './geometry'
import { passageReader } from './layout'
import type { passageReadings } from './layout'
import { fmt } from './model'
import type { Furniture, Measurement, Point, Project } from './model'

export const legacyPassageId = 'myhome-legacy-passage'

export function savedMeasurements(project: Project): Measurement[] {
  if (project.measurements) return project.measurements
  return project.passage ? [{ ...project.passage, kind: 'passage', id: legacyPassageId, name: 'Geçiş 1' }] : []
}

function nearestOnEdge(point: Point, a: Point, b: Point) {
  const x = b.x - a.x, z = b.z - a.z
  const factor = Math.max(0, Math.min(1, ((point.x - a.x) * x + (point.z - a.z) * z) / (x * x + z * z)))
  return { x: a.x + factor * x, z: a.z + factor * z }
}

export function closestFurnitureGap(a: Furniture, b: Furniture, roomHeight: number) {
  const first = footprintCorners(a), second = footprintCorners(b)
  const horizontalOverlap = overlapsShape(first, second)
  if (horizontalOverlap) {
    const point = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }
    const firstBottom = itemBottom(a, roomHeight), secondBottom = itemBottom(b, roomHeight)
    const overlapsHeight = firstBottom + a.height > secondBottom && secondBottom + b.height > firstBottom
    return { start: point, end: point, distance: 0, overlap: overlapsHeight }
  }
  let best = { start: first[0], end: second[0], distance: Infinity, overlap: false }
  for (const [source, target, swap] of [[first, second, false], [second, first, true]] as const) {
    for (const point of source) {
      for (let i = 0; i < target.length; i++) {
        const nearest = nearestOnEdge(point, target[i], target[(i + 1) % target.length])
        const distance = Math.hypot(point.x - nearest.x, point.z - nearest.z)
        if (distance < best.distance) best = { distance, start: swap ? nearest : point, end: swap ? point : nearest, overlap: false }
      }
    }
  }
  return best
}

export function measurementObstacles(edges: WallEdge[]) {
  return edges.flatMap(edge => edge.wall.obstacles.map(obstacle => ({ obstacle, edge, volume: obstructionVolume(edge, obstacle) })))
}

export function passageText(reading: ReturnType<typeof passageReadings>[number]) {
  if (reading.reason === 'outside') return 'Oda dışında'
  if (reading.reason === 'ceiling') return 'Tavan kotu düşük'
  if (reading.reason === 'blocked') return 'Geçiş kapalı'
  return `${fmt(Math.round(reading.width))} cm`
}

type FixedMeasure = Extract<Measurement, { kind: 'gap' | 'height' }>
type MeasurementBase = { number: number; text: string; detail: string; warning: boolean; unavailable?: boolean }
export type MeasurementReading =
  | (MeasurementBase & { measurement: Extract<Measurement, { kind: 'passage' }>; modes: ReturnType<typeof passageReadings> })
  | (MeasurementBase & { measurement: FixedMeasure; mark?: { start: Point; end: Point } })

export function readMeasurements(project: Project, edges = roomEdges(project.walls),
  items = project.items.map(item => wallMountPose(item, edges)), measures = savedMeasurements(project)): MeasurementReading[] {
  if (!measures.length) return []
  const measurePassage = passageReader(project, edges, items)
  const itemsById = new Map(items.map(item => [item.id, item]))
  const obstacles = measurementObstacles(edges)
  return measures.map((measurement, index) => {
    const number = index + 1
    if (measurement.kind === 'passage') {
      const modes = measurePassage(measurement)
      const saved = modes.find(reading => reading.mode === 'saved')!
      return { measurement, number, modes, text: passageText(saved), warning: saved.width < measurement.minimum, unavailable: saved.reason === 'outside',
        detail: `${measurement.axis === 'x' ? 'Yatay' : 'Dikey'} kesit · ${fmt(measurement.headroom)} cm denetim yüksekliği` }
    }
    const unavailable = (text: string, detail = '') => ({ measurement, number, text, detail, warning: true, unavailable: true })
    const source = itemsById.get(measurement.sourceId)
    if (!source) return unavailable('Eşya bu yerleşimde eksik')
    if (measurement.kind === 'gap') {
      const target = itemsById.get(measurement.targetId)
      if (!target) return unavailable('Eşya bu yerleşimde eksik', source.name)
      const gap = closestFurnitureGap(source, target, project.height)
      return { measurement, number, text: gap.overlap ? 'Çakışıyor · 0 cm' : `${fmt(Math.round(gap.distance))} cm`,
        detail: `${source.name} / ${target.name} · plan mesafesi`, warning: gap.overlap,
        mark: { start: gap.start, end: gap.end } }
    }
    const obstacle = obstacles.find(entry => entry.obstacle.id === measurement.obstacleId)
    if (measurement.obstacleId && !obstacle) return unavailable('Çıkıntı eksik', source.name)
    const bottom = itemBottom(source, project.height)
    const underside = obstacle?.volume.bottom ?? project.height
    const detail = `${source.name} / ${obstacle?.obstacle.name ?? 'Tavan'} · düşey boşluk`
    const fixedMark = { start: { x: source.x, z: source.z }, end: { x: source.x, z: source.z } }
    if (obstacle) {
      const { x, z, width, depth, top } = obstacle.volume
      const footprint = [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }]
      if (!overlapsShape(footprintCorners(source), footprint)) return { ...unavailable('Yatay iz dışında', detail), mark: fixedMark }
      if (bottom >= top) return { ...unavailable('Eşya çıkıntının üstünde', detail), warning: false, mark: fixedMark }
    }
    const gap = underside - bottom - source.height
    return { measurement, number, detail, warning: gap < 0, mark: fixedMark,
      text: gap < 0 ? `${fmt(-gap)} cm çakışma` : `${fmt(gap)} cm` }
  })
}
