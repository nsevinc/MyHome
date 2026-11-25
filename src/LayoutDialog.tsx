import { ChevronRight, Copy, Film, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TextField } from './fields'
import { placement, roomEdges } from './geometry'
import { measureGaps } from './layout'
import { passageText, savedMeasurements } from './measurements'
import { layoutName, layoutReport, layoutScene, resolveLayoutPair } from './layout-variants'
import type { LayoutPair } from './layout-variants'
import { fmt, maxLayouts } from './model'
import type { Project } from './model'

export function LayoutPairFields({ project, pair, onChange, disabled = false }: {
  project: Project; pair: LayoutPair; onChange: (value: LayoutPair) => void; disabled?: boolean;
}) {
  return <div className="layout-grid">
    {(['Sol yerleşim', 'Sağ yerleşim'] as const).map((label, index) => <label className="measure" key={label}>
      <span>{label}</span>
      <select value={pair[index]} disabled={disabled} onChange={event => {
        const id = event.currentTarget.value
        const next: LayoutPair = index === 0 ? [id, pair[1]] : [pair[0], id]
        onChange(next[0] === next[1] ? [pair[1], pair[0]] : next)
      }}>
        {project.layouts?.entries.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>
    </label>)}
  </div>
}

function LayoutMeasurements({ project, id, itemId, openLayout }: {
  project: Project; id: string; itemId?: string; openLayout: (id: string) => void;
}) {
  const scene = useMemo(() => layoutScene(project, id), [project, id])
  const report = useMemo(() => layoutReport(scene), [scene])
  const selected = scene.items.find(item => item.id === itemId)
  const edges = useMemo(() => roomEdges(scene.walls), [scene.walls])
  const gaps = selected && measureGaps(scene, selected, edges)
  const fit = selected && placement(scene, selected, edges)
  const name = layoutName(project, id)
  return <section className="layout-card" aria-label={name}>
    <header><h3>{name}</h3>{id === project.layouts?.active && <span className="meta">Etkin düzen</span>}</header>
    {report.measurements.map(result => <div key={result.measurement.id}>
      <h4>{result.number}. {result.measurement.name}</h4>
      {'modes' in result ? <dl className="layout-stats" aria-label="Geçiş ölçüleri">
        {result.modes.map(reading => <div key={reading.mode}>
          <dt>{reading.label}</dt>
          <dd className={reading.width < result.measurement.minimum ? 'error-message' : undefined}>{passageText(reading)}</dd>
        </div>)}
      </dl> : <p className={result.warning ? 'error-message' : 'meta'}>{result.text}</p>}
    </div>)}
    <div className="layout-warnings">
      {([
        ['Yerleşim uyarıları', report.placementWarnings], ['Kiriş ve kolon uyarıları', report.structuralWarnings],
        ['Kapak açılım uyarıları', report.doorWarnings],
      ] as const).map(([label, warnings]) => <details key={label} className="element-card">
        <summary>{label}<span className={warnings.length ? 'error-message' : undefined}>{warnings.length}</span></summary>
        {warnings.length ? <ul>{warnings.map(({ item, message }, index) => <li key={index}><strong>{item}</strong> · {message}</li>)}</ul>
          : <p className="meta">Çakışma bulunmadı.</p>}
      </details>)}
    </div>
    {report.electrical.length > 0 && <details className="element-card">
      <summary>Elektrik noktaları <span>{report.electrical.length}</span></summary>
      <ul className="layout-electrical">{report.electrical.map(({ point, status, detail }) =>
        <li key={point.id} className={status === 'warning' ? 'error-message' : undefined}>
          <strong>{point.name}</strong> · {detail}{point.example ? ' · Örnek ölçü' : ''}</li>)}</ul>
    </details>}
    {selected && fit && gaps && <div>
      <h4>{selected.name}</h4>
      <dl className="layout-stats" aria-label="Eşya boşlukları">
        <div><dt>{fit.obstruction ?? 'Tavan'} boşluğu</dt><dd className={fit.clearance < 0 ? 'error-message' : undefined}>
          {fmt(fit.clearance)} cm</dd></div>
        {gaps.map(gap => <div key={gap.label}><dt>{gap.label} · {gap.name}</dt><dd className={gap.overlap ? 'error-message' : undefined}>
          {gap.overlap ? 'Çakışıyor' : `${fmt(Math.round(gap.distance))} cm`}</dd></div>)}
      </dl>
    </div>}
    {itemId && !selected && <p className="meta">Eşya diğer yerleşimde bulunuyor.</p>}
    <button type="button" onClick={() => openLayout(id)}><ChevronRight size={16} />{name} düzenini aç</button>
  </section>
}

export function LayoutDialog({ project, itemId, close, duplicate, rename, openLayout, render, error }: {
  project: Project; itemId?: string; close: () => void; duplicate: () => void; rename: (id: string, name: string) => void;
  openLayout: (id: string) => void; render: (pair: LayoutPair) => void; error: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [pickedPair, setPair] = useState<LayoutPair>()
  const [pickedItem, setItem] = useState<string>()
  const pair = resolveLayoutPair(project, pickedPair)
  const active = project.layouts?.entries.find(entry => entry.id === project.layouts?.active)
  const measurementCount = savedMeasurements(project).length
  const choices = pair ? [...new Map(pair.flatMap(id => layoutScene(project, id).items.map(item => [item.id, item] as const))).values()] : []
  const selected = choices.find(item => item.id === (pickedItem ?? itemId))?.id
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={dialog} className="render-dialog layout-dialog" aria-labelledby="layout-dialog-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header">
      <div><h2 id="layout-dialog-title">Yerleşimler</h2>
        {active && <p>Etkin düzen · {active.name}</p>}</div>
      <button className="icon" type="button" aria-label="Yerleşimleri kapat" onClick={close}><X size={19} /></button>
    </header>
    <div className="render-body layout-dialog-body">
      {!pair && <p className="meta">Mevcut düzeni çoğaltarak aynı oda için bir alternatif oluştur.</p>}
      <div className="layout-actions">
        <button type="button" onClick={() => { setPair(undefined); duplicate() }}
          disabled={(project.layouts?.entries.length ?? 1) >= maxLayouts}><Copy size={16} /> Yerleşimi çoğalt</button>
        {active && <TextField label="Etkin yerleşimin adı" value={active.name} change={name => rename(active.id, name)} />}
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      {pair && <>
        <LayoutPairFields project={project} pair={pair} onChange={setPair} />
        <div className="layout-options">
          {measurementCount ? <p className="meta">{measurementCount} ortak ölçü</p>
            : <p className="meta">Karşılaştırmak için 2B planda bir ölçü kaydet.</p>}
          <label className="measure"><span>Boşlukları gösterilecek eşya</span>
            <select value={selected ?? ''} onChange={event => setItem(event.currentTarget.value)}>
              <option value="">Eşya seç</option>{choices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <div className="layout-grid">
          {pair.map(id => <LayoutMeasurements key={id} project={project} id={id} itemId={selected} openLayout={openLayout} />)}
        </div>
      </>}
    </div>
    {pair && <footer className="dialog-footer"><button type="button" className="primary" onClick={() => render(pair)}>
      <Film size={16} /> Render karşılaştırmasına geç</button></footer>}
  </dialog>
}
