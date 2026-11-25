import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateProject } from '../src/geometry'
import { duplicateLayout, layoutScene, switchLayout } from '../src/layout-variants'
import { resolveLinkedPlacement } from '../src/linked-placement'
import { makeFurniture, makeProject } from '../src/model'
import type { FurnitureLink } from '../src/model'
import { findPlacements } from '../src/placement-search'
import { readProject } from '../src/storage'

function example() {
  const project = makeProject(false)
  const bed = { ...makeFurniture('bed', { x: 1600, z: 1600 }), name: 'Yatak', width: 1400, depth: 1700 }
  const rug = { ...makeFurniture('rug', { x: 1600, z: 1600 }), name: 'Halı' }
  const side = { ...makeFurniture('table', { x: 2600, z: 1600 }), name: 'Komodin', width: 400, depth: 400 }
  const link: FurnitureLink = { id: 'bed-side', referenceId: bed.id, itemId: side.id, x: { mode: 'after', gap: 100 }, z: { mode: 'center' } }
  project.items = [bed, rug, side]
  project.furnitureLinks = [link, { id: 'bed-rug', referenceId: bed.id, itemId: rug.id,
    x: { mode: 'center' }, z: { mode: 'center' } }]
  return { project, bed, rug, side, link }
}

test('A resized reference centers its rug and preserves the cabinet edge gap', () => {
  const { project, bed, rug, side } = example()
  const draft = { ...project, items: [{ ...bed, z: 1700, width: 1600 }, rug, side] }
  const preview = resolveLinkedPlacement(project, draft)!
  assert.equal(preview.error, undefined)
  assert.deepEqual(preview.project.items.map(item => [item.x, item.z]), [[1600, 1700], [1600, 1700], [2700, 1700]])
  assert.deepEqual(project.items.map(item => [item.x, item.z]), [[1600, 1600], [1600, 1600], [2600, 1600]])
})

test('Links can be chained, and a cycle is rejected in both previews and imports', () => {
  const { project, bed, rug, side } = example()
  const chain = { ...project, furnitureLinks: [project.furnitureLinks![1], { ...project.furnitureLinks![0], referenceId: rug.id }] }
  const move = resolveLinkedPlacement(chain, { ...chain, items: [{ ...bed, z: 1800 }, rug, side] })!
  assert.equal(move.error, undefined)
  assert.deepEqual(move.project.items.map(item => item.z), [1800, 1800, 1800])
  const invalid = { ...project, furnitureLinks: [...project.furnitureLinks!,
    { id: 'cycle', referenceId: side.id, itemId: bed.id, x: { mode: 'center' as const } }] }
  assert.match(resolveLinkedPlacement(project, invalid)!.error!, /döngü/)
  assert.throws(() => readProject(JSON.parse(JSON.stringify(invalid))), /döngü/)
})

test('A column or a locked dependent blocks the linked movement as a unit', () => {
  const { project, bed, rug, side } = example()
  project.walls[1].obstacles.push({ id: 'column', name: 'Sağ kolon', offset: 800,
    width: 1300, depth: 1000, bottom: 0, top: 2650 })
  const blocked = resolveLinkedPlacement(project, { ...project, items: [{ ...bed, x: 2300 }, rug, side] })!
  assert.match(blocked.error!, /Yatak → Komodin.*Sağ kolon/)
  assert.equal(project.items[0].x, 1600)
  const locked = { ...project, items: [bed, rug, { ...side, locked: true }] }
  assert.match(resolveLinkedPlacement(locked, { ...locked, items: [{ ...bed, z: 1650 }, ...locked.items.slice(1)] })!.error!,
    /Komodin.*kilitli/)
})

test('Alternative layouts archive their own rules and restore them from the project file', () => {
  const { project } = example()
  const copy = duplicateLayout(project)!
  const [original, alternative] = copy.layouts!.entries
  const changed = { ...copy, furnitureLinks: copy.furnitureLinks!.slice(1) }
  assert.equal(validateProject(changed), undefined)
  const reopened = readProject(JSON.parse(JSON.stringify(changed)))
  assert.equal(layoutScene(reopened, original.id).furnitureLinks?.length, 2)
  assert.equal(reopened.furnitureLinks?.length, 1)
  const prior = switchLayout(reopened, original.id)
  assert.equal(prior.furnitureLinks?.length, 2)
  assert.equal(switchLayout(prior, alternative.id).furnitureLinks?.length, 1)
})

test('Smart placement includes followers in its candidate positions', () => {
  const { project, bed, rug, side } = example()
  const { suggestions } = findPlacements(project, [bed.id], { radius: 500, rotate: false })
  assert.ok(suggestions.length > 0)
  for (const option of suggestions) {
    const items = new Map(option.items.map(item => [item.id, item]))
    assert.equal(items.get(side.id)?.x, side.x + option.dx)
    assert.equal(items.get(rug.id)?.z, rug.z + option.dz)
  }
})
