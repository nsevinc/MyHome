import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeDesign, designScene, duplicateDesign, editDesignItem } from '../src/design-variants'
import { roomEdges, validateProject } from '../src/geometry'
import { duplicateLayout, layoutScene } from '../src/layout-variants'
import { makeMountedFurniture, makeProject, makeWideBed } from '../src/model'
import { addWallMountCopy, newMountSymmetry, wallCopyPreview, wallMovePreview, wallSymmetryOptions, wallSymmetryPreview } from '../src/wall-mount-edit'
import { electricalReadings, newElectricalPoint } from '../src/electrical-points'
import { suggestWallSymmetry } from '../src/wall-symmetry-ranges'

test('Wall elevation reports the remaining beam clearance and rejects a conflicting height', () => {
  const project = makeProject(false)
  const [wall] = project.walls
  wall.obstacles.push({ id: 'beam', name: 'Kiriş', offset: 800, width: 1100, depth: 300, bottom: 2200, top: 2650 })
  const lamp = makeMountedFurniture('sconce', wall.id, 1200, project.height)
  project.items = [lamp]
  const edges = roomEdges(project.walls)
  const clear = wallMovePreview(project, lamp, 'bottom', 1890, edges, 50)!
  assert.equal(clear.item.mount!.bottom, 1900)
  assert.equal(clear.item.mount!.offset, lamp.mount!.offset)
  assert.equal(clear.clearance, 40)
  assert.equal(clear.obstruction, 'Kiriş')
  assert.equal(clear.blocked, undefined)
  assert.match(wallMovePreview(project, lamp, 'bottom', 2000, edges)!.blocked!, /Kiriş ile 6 cm çakışma/)
  assert.equal(wallMovePreview(project, { ...lamp, locked: true }, 'bottom', 1650, edges), undefined)
  assert.equal(lamp.mount!.bottom, 1550)
})

test('Horizontal wall movement snaps the centre, preserves the elevation and updates the room pose', () => {
  const project = makeProject(false)
  const edges = roomEdges(project.walls)
  const lamp = makeMountedFurniture('sconce', edges[1].wall.id, 700, project.height)
  project.items = [lamp]
  const next = wallMovePreview(project, lamp, 'offset', 1022, edges, 50)!
  assert.deepEqual(next.item.mount, { ...lamp.mount, offset: 1000 })
  assert.equal(next.item.z, 1000)
  assert.equal(next.item.angle, 90)
  assert.equal(next.blocked, undefined)
  assert.equal(wallMovePreview(project, lamp, 'offset', -30, edges)!.item.mount!.offset, lamp.width / 2)
})

test('Symmetry projects the bed centre, reports both mirror collisions and preserves mounting heights', () => {
  const project = makeProject(false)
  const [wall] = project.walls
  const bed = makeWideBed({ x: 2050, z: 1040 })
  const mirror = { ...makeMountedFurniture('mirror', wall.id, 2050, project.height), width: 650, height: 740 }
  const left = makeMountedFurniture('sconce', wall.id, 1500, project.height)
  const right = { ...makeMountedFurniture('sconce', wall.id, 2750, project.height), name: 'İkinci aplik' }
  project.items = [bed, mirror, left, right]
  const original = structuredClone(project)
  const edges = roomEdges(project.walls)
  const start = newMountSymmetry(wallSymmetryOptions(project, edges[0], edges), wall.id)!
  assert.equal(start.referenceId, bed.id)
  const blocked = wallSymmetryPreview(project, { ...start, distance: 400 })
  assert.match(blocked.left?.blocked ?? '', /Ayna|ayna/)
  assert.match(blocked.right?.blocked ?? '', /Ayna|ayna/)
  const clear = wallSymmetryPreview(project, { ...start, distance: 550 })
  assert.equal(clear.center, 2050)
  assert.deepEqual(clear.items.map(item => item.mount!.offset), [1500, 2600])
  assert.deepEqual(clear.items.map(item => item.mount!.bottom), [1550, 1550])
  assert.equal(clear.left?.mirrorGap, 125)
  assert.equal(clear.right?.mirrorGap, 125)
  assert.equal(clear.left?.blocked, undefined)
  assert.equal(clear.right?.blocked, undefined)
  assert.ok(wallSymmetryPreview(project, { ...start, referenceId: left.id }).error)
  assert.deepEqual(project, original)
})

