import assert from 'node:assert/strict'
import { test } from 'node:test'
import { footprint, roomEdges, wallMountPose } from '../src/geometry'
import { alignFurniture, equalizeMountHeight, movementAxes, spaceFurniture, translateFurniture } from '../src/group-placement'
import { makeFurniture, makeMountedFurniture, makeProject } from '../src/model'
import { toggleItemSelection } from '../src/selection'
import { readProject } from '../src/storage'

test('shift selection retains the first reference and returns to single selection when toggled', () => {
  const single = toggleItemSelection({ kind: 'room' }, 'bed')
  const multiple = toggleItemSelection(single, 'rug')
  assert.deepEqual(multiple, { kind: 'items', ids: ['bed', 'rug'] })
  assert.deepEqual(toggleItemSelection(multiple, 'bed'), { kind: 'item', id: 'rug' })
})

test('group movement preserves offsets and clamps same-wall members together', () => {
  const project = makeProject(false)
  const first = makeMountedFurniture('sconce', project.walls[0].id, 1000, project.height)
  const second = makeMountedFurniture('sconce', project.walls[0].id, 3000, project.height)
  const edges = roomEdges(project.walls)
  const group = [first, second]
  project.items = group
  const moved = translateFurniture(project, group.map(item => item.id), first.id, { x: 2800, z: 1800 })
  assert.deepEqual(moved.map(item => item.mount?.offset), [2100, 4100])
  assert.equal(moved[0].z, moved[1].z)
  project.items[1] = { ...second, locked: true }
  assert.deepEqual(translateFurniture(project, group.map(item => item.id), first.id, { x: 2800, z: 1800 }), [])
  assert.deepEqual(movementAxes([first, makeFurniture('table', { x: 1000, z: 1000 })], edges), [])
})

test('alignment uses actual rotated edges and equal spacing keeps the outside positions', () => {
  const project = makeProject(false)
  const edges = roomEdges(project.walls)
  const first = makeFurniture('table', { x: 850, z: 950 })
  const second = { ...makeFurniture('table', { x: 1950, z: 1050 }), angle: 30, width: 320 }
  const third = makeFurniture('table', { x: 3375, z: 990 })
  const aligned = alignFurniture([first, second, third], edges, 'z', 'start')!
  assert.ok(aligned.every(item => Math.abs(footprint(item).z - footprint(first).z) <= .5))
  const spaced = spaceFurniture(aligned, edges, 'x')!
  assert.equal(spaced[0].x, first.x)
  assert.equal(spaced[2].x, third.x)
  const [a, b, c] = spaced.map(footprint)
  assert.ok(Math.abs((b.x - a.x - a.width) - (c.x - b.x - b.width)) <= 1 + 1e-7)
})

test('altitude copies the first mount without changing horizontal location and lock flags persist', () => {
  const project = makeProject(false)
  const first = makeMountedFurniture('sconce', project.walls[0].id, 1050, project.height)
  const mirror = makeMountedFurniture('mirror', project.walls[1].id, 800, project.height)
  const edges = roomEdges(project.walls)
  const [one, two] = equalizeMountHeight([first, mirror])!
  assert.equal(two.mount?.bottom, one.mount?.bottom)
  assert.equal(wallMountPose(two, edges).x, wallMountPose(mirror, edges).x)
  project.items = [{ ...one, locked: true }, two]
  project.walls[0].locked = true
  const reopened = readProject(JSON.parse(JSON.stringify(project)))
  assert.ok(reopened.items[0].locked && reopened.walls[0].locked)
  assert.equal(equalizeMountHeight(reopened.items), undefined)
})
