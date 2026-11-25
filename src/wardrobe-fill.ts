import { footprintCorners, furnitureVolumes, roomEdges, wallMountPose } from './geometry'
import type { WallEdge } from './geometry'
import { fmt } from './model'
import type { Furniture, Project, WardrobeFillArea } from './model'
import { openingLeaf } from './opening-door'
import { cabinetDoorClearance, cabinetDoorEnvironment, changeDoor, firstOverlap } from './wardrobe'
import { buildWardrobeRun, inspectWardrobeRun, maxWardrobeModules, newWardrobeModule } from './wardrobe-run'
import { checkWardrobePassages } from './wardrobe-fill-route'
import { wallTrimPieces } from './wall-trim'

export const fillOptions = { storage: 'Daha fazla depolama', passage: 'Daha geniş geçiş' } as const
type Priority = keyof typeof fillOptions
type Input = { project: Project; id: string; wallId: string; area: WardrobeFillArea; fixed: Furniture[] }
const rearClearance = 1
export const readyWidths = [1000, 750, 500]
const readyPitch = 250 // Greatest common divisor of the catalogue widths, in mm.
const customWidths = [1000, 900, 750, 600, 500, 450]

type Body = { inset: number; depth: number; height: number }
type Span = { start: number; end: number }
type ModuleFit = Body & { start: number; width: number }

// Each state ends exactly at the next body's side. Architectural edges constrain
// the whole body crossing them, but do not introduce seams in the run.
function packReady(span: Span, fromEnd: boolean, count: number, fit: (start: number, end: number) => Body | undefined) {
  type Path = { previous?: Path; part?: ModuleFit; count: number; volume: number }
  const reachable = new Map<number, Path>([[0, { count: 0, volume: 0 }]])
  let bestLength = 0
  const length = Math.min(span.end - span.start, count * readyWidths[0])
  const limitedByCount = count < Math.floor(length / 500)
  for (let used = 0; used < length; used += readyPitch) {
    const path = reachable.get(used)
    if (!path || path.count >= count) continue
    for (const width of readyWidths) {
      const next = used + width
      if (next > length) continue
      const start = fromEnd ? span.end - next : span.start + used
      const body = fit(start, start + width)
      if (!body) continue
      const volume = path.volume + width * body.depth * body.height
      const prior = reachable.get(next)
      if (prior) {
        const fewerSlots = limitedByCount && prior.count !== path.count + 1
        const keepPrior = fewerSlots ? prior.count < path.count + 1
          : prior.volume > volume || (prior.volume === volume && prior.count <= path.count + 1)
        if (keepPrior) continue
      }
      reachable.set(next, { previous: path, part: { ...body, start, width }, count: path.count + 1, volume })
      bestLength = Math.max(bestLength, next)
    }
  }
  const result: ModuleFit[] = []
  for (let path = reachable.get(bestLength); path?.part; path = path.previous) result.push(path.part)
  return result.sort((a, b) => a.start - b.start)
}

function fitReadySpan(span: Span, fromEnd: boolean, count: number, cuts: number[], fit: (start: number, end: number) => Body | undefined) {
  let best = packReady(span, fromEnd, count, fit)
  let covered = best.reduce((sum, part) => sum + part.width, 0)
  const target = Math.min(Math.floor((span.end - span.start) / readyPitch) * readyPitch, count * readyWidths[0])
  if (covered === target || target < 500) return best

  // A feasible row can slide until one of its sides meets a profile boundary.
  // All its other sides have the same offset modulo the catalogue pitch.
  const phases = new Set(cuts.filter(x => x >= span.start && x <= span.end).map(x => (x - span.start) % readyPitch))
  for (const phase of phases) {
    for (let start = span.start + phase; start + covered < span.end; start += readyPitch) {
      const alternative = packReady({ start, end: span.end }, false, count, fit)
      const width = alternative.reduce((sum, part) => sum + part.width, 0)
      if (width > covered) { best = alternative; covered = width }
      if (covered === target) return best
    }
  }
  return best
}

function packCustom(span: Span, body: Body, fromEnd: boolean, count: number) {
  let length = Math.min(span.end - span.start, count * 1000)
  let start = fromEnd ? span.end - length : span.start
  const result: ModuleFit[] = []
  while (length >= 300) {
    const width = length <= 1000 ? length : customWidths.find(value => length - value >= 300)!
    result.push({ ...body, start, width })
    start += width
    length -= width
  }
  return result
}

