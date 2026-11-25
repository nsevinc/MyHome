import { bounds, footprintCorners, overlap, overlapsShape, pointInRoom, wallPoint } from './geometry'
import type { WallEdge } from './geometry'
import { cabinetDoorBlocks, walkingObstacles } from './layout'
import type { Point, WardrobeFillArea } from './model'
import { openingLeaf } from './opening-door'
import type { buildWardrobeRun } from './wardrobe-run'

type FillRoute = { reached: number; total: number; path?: Point[] } & (
  { status: 'missing' } | { status: 'verified' | 'blocked'; entranceWidth: number }
)

export function wardrobeFillEntrances(edges: WallEdge[]) {
  return edges.flatMap(edge => edge.wall.openings.flatMap((opening, index) => opening.kind === 'door'
    ? [{ edge, opening, label: `Duvar ${edge.index + 1} · Kapı ${index + 1}` }] : []))
}

export function checkWardrobePassages(run: NonNullable<ReturnType<typeof buildWardrobeRun>>, area: WardrobeFillArea) {
  const { project, edges, edge, parts } = run
  const doors = wardrobeFillEntrances(edges)
  const entrance = doors.find(row => row.opening.id === area.entrance) ?? doors[0]
  const total = parts.length
  const headroom = Math.min(2000, project.height)
  const leaf = entrance && openingLeaf(entrance.edge, entrance.opening, 'open')
  const leafShape = leaf && footprintCorners({ ...leaf, rotation: 0 })
  const blockers = walkingObstacles(project, edges, entrance?.opening.id)
  if (leaf && leafShape) blockers.push({ ...leaf, shape: leafShape, name: 'Giriş kapısı' })
  const objects = blockers.filter(block => block.bottom < headroom && block.top > 0).map(block => ({ ...bounds(block.shape), shape: block.shape }))
  const fronts = parts.map(({ start, inset, item }) => {
    const leafDepth = cabinetDoorBlocks([item], 'saved', project.height).flatMap(block => block.shape.map(point =>
      (point.x - edge.a.x) * edge.nx + (point.z - edge.a.z) * edge.nz))
    return { item, start, depth: Math.max(inset + item.depth, ...leafDepth) }
  })

  function spaceIsClear(corners: Point[], throughEntrance = false) {
    const rect = bounds(corners)
    const { x, z, width, depth } = rect
    if (!throughEntrance && (!pointInRoom({ x: x + width / 2, z: z + depth / 2 }, edges) || edges.some(({ a, b }) =>
      a.x === b.x ? a.x > x + .001 && a.x < x + width - .001 && Math.min(a.z, b.z) < z + depth && Math.max(a.z, b.z) > z
        : a.z > z + .001 && a.z < z + depth - .001 && Math.min(a.x, b.x) < x + width && Math.max(a.x, b.x) > x))) return false
    return !objects.some(object => overlap(rect, object) && overlapsShape(corners, object.shape))
  }

  const blocked = fronts.filter(({ start, depth, item }) => {
    const width = Math.min(item.width, area.passage)
    const end = start + item.width - width
    return ![start, (start + end) / 2, end].some(along => spaceIsClear([
      wallPoint(edge, along, depth), wallPoint(edge, along + width, depth),
      wallPoint(edge, along + width, depth + area.passage), wallPoint(edge, along, depth + area.passage),
    ]))
  }).map(({ item }) => item.name)
  return { route: findRoute(), front: { target: area.passage, total, blocked } }

  function findRoute(): FillRoute {
    if (!entrance || !leafShape) return { status: 'missing', total, reached: 0 }
    const { edge: entryEdge, opening } = entrance
    const entranceWidth = opening.width
    const apertureEnd = opening.offset + entranceWidth
    const projected = leafShape.map(point => (point.x - entryEdge.a.x) * entryEdge.dx + (point.z - entryEdge.a.z) * entryEdge.dz)
    const hingesAtEnd = opening.swing?.hinge === 'end'
    const freeStart = hingesAtEnd ? opening.offset : Math.max(opening.offset, ...projected)
    const freeEnd = hingesAtEnd ? Math.min(apertureEnd, ...projected) : apertureEnd
    // The door limits the route width. Cabinet fronts keep the full target.
    const width = Math.min(area.passage, Math.floor(freeEnd - freeStart))
    if (width <= 0 || opening.height < headroom) return { status: 'blocked', total, reached: 0, entranceWidth }
    const radius = width / 2
    const extent = bounds(edges.map(edge => edge.a))
    const step = Math.max(50, Math.ceil(Math.max(extent.width, extent.depth) / 140))
    const columns = Math.floor(extent.width / step) + 1, rows = Math.floor(extent.depth / step) + 1
    const cells = columns * rows
    const fromIndex = (index: number) => ({ x: extent.x + index % columns * step, z: extent.z + Math.floor(index / columns) * step })

    function clear(a: Point, b: Point, throughEntrance = false) {
      const x = Math.min(a.x, b.x) - radius, z = Math.min(a.z, b.z) - radius
      const right = Math.max(a.x, b.x) + radius, far = Math.max(a.z, b.z) + radius
      return spaceIsClear([{ x, z }, { x: right, z }, { x: right, z: far }, { x, z: far }], throughEntrance)
    }

    function connect(a: Point, b: Point) {
      for (const turn of [{ x: a.x, z: b.z }, { x: b.x, z: a.z }]) {
        if (clear(a, turn) && clear(turn, b)) return turn
      }
    }

    function nearby(point: Point) {
      const x = Math.round((point.x - extent.x) / step), z = Math.round((point.z - extent.z) / step)
      const indices: number[] = []
      for (let j = Math.max(0, z - 1); j <= Math.min(rows - 1, z + 1); j++) {
        for (let i = Math.max(0, x - 1); i <= Math.min(columns - 1, x + 1); i++) indices.push(j * columns + i)
      }
      return indices
    }

    const previous = new Int32Array(cells).fill(-2)
    const queue: number[] = []
    const starts = new Map<number, Point[]>()
    const left = freeStart + radius, right = freeEnd - radius
    for (let along = left; ; along = Math.min(right, along + step / 2)) {
      const threshold = wallPoint(entryEdge, along), first = wallPoint(entryEdge, along, radius)
      if (clear(threshold, first, true)) for (const index of nearby(first)) {
        if (previous[index] !== -2) continue
        const turn = connect(first, fromIndex(index))
        if (turn) { previous[index] = -1; queue.push(index); starts.set(index, [threshold, first, turn]) }
      }
      if (along >= right) break
    }
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor], x = index % columns
      const neighbors = [x > 0 ? index - 1 : -1, x < columns - 1 ? index + 1 : -1, index - columns, index + columns]
      const point = fromIndex(index)
      for (const next of neighbors) {
        if (next < 0 || next >= cells || previous[next] !== -2 || !clear(point, fromIndex(next))) continue
        previous[next] = index
        queue.push(next)
      }
    }
    let reached = 0
    let path: Point[] | undefined
    for (const { item, start, depth } of fronts) {
      const front = depth + radius + 1
      const points = [.25, .5, .75].map(fraction => wallPoint(edge, start + item.width * fraction, front))
      const landing = points.flatMap(point => nearby(point).flatMap(index => {
        const turn = previous[index] !== -2 && connect(fromIndex(index), point)
        return turn ? [{ point, turn, index }] : []
      }))[0]
      if (!landing) continue
      reached++
      if (path) continue
      const way = [landing.point, landing.turn]
      let index = landing.index
      while (previous[index] >= 0) { way.push(fromIndex(index)); index = previous[index] }
      path = [...starts.get(index)!, fromIndex(index), ...way.reverse()]
    }
    return { status: reached === total ? 'verified' : 'blocked', reached, total, path, entranceWidth }
  }
}
