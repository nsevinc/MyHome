import { furnitureVolumes, itemBottom, obstructionVolume, roomEdges, sillVolume, wallMountPose } from './geometry'
import type { WallEdge } from './geometry'
import { fixtureFeedTolerance } from './electrical-points'
import { fmt } from './model'
import type { Furniture, Point, Project } from './model'
import { wallSymmetryOptions, wallSymmetryPreview } from './wall-mount-edit'
import type { MountSymmetry } from './wall-mount-edit'

type DistanceRange = { min: number; max: number }
export type SymmetryRangeResult = { ranges: DistanceRange[]; reason?: string }
const epsilon = .000001

function merge(spans: DistanceRange[]) {
  const ranges: DistanceRange[] = []
  for (const range of [...spans].sort((a, b) => a.min - b.min)) {
    const last = ranges.at(-1)
    if (last && range.min <= last.max + 1) last.max = Math.max(last.max, range.max)
    else ranges.push({ ...range })
  }
  return ranges
}

function intersection(a: DistanceRange[], b: DistanceRange[]) {
  return merge(a.flatMap(first => b.flatMap(second => {
    const min = Math.max(first.min, second.min), max = Math.min(first.max, second.max)
    return min <= max ? [{ min, max }] : []
  })))
}

function stripCoordinates(polygon: Point[], depth: number) {
  const points: number[] = []
  polygon.forEach((first, index) => {
    const second = polygon[(index + 1) % polygon.length]
    if (first.z >= -epsilon && first.z <= depth + epsilon) points.push(first.x)
    for (const boundary of [0, depth]) {
      if ((first.z < boundary) === (second.z < boundary)) continue
      points.push(first.x + (boundary - first.z) * (second.x - first.x) / (second.z - first.z))
    }
  })
  return points
}

function geometryStops(project: Project, edge: WallEdge, edges: WallEdge[], pair: Furniture[], origins: number[], max: number) {
  const stops = new Set([1, max])
  const toLocal = ({ x, z }: Point): Point => ({
    x: (x - edge.a.x) * edge.dx + (z - edge.a.z) * edge.dz,
    z: (x - edge.a.x) * edge.nx + (z - edge.a.z) * edge.nz,
  })
  const room = edges.map(edge => toLocal(edge.a))
  const blocks = [
    ...project.items.filter(item => !pair.some(moved => moved.id === item.id))
      .flatMap(item => furnitureVolumes(wallMountPose(item, edges), project.height)),
    ...edges.flatMap(wall => [
      ...wall.wall.obstacles.map(block => obstructionVolume(wall, block)),
      ...wall.wall.openings.flatMap(opening => sillVolume(wall, opening, project.thickness, true) ?? []),
    ].map(({ x, z, width, depth, top, bottom }) => ({
      bottom, top, shape: [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }],
    }))),
  ].map(block => ({ ...block, shape: block.shape.map(toLocal) }))
  function add(distance: number) {
    for (const rounded of [Math.floor(distance), Math.ceil(distance)]) {
      if (rounded >= 1 && rounded <= max) stops.add(rounded)
    }
  }
  add((pair[0].width / 2 + pair[1].width / 2 - (origins[1] - origins[0])) / 2)
  pair.forEach((item, side) => {
    const direction = side === 0 ? -1 : 1
    const half = item.width / 2, bottom = itemBottom(item, project.height), top = bottom + item.height
    const positions = stripCoordinates(room, item.depth)
    for (const point of positions) add((point - origins[side]) * direction)
    for (const block of blocks) {
      if (block.top <= bottom || block.bottom >= top) continue
      const overlaps = stripCoordinates(block.shape, item.depth)
      if (overlaps.length) positions.push(Math.min(...overlaps), Math.max(...overlaps))
    }
    for (const opening of edge.wall.openings) {
      if (opening.bottom < top && opening.bottom + opening.height > bottom) positions.push(opening.offset, opening.offset + opening.width)
    }
    for (const point of positions) {
      add((point - half - origins[side]) * direction)
      add((point + half - origins[side]) * direction)
    }
  })
  return [...stops].sort((a, b) => a - b)
}

