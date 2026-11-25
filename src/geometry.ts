import { directions, fmt, furnitureAngle, meters, normalizeAngle, projectItemLists, projectSchema, projectTextures, wardrobeZones } from './model'
import type { Appearance, Furniture, FurnitureMaterial, Obstacle, Opening, Point, Project, Wall, WallMount } from './model'
import { orderFurnitureLinks } from './furniture-links'
import { keepExistingClearances } from './keep-clear-data'
import { keepUpperRows } from './upper-row-data'
import { curtainPanels } from './curtain-shape'
import { pendantParts } from './pendant'
import { defaultTrimAppearance, trimLabels, wallTrimPieces } from './wall-trim'
import type { TrimPiece } from './wall-trim'

export type Rect = { x: number; z: number; width: number; depth: number }
export type Volume = Rect & { bottom: number; top: number }
export type WallEdge = {
  wall: Wall; a: Point; b: Point; dx: number; dz: number; nx: number; nz: number; index: number
}

export function vertices(walls: Wall[]): Point[] {
  const points = [{ x: 0, z: 0 }]
  for (const wall of walls) {
    const [dx, dz] = directions[wall.dir]
    const last = points[points.length - 1]
    points.push({ x: last.x + dx * wall.length, z: last.z + dz * wall.length })
  }
  return points
}

export function twiceArea(points: Point[]): number {
  return points.reduce((sum, p, index) => {
    const next = points[(index + 1) % points.length]
    return sum + p.x * next.z - p.z * next.x
  }, 0)
}

export function roomEdges(walls: Wall[]): WallEdge[] {
  const points = vertices(walls)
  const sign = twiceArea(points) >= 0 ? 1 : -1
  return walls.map((wall, index) => {
    const [dx, dz] = directions[wall.dir]
    return { wall, index, a: points[index], b: points[index + 1], dx, dz, nx: -dz * sign, nz: dx * sign }
  })
}

export function wallPoint(edge: WallEdge, along: number, inward = 0): Point {
  return { x: edge.a.x + edge.dx * along + edge.nx * inward, z: edge.a.z + edge.dz * along + edge.nz * inward }
}

export function sillWidthLimit(wall: Wall, opening: Opening) {
  const center = opening.offset + opening.width / 2
  return Math.max(1, Math.floor(2 * Math.min(center, wall.length - center)))
}

export function windowSill(wall: Wall, opening: Opening) {
  const sill = opening.sill
  if (opening.kind !== 'window' || !sill) return
  const width = Math.min(sill.width, sillWidthLimit(wall, opening))
  return { ...sill, width, thickness: Math.min(sill.thickness, opening.height), start: opening.offset + (opening.width - width) / 2 }
}

export function sillVolume(edge: WallEdge, opening: Opening, thickness: number, interiorOnly = false): Volume | undefined {
  const sill = windowSill(edge.wall, opening)
  if (!sill || (interiorOnly && sill.depth <= thickness)) return
  const outside = interiorOnly ? 0 : -thickness
  return {
    ...bounds([wallPoint(edge, sill.start, outside), wallPoint(edge, sill.start + sill.width, sill.depth - thickness)]),
    bottom: opening.bottom, top: opening.bottom + sill.thickness,
  }
}

export const sillColor = (finish: NonNullable<Opening['sill']>['finish']) => finish === 'gray' ? '#a3a4a5' : '#eee6db'
export const sillAppearance = (sill: NonNullable<Opening['sill']>): Appearance =>
  sill.appearance ?? { preset: 'marble', color: sillColor(sill.finish), roughness: .24, relief: .22 }

export function trimVolume(edge: WallEdge, piece: TrimPiece): Volume {
  return { ...bounds([wallPoint(edge, piece.start), wallPoint(edge, piece.end, piece.depth)]),
    bottom: piece.bottom, top: piece.top }
}