// Pick working hinges between adjoining bodies when creating a new module.
// Changes to saved modules and remedies for room obstacles stay user decisions.
function fitAdjoiningHinges(run: NonNullable<ReturnType<typeof buildWardrobeRun>>, modules: Furniture[]) {
  const ids = new Set(modules.map(item => item.id))
  const environment = cabinetDoorEnvironment(run.project, run.edges)
  return modules.map((source, index) => {
    if (source.wardrobeRun?.anchor?.fixed) return source
    const { item } = run.parts[index]
    const blocked = cabinetDoorClearance(run.project, item, run.edges, environment)
      .filter(door => door.hit?.itemId && ids.has(door.hit.itemId))
    if (!blocked.length) return source
    let wardrobe = item.wardrobe!
    for (const door of blocked) wardrobe = changeDoor(wardrobe, door.index, { hinge: door.side === 1 ? 'right' : 'left' })
    const retest = cabinetDoorClearance(run.project, { ...item, wardrobe }, run.edges, environment)
    if (blocked.some(door => retest[door.index].hit)) return source
    return { ...source, wardrobe }
  })
}

export function roomDoorSwingConflicts(edges: WallEdge[], height: number) {
  const roomDoors = edges.flatMap(edge => edge.wall.openings.flatMap(opening => {
    if (opening.kind !== 'door') return []
    const closed = openingLeaf(edge, { ...opening, swing: { hinge: opening.swing?.hinge ?? 'start', angle: 0 } })!
    const moving = footprintCorners({ ...closed, rotation: 0 }).map(({ x, z }) => ({ x: x - closed.hinge.x, z: z - closed.hinge.z }))
    const sign = Math.sign((closed.tip.x - closed.hinge.x) * edge.nz - (closed.tip.z - closed.hinge.z) * edge.nx)
    return [{ closed, moving, sign, name: `Duvar ${edge.index + 1} kapısı`, limit: Math.max(90, opening.swing?.angle ?? 0) * Math.PI / 180 }]
  }))
  return (item: Furniture) => roomDoors.flatMap(({ closed, moving, sign, name, limit }) =>
    furnitureVolumes(item, height).some(part => part.top > closed.bottom && part.bottom < closed.top &&
      firstOverlap(moving, part.shape.map(point => ({ x: point.x - closed.hinge.x, z: point.z - closed.hinge.z })), sign, limit) !== undefined)
      ? [`${name} açılımıyla çakışıyor.`] : [])
}

export function checkWardrobeFill(run: NonNullable<ReturnType<typeof buildWardrobeRun>>, gap: number, area: WardrobeFillArea,
  checks = inspectWardrobeRun(run, area.margin, area.passage)) {
  const issues: string[] = []
  let end = area.start - gap
  for (const { start, inset, item } of run.parts) {
    if (start < end + gap || start + item.width > area.end || inset + item.depth > area.depth) {
      issues.push(`${item.name} · Seçili alanı veya modül aralığını aşıyor.`)
    }
    end = start + item.width
  }
  if (area.end > run.edge.wall.length) issues.push('Seçili alan duvarın dışına taşıyor.')
  const conflicts = roomDoorSwingConflicts(run.edges, run.project.height)
  for (const row of checks) {
    const reasons = [...row.fit.warning]
    if (row.fit.clearance >= 0 && row.fit.clearance < area.margin) reasons.push('Üst boşluk hedefinin altında.')
    if (row.conflicts.length) reasons.push('Duvar açıklığını kapatıyor.')
    if (row.doors.some(door => door.hit) || row.drawers.some(drawer => drawer.contact) || row.slider?.hit) reasons.push('Kapak veya çekmece tam açılamıyor.')
    reasons.push(...conflicts(row.item))
    if (reasons.length) issues.push(`${row.item.name} · ${reasons.join(' ')}`)
  }
  const doorSuggestions = checks.flatMap(row => row.doorSuggestion ? [row.doorSuggestion] : [])
  return { issues, doorSuggestions, ...checkWardrobePassages(run, area) }
}

