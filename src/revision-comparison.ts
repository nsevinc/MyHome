import { itemBottom, roomEdges, wallMountPose, windowSill } from './geometry'
import { fmt, furnitureAngle } from './model'
import type { Project } from './model'
import { mountingReview, reviewLabels } from './mounting-review'
import type { ReviewFinding, ReviewShortfall } from './mounting-review'

export type PlanFocus = { kind: 'item' | 'wall' | 'section' | 'measurement'; id: string; itemId?: string }
type Field = { label: string; value: string | number; unit?: 'cm' | '°' }
type PlanRecord = { key: string; name: string; fields: Field[]; focus?: PlanFocus }
type Variation = { label: string; before: string; after: string; delta?: string }
export type PlanChange = { key: string; name: string; changes: Variation[]; before?: PlanFocus; after?: PlanFocus }
type FindingChange = 'new-warning' | 'resolved' | 'pending' | 'changed' | 'removed'
export type CheckChange = { key: string; kind: FindingChange; before?: ReviewFinding; after?: ReviewFinding; delta?: string; changed: boolean }
export type RevisionComparison = ReturnType<typeof compareRevisions>

export const findingChangeLabel: Record<FindingChange, string> = {
  'new-warning': 'Yeni uyarı', resolved: 'Çözüldü', pending: 'Bilgi bekliyor', changed: 'Sonuç değişti', removed: 'Kontrol kaldırıldı',
}

const distance = (label: string, value: number): Field => ({ label, value, unit: 'cm' })
const angle = (label: string, value: number): Field => ({ label, value, unit: '°' })
const description = (label: string, value: string): Field => ({ label, value })
const surveyDistance = (label: string, value?: number) => value === undefined ? description(label, 'Ölçülmedi') : distance(label, value)
const size = (value: number, unit: Field['unit']) => unit === 'cm' ? fmt(value) + ' cm'
  : value.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + (unit ?? '')
const signed = (change: number, unit: Field['unit']) => (change > 0 ? '+' : '−') + size(Math.abs(change), unit)
const fieldText = (field: Field) => typeof field.value === 'number' ? size(field.value, field.unit) : field.value

function readPlan(project: Project) {
  const edges = roomEdges(project.walls)
  const records: PlanRecord[] = [{ key: 'room', name: 'Oda', fields: [
    distance('Tavan yüksekliği', project.height), distance('Duvar kalınlığı', project.thickness),
  ] }]
  for (const { wall, index, a, b } of edges) {
    const name = `Duvar ${index + 1}`
    const focus = { kind: 'wall', id: wall.id } as const
    records.push({ key: `wall/${wall.id}`, name, focus, fields: [distance('Uzunluk', wall.length),
      distance('Başlangıç X', a.x), distance('Başlangıç Z', a.z),
      distance('Bitiş X', b.x), distance('Bitiş Z', b.z)] })
    if (wall.survey) records.push({ key: `survey/${wall.id}`, name: `${name} · saha ölçüleri`, focus, fields: [
      surveyDistance('Zemine yakın', wall.survey.floor), surveyDistance('Orta kot', wall.survey.middle),
      surveyDistance('Tavana yakın', wall.survey.upper), distance('Her uçta montaj payı', wall.survey.allowance),
    ] })
    if (wall.baseboard) records.push({ key: `baseboard/${wall.id}`, name: `${name} · Süpürgelik`, focus,
      fields: [distance('Yükseklik', wall.baseboard.height), distance('Taşma', wall.baseboard.depth)] })
    for (const [index, gap] of (wall.baseboard?.gaps ?? []).entries()) records.push({
      key: `baseboard-gap/${gap.id}`, name: `${name} · Süpürgelik boşluğu ${index + 1}`, focus,
      fields: [distance('Başlangıç', gap.start), distance('Uzunluk', gap.width)],
    })
    for (const opening of wall.openings) {
      const label = opening.kind === 'door' ? 'Kapı' : 'Pencere'
      records.push({ key: `opening/${opening.id}`, name: `${name} · ${label}`, focus, fields: [
        description('Duvar', name), description('Tür', label), distance('Duvardaki konum', opening.offset),
        distance('Genişlik', opening.width), distance('Yükseklik', opening.height), distance('Alt kot', opening.bottom),
      ] })
      const sill = windowSill(wall, opening)
      if (sill) records.push({ key: `sill/${opening.id}`, name: `${name} · Mermer denizlik`, focus, fields: [
        distance('Genişlik', sill.width), distance('Derinlik', sill.depth), distance('Kalınlık', sill.thickness),
        distance('Alt kot', opening.bottom), description('Mermer türü', sill.finish === 'gray' ? 'Gri damarlı' : 'Beyaz damarlı'),
      ] })
      if (opening.trim) records.push({ key: `trim/${opening.id}`, name: `${name} · Pencere pervazı`, focus,
        fields: [distance('Genişlik', opening.trim.width), distance('Taşma', opening.trim.depth)] })
    }
    for (const block of wall.obstacles) {
      records.push({ key: `block/${block.id}`, name: block.name, focus, fields: [
        description('Duvar', name), distance('Duvardaki konum', block.offset), distance('Genişlik', block.width),
        distance('Taşma', block.depth), distance('Alt kot', block.bottom), distance('Üst kot', block.top),
      ] })
    }
  }
  for (const source of project.items) {
    const item = wallMountPose(source, edges)
    const wardrobe = item.wardrobe
    const doors = wardrobe ? `${wardrobe.doors} ${wardrobe.motion === 'sliding' ? 'sürgülü panel' : 'menteşeli kapak'} · ${{
      open: 'Açık', closed: 'Kapalı', none: 'Kapaksız',
    }[wardrobe.pose]}` : '—'
    const panelPosition = wardrobe?.motion === 'sliding' && wardrobe.pose === 'open'
      ? `${wardrobe.parking === 'right' ? 'Sağda' : 'Solda'} · %${Math.round((wardrobe.slide ?? 1) * 100)}` : '—'
    records.push({ key: `item/${item.id}`, name: item.name, focus: { kind: 'item', id: item.id }, fields: [
      distance('Merkez X', item.x), distance('Merkez Z', item.z), distance('Genişlik', item.width),
      distance('Derinlik', item.depth), distance('Yükseklik', item.height),
      distance('Alt kot', itemBottom(item, project.height)), angle('Dönüş', furnitureAngle(item)),
      description('Kapak düzeni', doors), description('Sürgü konumu', panelPosition),
    ] })
  }
  for (const cut of project.sections ?? []) {
    records.push({ key: `section/${cut.id}`, name: cut.name, focus: { kind: 'section', id: cut.id }, fields: [
      description('Kesit yönü', cut.axis.toUpperCase()), distance('Kesit konumu', cut.offset),
    ] })
  }
  return records
}

