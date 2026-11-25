import { useState } from 'react'
import { Crosshair } from 'lucide-react'
import { fmt } from './model'
import type { Project } from './model'
import { suggestWallSymmetry, symmetryElectricalAvailable } from './wall-symmetry-ranges'
import type { SymmetryRangeResult } from './wall-symmetry-ranges'
import type { MountSymmetry } from './wall-mount-edit'

export function SymmetryRangeSearch({ project, setup, select }: {
  project: Project; setup: MountSymmetry; select: (distance: number) => void;
}) {
  const [match, setMatch] = useState(true)
  const [search, setSearch] = useState<{ project: Project; key: string; result: SymmetryRangeResult }>()
  const canMatch = symmetryElectricalAvailable(project, setup)
  const useCables = match && canMatch
  const key = JSON.stringify([setup.wallId, setup.leftId, setup.rightId, setup.referenceId, useCables])
  const result = search?.project === project && search.key === key ? search.result : undefined
  const suggestions = result?.ranges.map(range => ({
    ...range, distance: Math.min(range.max, Math.max(range.min, setup.distance)),
  })).sort((a, b) => Math.abs(a.distance - setup.distance) - Math.abs(b.distance - setup.distance)).slice(0, 3)
  return <section className="symmetry-range-search" aria-label="Simetri aralığı önerileri">
    <div className="symmetry-range-tools">
      <button type="button" onClick={() => setSearch({ project, key, result: suggestWallSymmetry(project, setup, useCables) })}>
        <Crosshair size={15} /> Uygun aralık bul
      </button>
      {canMatch && <label className="measure check">
        <input type="checkbox" checked={match} onChange={event => { setMatch(event.currentTarget.checked); setSearch(undefined) }} />
        <span>Sabit kablo çıkışlarıyla eşleşsin</span>
      </label>}
    </div>
    {result && <div className="symmetry-range-results" aria-live="polite">
      {result.reason ? <p className="error-message">{result.reason}</p> : suggestions?.map(({ min, max, distance }) =>
        <div className="symmetry-range-choice" key={min}>
          <span>{min === max ? `${fmt(min)} cm` : `${fmt(min)}–${fmt(max)} cm`} uygun aralık</span>
          <button type="button" onClick={() => select(distance)}>{fmt(distance)} cm önizle</button>
        </div>)}
    </div>}
  </section>
}