test('Symmetry validates the two new positions simultaneously and keeps an odd wall centre exact', () => {
  const project = makeProject(false)
  project.walls[0].length = project.walls[2].length = 4201
  const [wall] = project.walls
  const left = makeMountedFurniture('sconce', wall.id, 1599, project.height)
  const right = makeMountedFurniture('sconce', wall.id, 2602, project.height)
  project.items = [left, right]
  const swapped = wallSymmetryPreview(project, { wallId: wall.id, leftId: right.id, rightId: left.id, referenceId: '', distance: 501 })
  assert.deepEqual(swapped.items.map(item => item.mount!.offset), [1599, 2602])
  assert.equal(swapped.center, 2100.5)
  assert.equal(swapped.left?.blocked, undefined)
  assert.equal(swapped.right?.blocked, undefined)
})

test('Symmetry suggestions match both fixed cable feeds and report a broken match after a reference move', () => {
  const project = makeProject(false)
  const [wall] = project.walls
  const bed = makeWideBed({ x: 2050, z: 1040 })
  const left = makeMountedFurniture('sconce', wall.id, 1500, project.height)
  const right = makeMountedFurniture('sconce', wall.id, 2600, project.height)
  project.items = [bed, left, right]
  wall.electricalPoints = [1500, 2600].map(offset =>
    ({ ...newElectricalPoint(wall, project.height, 'light-feed'), offset, height: 1680 }))
  const setup = { wallId: wall.id, leftId: left.id, rightId: right.id, referenceId: bed.id, distance: 550 }
  assert.deepEqual(suggestWallSymmetry(project, setup, true).ranges, [{ min: 510, max: 590 }])
  for (const distance of [509, 510, 590, 591]) {
    const { items } = wallSymmetryPreview(project, { ...setup, distance })
    const readings = electricalReadings({ ...project, items: [bed, ...items] })
    assert.equal(readings.every(row => row.status === 'passed'), distance === 510 || distance === 590)
  }
  const moved = { ...project, items: [{ ...bed, x: 2150 }, left, right] }
  assert.match(suggestWallSymmetry(moved, setup, true).reason ?? '', /ortak bir simetrik aralık/)
  assert.ok(suggestWallSymmetry(moved, setup, false).ranges.length > 0)
})

test('Symmetry suggestions exclude the entire distance gap around a narrow opening', () => {
  const project = makeProject(false)
  const [wall] = project.walls
  wall.openings.push({ id: 'opening', kind: 'window', offset: 2698, width: 10, bottom: 1500, height: 500 })
  const left = makeMountedFurniture('sconce', wall.id, 1500, project.height)
  const right = makeMountedFurniture('sconce', wall.id, 2700, project.height)
  project.items = [left, right]
  const setup = { wallId: wall.id, leftId: left.id, rightId: right.id, referenceId: '', distance: 600 }
  const { ranges } = suggestWallSymmetry(project, setup, false)
  assert.equal(ranges.length, 2)
  const edges = roomEdges(project.walls)
  for (let distance = 1; distance <= wall.length / 2; distance++) {
    const result = wallSymmetryPreview(project, { ...setup, distance }, edges)
    const clear = result.items.length === 2 && !result.left?.blocked && !result.right?.blocked
    assert.equal(ranges.some(({ min, max }) => distance >= min && distance <= max), clear, `distance ${distance} mm`)
  }
})

test('A wall copy keeps the exact centre distance, elevations and appearance across design variants', () => {
  const base = makeProject(false)
  const lamp = makeMountedFurniture('sconce', base.walls[0].id, 900, base.height)
  base.items = [lamp]
  const project = duplicateDesign(duplicateLayout(base)!, '', 'Koyu')
  const design = activeDesign(project)
  const painted = editDesignItem(project, design, project.layouts!.active, lamp.id, appearance => ({ ...appearance, color: '#214a3a' }))
  const options = { id: 'fixture-copy', sourceId: lamp.id, direction: 1 as const, distance: 735 }
  const preview = wallCopyPreview(designScene(painted), lamp, options)
  assert.equal(preview.blocked, undefined)
  assert.equal(preview.item?.mount?.offset, 1635)
  assert.equal(preview.item?.mount?.bottom, 1550)
  const next = addWallMountCopy(painted, lamp.id, preview.item!)
  assert.deepEqual(next.items[0], lamp)
  assert.deepEqual(layoutScene(next, next.layouts!.entries[0].id).items, [lamp])
  assert.deepEqual(next.items[1].fixture, lamp.fixture)
  assert.equal(designScene(next).items[1].color, '#214a3a')
  assert.equal(validateProject(next), undefined)
  assert.match(wallCopyPreview(painted, lamp, { ...options, direction: -1, distance: 895 }).blocked!, /duvar sınırını/)
  assert.match(wallCopyPreview(painted, lamp, { ...options, distance: 50 }).blocked!, /örtüşüyor/)
})