export function wardrobeFillGeometry(project: Project, edges: WallEdge[], edge: WallEdge, id: string, area: WardrobeFillArea) {
  const { wall } = edge
  const existing = project.items.filter(item => item.wardrobeRun?.id !== id).flatMap(item =>
    furnitureVolumes(wallMountPose(item, edges), project.height).flatMap(part => {
      if (part.bottom >= project.height - area.margin) return []
      const local = part.shape.map(({ x, z }) => ({ along: (x - edge.a.x) * edge.dx + (z - edge.a.z) * edge.dz,
        inward: (x - edge.a.x) * edge.nx + (z - edge.a.z) * edge.nz }))
      const near = Math.floor(Math.min(...local.map(point => point.inward)))
      if (near > area.depth + area.passage || Math.max(...local.map(point => point.inward)) <= 0) return []
      return [{ start: Math.floor(Math.min(...local.map(point => point.along))), end: Math.ceil(Math.max(...local.map(point => point.along))), near }]
    }))
  const supports = [...wall.obstacles.map(obstacle => ({ ...obstacle, start: obstacle.offset, end: obstacle.offset + obstacle.width })),
    ...wallTrimPieces(wall, project.height).map(piece => ({ ...piece, name: piece.kind === 'baseboard' ? 'Süpürgelik' : 'Pervaz' }))]
  function fit(start: number, end: number, priority: Priority, current?: Furniture): Body | undefined {
    const custom = area.profile === 'custom'
    const openings = wall.openings.filter(o => start < o.offset + o.width && end > o.offset)
    if (openings.some(o => o.kind === 'door')) return
    const pieces = supports.filter(p => start < p.end && end > p.start)
    const inset = Math.max(rearClearance, ...pieces.filter(p => p.bottom < 300).map(p => p.depth + rearClearance))
    const frontSpace = Math.min(area.depth, ...existing.filter(p => start < p.end && end > p.start).map(p => p.near - 1)) - inset
    const depths = priority === 'storage' ? [580, 350] : [350, 580]
    const standardDepth = custom ? Math.min(priority === 'storage' ? 600 : 400, Math.floor(frontSpace / 10) * 10)
      : depths.find(value => value <= frontSpace) ?? 0
    const depth = current && current.depth <= frontSpace ? current.depth : standardDepth
    const ceiling = Math.min(project.height, ...pieces.filter(p => p.depth > inset && p.bottom >= 300).map(p => p.bottom),
      ...openings.map(opening => opening.bottom)) - area.margin
    const standardHeight = custom ? Math.floor(ceiling / 10) * 10 : [2360, 2010].find(value => value <= ceiling) ?? 0
    const height = current && current.height <= ceiling ? current.height : standardHeight
    if (depth >= 300 && height >= 300) return { inset, depth, height }
  }
  return { supports, existing, fit }
}

