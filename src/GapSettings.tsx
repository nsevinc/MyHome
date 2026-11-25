import { useMemo, useState } from 'react'
import { Measure } from './fields'
import { moveAlongWall } from './geometry'
import type { WallEdge } from './geometry'
import { measureGaps, moveForGap } from './layout'
import { fmt } from './model'
import type { Furniture, Project } from './model'

export function GapSettings({ project, item, edges, update, previewing }: {
  project: Project; item: Furniture; edges: WallEdge[]; update: (item: Furniture) => void; previewing: boolean;
}) {
  const [error, setError] = useState('')
  const gaps = useMemo(() => measureGaps(project, item, edges), [project, item, edges])
  const wall = item.mount && edges.find(edge => edge.wall.id === item.mount?.wallId)
  return <fieldset className="render-fieldset gap-settings" disabled={previewing}>
    <legend>Mesafeler</legend>
    {gaps.map(gap => {
      const label = `${gap.label} · ${gap.name}`
      const locked = item.mount && (!wall || gap.axis !== (wall.dx ? 'x' : 'z'))
      return gap.overlap || locked
        ? <div className="gap-reading" key={gap.label}><span>{label}</span>
          <output>{gap.overlap ? 'Çakışıyor' : `${fmt(Math.round(gap.distance))} cm`}</output></div>
        : <Measure key={label} label={label} value={Math.round(gap.distance)} change={value => {
          const position = moveForGap(item, gaps, gap, value, edges)
          if (!position) {
            setError('Bu mesafe için karşı yönde yeterli boşluk yok.')
            return false
          }
          setError('')
          update(moveAlongWall(item, position, edges))
        }} />
    })}
    {error && <p className="error-message" role="status">{error}</p>}
  </fieldset>
}
