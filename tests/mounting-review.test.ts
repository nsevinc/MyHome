import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicateLayout, layoutScene } from '../src/layout-variants'
import { makeFurniture, makeProject, makeWardrobe, uid } from '../src/model'
import { mountingCodes } from '../src/mounting-codes'
import { mountingReview } from '../src/mounting-review'
import { resolveRenderScene } from '../src/render-scenes'
import { defaultCamera } from '../src/scene-data'

test('The review distinguishes fit from assembly, links the matching cut, and lists missing records', () => {
  const project = makeProject(false)
  const wardrobe = { ...makeWardrobe(2, { x: 1250, z: 301 }), height: 2200 }
  project.items = [wardrobe]
  project.walls[0].obstacles = [{ id: uid(), name: 'Tavan kirişi', offset: 500, width: 1500, depth: 650, bottom: 2250, top: 2600 }]
  const cut = uid()
  project.sections = [{ id: cut, name: 'Gardırop kesiti', axis: 'z', offset: 1250 }]
  const review = mountingReview(project)
  const read = (check: string) => review.find(row => row.check === check)!
  assert.equal(read('Yerleşim').status, 'passed')
  assert.equal(read('Yerde kurup kaldırma').status, 'warning')
  assert.match(read('Yerde kurup kaldırma').detail, /5 cm.*228,1 cm.*Tavan kirişi/)
  assert.deepEqual(read('Yerde kurup kaldırma').target, { kind: 'section', id: cut, itemId: wardrobe.id })
  assert.equal(read('Dik kurulum').status, 'passed')
  assert.equal(read('Taşıma rotası').status, 'pending')
  assert.match(read('Taşıma rotası').detail, /Rota bekliyor/)
  assert.equal(read('Saha ölçüleri').status, 'pending')
  assert.equal(read('Geçiş mesafesi').status, 'pending')
})

test('A corrected layout clears the drawer warning without changing the alternate layout', () => {
  const project = makeProject(false)
  const drawer = { ...makeFurniture('box', { x: 1100, z: 1000 }), width: 800, depth: 500, height: 600, drawerTravel: 500 }
  const blocker = { ...makeFurniture('box', { x: 1100, z: 1886 }), width: 600, depth: 400, height: 600 }
  project.items = [drawer, blocker]
  const alternate = duplicateLayout(project)!
  alternate.items = [drawer, { ...blocker, x: 2900 }]
  const [before, after] = alternate.layouts!.entries.map(entry =>
    mountingReview(layoutScene(alternate, entry.id)).find(row => row.check === 'Çekmece')!)
  assert.equal(before.status, 'warning')
  assert.match(before.detail, /42 cm.*8 cm eksik/)
  assert.deepEqual(before.target, { kind: 'motion', id: drawer.id, partId: 'drawer', amount: 500 })
  assert.equal(after.status, 'passed')
})

test('The PDF revision follows checks while the render code follows physical layout', async () => {
  const project = makeProject(false)
  const camera = { id: uid(), name: 'Kadraj', camera: defaultCamera(project, true) }
  const wardrobe = makeWardrobe(2, { x: 1200, z: 301 })
  project.cameraViews = [camera]
  project.items = [wardrobe]
  const codes = await mountingCodes(project)
  const frame = resolveRenderScene(project, { id: uid(), name: 'Akşam', light: 'evening', cameraId: camera.id, fixtures: [] }).frame!
  assert.equal((await mountingCodes(frame)).layout, codes.layout)
  const surveyed = { ...project, walls: project.walls.map((wall, index) => index === 0
    ? { ...wall, survey: { floor: wall.length, middle: wall.length, upper: wall.length, allowance: 10 } } : wall) }
  const newer = await mountingCodes(surveyed)
  assert.equal(newer.layout, codes.layout)
  assert.notEqual(newer.revision, codes.revision)
  assert.notEqual((await mountingCodes({ ...project, items: [{ ...wardrobe, x: 1250 }] })).layout, codes.layout)
})
