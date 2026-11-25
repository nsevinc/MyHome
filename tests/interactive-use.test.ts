import assert from 'node:assert/strict'
import { test } from 'node:test'
import { architecturalCamera, sameCamera, setCameraProjection } from '../src/camera-pose'
import { motionFromHandle, motionParts, motionTrial, solveMotion } from '../src/furniture-motion'
import { makeFurniture, makeProject, makeWardrobe, uid } from '../src/model'
import { readProject } from '../src/storage'
import { inspectTransportPath } from '../src/transport-path'
import { PerspectiveCamera, Vector3 } from 'three'

test('A drawer stops at an obstacle and reports the remaining opening while the item stays in place', () => {
  const project = makeProject(false)
  const drawer = { ...makeFurniture('box', { x: 1100, z: 1000 }), width: 800, depth: 500, height: 600, drawerTravel: 500 }
  const blocker = { ...makeFurniture('box', { x: 1100, z: 1886 }), width: 600, depth: 400, height: 600, name: 'Ayakucu' }
  project.items = [drawer, blocker]
  const part = motionParts(drawer)[0]
  const trial = motionTrial(solveMotion(project, drawer, part), 500)
  assert.equal(trial.contact?.name, 'Ayakucu')
  assert.equal(Math.round(trial.amount), 420)
  assert.equal(Math.round(trial.contact!.point!.z), 1686)
  assert.equal(trial.reached, true)
  assert.ok(trial.beyond?.length)
  assert.equal(drawer.z, 1000)
  project.items[1] = { ...blocker, x: 2900 }
  const clear = motionTrial(solveMotion(project, drawer, part), 500)
  assert.equal(clear.amount, 500)
  assert.equal(clear.contact, undefined)
  assert.equal(motionFromHandle(clear, [clear.handle.x / 1000, clear.handle.y / 1000, clear.handle.z / 1000 - .1]), 400)
})

test('A base lift checks the whole rotation against the bottom of a beam', () => {
  const project = makeProject(false)
  const bed = { ...makeFurniture('bed', { x: 2100, z: 1550 }), width: 1400, depth: 1800, height: 800, liftAngle: 55 }
  project.items = [bed]
  const part = motionParts(bed)[0]
  assert.equal(solveMotion(project, bed, part).contact, undefined)
  project.walls[0].obstacles = [{ id: uid(), name: 'Kiriş', offset: 1650, width: 900, depth: 2450, bottom: 950, top: project.height }]
  const trial = motionTrial(solveMotion(project, bed, part), 55)
  assert.equal(trial.contact?.name, 'Kiriş')
  assert.ok(trial.amount > 0 && trial.amount < 55)
  assert.ok(trial.parts.some(part => part.pitch! < 0))
})

test('Architectural framing shifts the projection, keeps the camera level, and survives project serialization', () => {
  const project = makeProject(false)
  const initial = { position: [2, 1.6, 2], target: [1, 1.2, 0], fov: 45 } as const
  const pose = architecturalCamera({ ...initial, position: [...initial.position], target: [...initial.target] }, true)
  assert.equal(pose.target[1], pose.position[1])
  assert.deepEqual(pose.position, initial.position)
  project.camera = { ...pose, verticalShift: .22 }
  const stored = readProject(project).camera!
  assert.equal(stored.verticalShift, .22)
  assert.equal(sameCamera(stored, { ...stored, verticalShift: .21 }), false)
  const view = new PerspectiveCamera(45, 16 / 9, .035, 180)
  view.position.set(...stored.position)
  view.lookAt(new Vector3(...stored.target))
  setCameraProjection(view, stored)
  view.updateMatrixWorld()
  assert.ok(Math.abs(new Vector3(...stored.target).project(view).y + .44) < 1e-8)
  setCameraProjection(view, { ...stored, verticalShift: undefined })
  assert.ok(Math.abs(new Vector3(...stored.target).project(view).y) < 1e-8)
})

test('A drawn route finds the blocking door, continuous straight obstacle, or point where a turn fails', () => {
  const project = makeProject(false)
  const entrance = uid()
  project.walls[0].openings = [{ id: entrance, kind: 'door', offset: 1550, width: 1100, bottom: 0, height: 2200 }]
  const item = { ...makeWardrobe(2, { x: 3150, z: 2300 }), width: 850, depth: 600, height: 1850 }
  project.items = [item]
  const path = { entrance, entryDepth: 1250, points: [], finish: 'x' as const }
  const clear = inspectTransportPath(project, item, path, 'upright')
  assert.equal(clear.contact, undefined)
  assert.equal(clear.problem, undefined)
  assert.ok(clear.turns.length >= 2)
  project.walls[0].openings[0].width = 800
  assert.match(inspectTransportPath(project, item, path, 'upright').contact!.name, /net açıklığı/)
  assert.equal(inspectTransportPath(project, item, path, 'side').contact, undefined)
  project.walls[0].openings[0].width = 1100
  const block = { ...makeFurniture('box', { x: 3160, z: 1920 }), width: 90, depth: 90, height: 600, name: 'Engel' }
  project.items.push(block)
  const blocked = inspectTransportPath(project, item, path, 'upright')
  assert.equal(blocked.contact?.type, 'straight')
  assert.equal(blocked.contact?.name, block.name)
  assert.ok(blocked.contact.point.z < block.z)
  project.items[1] = { ...block, x: 2575, z: 1370 }
  assert.equal(inspectTransportPath(project, item, path, 'upright').contact?.type, 'turn')
})
