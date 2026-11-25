import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeCatalogFurniture } from '../src/catalog'
import { nativeReplacementModels, previewFurnitureReplacement } from '../src/furniture-replacement'
import { footprint, validateProject } from '../src/geometry'
import { duplicateLayout, layoutScene } from '../src/layout-variants'
import { makeFurniture, makeMountedFurniture, makeProject, makeWideBed } from '../src/model'

function linkedBedroom() {
  const project = makeProject(false)
  const bed = { ...makeFurniture('bed', { x: 1500, z: 1600 }), width: 1700 }
  const rug = makeFurniture('rug', { x: 1500, z: 1600 })
  const nightstand = { ...makeFurniture('table', { x: 2650, z: 1600 }), width: 400, depth: 420 }
  project.items = [bed, rug, nightstand]
  project.furnitureLinks = [
    { id: 'center-rug', referenceId: bed.id, itemId: rug.id, x: { mode: 'center' }, z: { mode: 'center' } },
    { id: 'nightstand-gap', referenceId: bed.id, itemId: nightstand.id, x: { mode: 'after', gap: 100 }, z: { mode: 'center' } },
  ]
  return { project, bed, rug, nightstand }
}

test('Replacing the 170 cm bed preserves its identity and recomputes the linked furniture for 180 cm', () => {
  const { project, bed, rug, nightstand } = linkedBedroom()
  const wide = nativeReplacementModels(project, bed).find(item => item.kind === 'bed' && item.width === 1800)!
  assert.ok(wide)
  const result = previewFurnitureReplacement(project, bed, wide, 'model')
  assert.equal(result.error, undefined)
  assert.deepEqual([result.item.id, result.item.x, result.item.z, result.item.rotation], [bed.id, bed.x, bed.z, bed.rotation])
  assert.equal(result.item.width, 1800)
  assert.equal(result.project.furnitureLinks, project.furnitureLinks)
  const linkedRug = result.items.find(item => item.id === rug.id)!
  const linkedNightstand = result.items.find(item => item.id === nightstand.id)!
  assert.deepEqual([linkedRug.x, linkedRug.z], [bed.x, bed.z])
  assert.equal(linkedNightstand.x - nightstand.x, 50)
  assert.equal(footprint(linkedNightstand).x - (footprint(result.item).x + footprint(result.item).width), 100)

  const alternative = duplicateLayout(project, result.project.items)!
  const old = layoutScene(alternative, alternative.layouts!.entries[0].id)
  assert.equal(old.items[0].width, 1700)
  assert.equal(old.items[2].x, nightstand.x)
  assert.equal(alternative.items[0].width, 1800)
  assert.deepEqual(old.furnitureLinks, alternative.furnitureLinks)
  assert.equal(validateProject(alternative), undefined)
})

test('The existing size can be retained when choosing a catalog model', () => {
  const { project, nightstand } = linkedBedroom()
  const source = { ...nightstand, rotation: 1 as const, angle: 17, locked: undefined }
  project.items[2] = source
  project.furnitureLinks = undefined
  const model = makeCatalogFurniture('ada-side-table', { x: 0, z: 0 })
  const replacement = previewFurnitureReplacement(project, source, model, 'existing')
  assert.equal(replacement.error, undefined)
  assert.deepEqual(replacement.item.model, model.model)
  assert.deepEqual([replacement.item.id, replacement.item.rotation, replacement.item.angle, replacement.item.x, replacement.item.z],
    [source.id, source.rotation, source.angle, source.x, source.z])
  assert.deepEqual([replacement.item.width, replacement.item.depth, replacement.item.height], [source.width, source.depth, source.height])
})

test('A wider bed reports a linked collision and a wall fixture keeps its mounting details', () => {
  const { project, bed } = linkedBedroom()
  const blocker = { ...makeFurniture('box', { x: 3000, z: 1600 }), name: 'Çıkıntılı sandık', width: 250, depth: 370 }
  project.items.push(blocker)
  const result = previewFurnitureReplacement(project, bed, makeWideBed({ x: 0, z: 0 }), 'model')
  assert.match(result.error!, /Çıkıntılı sandık/)
  assert.equal(project.items[0].width, 1700)

  const room = makeProject(false)
  const wallId = room.walls[0].id
  const sconce = makeMountedFurniture('sconce', wallId, 1500, room.height)
  room.items = [sconce]
  const bar = nativeReplacementModels(room, sconce)[1]
  const mounted = previewFurnitureReplacement(room, sconce, bar, 'model')
  assert.equal(mounted.error, undefined)
  assert.equal(mounted.item.fixture?.variant, 'bar')
  assert.deepEqual(mounted.item.mount, sconce.mount)
  assert.equal(validateProject(mounted.project), undefined)
})
