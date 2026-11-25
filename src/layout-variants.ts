import { placement, roomEdges, wallMountPose } from './geometry'
import { readMeasurements } from './measurements'
import { fmt, maxLayouts, uid } from './model'
import type { Furniture, LayoutEntry, Project } from './model'
import { cabinetDoorClearance, doorCollisionText } from './wardrobe'
import { removeMissingLinks } from './furniture-links'
import { keepMountSymmetries } from './mount-symmetry-data'
import { keepExistingClearances } from './keep-clear-data'
import { keepUpperRows } from './upper-row-data'
import { electricalReadings } from './electrical-points'

export type LayoutPair = [string, string]
export const layoutName = (project: Project, id = project.layouts?.active) => project.layouts?.entries.find(entry => entry.id === id)?.name

export function defaultLayoutPair(project: Project): LayoutPair | undefined {
  const book = project.layouts
  if (!book) return
  const [first, second] = book.entries
  return [first.id, book.active === first.id ? second.id : book.active]
}

export function resolveLayoutPair(project: Project, pair?: LayoutPair) {
  const entries = project.layouts?.entries
  if (pair && pair[0] !== pair[1] && pair.every(id => entries?.some(entry => entry.id === id))) return pair
  return defaultLayoutPair(project)
}

export function duplicateLayout(project: Project, items = project.items): Project | undefined {
  if ((project.layouts?.entries.length ?? 1) >= maxLayouts) return
  const entries: LayoutEntry[] = project.layouts?.entries ?? [{ id: uid(), name: 'Yerleşim A' }]
  const active = project.layouts?.active ?? entries[0].id
  const names = new Set(entries.map(entry => entry.name))
  const label = Array.from({ length: maxLayouts + 1 }, (_, index) => `Yerleşim ${String.fromCharCode(65 + index)}`)
    .find(name => !names.has(name))!
  const copy = { id: uid(), name: label }
  return { ...project, items: [...items], keepClear: keepExistingClearances(items, project.keepClear), mountSymmetries: keepMountSymmetries(project.mountSymmetries, items, project.walls),
    upperCabinetRows: keepUpperRows(project.upperCabinetRows, items),
    layouts: { active: copy.id, entries: [
    ...entries.map(entry => entry.id === active ? { ...entry, items: project.items, furnitureLinks: project.furnitureLinks,
      mountSymmetries: project.mountSymmetries, keepClear: project.keepClear, upperCabinetRows: project.upperCabinetRows } : entry), copy,
  ] } }
}

export function switchLayout(project: Project, id: string): Project {
  const book = project.layouts
  const selected = book?.entries.find(entry => entry.id === id)
  if (!book || !selected?.items) return project
  return { ...project, items: selected.items, furnitureLinks: selected.furnitureLinks, mountSymmetries: selected.mountSymmetries, keepClear: selected.keepClear,
    upperCabinetRows: selected.upperCabinetRows,
    layouts: { active: id, entries: book.entries.map(entry => {
    if (entry.id === book.active) return { ...entry, items: project.items, furnitureLinks: project.furnitureLinks, mountSymmetries: project.mountSymmetries, keepClear: project.keepClear, upperCabinetRows: project.upperCabinetRows }
    if (entry.id === id) return { id: entry.id, name: entry.name }
    return entry
  }) } }
}

export function renameLayout(project: Project, id: string, name: string): Project {
  if (!project.layouts?.entries.some(entry => entry.id === id && entry.name !== name)) return project
  return { ...project, layouts: { ...project.layouts, entries: project.layouts.entries.map(entry =>
    entry.id === id ? { ...entry, name } : entry) } }
}

export function layoutScene(project: Project, id?: string): Project {
  const { layouts, ...shared } = project
  const selected = layouts?.entries.find(entry => entry.id === id)
  return selected?.items ? { ...shared, items: selected.items, furnitureLinks: selected.furnitureLinks,
    mountSymmetries: selected.mountSymmetries, keepClear: selected.keepClear, upperCabinetRows: selected.upperCabinetRows } : shared
}

export function editLayoutItems(project: Project, id: string | undefined, change: (items: Furniture[]) => Furniture[]): Project {
  const book = project.layouts
  const target = id ?? book?.entries[0].id
  if (target === book?.active) {
    const items = change(project.items)
    return { ...project, items, keepClear: keepExistingClearances(items, project.keepClear), furnitureLinks: removeMissingLinks(items, project.furnitureLinks),
      mountSymmetries: keepMountSymmetries(project.mountSymmetries, items, project.walls), upperCabinetRows: keepUpperRows(project.upperCabinetRows, items) }
  }
  const entry = book?.entries.find(entry => entry.id === target)
  if (!book || !entry?.items) return project
  const items = change(entry.items)
  const next = { ...entry, items, keepClear: keepExistingClearances(items, entry.keepClear), furnitureLinks: removeMissingLinks(items, entry.furnitureLinks),
    mountSymmetries: keepMountSymmetries(entry.mountSymmetries, items, project.walls), upperCabinetRows: keepUpperRows(entry.upperCabinetRows, items) }
  return { ...project, layouts: { ...book, entries: book.entries.map(candidate => candidate === entry ? next : candidate) } }
}

export function layoutReport(scene: Project) {
  const edges = roomEdges(scene.walls)
  const items = scene.items.map(item => wallMountPose(item, edges))
  const structuralWarnings: { item: string; message: string }[] = []
  const placementWarnings: { item: string; message: string }[] = []
  for (const item of items) {
    const fit = placement(scene, item, edges)
    const structural = fit.obstruction && fit.clearance < 0 ?
      `${fit.obstruction} ile ${fmt(-fit.clearance)} cm çakışma.` : undefined
    for (const message of fit.warning) {
      const warnings = message === structural ? structuralWarnings : placementWarnings
      warnings.push({ item: item.name, message })
    }
  }
  const doorWarnings = items.flatMap(item => cabinetDoorClearance(scene, item, edges)
    .flatMap(door => door.hit ? [{ item: item.name, message: doorCollisionText(door.index, door.hit, door.label) }] : []))
  return {
    placementWarnings, structuralWarnings, doorWarnings,
    electrical: electricalReadings(scene, edges),
    measurements: readMeasurements(scene, edges, items),
  }
}
