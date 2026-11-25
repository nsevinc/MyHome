import { designScene } from './design-variants'
import type { Project } from './model'

export function emptyRoomProject(source: Project): Project {
  const { style } = designScene(source)
  const ambiences = style.ambiences && Object.fromEntries(Object.entries(style.ambiences).map(([profile, settings]) =>
    [profile, { ...settings, fixtures: undefined }]))
  const suffix = ' · Boş oda'
  return {
    ...source,
    title: `${source.title.slice(0, 100 - suffix.length).trimEnd()}${suffix}`,
    items: [], layouts: undefined, designs: undefined, furnitureLinks: undefined, mountSymmetries: undefined, keepClear: undefined, upperCabinetRows: undefined,
    measurements: source.measurements?.filter(measure => measure.kind === 'passage'),
    usageScenarios: undefined, renderScenes: undefined,
    style: {
      ...style, lights: undefined, ambiences,
      eveningLighting: style.eveningLighting && { ...style.eveningLighting, lights: [] },
      renderDetail: style.renderDetail && { ...style.renderDetail, detailedBedding: undefined },
    },
  }
}
