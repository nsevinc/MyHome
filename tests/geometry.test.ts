import assert from 'node:assert/strict'
import { test } from 'node:test'
import { architecturalGeometry, bounds, footprint, overlap, placement, roomEdges, validateOutline, validateProject, vertices } from '../src/geometry'
import { makeFurniture, makeProject, makeWall } from '../src/model'
import { sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'

test('measured internal dimensions and wall apertures are preserved', () => {
  const project = makeProject()
  assert.equal(validateProject(project), undefined)
  assert.deepEqual(bounds(vertices(project.walls)), { x: 0, z: 0, width: 4200, depth: 3400 })
  const model = architecturalGeometry(project)
  function inWall(x: number, y: number, z: number) {
    return model.boxes.some(box => [x, y, z].every((point, i) => Math.abs(point - box.position[i]) < box.size[i] / 2))
  }
  assert.equal(inWall(1.5, 1.3, -.075), false)
  assert.equal(inWall(1.5, .7, -.075), true)
  assert.equal(inWall(3.1, 1.3, 3.475), false)
  assert.equal(inWall(3.1, 2.3, 3.475), true)
})

test('an orthogonal L shape closes and concavity removes floor fit', () => {
  const project = makeProject(false)
  project.walls = [
    makeWall(0, 4200), makeWall(1, 2100), makeWall(2, 1500), makeWall(1, 1300), makeWall(2, 2700), makeWall(3, 3400),
  ]
  assert.equal(validateOutline(project.walls), undefined)
  const item = makeFurniture('box', { x: 2600, z: 2020 })
  assert.ok(placement(project, item).warning.some(message => message.includes('Oda sınırı')))
  assert.equal(placement(project, { ...item, x: 2200 }).warning.length, 0)
  project.walls[0].length += 10
  assert.match(validateOutline(project.walls)!, /Yatay fark 1 cm/)
})

test('rejects a closed outline crossing itself', () => {
  const crossed = [
    makeWall(0, 4000), makeWall(1, 4000), makeWall(2, 3000), makeWall(3, 5000),
    makeWall(0, 2000), makeWall(1, 4000), makeWall(2, 3000), makeWall(3, 3000),
  ]
  assert.match(validateOutline(crossed)!, /kesişiyor/)
})

test('the beam reports five cm of clearance and then five cm of intrusion', () => {
  const project = makeProject()
  const item = project.items.find(item => item.kind === 'wardrobe')!
  assert.equal(placement(project, item).clearance, 50)
  assert.equal(placement(project, item).obstruction, 'Tavan kirişi')
  const tall = { ...item, height: 2300 }
  assert.deepEqual(placement(project, tall).warning, ['Tavan kirişi ile 5 cm çakışma.'])
  assert.equal(placement(project, { ...tall, z: 2280 }).clearance, 350)
  assert.equal(placement(project, { ...item, height: 2250 }).clearance, 0)
  assert.deepEqual(footprint(item), { x: 3610, z: 150, width: 580, depth: 1400 })
})

test('furniture fit uses actual rotated footprints for objects, beams and room limits', () => {
  const project = makeProject(false)
  const item = { ...makeFurniture('box', { x: 1800, z: 1600 }), width: 1300, depth: 240, angle: 45 }
  const neighbor = { ...item, id: 'neighbor', x: 1500, z: 1900 }
  project.items = [item, neighbor]
  assert.ok(overlap(footprint(item), footprint(neighbor)))
  assert.deepEqual(placement(project, item).warning, [])
  project.items[1] = { ...neighbor, x: 1900, z: 1700 }
  assert.match(placement(project, item).warning[0], /örtüşüyor/)
  assert.match(placement(project, { ...item, z: 400 }).warning[0], /Oda sınırını/)

  project.items = []
  project.walls[0].obstacles.push({ id: 'low-beam', name: 'Tavan kirişi', offset: 2350,
    width: 250, depth: 600, bottom: 1900, top: 2200 })
  const cabinet = { ...item, x: 2200, z: 770, height: 1950 }
  assert.equal(placement(project, cabinet).obstruction, undefined)
  assert.match(placement(project, { ...cabinet, angle: 315 }).warning[0], /Tavan kirişi ile 5 cm/)
  assert.equal(sceneData({ ...project, items: [cabinet] }).items[0].angle, Math.PI / 4)
})

test('inside normal follows either direction around a room', () => {
  const project = makeProject(false)
  const wall = [makeWall(1, 3400), makeWall(0, 4200), makeWall(3, 3400), makeWall(2, 4200)]
  assert.equal(validateOutline(wall), undefined)
  assert.equal(roomEdges(wall)[0].nx, 1)
  assert.equal(roomEdges(project.walls)[0].nz, 1)
})

test('project input and both renderer adapters preserve camera and geometry', () => {
  const project = makeProject()
  project.camera = { position: [1, 1.6, 1], target: [3, .8, 2], fov: 74 }
  assert.deepEqual(readProject(JSON.parse(JSON.stringify(project))), project)
  const scene = sceneData(project)
  assert.deepEqual(scene.camera, project.camera)
  assert.deepEqual(scene.floor, [[0, 0], [4.2, 0], [4.2, 3.4], [0, 3.4]])
  assert.deepEqual(scene.items[0].size, [2.1, .85, .92])
  assert.throws(() => readProject({ ...project, version: 2 }))
})

