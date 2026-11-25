import { roomEdges, wallPoint } from './geometry'
import { meters } from './model'
import type { Project, RenderDetail } from './model'

type Corridor = NonNullable<RenderDetail['corridor']>

export function renderDoorChoices(project: Project) {
  return project.walls.flatMap((wall, index) => wall.openings.filter(opening => opening.kind === 'door').map((opening, doorIndex) => ({
    wallId: wall.id, openingId: opening.id, label: `Duvar ${index + 1} · Kapı ${doorIndex + 1}`,
  })))
}

export function renderCorridor(project: Project, setting: Corridor, edges = roomEdges(project.walls)) {
  const edge = edges.find(edge => edge.wall.id === setting.wallId)
  const door = edge?.wall.openings.find(opening => opening.kind === 'door' && opening.id === setting.openingId)
  if (!edge || !door) return
  const center = wallPoint(edge, door.offset + door.width / 2, -project.thickness)
  let depth = setting.depth
  const width = door.width
  // An exterior recess in a concave plan can face another part of the same room.
  for (const other of edges) {
    if (other.nx !== -edge.nx || other.nz !== -edge.nz) continue
    const across = (p: typeof center) => (p.x - center.x) * edge.dx + (p.z - center.z) * edge.dz
    const [low, high] = [across(other.a), across(other.b)].sort((a, b) => a - b)
    if (low >= width / 2 || high <= -width / 2) continue
    const distance = -((other.a.x - center.x) * edge.nx + (other.a.z - center.z) * edge.nz)
    if (distance > 0) depth = Math.min(depth, distance - project.thickness - 12)
  }
  if (depth < 100) return
  return { origin: [meters(center.x), meters(door.bottom), meters(center.z)] as const,
    outward: [-edge.nx, 0, -edge.nz] as const, width: meters(width),
    height: meters(Math.min(project.height - door.bottom, door.height + 160)),
    depth: meters(depth), color: setting.color, power: setting.power }
}