export function sillTouchesParts(sill: Volume, parts: ReturnType<typeof furnitureVolumes>) {
  const { x, z, width, depth } = sill
  const outline = [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }]
  return parts.some(part => part.bottom < sill.top && part.top > sill.bottom && overlapsShape(part.shape, outline))
}

export function mountOffset(edge: WallEdge, width: number, along: number) {
  const margin = Math.min(Math.ceil(width / 2), Math.floor(edge.wall.length / 2))
  return Math.round(Math.max(margin, Math.min(edge.wall.length - margin, along)))
}

export function mountedCenter(item: Furniture, edge: WallEdge) {
  const window = item.curtain && edge.wall.openings.find(opening => opening.kind === 'window' && opening.id === item.curtain?.windowId)
  const center = item.mount!.offset
  if (window) return window.offset + window.width / 2
  const margin = Math.min(item.width / 2, edge.wall.length / 2)
  return Math.max(margin, Math.min(edge.wall.length - margin, center))
}

export function wallMountPose(item: Furniture, edges: WallEdge[]) {
  const mount = item.mount
  if (!mount) return item
  const edge = edges.find(edge => edge.wall.id === mount.wallId)
  if (!edge) return item
  return { ...item, ...wallPoint(edge, mountedCenter(item, edge), (item.curtain?.setback ?? 0) + item.depth / 2),
    angle: normalizeAngle(Math.atan2(-edge.nx, edge.nz) * 180 / Math.PI) }
}

export function attachToWall(item: Furniture, mount: WallMount, edges: WallEdge[]): Furniture {
  const placed = wallMountPose({ ...item, mount }, edges)
  return { ...placed, x: Math.round(placed.x), z: Math.round(placed.z) }
}

export function moveAlongWall(item: Furniture, point: Point, edges: WallEdge[]): Furniture {
  if (item.curtain) return item
  if (!item.mount) return { ...item, ...point }
  const edge = edges.find(edge => edge.wall.id === item.mount?.wallId)
  if (!edge) return item
  const along = (point.x - edge.a.x) * edge.dx + (point.z - edge.a.z) * edge.dz
  return attachToWall(item, { ...item.mount, offset: mountOffset(edge, item.width, along) }, edges)
}

export const itemBottom = (item: Furniture, roomHeight: number) =>
  item.kind === 'pendant' ? roomHeight - item.height : item.mount?.bottom ?? 0

export function curtainRadiatorReadings(project: Project, item: Furniture, edges: WallEdge[]) {
  const curtain = item.curtain
  const edge = edges.find(edge => edge.wall.id === item.mount?.wallId)
  if (!curtain || !edge) return []
  const center = mountedCenter(item, edge)
  const panels = curtainPanels(item.width, curtain.open)
  const bottom = itemBottom(item, project.height)
  return project.items.filter(other => other.kind === 'radiator' && other.mount?.wallId === edge.wall.id).map(radiator => {
    const along = mountedCenter(radiator, edge)
    const panelInFront = panels.some(panel =>
      Math.abs(center + panel.center - along) < (panel.width + radiator.width) / 2)
    const lower = itemBottom(radiator, project.height)
    const vertical = Math.max(bottom - (lower + radiator.height), lower - (bottom + item.height))
    const horizontal = curtain.setback - radiator.depth
    const clearance = vertical >= 0 || horizontal >= 0 ? Math.hypot(Math.max(0, horizontal), Math.max(0, vertical))
      : Math.max(vertical, horizontal)
    return { id: radiator.id, name: radiator.name, clearance: panelInFront ? clearance : undefined }
  })
}

export function bounds(points: Point[]): Rect {
  const xs = points.map(p => p.x)
  const zs = points.map(p => p.z)
  const x = Math.min(...xs)
  const z = Math.min(...zs)
  return { x, z, width: Math.max(...xs) - x, depth: Math.max(...zs) - z }
}

