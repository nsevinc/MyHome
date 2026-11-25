import type { Furniture, FurnitureLink } from './model'

export function canLink(item: Furniture) {
  return !item.mount && item.kind !== 'pendant'
}

export function orderFurnitureLinks(items: Furniture[], links: readonly FurnitureLink[]) {
  const byId = new Map(items.map(item => [item.id, item]))
  const byDependent = new Map<string, FurnitureLink>()
  const ids = new Set<string>()
  for (const link of links) {
    const reference = byId.get(link.referenceId)
    const dependent = byId.get(link.itemId)
    if (!reference || !dependent || !canLink(reference) || !canLink(dependent))
      return { error: 'Bağlı yerleşim için bu plandaki iki serbest eşya seç.' }
    if (ids.has(link.id) || byDependent.has(link.itemId))
      return { error: `${dependent.name} zaten bir referans eşyaya bağlı.` }
    ids.add(link.id)
    byDependent.set(link.itemId, link)
  }
  const visiting = new Set<string>()
  const done = new Set<string>()
  const ordered: FurnitureLink[] = []
  function visit(itemId: string): boolean {
    if (visiting.has(itemId)) return false
    const link = byDependent.get(itemId)
    if (!link || done.has(itemId)) return true
    visiting.add(itemId)
    if (!visit(link.referenceId)) return false
    visiting.delete(itemId)
    done.add(itemId)
    ordered.push(link)
    return true
  }
  for (const id of byDependent.keys()) {
    if (!visit(id)) return { error: 'Bu kural döngü oluşturuyor. Başka bir referans eşya seç.' }
  }
  return { ordered }
}

export function removeMissingLinks(items: Furniture[], links?: FurnitureLink[]) {
  if (!links?.length) return links
  const eligible = new Set(items.filter(canLink).map(item => item.id))
  const kept = links.filter(link => eligible.has(link.referenceId) && eligible.has(link.itemId))
  return kept.length === links.length ? links : kept.length ? kept : undefined
}
