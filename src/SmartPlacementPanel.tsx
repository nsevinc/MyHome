import { useEffect, useState } from 'react'
import { CircleHelp, Crosshair, X } from 'lucide-react'
import { fmt } from './model'
import type { Project } from './model'
import { placementSearchScene } from './placement-search'
import type { PlacementOptions, PlacementResult, PlacementSuggestion } from './placement-search'

const radii = [500, 1000, 1500] as const

function displacement(suggestion: PlacementSuggestion) {
  const { dx, dz, turn } = suggestion
  return [
    dx && `${fmt(Math.abs(dx))} cm ${dx > 0 ? 'sağa' : 'sola'}`,
    dz && `${fmt(Math.abs(dz))} cm ${dz > 0 ? 'aşağı' : 'yukarı'}`,
    turn && `${turn > 0 && turn !== 180 ? '+' : ''}${turn}° dönüş`,
  ].filter(Boolean).join(' · ')
}

export default function SmartPlacementPanel({ project, ids, preview, apply, close, help }: {
  project: Project; ids: string[]; preview: (suggestion?: PlacementSuggestion) => void
  apply: (suggestion: PlacementSuggestion) => void; close: () => void; help: () => void;
}) {
  const [radius, setRadius] = useState<PlacementOptions['radius']>(1000)
  const [rotate, setRotate] = useState(false)
  const [result, setResult] = useState<PlacementResult>()
  const [selected, setSelected] = useState(0)
  const [failed, setFailed] = useState(false)
  const [request, retry] = useState(0)
  const source = ids.length === 1 ? project.items.find(item => item.id === ids[0]) : undefined

  useEffect(() => {
    let worker: Worker | undefined
    try {
      worker = new Worker(new URL('./placement-search.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<PlacementResult>) => {
        setResult(event.data)
        preview(event.data.suggestions[0])
        worker?.terminate()
      }
      worker.onerror = event => { event.preventDefault(); setFailed(true); worker?.terminate() }
      worker.postMessage({ scene: placementSearchScene(project), ids, options: { radius, rotate } })
    } catch { worker?.terminate(); setFailed(true) }
    return () => {
      if (!worker) return
      worker.onmessage = null
      worker.onerror = null
      worker.terminate()
    }
  }, [project, ids, radius, rotate, preview, request])

  function reset() {
    setResult(undefined)
    setSelected(0)
    setFailed(false)
    preview(undefined)
  }
  const choice = result?.suggestions[selected]
  return <section className="smart-placement" aria-label="Akıllı yerleşim">
    <header><div><Crosshair size={17} /><h3>Akıllı yerleşim</h3></div>
      <div><button type="button" className="icon" aria-label="Akıllı yerleşim rehberi" onClick={help}><CircleHelp size={16} /></button>
        <button type="button" className="icon" aria-label="Yerleşim önerilerini kapat" onClick={close}><X size={17} /></button></div>
    </header>
    <p className="meta">{source?.name ?? `${ids.length} eşya · Grup aralıkları korunur`}</p>
    <label className="measure">Arama mesafesi<select value={radius} onChange={event => {
      const next = radii.find(value => value === Number(event.currentTarget.value))
      if (next && next !== radius) { reset(); setRadius(next) }
    }}>{radii.map(value => <option key={value} value={value}>{fmt(value)} cm</option>)}</select></label>
    {source && !source.mount && <label className="measure check"><input type="checkbox" checked={rotate} onChange={event => {
      const checked = event.currentTarget.checked
      reset()
      setRotate(checked)
    }} /> <span>90° dönüşleri de dene</span></label>}
    {failed ? <div role="alert"><p>Konum araması başlatılamadı.</p><button type="button" onClick={() => {
      reset(); retry(value => value + 1)
    }}>Tekrar dene</button></div> : !result ? <p role="status">Konumlar kontrol ediliyor…</p> : <>
      {result.suggestions.length ? <>
        <div className="smart-options" role="group" aria-label="Konum önerileri">
          {result.suggestions.map((suggestion, index) => <button type="button" key={index} aria-pressed={selected === index}
            onClick={() => { setSelected(index); preview(suggestion) }}>
            <strong>{displacement(suggestion)}</strong>
            {suggestion.passages.map(reading => <small key={reading.id}>{reading.name} · {reading.value}</small>)}
            {suggestion.sideGap && <small>{suggestion.sideGap.direction} kenar · {fmt(Math.round(suggestion.sideGap.distance))} cm · {suggestion.sideGap.name}</small>}
          </button>)}
        </div>
        <p className="meta">Kesikli çizgi önerilen konumu gösterir.</p>
        <button className="primary smart-apply" type="button" disabled={!choice} onClick={() => { if (choice) apply(choice) }}>Konumu uygula</button>
      </> : <p role="status">Bu mesafede uygun konum bulunamadı.</p>}
      {result.currentIssues.length > 0 && <details open={!result.suggestions.length}>
        <summary>Mevcut konumdaki engeller</summary>
        <ul>{result.currentIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>
      </details>}
      {!result.suggestions.length && result.blockers.length > 0 && <details open>
        <summary>Aramayı sınırlayan engeller</summary>
        <ul>{result.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>
      </details>}
    </>}
  </section>
}