const low = (a: number, b: number) => Math.min(a, b)
const high = (a: number, b: number) => Math.max(a, b)

export function validateOutline(walls: Wall[]): string | undefined {
  if (walls.length < 4 || walls.length > 60 || walls.some(w => !Number.isInteger(w.length) || w.length < 1 || w.length > 50_000)) {
    return 'Oda için 4–60 duvar ve pozitif geçerli ölçüler girin.'
  }
  const points = vertices(walls)
  const last = points[points.length - 1]
  if (last.x || last.z) return `Plan kapanmıyor. Yatay fark ${fmt(Math.abs(last.x))} cm, dikey fark ${fmt(Math.abs(last.z))} cm.`
  for (let i = 0; i < walls.length; i++) {
    if (walls[i].dir % 2 === walls[(i + 1) % walls.length].dir % 2) return 'Komşu duvarlar 90° dönmeli.'
    const a = points[i]
    const b = points[i + 1]
    for (let j = i + 2; j < walls.length; j++) {
      if (i === 0 && j === walls.length - 1) continue
      const c = points[j]
      const d = points[j + 1]
      if (low(a.x, b.x) <= high(c.x, d.x) && high(a.x, b.x) >= low(c.x, d.x)
        && low(a.z, b.z) <= high(c.z, d.z) && high(a.z, b.z) >= low(c.z, d.z)) {
        return 'Oda sınırındaki duvarlar kesişiyor. Köşeleri kontrol edin.'
      }
    }
  }
  if (twiceArea(points) === 0) return 'Odanın alanı sıfır olamaz.'
}

export function validateProject(project: Project): string | undefined {
  const format = projectSchema.safeParse(project)
  if (!format.success) return 'Proje alanlarından biri geçersiz veya desteklenen sınırları aşıyor.'
  const media = validateMediaSize(project)
  if (media) return media
  const outline = validateOutline(project.walls)
  if (outline) return outline
  const ids = new Set<string>()
  for (const entry of [...project.walls, ...project.walls.flatMap(w => [...w.openings, ...w.obstacles, ...(w.electricalPoints ?? []), ...(w.baseboard?.gaps ?? [])])]) {
    if (ids.has(entry.id)) return 'Projedeki öğe kimlikleri benzersiz olmalı.'
    ids.add(entry.id)
  }
  for (const items of projectItemLists(project)) {
    const itemIds = new Set(ids)
    for (const item of items) {
      if (itemIds.has(item.id)) return 'Yerleşimdeki öğe kimlikleri benzersiz olmalı.'
      itemIds.add(item.id)
    }
  }
  for (const { items, furnitureLinks, keepClear, upperCabinetRows } of [project, ...(project.layouts?.entries ?? [])]) {
    if (items && (keepUpperRows(upperCabinetRows, items) !== upperCabinetRows || upperCabinetRows?.some(row =>
      !project.walls.some(w => w.id === row.wallId) || row.members.some(id => items.find(i => i.id === id)?.mount?.wallId !== row.wallId)))) {
      return 'Üst dolap sırasının duvarını, modüllerini ve yatak referansını kontrol edin.'
    }
    if (items && keepExistingClearances(items, keepClear) !== keepClear) return 'Boş tutulacak alanın bağlı olduğu eşya veya dizi bulunamadı.'
    if (!items || !furnitureLinks?.length) continue
    const { error } = orderFurnitureLinks(items, furnitureLinks)
    if (error) return error
  }
  for (const [i, wall] of project.walls.entries()) {
    if (wall.baseboard?.gaps?.some(gap => gap.start + gap.width > wall.length)) {
      return `Duvar ${i + 1} üzerindeki süpürgelik boşluğu duvar sınırını aşıyor.`
    }
    if (wall.electricalPoints?.some(point => point.offset > wall.length || point.height > project.height)) {
      return `Duvar ${i + 1} üzerindeki elektrik noktası duvar sınırını aşıyor.`
    }
    for (const [index, opening] of wall.openings.entries()) {
      if (opening.offset + opening.width > wall.length || opening.bottom + opening.height > project.height
        || (opening.kind === 'door' && opening.bottom !== 0)) return `Duvar ${i + 1} üzerindeki açıklık duvar sınırlarını aşıyor.`
      if (wall.openings.slice(0, index).some(other =>
        opening.offset < other.offset + other.width && other.offset < opening.offset + opening.width
        && opening.bottom < other.bottom + other.height && other.bottom < opening.bottom + opening.height)) {
        return `Duvar ${i + 1} üzerindeki açıklıklar çakışıyor.`
      }
    }
    for (const o of wall.obstacles) {
      if (o.offset + o.width > wall.length || o.top > project.height || o.bottom >= o.top) {
        return `Duvar ${i + 1} üzerindeki çıkıntının konumu veya kotları geçersiz.`
      }
    }
  }
}

