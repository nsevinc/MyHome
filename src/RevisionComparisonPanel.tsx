import { useRef, useState } from 'react'
import { ArrowLeft, Crosshair } from 'lucide-react'
import { bounds, footprintCorners, obstructionVolume, roomEdges, wallMountPose, wallPoint } from './geometry'
import { savedMeasurements } from './measurements'
import { fmt } from './model'
import type { Point, Project, RoomSection } from './model'
import type { ReviewTarget } from './mounting-review'
import type { OpenProject, Revision } from './project-archive'
import { revisionProject } from './project-archive'
import { compareRevisions, findingChangeLabel, findingText } from './revision-comparison'
import type { CheckChange, PlanFocus } from './revision-comparison'
import { sectionProfile } from './room-section'
import { layoutName } from './layout-variants'

type FocusPair = { name: string; before?: PlanFocus; after?: PlanFocus }
type Comparison = { before: Project; after: Project; beforeName: string; afterName: string;
  result: ReturnType<typeof compareRevisions> }
type SectionPreview = { cut: RoomSection; profile: ReturnType<typeof sectionProfile> }
const currentDraft = ''
const points = (vertices: Point[]) => vertices.map(({ x, z }) => `${x},${z}`).join(' ')

function viewBox({ x, z, width, depth }: ReturnType<typeof bounds>) {
  const pad = Math.max(width, depth, 800) * .05
  return `${x - pad} ${z - pad} ${width + 2 * pad} ${depth + 2 * pad}`
}

function reviewFocus(target?: ReviewTarget): PlanFocus | undefined {
  if (!target || !target.id) return
  if (target.kind === 'survey') return { kind: 'wall', id: target.id }
  if (target.kind === 'section' || target.kind === 'measurement') return { ...target, id: target.id }
  return { kind: 'item', id: target.id }
}

function selectedSection(project: Project, focus?: PlanFocus): SectionPreview | undefined {
  const cut = focus?.kind === 'section' && project.sections?.find(entry => entry.id === focus.id)
  if (!cut) return
  const profile = sectionProfile(project, cut)
  if (profile.rooms.length) return { cut, profile }
}

function Preview({ project, name, focus, planBox, section, sectionBox }: {
  project: Project; name: string; focus?: PlanFocus; planBox: string; section?: SectionPreview; sectionBox?: string;
}) {
  const edges = roomEdges(project.walls)
  const selectedItem = focus?.kind === 'item' ? focus.id : focus?.itemId
  const { cut, profile } = section ?? {}
  const measurement = focus?.kind === 'measurement' && savedMeasurements(project).find(row => row.id === focus.id)
  const layout = layoutName(project)
  return <figure className="revision-preview">
    <figcaption><strong>{name}</strong>{layout && <small>{layout}</small>}</figcaption>
    {cut && profile ? <>
      <svg viewBox={sectionBox} role="img" aria-label={`${name} · ${cut.name}`}>
        {profile.rooms.map(({ from, to }) => <rect key={from} x={from} y={-profile.height}
          width={to - from} height={profile.height} className="revision-shell" />)}
        {profile.blocks.map((block, index) => <rect key={index} x={block.from} y={-block.top}
          width={block.to - block.from} height={block.top - block.bottom} className="revision-block"><title>{block.name}</title></rect>)}
        {profile.furniture.map(({ item, from, to, top, bottom, color }, index) => <rect key={index}
          x={from} y={-top} width={to - from} height={top - bottom} fill={color}
          className={item.id === selectedItem ? 'revision-highlight' : 'revision-item'}><title>{item.name}</title></rect>)}
      </svg>
      <small>{cut.name} · {cut.axis === 'x' ? 'Z' : 'X'} {fmt(cut.offset)} cm</small>
      {profile.wardrobes.filter(row => !selectedItem || row.item.id === selectedItem).map((row, index) =>
        <small key={index}>{row.label}</small>)}
    </> : <svg viewBox={planBox} role="img" aria-label={`${name} · 2B plan`}>
      <polygon points={points(edges.map(edge => edge.a))} className="revision-shell" />
      {edges.flatMap(edge => edge.wall.openings.map(opening => {
        const a = wallPoint(edge, opening.offset), b = wallPoint(edge, opening.offset + opening.width)
        return <line key={opening.id} x1={a.x} y1={a.z} x2={b.x} y2={b.z} className="revision-opening"><title>
          {opening.kind === 'window' ? 'Pencere' : 'Kapı'}</title></line>
      }))}
      {edges.flatMap(edge => edge.wall.obstacles.map(obstacle => {
        const block = obstructionVolume(edge, obstacle)
        return <rect key={obstacle.id} x={block.x} y={block.z} width={block.width} height={block.depth}
          className="revision-block"><title>{obstacle.name}</title></rect>
      }))}
      {project.items.map(source => {
        const item = wallMountPose(source, edges)
        if (item.id === selectedItem) return null
        return <polygon key={item.id} points={points(footprintCorners(item))} fill={item.color}
          className="revision-item"><title>{item.name}</title></polygon>
      })}
      {project.items.filter(item => item.id === selectedItem).map(source => <polygon key={source.id}
        points={points(footprintCorners(wallMountPose(source, edges)))} fill={source.color}
        className="revision-highlight"><title>{source.name}</title></polygon>)}
      {focus?.kind === 'wall' && edges.filter(edge => edge.wall.id === focus.id).map(edge =>
        <line key={edge.wall.id} x1={edge.a.x} y1={edge.a.z} x2={edge.b.x} y2={edge.b.z} className="revision-highlight" />)}
      {measurement && measurement.kind === 'passage' && <circle cx={measurement.origin.x} cy={measurement.origin.z}
        r="42" className="revision-highlight"><title>{measurement.name}</title></circle>}
    </svg>}
  </figure>
}

