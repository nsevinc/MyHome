import { bounds, footprintCorners, wallMountPose } from './geometry'
import { clearanceArchitecture, readClearances } from './keep-clear'
import { cabinetDoorBlocks } from './layout'
import { defaultWardrobeGap, fmt } from './model'
import type { Furniture, KeepClearRule, Point, Project, Wardrobe } from './model'
import { findPlacements } from './placement-search'
import { checkWardrobeFill, roomDoorSwingConflicts } from './wardrobe-fill'
import { buildWardrobeRun, inspectWardrobeRun } from './wardrobe-run'

export type SolutionRun = NonNullable<ReturnType<typeof buildWardrobeRun>>
export type Solution = { title: string; doors: { id: string; wardrobe: Wardrobe }[]; moves: ({ id: string } & Point)[] }
export const unchangedSolution: Solution = { title: 'Mevcut taslak', doors: [], moves: [] }

// Only copy edited fields. Worker results contain no materials, images or models.
export function solutionRun(run: SolutionRun, option: Solution): SolutionRun {
  const doors = new Map(option.doors.map(change => [change.id, change.wardrobe]))
  const moves = new Map(option.moves.map(change => [change.id, change]))
  const items = run.project.items.map(item => {
    const wardrobe = doors.get(item.id), move = moves.get(item.id)
    return wardrobe || move ? { ...item, ...(wardrobe && { wardrobe }), ...(move && { x: move.x, z: move.z }) } : item
  })
  const byId = new Map(items.map(item => [item.id, item]))
  return { ...run, project: { ...run.project, items }, parts: run.parts.map(p => ({ ...p, item: byId.get(p.item.id)! })) }
}

function frontRule(run: SolutionRun): KeepClearRule {
  const id = run.parts[0].item.wardrobeRun!.id
  const saved = run.project.keepClear?.find(rule => rule.owner === 'run' && rule.ownerId === id)
  return { owner: 'run', ownerId: id, side: 'front', distance: Math.max(run.fill!.passage, saved?.distance ?? 0) }
}

function readings(run: SolutionRun, rules: KeepClearRule[], architecture = clearanceArchitecture(run.project, run.edges)) {
  return readClearances(rules, run.project.items.map(item => wallMountPose(item, run.edges)), run.project.height, architecture)
}

export function inspectSolution(run: SolutionRun) {
  const area = run.fill!
  const checks = inspectWardrobeRun(run, area.margin, area.passage)
  const fill = checkWardrobeFill(run, run.parts[0].item.wardrobeRun!.gap ?? defaultWardrobeGap, area, checks)
  const strips = readings(run, [frontRule(run)]).sort((a, b) => (a.gap ?? Infinity) - (b.gap ?? Infinity))
  const front = strips[0]
  const reasons = [...fill.issues]
  const swing = roomDoorSwingConflicts(run.edges, run.project.height)
  for (const bed of run.project.items.filter(i => i.kind === 'bed')) {
    reasons.push(...swing(bed).map(reason => `${bed.name} · ${reason}`))
  }
  if (front.shortage) reasons.push(`${front.nearest!.label} · Ön geçiş için ${fmt(front.shortage)} cm eksik.`)
  if (fill.front.blocked.length && !front.shortage) reasons.push(`Ön geçiş dar · ${fill.front.blocked.join(', ')}.`)
  if (fill.route.status === 'blocked') reasons.push('Girişten tüm modüllere ulaşılmıyor.')
  return { checks, front, strips: strips.map(row => row.polygon), route: fill.route, reasons }
}

export function doorSolution(checks: ReturnType<typeof inspectWardrobeRun>): Solution | undefined {
  const changes = checks.flatMap(row => row.doorSuggestion ? [row.doorSuggestion] : [])
  if (!changes.length) return
  return { title: changes.every(change => change.kind === 'hinge') ? 'Menteşe yönünü değiştir' :
    changes.every(change => change.kind === 'sliding') ? 'Sürgülü kapak kullan' : 'Kapak mekanizmalarını değiştir',
    doors: changes.map(c => ({ id: c.itemId, wardrobe: c.wardrobe })), moves: [] }
}