export function validateMediaSize(project: Project): string | undefined {
  const embedded = projectItemLists(project).flat().reduce((total, item) =>
    total + (item.model?.source === 'upload' ? item.model.data.length : 0), project.sketch?.length ?? 0)
  const textures = projectTextures(project).reduce((total, texture) => total + texture.data.length, 0)
  const photometry = projectItemLists(project).flat().reduce((total, item) => total + (item.fixture?.ies?.text.length ?? 0) * 6, 0)
  if (embedded + textures + photometry > 50 * 1024 * 1024) return 'Bu proje gömülü dosya boyutu sınırına ulaştı.'
}

export function obstructionVolume(edge: WallEdge, obstacle: Obstacle): Volume {
  return { ...bounds([wallPoint(edge, obstacle.offset), wallPoint(edge, obstacle.offset + obstacle.width, obstacle.depth)]),
    bottom: obstacle.bottom, top: obstacle.top }
}

export function footprint(item: Furniture): Rect {
  return bounds(footprintCorners(item))
}

const epsilon = 1e-6
export function itemAxes(item: Pick<Furniture, 'angle' | 'rotation'>) {
  const angle = furnitureAngle(item) * Math.PI / 180
  const c = Math.cos(angle), s = Math.sin(angle)
  const cos = Math.abs(c) < epsilon ? 0 : c
  const sin = Math.abs(s) < epsilon ? 0 : s
  return { cos, sin }
}
export function footprintCorners(item: Pick<Furniture, 'x' | 'z' | 'width' | 'depth' | 'rotation' | 'angle'>): Point[] {
  const { cos, sin } = itemAxes(item)
  const w = item.width / 2, d = item.depth / 2
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => ({
    x: item.x + x * cos - z * sin, z: item.z + x * sin + z * cos,
  }))
}

export function furnitureVolumes(item: Furniture, roomHeight: number) {
  const bottom = itemBottom(item, roomHeight), top = bottom + item.height
  if (item.kind === 'rug') return []
  if (item.wardrobe?.stack?.type === 'niche') {
    const { lowerTop, upperBottom } = wardrobeZones(item), shape = footprintCorners(item)
    return [{ shape, bottom, top: bottom + lowerTop }, { shape, bottom: bottom + upperBottom, top }]
  }
  if (item.kind === 'pendant') {
    const { shade, plate, plateWidth, cord } = pendantParts(item)
    const outline = (size: number) => footprintCorners({ ...item, width: size, depth: size })
    return [
      { shape: footprintCorners(item), bottom, top: bottom + shade },
      { shape: outline(cord), bottom: bottom + shade, top: top - plate },
      { shape: outline(plateWidth), bottom: top - plate, top },
    ]
  }
  if (!item.curtain) return [{ shape: footprintCorners(item), bottom, top }]
  const { cos, sin } = itemAxes(item)
  const rail = Math.min(item.height * .06, 25)
  return [
    { shape: footprintCorners({ ...item, depth: item.depth * .55 }), bottom: top - rail, top },
    ...curtainPanels(item.width, item.curtain.open).map(({ center, width }) => ({
      shape: footprintCorners({ ...item, x: item.x + center * cos, z: item.z + center * sin, width }),
      bottom, top: top - rail,
    })),
  ]
}

