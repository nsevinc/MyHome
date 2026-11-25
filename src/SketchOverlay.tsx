import type { Point, SketchReference } from './model'
import { sheetCenter, sheetHeight, sheetWidth } from './sketch-reference'

export function SketchOverlay({ source, reference, placement }: {
  source: string; reference: SketchReference; placement?: { origin: Point; mmPerUnit: number }
}) {
  return <g pointerEvents="none" transform={placement &&
    `scale(${placement.mmPerUnit}) translate(${-placement.origin.x} ${-placement.origin.z})`}>
    <image href={source} width={sheetWidth} height={sheetHeight} opacity={reference.opacity}
      preserveAspectRatio="xMidYMid meet" transform={`rotate(${reference.rotation} ${sheetCenter.x} ${sheetCenter.z})`} />
  </g>
}
