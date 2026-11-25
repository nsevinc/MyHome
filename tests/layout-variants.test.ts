import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateMediaSize, validateProject } from '../src/geometry'
import { defaultLayoutPair, duplicateLayout, editLayoutItems, layoutReport, layoutScene, renameLayout, switchLayout } from '../src/layout-variants'
import { makeFurniture, makeProject, makeWardrobe, maxLayouts } from '../src/model'
import type { Project } from '../src/model'
import { readProject } from '../src/storage'

test('duplicating and switching layouts keeps independent furniture and shared room, passage and camera', () => {
  const project = makeProject()
  project.passage = { origin: { x: 2700, z: 2100 }, axis: 'x', minimum: 950, headroom: 2000 }
  const copy = duplicateLayout(project)!
  const [first, second] = copy.layouts!.entries
  assert.deepEqual(defaultLayoutPair(copy), [first.id, second.id])
  assert.notStrictEqual(copy.items, project.items)
  assert.deepEqual(copy.items, first.items)
  const changed = { ...copy, items: copy.items.map(item => item.kind === 'sofa' ? { ...item, x: 1900 } : item) }
  const renamed = renameLayout(changed, second.id, 'Alternatif düzen')
  const original = switchLayout(renamed, first.id)
  assert.strictEqual(original.items, project.items)
  const camera: Project['camera'] = { position: [1, 1.4, 1], target: [2.2, 1.1, 2.1], fov: 55 }
  const reopened = switchLayout(readProject(JSON.parse(JSON.stringify({ ...original, camera }))), second.id)
  assert.equal(reopened.items.find(item => item.kind === 'sofa')?.x, 1900)
  assert.equal(reopened.layouts?.entries[1].name, 'Alternatif düzen')
  assert.deepEqual(reopened.camera, camera)
  assert.deepEqual(reopened.passage, project.passage)
  assert.deepEqual(reopened.walls, project.walls)
  const completedInBackground = editLayoutItems(reopened, first.id, items => items.map(item => ({ ...item, color: '#667799' })))
  assert.strictEqual(completedInBackground.items, reopened.items)
  assert.equal(switchLayout(completedInBackground, first.id).items[0].color, '#667799')
  assert.strictEqual(editLayoutItems(reopened, 'missing', items => items), reopened)
  assert.deepEqual(readProject(project), project)
})

test('saved alternatives validate and count embedded media in every furniture list', () => {
  const project = makeProject()
  const copy = duplicateLayout(project)!
  const invalid = structuredClone(copy)
  invalid.layouts!.entries[0].items![0].id = project.walls[0].id
  assert.match(validateProject(invalid)!, /benzersiz/)
  assert.throws(() => readProject({ ...copy, layouts: { ...copy.layouts, active: 'missing' } }))
  const untrusted = structuredClone(copy)
  const item = untrusted.layouts!.entries[0].items![0]
  item.kind = 'model'
  item.model = { source: 'upload', data: 'data:model/gltf-binary;base64,AAAA' }
  assert.throws(() => readProject(untrusted))
  const large = 'A'.repeat(9_000_000)
  const withAssets: Project = { ...project, items: project.items.map(item => ({ ...item, kind: 'model',
    model: { source: 'upload', data: large } })) }
  assert.equal(validateMediaSize(withAssets), undefined)
  assert.match(validateMediaSize(duplicateLayout(withAssets)!)!, /boyutu sınırına/)
  let variants = copy
  while (variants.layouts!.entries.length < maxLayouts) variants = duplicateLayout(variants)!
  assert.equal(duplicateLayout(variants), undefined)
})

test('the same passage distinguishes hinged and sliding alternatives and render receives only selected furniture', () => {
  const project = makeProject(false)
  const wardrobe = { ...makeWardrobe(1, { x: 3200, z: 1000 }), width: 1000 }
  project.items = [wardrobe, { ...makeFurniture('bed', { x: 1050, z: 2000 }), width: 900, depth: 1300 }]
  project.passage = { origin: { x: 2200, z: 1700 }, axis: 'x', minimum: 2000, headroom: 2000 }
  const copy = duplicateLayout(project)!
  const [a, b] = copy.layouts!.entries
  const changed: Project = { ...copy, items: [{ ...wardrobe, wardrobe: {
    ...wardrobe.wardrobe!, doors: 2, motion: 'sliding', pose: 'open',
  } }, copy.items[1]] }
  const first = layoutScene(changed, a.id)
  const second = layoutScene(changed, b.id)
  assert.equal(first.layouts, undefined)
  assert.equal(second.layouts, undefined)
  assert.strictEqual(first.walls, second.walls)
  assert.strictEqual(first.style, second.style)
  assert.strictEqual(first.passage, second.passage)
  assert.ok(layoutReport(first).measurements.find(reading => 'modes' in reading)!.modes[2].width < 1500)
  assert.equal(layoutReport(second).measurements.find(reading => 'modes' in reading)!.modes[2].width, 2700)
  const actualBeam = makeProject()
  actualBeam.items.find(item => item.kind === 'wardrobe')!.height = 2300
  assert.equal(layoutReport(actualBeam).structuralWarnings[0].message, 'Tavan kirişi ile 5 cm çakışma.')
})
