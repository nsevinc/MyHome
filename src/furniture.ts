import { meters, wardrobeZones } from './model'
import type { Furniture } from './model'
import type { Box } from './geometry'
import { appearanceFor } from './object-appearance'
import { cabinetDoors, cabinetSize, defaultInterior, movedDoorPoint } from './wardrobe'
import { curtainPanels } from './curtain-shape'
import { fixtureColor } from './lighting'
import { pendantParts } from './pendant'
import { bedroomDetails } from './bedroom-parts'

export function furnitureParts(item: Furniture): Box[] {
  const [w, d, h] = [item.width, item.depth, item.height].map(meters)
  const fabric = item.color
  const wood = '#7e5b43'
  const linen = '#eee8de'
  const metal = '#454742'
  const box = (slot: string, x: number, y: number, z: number, width: number, height: number, depth: number, color = fabric,
    surface?: Box['surface'], material?: Box['material']): Box => {
    const appearance = appearanceFor(item.appearances, slot)
    return { position: [x, y, z], size: [width, height, depth], color, surface, slot,
      material: appearance === undefined ? material : undefined, appearance: appearance ?? undefined }
  }

  if (item.bedroomModel) {
    const details = bedroomDetails(item)
    if (details) return details
  }
  switch (item.bedroomModel) {
    case 'upholstered-headboard': {
      const panels = Math.max(3, Math.min(12, Math.round(w / .24)))
      return [
        box('body', 0, h / 2, -d * .3, w, h, d * .4, wood, 'wood'),
        ...Array.from({ length: panels }, (_, index) => {
          const face = box('face', w * ((index + .5) / panels - .5), h / 2, d * .2,
            w / panels * .978, h * .99, d * .6, fabric, 'fabric')
          if (appearanceFor(item.appearances, 'face') === undefined) {
            face.appearance = { preset: 'woven-linen', roughness: .92, relief: .6 }
          }
          return face
        }),
      ]
    }
    case 'wood-headboard':
      return [
        box('body', 0, h / 2, -d * .15, w, h, d * .7, fabric, 'wood'),
        ...[.1, .9].map(y => box('face', 0, h * y, d * .35, w, h * .075, d * .3, wood, 'wood')),
      ]
    case 'slatted-panel': {
      const slats = Math.max(3, Math.min(36, Math.round(w / .052)))
      return [
        box('body', 0, h / 2, -d * .35, w, h, d * .3, '#342c26', 'wood'),
        ...Array.from({ length: slats }, (_, index) =>
          box('face', w * ((index + .5) / slats - .5), h / 2, d * .15, w / slats * .72, h, d * .7, fabric, 'wood')),
      ]
    }
    case 'floating-nightstand':
    case 'drawer-nightstand':
    case 'dresser':
    case 'tower-dresser':
    case 'double-dresser':
    case 'shelf-dresser': {
      const rows = item.bedroomModel === 'tower-dresser' ? 5 : item.bedroomModel === 'drawer-nightstand' ? 2 :
        item.bedroomModel === 'floating-nightstand' ? 1 : 3
      const columns = item.bedroomModel === 'double-dresser' ? 2 : 1
      const niche = item.bedroomModel === 'shelf-dresser'
      const board = Math.min(.018, w / 12, h / 12, d / 12)
      const plinth = item.bedroomModel === 'floating-nightstand' ? 0 : h * .08
      const rise = (h - plinth - 2 * board) / rows
      const parts = [
        box('body', 0, h - board / 2, 0, w, board, d, fabric, 'wood'),
        box('body', 0, plinth + board / 2, 0, w, board, d, fabric, 'wood'),
        box('body', 0, (h + plinth) / 2, -d / 2 + board / 2, w, h - plinth, board, fabric, 'wood'),
        ...[-1, 1].map(side => box('body', side * (w - board) / 2, (h + plinth) / 2, 0, board, h - plinth, d, fabric, 'wood')),
      ]
      if (plinth) parts.push(box('body', 0, plinth / 2, 0, w * .86, plinth, d * .82, wood, 'wood'))
      const inside = w - 2.2 * board
      const drawerWidth = (niche ? inside * .64 : inside) / columns
      if (niche || columns === 2) {
        const divider = niche ? inside * .15 : 0
        parts.push(box('body', divider, (h + plinth) / 2, 0, board, h - plinth, d - board, fabric, 'wood'))
        if (niche) for (const level of [.34, .66]) parts.push(box('body', inside * .325, plinth + (h - plinth) * level,
          0, inside * .35, board, d - board, wood, 'wood'))
      }
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const y = plinth + board + (row + .5) * rise
        const x = -inside / 2 + (column + .5) * drawerWidth
        const face = [
          box('face', x, y, (d - board) / 2, columns === 1 ? drawerWidth : drawerWidth - board, rise * .96, board, fabric, 'wood'),
          box('handles', x, y, d / 2 + board * .4, (columns === 1 && !niche ? w : drawerWidth) * .28, board * .45, board * .8, metal, 'metal'),
        ]
        if (row === rows - 1 && column === 0 && item.drawerTravel) {
          face.push(box('body', x, y - rise * .43, 0, drawerWidth - (columns === 1 ? 0 : board), board, d - 2 * board, fabric, 'wood'))
          parts.push(...face.map(part => ({ ...part, motionPart: 'drawer' })))
        } else parts.push(...face)
      }
      return parts
    }
    case 'bed-bench':
    case 'vanity': {
      const bench = item.bedroomModel === 'bed-bench'
      const thickness = h * (bench ? .20 : .07)
      return [
        box('top', 0, h - thickness / 2, 0, w, thickness, d, fabric, bench ? 'fabric' : 'wood'),
        box('base', 0, h - thickness - h * .055, 0, w * .94, h * .11, d * .86, wood, 'wood'),
        ...[-.43, .43].flatMap(x => [-.39, .39].map(z => box('base', w * x, (h - thickness) / 2, d * z,
          w * .065, h - thickness, d * .10, wood, 'wood'))),
      ]
    }
    case 'wall-shelf':
      return [
        box('face', 0, h * .68, 0, w, h * .64, d, fabric, 'wood'),
        ...[-.31, .31].map(x => box('body', w * x, h * .18, -d * .14, w * .045, h * .36, d * .72, metal, 'metal')),
      ]
    case 'wall-art':
      return [
        box('body', 0, h / 2, -d * .12, w, h, d * .76, fabric, 'wood'),
        box('face', 0, h / 2, d * .30, w * .91, h * .93, d * .22, '#e8ddca', 'fabric'),
        box('face', -w * .16, h * .58, d * .46, w * .17, h * .46, d * .08, '#8c5241', 'fabric'),
        box('face', w * .12, h * .42, d * .46, w * .31, h * .24, d * .08, '#44564f', 'fabric'),
      ]
  }

  switch (item.kind) {
    case 'pendant': {
      const { shade, plate, plateWidth, cord } = pendantParts(item)
      const [shadeHeight, plateHeight, canopy, cable] = [shade, plate, plateWidth, cord].map(meters)
      const cordLength = h - shadeHeight - plateHeight
      return [
        { ...box('shade', 0, shadeHeight / 2, 0, w, shadeHeight, d, fabric, 'metal'), shade: true },
        box('mount', 0, h - plateHeight / 2, 0, canopy, plateHeight, canopy, metal, 'metal'),
        box('mount', 0, shadeHeight + cordLength / 2, 0, cable, cordLength, cable, metal, 'metal'),
        { position: [0, shadeHeight * .19, 0], size: [w * .64, shadeHeight * .10, d * .64],
          color: '#efebe4', round: true, emission: item.fixture?.on ? fixtureColor(item.fixture) : undefined },
      ]
    }
    case 'mirror': {
      const rim = Math.min(.028, w * .17, h * .17)
      return [
        box('frame', 0, h / 2, -d * .36, w, h, d * .28, fabric, 'wood'),
        ...[-1, 1].flatMap(side => [
          box('frame', side * (w - rim) / 2, h / 2, 0, rim, h, d, fabric, 'wood'),
          box('frame', 0, h / 2 + side * (h - rim) / 2, 0, w - 2 * rim, rim, d, fabric, 'wood'),
        ]),
        { position: [0, h / 2, d * .3], size: [w - 2 * rim, h - 2 * rim, d * .29],
          color: '#eeefee', mirror: true },
      ]
    }
    case 'rug': {
      const edge = Math.min(.035, w * .08, d * .08)
      const pile = box('pile', 0, h * .495, 0, w, h * .99, d, fabric, 'fabric')
      if (appearanceFor(item.appearances, 'pile') === undefined) {
        pile.appearance = { preset: 'woven-linen', scale: .8, roughness: .95 }
      }
      return [pile,
        ...[-1, 1].flatMap(side => [
          box('edge', side * (w - edge) / 2, h * .96, 0, edge, h * .08, d - 2 * edge, '#655346', 'fabric'),
          box('edge', 0, h * .96, side * (d - edge) / 2, w, h * .08, edge, '#655346', 'fabric'),
        ])]
    }
    case 'curtain': {
      const setting = item.curtain!
      const rail = Math.min(h * .06, .025)
      const cloth = h - rail
      return [
        box('rail', 0, h - rail / 2, 0, w, rail, d * .55, metal, 'metal'),
        ...curtainPanels(w, setting.open).map(({ center, width }) => {
          const panel = box('cloth', center, cloth / 2, 0, width, cloth, d, fabric, 'fabric')
          if (appearanceFor(item.appearances, 'cloth') === undefined) {
            panel.appearance = { preset: 'woven-linen', scale: .75, roughness: .95, relief: .65 }
          }
          return { ...panel, curtain: {
            folds: Math.max(3, Math.min(18, Math.round(w * 5))), sheer: setting.fabric === 'sheer',
          } }
        }),
      ]
    }
    case 'sofa':
      return [
        box('base', 0, h * .22, 0, w, h * .35, d, wood),
        box('upholstery', 0, h * .66, -d * .40, w, h * .68, d * .20),
        box('upholstery', -w * .44, h * .43, 0, w * .12, h * .47, d),
        box('upholstery', w * .44, h * .43, 0, w * .12, h * .47, d),
        ...[-.205, .205].map(x => box('upholstery', w * x, h * .43, d * .08, w * .39, h * .19, d * .81)),
        ...[-.42, .42].flatMap(x => [-.37, .37].map(z => box('base', x * w, h * .0275, z * d, w * .06, h * .055, d * .09, metal))),
      ]
    case 'bed': {
      let base = [box('base', 0, h * .16, 0, w, h * .32, d, wood, 'wood')]
      let head = [box('headboard', 0, h * .50, -d * .455, w, h, d * .09, fabric, 'fabric', item.material)]
      if (item.bedroomModel === 'platform-bed') {
        base = [box('base', 0, h * .105, 0, w * .74, h * .21, d * .80, wood, 'wood'),
          box('base', 0, h * .265, 0, w, h * .11, d, fabric, 'wood')]
        head = [box('headboard', 0, h * .62, -d * .47, w, h * .76, d * .06, fabric, 'wood', item.material)]
      } else if (item.bedroomModel === 'wing-bed') {
        base = [box('base', 0, h * .16, 0, w * .96, h * .32, d * .99, fabric, 'fabric')]
        head = [box('headboard', 0, h * .50, -d * .47, w, h, d * .06, fabric, 'fabric', item.material),
          ...[-1, 1].map(s => box('headboard', s * w * .47, h * .56, -d * .402, w * .06, h * .84, d * .136, fabric, 'fabric', item.material))]
      } else if (item.bedroomModel === 'spindle-bed') {
        base = [box('base', 0, h * .27, 0, w, h * .10, d, fabric, 'wood'),
          ...[-1, 1].flatMap(x => [-1, 1].map(z => box('base', x * w * .46, h * .11, z * d * .46, w * .06, h * .22, d * .05, fabric, 'wood')))]
        head = [box('headboard', 0, h * .97, -d * .47, w, h * .06, d * .055, fabric, 'wood', item.material),
          ...Array.from({ length: 13 }, (_, i): Box => ({
            ...box('headboard', w * (i - 6) * .077, h * .63, -d * .47, w * .022, h * .64, d * .018, fabric, 'wood', item.material),
            cylinder: 'upright',
          }))]
      }
      return [
        ...base,
        ...(item.separateHeadboard ? [] : head),
        ...[
          box('linen', 0, h * .32, d * .044, w * .96, h * .16, d * .9, linen, 'linen'),
          box('cover', 0, h * .415, d * .145, w * .96, h * .045, d * .71, fabric, 'quilt', item.material),
          ...[-.24, .24].map(x => box('linen', w * x, h * .448, -d * .29, w * .38, h * .10, d * .14, linen, 'pillow')),
        ].map(part => item.liftAngle ? { ...part, motionPart: 'lid' } : part),
      ]
    }
    case 'box': {
      if (!item.drawerTravel) return [box('all', 0, h * .5, 0, w, h, d)]
      const board = Math.min(.018, w / 10, h / 10, d / 10)
      const moving = (part: Box): Box => ({ ...part, motionPart: 'drawer' })
      return [
        box('all', 0, h - board / 2, 0, w, board, d),
        box('all', 0, h * .22, 0, w, h * .44, d),
        box('all', 0, h * .71, -d / 2 + board / 2, w, h * .54, board),
        ...[-1, 1].map(side => box('all', side * (w - board) / 2, h * .71, 0, board, h * .54, d)),
        moving(box('all', 0, h * .71, d / 2 - board / 2, w - 2.2 * board, h * .49, board)),
        moving(box('all', 0, h * .475, 0, w - 2.2 * board, board, d - 2 * board)),
        moving(box('all', 0, h * .71, d / 2 + board * .45, w * .35, board * .5, board * .9, metal, 'metal')),
      ]
    }
    case 'table':
      return [
        box('top', 0, h * .956, 0, w, h * .088, d),
        ...[-.43, .43].flatMap(x => [-.39, .39].map(z => box('base', x * w, h * .456, z * d, w * .07, h * .912, d * .095, wood))),
      ]
    case 'wall-cabinet':
    case 'wardrobe':
      if (item.wardrobe) {
        const { doors, front, pose, interior, motion, stack } = item.wardrobe
        const size = cabinetSize(item, doors)
        const leaf = meters(size.leaf), board = meters(size.board)
        const inset = motion === 'sliding' ? 2.2 : 0
        const cavity = d - (3 + inset) * board
        const panel = (slot: string, x: number, y: number, z: number, width: number, height: number, depth: number) =>
          box(slot, x, y, z, width, height, depth, fabric,
            item.bedroomModel === 'glass-wardrobe' && front === 'glass' && slot === 'doors' ? 'metal' : 'wood', item.material)
        function carcass(base: number, height: number, thickness: number, lit = true): Box[] {
          const insideDepth = d - (3 + inset) * thickness
          const z = -thickness * (1 + inset) / 2
          return [
            panel('body', 0, base + height / 2, -d / 2 + thickness / 2, w, height, thickness),
            panel('body', 0, base + thickness / 2, z, w, thickness, insideDepth),
            { ...panel('body', 0, base + height - thickness / 2, z, w, thickness, insideDepth), ledMount: lit ? 'ceiling' : undefined },
            ...([-1, 1] as const).map((side): Box => ({ ...panel('body', side * (w - thickness) / 2, base + height / 2,
              z, thickness, height - 2 * thickness, insideDepth), ledMount: lit ? (side < 0 ? 'left' : 'right') : undefined })),
          ]
        }
        const parts = stack ? [] as Box[] : carcass(0, h, board)
        if (stack) {
          const { lowerTop, upperBottom } = wardrobeZones(item)
          for (const [base, height] of [[0, meters(lowerTop)], [meters(upperBottom), h - meters(upperBottom)]]) {
            const thickness = Math.min(board, height / 8)
            parts.push(...carcass(base, height, thickness))
            for (let column = 0; column < doors; column++) {
              const left = -w / 2 + column * leaf, x = left + leaf / 2
              if (column) parts.push(panel('inside', left, base + height / 2, -thickness / 2, thickness, height - 2 * thickness, d - 3 * thickness))
              const compartment = base === 0 ? { shelves: [.5], rail: undefined } : interior?.[column] ?? defaultInterior(column)
              for (const shelf of compartment.shelves) parts.push({ ...panel('inside', x, base + height * shelf, -thickness,
                leaf - thickness, thickness, d - 4 * thickness), ledMount: 'shelf' })
              if (compartment.rail !== undefined) parts.push(box('inside', x, base + height * compartment.rail, 0,
                leaf - thickness, thickness * .65, thickness * .65, metal, 'metal'))
            }
          }
          if (stack.type === 'drawers') {
            const drawerCount = stack.drawers ?? 2
            const start = meters(lowerTop), band = meters(upperBottom - lowerTop), rowHeight = band / drawerCount
            const thickness = Math.min(board, rowHeight / 8), depth = d * .67
            const front = d / 2 - thickness / 2, trayZ = front - thickness / 2 - depth / 2
            const trayWidth = w - thickness * 4
            parts.push(...carcass(start, band, thickness, false))
            for (let row = 0; row < drawerCount; row++) {
              const y = start + (row + .5) * rowHeight
              const floor = y - rowHeight * .34, sideHeight = rowHeight * .52
              const moving = (part: Box) => ({ ...part, motionPart: `outer-drawer:${row}` })
              parts.push(
                moving(panel('drawer-fronts', 0, y, front, w - thickness * .45, rowHeight - thickness * .45, thickness)),
                moving(box('drawer-handles', 0, y, front + thickness * .95, w * .24, thickness * .52, thickness * .9, metal, 'metal')),
                moving(panel('inside', 0, floor, trayZ, trayWidth, thickness * .65, depth)),
                moving(panel('inside', 0, floor + sideHeight / 2, trayZ - (depth - thickness) / 2, trayWidth, sideHeight, thickness)),
                ...[-1, 1].map(side => moving(panel('inside', side * (trayWidth - thickness) / 2, floor + sideHeight / 2,
                  trayZ, thickness, sideHeight, depth))),
              )
            }
          }
        }
        if (motion === 'sliding' && pose !== 'none') {
          const trackDepth = board * 2.6
          for (const y of [board * .30, h - board * .30]) {
            parts.push(box('body', 0, y, d / 2 - trackDepth / 2, w, board * .50, trackDepth, metal, 'metal'))
          }
        }
        for (let index = 0; !stack && index < doors; index++) {
          const left = -w / 2 + index * leaf
          const x = left + leaf / 2
          const compartment = interior?.[index] ?? defaultInterior(index)
          const drawerHeight = h * .13
          const above = drawerHeight * compartment.drawers
          const cavityZ = -board * (2 + inset) / 2
          if (index) parts.push(panel('inside', left, h / 2, -board * (1 + inset) / 2, board, h - 2 * board, cavity))
          for (const level of compartment.shelves) {
            parts.push({ ...panel('inside', x, above + (h - above) * level, cavityZ, leaf - board, board, cavity - board), ledMount: 'shelf' })
          }
          if (compartment.rail !== undefined) {
            parts.push(box('inside', x, above + (h - above) * compartment.rail, -board * inset / 2, leaf - board, board * .65, board * .65,
              metal, 'metal'))
          }
          for (let drawer = 0; drawer < compartment.drawers; drawer++) {
            const y = board + (drawer + .5) * drawerHeight
            const z = cavityZ + cavity * .42
            const motionPart = `drawer:${index}:${drawer}`
            parts.push({ ...panel('inside', x, y, z, leaf - board * 1.3, drawerHeight * .9, board), motionPart })
            parts.push({ ...box('inside', x, y, z + board * .56, leaf * .35, board * .35, board * .25, metal, 'metal'), motionPart })
          }
        }
        if (pose === 'none') return parts
        for (const door of cabinetDoors(item)) {
          const { x, z: doorZ } = { x: meters(door.center.x), z: meters(door.center.z) }
          const doorW = meters(door.width), doorH = meters(door.height), frame = meters(door.frame)
          const y = meters(door.y), thickness = meters(door.depth), slot = door.slot
          const swing = (part: Box) => {
            const [px, py, pz] = part.position
            const moved = movedDoorPoint(door, { x: px * 1000, z: pz * 1000 })
            return { ...part, angle: door.yaw, position: [meters(moved.x), py, meters(moved.z)] as Box['position'] }
          }
          const panels = front === 'glass'
            ? [
              ...[-1, 1].map(edge => panel(slot, x + edge * (doorW - frame) / 2, y, doorZ, frame, doorH, thickness)),
              ...[-1, 1].map(edge => panel(slot, x, y + edge * (doorH - frame) / 2, doorZ, doorW - 2 * frame, frame, thickness)),
              { ...box(slot, x, y, doorZ, doorW - 2 * frame, doorH - 2 * frame, thickness * .32, '#c8e2dc'), glass: true },
            ] : [panel(slot, x, y, doorZ, doorW, doorH, thickness)]
          const handle = box('handles', meters(door.handle.x), meters(door.handleY), meters(door.handle.z),
            thickness * .65, meters(door.handleHeight), door.sliding ? thickness * .16 : thickness * .9, metal, 'metal')
          parts.push(...panels.map(swing), swing(handle))
        }
        return parts
      }
      if (item.kind === 'wardrobe') return [
        box('body', 0, h * .5, -d * .025, w, h, d * .95, fabric, 'wood', item.material),
        ...[-.251, .251].map(x => box('doors', w * x, h * .52, d * .469, w * .492, h * .93, d * .038, fabric, 'wood', item.material)),
        ...[-.038, .038].map(x => box('handles', w * x, h * .53, d * .491, w * .012, h * .10, d * .018, metal, 'metal')),
      ]
    {
      const board = Math.min(.018, w / 12, h / 8, d / 8)
      return [
        box('body', 0, h / 2, -d / 2 + board / 2, w, h, board, fabric, 'wood'),
        ...[-1, 1].map((side): Box => ({ ...box('body', side * (w - board) / 2, h / 2, -board / 2, board, h, d - board, fabric, 'wood'),
          ledMount: side < 0 ? 'left' : 'right' })),
        ...[board / 2, h / 2, h - board / 2].map((y, index): Box => ({ ...box('body', 0, y, -board,
          w - 2 * board, board, d - 2 * board, fabric, 'wood'), ledMount: ([undefined, 'shelf', 'ceiling'] as const)[index] })),
        ...[-1, 1].flatMap(side => [
          box('doors', side * w / 4, h / 2, d / 2 - board / 2, w / 2 - board * .25, h - board * .4, board, fabric, 'wood'),
          box('handles', side * w * .045, h * .21, d / 2 + board * .2, board * .52, h * .18, board * .6, metal, 'metal'),
        ]),
      ]
    }
    case 'sconce': {
      const globe = item.fixture?.variant !== 'bar'
      return [
        box('body', 0, h / 2, -d * .445, w * .55, h * .84, d * .11, fabric, 'metal'),
        box('body', 0, h * .30, -d * .09, w * .21, h * .12, d * .66, fabric, 'metal'),
        { ...box('shade', 0, h * .55, d * .055, w * .89, h * (globe ? .68 : .22), d * .77, '#eee6d4'),
          round: globe, emission: item.fixture?.on ? fixtureColor(item.fixture) : undefined },
      ]
    }
    case 'radiator': {
      const ribs = Math.min(16, Math.max(4, Math.round(w * 14)))
      return [
        box('body', 0, h / 2, 0, w, h, d * .6, fabric),
        ...Array.from({ length: ribs }, (_, i) => box('body', w * ((i + .5) / ribs - .5), h / 2, d * .355,
          w / ribs * .76, h * .92, d * .29, fabric)),
        box('grille', 0, h * .968, d * .09, w * .90, h * .045, d * .64, '#aaa7a1', 'metal'),
        ...[-1, 1].map(side => box('valves', side * w * .46, h * .07, d * .33, w * .08, h * .11, d * .27, '#b1ada3', 'metal')),
      ]
    }
    default:
      return [box('all', 0, h * .5, 0, w, h, d)]
  }
}
