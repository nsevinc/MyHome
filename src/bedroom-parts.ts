import type { Box } from './geometry'
import type { Furniture } from './model'
import { appearanceFor } from './object-appearance'

// Coordinates are fractions of the item's editable envelope. The front is +Z.
export function bedroomDetails(item: Furniture): Box[] | undefined {
  const w = item.width / 1000,
    h = item.height / 1000,
    d = item.depth / 1000
  const color = item.color,
    wood = '#70513e',
    brass = '#ac9061',
    cloth = '#e3d5c0'
  const model = item.bedroomModel
  function part(
    slot: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    tint = color,
    surface: Box['surface'] = 'wood',
  ): Box {
    return {
      slot,
      position: [x * w, y * h, z * d],
      size: [width * w, height * h, depth * d],
      color: tint,
      surface,
      appearance: appearanceFor(item.appearances, slot) ?? undefined,
    }
  }
  const disc = (p: Box): Box => ({ ...p, cylinder: 'upright' })
  const oval = (p: Box): Box => ({ ...p, round: true })
  function legs(height: number, width = 0.065) {
    return [-1, 1].flatMap((x) => [-1, 1].map((z) => part('base', x * 0.42, height / 2, z * 0.38, width, height, 0.095, wood)))
  }
  function mirror(x: number, y: number, z: number, width: number, height: number, depth: number, circular = true): Box[] {
    const frame = part('frame', x, y, z, width, height, depth, item.kind === 'mirror' ? color : brass, 'metal')
    const pane = {
      ...part('frame', x, y, z + depth * 0.48, width * 0.92, height * 0.94, depth * 0.08, '#d2dfe1', 'metal'),
      slot: undefined,
      appearance: undefined,
      mirror: true,
    }
    return circular ? [frame, pane].map((p) => ({ ...p, cylinder: 'front' })) : [frame, pane]
  }
  switch (model) {
    case 'quilted-headboard':
      return [
        part('body', 0, 0.5, -0.3, 1, 1, 0.4, wood),
        ...Array.from({ length: 12 }, (_, i) =>
          part('face', ((i % 6) + 0.5) / 6 - 0.5, i < 6 ? 0.25 : 0.75, 0.16, 0.161, 0.486, 0.68, color, 'fabric'),
        ),
      ]
    case 'niche-nightstand':
      return [
        part('top', 0, 0.975, 0, 1, 0.05, 1),
        part('base', 0, 0.07, 0, 1, 0.14, 1),
        ...[-1, 1].map((s) => part('base', s * 0.47, 0.55, 0, 0.06, 0.82, 1)),
        part('base', 0, 0.54, -0.46, 0.88, 0.82, 0.08, wood),
        part('base', 0, 0.54, 0.01, 0.88, 0.04, 0.94),
      ]
    case 'pedestal-nightstand':
      return [
        disc(part('top', 0, 0.955, 0, 1, 0.09, 1)),
        disc(part('base', 0, 0.055, 0, 0.73, 0.11, 0.73, wood)),
        disc(part('base', 0, 0.51, 0, 0.32, 0.82, 0.32)),
      ]
    case 'round-vanity':
      return [
        part('top', 0, 0.512, 0, 1, 0.038, 1),
        part('base', -0.31, 0.248, 0, 0.28, 0.496, 0.88, wood),
        ...[-0.36, 0.36].map((z) => part('base', 0.44, 0.25, z, 0.035, 0.5, 0.045, brass, 'metal')),
        ...Array.from({ length: 9 }, (_, i) => part('base', -0.434 + i * 0.031, 0.255, 0.451, 0.012, 0.46, 0.018)),
        part('base', 0, 0.596, -0.4, 0.025, 0.16, 0.04, brass, 'metal'),
        ...mirror(0, 0.789, -0.39, 0.56, 0.422, 0.055),
      ]
    case 'triptych-vanity':
      return [
        part('top', 0, 0.502, 0, 1, 0.036, 1),
        part('base', 0, 0.46, 0, 0.94, 0.07, 0.9),
        ...legs(0.43),
        ...[-0.36, 0, 0.36].flatMap((x) =>
          mirror(x, x === 0 ? 0.76 : 0.732, -0.4, x === 0 ? 0.4 : 0.285, x === 0 ? 0.48 : 0.42, 0.055, false),
        ),
      ]
    case 'bridge-vanity':
      return [
        part('top', 0, 0.962, 0, 1, 0.076, 1),
        ...[-1, 1].flatMap((s) => [
          part('base', s * 0.36, 0.46, 0, 0.24, 0.92, 0.9, wood),
          ...[0.2, 0.49, 0.78].map((y) => part('base', s * 0.36, y, 0.463, 0.226, 0.273, 0.026)),
          ...[0.28, 0.57, 0.86].map((y) => part('base', s * 0.36, y, 0.487, 0.095, 0.019, 0.018, brass, 'metal')),
        ]),
      ]
    case 'drum-pouf':
      return [
        disc(part('base', 0, 0.055, 0, 0.87, 0.11, 0.87, wood)),
        disc(part('upholstery', 0, 0.53, 0, 0.99, 0.85, 0.99, color, 'fabric')),
        disc(part('upholstery', 0, 0.946, 0, 1, 0.033, 1, cloth, 'fabric')),
        oval(part('upholstery', 0, 0.953, 0, 0.97, 0.094, 0.97, color, 'fabric')),
      ]
    case 'tufted-pouf':
      return [
        disc(part('base', 0, 0.075, 0, 0.76, 0.15, 0.76, wood)),
        part('upholstery', 0, 0.47, 0, 0.96, 0.65, 0.96, color, 'fabric'),
        ...[-0.242, 0.242].flatMap((x) =>
          [-0.242, 0.242].map((z) => part('upholstery', x, 0.887, z, 0.474, 0.226, 0.474, color, 'fabric')),
        ),
      ]
    case 'pedestal-pouf':
      return [
        disc(part('base', 0, 0.2, 0, 0.67, 0.4, 0.75, wood)),
        disc(part('base', 0, 0.395, 0, 0.75, 0.055, 0.82, brass, 'metal')),
        oval(part('upholstery', 0, 0.7, 0, 1, 0.6, 1, color, 'fabric')),
      ]
    case 'pleated-pouf':
      return [
        disc(part('base', 0, 0.055, 0, 0.72, 0.11, 0.72, wood)),
        disc(part('upholstery', 0, 0.52, 0, 0.88, 0.81, 0.88, color, 'fabric')),
        ...Array.from({ length: 16 }, (_, i) => {
          const a = (i * Math.PI) / 8
          return oval(part('upholstery', 0.4 * Math.cos(a), 0.53, 0.4 * Math.sin(a), 0.2, 0.86, 0.2, color, 'fabric'))
        }),
        oval(part('upholstery', 0, 0.938, 0, 0.94, 0.124, 0.94, color, 'fabric')),
      ]
    case 'slat-bench':
      return [
        ...legs(0.89),
        ...Array.from({ length: 7 }, (_, i) => part('top', 0, 0.945, (i - 3) / 7, 1, 0.11, 0.124)),
        ...[-0.25, 0, 0.25].map((z) => part('base', 0, 0.24, z, 0.89, 0.07, 0.18, wood)),
      ]
    case 'bolster-bench':
      return [
        ...legs(0.38),
        part('base', 0, 0.409, 0, 0.9, 0.087, 0.84, wood),
        part('top', 0, 0.59, 0, 1, 0.28, 1, color, 'fabric'),
        ...[-0.436, 0.436].map((x) => ({
          ...part('top', x, 0.858, 0, 0.127, 0.284, 0.94, cloth, 'fabric'),
          cylinder: 'front' as const,
        })),
      ]
    case 'disc-mirror':
    case 'oval-mirror':
      return mirror(0, 0.5, -0.02, 1, 1, 0.94)
    case 'panel-mirror':
      return [-0.34, 0, 0.34].flatMap((x) => mirror(x, 0.5, -0.02, 0.316, x === 0 ? 1 : 0.82, 0.94, false))
    case 'box-shelf':
      return [
        ...[0.043, 0.957].map((y) => part('face', 0, y, 0, 1, 0.086, 1)),
        ...[-0.484, 0.484].map((x) => part('body', x, 0.5, 0, 0.032, 0.83, 1)),
      ]
    case 'offset-shelf':
      return [
        part('face', -0.17, 0.036, 0, 0.66, 0.072, 1),
        part('face', 0.17, 0.5, 0, 0.66, 0.065, 1),
        part('face', 0.31, 0.964, 0, 0.38, 0.072, 1),
        part('body', 0.135, 0.265, 0, 0.033, 0.47, 0.94),
        part('body', 0.465, 0.735, 0, 0.033, 0.47, 0.94),
      ]
    case 'triptych-art':
      return [-1, 0, 1].flatMap((s, i) => [
        part('body', s * 0.344, 0.5, -0.14, 0.312, 1, 0.72, wood),
        part('face', s * 0.344, 0.5, 0.23, 0.287, 0.945, 0.1, cloth, 'fabric'),
        oval(part('face', s * 0.344, 0.38 + 0.13 * i, 0.33, 0.235, 0.42, 0.17, [color, '#65796d', '#b68567'][i], 'fabric')),
      ])
    case 'relief-art':
      return [
        part('body', 0, 0.5, -0.21, 1, 1, 0.58, wood),
        part('face', 0, 0.5, 0.09, 0.94, 0.95, 0.1, cloth, 'fabric'),
        ...Array.from({ length: 9 }, (_, i) => {
          const ht = 0.34 + 0.38 * Math.sin((Math.PI * i) / 8)
          return part('face', (i - 4) * 0.095, 0.2 + ht / 2, 0.31, 0.058, ht, 0.38, color, 'wood')
        }),
      ]
    case 'round-rug':
      return [
        disc(part('edge', 0, 0.25, 0, 1, 0.5, 1, wood, 'fabric')),
        disc(part('pile', 0, 0.58, 0, 0.93, 0.25, 0.93, color, 'fabric')),
        disc(part('edge', 0, 0.75, 0, 0.68, 0.14, 0.68, cloth, 'fabric')),
        disc(part('pile', 0, 0.9, 0, 0.61, 0.2, 0.61, color, 'fabric')),
      ]
    case 'striped-rug':
      return [
        part('pile', 0, 0.4, 0, 1, 0.8, 1, color, 'fabric'),
        ...[-0.39, -0.34, -0.23, 0.23, 0.34, 0.39].map((z) => part('edge', 0, 0.89, z, 1, 0.22, 0.025, cloth, 'fabric')),
      ]
    case 'border-rug':
      return [
        part('edge', 0, 0.2, 0, 1, 0.4, 1, wood, 'fabric'),
        part('pile', 0, 0.43, 0, 0.96, 0.14, 0.97, color, 'fabric'),
        part('edge', 0, 0.62, 0, 0.86, 0.24, 0.9, cloth, 'fabric'),
        part('pile', 0, 0.85, 0, 0.83, 0.3, 0.88, color, 'fabric'),
      ]
  }
}