function comparePlan(before: PlanRecord[], after: PlanRecord[]) {
  const previous = new Map(before.map(row => [row.key, row]))
  const next = new Map(after.map(row => [row.key, row]))
  const result: PlanChange[] = []
  for (const key of new Set([...next.keys(), ...previous.keys()])) {
    const a = previous.get(key), b = next.get(key)
    const name = (b ?? a)!.name
    const changes: Variation[] = []
    if (!a || !b) {
      const details = (a ?? b)!.fields.filter(field => field.value !== '—')
        .map(field => `${field.label} ${fieldText(field)}`).join(' · ')
      changes.push({ label: b ? 'Eklendi' : 'Kaldırıldı', before: a ? details : '—', after: b ? details : '—' })
    } else {
      if (a.name !== b.name) changes.push({ label: 'Ad', before: a.name, after: b.name })
      b.fields.forEach((field, index) => {
        const prior = a.fields[index]
        if (prior.value === field.value) return
        const delta = typeof field.value === 'number' && typeof prior.value === 'number'
          ? signed(field.value - prior.value, field.unit) : undefined
        changes.push({ label: field.label, before: fieldText(prior), after: fieldText(field), delta })
      })
    }
    if (changes.length) result.push({ key, name, changes, before: a?.focus, after: b?.focus })
  }
  return result
}

function shortfallDelta(before?: ReviewShortfall, after?: ReviewShortfall) {
  if (!before || !after || before.unit !== after.unit) return
  const difference = after.value - before.value
  if (Math.abs(difference) < (after.unit === 'cm' ? .5 : .05)) return
  return `Açılım eksiği ${signed(difference, after.unit)}`
}

function compareChecks(before: ReviewFinding[], after: ReviewFinding[]) {
  const previous = new Map(before.map(row => [row.key, row]))
  const next = new Map(after.map(row => [row.key, row]))
  const checks: CheckChange[] = []
  for (const key of new Set([...next.keys(), ...previous.keys()])) {
    const a = previous.get(key), b = next.get(key)
    const delta = shortfallDelta(a?.shortfall, b?.shortfall)
    const changed = a?.status !== b?.status || a?.detail !== b?.detail || a?.check !== b?.check || Boolean(delta)
    const kind = !b ? 'removed' : b.status === 'pending' ? 'pending'
      : b.status === 'warning' && a?.status !== 'warning' ? 'new-warning'
      : b.status === 'passed' && a?.status === 'warning' ? 'resolved' : 'changed'
    if (changed || kind === 'pending') checks.push({ key, kind, before: a, after: b, delta, changed })
  }
  const order: Record<FindingChange, number> = { 'new-warning': 0, resolved: 1, changed: 2, removed: 3, pending: 4 }
  return checks.sort((a, b) => order[a.kind] - order[b.kind])
}

export function compareRevisions(before: Project, after: Project) {
  const plan = comparePlan(readPlan(before), readPlan(after))
  const checks = compareChecks(mountingReview(before), mountingReview(after))
  return { plan, checks }
}

export const findingText = (row?: ReviewFinding) => row ? `${reviewLabels[row.status]} · ${row.detail}` : '—'
