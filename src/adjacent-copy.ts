import { attachToWall, footprintCorners, furnitureVolumes, itemAxes, mountedCenter, overlapsShape, placement, roomEdges, wallMountPose } from './geometry'
import type { WallEdge } from './geometry'
import { readClearances } from './keep-clear'
import { cabinetDoorBlocks } from './layout'
import { maxFurnitureItems } from './model'
import type { Furniture, Project } from './model'
import { copyName } from './wall-mount-edit'
import { cabinetDoorEnvironment } from './wardrobe'
import { roomDoorSwingConflicts } from './wardrobe-fill'

export type CopySide = -1 | 1
export type AdjacentCopy = { side: CopySide; item: Furniture }
export type CopyControls = { sourceId: string; options: AdjacentCopy[]; add: (side: CopySide) => void }

// Stored floor coordinates are whole millimetres. Round outwards along the
// width axis so the two faces never overlap at an oblique angle.
function beside(source: Furniture, side: CopySide, edges: WallEdge[]): Furniture[] {
  const { cos, sin } = itemAxes(source)
  const dx = cos * side, dz = sin * side
  if (source.mount) {
    const edge = edges.find(e => e.wall.id === source.mount!.wallId)
    if (!edge) return []
    const offset = mountedCenter(source, edge) + Math.sign(dx * edge.dx + dz * edge.dz) * source.width
    if (offset < source.width / 2 || offset + source.width / 2 > edge.wall.length) return []
    return [attachToWall(source, { ...source.mount, offset }, edges)]
  }
  const x = source.x + source.width * dx, z = source.z + source.width * dz
  return [...new Set([Math.floor(x), Math.ceil(x)])].flatMap(px =>
    [...new Set([Math.floor(z), Math.ceil(z)])].map(pz => ({ ...source, x: px, z: pz })))
    .filter(p => (p.x - source.x) * dx + (p.z - source.z) * dz >= source.width - 1e-6)
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))
}

export function adjacentCopies(project: Project, source: Furniture): AdjacentCopy[] {
  if (project.items.length >= maxFurnitureItems || source.curtain) return []
  const edges = roomEdges(project.walls)
  const posed = project.items.map(item => wallMountPose(item, edges))
  const strips = readClearances(project.keepClear ?? [], posed, project.height, [])
  const doorConflicts = roomDoorSwingConflicts(edges, project.height)
  const openDoors = cabinetDoorBlocks(posed.filter(item => item.wardrobe?.pose === 'open'), 'saved', project.height)
  const leafObstacles = source.wardrobe?.pose === 'open' ? cabinetDoorEnvironment(project, edges) : []
  const copy: Furniture = { ...wallMountPose(source, edges), id: '', name: copyName(source.name, project.items),
    locked: undefined, wardrobeRun: undefined, assembly: source.assembly && { ...source.assembly, routePath: undefined } }
  function fits(item: Furniture) {
    if (placement(project, item, edges).warning.length || doorConflicts(item).length) return false
    const candidate = wallMountPose(item, edges)
    if (candidate.kind === 'rug' && posed.some(other => other.kind === 'rug' &&
      overlapsShape(footprintCorners(other), footprintCorners(candidate)))) return false
    const body = furnitureVolumes(candidate, project.height)
    const leaves = candidate.wardrobe?.pose === 'open' ? cabinetDoorBlocks([candidate], 'saved', project.height) : []
    const intersects = (a: typeof body[number], b: typeof body[number]) =>
      a.bottom < b.top && b.bottom < a.top && overlapsShape(a.shape, b.shape)
    const parts = [...body, ...leaves]
    if (parts.some(p => openDoors.some(door => intersects(p, door)) ||
      (p.bottom < 2000 && p.top > 0 && strips.some(strip => overlapsShape(p.shape, strip.polygon))))) return false
    return !leaves.some(leaf => leafObstacles.some(obstacle => intersects(obstacle, leaf)))
  }
  const options: AdjacentCopy[] = []
  for (const side of [1, -1] as const) {
    const item = beside(copy, side, edges).find(fits)
    if (item) options.push({ side, item })
  }
  return options
}