export function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.z < b.z + b.depth && b.z < a.z + a.depth
}

export function pointInRoom(p: Point, edges: WallEdge[]): boolean {
  let inside = false
  for (const { a, b } of edges) {
    if ((a.x === b.x && p.x === a.x && low(a.z, b.z) <= p.z && p.z <= high(a.z, b.z))
      || (a.z === b.z && p.z === a.z && low(a.x, b.x) <= p.x && p.x <= high(a.x, b.x))) return true
    if (a.x === b.x && (a.z > p.z) !== (b.z > p.z) && p.x < a.x) inside = !inside
  }
  return inside
}

function crossesFootprint(item: Furniture, a: Point, b: Point, cos: number, sin: number): boolean {
  const dx = a.x - item.x, dz = a.z - item.z
  const bx = b.x - a.x, bz = b.z - a.z
  let enter = 0, leave = 1
  for (const [start, delta, edge] of [
    [dx * cos + dz * sin, bx * cos + bz * sin, item.width / 2 - epsilon],
    [-dx * sin + dz * cos, -bx * sin + bz * cos, item.depth / 2 - epsilon],
  ]) {
    if (Math.abs(delta) < epsilon) {
      if (Math.abs(start) >= edge) return false
      continue
    }
    const left = (-edge - start) / delta, right = (edge - start) / delta
    enter = Math.max(enter, Math.min(left, right))
    leave = Math.min(leave, Math.max(left, right))
    if (enter >= leave) return false
  }
  return true
}

export function overlapsShape(a: Point[], b: Point[]): boolean {
  for (const shape of [a, b]) {
    for (let i = 0; i < 2; i++) {
      const dx = shape[i + 1].x - shape[i].x, dz = shape[i + 1].z - shape[i].z
      const interval = (points: Point[]) => points.map(p => -p.x * dz + p.z * dx)
      const axisA = interval(a), axisB = interval(b)
      const tolerance = epsilon * Math.hypot(dx, dz)
      if (Math.max(...axisA) <= Math.min(...axisB) + tolerance || Math.max(...axisB) <= Math.min(...axisA) + tolerance) return false
    }
  }
  return true
}

export type TrimContact = Pick<TrimPiece, 'kind' | 'start' | 'end' | 'bottom' | 'top' | 'depth'> & {
  wallId: string; distance: number; shape: Point[];
}

function clipTrimSide(points: Point[], axis: keyof Point, limit: number, sign: number): Point[] {
  return points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length]
    const inside = (point[axis] - limit) * sign >= 0
    const nextInside = (next[axis] - limit) * sign >= 0
    if (inside === nextInside) return inside ? [point] : []
    const fraction = (limit - point[axis]) / (next[axis] - point[axis])
    const crossing = { x: point.x + fraction * (next.x - point.x), z: point.z + fraction * (next.z - point.z), [axis]: limit }
    return inside ? [point, crossing] : [crossing]
  })
}

