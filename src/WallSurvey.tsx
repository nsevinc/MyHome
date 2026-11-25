import { useState } from 'react'
import type { FormEvent } from 'react'
import type { WallEdge } from './geometry'
import { fmt, mm } from './model'
import type { Project, Wall, WallSurvey as Survey } from './model'
import { surveyLevels, wallSurvey } from './wall-survey'

export function WallSurvey({ wall, change }: { wall: Wall; change: (survey?: Survey) => void }) {
  const survey = wall.survey ?? { allowance: 0 }
  const [error, setError] = useState('')
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next: Survey = { allowance: survey.allowance }
    for (const { key } of surveyLevels) {
      const raw = String(data.get(key) ?? '').trim()
      if (!raw) continue
      const value = mm(Number(raw))
      if (!Number.isFinite(value) || value < 1 || value > 50_000) {
        setError('Ölçüyü 0,1–5.000 cm arasında girin.')
        return
      }
      next[key] = value
    }
    const allowance = mm(Number(data.get('allowance')))
    if (!Number.isFinite(allowance) || allowance < 0 || allowance > 1000) {
      setError('Yan montaj payını 0–100 cm arasında girin.')
      return
    }
    setError('')
    change({ ...next, allowance })
  }
  return <details className="element-card" data-review-anchor="survey" open={wall.survey ? true : undefined}>
    <summary>Saha ölçüleri</summary>
    <form className="survey-fields" onSubmit={save}>
      <p className="meta">Üç genişliği aynı sabit duvar başlangıcından ölçün. Montaj payı iki uçtan düşülür.</p>
      {surveyLevels.map(({ key, label }) => <label className="measure" key={key}>
        <span>{label} (cm)</span>
        <input name={key} type="number" step=".1" min=".1" max="5000"
          defaultValue={survey[key] === undefined ? '' : survey[key] / 10}
          key={`${key}:${survey[key] ?? ''}`} />
      </label>)}
      <label className="measure"><span>Her uçta montaj payı (cm)</span>
        <input name="allowance" type="number" step=".1" min="0" max="100" defaultValue={survey.allowance / 10}
          key={survey.allowance} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="button-pair">
        <button type="submit">Saha ölçülerini kaydet</button>
        {wall.survey && <button type="button" onClick={() => change(undefined)}>Ölçüleri sil</button>}
      </div>
    </form>
  </details>
}

export function WallSurveyReading({ project, edge }: { project: Project; edge: WallEdge }) {
  const reading = wallSurvey(project, edge)
  if (!reading) return null
  const { result, rows } = reading
  return <div className="section-readings" aria-label="Saha ölçüsü sonuçları">
    <p>{rows.map(row => `${row.label} ${row.width === undefined ? '—' : fmt(row.width) + ' cm'}`).join(' · ')}</p>
    {result ? <>
      <p><strong>Ortak net genişlik {fmt(result.usable)} cm</strong> · Kot farkı {fmt(result.spread)} cm · Plan {fmt(edge.wall.length)} cm</p>
      {result.modules.map(({ item, deficit }) => <p key={item.id} className={deficit ? 'error-message' : undefined}>
        {item.name} · {deficit ? `Montaj aralığını ${fmt(deficit)} cm aşıyor` : 'Ortak montaj aralığında'}</p>)}
    </> : <p>Ortak net genişlik için üç kotun ölçüsünü girin.</p>}
  </div>
}
