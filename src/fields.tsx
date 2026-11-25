import { useEffect, useState } from 'react'
import { cm, mm } from './model'

export function Measure({ label, value, change, min = 0, max = 5000, disabled = false, halfMillimeter = false }: {
  label: string; value: number; change: (value: number) => void | boolean; min?: number; max?: number; disabled?: boolean; halfMillimeter?: boolean;
}) {
  const [draft, setDraft] = useState(String(cm(value)))
  useEffect(() => setDraft(String(cm(value))), [value])
  const number = Number(draft.trim().replace(',', '.'))
  const format = halfMillimeter ? /^-?\d+(?:[.,]\d[05]?)?$/ : /^-?\d+(?:[.,]\d)?$/
  const valid = format.test(draft.trim()) && number >= min && number <= max
  function commit() {
    const distance = halfMillimeter ? Math.round(number * 20) / 2 : mm(number)
    const accepted = valid && (distance === value || change(distance) !== false)
    setDraft(String(cm(accepted ? distance : value)))
  }
  return <label className="measure"><span>{label}</span><span className="input-unit">
    <input inputMode="decimal" value={draft} disabled={disabled} aria-invalid={!valid} onChange={event => setDraft(event.target.value)}
      onBlur={commit} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
      }} />
    <span>cm</span>
  </span></label>
}

export function TextField({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return <label className="measure"><span>{label}</span><input value={draft} maxLength={100}
    onChange={event => setDraft(event.target.value)} onBlur={() => {
      const text = draft.trim()
      if (text && text !== value) change(text)
      setDraft(text || value)
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
}

export function PercentField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void
}) {
  return <label className="measure">
    <span>{label} · {Math.round(value * 100)}%</span>
    <input type="range" aria-label={label} min={min} max={max} step={1} value={Math.round(value * 100)}
      onChange={event => onChange(Number(event.target.value) / 100)} />
  </label>
}

export function NumberField({ label, value, min, max, step = 1, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void;
}) {
  return <label className="measure"><span>{label}</span>
    <input key={value} type="number" min={min} max={max} step={step} defaultValue={value} onBlur={event => {
      const number = event.currentTarget.valueAsNumber
      if (Number.isFinite(number) && number >= min && number <= max) {
        if (number !== value) onChange(number)
      } else event.currentTarget.value = String(value)
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
  </label>
}
