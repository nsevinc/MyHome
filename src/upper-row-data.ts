import type { Furniture, UpperCabinetRow } from './model'

export const isUpperCabinet = (item: Furniture) => item.kind === 'wall-cabinet' && Boolean(item.mount && item.wardrobe)

export function keepUpperRows(rows: UpperCabinetRow[] | undefined, items: Furniture[]) {
  if (!rows?.length) return rows
  const byId = new Map(items.map(item => [item.id, item]))
  const kept = rows.flatMap(row => {
    const members = row.members.filter(id => { const item = byId.get(id); return item && isUpperCabinet(item) })
    if (members.length < 2) return []
    const lostBed = row.alignment === 'bed' && byId.get(row.bedId!)?.kind !== 'bed'
    if (members.length === row.members.length && !lostBed) return [row]
    const first = byId.get(members[0])!
    return [{ ...row, members, ...(lostBed && { alignment: 'left' as const, bedId: undefined,
      anchor: Math.max(0, first.mount!.offset - first.width / 2) }) }]
  })
  return kept.length === rows.length && kept.every((r, i) => r === rows[i]) ? rows : kept.length ? kept : undefined
}
