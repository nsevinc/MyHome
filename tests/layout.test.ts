import assert from 'node:assert/strict'
import { test } from 'node:test'
import { attachToWall, roomEdges, wallMountPose } from '../src/geometry'
import { measureGaps, moveForGap, passageReadings, snapFurniture } from '../src/layout'
import { makeFurniture, makeMountedFurniture, makeProject, makeWall, makeWardrobe } from '../src/model'
import type { Passage } from '../src/model'
import { sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'

test('directional gaps measure the rotated footprint and place the requested millimetre gap', () => {
  const project = makeProject(false)
  const piece = { ...makeFurniture('box', { x: 1500, z: 1500 }), width: 1000, depth: 1000, angle: 45 }
  const neighbor = makeFurniture('box', { x: 2800, z: 1500 })
  project.items = [piece, neighbor]
  const edges = roomEdges(project.walls)
  const gaps = measureGaps(project, piece, edges)
  const right = gaps.find(gap => gap.label === 'Sağ')!
  assert.equal(right.name, neighbor.name)
  assert.ok(Math.abs(right.distance - (1000 - Math.sqrt(500 ** 2 + 500 ** 2))) < 1e-6)
  assert.equal(Math.round(right.end.x), 2500)
  const moved = moveForGap(piece, gaps, right, 300, edges)!
  assert.equal(Math.round(measureGaps(project, { ...piece, ...moved }, edges).find(gap => gap.label === 'Sağ')!.distance), 300)
  assert.equal(moveForGap(piece, gaps, right, 2200, edges), undefined)
  neighbor.z = 2850
  assert.equal(measureGaps(project, piece, edges).find(gap => gap.label === 'Sağ')?.name, 'Duvar 2')
})

test('snap aligns a wall face and furniture edges while honoring wall mount and collision bounds', () => {
  const project = makeProject(false)
  const edges = roomEdges(project.walls)
  const box = makeFurniture('box', { x: 329, z: 940 })
  const other = { ...makeFurniture('box', { x: 1210, z: 960 }), width: 900 }
  project.items = [box, other]
  const result = snapFurniture(project, box, edges, 50)
  assert.deepEqual(result.position, { x: 300, z: 960 })
  assert.deepEqual(result.guides.map(guide => guide.name), ['Duvar 4', other.name])
  project.items = []
  const cabinet = attachToWall(makeMountedFurniture('wall-cabinet', project.walls[0].id, 420, project.height),
    { wallId: project.walls[0].id, offset: 420, bottom: 1500 }, edges)
  assert.deepEqual(snapFurniture(project, cabinet, edges, 50).position, { x: 400, z: 170 })
  const alignedToConflict = { ...box, x: 405, z: 940 }
  const blocker = { ...other, x: 1003, width: 596 }
  project.items = [alignedToConflict, blocker]
  assert.ok(snapFurniture(project, alignedToConflict, edges, 20).position.x <= 405,
    'Do not snap through the adjacent object')
})

test('passage compares door states, reacts to movement and persists its measurement settings', () => {
  const project = makeProject(false)
  const wardrobe = { ...makeWardrobe(1, { x: 3200, z: 1000 }), width: 1000 }
  const bed = { ...makeFurniture('bed', { x: 1050, z: 2000 }), width: 900, depth: 1300 }
  const passage: Passage = { origin: { x: 2200, z: 1700 }, axis: 'x', minimum: 2000, headroom: 2000 }
  project.items = [wardrobe, bed]
  project.passage = passage
  const edges = roomEdges(project.walls)
  const [closed, saved, open] = passageReadings(project, passage, edges, project.items)
  assert.equal(closed.width, 2700)
  assert.equal(saved.width, closed.width)
  assert.ok(open.width < passage.minimum && open.width > 1200)
  const projected = passageReadings(project, passage, edges, [wardrobe, { ...bed, x: bed.x + 150 }])
  assert.equal(projected[0].width, 2550)
  const restored = readProject(JSON.parse(JSON.stringify(project)))
  assert.deepEqual(restored.passage, passage)
  assert.equal(restored.items[0].wardrobe?.pose, 'closed')
})

test('passage follows the nearest concave boundary and respects overhead items and the room door', () => {
  const project = makeProject(false)
  project.walls = [makeWall(0, 4000), makeWall(1, 1600), makeWall(2, 1500),
    makeWall(1, 1600), makeWall(2, 2500), makeWall(3, 3200)]
  const first = project.walls[0]
  first.openings.push({ id: 'swing', kind: 'door', offset: 900, width: 950, bottom: 0, height: 2050,
    swing: { hinge: 'start', angle: 90 } })
  const edges = roomEdges(project.walls)
  const cabinet = wallMountPose(makeMountedFurniture('wall-cabinet', first.id, 2400, project.height), edges)
  project.items = [cabinet]
  const line: Passage = { origin: { x: 1800, z: 240 }, axis: 'x', minimum: 650, headroom: 1300 }
  const [closed, saved, open] = passageReadings(project, line, edges, project.items)
  assert.equal(closed.width, 4000)
  assert.ok(saved.width < closed.width && saved.width === open.width)
  const tall = passageReadings(project, { ...line, headroom: 2000 }, edges, project.items)
  assert.equal(tall[0].width, 2000)
  const far = passageReadings(project, { ...line, origin: { x: 1600, z: 2300 } }, edges, project.items)
  assert.equal(far[0].width, 2500)
  const [leaf] = sceneData(project).doors
  assert.equal(leaf.wallId, first.id)
  assert.ok(Math.abs(leaf.angle! - Math.PI / 2) < 1e-6)
})
