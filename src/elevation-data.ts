import { footprint, itemBottom, roomEdges, wallMountPose } from './geometry'
import type { WallEdge } from './geometry'
import { fmt } from './model'
import type { Furniture, Project } from './model'

export const sizeInCm = (item: Furniture) => [item.width, item.depth, item.height].map(fmt).join(' × ')

export function elevationData(project: Project, edge: WallEdge, edges = roomEdges(project.walls)) {
  const objects = project.items.map(item => wallMountPose(item, edges)).flatMap(item => {
    const rect = footprint(item)
    const center = (item.x - edge.a.x) * edge.dx + (item.z - edge.a.z) * edge.dz
    const inward = (item.x - edge.a.x) * edge.nx + (item.z - edge.a.z) * edge.nz
    const width = edge.dx ? rect.width : rect.depth
    const depth = edge.dx ? rect.depth : rect.width
    const mounted = item.mount?.wallId === edge.wall.id
    const visible = item.mount ? mounted :
      center + width / 2 > 0 && center - width / 2 < edge.wall.length && inward - depth / 2 <= 750 && inward + depth / 2 >= 0
    if (!visible) return []
    const bottom = itemBottom(item, project.height)
    return [{ item, center, left: center - width / 2, width, bottom, top: bottom + item.height, mounted }]
  })
  const mounted = objects.filter(object => object.mounted).sort((a, b) => a.center - b.center || a.bottom - b.bottom)
    .map((object, index) => ({ ...object, number: index + 1 }))
  return { objects, mounted }
}
