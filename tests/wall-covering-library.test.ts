import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeDesign, designScene, duplicateDesign, editDesignSurface, originalDesign } from '../src/design-variants'
import { makeProject } from '../src/model'
import type { Furniture, WallCovering } from '../src/model'
import { makePersonalFurniture, personalModelFrom } from '../src/personal-library'
import { sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'
import { replaceWallCovering, wallCoveringCells } from '../src/wall-coverings'

const texture = { name: 'Kaplama', tileMm: 400, data:
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV0AAAAASUVORK5CYII=' }

test('wall finish clips openings and later regions override the preceding finish', () => {
  const project = makeProject()
  const wall = project.walls[0]
  const opening = wall.openings[0]
  const finish: WallCovering = {
    base: { preset: 'plain', color: '#575767' },
    regions: [
      { id: 'oak', start: 900, width: 2400, bottom: 0, height: 1900, appearance: { preset: 'matte-oak' } },
      { id: 'brick', start: 1150, width: 1200, bottom: 450, height: 1600, appearance: { preset: 'tile', texture } },
    ],
  }
  project.style.wallCoverings = replaceWallCovering(project.style, wall.id, finish)
  const reopened = readProject(JSON.parse(JSON.stringify(project)))
  const cells = wallCoveringCells(reopened.style, wall, project.height)
  assert.equal(cells.reduce((total, cell) => total + cell.width * cell.height, 0), wall.length * project.height - opening.width * opening.height)
  assert.ok(cells.every(cell => cell.start >= opening.offset + opening.width || cell.start + cell.width <= opening.offset
    || cell.bottom >= opening.bottom + opening.height || cell.bottom + cell.height <= opening.bottom))
  const cell = cells.find(cell => cell.start <= 1600 && cell.start + cell.width >= 1700 && cell.bottom === 450)
  assert.equal(cell?.appearance.preset, 'tile')
  assert.ok(sceneData(reopened).boxes.some(box => box.wallCovering && box.appearance?.texture?.data === texture.data))
})

test('wall finishes and model presets survive as independent design and library data', () => {
  const project = duplicateDesign(makeProject(), originalDesign, 'Mavi duvar')
  const id = activeDesign(project), wallId = project.walls[0].id
  const copy = editDesignSurface(project, id, { wallCoverings: { [wallId]: { base: { preset: 'plain', color: '#445a7c' }, regions: [] } } })
  assert.equal(designScene(copy).style.wallCoverings?.[wallId].base?.color, '#445a7c')
  assert.equal(designScene(copy, originalDesign).style.wallCoverings, undefined)
  assert.deepEqual(copy.items, project.items)
  const chair: Furniture = { ...project.items[0], kind: 'model', width: 915, model: { source: 'catalog', id: 'luna-armchair', version: 1 },
    appearances: { all: { preset: 'plain', color: '#ab7654', scale: 1.6 } }, locked: true }
  const preset = personalModelFrom(chair)!
  const restored = makePersonalFurniture(preset, { x: 510, z: 620 })
  assert.equal(restored.width, 915)
  assert.equal(restored.appearances?.all?.scale, 1.6)
  assert.equal(restored.locked, undefined)
  assert.notEqual(restored.id, chair.id)
  assert.deepEqual(restored.model, chair.model)
})
