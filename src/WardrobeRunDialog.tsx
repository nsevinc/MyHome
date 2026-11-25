import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Plus, Trash2, X } from 'lucide-react'
import { Measure, TextField } from './fields'
import { defaultWardrobe, defaultWardrobeGap, fmt, furnitureAngle, maxWardrobeGap, uid, wardrobeDoorCounts, wardrobeZones } from './model'
import type { Furniture, Project, WardrobeFillArea } from './model'
import { passageText } from './measurements'
import { doorCollisionText, isCabinetDoorBox, resizeWardrobeDoors } from './wardrobe'
import { AssemblyReadings } from './WardrobeAssembly'
import { WardrobeStackFields } from './WardrobeSettings'
import { buildWardrobeRun, changeWardrobeRunType, inspectWardrobeRun, maxWardrobeModules, moveWardrobeModule, newWardrobeModule,
  wardrobeRunMembers, wardrobeRunOffset, wardrobeRunType, wardrobeRunTypes } from './wardrobe-run'
import type { DoorSuggestion, WardrobeRunType } from './wardrobe-run'
import { furnitureParts } from './furniture'
import { motionValue } from './furniture-motion'
import { designScene } from './design-variants'
import { loadWardrobeTemplate, makeWardrobeTemplate, saveWardrobeTemplate, wardrobeTemplates } from './wardrobe-templates'
import type { WardrobeTemplate } from './wardrobe-templates'
import { validateMediaSize } from './geometry'
import { DoorAdvice, WardrobeFillControls } from './WardrobeFillControls'
import { checkWardrobeFill } from './wardrobe-fill'
import { rebalanceWardrobe } from './wardrobe-rebalance'
import type { BalanceSummary, WidthEdit } from './wardrobe-rebalance'
import { WardrobeBalancePreview } from './WardrobeBalancePreview'
import { WardrobeSolutions } from './WardrobeSolutions'

