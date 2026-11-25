import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeFurniture, makeProject, makeWardrobe } from '../src/model'
import { compareRevisions } from '../src/revision-comparison'

test('Comparing revisions reveals movement, solved and new warnings, and measurements still needed', () => {
  const before = makeProject(false)
  const drawer = { ...makeFurniture('box', { x: 1100, z: 1000 }), width: 800, depth: 500, height: 600, drawerTravel: 500 }
  const blocker = { ...makeFurniture('box', { x: 1100, z: 1886 }), width: 600, depth: 400, height: 600 }
  before.items = [drawer, blocker]
  const after = { ...before, items: [drawer, { ...blocker, x: 2900 }] }
  const result = compareRevisions(before, after)
  assert.deepEqual(result.plan[0].changes, [{ label: 'Merkez X', before: '110 cm', after: '290 cm', delta: '+180 cm' }])
  const key = `${drawer.id}/motion/drawer`
  const bearing = result.checks.find(row => row.key === key)!
  assert.equal(bearing.kind, 'resolved')
  assert.equal(bearing.delta, 'Açılım eksiği −8 cm')
  assert.equal(bearing.before?.status, 'warning')
  assert.equal(bearing.after?.status, 'passed')
  assert.equal(compareRevisions(after, before).checks.find(row => row.key === key)?.kind, 'new-warning')
  assert.equal(result.checks.find(row => row.key === 'missing/passage')?.changed, false)
  const removed = compareRevisions(before, { ...before, items: [blocker] })
  assert.equal(removed.checks.find(row => row.key === key)?.kind, 'removed')
})

test('An assembly change retains the saved cut and includes partly entered survey measurements', () => {
  const before = makeProject(false)
  const wardrobe = { ...makeWardrobe(2, { x: 1250, z: 301 }), height: 2200 }
  before.items = [wardrobe]
  before.walls[0].obstacles = [{ id: 'beam', name: 'Tavan kirişi', offset: 500, width: 1500, depth: 650, bottom: 2250, top: 2600 }]
  before.walls[0].survey = { floor: 4200, allowance: 10 }
  before.sections = [{ id: 'cut', name: 'Gardırop kesiti', axis: 'z', offset: 1250 }]
  const after = { ...before, items: [{ ...wardrobe, height: 2100 }], walls: before.walls.map((wall, i) =>
    i === 0 ? { ...wall, survey: { floor: 4190, allowance: 10 } } : wall) }
  const result = compareRevisions(before, after)
  const assembly = result.checks.find(row => row.before?.check === 'Yerde kurup kaldırma')!
  assert.equal(assembly.kind, 'resolved')
  assert.deepEqual(assembly.before?.target, { kind: 'section', id: 'cut', itemId: wardrobe.id })
  assert.deepEqual(result.plan.find(row => row.key.startsWith('survey/'))?.changes,
    [{ label: 'Zemine yakın', before: '420 cm', after: '419 cm', delta: '−1 cm' }])
  assert.equal(result.checks.find(row => row.key.endsWith('/survey'))?.kind, 'pending')
})
