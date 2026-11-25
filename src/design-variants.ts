import { editLayoutItems, layoutScene } from './layout-variants'
import { furnitureMaterialPreset } from './materials'
import { maxDesigns, projectItemLists, uid } from './model'
import type { DesignItem, Furniture, Presentation, Project, RoomSurface } from './model'

export const originalDesign = ''
export const originalDesignName = 'Özgün görünüm'
export const activeDesign = (project: Project) => project.designs?.active ?? originalDesign
export const findDesign = (project: Project, id: string) => project.designs?.entries.find(entry => entry.id === id)
export const designName = (project: Project, id = activeDesign(project)) => findDesign(project, id)?.name ?? originalDesignName

function roomSurface(style: RoomSurface): RoomSurface {
  const { floor, wall, floorFinish, wallFinish, floorTexture, wallTexture, surfaceRelief, colorSaturation, wallCoverings } = style
  return { floor, wall, floorFinish, wallFinish, floorTexture, wallTexture, surfaceRelief, colorSaturation, wallCoverings }
}

function itemAppearance({ id, color, material, appearances }: Furniture): DesignItem {
  return { id, color, material, appearances }
}

export function designScene(project: Project, id = activeDesign(project)): Project {
  if (!project.designs) return project
  const design = findDesign(project, id)
  const { designs, ...scene } = project
  if (!design) return scene
  const overrides = new Map(design.items.map(item => [item.id, item]))
  return { ...scene, style: { ...scene.style, ...roomSurface(design.surface) }, items: scene.items.map(item => {
    const paint = overrides.get(item.id)
    return paint ? { ...item, color: paint.color, appearances: paint.appearances,
      material: paint.material?.preset === furnitureMaterialPreset(item.kind) ? paint.material : undefined } : item
  }) }
}

export function duplicateDesign(project: Project, sourceId: string, name: string): Project {
  const entries = project.designs?.entries ?? []
  if (entries.length >= maxDesigns || (sourceId !== originalDesign && !findDesign(project, sourceId))) return project
  const source = designScene(project, sourceId)
  const items = new Map(findDesign(project, sourceId)?.items.map(item => [item.id, item]))
  for (const item of source.items) items.set(item.id, itemAppearance(item))
  const entry = { id: uid(), name, surface: roomSurface(source.style), items: [...items.values()] }
  return { ...project, designs: { active: entry.id, entries: [...entries, entry] } }
}

export function selectDesign(project: Project, id: string): Project {
  const book = project.designs
  if (!book || id === activeDesign(project) || (id !== originalDesign && !findDesign(project, id))) return project
  return { ...project, designs: { ...book, active: id || undefined } }
}

function changeDesign(project: Project, id: string,
  change: (entry: NonNullable<ReturnType<typeof findDesign>>) => NonNullable<ReturnType<typeof findDesign>>): Project {
  const book = project.designs
  if (!book || !findDesign(project, id)) return project
  return { ...project, designs: { ...book, entries: book.entries.map(entry => entry.id === id ? change(entry) : entry) } }
}

export function renameDesign(project: Project, id: string, name: string) {
  return findDesign(project, id)?.name === name ? project : changeDesign(project, id, entry => ({ ...entry, name }))
}

export function removeDesign(project: Project, id: string): Project {
  if (!project.designs || !findDesign(project, id)) return project
  const entries = project.designs.entries.filter(entry => entry.id !== id)
  const active = project.designs.active === id ? undefined : project.designs.active
  return { ...project, designs: entries.length ? { active, entries } : undefined }
}

export function editDesignSurface(project: Project, id: string, patch: Partial<RoomSurface>) {
  if (id === originalDesign) return { ...project, style: { ...project.style, ...patch } }
  return changeDesign(project, id, entry => ({ ...entry, surface: { ...entry.surface, ...patch } }))
}

export function editDesignItem(project: Project, designId: string, layoutId: string | undefined, itemId: string,
  change: (appearance: DesignItem) => DesignItem): Project {
  const item = layoutScene(project, layoutId).items.find(item => item.id === itemId)
  if (!item) return project
  if (designId === originalDesign) return editLayoutItems(project, layoutId,
    items => items.map(item => item.id === itemId ? { ...item, ...change(itemAppearance(item)) } : item))
  return changeDesign(project, designId, entry => {
    const existing = entry.items.find(item => item.id === itemId)
    const next = change(existing ?? itemAppearance(item))
    const items = existing ? entry.items.map(item => item === existing ? next : item) : [...entry.items, next]
    return { ...entry, items }
  })
}

export function dropUnusedDesignItems(project: Project): Project {
  const book = project.designs
  if (!book) return project
  const ids = new Set(projectItemLists(project).flat().map(item => item.id))
  const entries = book.entries.map(entry => {
    const items = entry.items.filter(item => ids.has(item.id))
    return items.length === entry.items.length ? entry : { ...entry, items }
  })
  return entries.some((entry, index) => entry !== book.entries[index])
    ? { ...project, designs: { ...book, entries } } : project
}

export function dropUnusedWallCoverings(project: Project): Project {
  const used = new Set(project.walls.map(wall => wall.id))
  function trim<T extends RoomSurface>(surface: T): T {
    const coverings = surface.wallCoverings
    if (!coverings || Object.keys(coverings).every(id => used.has(id))) return surface
    const entries = Object.entries(coverings).filter(([id]) => used.has(id))
    return { ...surface, wallCoverings: entries.length ? Object.fromEntries(entries) : undefined }
  }
  return { ...project, style: trim(project.style), designs: project.designs && { ...project.designs,
    entries: project.designs.entries.map(entry => ({ ...entry, surface: trim(entry.surface) })) } }
}

export function saveDesignPresentation(project: Project, id: string, settings: Presentation): Project {
  if (id === originalDesign) return { ...project, ...settings }
  if (!findDesign(project, id)) return project
  const next = editDesignSurface(project, id, roomSurface(settings.style))
  return { ...next, ...settings, style: { ...settings.style, ...roomSurface(project.style) } }
}
