import assert from 'node:assert/strict'
import { test } from 'node:test'
import { angleFromDrag, dragWallTarget, movedPose, pointerAngle, wallDropWarning } from '../src/furniture-gestures'
import { attachToWall, roomEdges } from '../src/geometry'
import { furnitureAngle, makeCurtain, makeFurniture, makeMountedFurniture, makeProject } from '../src/model'

test('A drag across walls preserves mounting height and reorients the item, including equal offsets', () => {
  const project = makeProject(false)
  const edges = roomEdges(project.walls)
  const lamp = makeMountedFurniture('sconce', edges[0].wall.id, 1400, project.height)
  const source = attachToWall(lamp, lamp.mount!, edges)
  project.items = [source]

  const near = dragWallTarget(source, { x: 4160, z: 1400 }, edges, 180)
  assert.equal(near.destination?.wall.id, edges[1].wall.id)
  assert.equal(near.item.mount?.offset, source.mount?.offset)
  assert.equal(near.item.mount?.bottom, source.mount?.bottom)
  assert.equal(furnitureAngle(near.item), 90)
  assert.ok(movedPose(source, near.item))
  assert.equal(wallDropWarning(project, near.item, edges), undefined)
  assert.equal(dragWallTarget(source, { x: 3000, z: 1700 }, edges, 180).item.mount?.wallId, edges[0].wall.id)
  assert.equal(dragWallTarget({ ...source, locked: true }, { x: 4160, z: 1400 }, edges, 180).item.mount?.wallId, edges[0].wall.id)
})

test('A destination that overlaps an opening is flagged and a curtain keeps its window', () => {
  const project = makeProject(false)
  const opening = { kind: 'window' as const, id: 'right-window', offset: 900, width: 980, bottom: 900, height: 1150 }
  project.walls[1].openings.push(opening)
  const edges = roomEdges(project.walls)
  const source = makeMountedFurniture('sconce', project.walls[0].id, 1400, project.height)
  const target = dragWallTarget(source, { x: 4150, z: 1500 }, edges, 180)
  assert.equal(target.destination?.index, 1)
  assert.match(wallDropWarning(project, target.item, edges)!, /kapı veya pencere/)
  const curtain = makeCurtain(project.walls[1], opening, 'sheer', project.height)
  assert.equal(dragWallTarget(curtain, { x: 50, z: 1500 }, edges, 180).item, curtain)
})

test('Rotation keeps the pointer offset, snaps by 15 degrees and wraps the free angle', () => {
  const item = { ...makeFurniture('table', { x: 400, z: 700 }), angle: 15 }
  const offset = pointerAngle(item, { x: 600, z: 900 }) - furnitureAngle(item)
  const pointer = { x: 400, z: 1000 }
  assert.equal(angleFromDrag(item, pointer, offset, true), 60)
  assert.equal(angleFromDrag(item, pointer, offset + 3, false), 57)
  assert.equal(angleFromDrag(item, { x: 400, z: 400 }, offset, false), 240)
  assert.equal(movedPose(item, { ...item, angle: 15 }), false)
  assert.equal(movedPose(item, { ...item, angle: 60 }), true)
})
