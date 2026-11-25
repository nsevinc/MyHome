import assert from 'node:assert/strict'
import { test } from 'node:test'
import { electricalReadings, newElectricalPoint } from '../src/electrical-points'
import { validateProject } from '../src/geometry'
import { duplicateLayout, layoutScene } from '../src/layout-variants'
import { makeFurniture, makeMountedFurniture, makeProject, projectSchema } from '../src/model'
import { mountingReview } from '../src/mounting-review'

test('Shared wall points are checked against each layout and match a sconce only at its mounting face', () => {
  const project = makeProject(false)
  const [wall] = project.walls
  const feed = { ...newElectricalPoint(wall, project.height, 'light-feed'), offset: 2000, height: 1680 }
  const outlet = { ...newElectricalPoint(wall, project.height, 'outlet'), offset: 1000 }
  wall.electricalPoints = [outlet, feed]
  const lamp = makeMountedFurniture('sconce', wall.id, 2000, project.height)
  project.items = [lamp]
  const cabinet = { ...makeFurniture('box', { x: 1000, z: 250 }), width: 550, depth: 500, height: 1700 }
  const alternate = duplicateLayout(project, [cabinet])!
  const before = layoutScene(alternate, alternate.layouts!.entries[0].id)
  assert.deepEqual(electricalReadings(before).map(row => row.status), ['passed', 'passed'])
  assert.equal(electricalReadings(before)[1].fixture, lamp.name)
  const readings = electricalReadings(alternate)
  assert.deepEqual(readings.map(row => row.status), ['warning', 'pending'])
  assert.deepEqual(readings[0].blockers, [cabinet.name])
  assert.equal(mountingReview(alternate).find(row => row.key === outlet.id + '/electrical')?.target.kind, 'electrical')
  assert.deepEqual(projectSchema.parse(JSON.parse(JSON.stringify(alternate))).walls[0].electricalPoints, [outlet, feed])
})

test('Points outside the wall are rejected, while a recess or open door is reported as a placement warning', () => {
  const project = makeProject(false)
  const [wall] = project.walls
  const point = { ...newElectricalPoint(wall, project.height, 'switch'), offset: 1200, height: 850 }
  wall.electricalPoints = [point]
  wall.openings.push({ id: 'door', kind: 'door', offset: 900, width: 800, bottom: 0, height: 2100 })
  assert.match(electricalReadings(project)[0].detail, /Kapı veya pencere/)
  point.offset = 4500
  assert.match(validateProject(project)!, /elektrik noktası duvar sınırını aşıyor/)
})
