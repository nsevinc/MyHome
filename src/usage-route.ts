import type { Point } from './model'

export type RouteBlock = { name: string; shape: Point[]; bottom: number; top: number }
export type RouteReading = {
  width: number; at: Point; start: Point; end: Point; segment: number;
  limits: string[]; reason?: 'outside' | 'blocked' | 'ceiling';
}

const epsilon = .00001
type SlicePoint = { along: number; across: number }

function crossings(shape: SlicePoint[], station: number, boundary: boolean) {
  return shape.flatMap((a, index) => {
    const b = shape[(index + 1) % shape.length]
    if (!boundary && (a.along > station) === (b.along > station)) return []
    if (boundary && (station < Math.min(a.along, b.along) || station > Math.max(a.along, b.along))) return []
    const change = b.along - a.along
    return change === 0 ? [a.across, b.across] : [a.across + (b.across - a.across) * (station - a.along) / change]
  })
}

export function measureUsageRoute(outline: Point[], blocks: RouteBlock[], points: Point[], headroom: number, height: number) {
  let narrowest: RouteReading | undefined
  const candidates = blocks.filter(block => block.bottom < headroom && block.top > 0)
  for (let segment = 0; segment < points.length - 1; segment++) {
    const [a, b] = points.slice(segment, segment + 2)
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    if (length < epsilon) continue
    const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length
    const project = (shape: Point[]) => shape.map(({ x, z }) => ({
      along: (x - a.x) * dx + (z - a.z) * dz, across: (z - a.z) * dx - (x - a.x) * dz,
    }))
    const world = (along: number, across = 0): Point => ({ x: a.x + along * dx - across * dz, z: a.z + along * dz + across * dx })
    const room = project(outline)
    const solids = candidates.map(block => {
      const shape = project(block.shape)
      return { name: block.name, shape, from: Math.min(...shape.map(point => point.along)), to: Math.max(...shape.map(point => point.along)) }
    }).filter(poly => poly.from <= length && poly.to >= 0).sort((first, second) => first.from - second.from)
    let nextSolid = 0
    const nearby = new Set<typeof solids[number]>()
    function at(station: number): RouteReading {
      const point = world(station)
      const zero = { width: 0, at: point, start: point, end: point, segment }
      if (headroom > height) return { ...zero, limits: ['Tavan'], reason: 'ceiling' }
      const walls = crossings(room, station, false).sort((a, b) => a - b)
      const span = walls.findIndex((side, index) => index % 2 === 0 && side < -epsilon && walls[index + 1] > epsilon)
      if (span < 0) return { ...zero, limits: ['Oda sınırı'], reason: 'outside' }
      let low = walls[span], high = walls[span + 1]
      let left = 'Duvar', right = 'Duvar'
      while (nextSolid < solids.length && solids[nextSolid].from <= station) nearby.add(solids[nextSolid++])
      for (const solid of nearby) {
        if (solid.to < station) { nearby.delete(solid); continue }
        const hits = crossings(solid.shape, station, true)
        if (!hits.length) continue
        const from = Math.min(...hits), to = Math.max(...hits)
        if (from <= epsilon && to >= -epsilon) return { ...zero, limits: [solid.name], reason: 'blocked' }
        if (to < 0 && to > low) { low = to; left = solid.name }
        if (from > 0 && from < high) { high = from; right = solid.name }
      }
      return { width: high - low, at: point, start: world(station, low), end: world(station, high),
        segment, limits: [...new Set([left, right])] }
    }

    // Each side of the free section is linear between vertices and crossings of the route.
    // It is sufficient to check the interval ends and any contact on the route itself.
    const stations = [0, length]
    for (const shape of [room, ...solids.map(solid => solid.shape)]) {
      for (const [i, vertex] of shape.entries()) {
        if (vertex.along > 0 && vertex.along < length) stations.push(vertex.along)
        const next = shape[(i + 1) % shape.length]
        if ((vertex.across < 0) === (next.across < 0)) continue
        const crossing = vertex.along + (next.along - vertex.along) * -vertex.across / (next.across - vertex.across)
        if (crossing > 0 && crossing < length) stations.push(crossing)
      }
    }
    stations.sort((a, b) => a - b)
    for (const [i, station] of stations.entries()) {
      const next = stations[i + 1]
      // The room polygon uses half-open edges. Use one-sided values for wall corners.
      const exact = at(station)
      if (exact.reason === 'blocked' || exact.reason === 'ceiling') return exact
      const samples = exact.reason ? [] : [exact]
      if (next !== undefined && next - station > epsilon) {
        const step = Math.min(.001, (next - station) / 4)
        samples.push(at(station + step), at(next - step))
      }
      for (const reading of samples) {
        if (reading.reason) return reading
        if (!narrowest || reading.width < narrowest.width - epsilon) narrowest = reading
      }
    }
  }
  return narrowest
}
