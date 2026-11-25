import { elevationData, sizeInCm } from './elevation-data'
import { bounds, footprintCorners, itemBottom, obstructionVolume, roomEdges, wallMountPose, wallPoint } from './geometry'
import type { Rect, WallEdge } from './geometry'
import { passageText, readMeasurements } from './measurements'
import type { MeasurementReading } from './measurements'
import { fmt, furnitureAngle } from './model'
import type { Furniture, Point, Project, RoomSection } from './model'
import { openingLeaf } from './opening-door'
import { imagePdf, landscapeA4 } from './pdf-image-document'
import { cabinetDoors, localToRoom, movedDoorPoint } from './wardrobe'
import { assemblyObstacles, assemblyText, wardrobeAssembly } from './wardrobe-assembly'
import { sectionMark, sectionPoint, sectionProfile, sectionSpans } from './room-section'
import { wallSurvey } from './wall-survey'
import { mountingCodes } from './mounting-codes'
import { mountingReview, reviewLabels } from './mounting-review'
import { findingChangeLabel, findingText } from './revision-comparison'
import type { RevisionComparison } from './revision-comparison'
import { electricalIcons, electricalReadings } from './electrical-points'

type Canvas = CanvasRenderingContext2D
type PrintPage = { heading: string; subtitle: string; note?: string; draw: (ctx: Canvas) => void }
type Cell = string | number
type Column = { name: string; width: number }
type RevisionSummary = { from: string; fromCode: string; toCode: string; comparison: RevisionComparison }
const ink = '#203630'
const quiet = '#476055'
const green = '#14695b'
const red = '#ab4936'
const amber = '#936018'
const blue = '#21596e'
const margin = 13
const { width: paperW, height: paperH } = landscapeA4
const usableWidth = paperW - 2 * margin

function label(ctx: Canvas, value: Cell, x: number, y: number, options: {
  size?: number; color?: string; bold?: boolean; max?: number; align?: CanvasTextAlign; halo?: boolean;
} = {}) {
  const { size = 3.35, color = ink, bold = false, max, align = 'left', halo = false } = options
  let text = String(value)
  ctx.font = `${bold ? '700' : '400'} ${size}px "Segoe UI", Arial, sans-serif`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  if (max && ctx.measureText(text).width > max) {
    while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1)
    text += '…'
  }
  if (halo) {
    ctx.strokeStyle = 'white'
    ctx.lineWidth = .75
    ctx.lineJoin = 'round'
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
}

function stroke(ctx: Canvas, a: Point, b: Point, color = ink, thickness = .28) {
  ctx.beginPath()
  ctx.moveTo(a.x, a.z)
  ctx.lineTo(b.x, b.z)
  ctx.strokeStyle = color
  ctx.lineWidth = thickness
  ctx.stroke()
}

function polygon(ctx: Canvas, vertices: Point[], fill: string, outline = ink, thickness = .3) {
  ctx.beginPath()
  vertices.forEach((point, index) => index ? ctx.lineTo(point.x, point.z) : ctx.moveTo(point.x, point.z))
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = outline
  ctx.lineWidth = thickness
  ctx.stroke()
}

