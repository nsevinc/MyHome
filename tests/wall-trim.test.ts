import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captureAppearance } from '../src/material-pipette'
import { makeProject } from '../src/model'
import type { Opening } from '../src/model'
import { sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'
import { paintArchitecturalSurface, wallTrimPieces } from '../src/wall-trim'

function roomWithTrim() {
  const project = makeProject(false)
  const wall = project.walls[0]
  const window = { id: 'trim-window', kind: 'window', offset: 1800, width: 1100, height: 1200, bottom: 900,
    sill: { width: 1100, depth: 280, thickness: 30, finish: 'gray' }, trim: { width: 70, depth: 18 } } satisfies Opening
  wall.openings = [{ id: 'skirting-door', kind: 'door', offset: 300, width: 750, bottom: 0, height: 2050 }, window]
  wall.baseboard = { height: 80, depth: 14 }
  return { project, wall, window }
}

test('Baseboards stop at doors and casing follows its window and sill', () => {
  const { project, wall, window } = roomWithTrim()
  const dimensions = ({ start, end, bottom, top, depth }: ReturnType<typeof wallTrimPieces>[number]) =>
    [start, end, bottom, top, depth]
  const pieces = wallTrimPieces(wall, project.height)
  assert.deepEqual(pieces.filter(piece => piece.kind === 'baseboard').map(dimensions), [
    [0, 300, 0, 80, 14], [1050, wall.length, 0, 80, 14],
  ])
  assert.deepEqual(pieces.filter(piece => piece.kind === 'trim').map(dimensions), [
    [1730, 1800, 930, 2100, 18], [2900, 2970, 930, 2100, 18], [1730, 2970, 2100, 2170, 18],
  ])
  const moved = { ...window, offset: 30, sill: undefined, bottom: 950 }
  const movedPieces = wallTrimPieces({ ...wall, openings: [moved] }, project.height).filter(piece => piece.kind === 'trim')
  assert.equal(movedPieces[0].start, 0)
  assert.equal(movedPieces[0].bottom, 950)
  assert.equal(movedPieces[3].top, 950)
  const scene = sceneData(readProject(JSON.parse(JSON.stringify(project))))
  assert.equal(scene.boxes.filter(box => box.architecturalTrim === 'baseboard').length, 2)
  assert.equal(scene.boxes.filter(box => box.architecturalTrim === 'trim').length, 3)
})

test('Pipette appearance transfers preserve measurements and cannot paint a locked wall', () => {
  const { project, wall, window } = roomWithTrim()
  const target = { kind: 'trim', wallId: wall.id, openingId: window.id } as const
  const appearance = captureAppearance({ preset: 'gloss-lacquer', roughness: .16 }, '#f3ebe2')
  const painted = paintArchitecturalSurface(project, target, appearance)
  assert.deepEqual(painted.walls[0].openings[1].trim, { ...window.trim, appearance })
  assert.equal(painted.items, project.items)
  assert.equal(painted.walls[0].baseboard, wall.baseboard)
  const boxes = (value: typeof project) => sceneData(value).boxes.map(({ appearance: _appearance, color: _color, ...box }) => box)
  assert.deepEqual(boxes(painted), boxes(project))
  wall.locked = true
  assert.equal(paintArchitecturalSurface(project, target, appearance), project)
})

test('A pipette sample keeps the original colors and all physical texture settings', () => {
  const texture = { name: 'test.png', data: 'data:image/png;base64,AA==', tileMm: 130 }
  const material = { preset: 'pique', texture, normalMap: texture, roughnessMap: texture,
    direction: 20, tileMm: 120, relief: .8, roughness: .7 } as const
  assert.deepEqual(captureAppearance(material, '#babb9d'), { ...material, color: undefined })
  assert.equal(captureAppearance({ ...material, color: '#af9a82' }, '#babb9d').color, '#af9a82')
})