export function trimContacts(edges: WallEdge[], roomHeight: number, volumes: ReturnType<typeof furnitureVolumes>): TrimContact[] {
  if (!volumes.length) return []
  const parts = volumes.map(part => ({ ...part, bounds: bounds(part.shape) }))
  return edges.flatMap(edge => wallTrimPieces(edge.wall, roomHeight).flatMap(piece => {
    const pieceVolume = trimVolume(edge, piece)
    return parts.flatMap(part => {
      const bottom = Math.max(part.bottom, piece.bottom), top = Math.min(part.top, piece.top)
      if (bottom >= top || !overlap(pieceVolume, part.bounds)) return []
      const local = part.shape.map(({ x, z }) => ({
        x: (x - edge.a.x) * edge.dx + (z - edge.a.z) * edge.dz,
        z: (x - edge.a.x) * edge.nx + (z - edge.a.z) * edge.nz,
      }))
      const along = clipTrimSide(clipTrimSide(local, 'x', piece.start, 1), 'x', piece.end, -1)
      const contact = clipTrimSide(clipTrimSide(along, 'z', 0, 1), 'z', piece.depth, -1)
      if (contact.length < 3 || Math.abs(twiceArea(contact)) <= epsilon) return []
      return [{ wallId: edge.wall.id, kind: piece.kind, depth: piece.depth, bottom, top,
        start: Math.min(...contact.map(point => point.x)), end: Math.max(...contact.map(point => point.x)),
        distance: Math.ceil(piece.depth - Math.min(...along.map(point => point.z)) - epsilon),
        shape: contact.map(point => wallPoint(edge, point.x, point.z)) }]
    })
  }))
}

export function trimContactText(contact: Pick<TrimContact, 'kind' | 'distance'>) {
  return `${trimLabels[contact.kind]} ile ${fmt(contact.distance)} cm çakışma.`
}

export type Placement = { warning: string[]; clearance: number; obstruction?: string; overlapping?: string[]; trim: TrimContact[] }
export function placement(project: Project, source: Furniture, edges = roomEdges(project.walls), nameOverlaps = false): Placement {
  const item = wallMountPose(source, edges)
  const shape = footprintCorners(item)
  const rect = bounds(shape)
  const { cos, sin } = itemAxes(item)
  const warning: string[] = []
  const bottom = itemBottom(item, project.height), top = bottom + item.height
  const volumes = furnitureVolumes(item, project.height)
  let ceiling = project.height
  let obstruction: string | undefined
  if (item.mount) {
    const edge = edges.find(edge => edge.wall.id === item.mount?.wallId)
    if (!edge) warning.push('Montaj duvarı bulunamadı. Bir duvar seçin.')
    else {
      const along = mountedCenter(item, edge)
      if (item.width > edge.wall.length) warning.push('Eşya montaj duvarından daha geniş.')
      if (item.curtain && !edge.wall.openings.some(opening => opening.id === item.curtain?.windowId && opening.kind === 'window')) {
        warning.push('Bağlı pencere bulunamadı. Perde için bir pencere seçin.')
      }
      if (edge.wall.openings.some(opening => opening.id !== item.curtain?.windowId && along - item.width / 2 < opening.offset + opening.width
        && along + item.width / 2 > opening.offset && bottom < opening.bottom + opening.height && top > opening.bottom)) {
        warning.push('Eşya montaj duvarındaki kapı veya pencereyle örtüşüyor.')
      }
    }
  }
  if (!pointInRoom(item, edges) || edges.some(({ a, b }) => crossesFootprint(item, a, b, cos, sin))) warning.push('Oda sınırını aşıyor.')
  if (bottom < 0) warning.push(`Sarkıt zeminin ${fmt(-bottom)} cm altına iniyor.`)
  const niche = item.wardrobe?.stack?.type === 'niche'
  for (const edge of edges) {
    for (const obstacle of edge.wall.obstacles) {
      const volume = obstructionVolume(edge, obstacle)
      if (obstacle.top <= bottom || obstacle.bottom >= ceiling || !overlap(rect, volume)) continue
      const outline = [
        { x: volume.x, z: volume.z }, { x: volume.x + volume.width, z: volume.z },
        { x: volume.x + volume.width, z: volume.z + volume.depth }, { x: volume.x, z: volume.z + volume.depth },
      ]
      const intersects = item.kind === 'pendant'
        ? volumes.some(part => part.bottom < volume.top && part.top > volume.bottom && overlapsShape(part.shape, outline))
        : overlapsShape(shape, outline)
      if (intersects) {
        if (niche) {
          const [lower, upper] = volumes
          if (volume.top <= upper.bottom) {
            if (lower.bottom < volume.top && lower.top > volume.bottom) warning.push(`${obstacle.name} ile dolap gövdesi çakışıyor.`)
            continue
          }
        }
        ceiling = obstacle.bottom
        obstruction = obstacle.name
      }
    }
  }
  if (ceiling < top) warning.push(`${obstruction ?? 'Tavan'} ile ${fmt(top - ceiling)} cm çakışma.`)
  if (edges.some(edge => edge.wall.openings.some(opening => {
    const sill = sillVolume(edge, opening, project.thickness, true)
    return sill && overlap(rect, sill) && sillTouchesParts(sill, volumes)
  }))) warning.push('Pencere denizliği ile çakışıyor.')
  const trim = trimContacts(edges, project.height, volumes)
  for (const kind of ['baseboard', 'trim'] as const) {
    const distance = Math.max(0, ...trim.filter(contact => contact.kind === kind).map(contact => contact.distance))
    if (distance) warning.push(trimContactText({ kind, distance }))
  }
  for (const reading of curtainRadiatorReadings(project, item, edges)) {
    if (reading.clearance !== undefined && reading.clearance <= 0) warning.push(`${reading.name} ile perde temas ediyor veya çakışıyor.`)
  }
  const overlapping: string[] = []
  if (volumes.length) project.items.some(source => {
    const other = wallMountPose(source, edges)
    if (other.id === item.id || (item.mount?.wallId === other.mount?.wallId &&
      ((item.curtain && other.kind === 'radiator') || (other.curtain && item.kind === 'radiator')))) return false
    const intersects = overlap(rect, footprint(other)) && furnitureVolumes(other, project.height).some(other => volumes.some(part =>
      part.top > other.bottom && part.bottom < other.top && overlapsShape(part.shape, other.shape)))
    if (intersects) overlapping.push(other.name)
    return intersects && !nameOverlaps
  })
  if (overlapping.length) warning.push('Başka bir eşyanın alanıyla örtüşüyor.')
  return { warning, clearance: ceiling - top, obstruction, trim, ...(nameOverlaps && { overlapping }) }
}

