import type { Ambience, Fixture, Project, SunStudy } from './model'

type Style = Project['style']
type Settings = Pick<Style, 'lightStrength' | 'lights'>

export const lightProfiles = ['day', 'evening', 'warm'] as const
export const lightNames: Record<Style['light'], string> = {
  day: 'Gündüz',
  warm: 'Sıcak iç mekân',
  evening: 'Sıcak akşam',
}
export const defaultSunStudy: SunStudy = { north: 0, azimuth: 90, elevation: 22 }

export function sunDirection({ north, azimuth, elevation }: SunStudy): [number, number, number] {
  const toRadians = Math.PI / 180
  const bearing = (north + azimuth) * toRadians
  const altitude = elevation * toRadians
  return [Math.sin(bearing) * Math.cos(altitude), Math.sin(altitude), -Math.cos(bearing) * Math.cos(altitude)]
}

export function selectLightProfile(style: Style, light: Style['light']): Style {
  if (light !== 'evening' || style.eveningLighting?.lights) return { ...style, light }
  return { ...style, light, eveningLighting: { ...style.eveningLighting, lights: style.lights ?? [] } }
}

export function activeLighting(style: Style): Required<Settings> {
  if (style.light === 'evening') {
    return { lightStrength: style.eveningLighting?.lightStrength ?? .32,
      lights: style.eveningLighting?.lights ?? style.lights ?? [] }
  }
  return { lightStrength: style.lightStrength ?? 1, lights: style.lights ?? [] }
}

export function changeLighting(style: Style, patch: Settings): Style {
  return style.light === 'evening'
    ? { ...style, eveningLighting: { ...style.eveningLighting, ...patch } }
    : { ...style, ...patch }
}

const whitePoints = [
  [1800, 255, 146, 61], [2700, 255, 189, 129], [3500, 255, 211, 173],
  [4500, 255, 231, 208], [5500, 255, 242, 233], [6500, 255, 249, 250], [9000, 217, 231, 255],
]

export function temperatureColor(temperature: number) {
  const upper = whitePoints.findIndex((point, index) => index > 0 && temperature <= point[0])
  const [from, ...warm] = whitePoints[upper - 1]
  const [to, ...cool] = whitePoints[upper]
  const blend = (temperature - from) / (to - from)
  return '#' + warm.map((channel, index) =>
    Math.round(channel + (cool[index] - channel) * blend).toString(16).padStart(2, '0')).join('')
}

export const fixtureColor = (fixture: Fixture) => fixture.variant === 'pendant'
  ? temperatureColor(fixture.temperature) : fixture.color

export const activeAmbience = (style: Style): Ambience => style.ambiences?.[style.light] ?? {}

export function renderFixtureStates(project: Project) {
  const overrides = activeAmbience(project.style).fixtures
  return project.items.flatMap(item => item.fixture
    ? [{ name: item.name, on: overrides?.[item.id]?.on ?? item.fixture.on }] : [])
}

export function changeAmbience(style: Style, patch: Partial<Ambience>): Style {
  return { ...style, ambiences: { ...style.ambiences, [style.light]: { ...activeAmbience(style), ...patch } } }
}