function badge(ctx: Canvas, point: Point, text: string, color = green) {
  ctx.beginPath()
  ctx.arc(point.x, point.z, 2.7, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'white'
  ctx.lineWidth = .24
  ctx.stroke()
  label(ctx, text, point.x, point.z, { color: 'white', size: text.length > 3 ? 2.1 : 2.65, bold: true, align: 'center' })
}

const electricalNote = 'P: priz · A: anahtar · K: aplik çıkışı. Ölçüler nokta merkezinedir.'
const electricalColumns = [
  { name: 'No.', width: 15 }, { name: 'Nokta', width: 52 }, { name: 'Başlangıç (cm)', width: 32 },
  { name: 'Yerden (cm)', width: 27 }, { name: 'Ölçü kaydı', width: 31 }, { name: 'Erişim / eşleşme', width: 114 },
]

function electricalBadges(ctx: Canvas, signals: { at: Point; label: string; color: string }[], occupied: Point[]) {
  const steps = [0, 6, -6, 12, -12, 18, -18, 24, -24, 30, -30]
  const shifts = steps.flatMap(x => steps.map(z => ({ x, z })))
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
  for (const { at, label, color } of signals) {
    const center = shifts.map(shift => ({ x: at.x + shift.x, z: at.z + shift.z }))
      .find(point => point.z >= 34 && point.z <= 139 && point.x >= 19 && point.x <= paperW - 19 &&
        occupied.every(other => Math.hypot(point.x - other.x, point.z - other.z) >= 6.2)) ?? at
    if (center !== at && (center.x !== at.x || center.z !== at.z)) {
      stroke(ctx, at, center, color)
      ctx.beginPath()
      ctx.arc(at.x, at.z, .7, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }
    badge(ctx, center, label, color)
    occupied.push(center)
  }
}

function diagram(model: Rect, area: Rect) {
  const needed = Math.max(model.width / area.width, model.depth / area.depth)
  const scale = [10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 2000, 5000]
    .find(value => value >= needed) ?? Math.ceil(needed / 1000) * 1000
  const x = area.x + (area.width - model.width / scale) / 2
  const z = area.z + (area.depth - model.depth / scale) / 2
  return { scale, point: (position: Point) => ({ x: x + (position.x - model.x) / scale, z: z + (position.z - model.z) / scale }) }
}

function table(ctx: Canvas, y: number, columns: Column[], rows: Cell[][], rowHeight = 8) {
  ctx.fillStyle = '#e8efe9'
  ctx.fillRect(margin, y, usableWidth, rowHeight)
  let x = margin
  for (const column of columns) {
    label(ctx, column.name, x + 2.2, y + rowHeight / 2, { max: column.width - 4.5, size: 3.15, bold: true })
    x += column.width
  }
  rows.forEach((row, index) => {
    const top = y + (index + 1) * rowHeight
    if (index % 2 === 1) { ctx.fillStyle = '#f4f6f2'; ctx.fillRect(margin, top, usableWidth, rowHeight) }
    let left = margin
    for (const [index, column] of columns.entries()) {
      label(ctx, row[index] ?? '', left + 2.2, top + rowHeight / 2, { bold: index === 0, max: column.width - 4.5, size: 3.2 })
      left += column.width
    }
    stroke(ctx, { x: margin, z: top + rowHeight }, { x: paperW - margin, z: top + rowHeight }, '#d4ded7', .18)
  })
}

function tablePages(pages: PrintPage[], heading: string, subtitle: string, columns: Column[], rows: Cell[][], note?: string) {
  for (let start = 0; start < rows.length; start += 17) {
    pages.push({ heading, subtitle: rows.length > 17 ? `${subtitle} · ${start + 1}-${Math.min(rows.length, start + 17)} / ${rows.length}` : subtitle, note,
      draw: ctx => table(ctx, 36, columns, rows.slice(start, start + 17)) })
  }
}

function wrappedRowGroups(columns: Column[], rows: Cell[][]) {
  const measurement = document.createElement('canvas').getContext('2d')
  if (!measurement) throw new Error('PDF metin ölçümü başlatılamadı.')
  return rows.map(row => {
    const cells = row.map((value, index) => {
      const lines: string[] = []
      const width = columns[index].width - 5
      measurement.font = `${index === 0 ? '700' : '400'} 3.2px "Segoe UI", Arial, sans-serif`
      let remaining = String(value)
      while (measurement.measureText(remaining).width > width) {
        let end = 1
        while (end < remaining.length && measurement.measureText(remaining.slice(0, end + 1)).width <= width) end++
        const space = remaining.lastIndexOf(' ', end)
        if (space > 0) end = space
        lines.push(remaining.slice(0, end))
        remaining = remaining.slice(end).trimStart()
      }
      return [...lines, remaining]
    })
    return Array.from({ length: Math.max(...cells.map(lines => lines.length)) }, (_, index) =>
      cells.map(lines => lines[index] ?? ''))
  })
}

function wrappedRows(columns: Column[], rows: Cell[][]) {
  return wrappedRowGroups(columns, rows).flat()
}

function rectangle({ x, z, width, depth }: Rect): Point[] {
  return [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }]
}

function planPage(project: Project, edges: WallEdge[], items: Furniture[], measurements: MeasurementReading[]): PrintPage {
  const outlines = items.map(item => ({ item, shape: footprintCorners(item) }))
  const floor = edges.map(edge => edge.a)
  const model = bounds([...floor, ...outlines.flatMap(outline => outline.shape)])
  const { scale, point } = diagram(model, { x: 28, z: 50, width: paperW - 56, depth: 129 })
  return { heading: 'Ölçülü oda planı', subtitle: `${fmt(project.height)} cm oda yüksekliği · ${fmt(project.thickness)} cm duvar kalınlığı`,
    note: `Ölçek 1:${scale} · %100 boyutta yazdırın. E işaretleri eşya listesindeki, Ö işaretleri ölçü listesindeki sırayı gösterir.`,
    draw: ctx => {
      polygon(ctx, floor.map(point), '#f6f5ee', '#3c5048', 1.1)
      for (const edge of edges) {
        const outward = (p: Point) => ({ x: p.x - edge.nx * 7, z: p.z - edge.nz * 7 })
        const a = outward(point(edge.a)), b = outward(point(edge.b))
        stroke(ctx, a, b, quiet, .22)
        for (const p of [a, b]) stroke(ctx, { x: p.x - edge.nx * 1.4, z: p.z - edge.nz * 1.4 },
          { x: p.x + edge.nx * 1.4, z: p.z + edge.nz * 1.4 }, quiet, .22)
        const span = Math.hypot(a.x - b.x, a.z - b.z)
        if (span >= 13) {
          ctx.save()
          ctx.translate((a.x + b.x) / 2, (a.z + b.z) / 2)
          if (edge.dx === 0) ctx.rotate(-Math.PI / 2)
          label(ctx, `${fmt(edge.wall.length)} cm`, 0, -2.1, { align: 'center', bold: true, size: 3.15, halo: true })
          ctx.restore()
        }
        for (const opening of edge.wall.openings) {
          const from = point(wallPoint(edge, opening.offset))
          const to = point(wallPoint(edge, opening.offset + opening.width))
          stroke(ctx, from, to, opening.kind === 'window' ? '#91bbbe' : 'white', 1.4)
          const leaf = openingLeaf(edge, opening)
          if (leaf) stroke(ctx, point(leaf.hinge), point(leaf.tip), '#8d6747', .85)
        }
        for (const obstacle of edge.wall.obstacles) {
          polygon(ctx, rectangle(obstructionVolume(edge, obstacle)).map(point), obstacle.bottom ? '#eedbac' : '#c9d1c6', '#7b806f', .32)
        }
      }
      const numbers = new Map(items.map((item, index) => [item.id, index + 1]))
      for (const { item, shape } of outlines.sort((a, b) => itemBottom(a.item, project.height) - itemBottom(b.item, project.height))) {
        ctx.globalAlpha = .75
        polygon(ctx, shape.map(point), item.color, '#54675f')
        ctx.globalAlpha = 1
        if (item.wardrobe?.pose !== 'none') for (const door of cabinetDoors(item)) {
          const center = localToRoom(item, movedDoorPoint(door, door.center))
          const leaf = footprintCorners({ ...center, width: door.width, depth: door.depth, rotation: 0,
            angle: furnitureAngle(item) + door.yaw * 180 / Math.PI })
          polygon(ctx, leaf.map(point), item.wardrobe?.front === 'glass' ? '#cfe5df' : item.color, '#52665e', .35)
        }
        badge(ctx, point(item), `E${numbers.get(item.id)}`, '#455f54')
      }
      for (const reading of measurements) {
        const active = 'modes' in reading ? reading.modes.find(mode => mode.mode === 'saved') : undefined
        const mark = active ?? ('mark' in reading ? reading.mark : undefined)
        if (!mark) continue
        const a = point(mark.start), b = point(mark.end)
        const color = reading.warning ? red : green
        const offset = a.x > paperW - 51 ? -1 : 1
        const origin = reading.measurement.kind === 'passage' ? point(reading.measurement.origin)
          : reading.measurement.kind === 'height' ? { x: a.x + offset * 7.5, z: a.z - 4 } : a
        if (reading.measurement.kind === 'height') stroke(ctx, a, origin, color, .28)
        else stroke(ctx, a, b, color, .55)
        badge(ctx, origin, `Ö${reading.number}`, color)
        const length = Math.hypot(a.x - b.x, a.z - b.z)
        label(ctx, reading.text, length < 2 ? origin.x + offset * 4 : (a.x + b.x) / 2,
          length < 2 ? origin.z : (a.z + b.z) / 2 - 2.4,
          { align: length < 2 ? offset > 0 ? 'left' : 'right' : 'center', color, bold: true, halo: true, size: 3.45, max: 45 })
      }
      project.sections?.forEach((section, index) => {
        for (const { from, to } of sectionSpans(project, section)) {
          const a = point(sectionPoint(section, from)), b = point(sectionPoint(section, to))
          ctx.setLineDash([2, 1])
          stroke(ctx, a, b, '#6b4974', .55)
          ctx.setLineDash([])
          label(ctx, sectionMark(index), a.x + 2, a.z - 1.8, { color: '#6b4974', bold: true, halo: true, size: 3.4 })
        }
      })
      const origin = point(floor[0])
      label(ctx, '(0, 0)', origin.x + 1.5, origin.z + 3.9, { size: 2.8, color: quiet, halo: true })
    },
  }
}

function sectionPages(pages: PrintPage[], project: Project, section: RoomSection, index: number) {
  const profile = sectionProfile(project, section)
  const heading = `Kesit ${sectionMark(index)} · ${section.name}`
  if (!profile.rooms.length) {
    pages.push({ heading, subtitle: 'Kesit çizgisi mevcut oda sınırlarının dışında.', draw: () => {} })
    return
  }
  const { scale, point } = diagram(profile.area, { x: 24, z: 49, width: usableWidth - 22, depth: 124 })
  pages.push({
    heading,
    subtitle: `${section.axis.toUpperCase()} yönü · ${fmt(section.offset)} cm konum · tavan ${fmt(profile.height)} cm`,
    note: `Ölçek 1:${scale} · %100 boyutta yazdırın. Kesikli yay gardırobun arka üst köşesinin kaldırma yolunu gösterir.`,
    draw: ctx => {
      for (const { from, to } of profile.rooms) {
        polygon(ctx, rectangle({ x: from, z: -profile.height, width: to - from, depth: profile.height }).map(point), '#f6f5ee')
      }
      for (const [index, slice] of [...profile.blocks, ...profile.furniture].entries()) {
        const { from, to, bottom, top, color } = slice
        polygon(ctx, rectangle({ x: from, z: -top, width: to - from, depth: top - bottom }).map(point), color)
        badge(ctx, point({ x: (from + to) / 2, z: -(top + bottom) / 2 }), String(index + 1), '#455f54')
      }
      for (const { from, bottom, top, color } of profile.portals) {
        stroke(ctx, point({ x: from, z: -bottom }), point({ x: from, z: -top }), color, .95)
      }
      for (const { arc, ceiling, top, gapAt, gap } of profile.wardrobes) {
        const a = point({ x: gapAt, z: -ceiling }), b = point({ x: gapAt, z: -top })
        stroke(ctx, a, b, gap < 0 ? red : green, .75)
        label(ctx, `${fmt(gap)} cm`, a.x + 2, (a.z + b.z) / 2, { halo: true, bold: true })
        ctx.setLineDash([1.4, .9])
        for (let i = 1; i < arc.length; i++) stroke(ctx, point(arc[i - 1]), point(arc[i]), '#9c532b', .42)
        ctx.setLineDash([])
      }
    },
  })
  tablePages(pages, `Kesit ${sectionMark(index)} ölçüleri`, section.name, [
    { name: 'No', width: 14 }, { name: 'Eleman', width: 64 }, { name: 'Alt / üst kot (cm)', width: 37 },
    { name: 'Gardırop boşluğu ve kaldırma kontrolü', width: 156 },
  ], [...profile.blocks, ...profile.furniture].map((slice, index) => {
    const check = profile.wardrobes.find(entry => entry.slice === slice)
    return [index + 1, slice.name, `${fmt(slice.bottom)} / ${fmt(slice.top)}`, check ? `Net ${fmt(check.gap)} cm · ${check.lift}` : '']
  }))
}

const mountColumns: Column[] = [
  { name: 'No', width: 12 }, { name: 'Eşya', width: 83 }, { name: 'Sol kenar', width: 28 }, { name: 'Merkez', width: 27 },
  { name: 'Alt kot', width: 24 }, { name: 'Üst kot', width: 24 }, { name: 'G × D × Y', width: 73 },
]
const mountNote = 'Sol kenar ve merkez duvar başlangıcından, alt ve üst kot bitmiş zeminden ölçülür. Değerler cm.'

function wallPages(pages: PrintPage[], project: Project, edge: WallEdge, edges: WallEdge[]) {
  const { mounted, objects } = elevationData(project, edge, edges)
  const { wall } = edge
  const w = wall.length, h = project.height
  const title = `Duvar ${edge.index + 1}`
  const { scale, point } = diagram({ x: 0, z: 0, width: w, depth: h },
    { x: 26, z: 35, width: paperW - 52, depth: 107 })
  const rows = mounted.map(object => [object.number, object.item.name, fmt(object.left), fmt(object.center),
    fmt(object.bottom), fmt(object.top), sizeInCm(object.item)])
  const electrical = electricalReadings(project, edges, wall.id)
    .sort((a, b) => a.point.offset - b.point.offset || a.point.height - b.point.height)
    .map((reading, i) => ({ ...reading, number: `${electricalIcons[reading.point.kind]}${i + 1}` }))
  const measuredRows = electrical.length ? wrappedRowGroups(electricalColumns, electrical.map(({ number, point, status, detail }) =>
    [number, point.name, fmt(point.offset), fmt(point.height), point.example ? 'Örnek ölçü' : 'Girilen ölçü',
      status === 'warning' ? `Uyarı · ${detail}` : detail])) : []
  const electricalTables: Cell[][][] = [[]]
  for (const group of measuredRows) {
    if (electricalTables.at(-1)!.length + group.length > (electricalTables.length === 1 ? 5 : 17)) electricalTables.push([])
    for (const row of group) {
      if (electricalTables.at(-1)!.length === 17) electricalTables.push([])
      electricalTables.at(-1)!.push(row)
    }
  }
  const [wallTable, ...continuations] = electricalTables
  const tableNote = electrical.length ? electricalNote : rows.length ? mountNote : ''
  pages.push({ heading: `${title} görünüşü`, subtitle: `${fmt(w)} cm duvar uzunluğu · ${fmt(h)} cm toplam yükseklik`,
      note: `Ölçek 1:${scale} · %100 boyutta yazdırın.${tableNote ? ` ${tableNote}` : ''}`,
      draw: (ctx: Canvas) => {
        const block = (x: number, z: number, width: number, depth: number, fill: string, outline: string) =>
          polygon(ctx, rectangle({ x, z, width, depth }).map(point), fill, outline)
        block(0, 0, w, h, '#f3f3ec', '#50635a')
        for (const opening of wall.openings) block(opening.offset, h - opening.height - opening.bottom,
          opening.width, opening.height, opening.kind === 'window' ? '#dae9e8' : '#ffffff', '#90a8a3')
        for (const object of objects) {
          ctx.globalAlpha = object.mounted ? .84 : .40
          block(object.left, h - object.top, object.width, object.top - object.bottom,
            object.item.color, object.mounted ? green : '#617167')
          ctx.globalAlpha = 1
        }
        for (const obstacle of wall.obstacles) {
          block(obstacle.offset, h - obstacle.top, obstacle.width, obstacle.top - obstacle.bottom, '#efddaf', '#a37a44')
        }
        for (const { number, center, bottom, top } of mounted) {
          ctx.setLineDash([1.05, .8])
          stroke(ctx, point({ x: center, z: h - bottom }), point({ x: center, z: h }), green)
          ctx.setLineDash([])
          badge(ctx, point({ x: center, z: h - (bottom + top) / 2 }), String(number))
        }
        if (electrical.length) {
          electricalBadges(ctx, electrical.map(({ point: marker, number, status }) => ({
            at: point({ x: marker.offset, z: h - marker.height }), label: number,
            color: status === 'warning' ? red : status === 'pending' ? amber : blue,
          })), mounted.map(({ center, bottom, top }) => point({ x: center, z: h - (bottom + top) / 2 })))
        }
        const left = point({ x: 0, z: h }), right = point({ x: w, z: h })
        label(ctx, 'Duvar başlangıcı', left.x, left.z + 4.5, { size: 3, color: quiet })
        label(ctx, 'Bitmiş zemin · 0 cm', right.x, right.z + 4.5, { size: 3, color: quiet, align: 'right' })
        if (electrical.length) {
          if (wallTable.length) table(ctx, 151, electricalColumns, wallTable, 7)
          else label(ctx, 'Nokta ölçüleri ve erişim bilgileri sonraki sayfada.', margin, 156, { color: quiet })
        } else if (rows.length) table(ctx, 153, mountColumns, rows.slice(0, 4), 7.7)
      } })
  for (const rows of continuations) {
    pages.push({ heading: `${title} · elektrik noktaları`, subtitle: 'Nokta ölçüleri · devam',
      note: electricalNote, draw: ctx => table(ctx, 36, electricalColumns, rows) })
  }
  tablePages(pages, `${title} · montaj listesi`, electrical.length ? 'Montaj ölçüleri' : 'Montaj ölçüleri · devam',
    mountColumns, electrical.length ? rows : rows.slice(4), mountNote)
}

async function reviewPages(pages: PrintPage[], project: Project) {
  const rows = mountingReview(project)
  const { layout, revision } = await mountingCodes(project)
  const attention = rows.filter(row => row.status !== 'passed')
  const subtitle = `Kontrol sürümü ${revision} · Yerleşim kodu ${layout}`
  const note = `${rows.filter(row => row.status === 'warning').length} uyarı · ${rows.filter(row => row.status === 'pending').length} bilgi bekliyor · ${rows.filter(row => row.status === 'passed').length} uygun`
  if (!attention.length) {
    pages.push({ heading: 'Montaj öncesi kontrol', subtitle, note,
      draw: ctx => label(ctx, rows.length ? 'Kayıtlı kontrollerde açık uyarı veya bekleyen bilgi yok.'
        : 'Kontrol edilecek eşya veya ölçü bulunamadı.', margin, 42) })
    return
  }
  const columns = [
    { name: 'Durum', width: 30 }, { name: 'Eşya / ölçü', width: 53 }, { name: 'Kontrol', width: 44 },
    { name: 'Bulgu', width: 144 },
  ]
  const rowsForPrint = attention.map(row => [reviewLabels[row.status], row.subject, row.check, row.detail])
  tablePages(pages, 'Montaj öncesi kontrol', subtitle, columns, wrappedRows(columns, rowsForPrint), note)
}

function revisionPages(pages: PrintPage[], summary: RevisionSummary) {
  const { plan, checks } = summary.comparison
  const changed = checks.filter(row => row.changed)
  const note = `Kontrol sürümleri · ${summary.fromCode} → ${summary.toCode}`
  const subtitle = `Önceki teslim · ${summary.from}`
  if (!plan.length && !changed.length) {
    pages.push({ heading: 'Teslim sürümü değişiklikleri', subtitle, note,
      draw: ctx => label(ctx, 'Plan ölçüleri ve montaj bulguları eşleşiyor.', margin, 42) })
    return
  }
  const planColumns = [
    { name: 'Plan değişikliği', width: 62 }, { name: 'Önce', width: 87 }, { name: 'Sonra', width: 87 }, { name: 'Fark', width: 35 },
  ]
  const planRows = plan.flatMap(row => row.changes.map(field => [
    `${row.name} · ${field.label}`, field.before, field.after, field.delta ?? '',
  ]))
  tablePages(pages, 'Teslim sürümü değişiklikleri', subtitle, planColumns, wrappedRows(planColumns, planRows), note)
  const checkColumns = [{ name: 'Montaj kontrolü', width: 62 }, { name: 'Önce', width: 104 }, { name: 'Sonra', width: 105 }]
  const checkRows = changed.map(row => {
    const finding = (row.after ?? row.before)!
    return [`${findingChangeLabel[row.kind]} · ${finding.subject} · ${finding.check}`, findingText(row.before),
      [findingText(row.after), row.delta].filter(Boolean).join(' · ')]
  })
  tablePages(pages, 'Montaj bulgularındaki değişiklikler', subtitle, checkColumns, wrappedRows(checkColumns, checkRows), note)
}

export async function installationPdf(project: Project, layout: string, wallIds: ReadonlySet<string>, includeReview = false,
  revisionName?: string, summary?: RevisionSummary) {
  const edges = roomEdges(project.walls)
  const items = project.items.map(item => wallMountPose(item, edges))
  const measurements = readMeasurements(project, edges, items)
  const pages = [planPage(project, edges, items, measurements)]
  if (includeReview) await reviewPages(pages, project)
  if (summary) revisionPages(pages, summary)
  project.sections?.forEach((section, index) => sectionPages(pages, project, section, index))
  for (const edge of edges.filter(edge => wallIds.has(edge.wall.id))) {
    wallPages(pages, project, edge, edges)
  }
  for (const edge of edges) {
    const reading = wallSurvey(project, edge)
    if (!reading) continue
    const { rows, result, survey } = reading
    tablePages(pages, `Duvar ${edge.index + 1} · saha ölçüleri`, result
      ? `Plan ${fmt(edge.wall.length)} cm · Ortak net genişlik ${fmt(result.usable)} cm · Her uçta ${fmt(survey.allowance)} cm pay`
      : 'Ortak net genişlik için üç kotun ölçüsü gerekir.', [
      { name: 'Ölçü / modül', width: 113 }, { name: 'Sonuç', width: 158 },
    ], [
      ...rows.map(row => [row.label, row.width === undefined ? 'Ölçülmedi' : `${fmt(row.width)} cm`]),
      ...(result?.modules ?? []).map(({ item, deficit }) =>
        [item.name, deficit ? `Montaj aralığını ${fmt(deficit)} cm aşıyor` : 'Ortak montaj aralığında']),
    ], 'Genişlikler aynı sabit duvar başlangıcına göre değerlendirilir.')
  }
  tablePages(pages, 'Eşya listesi', 'Dış ölçüler ve yerleşim bilgileri (cm)', [
    { name: 'No', width: 15 }, { name: 'Eşya', width: 77 }, { name: 'G × D × Y', width: 53 },
    { name: 'Merkez X / Z', width: 49 }, { name: 'Montaj', width: 46 }, { name: 'Alt kot', width: 31 },
  ], items.map((item, index) => {
    const wall = edges.find(edge => edge.wall.id === item.mount?.wallId)
    return [`E${index + 1}`, item.name, sizeInCm(item), `${fmt(item.x)} / ${fmt(item.z)}`,
      wall ? `Duvar ${wall.index + 1}` : item.mount ? 'Duvar seçilmeli' : item.kind === 'pendant' ? 'Tavan' : 'Zemin',
      fmt(itemBottom(item, project.height))]
  }), 'Merkez konumu, plandaki (0, 0) noktasından ölçülür. X sağa, Z aşağı yönelir. Değerler cm.')
  const wardrobes = items.filter(item => item.kind === 'wardrobe')
  const blocks = wardrobes.length ? assemblyObstacles(project) : []
  tablePages(pages, 'Gardırop montaj boşluğu', 'Gövdenin son konumundaki geometrik kontrol', [
    { name: 'Eşya', width: 66 }, { name: 'Kaldırma kotu', width: 32 }, { name: 'Kaldırma', width: 60 },
    { name: 'Dik kurulum kotu', width: 39 }, { name: 'Dik kurulum', width: 74 },
  ], wardrobes.map(item => {
    const check = wardrobeAssembly(project, item, blocks)
    return [item.name, `${fmt(check.diagonal)} cm`, assemblyText(check, 'raise'),
      `${fmt(check.uprightHeight)} cm`, assemblyText(check, 'stand')]
  }), 'Kaldırma ekseni ön alt kenardır. Dik kurulum kotu girilen üst çalışma payını içerir.')
  tablePages(pages, 'Kayıtlı ölçüler', 'Seçilen yerleşimde ölçülen boşluklar', [
    { name: 'No', width: 15 }, { name: 'Ölçü', width: 115 }, { name: 'Kayıtlı değer', width: 55 },
    { name: 'Kapalı', width: 43 }, { name: 'Açık', width: 43 },
  ], measurements.map(reading => [`Ö${reading.number}`, reading.measurement.name, reading.text,
    'modes' in reading ? passageText(reading.modes[0]) : '', 'modes' in reading ? passageText(reading.modes[2]) : '']))

  const dpi = 9
  const surface = document.createElement('canvas')
  surface.width = paperW * dpi
  surface.height = paperH * dpi
  const ctx = surface.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('PDF çizimi başlatılamadı.')
  ctx.setTransform(dpi, 0, 0, dpi, 0, 0)
  const images = []
  for (const [index, page] of pages.entries()) {
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, paperW, paperH)
    label(ctx, page.heading, margin, 12, { size: 6.9, bold: true })
    label(ctx, `${project.title} / ${layout}`, margin, 20, { color: quiet, max: 245 })
    label(ctx, page.subtitle, margin, 26, { color: quiet, size: 3.1, max: usableWidth })
    stroke(ctx, { x: margin, z: 30 }, { x: paperW - margin, z: 30 }, '#b6c8bd', .33)
    page.draw(ctx)
    stroke(ctx, { x: margin, z: 194 }, { x: paperW - margin, z: 194 }, '#b6c8bd', .33)
    label(ctx, page.note ?? 'MyHome · Ölçüler cm', margin, 200, { color: quiet, size: 2.95, max: 245 })
    if (revisionName) label(ctx, `Proje sürümü · ${revisionName}`, margin, 205, { color: quiet, size: 2.95, max: 245 })
    label(ctx, `${index + 1} / ${pages.length}`, paperW - margin, 200, { align: 'right', bold: true })
    const image = await new Promise<Blob>((resolve, reject) => surface.toBlob(blob =>
      blob ? resolve(blob) : reject(new Error('PDF sayfası kaydedilemedi.')), 'image/jpeg', .965))
    images.push({ jpeg: new Uint8Array(await image.arrayBuffer()), width: surface.width, height: surface.height })
  }
  surface.width = surface.height = 1
  return imagePdf(images)
}
