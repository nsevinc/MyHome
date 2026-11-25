import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeBedroomFurniture } from '../src/bedroom-catalog'
import { roomEdges, wallMountPose } from '../src/geometry'
import { makeFurniture, makeProject } from '../src/model'
import { cabinetDoorClearance, localToRoom } from '../src/wardrobe'

test('Flush overhead cabinets on each wall open through the shared seam on both hinge hands', () => {
  const project = makeProject(false)
  const edges = roomEdges(project.walls)
  for (const edge of edges) {
    const cabinets = [1000, 1720].map(offset => wallMountPose(makeBedroomFurniture('upper-cabinet',
      { x: 0, z: 0 }, { wallId: edge.wall.id, offset, bottom: 1900 }), edges))
    project.items = cabinets
    for (const item of cabinets) {
      const readings = cabinetDoorClearance(project, item, edges)
      assert.deepEqual(readings.map(door => door.hit), [undefined, undefined])
      // The inspector passes stored coordinates, the canvas passes the resolved wall pose.
      assert.deepEqual(cabinetDoorClearance(project, { ...item, x: 0, z: 0, angle: 0 }, edges), readings)
    }
    project.items = cabinets.map(item => ({ ...item, wardrobe: { ...item.wardrobe!, pose: 'open' } }))
    for (const item of project.items) assert.ok(cabinetDoorClearance(project, item, edges).every(door => !door.hit))
    const item = cabinets[0]
    const wide = { ...item, wardrobe: { ...item.wardrobe!, leaves: [null, { limit: 110 }] } }
    const contact = cabinetDoorClearance(project, wide, edges)[1].hit
    assert.ok(contact && contact.itemId === cabinets[1].id && contact.angle > 90 && contact.angle < 110)
    const position = localToRoom(item, { x: 0, z: 250 })
    const obstacle = { ...makeFurniture('wardrobe', position), width: 150, depth: 100, height: 2400 }
    project.items = [...cabinets, obstacle]
    assert.ok(cabinetDoorClearance(project, item, edges).some(door => door.hit?.itemId === obstacle.id))
    project.items = [...cabinets, { ...obstacle, height: 1800 }]
    assert.ok(cabinetDoorClearance(project, item, edges).every(door => !door.hit))
  }
})