export function initialPlacement(project: Project, item: Furniture): Furniture {
  const edges = roomEdges(project.walls)
  if (item.mount) {
    if (item.curtain) return attachToWall(item, item.mount, edges)
    const requested = edges.find(edge => edge.wall.id === item.mount?.wallId) ?? edges[0]
    const candidates = [requested, ...edges.filter(edge => edge !== requested)]
    for (const edge of candidates) {
      const center = edge === requested ? item.mount.offset : edge.wall.length / 2
      const positions = [center, item.width / 2, edge.wall.length - item.width / 2,
        ...edge.wall.openings.flatMap(opening => [opening.offset - item.width / 2, opening.offset + opening.width + item.width / 2]),
        ...Array.from({ length: 9 }, (_, i) => edge.wall.length * (i + 1) / 10)]
      for (const along of positions) {
        const offset = mountOffset(edge, item.width, along)
        const mounted = attachToWall(item, { ...item.mount, wallId: edge.wall.id, offset }, edges)
        if (placement(project, mounted, edges).warning.length === 0) return mounted
      }
    }
    return attachToWall(item, item.mount, edges)
  }
  const room = bounds(edges.map(edge => edge.a))
  const step = Math.max(200, Math.round(Math.max(room.width, room.depth) / 24))
  const stepCount = Math.ceil(Math.max(room.width, room.depth) / step)
  for (let radius = 0; radius <= stepCount; radius++) {
    for (let x = -radius; x <= radius; x++) {
      for (let z = -radius; z <= radius; z++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== radius) continue
        const candidate = { ...item, x: item.x + x * step, z: item.z + z * step }
        if (candidate.x < room.x || candidate.x > room.x + room.width || candidate.z < room.z || candidate.z > room.z + room.depth) continue
        if (placement(project, candidate, edges).warning.length === 0) return candidate
      }
    }
  }
  return item
}

