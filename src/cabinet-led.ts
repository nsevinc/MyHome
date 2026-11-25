import type { Box } from './geometry'
import { defaultWardrobe, supportsCabinetLed } from './model'
import type { CabinetLed, Furniture } from './model'
import { temperatureColor } from './lighting'

export const cabinetLedPlaces: Record<CabinetLed['placement'], string> = {
  shelves: 'Raf altları', ceiling: 'Dolap iç tavanı', left: 'Sol iç yan panel',
  right: 'Sağ iç yan panel', top: 'Dolap üstü · tavana doğru',
}
export const defaultCabinetLed: CabinetLed = { on: true, placement: 'ceiling', color: temperatureColor(3000), brightness: 70 }

// Older solid-block wardrobes acquire an editable interior only when lighting is fitted.
export function fitCabinetLed(item: Furniture, cabinetLed: CabinetLed): Partial<Furniture> {
  return { cabinetLed, ...(cabinetLed.on && !item.wardrobe && item.kind === 'wardrobe' && { wardrobe: { ...defaultWardrobe } }) }
}

export type LedStrip = {
  position: [number, number, number]
  width: number
  height: number
  normal: [number, number, number]
}

export function cabinetLight(item: Furniture, parts: Box[]) {
  const led = item.cabinetLed
  if (!led?.on || !supportsCabinetLed(item)) return
  const strips: LedStrip[] = []
  const placement = led.placement
  const mount = placement === 'shelves' ? 'shelf' : placement === 'top' ? 'ceiling' : placement
  for (const panel of parts) {
    if (panel.ledMount !== mount) continue
    const [x, y, z] = panel.position
    const [w, h, d] = panel.size
    if (w <= 0 || h <= 0 || d <= 0) continue
    const thickness = Math.min(.012, d * .12)
    const front = z + d / 2
    if (placement === 'left' || placement === 'right') {
      const sign = placement === 'left' ? 1 : -1
      strips.push({ position: [x + sign * (w / 2 + .0003), y, front - thickness * .6],
        normal: [sign, 0, 0], width: thickness, height: h - 2 * Math.min(.022, h * .1) })
    } else {
      const up = placement === 'top'
      // Only the highest board lights the room. The lower carcass in a niche stays clear.
      if (up && Math.abs(y + h / 2 - item.height / 1000) > .0001) continue
      const count = placement === 'ceiling' ? item.wardrobe?.doors ?? 1 : 1
      const span = w / count
      const margin = Math.min(span * .16, Math.max(.022, h + .008))
      for (let i = 0; i < count; i++) {
        strips.push({ position: [x - w / 2 + span * (i + .5), y + (up ? 1 : -1) * (h / 2 + .0003),
          up ? z - d / 2 + Math.min(.055, d * .2) : front - Math.min(.038, d * .18)],
          normal: [0, up ? 1 : -1, 0], width: span - 2 * margin, height: thickness })
      }
    }
  }
  return { color: led.color, brightness: led.brightness, strips,
    enclosed: placement !== 'top' && (!item.wardrobe || item.wardrobe.front !== 'glass' && item.wardrobe.pose === 'closed') }
}
