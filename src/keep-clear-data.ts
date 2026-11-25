import type { Furniture, KeepClearRule } from './model'

export function keepExistingClearances(items: Furniture[], rules?: KeepClearRule[]) {
  if (!rules?.length) return rules
  const itemIds = new Set(items.map(item => item.id))
  const runs = new Set(items.map(item => item.wardrobeRun?.id))
  const remaining = rules.filter(rule => rule.owner === 'run' ? runs.has(rule.ownerId) : itemIds.has(rule.ownerId))
  return remaining.length === rules.length ? rules : remaining.length ? remaining : undefined
}