function changeSubject(row: CheckChange) {
  const report = (row.after ?? row.before)!
  return `${report.subject} · ${report.check}`
}

export function RevisionComparisonPanel({ current, revisions, close }: {
  current: OpenProject; revisions: Revision[]; close: () => void;
}) {
  const [beforeId, setBeforeId] = useState(revisions[1]?.id ?? revisions[0].id)
  const [afterId, setAfterId] = useState(revisions.length > 1 ? revisions[0].id : currentDraft)
  const [comparison, setComparison] = useState<Comparison>()
  const [focus, setFocus] = useState<FocusPair>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'changes' | 'pending'>('changes')
  const preview = useRef<HTMLElement>(null)

  async function compare() {
    const base = revisions.find(row => row.id === beforeId)
    const target = revisions.find(row => row.id === afterId)
    if (!base || base.id === target?.id) return
    setPending(true)
    setComparison(undefined)
    setFocus(undefined)
    setError('')
    try {
      const [before, after] = await Promise.all([revisionProject(base), target ? revisionProject(target) : current.project])
      setComparison({ before, after, beforeName: base.name, afterName: target?.name ?? 'Mevcut çalışma',
        result: compareRevisions(before, after) })
    } catch { setError('Karşılaştırılacak sürümler açılamadı.') }
    finally { setPending(false) }
  }
  function show(pair: FocusPair) {
    setFocus(pair)
    preview.current?.focus()
    preview.current?.scrollIntoView({ block: 'nearest' })
  }
  const checks = comparison?.result.checks ?? []
  const plan = comparison?.result.plan ?? []
  const changed = checks.filter(row => row.changed)
  const awaiting = checks.filter(row => row.kind === 'pending')
  const visible = filter === 'pending' ? awaiting : changed
  const plans = comparison && [comparison.before, comparison.after]
  const planBox = plans && viewBox(bounds(plans.flatMap(project => roomEdges(project.walls).map(edge => edge.a))))
  const beforeSection = comparison && selectedSection(comparison.before, focus?.before)
  const afterSection = comparison && selectedSection(comparison.after, focus?.after)
  const areas = [beforeSection, afterSection].flatMap(section => section ? [section.profile.area] : [])
  const sectionBox = areas.length ? viewBox(bounds(areas.flatMap(area =>
    [{ x: area.x, z: area.z }, { x: area.x + area.width, z: area.z + area.depth }]))) : undefined
  const options = revisions.map(row => <option key={row.id} value={row.id}>{row.name} · {new Date(row.updated).toLocaleString('tr-TR')}</option>)

  return <div className="render-stack revision-comparison">
    <div className="draw-actions"><button type="button" onClick={close}><ArrowLeft size={16} /> Sürümlere dön</button></div>
    <form className="revision-select" onSubmit={event => { event.preventDefault(); void compare() }}>
      <label className="measure">Önceki sürüm<select disabled={pending} value={beforeId} onChange={event => {
        setBeforeId(event.currentTarget.value); setComparison(undefined)
      }}>{options}</select></label>
      <label className="measure">Sonraki sürüm<select disabled={pending} value={afterId} onChange={event => {
        setAfterId(event.currentTarget.value); setComparison(undefined)
      }}><option value={currentDraft}>Mevcut çalışma</option>{options}</select></label>
      <button className="primary" type="submit" disabled={pending || beforeId === afterId}>{pending ? 'Hesaplanıyor…' : 'Karşılaştır'}</button>
    </form>
    {beforeId === afterId && <p className="meta">İki farklı sürüm seç.</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {comparison && planBox && <>
      <section className="render-stack" tabIndex={-1} ref={preview} aria-label="Sürüm planları">
        {focus && <div className="revision-focus"><strong>{focus.name}</strong>
          <button type="button" onClick={() => setFocus(undefined)}>Genel plan</button></div>}
        <div className="revision-sides">
          <Preview project={comparison.before} name={comparison.beforeName} focus={focus?.before} planBox={planBox}
            section={beforeSection} sectionBox={sectionBox} />
          <Preview project={comparison.after} name={comparison.afterName} focus={focus?.after} planBox={planBox}
            section={afterSection} sectionBox={sectionBox} />
        </div>
      </section>
      <section className="render-stack" aria-label="Plan değişiklikleri">
        <h3>Plan değişiklikleri ({plan.length})</h3>
        {!plan.length && <p className="meta">Konum veya ölçü değişikliği bulunmadı.</p>}
        {plan.map(row => <article className="revision-entry" key={row.key}>
          <header><strong>{row.name}</strong>{(row.before || row.after) && <button type="button"
            aria-label={`${row.name} · ${row.key.startsWith('section/') ? 'Kesiti göster' : 'Planda göster'}`}
            onClick={() => show(row)}><Crosshair size={15} /> {row.key.startsWith('section/') ? 'Kesiti göster' : 'Planda göster'}</button>}</header>
          <ul>{row.changes.map(field => <li key={field.label}>
            {field.label} · {field.before} → {field.after}{field.delta && <strong> ({field.delta})</strong>}
          </li>)}</ul>
        </article>)}
      </section>
      <section className="render-stack" aria-label="Montaj bulguları">
        <h3>Montaj bulguları</h3>
        <div className="view-tabs" role="group" aria-label="Montaj bulgusu filtresi">
          <button type="button" aria-pressed={filter === 'changes'} onClick={() => setFilter('changes')}>Değişenler ({changed.length})</button>
          <button type="button" aria-pressed={filter === 'pending'} onClick={() => setFilter('pending')}>Bilgi bekliyor ({awaiting.length})</button>
        </div>
        {!visible.length && <p className="meta">{filter === 'pending' ? 'Bilgi bekleyen kontrol bulunmadı.' : 'Montaj bulgularında değişiklik bulunmadı.'}</p>}
        {visible.map(row => {
          const before = reviewFocus(row.before?.target), after = reviewFocus(row.after?.target)
          const hasSection = before?.kind === 'section' || after?.kind === 'section'
          const action = hasSection ? 'Kesiti göster' : 'Planda göster'
          const name = changeSubject(row)
          return <article className="revision-entry" key={row.key}>
            <header><div><small className={row.kind === 'new-warning' ? 'error-message' : 'meta'}>{findingChangeLabel[row.kind]}</small>
              <strong>{name}</strong></div>
              {(before || after) && <button type="button" aria-label={`${name} · ${action}`} onClick={() => show({ name, before, after })}>
                <Crosshair size={15} /> {action}</button>}
            </header>
            <dl className="revision-sides">
              <div><dt>Önce</dt><dd>{findingText(row.before)}</dd></div>
              <div><dt>Sonra</dt><dd>{findingText(row.after)}</dd></div>
            </dl>
            {row.delta && <p><strong>{row.delta}</strong></p>}
          </article>
        })}
      </section>
    </>}
  </div>
}
