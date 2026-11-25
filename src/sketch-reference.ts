import { makeWall } from './model'
import type { Direction, Point, SketchReference, SketchRuler, Wall } from './model'

export const sheetWidth = 780
export const sheetHeight = 480
export const sheetCenter = { x: sheetWidth / 2, z: sheetHeight / 2 }
export const defaultSketchReference: SketchReference = { opacity: .6, rotation: 0 }

export function sheetDistance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function sketchScale(reference: SketchReference) {
  const ruler = reference.calibration
  return ruler && ruler.mm / sheetDistance(ruler.from, ruler.to)
}

export function rotateSheetPoint(point: Point, degrees: number): Point {
  const radians = degrees * Math.PI / 180
  const x = point.x - sheetCenter.x, z = point.z - sheetCenter.z
  return { x: sheetCenter.x + x * Math.cos(radians) - z * Math.sin(radians),
    z: sheetCenter.z + x * Math.sin(radians) + z * Math.cos(radians) }
}

export function rotateSketchReference(reference: SketchReference, rotation: number): SketchReference {
  const delta = rotation - reference.rotation
  const rotateRuler = (ruler?: SketchRuler) => ruler && {
    ...ruler, from: rotateSheetPoint(ruler.from, delta), to: rotateSheetPoint(ruler.to, delta),
  }
  return { ...reference, rotation, calibration: rotateRuler(reference.calibration), verification: rotateRuler(reference.verification) }
}

export function sketchDeviation(reference: SketchReference) {
  const scale = sketchScale(reference)
  const check = reference.verification
  if (!scale || !check) return
  const measured = sheetDistance(check.from, check.to) * scale
  const delta = measured - check.mm
  return { measured, delta, percent: delta / check.mm * 100 }
}

export function traceSketchWalls(points: Point[], mmPerUnit: number): Wall[] {
  const origin = points[0]
  const corners = points.map(point => ({ x: Math.round((point.x - origin.x) * mmPerUnit),
    z: Math.round((point.z - origin.z) * mmPerUnit) }))
  return corners.map((a, i) => {
    const b = corners[(i + 1) % corners.length]
    const dx = b.x - a.x, dz = b.z - a.z
    const dir: Direction = dx > 0 ? 0 : dz > 0 ? 1 : dx < 0 ? 2 : 3
    return makeWall(dir, Math.abs(dx) + Math.abs(dz))
  })
}
