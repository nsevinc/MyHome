import { useEffect, useId, useMemo, useRef } from 'react'
import { bounds, footprintCorners, obstructionVolume, wallMountPose, wallPoint } from './geometry'
import { clearanceArchitecture, readClearances } from './keep-clear'
import { fmt } from './model'
import type { Furniture, Point } from './model'
import { DoorSweeps } from './DoorSweeps'
import type { BalanceSummary } from './wardrobe-rebalance'
import type { buildWardrobeRun, inspectWardrobeRun } from './wardrobe-run'

type Run = NonNullable<ReturnType<typeof buildWardrobeRun>>
type Checks = ReturnType<typeof inspectWardrobeRun>
const points = (shape: Point[]) => shape.map(p => `${p.x},${p.z}`).join(' ')
const angle = (degrees: number) => degrees.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '°'

function openingText(row: Checks[number]) {
  if (row.slider) return row.slider.hit ? `Sürgü · ${fmt(row.slider.hit.distance)} cm’de ${row.slider.hit.label}` : `Sürgü · ${fmt(row.slider.limit)} cm serbest`
  if (!row.doors.length) return 'Kapak yok'
  if (row.doors.every(d => !d.hit && d.limit === row.doors[0].limit)) return `${row.doors.length} kapak · ${angle(row.doors[0].limit)} serbest`
  return row.doors.map(d => d.hit ? `${d.label} · ${angle(d.hit.angle)}’de ${d.hit.label} ile temas` : `${d.label} · ${angle(d.limit)} serbest`).join(' / ')
}

