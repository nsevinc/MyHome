import { roomEdges } from './geometry'
import { fmt } from './model'
import type { Furniture, Project, WardrobeFillArea } from './model'
import { readyWidths, wardrobeFillGeometry } from './wardrobe-fill'

export type WidthEdit = { itemId: string; width: number }
export type BalanceSummary = { before: number[]; excess: number; itemId: string }
type Result = { modules: Furniture[]; summary: BalanceSummary } | { error: string }
type Path = { previous?: Path; item?: Furniture; index: number; changes: number; distance: number; anchorCost: number; lostVolume: number }

function better(a: Path, b: Path) {
  return (a.changes - b.changes || a.lostVolume - b.lostVolume || a.distance - b.distance || a.anchorCost - b.anchorCost) < 0
}

export function rebalanceWardrobe(project: Project, modules: Furniture[], area: WardrobeFillArea, gap: number, edit: WidthEdit): Result {
  const selected = modules.findIndex(item => item.id === edit.itemId)
  const run = modules[selected]?.wardrobeRun
  const edges = roomEdges(project.walls)
  const edge = edges.find(e => e.wall.id === run?.wallId)
  if (!run || !edge || area.profile !== 'ready' || !Number.isInteger(edit.width) || edit.width < 200 || edit.width > 50000 ||
    modules.some(item => item.wardrobeRun?.id !== run.id || !item.wardrobeRun?.anchor)) return { error: 'Bu ölçü için hazır modül dizisi bulunamadı.' }
  if (modules.some(item => item.locked) || run.anchor?.fixed) return { error: 'Genişliği değiştirmek için önce modülün sabitlemesini veya konum kilidini kaldırın.' }
  const start = (i: number) => modules[i].wardrobeRun!.anchor!.start
  const end = (i: number) => start(i) + modules[i].width
  const fixed = (i: number) => modules[i].wardrobeRun!.anchor!.fixed
  // Keep independently filled spans (doors, fixed modules) on their own side.
  let first = selected, last = selected
  while (first > 0 && !fixed(first - 1) && end(first - 1) + gap === start(first)) first--
  while (last + 1 < modules.length && !fixed(last + 1) && end(last) + gap === start(last + 1)) last++
  const left = first === 0 ? area.start : start(first)
  const right = last === modules.length - 1 ? area.end : end(last)
  const pinnedLeft = first > 0 && fixed(first - 1) && end(first - 1) + gap === start(first)
  const pinnedRight = last + 1 < modules.length && fixed(last + 1) && end(last) + gap === start(last + 1)
  const fromEnd = pinnedRight || (!pinnedLeft && end(last) === right && (right === edge.wall.length || start(first) > left))
  // Keep the original reference edge when the selection is inside a longer wall.
  const origin = fromEnd ? end(last) : start(first)
  const capacity = fromEnd ? origin - left : right - origin
  const previousLength = end(last) - start(first)
  const requestedLength = previousLength + edit.width - modules[selected].width
  const limit = Math.min(capacity, Math.max(previousLength, requestedLength))
  const geometry = wardrobeFillGeometry(project, edges, edge, run.id, area)
  let paths = new Map<number, Path>([[0, { index: -1, changes: 0, distance: 0, anchorCost: 0, lostVolume: 0 }]])
  for (let step = 0; step <= last - first; step++) {
    const index = fromEnd ? last - step : first + step
    const item = modules[index]
    const widths = index === selected ? [edit.width] : new Set([item.width, ...readyWidths])
    const next = new Map<number, Path>()
    for (const [used, path] of paths) for (const width of widths) {
      const length = used + (step ? gap : 0) + width
      if (length > limit) continue
      const along = fromEnd ? origin - length : origin + length - width
      const body = geometry.fit(along, along + width, 'storage', item)
      if (!body) continue
      const delta = Math.abs(item.width - width)
      const candidate: Path = { previous: path, index,
        item: { ...item, width, height: body.height, depth: body.depth, wardrobeRun: { ...item.wardrobeRun!, anchor: { start: along, inset: body.inset } } },
        changes: path.changes + Number(delta > 0), distance: path.distance + delta * Math.abs(index - selected),
        anchorCost: path.anchorCost + delta * (last - first - step), lostVolume: path.lostVolume + width * (item.depth * item.height - body.depth * body.height) }
      const prior = next.get(length)
      if (!prior || better(candidate, prior)) next.set(length, candidate)
    }
    paths = next
  }
  const length = pinnedLeft && pinnedRight ? previousLength : Math.max(...paths.keys())
  const solution = paths.get(length)
  if (!solution) return { error: `${fmt(edit.width)} cm için bitişik bir dizi sığmıyor. Sabit modülleri, kapı açıklığını ve kullanılabilir alanı kontrol edin.` }
  const updated = [...modules]
  for (let p: Path | undefined = solution; p?.item; p = p.previous) updated[p.index] = p.item
  return { modules: updated, summary: { itemId: edit.itemId, before: modules.map(item => item.width),
    excess: Math.max(0, requestedLength - capacity) } }
}
