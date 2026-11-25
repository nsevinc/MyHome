import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { appearancePresets, materialSamples, textureBytes, textureLibrary, textureLibraryIds, texturePrefix } from '../src/materials'
import { makeProject, projectTextures } from '../src/model'
import { readProject } from '../src/storage'

test('Every ready texture is bundled and small textile repeat widths survive a portable project', () => {
  const embedded = textureLibraryIds.map(libraryId => {
    const contents = readFileSync(new URL(`../public/textures/${libraryId}.png`, import.meta.url))
    const sample = textureLibrary[libraryId]
    const data = texturePrefix + contents.toString('base64')
    assert.deepEqual(textureBytes(data), new Uint8Array(contents))
    return { libraryId, name: sample.label, originalColors: false, tileMm: sample.tileMm, data }
  })
  for (const preset of appearancePresets) {
    const texture = materialSamples[preset].textureId
    if (texture) assert.ok(embedded.some(row => row.libraryId === texture))
  }
  const project = makeProject()
  const cotton = embedded.find(texture => texture.libraryId === 'cotton')!
  project.items[0].appearances = { all: { preset: 'cotton', roughness: .84, texture: cotton } }
  const restored = readProject(JSON.parse(JSON.stringify(project)))
  assert.deepEqual(projectTextures(restored), [cotton])
  assert.equal(restored.items[0].appearances?.all?.texture?.tileMm, 65)
})
