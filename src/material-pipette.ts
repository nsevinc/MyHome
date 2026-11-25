import type { Appearance } from './model'

export type MaterialSample = { label: string; appearance: Appearance }
export type MaterialPipette = { sample?: MaterialSample; pick: (sample: MaterialSample) => void }

export function captureAppearance(appearance: Appearance, surfaceColor: string): Appearance {
  // A texture without a color override is rendered in its original colors.
  return { ...appearance, color: appearance.texture ? appearance.color : appearance.color ?? surfaceColor }
}
