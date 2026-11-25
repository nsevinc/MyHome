import { twiceArea, validateOutline } from './geometry'
import type { Opening, Point } from './model'
import { traceSketchWalls } from './sketch-reference'

type Raster = Pick<ImageData, 'data' | 'width' | 'height'>
type Run = { row: number; start: number; end: number }
type Ink = (x: number, y: number) => boolean
export type SketchOpening = { wall: number; offset: number; width: number; kind: Opening['kind'] }

function strokes(raster: Raster, ink: Ink, horizontal: boolean, maxGap: number): Run[] {
  const width = horizontal ? raster.width : raster.height
  const height = horizontal ? raster.height : raster.width
  const dark = horizontal ? ink : (x: number, y: number) => ink(y, x)
  const bands: (Run & { last: number })[] = []
  let previous: typeof bands = []
  for (let row = 0; row < height; row++) {
    const active: typeof bands = []
    for (let x = 0; x < width;) {
      if (!dark(x, row)) { x++; continue }
      const start = x
      while (x < width && dark(x, row)) x++
      const end = x - 1
      if (end - start < 26) continue
      const band = previous.find(line => Math.abs(line.start - start) <= 5 && Math.abs(line.end - end) <= 5)
      if (band) { band.last = row; active.push(band) }
      else {
        const line = { row, last: row, start, end }
        bands.push(line)
        active.push(line)
      }
    }
    previous = active
  }
  const runs: Run[] = []
  for (const { row, last, start, end } of bands.sort((a, b) => a.start - b.start)) {
    if (last - row > 30) continue
    const center = (row + last) / 2
    const existing = runs.find(run => Math.abs(run.row - center) <= 2 && start <= run.end + maxGap)
    if (existing) existing.end = Math.max(existing.end, end)
    else runs.push({ row: center, start, end })
  }
  return runs.sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 22)
}

function roomContour(horizontal: Run[], vertical: Run[], scale: number) {
  const points: Point[] = []
  const neighbors: number[][] = []
  const columns = vertical.map((): number[] => [])
  function connect(indices: number[], axis: 'x' | 'z') {
    indices.sort((a, b) => points[a][axis] - points[b][axis])
    indices.slice(1).forEach((id, i) => {
      const previous = indices[i]
      neighbors[id].push(previous)
      neighbors[previous].push(id)
    })
  }
  for (const h of horizontal) {
    const row: number[] = []
    vertical.forEach((v, i) => {
      if (v.row < h.start - 5 || v.row > h.end + 5 || h.row < v.start - 5 || h.row > v.end + 5) return
      const index = points.push({ x: v.row, z: h.row }) - 1
      neighbors.push([])
      row.push(index)
      columns[i].push(index)
    })
    connect(row, 'x')
  }
  columns.forEach(column => connect(column, 'z'))
  if (points.length > 80) return

  let best: Point[] | undefined
  let bestArea = 0
  let searchBudget = 12_000
  function check(path: number[]) {
    const loop = path.map(index => points[index])
    const corners = loop.filter((b, i) => {
      const a = loop.at(i - 1)!, c = loop[(i + 1) % loop.length]
      return (a.x === b.x) !== (b.x === c.x)
    })
    if (corners.length < 4) return
    const area = twiceArea([...corners, corners[0]])
    if (area < 3000 || area <= bestArea) return
    if (corners.some((p, i) => Math.hypot(p.x - corners[(i + 1) % corners.length].x,
      p.z - corners[(i + 1) % corners.length].z) * scale < 300)) return
    const start = corners.reduce((top, p, i) => p.z < corners[top].z || (p.z === corners[top].z && p.x < corners[top].x) ? i : top, 0)
    const ordered = [...corners.slice(start), ...corners.slice(0, start)]
    if (validateOutline(traceSketchWalls(ordered, scale))) return
    best = ordered
    bestArea = area
  }
  function visit(path: number[], node: number) {
    if (--searchBudget < 0 || path.length > 42) return
    for (const next of neighbors[node]) {
      if (next === path[0] && path.length >= 4) check(path)
      else if (next > path[0] && !path.includes(next)) visit([...path, next], next)
    }
  }
  points.forEach((_, i) => visit([i], i))
  return best
}

function findOpenings(points: Point[], walls: ReturnType<typeof traceSketchWalls>, scale: number, ink: Ink) {
  return points.flatMap((a, wall): SketchOpening[] => {
    const b = points[(wall + 1) % points.length]
    const horizontal = a.z === b.z
    const direction = Math.sign(horizontal ? b.x - a.x : b.z - a.z)
    const length = Math.floor(Math.hypot(b.x - a.x, b.z - a.z))
    const band = Math.min(15, Math.max(5, Math.round(125 / scale)))
    const columns = Array.from({ length }, (_, offset) => {
      let count = 0
      for (let cross = -band; cross <= band; cross++) {
        if (ink(Math.round(a.x + (horizontal ? offset * direction : cross)),
          Math.round(a.z + (horizontal ? cross : offset * direction)))) count++
      }
      return count
    })
    const sorted = [...columns].sort((p, q) => p - q)
    const typical = sorted[Math.floor(sorted.length * .78)]
    if (!typical) return []
    const openings: SketchOpening[] = []
    for (let i = 0; i < columns.length;) {
      if (columns[i] >= typical * .55) { i++; continue }
      const start = i
      while (i < columns.length && columns[i] < typical * .55) i++
      const offset = Math.round(start * scale)
      const width = Math.round(i * scale) - offset
      if (offset < 120 || offset + width > walls[wall].length - 120 || width < 450 || width > 2200) continue
      const narrowStroke = columns.slice(start, i).filter(value => value > 0).length / (i - start)
      openings.push({ wall, offset, width, kind: narrowStroke >= .7 ? 'window' : 'door' })
    }
    return openings
  })
}

export function suggestSketchRoom(raster: Raster, scale: number) {
  const ink: Ink = (x, y) => {
    if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return false
    const i = (y * raster.width + x) * 4, data = raster.data
    return data[i + 3] >= 128 && (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) < 1350
  }
  const maxGap = Math.min(135, Math.ceil(2250 / scale))
  const points = roomContour(strokes(raster, ink, true, maxGap), strokes(raster, ink, false, maxGap), scale)
  if (!points) return
  const walls = traceSketchWalls(points, scale)
  return { points, walls, openings: findOpenings(points, walls, scale, ink) }
}
