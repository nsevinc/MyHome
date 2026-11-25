import { bounds, furnitureVolumes, obstructionVolume, roomEdges, wallMountPose, wallPoint } from './geometry'
import { fmt, furnitureAngle } from './model'
import type { Point, Project, RoomSection } from './model'
import { assemblyObstacles, assemblyText, wardrobeAssembly } from './wardrobe-assembly'

type Span = { from: number; to: number }
type Slice = Span & { bottom: number; top: number; name: string; color: string }
type Cut = Pick<RoomSection, 'axis' | 'offset'>

const perpendicular = (axis: Cut['axis']) => axis === 'x' ? 'z' : 'x'
export const sectionPoint = ({ axis, offset }: Cut, along: number): Point =>
  axis === 'x' ? { x: along, z: offset } : { x: offset, z: along }
export const sectionOffset = (axis: Cut['axis'], point: Point) => Math.round(point[perpendicular(axis)])
export const sectionMark = (index: number) => {
  const letter = String.fromCharCode(65 + index)
  return `${letter}–${letter}`
}
export const sectionRange = (project: Project, axis: Cut['axis']) => {
  const area = bounds(roomEdges(project.walls).map(edge => edge.a))
  return axis === 'x' ? [area.z, area.z + area.depth] : [area.x, area.x + area.width]
}

function spans(outline: Point[], { axis, offset }: Cut): Span[] {
  const normal = perpendicular(axis)
  const hits = outline.flatMap((point, index) => {
    const next = outline[(index + 1) % outline.length]
    const first = point[normal], last = next[normal]
    if ((first > offset) === (last > offset)) return []
    return [point[axis] + (next[axis] - point[axis]) * (offset - first) / (last - first)]
  }).sort((a, b) => a - b)
  return hits.flatMap((from, index) => index % 2 === 0 && hits[index + 1] - from > 1e-6
    ? [{ from, to: hits[index + 1] }] : [])
}

export function sectionSpans(project: Project, cut: Cut) {
  return spans(roomEdges(project.walls).map(edge => edge.a), cut)
}

export function sectionProfile(project: Project, cut: Cut) {
  const edges = roomEdges(project.walls)
  const rooms = spans(edges.map(edge => edge.a), cut)
  const blocks: Slice[] = edges.flatMap(edge => edge.wall.obstacles.flatMap(block => {
    const { x, z, width, depth, top, bottom } = obstructionVolume(edge, block)
    const outline = [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }]
    return spans(outline, cut).map(span => ({ ...span, name: block.name, top, bottom, color: '#ecd39c' }))
  }))
  const portals: Slice[] = edges.flatMap(edge => {
    const normal = perpendicular(cut.axis)
    if (edge.a[normal] === edge.b[normal]) return []
    const along = (cut.offset - edge.a[normal]) / (edge.b[normal] - edge.a[normal]) * edge.wall.length
    return edge.wall.openings.filter(opening => along >= opening.offset && along < opening.offset + opening.width)
      .map(opening => {
        const coordinate = wallPoint(edge, along)[cut.axis]
        return { from: coordinate, to: coordinate, bottom: opening.bottom, top: opening.bottom + opening.height,
          name: opening.kind === 'door' ? 'Kapı' : 'Pencere', color: '#609da4' }
      })
  })
  const furniture = project.items.flatMap(source => {
    const item = wallMountPose(source, edges)
    return furnitureVolumes(item, project.height).flatMap(volume => spans(volume.shape, cut)
      .map(span => ({ ...span, bottom: volume.bottom, top: volume.top, item, name: item.name, color: item.color })))
  })
  const obstacles = furniture.some(({ item }) => item.kind === 'wardrobe') ? assemblyObstacles(project) : []
  const wardrobes = furniture.filter(({ item }) => item.kind === 'wardrobe').map(slice => {
    const { item, top, from, to } = slice
    const overhead = blocks.filter(block => block.bottom > 0 && block.from < to && block.to > from)
      .sort((a, b) => a.bottom - b.bottom)[0]
    const ceiling = overhead?.bottom ?? project.height
    const radians = furnitureAngle(item) * Math.PI / 180
    const direction = cut.axis === 'x' ? -Math.sin(radians) : Math.cos(radians)
    const check = wardrobeAssembly(project, item, obstacles)
    const pivot = direction > 0 ? to : from
    const arc = Math.abs(direction) > 1 - 1e-8 ? Array.from({ length: 37 }, (_, index) => {
      const angle = Math.PI / 2 * index / 36
      return { x: pivot + direction * (item.height * Math.sin(angle) - item.depth * Math.cos(angle)),
        z: -(item.height * Math.cos(angle) + item.depth * Math.sin(angle)) }
    }) : []
    const gap = Math.round(ceiling - top)
    const label = `${item.name} · üst kot ${fmt(top)} cm · ${overhead ? overhead.name + ' altı' : 'tavan'} ${fmt(ceiling)} cm · net boşluk ${fmt(gap)} cm`
    return { item, slice, ceiling, top, gap, label, arc,
      gapAt: overhead ? (Math.max(from, overhead.from) + Math.min(to, overhead.to)) / 2 : (from + to) / 2,
      lift: `Kaldırma kotu ${fmt(check.diagonal)} cm · ${assemblyText(check, 'raise')}` }
  })
  const outline = rooms.flatMap(({ from, to }) => [{ x: from, z: 0 }, { x: to, z: -project.height }])
  const area = bounds([...outline, ...wardrobes.flatMap(wardrobe => wardrobe.arc)])
  return { rooms, blocks, furniture, portals, wardrobes, area, height: project.height }
}
