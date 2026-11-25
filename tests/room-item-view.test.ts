import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeFurniture, makeMountedFurniture, makeProject } from '../src/model'
import { filterRoomItems, focusFurniture } from '../src/room-item-view'

test('Search combines Turkish words and furniture categories', () => {
  const items = [
    { ...makeFurniture('wardrobe', { x: 0, z: 0 }), name: 'Alt köşe gardırop' },
    { ...makeFurniture('wardrobe', { x: 0, z: 0 }), name: 'Üst sağ gardırop' },
    { ...makeFurniture('box', { x: 0, z: 0 }), name: 'Gardırop ölçü numunesi' },
  ]
  assert.deepEqual(filterRoomItems(items, ' ALT   KOSE GARDIROP ', ''), [items[0]])
  assert.deepEqual(filterRoomItems(items, 'gardırop', 'Gardıroplar'), items.slice(0, 2))
  assert.deepEqual(filterRoomItems(items, 'alt', 'Dekorasyon'), [])
})

test('A rotated cabinet is framed from its front without writing a render camera', () => {
  const project = makeProject(false)
  const cabinet = { ...makeFurniture('wardrobe', { x: 2400, z: 1800 }), width: 1200, depth: 600, height: 1900, rotation: 2 as const }
  project.items = [cabinet]
  const result = focusFurniture(project, [cabinet.id])!
  assert.deepEqual(result.ids, [cabinet.id])
  assert.deepEqual(result.camera.target, [2.4, .95, 1.8])
  assert.ok(result.camera.position[2] < result.camera.target[2])
  assert.ok(result.camera.position[1] > result.camera.target[1])
  assert.equal(project.camera, undefined)
  assert.equal(focusFurniture(project, ['missing']), undefined)
})

test('Focus can frame a group with floor and wall-mounted objects', () => {
  const project = makeProject(false)
  const armchair = { ...makeFurniture('sofa', { x: 1200, z: 1500 }), width: 800, depth: 600 }
  const light = makeMountedFurniture('sconce', project.walls[0].id, 2600, project.height)
  project.items = [armchair, light]
  const result = focusFurniture(project, [armchair.id, light.id])!
  assert.deepEqual(result.ids, [armchair.id, light.id])
  assert.equal(result.plan.x, 800)
  assert.equal(result.plan.z, 0)
  assert.equal(result.plan.x + result.plan.width, 2700)
  assert.equal(result.camera.target[1], (1550 + light.height) / 2000)
})

test('A column across the preferred view makes focus choose the other front angle', () => {
  const project = makeProject(false)
  project.walls[0].obstacles.push({ id: 'column', name: 'Kolon', offset: 2500, width: 700,
    depth: 200, bottom: 0, top: project.height })
  const cabinet = { ...makeFurniture('wardrobe', { x: 3720, z: 2200 }), width: 960, depth: 600, height: 1900, rotation: 2 as const }
  project.items = [cabinet]
  const { camera } = focusFurniture(project, [cabinet.id])!
  assert.ok(camera.position[0] > camera.target[0])
  assert.ok(camera.position[2] < camera.target[2])
})