export default function WardrobeRunDialog({ project, wallId, runId, widthEdit, apply, close, templatesEnabled }: {
  project: Project; wallId: string; runId?: string; widthEdit?: WidthEdit
  apply: (next: Project, items: Furniture[], previewed?: boolean) => boolean; close: () => void
  templatesEnabled: boolean
}) {
  const element = useRef<HTMLDialogElement>(null)
  const moduleFields = useRef(new Map<string, HTMLFieldSetElement>())
  const [id] = useState(() => runId ?? uid())
  const [initial] = useState(() => {
    const modules = runId ? wardrobeRunMembers(project, runId) : [newWardrobeModule(0), newWardrobeModule(1)]
    const run = modules[0]?.wardrobeRun
    const result = widthEdit && run?.fill && rebalanceWardrobe(project, modules, run.fill, run.gap ?? defaultWardrobeGap, widthEdit)
    return { modules: result && 'modules' in result ? result.modules : modules,
      balance: result && 'summary' in result ? result.summary : undefined, error: result && 'error' in result ? result.error : '' }
  })
  const [modules, setModules] = useState(initial.modules)
  const [balance, setBalance] = useState<BalanceSummary | undefined>(initial.balance)
  const [widthError, setWidthError] = useState(initial.error)
  const [fill, setFill] = useState<WardrobeFillArea | undefined>(modules[0]?.wardrobeRun?.fill)
  const [fillPanel, setFillPanel] = useState<'manual' | 'open' | 'collapsed'>(fill ? 'open' : 'manual')
  const fillOpen = fillPanel === 'open'
  const choosingFill = fillPanel !== 'manual' && !fill
  const [fillPending, setFillPending] = useState(false)
  const [wall, setWall] = useState(() => project.walls.find(wall => wall.id === wallId)?.id ?? project.walls[0].id)
  const [offset, setOffset] = useState(() => fill?.start ?? (runId && modules[0] ? wardrobeRunOffset(project, modules[0]) : 100))
  const [gap, setGap] = useState(modules[0]?.wardrobeRun?.gap ?? defaultWardrobeGap)
  const [margin, setMargin] = useState(fill?.margin ?? 50)
  const [passage, setPassage] = useState(fill?.passage ?? project.passage?.minimum ?? 800)
  const [error, setError] = useState('')
  const [templates, setTemplates] = useState<WardrobeTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateStatus, setTemplateStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [comparing, setComparing] = useState(false)
  const run = useMemo(() => buildWardrobeRun(project, id, wall, offset, modules, gap, fill), [project, id, wall, offset, modules, gap, fill])
  const checks = useMemo(() => run && !run.overhang ? inspectWardrobeRun(run, margin, passage) : [], [run, margin, passage])
  const fixed = useMemo(() => modules.filter(item => item.wardrobeRun?.anchor?.fixed), [modules])
  const fillCheck = useMemo(() => fill && run ? checkWardrobeFill(run, gap, fill, checks) : undefined, [fill, run, gap, checks])
  const invalidFill = Boolean(fillCheck && (fillCheck.issues.length || fillCheck.route.status === 'blocked' || fillCheck.front.blocked.length))
  const styled = useMemo(() => {
    const items = run ? designScene(run.project).items : []
    return new Map(items.map(item => [item.id, item]))
  }, [run])

  useEffect(() => {
    const modal = element.current
    modal?.showModal()
    return () => modal?.close()
  }, [])
  useEffect(() => {
    if (!templatesEnabled) return
    let active = true
    wardrobeTemplates().then(rows => { if (active) setTemplates(rows) }).catch(() => {
      if (active) setTemplateStatus('Kayıtlı gardırop şablonları açılamadı.')
    })
    return () => { active = false }
  }, [templatesEnabled])

  function patch(id: string, changes: Partial<Furniture>) {
    setModules(items => items.map(item => item.id === id ? { ...item, ...changes } : item))
    setError('')
  }

  function acceptDoor(suggestion: DoorSuggestion) {
    patch(suggestion.itemId, { wardrobe: suggestion.wardrobe })
  }

  function resizeModule(itemId: string, width: number) {
    if (fill?.profile !== 'ready') { patch(itemId, { width }); return }
    const result = rebalanceWardrobe(project, modules, fill, gap, { itemId, width })
    if ('error' in result) { setWidthError(result.error); return false }
    setWidthError('')
    setError('')
    setBalance(result.summary)
    setModules(result.modules)
  }

  async function saveTemplate() {
    if (!run || !templateName.trim() || saving) return
    setSaving(true)
    setTemplateStatus('')
    try {
      const modules = run.parts.map(({ item }) => styled.get(item.id) ?? item)
      const media = validateMediaSize({ ...run.project, items: modules, layouts: undefined, designs: undefined })
      if (media) throw new Error(media)
      const template = makeWardrobeTemplate(templateName, modules, gap)
      await saveWardrobeTemplate(template)
      setTemplates(rows => [template, ...rows])
      setTemplateId(template.id)
      setTemplateStatus(`“${template.name}” şablonu kaydedildi.`)
    } catch (failure) { setTemplateStatus(failure instanceof Error ? failure.message : 'Şablon kaydedilemedi.') }
    finally { setSaving(false) }
  }

  const target = run?.edge.wall
  const span = Math.max(target?.length ?? 0, offset + (run?.length ?? 0))
  const ceiling = Math.max(project.height, ...modules.map(item => item.height))
  return <dialog ref={element} className="draw-dialog wardrobe-run-dialog" aria-labelledby="wardrobe-run-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header"><div><h2 id="wardrobe-run-title">Modüler gardırop</h2>
      <p>Duvar boyunca dizilecek modüllerin ölçülerini ve açılma alanını kontrol edin.</p></div>
      <button className="icon" aria-label="Gardırop düzenleyicisini kapat" onClick={close}><X size={20} /></button>
    </header>
    <div className="wardrobe-run-body">
      {comparing && fill && run ? <WardrobeSolutions run={run} summary={balance} apply={(next, items) => apply(next, items, true)} back={() => setComparing(false)} /> : <>
      {fill && run && <button type="button" disabled={!!widthError || fillPending || !!run.overhang}
        onClick={() => setComparing(true)}>Çözüm seçeneklerini karşılaştır</button>}
      {balance && fill && run && <WardrobeBalancePreview run={run} checks={checks} summary={balance} />}
      <div className="wardrobe-run-controls">
        <label className="measure">Yerleşim duvarı <select value={wall} disabled={Boolean(fill)} onChange={event => { setWall(event.target.value); setError('') }}>
          {project.walls.map((wall, index) => <option key={wall.id} value={wall.id}>Duvar {index + 1} · {fmt(wall.length)} cm</option>)}
        </select></label>
        {fillPanel === 'manual' && <Measure label="Köşeden başlangıç" value={offset} change={setOffset} />}
        {fillPanel === 'manual' && <Measure label="Modüller arası boşluk" value={gap} min={0} max={maxWardrobeGap / 10} change={setGap} />}
        {fillPanel === 'manual' && <Measure label="Üst boşluk hedefi" value={margin} max={50} change={setMargin} />}
        {fillPanel === 'manual' && <Measure label="Geçiş hedefi" value={passage} min={1} change={setPassage} />}
      </div>
      <WardrobeFillControls key={wall} project={project} wallId={wall} id={id} existing={fill} fixed={fixed}
        acceptDoor={acceptDoor}
        open={fillOpen} onOpenChange={open => setFillPanel(previous => open ? 'open' : previous === 'manual' ? 'manual' : 'collapsed')}
        run={fill ? run : undefined} check={fillCheck} blocked={Boolean(run?.locked)} pending={setFillPending} selectModule={id => {
          const fields = moduleFields.current.get(id)
          fields?.scrollIntoView({ block: 'nearest' })
          fields?.querySelector('select')?.focus({ preventScroll: true })
        }} choose={(items, area) => {
          setBalance(undefined)
          setWidthError('')
          setModules(items)
          setFill(area)
          setOffset(area.start)
          setGap(0)
          setMargin(area.margin)
          setPassage(area.passage)
          setError('')
        }} />
      {choosingFill && !fillOpen && <button type="button" onClick={() => setFillPanel('manual')}>Elle yerleşime dön</button>}
      {templatesEnabled && !choosingFill && <details className="material-library">
        <summary>Gardırop şablonları</summary>
        <div className="material-library-body">
          {!runId && <div className="wardrobe-run-controls">
            <label className="measure"><span>Kayıtlı gardırop şablonu</span><select value={templateId} onChange={event => setTemplateId(event.currentTarget.value)}>
              <option value="">Şablon seç</option>
              {templates.map(entry => <option key={entry.id} value={entry.id}>{entry.name} · {entry.modules.length} modül</option>)}
            </select></label>
            <button className="render-align" disabled={!templateId || saving} type="button" onClick={() => {
              const template = templates.find(row => row.id === templateId)
              if (!template) return
              setBalance(undefined)
              setWidthError('')
              setFill(undefined)
              setFillPanel('manual')
              setModules(loadWardrobeTemplate(template))
              setGap(template.gap)
              setTemplateStatus(`“${template.name}” taslağa yüklendi.`)
              setError('')
            }}>Şablonu taslağa yükle</button>
          </div>}
          <div className="wardrobe-run-controls">
            <label className="measure"><span>Şablon adı</span><input value={templateName} maxLength={100}
              onChange={event => setTemplateName(event.currentTarget.value)} /></label>
            <button className="render-align" type="button" disabled={!templateName.trim() || !run || saving}
              onClick={() => void saveTemplate()}>Diziyi şablon olarak kaydet</button>
          </div>
          {templateStatus && <p className="meta" role="status">{templateStatus}</p>}
        </div>
      </details>}
      {!choosingFill && run && target && !!span && <svg role="img" aria-label="Modüler gardırop duvar görünüşü" className="wardrobe-run-elevation"
        viewBox={`-100 -120 ${span + 200} ${ceiling + 240}`}>
        <rect x="0" y={ceiling - project.height} width={target.length} height={project.height} fill="#f0e9df"
          stroke="#a89a86" strokeWidth="13" />
        {target.openings.map(opening => <rect key={opening.id} x={opening.offset} y={ceiling - opening.bottom - opening.height}
          width={opening.width} height={opening.height} fill="#d1e3e9" />)}
        {run.parts.map(({ item, start }, index) => <WardrobeFront key={item.id} item={styled.get(item.id) ?? item}
          start={start} floor={ceiling} number={index + 1} direction={run.edge}
          warning={Boolean(checks[index]?.fit.warning.length || checks[index]?.conflicts.length)} />)}
        {target.obstacles.map(obstacle => <rect key={obstacle.id} x={obstacle.offset} y={ceiling - obstacle.top}
          width={obstacle.width} height={obstacle.top - obstacle.bottom} fill="#9a6d38" fillOpacity=".47" stroke="#88643c" strokeWidth="11" />)}
      </svg>}
      {!choosingFill && <div className="wardrobe-run-modules">
        {modules.map((item, index) => {
          const reading = checks[index]
          const wardrobe = item.wardrobe ?? defaultWardrobe
          const collisions = reading?.doors.flatMap(door => door.hit ? [doorCollisionText(door.index, door.hit, door.label)] : []) ?? []
          const type = wardrobeRunType(item)
          return <fieldset key={item.id} aria-label={`${index + 1}. modül`} ref={fields => {
            if (fields) moduleFields.current.set(item.id, fields)
            else moduleFields.current.delete(item.id)
          }}>
            <legend>{index + 1}. modül</legend>
            {fill && item.wardrobeRun?.anchor && <label className="measure check">
              <input type="checkbox" checked={Boolean(item.wardrobeRun.anchor.fixed)} onChange={event => patch(item.id, {
                wardrobeRun: { ...item.wardrobeRun!, anchor: { ...item.wardrobeRun!.anchor!, fixed: event.currentTarget.checked } },
              })} /> Yeniden doldururken modülü sabitle
            </label>}
            <label className="measure"><span>Modül tipi</span><select value={type} onChange={event =>
              patch(item.id, changeWardrobeRunType(item, event.currentTarget.value as WardrobeRunType))}>
              {Object.entries(wardrobeRunTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></label>
            <TextField label="Modül adı" value={item.name} change={name => patch(item.id, { name })} />
            <div className="wardrobe-run-sizes">
              <Measure label="En" value={item.width} min={20} disabled={fillPending || !!run?.locked || Boolean(fill?.profile === 'ready' && item.wardrobeRun?.anchor?.fixed)}
                change={width => resizeModule(item.id, width)} />
              <Measure label="Derinlik" value={item.depth} min={15} change={depth => patch(item.id, { depth })} />
              <Measure label="Boy" value={item.height} min={30} change={height => patch(item.id, { height })} />
            </div>
            <div className="wardrobe-run-sizes">
              <label className="measure">{wardrobe.stack ? 'Her katta kapak sayısı' : 'Kapak sayısı'} <select value={wardrobe.doors}
                disabled={type === 'sliding'} onChange={event => patch(item.id, { wardrobe: resizeWardrobeDoors(wardrobe, Number(event.currentTarget.value)) })}>
                {wardrobeDoorCounts.map(count => <option key={count}>{count}</option>)}</select></label>
              <label className="measure">Kapak yüzeyi <select value={wardrobe.front} onChange={event => patch(item.id, {
                wardrobe: { ...wardrobe, front: event.target.value === 'glass' ? 'glass' : 'solid' },
              })}><option value="solid">Düz</option><option value="glass">Cam</option></select></label>
            </div>
            <WardrobeStackFields item={item} wardrobe={wardrobe} update={wardrobe => patch(item.id, { wardrobe })} />
            {reading && <div className="wardrobe-run-checks">
              <strong>{reading.fit.obstruction ?? 'Tavan'} · {fmt(Math.abs(reading.fit.clearance))} cm {reading.fit.clearance < 0 ? 'çakışma' : 'üst boşluk'}</strong>
              <AssemblyReadings result={reading.assembly} />
              <Measure label="Dik kurulum için ek üst pay" value={item.assembly?.allowance ?? 0} max={50}
                change={allowance => patch(item.id, { assembly: { ...item.assembly, allowance } })} />
              {reading.fit.warning.filter(warning => !warning.includes(' cm çakışma.')).map(warning => <p key={warning}>{warning}</p>)}
              {reading.conflicts.map(opening => <p key={opening.id}>{opening.kind === 'door' ? 'Kapı' : 'Pencere'} açıklığıyla örtüşüyor.</p>)}
              {collisions.length ? collisions.map(text => <p key={text}>{text}</p>)
                : reading.doors.length > 0 && <p>Menteşeli kapakların açılma yolunda çakışma yok.</p>}
              {(!fill || !fillOpen) && reading.doorSuggestion && <DoorAdvice suggestion={reading.doorSuggestion}
                accept={fillPending ? undefined : acceptDoor} />}
              {reading.slider && <p className={reading.slider.hit ? 'error-message' : undefined}>{reading.slider.hit
                ? `Sürgü · ${reading.slider.hit.label} ile ilk temas ${fmt(Math.round(reading.slider.hit.distance))} cm`
                : `Sürgü · Tam kaydırma ${fmt(Math.round(reading.slider.limit))} cm`}</p>}
              {reading.drawers.map(({ part, contact }) => <p key={part.id} className={contact ? 'error-message' : undefined}>
                {part.name} · {contact ? `${contact.name} ile ilk temas ${motionValue(part, contact.amount)} / ${motionValue(part, part.max)}`
                  : `Tam açılım ${motionValue(part, part.max)} · çakışma yok`}
              </p>)}
              {reading.passageReadings.map(row => <p key={row.mode}>{row.label} · {passageText(row)}{row.width < passage ? ' · Geçiş hedefinin altında' : ''}</p>)}
              {reading.suggested !== undefined && <button onClick={() => patch(item.id, { height: reading.suggested })}>
                {fmt(reading.suggested)} cm boy önerisini uygula</button>}
            </div>}
            <div className="draw-actions">
              <button type="button" aria-label={`${index + 1}. modülü sola taşı`} disabled={Boolean(fill) || !index || !!run?.locked}
                onClick={() => setModules(items => moveWardrobeModule(items, index, -1))}><ArrowLeft size={15} /> Sola</button>
              <button type="button" aria-label={`${index + 1}. modülü sağa taşı`} disabled={Boolean(fill) || index === modules.length - 1 || !!run?.locked}
                onClick={() => setModules(items => moveWardrobeModule(items, index, 1))}>Sağa <ArrowRight size={15} /></button>
              <button type="button" disabled={modules.length === 1 || !!run?.locked || Boolean(item.wardrobeRun?.anchor?.fixed)}
                onClick={() => { setBalance(undefined); setWidthError(''); setModules(items => items.filter(module => module.id !== item.id)) }}><Trash2 size={14} /> Modülü çıkar</button>
            </div>
          </fieldset>
        })}
        {!fill && <button disabled={modules.length >= maxWardrobeModules || !!run?.locked}
          onClick={() => setModules(items => [...items, newWardrobeModule(items.length)])}><Plus size={16} /> Modül ekle</button>}
      </div>}
      </>}
    </div>
    {!comparing && <footer className="dialog-footer">
      <span role="status">{widthError || error || (run?.locked ? 'Diziyi düzenlemek için seçili modüllerin kilitlerini açın.'
        : choosingFill ? 'Yerleşim önerilerini hazırlayıp uygulamak istediğiniz taslağı açın.'
        : invalidFill ? 'Yerleştirmeden önce taslaktaki çakışma ve geçiş uyarılarını giderin.'
          : run?.overhang ? `Toplam ${fmt(run.length)} cm · Duvarı ${fmt(run.overhang)} cm aşıyor.`
          : run && fill ? `${fmt(modules.reduce((sum, item) => sum + item.width, 0))} cm dolap · ${fmt(fill.end - fill.start)} cm alan`
          : run ? `Toplam ${fmt(run.length)} cm · Bitişte kalan ${fmt(run.remaining)} cm` : '')}</span>
      <button onClick={close}>Vazgeç</button>
      {widthError && <button onClick={() => setWidthError('')}>Önceki ölçüyü koru</button>}
      <button className="primary" disabled={!!widthError || choosingFill || !run || run.overhang > 0 || run.locked || invalidFill || fillPending} onClick={() => {
        if (run && !apply(run.project, run.parts.map(part => part.item))) setError('Dizi kaydedilemedi. Oda veya eşya sınırlarını kontrol edin.')
      }}>{choosingFill || fill ? 'Otomatik yerleşimi uygula' : runId ? 'Diziyi güncelle' : 'Gardırop dizisini yerleştir'}</button>
    </footer>}
  </dialog>
}

function WardrobeFront({ item, start, floor, number, direction, warning }: {
  item: Furniture; start: number; floor: number; number: number; direction: { dx: number; dz: number }; warning: boolean;
}) {
  const { lowerTop, upperBottom, top } = wardrobeZones(item)
  const openNiche = item.wardrobe?.stack?.type === 'niche'
  const spans = openNiche ? [[0, lowerTop], [upperBottom, top]] : [[0, top]]
  const wardrobe = item.wardrobe
  const facing = furnitureAngle(item) * Math.PI / 180
  const sign = Math.sign(Math.cos(facing) * direction.dx + Math.sin(facing) * direction.dz)
  const center = start + item.width / 2
  const parts = furnitureParts(wardrobe?.pose === 'open' ? { ...item, wardrobe: { ...wardrobe, pose: 'closed' } } : item)
  const body = parts.find(part => part.slot === 'body')
  const visible = parts.filter(part => isCabinetDoorBox(part) || part.slot === 'drawer-fronts' || part.slot === 'drawer-handles'
    || (wardrobe?.pose === 'none' && part.slot === 'inside' && !part.motionPart))
  return <g aria-label={`${number}. modül · ${wardrobeRunTypes[wardrobeRunType(item)]}`}>
    <title>{item.name} · {fmt(item.width)} × {fmt(item.depth)} × {fmt(item.height)} cm</title>
    {spans.map(([bottom, top]) => <rect key={bottom} x={start} y={floor - top} width={item.width} height={top - bottom}
      fill={body?.appearance?.color ?? item.color} stroke="#594b39" strokeWidth="4" />)}
    {visible.map((part, index) => <rect key={index} x={center + (sign * part.position[0] - part.size[0] / 2) * 1000}
      y={floor - (part.position[1] + part.size[1] / 2) * 1000} width={part.size[0] * 1000} height={part.size[1] * 1000}
      fill={part.glass ? '#a8c9c7' : part.appearance?.color ?? part.color} stroke="#625043" strokeWidth={part.glass ? 3 : 2} />)}
    {warning && spans.map(([bottom, top]) => <rect key={bottom} x={start} y={floor - top} width={item.width} height={top - bottom}
      fill="none" stroke="#a83823" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
    <text x={center} y={floor + 83} textAnchor="middle" fontSize={Math.min(70, item.width / 3)} fill="#34291f">{number}</text>
  </g>
}
