import { designScene, findDesign } from './design-variants'
import { layoutScene } from './layout-variants'
import { activeLighting, changeLighting, selectLightProfile } from './lighting'
import type { Project, RenderScene } from './model'

export function renderSceneLayout(project: Project, id?: string) {
  if (id && !project.layouts?.entries.some(entry => entry.id === id)) return
  return layoutScene(project, id ?? project.layouts?.entries[0].id)
}

export function sceneAmbience(project: Project, light: RenderScene['light']) {
  return project.style.ambiences?.[light] ?? {}
}

export const sceneLighting = (project: Project, light: RenderScene['light']) => activeLighting(selectLightProfile(project.style, light))

export function sceneFixtures(project: Project, layoutId?: string, light = project.style.light): RenderScene['fixtures'] {
  const overrides = sceneAmbience(project, light).fixtures
  return renderSceneLayout(project, layoutId)?.items.flatMap(item => item.fixture
    ? [{ id: item.id, name: item.name, on: overrides?.[item.id]?.on ?? item.fixture.on }] : []) ?? []
}

export function resolveRenderScene(project: Project, scene: RenderScene) {
  const layout = renderSceneLayout(project, scene.layoutId)
  const camera = project.cameraViews?.find(view => view.id === scene.cameraId)
  const design = scene.designId ? findDesign(project, scene.designId) : undefined
  const problems: string[] = []
  if (!layout) problems.push('Sahnenin yerleşimi bulunamadı. Bir yerleşim seçin.')
  if (!camera) problems.push('Sahnenin kamerası bulunamadı. Kayıtlı bir kamera seçin.')
  if (scene.designId && !design) problems.push('Sahnenin tasarımı bulunamadı. Bir tasarım seçin.')
  if (layout) {
    const available = new Set(sceneFixtures(project, scene.layoutId).map(fixture => fixture.id))
    scene.fixtures.filter(fixture => !available.has(fixture.id)).forEach(fixture =>
      problems.push(`${fixture.name} seçili yerleşimde bulunamadı.`))
  }
  if (!layout || !camera || problems.length) return { problems, frame: undefined }

  const { renderScenes, cameraViews, sketch, sketchReference, passage, measurements, ...visual } = designScene(layout, design?.id ?? '')
  const switches = new Map(scene.fixtures.map(fixture => [fixture.id, fixture.on]))
  const items = visual.items.map(item => {
    const on = switches.get(item.id)
    return item.fixture && on !== undefined ? { ...item, fixture: { ...item.fixture, on } } : item
  })
  const style = selectLightProfile({ ...visual.style, sun: scene.sun === undefined ? visual.style.sun : scene.sun ?? undefined }, scene.light)
  const ambience = scene.ambience ?? sceneAmbience(project, scene.light)
  const fixtures = { ...ambience.fixtures }
  for (const { id, on } of scene.fixtures) {
    if (Object.hasOwn(fixtures, id)) fixtures[id] = { ...fixtures[id], on }
  }
  const frame: Project = { ...visual, items, title: scene.name, camera: camera.camera, style: {
    ...(scene.lighting ? changeLighting(style, scene.lighting) : style),
    ambiences: { ...style.ambiences, [scene.light]: { ...ambience, fixtures } },
    renderDetail: scene.renderDetail ?? style.renderDetail,
  } }
  return { problems, frame }
}
