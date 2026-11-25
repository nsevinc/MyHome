import type { Point } from './model'

export const rectanglePoints = (x: number, z: number, width: number, depth: number): Point[] =>
  [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }]

export function firstSlideOverlap(moving: Point[], fixed: Point[], direction: Point, distance: number) {
  let enter = 0, exit = distance
  for (const shape of [moving, fixed]) {
    for (const [index, point] of shape.entries()) {
      const next = shape[(index + 1) % shape.length]
      const length = Math.hypot(next.x - point.x, next.z - point.z)
      if (length < 1e-7) continue
      const x = (next.z - point.z) / length, z = (point.x - next.x) / length
      const project = (p: Point) => p.x * x + p.z * z
      const a = moving.map(project), b = fixed.map(project)
      const gapStart = Math.min(...b) - Math.max(...a)
      const gapEnd = Math.max(...b) - Math.min(...a)
      const speed = project(direction)
      if (Math.abs(speed) < 1e-9) {
        if (gapStart >= -1e-7 || gapEnd <= 1e-7) return
        continue
      }
      const first = gapStart / speed, last = gapEnd / speed
      enter = Math.max(enter, Math.min(first, last))
      exit = Math.min(exit, Math.max(first, last))
      if (enter >= exit - 1e-7) return
    }
  }
  return enter
}

export function clipAtX(points: Point[], boundary: number, side: number): Point[] {
  return clipPolygon(points, point => side * (point.x - boundary))
}

function clipPolygon(points: Point[], distance: (point: Point) => number): Point[] {
  return points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length]
    const first = distance(point), last = distance(next)
    const result = first >= 0 ? [point] : []
    if ((first >= 0) !== (last >= 0)) {
      const weight = first / (first - last)
      result.push({ x: point.x + (next.x - point.x) * weight, z: point.z + (next.z - point.z) * weight })
    }
    return result
  })
}

export function contactCenter(moving: Point[], fixed: Point[]) {
  const area = fixed.reduce((total, point, index) => {
    const next = fixed[(index + 1) % fixed.length]
    return total + point.x * next.z - point.z * next.x
  }, 0)
  const clipped = fixed.reduce((subject, point, index) => {
    const next = fixed[(index + 1) % fixed.length]
    return clipPolygon(subject, vertex => Math.sign(area) *
      ((next.x - point.x) * (vertex.z - point.z) - (next.z - point.z) * (vertex.x - point.x)))
  }, moving)
  if (clipped.length) return clipped.reduce((sum, point) =>
    ({ x: sum.x + point.x / clipped.length, z: sum.z + point.z / clipped.length }), { x: 0, z: 0 })
}
