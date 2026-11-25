import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeFurniture, makeProject, uid } from '../src/model'
import { roomWalk } from '../src/room-walk'

test('Walking at eye height stops at furniture and the room wall, even in one large step', () => {
  const project = makeProject(false)
  project.camera = { position: [1, 1.65, 1.5], target: [2, 1.65, 1.5], fov: 66 }
  const cabinet = { ...makeFurniture('wardrobe', { x: 2200, z: 1500 }), width: 600, depth: 600 }
  project.items = [cabinet]
  const space = roomWalk(project)
  const pose = space.startingPose()!
  assert.equal(pose.eyeHeight, 1650)
  assert.deepEqual(pose.position, { x: 1000, z: 1500 })
  const forward = space.step(pose.position, { x: 4800, z: 0 })
  assert.ok(forward.x > 1650 && forward.x <= 1725)
  assert.ok(space.canStand(forward))
  const backward = space.step(pose.position, { x: -3600, z: 0 })
  assert.ok(backward.x >= 175 && backward.x < 210)
})

test('Walking can pass under a high beam but stops at the low one', () => {
  const project = makeProject(false)
  const wall = project.walls[0]
  const high = { id: uid(), name: 'Yüksek kiriş', offset: 200, width: 1400, depth: 600, bottom: 2250, top: 2650 }
  wall.obstacles = [high, { ...high, id: uid(), offset: 2000, name: 'Alçak kiriş', bottom: 1600 }]
  const space = roomWalk(project)
  assert.ok(space.canStand({ x: 900, z: 340 }))
  assert.ok(!space.canStand({ x: 2650, z: 340 }))
})