export type Box = {
  position: [number, number, number]; size: [number, number, number]; color: string; round?: boolean;
  cylinder?: 'upright' | 'front';
  surface?: 'wood' | 'fabric' | 'linen' | 'metal' | 'quilt' | 'pillow';
  material?: FurnitureMaterial; slot?: string; appearance?: Appearance;
  angle?: number; glass?: boolean; emission?: string; mirror?: boolean; shade?: boolean;
  motionPart?: string; pitch?: number;
  ledMount?: 'shelf' | 'ceiling' | 'left' | 'right';
  curtain?: { folds: number; sheer: boolean };
  wallCovering?: boolean;
  windowSill?: boolean;
  architecturalTrim?: TrimPiece['kind'];
}
export function volumeBox(v: Volume, color: string): Box {
  return { position: [meters(v.x + v.width / 2), meters((v.bottom + v.top) / 2), meters(v.z + v.depth / 2)],
    size: [meters(v.width), meters(v.top - v.bottom), meters(v.depth)], color }
}

export function architecturalGeometry(project: Project) {
  const edges = roomEdges(project.walls)
  const boxes: (Box & { wallIds?: string[]; obstacleName?: string; obstacleWallId?: string })[] = []
  for (const [i, edge] of edges.entries()) {
    const { wall } = edge
    const xs = [...new Set([0, wall.length, ...wall.openings.flatMap(o => [o.offset, o.offset + o.width])])].sort((a, b) => a - b)
    const ys = [...new Set([0, project.height, ...wall.openings.flatMap(o => [o.bottom, o.bottom + o.height])])].sort((a, b) => a - b)
    for (let x = 0; x < xs.length - 1; x++) {
      for (let y = 0; y < ys.length - 1; y++) {
        if (wall.openings.some(o => xs[x] >= o.offset && xs[x + 1] <= o.offset + o.width
          && ys[y] >= o.bottom && ys[y + 1] <= o.bottom + o.height)) continue
        const rect = bounds([wallPoint(edge, xs[x]), wallPoint(edge, xs[x + 1], -project.thickness)])
        boxes.push({ ...volumeBox({ ...rect, bottom: ys[y], top: ys[y + 1] }, project.style.wall), wallIds: [wall.id] })
      }
    }
    const prev = edges[(i + edges.length - 1) % edges.length]
    if (prev.dx * edge.nx + prev.dz * edge.nz < 0) {
      const outside = { x: edge.a.x - (prev.nx + edge.nx) * project.thickness, z: edge.a.z - (prev.nz + edge.nz) * project.thickness }
      boxes.push({ ...volumeBox({ ...bounds([edge.a, outside]), bottom: 0, top: project.height }, project.style.wall),
        wallIds: [prev.wall.id, wall.id] })
    }
    for (const p of wall.obstacles) boxes.push({ ...volumeBox(obstructionVolume(edge, p), project.style.wall),
      obstacleName: p.name, obstacleWallId: wall.id })
    for (const opening of wall.openings) {
      const volume = sillVolume(edge, opening, project.thickness)
      if (!volume || !opening.sill) continue
      const appearance = sillAppearance(opening.sill)
      boxes.push({ ...volumeBox(volume, appearance.color ?? sillColor(opening.sill.finish)), wallIds: [wall.id], windowSill: true,
        appearance })
    }
    for (const piece of wallTrimPieces(wall, project.height)) boxes.push({
      ...volumeBox(trimVolume(edge, piece), piece.appearance.color ?? defaultTrimAppearance.color),
      wallIds: [wall.id], architecturalTrim: piece.kind, appearance: piece.appearance,
    })
  }
  return { boxes, floor: vertices(project.walls).slice(0, -1) }
}
