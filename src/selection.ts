import type { Furniture } from './model'

export type Selection = { kind: 'room' } | { kind: 'wall' | 'item'; id: string } | { kind: 'items'; ids: string[] }

export function selectedItemIds(selection: Selection): readonly string[] {
  if (selection.kind === 'items') return selection.ids
  return selection.kind === 'item' ? [selection.id] : []
}

export function itemSelection(ids: string[]): Selection {
  if (ids.length > 1) return { kind: 'items', ids }
  return ids.length === 1 ? { kind: 'item', id: ids[0] } : { kind: 'room' }
}

export function toggleItemSelection(selection: Selection, id: string): Selection {
  const ids = selectedItemIds(selection)
  return itemSelection(ids.includes(id) ? ids.filter(candidate => candidate !== id) : [...ids, id])
}
export function removeSelectedFurniture(items: Furniture[], selection: Selection) {
  const selected = new Set(selectedItemIds(selection))
  const remaining = items.filter(item => !selected.has(item.id) || item.locked)
  if (remaining.length === items.length) return
  return { items: remaining, selection: itemSelection(remaining.filter(item => selected.has(item.id)).map(item => item.id)) }
}
