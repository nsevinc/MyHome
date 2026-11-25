import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateOutline } from '../src/geometry'
import { defaultSketchReference, rotateSketchReference, sketchDeviation, sketchScale, traceSketchWalls } from '../src/sketch-reference'
import { suggestSketchRoom } from '../src/sketch-suggestion'

test('Calibrated tracing closes at the known 480 cm span and a rotated ruler keeps its scale', () => {
  const reference = { ...defaultSketchReference,
    calibration: { from: { x: 140, z: 90 }, to: { x: 640, z: 90 }, mm: 4800 },
    verification: { from: { x: 140, z: 90 }, to: { x: 140, z: 440 }, mm: 3200 },
  }
  const rotated = rotateSketchReference(reference, 31)
  assert.ok(Math.abs(sketchScale(rotated)! - 9.6) < .000001)
  const result = sketchDeviation(rotated)!
  assert.ok(Math.abs(result.delta - 160) < .000001)
  assert.ok(Math.abs(result.percent - 5) < .000001)
  const points = [{ x: 140, z: 90 }, { x: 640, z: 90 }, { x: 640, z: 309.5 }, { x: 365.5, z: 309.5 },
    { x: 365.5, z: 440 }, { x: 140, z: 440 }]
  const walls = traceSketchWalls(points, sketchScale(reference)!)
  assert.equal(walls[0].length, 4800)
  assert.equal(validateOutline(walls), undefined)
})

test('A clean plan yields a rectangle, a gap door and a thin-stroke window', () => {
  const raster = sheet()
  raster.ink(138, 87, 230, 93)
  raster.ink(330, 87, 642, 93)
  raster.ink(637, 90, 643, 180)
  raster.ink(640, 180, 640, 300)
  raster.ink(637, 300, 643, 440)
  raster.ink(138, 437, 642, 443)
  raster.ink(137, 90, 143, 440)
  const found = suggestSketchRoom(raster, 9.6)!
  assert.equal(found.walls.length, 4)
  assert.ok(Math.abs(found.walls[0].length - 4800) < 20)
  assert.deepEqual(found.openings.map(opening => [opening.wall, opening.kind]), [[0, 'door'], [1, 'window']])
  assert.ok(Math.abs(found.openings[0].width - 960) < 20)
})

test('An L-shaped plan traces its recess and a blank sheet produces no proposal', () => {
  const raster = sheet()
  assert.equal(suggestSketchRoom(raster, 10), undefined)
  raster.ink(99, 79, 670, 81)
  raster.ink(669, 80, 671, 280)
  raster.ink(380, 279, 670, 281)
  raster.ink(379, 280, 381, 430)
  raster.ink(100, 429, 380, 431)
  raster.ink(99, 80, 101, 430)
  const found = suggestSketchRoom(raster, 10)!
  assert.equal(found.walls.length, 6)
  assert.equal(validateOutline(found.walls), undefined)
  assert.deepEqual(found.openings, [])
})

function sheet() {
  const width = 780, height = 480
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  return { width, height, data, ink: (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const pixel = (y * width + x) * 4
      data.fill(0, pixel, pixel + 3)
    }
  } }
}
