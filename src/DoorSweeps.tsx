import { doorCollisionText, rotateAround } from './wardrobe'
import type { cabinetDoorClearance } from './wardrobe'

export function DoorSweeps({ doors }: { doors: ReturnType<typeof cabinetDoorClearance> }) {
  return <>{doors.map(({ index, pivot, end, limit, side, hit, width, label }) => {
    const sweep = (from: number, to: number) => {
      const a = rotateAround(end, pivot, side * from * Math.PI / 180)
      const b = rotateAround(end, pivot, side * to * Math.PI / 180)
      return `M ${pivot.x} ${pivot.z} L ${a.x} ${a.z} A ${width} ${width} 0 0 ${side > 0 ? 1 : 0} ${b.x} ${b.z} Z`
    }
    return <g key={index} className="door-sweep">
      {(!hit || hit.angle > .01) && <path d={sweep(0, hit?.angle ?? limit)} className="door-sweep-clear" />}
      {hit && <path d={sweep(hit.angle, limit)} className="door-sweep-blocked" />}
      <circle cx={pivot.x} cy={pivot.z} r="12" fill={hit ? '#ad533f' : '#216d58'} />
      <title>{hit ? doorCollisionText(index, hit, label) : `${label} · ${limit}°`}</title>
    </g>
  })}</>
}