export function proposeWardrobeFill({ project, id, wallId, area, fixed }: Input) {
  const edges = roomEdges(project.walls)
  const edge = edges.find(edge => edge.wall.id === wallId)
  if (!edge || area.end <= area.start || area.start < 0 || area.end > edge.wall.length) return { error: 'Duvar üzerinde geçerli bir başlangıç ve bitiş seçin.', options: [] }
  if (fixed.some(item => item.wardrobeRun?.wallId !== wallId || !item.wardrobeRun?.anchor ||
    item.wardrobeRun.anchor.start < area.start || item.wardrobeRun.anchor.start + item.width > area.end || item.wardrobeRun.anchor.inset + item.depth > area.depth)) {
    return { error: 'Sabit modüllerden biri alanın dışında. Alanı genişletin veya modülü serbest bırakın.', options: [] }
  }
  const { wall } = edge
  const { existing, supports, fit } = wardrobeFillGeometry(project, edges, edge, id, area)
  const limits = supports.filter(piece => piece.bottom === 0 || piece.top > 900)
  const spans = [area.start, area.end, ...limits.flatMap(piece => [piece.start, piece.end]),
    ...wall.openings.flatMap(opening => [opening.offset, opening.offset + opening.width]),
    ...existing.filter(piece => piece.near < area.depth).flatMap(piece => [piece.start, piece.end]),
    ...fixed.flatMap(item => [item.wardrobeRun!.anchor!.start, item.wardrobeRun!.anchor!.start + item.width])]
  const cuts = [...new Set(spans.filter(value => value >= area.start && value <= area.end))].sort((a, b) => a - b)
  const intersects = (a: number, b: number, c: number, d: number) => a < d && b > c
  const kept = fixed.map(item => ({ ...item, wardrobeRun: { ...item.wardrobeRun!, fill: area } }))
  const options = (Object.keys(fillOptions) as Priority[]).map(priority => {
    const custom = area.profile === 'custom'
    let modules: Furniture[] = [...kept]
    const notes: string[] = []
    const bodyFit = (start: number, end: number) => fit(start, end, priority)
    const bands: Span[] = []
    for (let index = 0; index < cuts.length - 1; index++) {
      const start = cuts[index], end = cuts[index + 1]
      if (fixed.some(item => intersects(start, end, item.wardrobeRun!.anchor!.start, item.wardrobeRun!.anchor!.start + item.width))) continue
      if (wall.openings.some(o => o.kind === 'door' && intersects(start, end, o.offset, o.offset + o.width))) {
        notes.push('Kapı açıklığı boş bırakıldı.')
        continue
      }
      const body = bodyFit(start, end)
      if (!body) {
        notes.push(`${fmt(start)}–${fmt(end)} cm · Uygun derinlik veya yükseklik bulunamadı.`)
        continue
      }
      const last = bands.at(-1)
      // A narrow change of profile should also be spanned by a custom cabinet.
      const narrow = last && (end - start < 300 || last.end - last.start < 300)
      if (last?.end === start && (!custom || (narrow && bodyFit(last.start, end)))) last.end = end
      else bands.push({ start, end })
    }
    const capacity = maxWardrobeModules - project.items.filter(item => item.wardrobeRun?.id !== id).length
    for (const span of bands) {
      const count = Math.max(0, capacity - modules.length)
      const followsFixed = fixed.some(item => item.wardrobeRun!.anchor!.start + item.width === span.start)
      const precedesFixed = fixed.some(item => item.wardrobeRun!.anchor!.start === span.end)
      const fromEnd = !followsFixed && (precedesFixed || (span.start !== 0 && span.end === wall.length))
      const placements = custom ? packCustom(span, bodyFit(span.start, span.end)!, fromEnd, count) : fitReadySpan(span, fromEnd, count, cuts, bodyFit)
      if (!placements.length) notes.push(`${fmt(span.start)}–${fmt(span.end)} cm · Bu alana modül eklenemedi.`)
      for (const { start, width, inset, height, depth } of placements) {
        if (inset > rearClearance) notes.push(`${fmt(start)}–${fmt(start + width)} cm · Çıkıntı için gövde arkası ${fmt(inset)} cm içeri alındı.`)
        const normalHeight = custom ? Math.floor((project.height - area.margin) / 10) * 10 : (project.height - area.margin >= 2360 ? 2360 : 2010)
        if (height < normalHeight) notes.push(`${fmt(start)}–${fmt(start + width)} cm · Açıklık veya çıkıntı altında ${fmt(height)} cm boy seçildi.`)
        const item = newWardrobeModule(modules.length)
        const shallow = depth < 500 || height < 1500
        modules.push({ ...item, width, depth, height, wardrobe: { ...item.wardrobe!, doors: width <= 600 ? 1 : 2,
          ...(shallow && { interior: [{ drawers: 0, shelves: [.25, .5, .75] }, { drawers: 0, shelves: [.25, .5, .75] }] }) },
          wardrobeRun: { id, wallId, index: modules.length, gap: 0, fill: area, anchor: { start, inset } } })
      }
    }
    modules.sort((a, b) => a.wardrobeRun!.anchor!.start - b.wardrobeRun!.anchor!.start)
    let run = buildWardrobeRun(project, id, wallId, area.start, modules, 0, area)
    if (run) {
      modules = fitAdjoiningHinges(run, modules)
      run = buildWardrobeRun(project, id, wallId, area.start, modules, 0, area)
    }
    const check = run && checkWardrobeFill(run, 0, area)
    return { priority, modules, notes: [...new Set(notes)], check, unused: area.end - area.start - modules.reduce((sum, item) => sum + item.width, 0) }
  })
  return { options, error: undefined }
}
