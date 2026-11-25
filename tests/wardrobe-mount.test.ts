import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attachToWall, initialPlacement, moveAlongWall, placement, roomEdges, wallMountPose } from '../src/geometry'
import { makeFurniture, makeMountedFurniture, makeProject, makeWardrobe } from '../src/model'
import { sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'
import { cabinetDoorClearance, cabinetDoors, changeDoor, movedDoorPoint, openDoor } from '../src/wardrobe'

test('a thin obstacle is found between sampled angles only on the swept side and within the limit', () => {
  const project = makeProject(false)
  const cabinet = { ...makeWardrobe(1, { x: 2000, z: 1000 }), width: 1000 }
  const obstacle = { ...makeFurniture('box', { x: 1675, z: 1960 }), name: 'İnce komodin',
    width: 1, depth: 1, height: 650 }
  project.items = [cabinet, obstacle]
  const edges = roomEdges(project.walls)
  assert.equal(placement(project, cabinet).warning.length, 0)
  const [door] = cabinetDoorClearance(project, cabinet, edges)
  assert.equal(door.hit?.label, obstacle.name)
  assert.ok(door.hit!.angle > 74 && door.hit!.angle < 77)
  const base = cabinet.wardrobe!
  assert.equal(cabinetDoorClearance(project, { ...cabinet, wardrobe: changeDoor(base, 0, { limit: 60 }) }, edges)[0].hit, undefined)
  assert.equal(cabinetDoorClearance(project, { ...cabinet, wardrobe: changeDoor(base, 0, { hinge: 'right' }) }, edges)[0].hit, undefined)
})

test('a clear cabinet body can have a blocked door while beam height and wall openings are respected', () => {
  const project = makeProject(false)
  const cabinet = { ...makeWardrobe(1, { x: 2000, z: 1000 }), width: 1000 }
  project.items = [cabinet]
  const beam = { id: 'beam', name: 'Tavan kirişi', offset: 2190, width: 580, depth: 2000, bottom: 2250, top: 2600 }
  project.walls[2].obstacles.push(beam)
  assert.equal(cabinetDoorClearance(project, cabinet, roomEdges(project.walls))[0].hit, undefined)
  beam.bottom = 1750
  assert.equal(placement(project, cabinet).warning.length, 0)
  assert.equal(cabinetDoorClearance(project, cabinet, roomEdges(project.walls))[0].hit?.label, beam.name)
  project.walls[2].obstacles = []
  const atWall = { ...cabinet, z: 3000 }
  assert.equal(cabinetDoorClearance(project, atWall, roomEdges(project.walls))[0].hit?.label, 'Duvar 3')
  project.walls[2].openings.push({ id: 'doorway', kind: 'door', offset: 1700, width: 1050, bottom: 0, height: 2200 })
  assert.equal(cabinetDoorClearance(project, atWall, roomEdges(project.walls))[0].hit, undefined)
})

test('individual hinged poses and two-track doors preserve interior settings and persist', () => {
  const project = makeProject(false)
  const cabinet = makeWardrobe(2, { x: 2000, z: 1000 })
  const wardrobe = openDoor(cabinet.wardrobe!, 0, 37.5)
  wardrobe.interior = [{ shelves: [.24, .78], rail: .69, drawers: 2 }]
  cabinet.wardrobe = wardrobe
  project.items = [cabinet]
  const [first, second] = cabinetDoors(cabinet)
  assert.equal(first.angle, 37.5)
  assert.equal(second.angle, 0)
  assert.ok(sceneData(project).items[0].fallback.some(box => box.slot === 'doors' && box.angle! > 0))
  const sliding = { ...cabinet, wardrobe: { ...wardrobe, motion: 'sliding' as const, parking: 'right' as const, slide: 1 } }
  project.items = [sliding]
  const doors = cabinetDoors(sliding)
  assert.ok(doors.every(door => door.yaw === 0))
  const [front, back] = doors.map(door => movedDoorPoint(door, door.center))
  assert.equal(front.x, back.x)
  assert.notEqual(front.z, back.z)
  assert.deepEqual(readProject(JSON.parse(JSON.stringify(project))), project)
  assert.ok(sceneData(project).items[0].fallback.filter(box => box.slot === 'inside').length > 8)
})

test('wall fixtures preserve the wall, elevation, lamp lighting and fit across both scene adapters', () => {
  const project = makeProject(false)
  const edges = roomEdges(project.walls)
  const cabinet = initialPlacement(project, makeMountedFurniture('wall-cabinet', edges[0].wall.id, 2100, project.height))
  const radiator = initialPlacement(project, makeMountedFurniture('radiator', edges[0].wall.id, 2100, project.height))
  const sconce = makeMountedFurniture('sconce', edges[1].wall.id, 1200, project.height)
  const bar = makeMountedFurniture('sconce', edges[2].wall.id, 1200, project.height, true)
  bar.fixture!.on = false
  project.items = [cabinet, radiator, sconce, bar]
  assert.equal(cabinet.x, radiator.x)
  assert.deepEqual(placement(project, cabinet).warning, [])
  const data = sceneData(project)
  assert.deepEqual(data.items[0].position, [2.1, 1.5, .17])
  assert.deepEqual(data.items[1].position, [2.1, .12, .056])
  assert.deepEqual(data.items[2].position, [4.0975, 1.55, 1.2])
  assert.equal(data.items[2].fixture?.power, 34)
  assert.ok(data.items[2].fallback.some(box => box.round && box.emission))
  assert.equal(data.items[3].fixture, undefined)
  assert.ok(data.items[3].fallback.every(box => !box.emission))
  const moved = moveAlongWall(sconce, { x: 2500, z: 1475 }, edges)
  assert.equal(moved.mount?.offset, 1475)
  assert.equal(moved.mount?.wallId, sconce.mount?.wallId)
  assert.deepEqual(readProject(JSON.parse(JSON.stringify(project))), project)
  assert.equal(wallMountPose(attachToWall(cabinet, { wallId: edges[3].wall.id, offset: 1100, bottom: 1675 }, edges), edges).angle, 270)
})
