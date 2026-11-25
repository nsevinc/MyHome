import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { modelCatalog, makeCatalogFurniture, validateGlb } from '../src/catalog'
import { makeProject } from '../src/model'
import { readProject } from '../src/storage'

test('each catalog model is an embedded GLB with a lighter web variant', async () => {
  for (const { id } of modelCatalog) {
    const files = await Promise.all([
      readFile(new URL(`../public/models/${id}.v1.web.glb`, import.meta.url)),
      readFile(new URL(`../assets/models/${id}.v1.render.glb`, import.meta.url)),
    ])
    for (const file of files) assert.doesNotThrow(() => validateGlb(new Uint8Array(file)))
    const [web, render] = files.map(file => validateGlb(new Uint8Array(file)))
    assert.deepEqual(web.materials, render.materials, 'Both variants must share material indices')
    assert.ok(files[0].length < files[1].length)
  }
})

test('uploaded assets and catalog versions are portable', async () => {
  const project = makeProject(false)
  const example = makeCatalogFurniture('pera-console', { x: 600, z: 1600 })
  const file = await readFile(new URL('../public/models/luna-armchair.v1.web.glb', import.meta.url))
  const embedded = { ...example, id: 'embedded-chair', model: { source: 'upload' as const,
    data: `data:model/gltf-binary;base64,${file.toString('base64')}` } }
  project.items.push(example, embedded)
  assert.deepEqual(readProject(JSON.parse(JSON.stringify(project))), project)
  embedded.model.data = 'data:model/gltf-binary;base64,AAAA'
  assert.throws(() => readProject(project))
})
