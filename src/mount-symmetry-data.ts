import type { Furniture, MountSymmetryRule, Wall } from './model'

export function keepMountSymmetries(rules: MountSymmetryRule[] | undefined, items: Furniture[], walls: Wall[]) {
  if (!rules?.length) return rules
  const ids = new Set(items.map(item => item.id))
  const wallIds = new Set(walls.map(wall => wall.id))
  const remaining = rules.filter(rule => wallIds.has(rule.wallId) && ids.has(rule.leftId) && ids.has(rule.rightId) &&
    (!rule.referenceId || ids.has(rule.referenceId)))
  return remaining.length === rules.length ? rules : remaining.length ? remaining : undefined
}
