import { bounds, furnitureVolumes, obstructionVolume, overlap, overlapsShape, roomEdges, wallMountPose, wallPoint } from './geometry'
import type { WallEdge } from './geometry'
import { furnitureParts } from './furniture'
import { fmt, uid } from './model'
import type { ElectricalPoint, Furniture, Project, Wall } from './model'

export const electricalNames = { outlet: 'Priz', switch: 'Anahtar', 'light-feed': 'Aplik kablo çıkışı' } as const
export const electricalIcons = { outlet: 'P', switch: 'A', 'light-feed': 'K' } as const
export const electricalRadius = (point: ElectricalPoint) => point.kind === 'light-feed' ? 15 : 40

export function newElectricalPoint(wall: Wall, height: number, kind: ElectricalPoint['kind']): ElectricalPoint {
  return { id: uid(), kind, name: electricalNames[kind], offset: Math.round(wall.length / 2),
    height: Math.min(height, { outlet: 300, switch: 1100, 'light-feed': 1470 }[kind]), example: true }
}

export type ElectricalReading = {
  edge: WallEdge; point: ElectricalPoint; status: 'warning' | 'pending' | 'passed';
  detail: string; blockers: string[]; fixture?: string;
}

export function fixtureFeedTolerance(item: Furniture, point: ElectricalPoint) {
  if (point.kind !== 'light-feed' || item.kind !== 'sconce' || !item.mount) return
  const mount = furnitureParts(item).find(box => box.slot === 'body')
  if (!mount) return
  const y = item.mount.bottom + mount.position[1] * 1000
  const allowance = mount.size[0] * 500 - electricalRadius(point)
  return allowance >= -1e-6 && Math.abs(y - point.height) + electricalRadius(point) <= mount.size[1] * 500 + 1e-6
    ? Math.max(0, allowance) : undefined
}

function fixtureCovers(item: Furniture, edge: WallEdge, point: ElectricalPoint) {
  const tolerance = fixtureFeedTolerance(item, point)
  const along = (item.x - edge.a.x) * edge.dx + (item.z - edge.a.z) * edge.dz
  return tolerance !== undefined && Math.abs(along - point.offset) <= tolerance + 1e-6
}

export function electricalReadings(project: Project, edges = roomEdges(project.walls), wallId?: string): ElectricalReading[] {
  const walls = edges.filter(edge => (!wallId || edge.wall.id === wallId) && edge.wall.electricalPoints?.length)
  if (!walls.length) return []
  const items = project.items.map(item => wallMountPose(item, edges)).map(item => ({ item,
    volumes: furnitureVolumes(item, project.height).map(volume => ({ ...volume, range: bounds(volume.shape) })),
  }))
  const blocks = edges.flatMap(edge => edge.wall.obstacles.map(obstacle => {
    const volume = obstructionVolume(edge, obstacle)
    return { ...volume, name: obstacle.name }
  }))
  return walls.flatMap(edge => edge.wall.electricalPoints!.map(point => {
    const radius = electricalRadius(point)
    const low = point.offset - radius, high = point.offset + radius
    const bottom = point.height - radius, top = point.height + radius
    const nearWall = [wallPoint(edge, low), wallPoint(edge, high), wallPoint(edge, high, 80), wallPoint(edge, low, 80)]
    const range = bounds(nearWall)
    const coversHeight = (block: { top: number; bottom: number }) => block.top > bottom && block.bottom < top
    const blockers: string[] = []
    if (edge.wall.openings.some(opening => opening.offset < high && opening.offset + opening.width > low &&
      coversHeight({ bottom: opening.bottom, top: opening.bottom + opening.height }))) blockers.push('Kapı veya pencere açıklığı')
    blockers.push(...blocks.filter(block => coversHeight(block) && overlap(range, block)).map(block => block.name))
    let fixture: string | undefined
    for (const { item, volumes } of items) {
      if (point.kind === 'light-feed' && item.kind === 'sconce' && item.mount?.wallId === edge.wall.id) {
        if (fixtureCovers(item, edge, point)) fixture = item.name
        continue
      }
      if (volumes.some(volume => coversHeight(volume) && overlap(range, volume.range) && overlapsShape(volume.shape, nearWall))) {
        blockers.push(item.name)
      }
    }
    const contents = [...new Set(blockers)]
    const status = contents.length ? 'warning' : point.kind === 'light-feed' && !fixture ? 'pending' : 'passed'
    const detail = contents.length ? `Önünü kapatan · ${contents.join(', ')}` : fixture
      ? `${fixture} montaj yüzeyinde` : point.kind === 'light-feed' ? 'Aplik eşleşmesi bekliyor.' : 'Duvar yüzünde önü açık.'
    return { edge, point, blockers: contents, fixture, status, detail }
  }))
}

export const electricalPosition = ({ point, edge }: ElectricalReading) =>
  `Duvar ${edge.index + 1} · Başlangıçtan ${fmt(point.offset)} cm · Yerden ${fmt(point.height)} cm`