function cableRanges(edge: WallEdge, pair: Furniture[], origins: number[], center: number, max: number) {
  let ranges = [{ min: 1, max }]
  for (const [index, item] of pair.entries()) {
    if (item.kind !== 'sconce') continue
    const direction = index === 0 ? -1 : 1
    const feeds = (edge.wall.electricalPoints ?? []).filter(point =>
      point.kind === 'light-feed' && (point.offset - center) * direction > 0)
    const side = index === 0 ? 'solunda' : 'sağında'
    if (!feeds.length) return { ranges: [], reason: `${item.name} · eksenin ${side} kayıtlı kablo çıkışı yok.` }
    const matches = feeds.flatMap(feed => {
      const tolerance = fixtureFeedTolerance(item, feed)
      if (tolerance === undefined) return []
      const center = (feed.offset - origins[index]) * direction
      return [{ min: Math.ceil(center - tolerance - epsilon), max: Math.floor(center + tolerance + epsilon) }]
    })
    if (!matches.length) return { ranges: [], reason: `${item.name} · kablo çıkışlarının kotu montaj yüzeyine denk gelmiyor.` }
    ranges = intersection(ranges, matches)
    if (!ranges.length) return { ranges, reason: index === 0 || pair[0].kind !== 'sconce'
      ? `${item.name} · kablo çıkışı duvar sınırları içinde eşleşmiyor.`
      : 'Sabit kablo çıkışları bu referans ekseninde ortak bir simetrik aralık bırakmıyor.' }
  }
  return { ranges }
}

export function symmetryElectricalAvailable(project: Project, setup: MountSymmetry) {
  return Boolean(project.walls.find(wall => wall.id === setup.wallId)?.electricalPoints?.some(point => point.kind === 'light-feed') &&
    project.items.some(item => item.kind === 'sconce' && (item.id === setup.leftId || item.id === setup.rightId)))
}

export function suggestWallSymmetry(project: Project, setup: MountSymmetry, matchCables: boolean): SymmetryRangeResult {
  const edges = roomEdges(project.walls)
  const edge = edges.find(edge => edge.wall.id === setup.wallId)
  if (!edge) return { ranges: [], reason: 'Montaj duvarı bulunamadı.' }
  const { mounts, references } = wallSymmetryOptions(project, edge, edges)
  const left = mounts.find(row => row.item.id === setup.leftId)?.item
  const right = mounts.find(row => row.item.id === setup.rightId)?.item
  const reference = references.find(ref => ref.id === setup.referenceId)
  if (!left || !right || !reference || left === right || [left.id, right.id].includes(reference.id)) {
    return { ranges: [], reason: 'Aynı duvardan iki farklı eşya ve ayrı bir referans seç.' }
  }
  const { center } = reference
  const origins = [Math.floor(center), Math.ceil(center)]
  const max = Math.min(origins[0] - Math.ceil(left.width / 2), edge.wall.length - origins[1] - Math.ceil(right.width / 2))
  if (max < 1) return { ranges: [], reason: 'Duvar uzunluğu ve eşya genişlikleri eksenin iki yanında yer bırakmıyor.' }
  const limits = matchCables ? cableRanges(edge, [left, right], origins, center, max) : { ranges: [{ min: 1, max }] }
  if (!limits.ranges.length) return limits

  const stops = geometryStops(project, edge, edges, [left, right], origins, max)
  const spans: DistanceRange[] = []
  // The placement classification can change only at an edge contact. Check the contact itself and one interior millimetre.
  function check(min: number, max: number) {
    if (min > max) return
    const result = wallSymmetryPreview(project, { ...setup, distance: Math.floor((min + max) / 2) }, edges)
    if (result.items.length === 2 && !result.error && !result.left?.blocked && !result.right?.blocked) spans.push({ min, max })
  }
  stops.forEach((value, index) => {
    check(value, value)
    const next = stops[index + 1]
    if (next !== undefined) check(value + 1, next - 1)
  })
  const clear = merge(spans)
  const ranges = intersection(clear, limits.ranges)
  if (ranges.length) return { ranges }
  if (clear.length) return { ranges, reason: 'Sabit kablo çıkışlarına uyan aralıkta duvar veya eşya çakışması var.' }
  const current = wallSymmetryPreview(project, { ...setup, distance: Math.min(max, Math.max(1, setup.distance)) }, edges)
  const blockers = [current.left?.blocked, current.right?.blocked].filter(Boolean)
  return { ranges, reason: `Duvar eksenden en fazla ${fmt(max)} cm bırakıyor.${blockers.length ? ' ' + [...new Set(blockers)].join(' ') : ''}` }
}
