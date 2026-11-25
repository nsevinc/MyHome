import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeDesign, designScene, dropUnusedDesignItems, duplicateDesign, editDesignItem, editDesignSurface,
  originalDesign, saveDesignPresentation } from '../src/design-variants'
import { duplicateLayout, layoutScene } from '../src/layout-variants'
import { makeProject, projectTextures } from '../src/model'
import { defaultCamera, sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'

test('designs override only the appearance of whichever layout is rendered', () => {
  const original = makeProject()
  const cabinet = original.items[2]
  const first = duplicateDesign(original, originalDesign, 'Meşe')
  const firstId = activeDesign(first)
  const oak = editDesignItem(first, firstId, undefined, cabinet.id,
    paint => ({ ...paint, appearances: { doors: { preset: 'matte-oak', color: '#c29971' } } }))
  const copy = duplicateDesign(oak, firstId, 'Koyu')
  const secondId = activeDesign(copy)
  const dark = editDesignItem(copy, secondId, undefined, cabinet.id,
    paint => ({ ...paint, appearances: { doors: { preset: 'matte-oak', color: '#593c2b' } } }))
  const withLayout = duplicateLayout(dark)!
  const moved = { ...withLayout, items: withLayout.items.map(item => item.id === cabinet.id ? { ...item, x: 3750 } : item) }
  const restored = readProject(JSON.parse(JSON.stringify(moved)))
  const current = designScene(restored)
  const inactive = designScene(layoutScene(restored, restored.layouts?.entries[0].id), firstId)
  assert.equal(current.items[2].x, 3750)
  assert.equal(inactive.items[2].x, cabinet.x)
  assert.equal(current.items[2].appearances?.doors?.color, '#593c2b')
  assert.equal(inactive.items[2].appearances?.doors?.color, '#c29971')
  assert.deepEqual(designScene(restored, originalDesign).items, restored.items)
  assert.deepEqual(restored.walls, original.walls)
  assert.equal(sceneData(restored).items[2].fallback.find(box => box.slot === 'doors')?.color,
    sceneData(current).items[2].fallback.find(box => box.slot === 'doors')?.color)
  const removed = dropUnusedDesignItems({ ...restored, items: [], layouts: undefined })
  assert.ok(removed.designs?.entries.every(entry => entry.items.length === 0))
})

test('saving a design assigns materials to that design and keeps lighting and camera shared', () => {
  const original = makeProject()
  const copy = duplicateDesign(original, originalDesign, 'Mat zemin')
  const id = activeDesign(copy)
  const design = editDesignSurface(copy, id, { floorFinish: undefined, floor: '#122233' })
  const restored = readProject(JSON.parse(JSON.stringify(design)))
  const scene = designScene(restored)
  assert.equal(scene.style.floorFinish, undefined)
  const camera = defaultCamera(original, true)
  const saved = saveDesignPresentation(restored, id, { camera, cameraViews: [], style: {
    ...scene.style, wallFinish: 'concrete', light: 'evening',
  } })
  assert.equal(saved.style.floor, original.style.floor)
  assert.equal(saved.style.floorFinish, original.style.floorFinish)
  assert.equal(saved.style.wallFinish, original.style.wallFinish)
  assert.equal(saved.style.light, 'evening')
  assert.deepEqual(saved.camera, camera)
  assert.equal(designScene(saved).style.wallFinish, 'concrete')
  assert.equal(designScene(saved).style.floor, '#122233')
  assert.throws(() => readProject(editDesignSurface(saved, id, { floorTexture: {
    data: 'data:image/png;base64,Ym9ndXM=', name: 'Bozuk PNG', tileMm: 500,
  } })))
})

test('Roughness and normal maps remain attached to wall surfaces and cabinet doors after export', () => {
  const original = makeProject()
  const cabinet = original.items[2]
  const [wall] = original.walls
  const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV0AAAAASUVORK5CYII='
  const roughnessMap = { tileMm: 400, data, name: 'matlık.png' }
  const normalMap = { tileMm: 400, data, name: 'normal.png' }
  const appearance = { preset: 'original' as const, tileMm: 120, roughnessMap, normalMap }
  let design = duplicateDesign(original, originalDesign, 'Farklı yüzeyler')
  design = editDesignItem(design, activeDesign(design), undefined, cabinet.id,
    paint => ({ ...paint, appearances: { doors: appearance } }))
  design = editDesignSurface(design, activeDesign(design), { wallCoverings: { [wall.id]: { base: appearance, regions: [] } } })
  const restored = readProject(JSON.parse(JSON.stringify(design)))
  const rendered = sceneData(restored)
  assert.equal(projectTextures(restored).length, 4)
  assert.deepEqual(rendered.items[2].fallback.find(box => box.slot === 'doors')?.appearance, appearance)
  const covered = rendered.boxes.find(box => 'wallCovering' in box && box.wallCovering)
  assert.deepEqual(covered?.appearance, { ...appearance, preset: 'plain', texture: undefined, color: undefined, relief: undefined })
  assert.equal(rendered.items[2].fallback.find(box => box.slot === 'body')?.appearance, undefined)
  assert.deepEqual(designScene(restored, originalDesign).items, original.items)
})
