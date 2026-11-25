import { bounds, pointInRoom, roomEdges } from './geometry'
import { walkingObstacles } from './layout'
import { cameraAngles } from './camera-pose'
import type { Point, Project } from './model'
import { defaultCamera, projectCamera } from './scene-data'

const radius = 175
const stride = 35
const radiusSquared = radius * radius

function distanceSquared(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dz = b.z - a.z
  const length = dx * dx + dz * dz
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length)) : 0
  return (p.x - a.x - dx * t) ** 2 + (p.z - a.z - dz * t) ** 2
}

function hitsShape(point: Point, shape: Point[]) {
  let inside = false
  for (const [i, a] of shape.entries()) {
    const b = shape[(i + 1) % shape.length]
    if (distanceSquared(point, a, b) < radiusSquared) return true
    if ((a.z > point.z) !== (b.z > point.z) && point.x < a.x + (b.x - a.x) * (point.z - a.z) / (b.z - a.z)) inside = !inside
  }
  return inside
}

export function roomWalk(project: Project) {
  const edges = roomEdges(project.walls)
  const eyeHeight = Math.min(1650, Math.floor(project.height * .8))
  const objects = walkingObstacles(project, edges).filter(block => block.bottom < eyeHeight + 100 && block.top > 30)
    .map(block => ({ shape: block.shape, ...bounds(block.shape) }))

  function canStand(point: Point) {
    return pointInRoom(point, edges) && edges.every(({ a, b }) => distanceSquared(point, a, b) >= radiusSquared)
      && !objects.some(object => point.x > object.x - radius && point.x < object.x + object.width + radius
        && point.z > object.z - radius && point.z < object.z + object.depth + radius && hitsShape(point, object.shape))
  }

  function step(position: Point, movement: Point) {
    const chunks = Math.max(1, Math.ceil(Math.hypot(movement.x, movement.z) / stride))
    const dx = movement.x / chunks, dz = movement.z / chunks
    let next = position
    for (let i = 0; i < chunks; i++) {
      const destination = { x: next.x + dx, z: next.z + dz }
      if (canStand(destination)) next = destination
      else if (dx && canStand({ x: destination.x, z: next.z })) next = { x: destination.x, z: next.z }
      else if (dz && canStand({ x: next.x, z: destination.z })) next = { x: next.x, z: destination.z }
      else break
    }
    return next
  }

  function startingPose() {
    const current = projectCamera(project), defaultView = defaultCamera(project, true)
    const from = (camera: typeof current) => ({ x: camera.position[0] * 1000, z: camera.position[2] * 1000 })
    const preferred = from(current)
    const fallback = from(defaultView)
    const camera = canStand(preferred) ? current : defaultView
    const angles = cameraAngles(camera)
    const view = { eyeHeight, yaw: angles.yaw, pitch: Math.max(-70, Math.min(70, angles.pitch)), fov: 66 }
    if (canStand(preferred)) return { ...view, position: preferred }
    if (canStand(fallback)) return { ...view, position: fallback }
    const extent = bounds(edges.map(edge => edge.a))
    const dx = Math.max(100, extent.width / 50), dz = Math.max(100, extent.depth / 50)
    let position: Point | undefined, nearest = Infinity
    for (let x = extent.x + dx / 2; x < extent.x + extent.width; x += dx) {
      for (let z = extent.z + dz / 2; z < extent.z + extent.depth; z += dz) {
        const distance = (x - fallback.x) ** 2 + (z - fallback.z) ** 2
        if (distance < nearest && canStand({ x, z })) { position = { x, z }; nearest = distance }
      }
    }
    return position && { ...view, position }
  }

  return { canStand, startingPose, step }
}

export type WalkSpace = ReturnType<typeof roomWalk>
export type WalkPose = NonNullable<ReturnType<WalkSpace['startingPose']>>
