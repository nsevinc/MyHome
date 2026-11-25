import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicateLayout, layoutScene, switchLayout } from '../src/layout-variants'
import { makeMountedFurniture, makeProject, makeWideBed, projectSchema } from '../src/model'
import { keepMountSymmetries } from '../src/mount-symmetry-data'
import { mountSymmetryRuleConflict, resolveMountSymmetries } from '../src/mount-symmetry-rules'

test('A saved rule repositions both lamps when the bed moves, checks the mirror, and preserves the saved project', () => {
  const project = makeProject(false)
  const wall = project.walls[0]
  const bed = makeWideBed({ x: 2050, z: 1040 })
  const mirror = { ...makeMountedFurniture('mirror', wall.id, 2050, project.height), width: 650, height: 740 }
  const left = makeMountedFurniture('sconce', wall.id, 1500, project.height)
  const right = makeMountedFurniture('sconce', wall.id, 2600, project.height)
  project.items = [bed, mirror, left, right]
  project.mountSymmetries = [{ id: 'pair', wallId: wall.id, leftId: left.id, rightId: right.id, referenceId: bed.id, distance: 550 }]
  const moveBed = (x: number) => ({ ...project, items: [{ ...bed, x }, mirror, left, right] })
  const valid = resolveMountSymmetries(project, moveBed(2150))!
  assert.equal(valid.error, undefined)
  assert.deepEqual(valid.items.map(item => item.mount!.offset), [1600, 2700])
  assert.deepEqual(valid.items.map(item => item.mount!.bottom), [1550, 1550])
  assert.deepEqual(valid.results.map(({ preview }) => [preview.left?.mirrorGap, preview.right?.mirrorGap]), [[25, 225]])
  assert.match(resolveMountSymmetries(project, moveBed(2210))!.error!, /ayna/i)
  const manual = { ...project, items: [bed, mirror, { ...left, mount: { ...left.mount!, offset: 1400 } }, right] }
  assert.match(resolveMountSymmetries(project, manual)!.error!, /kayıtlı simetri kuralı/)
  assert.equal(project.items[2].mount!.offset, 1500)
})

test('A rule follows its layout through copy, save and switch, and is removed when a participant is deleted', () => {
  const project = makeProject(false)
  const wall = project.walls[0]
  const left = makeMountedFurniture('sconce', wall.id, 1500, project.height)
  const right = makeMountedFurniture('sconce', wall.id, 2700, project.height)
  project.items = [left, right]
  const alt = duplicateLayout(project)!
  const entry = { id: 'pair', wallId: wall.id, leftId: left.id, rightId: right.id, referenceId: '', distance: 600 }
  alt.mountSymmetries = [entry]
  const first = alt.layouts!.entries[0].id
  const saved = projectSchema.parse(JSON.parse(JSON.stringify(alt)))
  const switched = switchLayout(saved, first)
  assert.equal(switched.mountSymmetries, undefined)
  assert.deepEqual(layoutScene(switched, saved.layouts!.active).mountSymmetries, [entry])
  assert.equal(keepMountSymmetries([entry], [left], project.walls), undefined)
  assert.ok(mountSymmetryRuleConflict([entry], { ...entry, id: 'existing-lamp' }))
})
