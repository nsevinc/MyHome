import { architecturalGeometry, bounds, itemBottom, pointInRoom, roomEdges, wallMountPose, wallPoint, windowSill } from './geometry'
import type { Box } from './geometry'
import { furnitureAngle, meters, uid } from './model'
import type { Furniture, Project, RoomLight } from './model'
import { furnitureParts } from './furniture'
import { cabinetLight } from './cabinet-led'
import { activeAmbience, activeLighting, fixtureColor, sunDirection, temperatureColor } from './lighting'
import { saturateSurface } from './materials'
import { openingDoorBox } from './opening-door'
import { designScene } from './design-variants'
import { wallCoveringBoxes } from './wall-coverings'
import { levelCamera } from './camera-pose'
import { renderCorridor } from './render-detail'

export function defaultCamera(project: Project, interior = false): NonNullable<Project['camera']> {
  const edges = roomEdges(project.walls)
  const extent = bounds(edges.map(e => e.a))
  const first = edges[0]
  const [x, z] = [meters(extent.x + extent.width / 2), meters(extent.z + extent.depth / 2)]
  const span = meters(Math.max(extent.width, extent.depth))
  if (interior) {
    const eye = Math.min(1.55, meters(project.height) * .68)
    const back = edges.filter(edge => edge.nx === -first.nx && edge.nz === -first.nz)
      .sort((a, b) => b.wall.length - a.wall.length)[0] ?? first
    const camera = wallPoint(back, back.wall.length * .24, Math.min(230, extent.width * .09, extent.depth * .09))
    const focus = wallPoint(first, first.wall.length * .48, 160)
    const target = back === first ? wallPoint(first, first.wall.length * .48, 1000) : focus
    return { position: [meters(camera.x), eye, meters(camera.z)],
      target: [meters(target.x), eye * .74, meters(target.z)], fov: 69 }
  }
  return { position: [x + span * .8, meters(project.height) + span * .95, z + span * .8],
    target: [x, .45, z], fov: 43 }
}

export function projectCamera(project: Project): NonNullable<Project['camera']> {
  return project.camera ? levelCamera(project.camera) : defaultCamera(project)
}

export function isInteriorCamera(project: Project, position: NonNullable<Project['camera']>['position'], edges = roomEdges(project.walls)) {
  return position[1] > 0 && position[1] < meters(project.height)
    && pointInRoom({ x: position[0] * 1000, z: position[2] * 1000 }, edges)
}

export function makePointLight(project: Project, count: number): RoomLight {
  const [x, , z] = defaultCamera(project, true).target
  return { id: uid(), name: `Nokta ışığı ${count + 1}`, position: [x, meters(project.height) * .8, z],
    color: '#fff1db', power: 80 }
}

export function nearWalls(edges: ReturnType<typeof roomEdges>, position: readonly number[]): Set<string> {
  const eye = { x: position[0] * 1000, z: position[2] * 1000 }
  if (pointInRoom(eye, edges)) return new Set()
  return new Set(edges.filter(({ a, nx, nz }) => (eye.x - a.x) * nx + (eye.z - a.z) * nz < -1)
    .map(edge => edge.wall.id))
}

export function renderFurnitureParts(item: Furniture, saturation?: number): Box[] {
  return furnitureParts(item).map(box => ({ ...box, color: box.appearance?.color ?? box.material?.color ?? saturateSurface(box.color, saturation) }))
}

export function sceneData(source: Project) {
  const project = designScene(source)
  const geometry = architecturalGeometry(project)
  const { eveningLighting: _eveningLighting, wallCoverings: _wallCoverings, ambiences: _ambiences, renderDetail, ...style } = project.style
  const { fixtures, windowTemperature, ...ambience } = activeAmbience(project.style)
  const color = (value: string) => saturateSurface(value, style.colorSaturation)
  const edges = roomEdges(project.walls)
  const camera = projectCamera(project)
  const enclosed = isInteriorCamera(project, camera.position, edges)
  return {
    version: 1 as const, floor: geometry.floor.map(p => [meters(p.x), meters(p.z)] as const),
    boxes: [...geometry.boxes, ...wallCoveringBoxes(project, edges)].map(box => ({ ...box, color: box.appearance?.color ?? color(box.color) })),
    height: meters(project.height),
    style: { ...style, ...activeLighting(project.style), floor: color(style.floor), wall: color(style.wall) },
    ambience: { ...ambience, windowColor: windowTemperature && temperatureColor(windowTemperature) },
    renderDetail: {
      corridor: renderDetail?.corridor && renderCorridor(project, renderDetail.corridor, edges),
      exterior: project.walls.some(wall => wall.openings.some(opening => opening.kind === 'window')) ? renderDetail?.exterior : undefined,
      detailedBedding: renderDetail?.detailedBedding,
    },
    camera, enclosed, sunDirection: style.sun && sunDirection(style.sun),
    doors: edges.flatMap(edge => edge.wall.openings.flatMap(opening => {
      const box = openingDoorBox(edge, opening)
      return box ? [{ ...box, wallId: edge.wall.id, color: color(box.color) }] : []
    })),
    windows: edges.flatMap(edge => edge.wall.openings.filter(opening => opening.kind === 'window').map(opening => {
      const center = wallPoint(edge, opening.offset + opening.width / 2, -project.thickness / 2)
      return {
        center: [meters(center.x), meters(opening.bottom + opening.height / 2), meters(center.z)] as const,
        width: meters(opening.width), height: meters(opening.height), alongX: edge.dz === 0,
        sillThickness: meters(windowSill(edge.wall, opening)?.thickness ?? 0),
        direction: [edge.nx, 0, edge.nz] as const, thickness: meters(project.thickness),
      }
    })),
    items: project.items.map(source => wallMountPose(source, edges)).map(item => {
      const override = fixtures?.[item.id]
      const originalPower = item.fixture?.power
      if (item.fixture && override) {
        const fixture = { ...item.fixture, on: override.on ?? item.fixture.on, power: override.power ?? item.fixture.power }
        if (override.temperature !== undefined) {
          if (fixture.variant === 'pendant') fixture.temperature = override.temperature
          else fixture.color = temperatureColor(override.temperature)
        }
        item = { ...item, fixture }
      }
      const diameter = override?.diameter === undefined ? undefined : meters(override.diameter)
      const fallback = renderFurnitureParts(item, style.colorSaturation)
      return {
        name: item.name, id: item.id,
        position: [meters(item.x), meters(itemBottom(item, project.height)), meters(item.z)] as [number, number, number],
        size: [meters(item.width), meters(item.height), meters(item.depth)] as [number, number, number],
        angle: furnitureAngle(item) * Math.PI / 180, asset: item.model,
        appearances: item.model ? item.appearances : undefined,
        fixture: item.fixture?.on ? {
          name: item.name, power: item.fixture.power, color: fixtureColor(item.fixture),
          position: item.fixture.variant === 'pendant'
            ? [0, -Math.min(.015, meters(item.height) * .04), 0] as const
            : [0, meters(item.height * .55), meters(item.depth / 2) + .035] as const,
          downlightDiameter: item.fixture.variant === 'pendant' ? diameter ?? meters(Math.min(item.width, item.depth)) * .58 : undefined,
          diameter,
          ies: item.fixture.ies,
          iesPowerScale: item.fixture.ies && originalPower ? item.fixture.power / originalPower : undefined,
        } : undefined,
        fallback, cabinetLight: cabinetLight(item, fallback),
      }
    }),
  }
}
