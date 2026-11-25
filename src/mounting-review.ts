import { motionParts, motionValue, solveMotion } from './furniture-motion'
import { footprint, obstructionVolume, placement, roomEdges, wallMountPose } from './geometry'
import { readMeasurements } from './measurements'
import { fmt, furnitureAngle } from './model'
import type { Furniture, Project } from './model'
import { sectionSpans } from './room-section'
import { inspectTransportPath } from './transport-path'
import { cabinetDoorClearance, cabinetDoorEnvironment, doorCollisionText } from './wardrobe'
import { assemblyObstacles, checkTransport, transportOrientations, wardrobeAssembly } from './wardrobe-assembly'
import type { TransportOrientation } from './wardrobe-assembly'
import { surveyWardrobes, wallSurvey } from './wall-survey'
import { electricalPosition, electricalReadings } from './electrical-points'

export type ReviewStatus = 'warning' | 'pending' | 'passed'
export type ReviewTarget =
  | { kind: 'item' | 'assembly'; id: string }
  | { kind: 'door'; id: string; index: number }
  | { kind: 'section'; id: string; itemId: string }
  | { kind: 'motion'; id: string; partId: string; amount: number }
  | { kind: 'route'; id: string; orientation?: TransportOrientation }
  | { kind: 'survey'; id: string }
  | { kind: 'electrical'; id: string; wallId: string }
  | { kind: 'measurement'; id?: string; itemId?: string }

export type ReviewShortfall = { value: number; unit: 'cm' | '°' }
export type ReviewFinding = { key: string; status: ReviewStatus; subject: string; check: string; detail: string;
  target: ReviewTarget; shortfall?: ReviewShortfall }
export const reviewLabels: Record<ReviewStatus, string> = { warning: 'Uyarı', pending: 'Bilgi bekliyor', passed: 'Uygun' }

function assemblyTarget(project: Project, item: Furniture, obstruction?: string): ReviewTarget {
  const rect = footprint(item)
  const angle = furnitureAngle(item) * Math.PI / 180
  const axis = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle)) ? 'z' : 'x'
  const blocks = obstruction ? roomEdges(project.walls).flatMap(edge => edge.wall.obstacles
    .filter(block => block.name === obstruction).map(block => obstructionVolume(edge, block))) : []
  const sections = (project.sections ?? []).filter(section => {
    const [normal, width, start, depth] = section.axis === 'x'
      ? [rect.z, rect.depth, rect.x, rect.width] : [rect.x, rect.width, rect.z, rect.depth]
    return section.offset > normal && section.offset < normal + width
      && sectionSpans(project, section).some(span => span.from < start + depth && span.to > start)
  })
  const cut = sections.find(section => section.axis === axis && (!blocks.length
    || blocks.some(block => axis === 'x'
      ? section.offset >= block.z && section.offset < block.z + block.depth
      : section.offset >= block.x && section.offset < block.x + block.width)))
  return cut ? { kind: 'section', id: cut.id, itemId: item.id } : { kind: 'assembly', id: item.id }
}

