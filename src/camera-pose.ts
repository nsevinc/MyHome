import type { Project } from './model'
import type { PerspectiveCamera } from 'three'

type Camera = NonNullable<Project['camera']>
const radians = Math.PI / 180

export function horizontalFov(vertical: number, aspect: number) {
  return 2 * Math.atan(aspect * Math.tan(vertical * radians / 2)) / radians
}

export function sameCamera(first: Camera | undefined, second: Camera | undefined): boolean {
  if (first === second) return true
  if (!first || !second) return false
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-7
  return near(first.fov, second.fov) && near(first.verticalShift ?? 0, second.verticalShift ?? 0)
    && first.position.every((value, axis) => near(value, second.position[axis]))
    && first.target.every((value, axis) => near(value, second.target[axis]))
}

export function cameraAngles({ position, target }: Camera) {
  const [x, y, z] = target.map((value, axis) => value - position[axis])
  return {
    yaw: Math.atan2(x, -z) / radians,
    pitch: Math.atan2(y, Math.hypot(x, z)) / radians,
    distance: Math.hypot(x, y, z),
  }
}

export function aimCamera(camera: Camera, yaw: number, pitch: number): Camera {
  const { distance } = cameraAngles(camera)
  const horizontal = distance * Math.cos(pitch * radians)
  const [x, y, z] = camera.position
  return { ...camera, target: [
    x + horizontal * Math.sin(yaw * radians),
    y + distance * Math.sin(pitch * radians),
    z - horizontal * Math.cos(yaw * radians),
  ] }
}

export function raiseCamera(camera: Camera, height: number): Camera {
  const delta = height - camera.position[1]
  return { ...camera, position: [camera.position[0], height, camera.position[2]],
    target: [camera.target[0], camera.target[1] + delta, camera.target[2]] }
}

export function levelCamera(camera: Camera): Camera {
  if (camera.verticalShift === undefined) return camera
  const [x, y, z] = camera.target
  const vertical = Math.hypot(x - camera.position[0], z - camera.position[2]) < .001
  if (!vertical && y === camera.position[1]) return camera
  return { ...camera, target: [x, camera.position[1], vertical ? camera.position[2] - Math.max(.1, Math.abs(y - camera.position[1])) : z] }
}

export function architecturalCamera(camera: Camera, enable: boolean): Camera {
  if (!enable) return { ...camera, verticalShift: undefined }
  const { pitch } = cameraAngles(camera)
  const approximate = Math.tan(pitch * radians) / (2 * Math.tan(camera.fov * radians / 2))
  return levelCamera({ ...camera, verticalShift: Math.round(Math.max(-.4, Math.min(.4, approximate)) * 100) / 100 })
}

export function setCameraProjection(view: PerspectiveCamera, camera: Camera) {
  view.fov = camera.fov
  const height = 1000, width = height * view.aspect
  if (camera.verticalShift) view.setViewOffset(width, height, 0, -camera.verticalShift * height, width, height)
  else view.clearViewOffset()
}