export function WardrobeBalancePreview({ run, checks, summary, comparison }: { run: Run; checks: Checks; summary?: BalanceSummary
  comparison?: { before: Furniture[]; route?: Point[]; strips: Point[][] } }) {
  const arrow = useId()
  const comparing = Boolean(comparison)
  const section = useRef<HTMLElement>(null)
  useEffect(() => { if (!comparing) section.current?.scrollIntoView({ block: 'start' }) }, [summary, comparing])
  const { project, edges, edge, parts } = run
  const fill = run.fill!
  const area = [wallPoint(edge, fill.start), wallPoint(edge, fill.end), wallPoint(edge, fill.end, fill.depth), wallPoint(edge, fill.start, fill.depth)]
  const others = project.items.filter(item => item.wardrobeRun?.id !== parts[0].item.wardrobeRun?.id)
  const clearances = useMemo(() => {
    const rules = project.keepClear?.filter(rule => parts.some(({ item }) => (rule.owner === 'run' ? item.wardrobeRun?.id : item.id) === rule.ownerId))
    return rules?.length ? readClearances(rules, project.items.map(item => wallMountPose(item, edges)), project.height, clearanceArchitecture(project, edges)) : []
  }, [project, edges, parts])
  const worst = clearances.reduce<typeof clearances[number] | undefined>((a, b) => !a || b.shortage > a.shortage ||
    (b.shortage === a.shortage && (b.gap ?? Infinity) < (a.gap ?? Infinity)) ? b : a, undefined)
  const depth = Math.max(fill.depth + 500, ...parts.map(p => p.inset + p.item.depth + p.item.width / (p.item.wardrobe?.doors ?? 1)))
  const crop = bounds(comparison ? edges.map(e => e.a) :
    [...area, wallPoint(edge, fill.start, depth), wallPoint(edge, fill.end, depth), ...clearances.flatMap(c => c.polygon)])
  const font = Math.max(68, Math.max(crop.width, crop.depth) / 40)
  const unused = fill.end - fill.start - parts.reduce((sum, p) => sum + p.item.width, 0)
  const title = comparison ? 'Seçeneğin plandaki görünümü' : 'Dengeleme önizlemesi'
  return <section ref={section} className="wardrobe-balance-preview" aria-label={title}>
    <h3>{title}</h3>
    <p><strong>{parts.map(p => fmt(p.item.width)).join(' + ')} cm</strong> · {fmt(fill.end - fill.start)} cm alanda {fmt(unused)} cm boşluk</p>
    {summary && summary.excess > 0 && <p>Seçilen genişlikle ilk dizi alanı {fmt(summary.excess)} cm aşıyordu.</p>}
    <svg className="wardrobe-run-elevation" role="img" aria-label="Dengelenen modüller, kolonlar ve kapak açılımı"
      viewBox={`${crop.x - 145} ${crop.z - 145} ${crop.width + 290} ${crop.depth + 290}`}>
      {comparison && <defs><marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#684099" /></marker></defs>}
      <polygon points={points(edges.map(e => e.a))} fill="#f3ecdf" stroke="#5b625b" strokeWidth="22" />
      {edges.flatMap(e => e.wall.openings.map(opening => {
        const a = wallPoint(e, opening.offset), b = wallPoint(e, opening.offset + opening.width)
        return <line key={opening.id} x1={a.x} y1={a.z} x2={b.x} y2={b.z}
          stroke={opening.kind === 'window' ? '#5e9ba0' : '#e0c8ab'} strokeWidth="28"><title>{opening.kind === 'window' ? 'Pencere' : 'Kapı'}</title></line>
      }))}
      <polygon points={points(area)} fill="#d5e7da" stroke="#688d78" strokeWidth="6" strokeDasharray="20 12" />
      {others.map(item => {
        const shape = footprintCorners(wallMountPose(item, edges))
        const box = bounds(shape)
        const left = Math.max(box.x, crop.x), right = Math.min(box.x + box.width, crop.x + crop.width)
        const top = Math.max(box.z, crop.z), bottom = Math.min(box.z + box.depth, crop.z + crop.depth)
        return <g key={item.id}><polygon points={points(shape)} fill="#c2b3a5" stroke="#8c8076" strokeWidth="5"><title>{item.name}</title></polygon>
          {item.kind === 'bed' && right - left > font * 4 && bottom - top > font * 3 &&
            <text x={(left + right) / 2} y={bottom - font / 2} fontSize={font * .82} textAnchor="middle" fill="#4e453f">{item.name}</text>}</g>
      })}
      {(comparison?.strips ?? clearances.map(c => c.polygon)).map((strip, index) =>
        <polygon key={index} points={points(strip)} fill="none" stroke="#80897c" strokeWidth="4" strokeDasharray="16 12" />)}
      {parts.map(({ item }) => <polygon key={item.id} points={points(footprintCorners(item))} fill={item.id === summary?.itemId ? '#bbd7c6' : '#ddc6a9'}
        stroke="#535c50" strokeWidth="7"><title>{item.name}</title></polygon>)}
      {edges.flatMap(e => e.wall.obstacles.map(o => {
        const box = obstructionVolume(e, o)
        return <g key={o.id}><rect x={box.x} y={box.z} width={box.width} height={box.depth}
          fill={o.bottom ? '#b78e59' : '#736959'} fillOpacity={o.bottom ? .45 : 1} /><title>{o.name}</title>
          {box.width >= font * 3 && box.depth >= font && <text x={box.x + box.width / 2} y={box.z + box.depth / 2} dominantBaseline="middle"
            fill="white" textAnchor="middle" fontSize={Math.min(font, box.width / Math.max(3, o.name.length * .56))}>{o.name}</text>}</g>
      }))}
      {checks.map(({ item, doors, slider }) => {
        if (!slider) return <DoorSweeps key={item.id} doors={doors} />
        const { start, direction, limit, hit } = slider
        const at = (distance: number) => ({ x: start.x + direction.x * distance, z: start.z + direction.z * distance })
        const stop = at(hit?.distance ?? limit), end = at(limit)
        return <g key={item.id} strokeWidth="10"><title>{item.name} · Sürgü yolu</title>
          <line x1={start.x} y1={start.z} x2={stop.x} y2={stop.z} stroke="#28715d" />
          {hit && <line x1={stop.x} y1={stop.z} x2={end.x} y2={end.z} stroke="#ae4932" strokeDasharray="18 9" />}
          <circle cx={stop.x} cy={stop.z} r="12" fill={hit ? '#ae4932' : '#28715d'} /></g>
      })}
      {parts.map(({ item }) => <text key={item.id} x={item.x} y={item.z} dominantBaseline="middle" textAnchor="middle"
        fontWeight="650" fontSize={font} fill="#293b30">{fmt(item.width)} cm</text>)}
      {comparison?.route && <polyline points={points(comparison.route)} fill="none" stroke="#28577b" strokeWidth="14"
        strokeDasharray="35 18"><title>Girişten gardıroba yürüyüş yolu</title></polyline>}
      {comparison?.before.map(from => {
        const to = others.find(i => i.id === from.id)
        if (!to || from.x === to.x && from.z === to.z) return null
        return <g key={from.id} fill="none" stroke="#684099" strokeWidth="12">
          <title>{from.name} · Önceki konum ve taşıma yönü</title>
          <polygon points={points(footprintCorners(from))} strokeDasharray="28 15" />
          <line x1={from.x} y1={from.z} x2={to.x} y2={to.z} markerEnd={`url(#${arrow})`} />
        </g>
      })}
    </svg>
    <table><thead><tr><th>Modül</th><th>En</th><th>Derinlik</th><th>Kapak açılımı</th></tr></thead><tbody>
      {checks.map((row, i) => <tr key={row.item.id}><th>{row.item.name}</th>
        <td>{summary && summary.before[i] !== row.item.width && `${fmt(summary.before[i])} → `}{fmt(row.item.width)} cm</td>
        <td>{fmt(row.item.depth)} cm</td><td className={row.doors.some(d => d.hit) || row.slider?.hit ? 'error-message' : undefined}>{openingText(row)}</td></tr>)}
    </tbody></table>
    {!comparison && worst && <p className={worst.shortage ? 'error-message' : undefined}>Korunan geçiş · hedef {fmt(worst.rule.distance)} cm
      {worst.gap !== undefined && ` · en dar ${fmt(worst.gap)} cm (${worst.nearest?.label})`}</p>}
  </section>
}