export function mountingReview(project: Project): ReviewFinding[] {
  const edges = roomEdges(project.walls)
  const items = project.items.map(item => wallMountPose(item, edges))
  const obstacles = assemblyObstacles(project)
  const doorEnvironment = cabinetDoorEnvironment(project, edges)
  const rows: ReviewFinding[] = []
  const add = (key: string, subject: string, check: string, status: ReviewStatus, detail: string, target: ReviewTarget,
    shortfall?: ReviewShortfall) => rows.push({ key, subject, check, status, detail, target, shortfall })
  const hasWarning = (violations: unknown[]) => violations.length ? 'warning' : 'passed'

  for (const item of items) {
    const target = { kind: 'item', id: item.id } as const
    const fit = placement(project, item, edges)
    add(`${item.id}/fit`, item.name, 'Yerleşim', hasWarning(fit.warning), fit.warning.join(' · ')
      || `${fit.obstruction ? fit.obstruction + ' altı' : 'Tavan'} · ${fmt(fit.clearance)} cm düşey boşluk`, target)

    for (const door of cabinetDoorClearance(project, item, edges, doorEnvironment)) {
      add(`${item.id}/door/${door.index}`, item.name, door.label, door.hit ? 'warning' : 'passed',
        door.hit ? doorCollisionText(door.index, door.hit, door.label) : `${door.limit}° açılımda çakışma bulunmadı.`,
        { kind: 'door', id: item.id, index: door.index })
    }
    for (const part of motionParts(item)) {
      const { contact } = solveMotion(project, item, part, obstacles)
      const detail = contact ? `${contact.name} · ilk temas ${motionValue(part, contact.amount)} · tam açılım için ${motionValue(part, part.max - contact.amount)} eksik`
        : `${motionValue(part, part.max)} tam açılımda çakışma bulunmadı.`
      add(`${item.id}/motion/${part.id}`, item.name, part.name, contact ? 'warning' : 'passed', detail,
        { kind: 'motion', id: item.id, partId: part.id, amount: part.max },
        { value: contact ? part.max - contact.amount : 0, unit: part.pivot ? '°' : 'cm' })
    }
    if (item.kind !== 'wardrobe') continue
    const assembly = wardrobeAssembly(project, item, obstacles)
    const lift = `Kaldırma kotu ${fmt(assembly.diagonal)} cm`
    const gap = fit.clearance >= 0 ? `${fmt(fit.clearance)} cm üst boşluk · ` : ''
    add(`${item.id}/lift`, item.name, 'Yerde kurup kaldırma', hasWarning(assembly.raiseHits),
      gap + lift + (assembly.raiseHits.length ? ` · Çakışma · ${assembly.raiseHits.join(', ')}` : ' · Geometrik boşluk yeterli.'),
      assemblyTarget(project, item, fit.obstruction))
    add(`${item.id}/stand`, item.name, 'Dik kurulum', hasWarning(assembly.standHits),
      `${fmt(assembly.uprightHeight)} cm çalışma kotu` + (assembly.standHits.length ? ` · Çakışma · ${assembly.standHits.join(', ')}` : ' · Geometrik boşluk yeterli.'),
      { kind: 'assembly', id: item.id })
    const path = item.assembly?.routePath
    if (path) {
      const options = transportOrientations.map(([orientation, name]) =>
        ({ orientation, name, ...inspectTransportPath(project, item, path, orientation, obstacles) }))
      const clear = options.filter(option => !option.problem && !option.contact)
      const representative = clear[0] ?? options.find(option => option.contact) ?? options[0]
      const detail = clear.length ? `${clear.map(option => option.name).join(' / ')} · çizilen rota açık.`
        : options.map(option => `${option.name} · ${option.contact?.name ?? option.problem}`).join(' / ')
      add(`${item.id}/route`, item.name, 'Taşıma rotası', clear.length ? 'passed' : options.some(option => option.contact) ? 'warning' : 'pending',
        detail, { kind: 'route', id: item.id, orientation: representative.orientation })
    } else {
      add(`${item.id}/route`, item.name, 'Taşıma rotası', 'pending', 'Rota bekliyor · oda kapısından montaj noktasına bir rota çiz.',
        { kind: 'route', id: item.id })
    }
    const measured = item.assembly?.transport
    if (measured) {
      const measure = checkTransport(item, measured)
      const steps = [
        ['Kapı', measure.door, `${fmt(measured.doorWidth)} × ${fmt(measured.doorHeight)} cm`, `${fmt(measure.width)} × ${fmt(measure.height)} cm`],
        ['Koridor', measure.corridor, `${fmt(measured.corridorWidth)} cm`, `${fmt(measure.width)} cm`],
        ['Yerinde dönüş', measure.turn, `${fmt(measured.turnWidth)} × ${fmt(measured.turnDepth)} cm`, `${fmt(measure.turnClearance)} cm kare alan`],
      ] as const
      for (const [name, adequate, actual, required] of steps) add(`${item.id}/transport/${name}`, item.name, name,
        adequate === undefined ? 'pending' : adequate ? 'passed' : 'warning',
        adequate === undefined ? `Ölçü bekliyor · gereken ${required}` : `Ölçülen ${actual} · gereken ${required}`,
        { kind: 'assembly', id: item.id })
    }
  }

  for (const edge of edges) {
    const reading = wallSurvey(project, edge)
    if (!reading && !surveyWardrobes(project, edge).length) continue
    const wall = `Duvar ${edge.index + 1}`
    const target = { kind: 'survey', id: edge.wall.id } as const
    if (!reading?.result) {
      const missing = reading?.rows.filter(row => row.width === undefined).map(row => row.label)
      add(`${edge.wall.id}/survey`, wall, 'Saha ölçüleri', 'pending',
        missing?.length ? `Ölçü bekliyor · ${missing.join(' / ')}` : 'Ölçü bekliyor · zemine yakın, orta ve tavana yakın genişlikler.', target)
      continue
    }
    const { usable, modules } = reading.result
    const affected = modules.filter(module => module.deficit > 0)
    add(`${edge.wall.id}/survey`, wall, 'Saha ölçüleri', hasWarning(affected),
      `Ortak net ${fmt(usable)} cm` + (affected.length
        ? ` · ${affected.map(({ item, deficit }) => `${item.name} ${fmt(deficit)} cm aşıyor`).join(' / ')}` : ''), target)
  }

  for (const reading of electricalReadings(project, edges)) {
    const { edge, point, status, detail } = reading
    add(`${point.id}/electrical`, point.name, point.kind === 'light-feed' ? 'Aplik çıkışı' : 'Elektrik noktası erişimi', status,
      [electricalPosition(reading), detail, point.example ? 'Örnek ölçü' : ''].filter(Boolean).join(' · '),
      { kind: 'electrical', id: point.id, wallId: edge.wall.id })
  }

  const measurements = readMeasurements(project, edges, items)
  if (!measurements.some(row => row.measurement.kind === 'passage') && items.length) {
    add('missing/passage', 'Oda', 'Geçiş mesafesi', 'pending', 'Ölçü bekliyor · bir geçiş noktası işaretle.', { kind: 'measurement' })
  }
  for (const { measurement, text, detail, warning, unavailable } of measurements) {
    const status = warning ? unavailable ? 'pending' : 'warning' : 'passed'
    const outcome = measurement.kind === 'passage' ? `${text} · alt sınır ${fmt(measurement.minimum)} cm` : text
    add(`${measurement.id}/measurement`, measurement.name, 'Kayıtlı ölçü', status, [outcome, detail].filter(Boolean).join(' · '),
      { kind: 'measurement', id: measurement.id, itemId: measurement.kind !== 'passage' ? measurement.sourceId : undefined })
  }
  const order: Record<ReviewStatus, number> = { warning: 0, pending: 1, passed: 2 }
  return rows.sort((a, b) => order[a.status] - order[b.status])
}
