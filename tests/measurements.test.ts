import assert from 'node:assert/strict'
import { test } from 'node:test'
import { elevationData, sizeInCm } from '../src/elevation-data'
import { attachToWall, roomEdges } from '../src/geometry'
import { duplicateLayout, layoutScene } from '../src/layout-variants'
import { readMeasurements, savedMeasurements } from '../src/measurements'
import { makeFurniture, makeMountedFurniture, makeProject } from '../src/model'
import { imagePdf } from '../src/pdf-image-document'
import { readProject } from '../src/storage'

test('legacy passages are preserved and new linked and fixed measurements coexist across layouts', () => {
  const project = makeProject(false)
  project.passage = { origin: { x: 2200, z: 1700 }, axis: 'x', minimum: 800, headroom: 2000 }
  const [passage] = savedMeasurements(project)
  assert.equal(passage.kind, 'passage')
  const a = makeFurniture('box', { x: 900, z: 1050 })
  const b = makeFurniture('box', { x: 1650, z: 1050 })
  project.items = [a, b]
  project.measurements = [passage,
    { kind: 'gap', id: 'gap', name: 'Eşya arası', sourceId: a.id, targetId: b.id },
    { kind: 'height', id: 'height', name: 'Tavan altında', sourceId: a.id },
    { ...passage, id: 'passage-2', name: 'İkinci geçiş' },
  ]
  project.passage = undefined
  assert.deepEqual(readMeasurements(project).map(r => r.text), ['420 cm', '15 cm', '205 cm', '420 cm'])
  const copy = duplicateLayout(project)!
  const [first, second] = copy.layouts!.entries
  copy.items = [{ ...a, height: 1000, x: 1020 }, b]
  assert.deepEqual(readMeasurements(layoutScene(copy, second.id)).map(r => r.text), ['420 cm', '3 cm', '165 cm', '420 cm'])
  assert.equal(readMeasurements(layoutScene(copy, first.id))[1].text, '15 cm')
  const saved = readProject(JSON.parse(JSON.stringify(copy)))
  assert.deepEqual(saved.measurements, project.measurements)
  saved.items = [b]
  assert.equal(readMeasurements(saved)[1].text, 'Eşya bu yerleşimde eksik')
})

test('an attached beam shows vertical clearance only when furniture overlaps its plan footprint', () => {
  const project = makeProject(true)
  const wall = project.walls[1]
  const beam = wall.obstacles[0]
  const wardrobe = project.items.find(item => item.kind === 'wardrobe')!
  project.measurements = [{ kind: 'height', id: 'beam-gap', name: 'Kiriş altı', sourceId: wardrobe.id, obstacleId: beam.id }]
  assert.equal(readMeasurements(project)[0].text, '5 cm')
  wardrobe.height = 2300
  assert.equal(readMeasurements(project)[0].text, '5 cm çakışma')
  wardrobe.z = 2550
  assert.equal(readMeasurements(project)[0].text, 'Yatay iz dışında')
})

test('wall projections share the resolved mount origins and elevations with the editor and PDF', () => {
  const project = makeProject(false)
  const edges = roomEdges(project.walls)
  const mount = { wallId: edges[1].wall.id, offset: 1050, bottom: 120 }
  const radiator = attachToWall(makeMountedFurniture('radiator', mount.wallId, mount.offset, project.height), mount, edges)
  const cabinet = makeMountedFurniture('wall-cabinet', edges[0].wall.id, 1800, project.height)
  project.items = [radiator, cabinet]
  const [mounted] = elevationData(project, edges[1], edges).mounted
  assert.equal(mounted.item.id, radiator.id)
  assert.equal(mounted.center, 1050)
  assert.equal(mounted.left, 600)
  assert.equal(mounted.bottom, 120)
  assert.equal(mounted.top, 670)
  assert.equal(sizeInCm(mounted.item), '90 × 11,2 × 55')
  assert.equal(elevationData(project, edges[0], edges).mounted[0].item.id, cabinet.id)
})

test('downloadable PDF cross references point to the object offsets and declare landscape A4', async () => {
  const pdf = imagePdf([{ jpeg: new Uint8Array([255, 216, 255, 217]), width: 2, height: 2 }])
  const bytes = Buffer.from(await pdf.arrayBuffer())
  const content = bytes.toString('latin1')
  assert.equal(pdf.type, 'application/pdf')
  assert.match(content, /\/MediaBox \[0 0 841\.88976 595\.27559\]/)
  const xref = Number(content.match(/startxref\n(\d+)/)![1])
  assert.equal(content.slice(xref, xref + 4), 'xref')
  const offsets = [...content.slice(xref).matchAll(/^(\d{10}) 00000 n/mg)].map(match => Number(match[1]))
  offsets.forEach((offset, index) => assert.equal(content.slice(offset, offset + 7), `${index + 1} 0 obj`))
})
