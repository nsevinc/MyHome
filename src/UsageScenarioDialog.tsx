import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Box, MapPin, Plus, RotateCw, Trash2, X } from 'lucide-react'
import { Measure, NumberField } from './fields'
import { pointInRoom, roomEdges } from './geometry'
import { LayoutPairFields } from './LayoutDialog'
import { layoutName, layoutScene } from './layout-variants'
import { fmt, maxUsageRoutePoints, maxUsageScenarios, maxUsageStates } from './model'
import type { Point, Project, UsageScenario } from './model'
import { PlanCanvas } from './PlanCanvas'
import { inspectUsageScenario, newUsageScenario, usageAmount, usageLayouts, usageParts, usageRouteStatus } from './usage-scenarios'
import type { UsageInspection } from './usage-scenarios'

const ScenePreview = lazy(() => import('./Scene').then(module => ({ default: module.ScenePreview })))
const idle = () => {}

function RouteResult({ title, result, minimum, viewing, show }: {
  title: string; result: UsageInspection; minimum: number; viewing: boolean; show: (mode: 'plan' | 'scene') => void;
}) {
  const reading = result.reading
  const warning = reading && reading.width < minimum - .001
  return <section className={`usage-result${viewing ? ' current' : ''}`} aria-label={title}>
    <h3>{title}</h3>
    {reading && <strong className="usage-width">{fmt(Math.round(reading.width))} cm</strong>}
    <p className={warning ? 'error-message' : 'meta'}>{usageRouteStatus(reading, minimum)}</p>
    {reading && <p className="meta">Belirleyen sınırlar · {reading.limits.join(' / ')}</p>}
    {result.warnings.length > 0 && <ul className="usage-warnings">{result.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    <div className="usage-buttons">
      <button type="button" onClick={() => show('plan')}><MapPin size={15} /> Planda göster</button>
      <button type="button" onClick={() => show('scene')} disabled={!reading}><Box size={15} /> 3B’de incele</button>
    </div>
  </section>
}

export default function UsageScenarioDialog({ project, save, remove, close }: {
  project: Project; save: (scenario: UsageScenario) => boolean; remove: (id: string) => boolean; close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const list = project.usageScenarios ?? []
  const [scenario, setScenario] = useState(() => list[0] ?? newUsageScenario(project))
  const [current, setCurrent] = useState(0)
  const [mode, setMode] = useState<'plan' | 'scene'>('plan')
  const [bearing, setBearing] = useState(0)
  const [picking, setPicking] = useState(false)
  const [coordinates, setCoordinates] = useState<Point>({ x: 0, z: 0 })
  const [itemId, setItemId] = useState('')
  const [partId, setPartId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const pair = usageLayouts(project, scenario)
  const layoutA = pair?.[0], layoutB = pair?.[1]
  const ids = layoutA && layoutB ? [layoutA, layoutB] : [undefined]
  const { states, points, headroom } = scenario
  const results = useMemo(() => {
    const setup = { states, points, headroom }
    return [inspectUsageScenario(project, setup, layoutA), ...(layoutB ? [inspectUsageScenario(project, setup, layoutB)] : [])]
  }, [project, states, points, headroom, layoutA, layoutB])
  const viewed = results[current] ?? results[0]
  const edges = useMemo(() => roomEdges(project.walls), [project.walls])
  const itemOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; parts: ReturnType<typeof usageParts> }>()
    for (const layoutId of [layoutA, layoutB]) {
      if (!layoutId && layoutA) continue
      for (const item of layoutScene(project, layoutId).items) {
        const parts = usageParts(item)
        if (!parts.length) continue
        const prior = byId.get(item.id)
        if (prior) {
          for (const part of parts) {
            const index = prior.parts.findIndex(value => value.id === part.id)
            if (index < 0) prior.parts.push(part)
            else if (part.maximum > prior.parts[index].maximum) prior.parts[index] = part
          }
        } else byId.set(item.id, { id: item.id, name: item.name, parts })
      }
    }
    return [...byId.values()]
  }, [project, layoutA, layoutB])
  const chosenItem = itemOptions.find(item => item.id === itemId)
  const parts = chosenItem?.parts.filter(part => !scenario.states.some(state => state.itemId === itemId && state.partId === part.id)) ?? []
  const chosenPart = parts.find(part => part.id === partId) ?? parts[0]
  const saved = list.some(entry => entry.id === scenario.id)
  const viewedId = ids[current] ?? ids[0]

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  function patch(change: Partial<UsageScenario>) {
    setScenario(previous => ({ ...previous, ...change }))
    setMessage('')
    setError('')
  }
  function load(next: UsageScenario) {
    setScenario(next)
    setCurrent(0)
    setMode('plan')
    setPicking(false)
    setItemId('')
    setPartId('')
    setError('')
    setMessage('')
  }
  function addPoint(point: Point) {
    if (scenario.points.length >= maxUsageRoutePoints) { setError(`En fazla ${maxUsageRoutePoints} rota noktası eklenebilir.`); return }
    if (!pointInRoom(point, edges)) { setError('Oda sınırları içinde bir nokta seç.'); return }
    const last = scenario.points.at(-1)
    if (last && Math.hypot(point.x - last.x, point.z - last.z) < 10) { setError('Son noktadan en az 1 cm uzakta bir nokta seç.'); return }
    patch({ points: [...scenario.points, point] })
  }

  const mark = viewed.reading
  const azimuth = (45 + bearing * 90) * Math.PI / 180
  const previewProject = useMemo(() => {
    if (mode !== 'scene' || !mark) return
    const { x, z } = mark.at
    const height = viewed.project.height / 1000
    return { ...viewed.project, camera: {
      position: [x / 1000 + 2.35 * Math.cos(azimuth), height + .35, z / 1000 + 2.35 * Math.sin(azimuth)],
      target: [x / 1000, Math.min(height * .35, .95), z / 1000], fov: 53,
    } } satisfies Project
  }, [mode, viewed.project, mark, azimuth])

  return <dialog ref={dialog} className="draw-dialog usage-dialog" aria-labelledby="usage-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header"><div><h2 id="usage-title">Kullanım senaryoları</h2>
      <p>Kapak ve çekmeceleri birlikte açarak aynı rotayı iki yerleşimde dene.</p></div>
      <button type="button" className="icon" aria-label="Kullanım senaryolarını kapat" onClick={close}><X size={20} /></button></header>
    <div className="usage-body">
      <aside className="usage-controls" aria-label="Senaryo ayarları">
        <div className="usage-buttons">
          <label className="measure">Kayıtlı senaryo <select value={saved ? scenario.id : ''} onChange={event => {
            load(list.find(entry => entry.id === event.currentTarget.value) ?? newUsageScenario(project))
          }}>
            <option value="">Yeni senaryo</option>
            {list.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select></label>
          <button type="button" disabled={list.length >= maxUsageScenarios} onClick={() => load(newUsageScenario(project))}>
            <Plus size={15} /> Yeni</button>
        </div>
        <label className="measure">Senaryo adı <input maxLength={100} value={scenario.name}
          onChange={event => patch({ name: event.currentTarget.value })} /></label>
        <div className="field-grid">
          <Measure label="Geçiş hedefi" value={scenario.minimum} min={1} change={minimum => patch({ minimum })} />
          <Measure label="Denetim yüksekliği" value={scenario.headroom} min={1} change={headroom => patch({ headroom })} />
        </div>
        <fieldset className="render-fieldset">
          <legend>Kapak ve çekmeceler</legend>
          <label className="measure">Hareketli eşya <select value={itemId} onChange={event => {
            setItemId(event.currentTarget.value); setPartId('')
          }}>
            <option value="">Eşya seç</option>
            {itemOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="measure">Hareket <select value={chosenPart?.id ?? ''} disabled={!parts.length}
            onChange={event => setPartId(event.currentTarget.value)}>
            {!parts.length && <option value="">Hareket seç</option>}
            {parts.map(part => <option key={part.id} value={part.id}>{part.name}</option>)}
          </select></label>
          <button type="button" disabled={!chosenPart || scenario.states.length >= maxUsageStates} onClick={() => {
            if (chosenPart) patch({ states: [...scenario.states, { itemId, partId: chosenPart.id, amount: chosenPart.maximum }] })
          }}><Plus size={15} /> Hareketi ekle</button>
          {scenario.states.map((state, index) => {
            const item = itemOptions.find(item => item.id === state.itemId)
            const part = item?.parts.find(part => part.id === state.partId)
            const title = item?.name ?? 'Kayıtlı eşya'
            const amount = part?.unit === 'cm' ? state.amount / 10 : state.amount
            const max = part?.unit === 'cm' ? part.maximum / 10 : part?.maximum ?? 0
            return <div className="usage-motion-row" key={`${state.itemId}/${state.partId}`}>
              <div><strong>{title} · {part?.name ?? 'Eksik hareket'}</strong>
                {part && <>
                  <NumberField label={`Açılım (${part.unit})`} value={amount} min={0} max={max} step={part.unit === 'cm' ? .1 : 1}
                    onChange={value => patch({ states: scenario.states.map((entry, at) =>
                      at === index ? { ...entry, amount: part.unit === 'cm' ? Math.round(value * 10) : value } : entry) })} />
                  {state.amount > part.maximum && <p className="meta">Bu eşyanın açılım sınırı {usageAmount(part, part.maximum)}.</p>}
                </>}
              </div>
              <button type="button" className="icon" aria-label={`${title} · ${part?.name ?? 'Eksik hareket'} kaldır`}
                onClick={() => patch({ states: scenario.states.filter((_, at) => at !== index) })}><Trash2 size={15} /></button>
            </div>
          })}
        </fieldset>
        <details className="element-card usage-coordinates">
          <summary>Koordinatla rota noktası ekle</summary>
          <div className="field-grid">
            <Measure label="Nokta X" value={coordinates.x} min={-20000} max={20000} change={x => setCoordinates(point => ({ ...point, x }))} />
            <Measure label="Nokta Z" value={coordinates.z} min={-20000} max={20000} change={z => setCoordinates(point => ({ ...point, z }))} />
          </div>
          <button type="button" onClick={() => { addPoint(coordinates); setMode('plan') }}>Noktayı ekle</button>
        </details>
      </aside>
      <section className="usage-work" aria-label="Rota önizleme ve karşılaştırma">
        {pair && <LayoutPairFields project={project} pair={pair} onChange={layouts => { patch({ layouts }); setMode('plan') }} />}
        <div className="usage-view-toolbar">
          <h3>{layoutName(project, viewedId) ?? 'Etkin yerleşim'}</h3>
          <div className="usage-buttons">
            {mode === 'scene' ? <>
              <button type="button" onClick={() => setBearing(previous => (previous + 1) % 4)}><RotateCw size={15} /> Bakış yönünü çevir</button>
              <button type="button" onClick={() => setMode('plan')}>2B rotaya dön</button>
            </> : <>
              <button type="button" aria-pressed={picking} onClick={() => setPicking(previous => !previous)}>
                <MapPin size={15} /> {picking ? 'Nokta seçimini bitir' : 'Planda rota çiz'}</button>
              <button type="button" disabled={!scenario.points.length}
                onClick={() => patch({ points: scenario.points.slice(0, -1) })}>Son noktayı kaldır</button>
            </>}
          </div>
        </div>
        {picking && mode === 'plan' && <p className="meta" role="status">Başlangıç, dönüş ve varış noktalarını planda sırayla seç.</p>}
        <div className="usage-stage" aria-label={mode === 'scene' ? 'En dar noktanın 3B görünümü' : 'Kullanım rotası planı'}>
          {previewProject && mark
            ? <Suspense fallback={<p className="canvas-message">3B görünüm yükleniyor…</p>}>
              <ScenePreview project={previewProject} inspection={{ reading: mark, trials: viewed.trials, warning: mark.width < scenario.minimum - .001 }} />
            </Suspense>
            : <PlanCanvas project={viewed.project} selection={{ kind: 'room' }} zoom={1.12} showSketch={false}
              select={idle} commit={idle} preview={idle} snap={false} showDistances={false} setMeasurements={idle} showSections={false}
              usage={{ points: scenario.points, minimum: scenario.minimum, trials: viewed.trials, reading: mark,
                pick: picking ? addPoint : undefined }} />}
        </div>
        <div className="usage-results" aria-label="Yerleşim karşılaştırması">
          {results.map((result, index) => <RouteResult key={ids[index] ?? 'active'} title={layoutName(project, ids[index]) ?? 'Etkin yerleşim'}
            result={result} minimum={scenario.minimum} viewing={index === current} show={next => {
              setCurrent(index); setMode(next); setPicking(false); setBearing(0)
            }} />)}
        </div>
      </section>
    </div>
    <footer className="dialog-footer usage-footer">
      <div aria-live="polite">{error ? <p className="error-message">{error}</p> : <p className="meta">{message}</p>}</div>
      {saved && <button type="button" onClick={() => { if (remove(scenario.id)) load(newUsageScenario(project)) }}>Senaryoyu sil</button>}
      <button type="button" className="primary" disabled={!scenario.name.trim() || (!saved && list.length >= maxUsageScenarios)}
        onClick={() => {
          const entry = { ...scenario, name: scenario.name.trim(), layouts: pair }
          if (save(entry)) {
            setScenario(entry); setError(''); setMessage('Senaryo projeye kaydedildi.')
          } else setError('Senaryo kaydedilemedi.')
        }}>Senaryoyu kaydet</button>
    </footer>
  </dialog>
}
