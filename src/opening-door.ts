import { wallPoint } from './geometry'
import type { Box, WallEdge } from './geometry'
import { meters } from './model'
import type { Opening, Point } from './model'

export type DoorState = 'closed' | 'saved' | 'open'
export const roomDoorLimit = 90

export function openingLeaf(edge: WallEdge, opening: Opening, state: DoorState = 'saved') {
  if (opening.kind !== 'door' || (state === 'saved' && !opening.swing)) return
  const side = opening.swing?.hinge === 'end' ? -1 : 1
  const inset = Math.min(2, opening.width / 16)
  const depth = Math.min(36, opening.width / 5)
  const width = opening.width - 2 * inset
  const hinge = wallPoint(edge, opening.offset + (side === 1 ? inset : opening.width - inset), depth / 2)
  const open = state === 'saved' ? opening.swing?.angle ?? 0 : state === 'closed' ? 0 : Math.max(roomDoorLimit, opening.swing?.angle ?? 0)
  const turn = open * Math.PI / 180
  const dx = side * edge.dx * Math.cos(turn) + edge.nx * Math.sin(turn)
  const dz = side * edge.dz * Math.cos(turn) + edge.nz * Math.sin(turn)
  const center = { x: hinge.x + dx * width / 2, z: hinge.z + dz * width / 2 }
  const tip: Point = { x: hinge.x + dx * width, z: hinge.z + dz * width }
  return { ...center, hinge, tip, width, depth, bottom: opening.bottom, top: opening.bottom + opening.height,
    angle: Math.atan2(dz, dx) * 180 / Math.PI,
    open,
  }
}

export function openingDoorBox(edge: WallEdge, opening: Opening): Box | undefined {
  const leaf = openingLeaf(edge, opening)
  if (!leaf) return
  return { position: [meters(leaf.x), meters((leaf.bottom + leaf.top) / 2), meters(leaf.z)],
    size: [meters(leaf.width), meters(leaf.top - leaf.bottom), meters(leaf.depth)],
    color: '#af8a67', surface: 'wood', angle: leaf.angle * Math.PI / 180 }
}