// Include positions where the bed just clears a protected strip in addition to
// the normal search grid, including a sideways escape from the end of a run.
function stripOffsets(bed: Furniture, strips: ReturnType<typeof readings>, height: number) {
  const body = bounds(footprintCorners(bed))
  const xs = new Set([0]), zs = new Set([0])
  for (const strip of strips) {
    const face = strip.polygon[0]
    const projection = cabinetDoorBlocks([strip.owner], 'saved', height).flatMap(block =>
      block.shape.map(p => (p.x - face.x) * strip.n.x + (p.z - face.z) * strip.n.z))
    // The access check starts in front of the most protruding saved handle.
    const protrusion = Math.max(0, ...projection)
    for (const extra of new Set([0, protrusion])) {
      const box = bounds(strip.polygon.map(p => ({ x: p.x + strip.n.x * extra, z: p.z + strip.n.z * extra })))
      xs.add(Math.floor(box.x - body.x - body.width))
      xs.add(Math.ceil(box.x + box.width - body.x))
      zs.add(Math.floor(box.z - body.z - body.depth))
      zs.add(Math.ceil(box.z + box.depth - body.z))
    }
  }
  return [...xs].flatMap(x => [...zs].map(z => ({ x, z })))
}

export type BedSolutions = { options: Solution[]; blockers: string[] }
export function searchBedSolutions(run: SolutionRun, bedId: string): BedSolutions {
  const bed = run.project.items.find(i => i.id === bedId && i.kind === 'bed')
  if (!bed || bed.locked || bed.mount) return { options: [], blockers: ['Seçili yatak taşınamıyor.'] }
  const base = inspectSolution(run)
  const doorOption = doorSolution(base.checks)
  const options: Solution[] = []
  const blockers = new Set<string>()
  const rule = frontRule(run)
  const otherRules = (run.project.keepClear ?? []).filter(r => r.owner !== 'run' || r.ownerId !== rule.ownerId)
  const architecture = clearanceArchitecture(run.project, run.edges)
  const original = readings(run, otherRules, architecture)
  const swing = roomDoorSwingConflicts(run.edges, run.project.height)
  const before = new Map(run.project.items.map(i => [i.id, i]))
  for (const variant of doorOption ? [unchangedSolution, doorOption] : [unchangedSolution]) {
    const draft = solutionRun(run, variant)
    if (!(variant === unchangedSolution ? base : inspectSolution(draft)).reasons.length) continue
    const offsets = stripOffsets(bed, readings(draft, [rule], architecture), draft.project.height)
    const result = findPlacements(draft.project, [bedId], { radius: 1500, rotate: false }, {
      limit: 1, offsets,
      check(project) {
        const candidate = { ...draft, project }
        if (readings(candidate, [rule], architecture).some(row => row.shortage)) return [`Dolap önünde ${fmt(rule.distance)} cm geçiş sağlanamıyor.`]
        if (readings(candidate, otherRules, architecture).some((row, i) => row.shortage > original[i].shortage + .001)) {
          return ['Başka bir korunmuş geçiş alanı daralıyor.']
        }
        const moved = project.items.filter(i => !i.mount && (before.get(i.id)?.x !== i.x || before.get(i.id)?.z !== i.z))
        const contacts = moved.flatMap(i => swing(i).map(reason => `${i.name} · ${reason}`))
        if (contacts.length) return contacts
        if (moved.some(i => i.wardrobeRun)) return ['Bağlı eşya hareketi duvar üzerindeki dolap dizisini değiştiriyor.']
        return inspectSolution(candidate).reasons
      },
    })
    const found = result.suggestions[0]
    if (found) {
      const moves = found.items.filter(item => {
        const from = draft.project.items.find(i => i.id === item.id)!
        return from.x !== item.x || from.z !== item.z
      }).map(({ id, x, z }) => ({ id, x, z }))
      options.push({ ...variant, title: variant.doors.length ? `Yatağı taşı + ${variant.title.toLocaleLowerCase('tr')}` : 'Yatağı taşı', moves })
    } else for (const reason of result.blockers.length ? result.blockers : result.currentIssues) blockers.add(reason)
  }
  return { options, blockers: [...blockers] }
}
