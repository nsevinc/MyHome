import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt } from './model'
import type { Furniture, Project } from './model'
import { placementSearchScene } from './placement-search'
import { WardrobeBalancePreview } from './WardrobeBalancePreview'
import { doorSolution, inspectSolution, solutionRun, unchangedSolution } from './wardrobe-solutions'
import type { BedSolutions, SolutionRun } from './wardrobe-solutions'
import type { BalanceSummary } from './wardrobe-rebalance'

export function WardrobeSolutions({ run, summary, apply, back }: {
  run: SolutionRun; summary?: BalanceSummary; apply: (next: Project, items: Furniture[]) => boolean; back: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const beds = run.project.items.filter(item => item.kind === 'bed')
  const [bed, setBed] = useState(beds[0]?.id ?? '')
  const [search, setSearch] = useState(false)
  const [result, setResult] = useState<BedSolutions>()
  const [failure, setFailure] = useState('')
  const [choice, setChoice] = useState(0)
  const base = useMemo(() => inspectSolution(run), [run])
  const options = useMemo(() => {
    const doors = doorSolution(base.checks)
    return [unchangedSolution, ...(doors ? [doors] : []), ...(result?.options ?? [])].map(option => {
      if (option === unchangedSolution) return { option, draft: run, report: base }
      const draft = solutionRun(run, option)
      return { option, draft, report: inspectSolution(draft) }
    })
  }, [run, base, result])
  const { option, draft, report } = options[choice] ?? options[0]
  const { front, route } = report
  const selectedBed = beds.find(i => i.id === bed)
  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    if (!search || !bed) return
    let worker: Worker | undefined
    try {
      worker = new Worker(new URL('./wardrobe-solutions.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<BedSolutions>) => { setResult(event.data); worker?.terminate() }
      worker.onerror = event => {
        event.preventDefault()
        setFailure('Yatak konumu hesaplanamadı. Aramayı kapatıp yeniden deneyebilirsiniz.')
        worker?.terminate()
      }
      worker.postMessage({ scene: placementSearchScene(run.project), runId: run.parts[0].item.wardrobeRun!.id, bedId: bed })
    } catch { setFailure('Yatak konumu araması başlatılamadı.') }
    return () => { if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate() } }
  }, [search, bed, run])
  function reset() { setResult(undefined); setFailure(''); setChoice(0) }
  const routeText = route.status === 'missing' ? 'Planda giriş kapısı tanımlı değil.' :
    `${fmt(route.entranceWidth)} cm kapı · ${route.reached}/${route.total} modüle erişim`
  return <section aria-label="Çözüm seçenekleri" className="wardrobe-solutions">
    <h3 ref={heading} tabIndex={-1}>Çözüm seçeneklerini karşılaştır</h3>
    {!!beds.length && base.reasons.length > 0 && <div className="wardrobe-run-controls">
      {beds.length > 1 && <label className="measure">Yatak<select value={bed} onChange={e => { reset(); setBed(e.target.value) }}>
        {beds.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
      <label className="measure check"><input type="checkbox" checked={search} disabled={selectedBed?.locked}
        onChange={e => { reset(); setSearch(e.target.checked) }} /> Yatağı da taşıyabilirim</label>
      {selectedBed?.locked && <p>Yatağın konumu kilitli.</p>}
    </div>}
    {search && !result && !failure && <p role="status">150 cm içinde yatak ve bağlı eşyaların konumları deneniyor…</p>}
    {failure && <p role="alert" className="error-message">{failure}</p>}
    {search && result && !result.options.length && <div role="status">
      <p>{options.some(o => !o.report.reasons.length) ? 'Yatak yerindeyken uygulanabilir bir seçenek var.' :
        '150 cm içinde denenen yatak konumları kapak, geçiş ve giriş koşullarını birlikte karşılamadı.'}</p>
      {result.blockers.length > 0 && <details><summary>Yatak hareketini sınırlayan engeller</summary><ul>
        {result.blockers.map(text => <li key={text}>{text}</li>)}</ul></details>}
    </div>}
    <div className="solution-options" role="group" aria-label="Planda önizlenecek seçenek">
      {options.map(({ option: row, report: r }, i) => <button type="button" key={row.title} aria-pressed={choice === i}
        onClick={() => { setChoice(i); setFailure('') }}><strong>{row.title}</strong>
        <span>{r.reasons.length ? 'Engel var' : 'Uygulanabilir'} · {r.front.gap !== undefined ? `${fmt(r.front.gap)} cm geçiş` : 'Geçiş açık'}</span></button>)}
    </div>
    <p><strong>Dolap önü</strong> · {front.gap !== undefined ? `${fmt(front.gap)} cm` : 'Açık'} · hedef {fmt(front.rule.distance)} cm
      {' · '}<strong>Oda girişi</strong> · {routeText}</p>
    {option.doors.map(change => {
      const row = base.checks.find(c => c.item.id === change.id)!
      return <p key={change.id}>{row.item.name} · {row.doorSuggestion?.kind === 'hinge'
        ? row.doorSuggestion.changes.map(c => `${c.leaf} menteşesi ${c.hinge === 'left' ? 'sola' : 'sağa'} alınır`).join(', ')
        : 'Menteşeli kapaklar sürgülüye çevrilir.'}</p>
    })}
    {option.moves.map(move => {
      const from = run.project.items.find(i => i.id === move.id)!
      const dx = move.x - from.x, dz = move.z - from.z
      const delta = [dx && `${fmt(Math.abs(dx))} cm ${dx > 0 ? 'sağa' : 'sola'}`, dz && `${fmt(Math.abs(dz))} cm ${dz > 0 ? 'aşağı' : 'yukarı'}`].filter(Boolean)
      return <p key={move.id}>{from.name} · {delta.join(', ')}. Mor kesikli çizgi önceki konumu gösterir.</p>
    })}
    <WardrobeBalancePreview run={draft} summary={summary} checks={report.checks}
      comparison={{ before: run.project.items.filter(i => option.moves.some(m => m.id === i.id)), route: route.path, strips: report.strips }} />
    {!!report.reasons.length && <ul className="error-message">{report.reasons.map(r => <li key={r}>{r}</li>)}</ul>}
    <div className="draw-actions"><button type="button" onClick={back}>Düzenlemeye dön</button>
      <button className="primary" type="button" disabled={!!report.reasons.length || run.locked || run.overhang > 0}
        onClick={() => { if (!apply(draft.project, draft.parts.map(p => p.item))) setFailure('Yerleşim kaydedilemedi. Eşya ve bağlantı uyarılarını kontrol edin.') }}>
        Seçeneği uygula</button></div>
  </section>
}
