import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placement, validateProject } from '../src/geometry'
import { makeFurniture, makeProject } from '../src/model'
import { previewTrimClearance } from '../src/trim-placement'
import { copyBaseboard, wallTrimPieces } from '../src/wall-trim'

test('Perpendicular clearance follows the actual contact above doors and below casing', () => {
  const project = makeProject(false)
  const wall = project.walls[0]
  wall.baseboard = { height: 90, depth: 16 }
  wall.openings = [
    { id: 'door', kind: 'door', offset: 300, width: 700, bottom: 0, height: 2050 },
    { id: 'window', kind: 'window', offset: 1700, width: 1000, bottom: 900, height: 1000,
      trim: { width: 70, depth: 18 } },
  ]
  const item = { ...makeFurniture('box', { x: 1400, z: 106 }), width: 200, depth: 200, height: 100 }
  assert.deepEqual(placement(project, item).trim.map(gap => [gap.kind, gap.distance, gap.start, gap.end]),
    [['baseboard', 10, 1300, 1500]])
  assert.equal(placement(project, { ...item, x: 650 }).trim.length, 0)
  assert.equal(placement(project, { ...item, z: 116 }).trim.length, 0)
  const tall = { ...item, x: 1600, height: 950 }
  assert.deepEqual(placement(project, tall).trim.map(gap => [gap.kind, gap.distance, gap.bottom, gap.top]),
    [['baseboard', 10, 0, 90], ['trim', 12, 900, 950], ['trim', 12, 830, 900]])
  const tilted = { ...item, z: 135, angle: 30 }
  assert.ok(placement(project, tilted).trim.length > 0)
  const preview = previewTrimClearance({ ...project, items: [tilted] }, tilted, wall.id, placement(project, tilted).trim)!
  assert.deepEqual(placement(preview.project, preview.items[0]).trim, [])
})

test('Clearance preview moves linked items, measures the passage and respects the recorded minimum', () => {
  const project = makeProject(false)
  const wall = project.walls[0]
  wall.baseboard = { height: 90, depth: 16 }
  const cabinet = { ...makeFurniture('box', { x: 900, z: 106 }), width: 200, depth: 200, height: 1300 }
  const linked = { ...makeFurniture('box', { x: 1700, z: 106 }), width: 100, depth: 100, height: 1300 }
  project.items = [cabinet, linked]
  project.furnitureLinks = [{ id: 'link', referenceId: cabinet.id, itemId: linked.id, z: { mode: 'center' } }]
  project.measurements = [{ id: 'passage', kind: 'passage', name: 'Test geçişi', axis: 'z', origin: { x: 900, z: 900 }, minimum: 900, headroom: 2000 }]
  const proposed = () => previewTrimClearance(project, cabinet, wall.id, placement(project, cabinet).trim)!
  const result = proposed()
  assert.equal(result.error, undefined)
  assert.equal(result.distance, 10)
  assert.deepEqual(result.items.map(item => item.z), [116, 116])
  assert.notEqual(result.passages[0].after, result.passages[0].before)
  assert.deepEqual(project.items.map(item => item.z), [106, 106])
  project.measurements = [{ ...project.measurements![0], minimum: 4000 } as typeof project.measurements[number]]
  assert.match(proposed().error ?? '', /geçişi alt sınırın altında/)
  project.items[1] = { ...linked, locked: true }
  assert.match(proposed().error ?? '', /kilitli/)
})

test('Batch baseboard application keeps local gaps, wall locks and existing geometry', () => {
  const project = makeProject(false)
  const [source, target, locked, untouched] = project.walls
  source.baseboard = { height: 90, depth: 16, appearance: { preset: 'gloss-lacquer', roughness: .16 },
    gaps: [{ id: 'source-gap', start: 300, width: 100 }] }
  target.baseboard = { height: 80, depth: 14, gaps: [{ id: 'target-gap', start: 50, width: 100 }] }
  locked.locked = true
  const result = copyBaseboard(project, source.id, [target.id, locked.id, 'missing'])
  assert.equal(result.walls[0], source)
  assert.equal(result.walls[2], locked)
  assert.equal(result.walls[3], untouched)
  assert.equal(result.items, project.items)
  assert.deepEqual(result.walls[1].baseboard, { ...source.baseboard, gaps: target.baseboard.gaps })
  assert.deepEqual(wallTrimPieces(result.walls[1], result.height).map(piece => [piece.start, piece.end]),
    [[0, 50], [150, target.length]])
  assert.equal(validateProject(result), undefined)
})
