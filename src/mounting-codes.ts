import { wallMountPose, roomEdges } from './geometry'
import { savedMeasurements } from './measurements'
import { furnitureAngle } from './model'
import type { Project } from './model'

async function code(value: unknown) {
  const stable = JSON.stringify(value, (_, data: unknown) => data && typeof data === 'object' && !Array.isArray(data)
    ? Object.fromEntries(Object.entries(data).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : data)
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable)))
  return Array.from(hash.slice(0, 6), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export async function mountingLayoutCode(project: Project) {
  const edges = roomEdges(project.walls)
  const walls = project.walls.map(({ id, dir, length, openings, obstacles, electricalPoints, baseboard }) =>
    ({ id, dir, length, openings: openings.map(({ sill, trim, ...opening }) => ({
      ...opening,
      sill: sill && { width: sill.width, depth: sill.depth, thickness: sill.thickness, finish: sill.finish },
      trim: trim && { width: trim.width, depth: trim.depth },
    })), obstacles, electricalPoints, baseboard: baseboard && { height: baseboard.height, depth: baseboard.depth,
      gaps: baseboard.gaps?.length ? baseboard.gaps.map(({ start, width }) => ({ start, width })).sort((a, b) => a.start - b.start || a.width - b.width) : undefined } }))
  const items = project.items.map(source => {
    const item = wallMountPose(source, edges)
    const { id, kind, x, z, width, depth, height, mount, wardrobe, curtain, drawerTravel, bedroomModel, separateHeadboard } = item
    return { id, kind, x, z, width, depth, height, angle: furnitureAngle(item), mount, wardrobe, curtain, bedroomModel, separateHeadboard,
      drawer: drawerTravel !== undefined }
  })
  return code({ version: 1, walls, items, height: project.height, thickness: project.thickness })
}

export async function mountingCodes(project: Project) {
  const layout = await mountingLayoutCode(project)
  const revision = await code({ version: 1, layout, measurements: savedMeasurements(project), sections: project.sections,
    surveys: project.walls.map(({ id, survey }) => ({ id, survey })),
    items: project.items.map(({ id, assembly, drawerTravel, liftAngle, wardrobeRun }) => ({ id, assembly, drawerTravel, liftAngle, wardrobeRun })) })
  return { layout, revision }
}
