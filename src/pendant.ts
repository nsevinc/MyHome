import type { Furniture } from './model'

export function pendantParts({ width, depth, height }: Furniture) {
  const span = Math.min(width, depth)
  const shade = Math.min(height * .66, span * .6)
  const plate = Math.min(height * .1, 24)
  const plateWidth = Math.min(span * .56, 135)
  const cord = Math.min(span * .05, 11)
  return { shade, plate, plateWidth, cord }
}
