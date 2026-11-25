import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aimCamera, cameraAngles, raiseCamera, sameCamera } from '../src/camera-pose'
import { curtainRadiatorReadings, placement, roomEdges, wallMountPose } from '../src/geometry'
import { passageReadings } from '../src/layout'
import { makeCurtain, makeFurniture, makeMountedFurniture, makeProject } from '../src/model'
import type { Passage } from '../src/model'
import { defaultCamera, projectCamera, sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'

test('a curtain follows its window and measures the actual panels against the radiator', () => {
  const project = makeProject()
  const wall = project.walls[0], window = wall.openings[0]
  const center = window.offset + window.width / 2
  const curtain = makeCurtain(wall, window, 'sheer', project.height)
  const radiator = makeMountedFurniture('radiator', wall.id, center, project.height)
  project.items = [curtain, radiator]
  const edges = roomEdges(project.walls)
  const readings = (item = curtain) => curtainRadiatorReadings(project, item, edges)[0].clearance
  assert.equal(wallMountPose(curtain, edges).x, center)
  assert.equal(readings(), 38)
  const close = { ...curtain, curtain: { ...curtain.curtain!, setback: 80 } }
  assert.equal(readings(close), -32)
  assert.ok(placement(project, close).warning.some(warning => warning.includes('Panel kalorifer peteği')))
  assert.equal(readings({ ...close, curtain: { ...close.curtain, open: 1 } }), undefined)
  window.offset += 100
  assert.equal(wallMountPose(curtain, roomEdges(project.walls)).x, center + 100)
  const saved = readProject(JSON.parse(JSON.stringify(project)))
  const panels = sceneData(saved).items[0].fallback.filter(part => part.curtain)
  assert.equal(panels.length, 2)
  assert.ok(panels.every(panel => panel.curtain?.sheer))
})

test('a rug remains visible below furniture while leaving passage and fit calculations intact', () => {
  const project = makeProject(false)
  const bed = makeFurniture('bed', { x: 1500, z: 1400 })
  const rug = makeFurniture('rug', { x: 2000, z: 1500 })
  const marker: Passage = { origin: { x: 2450, z: 1550 }, axis: 'x', minimum: 800, headroom: 2000 }
  const edges = roomEdges(project.walls)
  const baseline = passageReadings(project, marker, edges, [bed])
  project.items = [bed, rug]
  assert.deepEqual(placement(project, rug).warning, [])
  assert.deepEqual(placement(project, bed).warning, [])
  assert.deepEqual(passageReadings(project, marker, edges, project.items), baseline)
  assert.ok(sceneData(project).items[1].fallback.some(part => part.slot === 'pile'))
})

test('height preserves direction while precise yaw and upward tilt preserve the camera position', () => {
  const raised = raiseCamera({ position: [2, 1.5, 3], target: [1, 1, 1], fov: 54 }, 1.725)
  assert.deepEqual(raised.position, [2, 1.725, 3])
  assert.ok(Math.abs(raised.target[1] - 1.225) < 1e-9)
  const aimed = aimCamera(raised, 72.5, 18.2)
  assert.equal(aimed.position, raised.position)
  assert.equal(aimed.fov, 54)
  const angles = cameraAngles(aimed)
  assert.ok(Math.abs(angles.yaw - 72.5) < 1e-9)
  assert.ok(Math.abs(angles.pitch - 18.2) < 1e-9)
  assert.ok(Math.abs(angles.distance - cameraAngles(raised).distance) < 1e-9)
})

test('the scene and render resolve the same default and saved camera, including its target', () => {
  const project = makeProject()
  const view = projectCamera(project)
  assert.deepEqual(view, defaultCamera(project))
  assert.deepEqual(sceneData(project).camera, view)
  const turned = aimCamera(view, -72, 12)
  assert.equal(sameCamera(view, turned), false)
  const restored = readProject({ ...project, camera: turned })
  assert.deepEqual(sceneData(restored).camera, projectCamera(restored))
  assert.deepEqual(sceneData(restored).camera.target, turned.target)
  const target = [...turned.target] as typeof turned.target
  target[0] += 1e-10
  assert.equal(sameCamera(turned, { ...turned, target }), true)
})
