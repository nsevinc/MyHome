import assert from 'node:assert/strict'
import { test } from 'node:test'
import { furnitureParts } from '../src/furniture'
import { motionParts, motionTrial, solveMotion } from '../src/furniture-motion'
import { furnitureVolumes, placement } from '../src/geometry'
import { makeProject, makeStackedWardrobe, wardrobeZones } from '../src/model'
import { editableParts } from '../src/object-appearance'
import { sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'
import { cabinetDoors, openDoor } from '../src/wardrobe'

test('External drawers slide independently while the upper and lower cabinet doors stay closed', () => {
  const project = makeProject(false)
  const item = makeStackedWardrobe('drawers', { x: 1500, z: 600 })
  project.items = [item]
  const doors = cabinetDoors(item)
  assert.deepEqual(doors.map(door => door.angle), [0, 0, 0, 0])
  assert.equal(doors[0].slot, 'lower-doors')
  assert.equal(doors[2].slot, 'upper-doors')
  const drawers = motionParts(item)
  assert.deepEqual(drawers.map(drawer => drawer.id), ['outer-drawer:0', 'outer-drawer:1'])
  for (const drawer of drawers) {
    const solution = solveMotion(project, item, drawer)
    assert.equal(solution.contact, undefined)
    const open = motionTrial(solution, drawer.max)
    assert.ok(open.parts[0].position[2] > drawer.boxes[0].position[2])
  }
  const upperDoor = { ...item, wardrobe: openDoor(item.wardrobe!, 2, 45) }
  assert.deepEqual(cabinetDoors(upperDoor).map(door => door.angle), [0, 0, 45, 0])
  const restored = readProject(JSON.parse(JSON.stringify({ ...project, items: [upperDoor] })))
  assert.equal(cabinetDoors(restored.items[0])[2].angle, 45)
  assert.ok(sceneData(restored).items[0].fallback.some(box => box.slot === 'drawer-fronts'))
  assert.ok(editableParts(item).some(field => field.id === 'drawer-fronts'))
})

test('An open niche contains no solid geometry and leaves room for wall features', () => {
  const project = makeProject(false)
  const item = makeStackedWardrobe('niche', { x: 1800, z: 250 })
  project.items = [item]
  const { lowerTop, upperBottom } = wardrobeZones(item)
  assert.deepEqual(furnitureVolumes(item, project.height).map(volume => [volume.bottom, volume.top]), [[0, 550], [1100, 2200]])
  const crossesGap = furnitureParts(item).some(box =>
    (box.position[1] - box.size[1] / 2) * 1000 < upperBottom - .001 &&
    (box.position[1] + box.size[1] / 2) * 1000 > lowerTop + .001)
  assert.equal(crossesGap, false)
  project.walls[0].obstacles = [{ id: 'test-niche-obstacle', name: 'Duvar çıkıntısı', offset: 1600,
    width: 200, depth: 150, bottom: 650, top: 850 }]
  assert.deepEqual(placement(project, item).warning, [])
  project.walls[0].obstacles[0].bottom = 500
  assert.match(placement(project, item).warning[0], /Duvar çıkıntısı/)
})
