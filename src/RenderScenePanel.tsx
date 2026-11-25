import { useState } from 'react'
import { Film, Plus, Trash2 } from 'lucide-react'
import type { StudioRenderPreset } from './cycles-settings'
import { designName, originalDesignName } from './design-variants'
import { layoutName } from './layout-variants'
import { lightNames, lightProfiles } from './lighting'
import { maxRenderScenes, uid } from './model'
import type { Project, RenderScene } from './model'
import { renderSceneLayout, resolveRenderScene, sceneAmbience, sceneFixtures, sceneLighting } from './render-scenes'
import { submitSceneJob } from './scene-queue'
import { RenderGallery } from './RenderGallery'
import { SunSettings } from './SunSettings'
import { AmbienceFields } from './AmbienceFields'
import { RenderDetailFields } from './RenderDetailFields'

export function RenderScenePanel({ project, projectId, save, canRender, openSnapshot }: {
  project: Project; projectId: string; save: (scenes: RenderScene[]) => boolean; canRender: boolean;
  openSnapshot: Parameters<typeof RenderGallery>[0]['openSnapshot']
}) {
  const scenes = project.renderScenes ?? []
  const [draft, setDraft] = useState<RenderScene>()
  const [checked, setChecked] = useState<string[]>([])
  const [preset, setPreset] = useState<StudioRenderPreset>('4k')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const candidates = scenes.map(scene => ({ scene, ...resolveRenderScene(project, scene) }))
  const selected = candidates.filter(row => checked.includes(row.scene.id))
  const available = draft && sceneFixtures(project, draft.layoutId, draft.light)
  const missing = draft?.fixtures.filter(fixture => !available?.some(option => fixture.id === option.id)) ?? []
  const activeLayout = draft?.layoutId ?? project.layouts?.entries[0].id ?? ''

  function newScene() {
    const layoutId = project.layouts?.active
    setDraft({ id: uid(), name: '', layoutId, designId: project.designs?.active,
      cameraId: project.cameraViews?.[0]?.id ?? '', light: project.style.light, sun: project.style.sun ?? null,
      ambience: sceneAmbience(project, project.style.light), lighting: sceneLighting(project, project.style.light),
      renderDetail: project.style.renderDetail ?? {},
      fixtures: sceneFixtures(project, layoutId) })
    setError('')
  }

  function saveDraft() {
    if (!draft?.name.trim() || !draft.cameraId) return
    const item = { ...draft, name: draft.name.trim(), ambience: draft.ambience ?? sceneAmbience(project, draft.light),
      lighting: draft.lighting ?? sceneLighting(project, draft.light), renderDetail: draft.renderDetail ?? project.style.renderDetail ?? {} }
    const result = resolveRenderScene(project, item)
    if (result.problems.length) { setError(result.problems.join(' ')); return }
    const next = scenes.some(scene => scene.id === item.id) ? scenes.map(scene => scene.id === item.id ? item : scene)
      : [...scenes, item]
    if (save(next)) { setDraft(undefined); setError('') }
    else setError('Sahne kaydedilemedi.')
  }

  async function queueAction(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (error) { setError(error instanceof Error ? error.message : 'Yerel render kuyruğu güncellenemedi.') }
    finally { setBusy(false) }
  }

  return <div className="render-stack" aria-label="Kayıtlı sahneler ve render kuyruğu">
    <div className="render-scene-columns">
      <section className="render-stack" aria-label="Kayıtlı sahneler">
        <h3>Kayıtlı sahneler</h3>
        {!project.cameraViews?.length && <p className="meta">Önce Kamera sekmesinde bir açı kaydedip render ayarlarını projeye kaydedin.</p>}
        {!scenes.length && project.cameraViews?.length && <p className="meta">İlk sahneye bir kamera ve ışık profili seçin.</p>}
        {candidates.map(({ scene, problems }) => <div className="render-scene-entry" key={scene.id}>
          <label><input type="checkbox" checked={checked.includes(scene.id)} disabled={problems.length > 0 || busy}
            onChange={event => setChecked(old => event.target.checked ? [...old, scene.id] : old.filter(id => id !== scene.id))} />
            <span>{scene.name}<small>{lightNames[scene.light]}</small></span></label>
          <button onClick={() => { setDraft(scene); setError('') }}>Düzenle</button>
          {problems.length > 0 && <p className="meta" role="status">{problems.join(' ')}</p>}
        </div>)}
        <div className="draw-actions">
          <button disabled={!project.cameraViews?.length || scenes.length >= maxRenderScenes} onClick={newScene}><Plus size={16} /> Sahne ekle</button>
          <label className="measure">Çıktı türü <select value={preset} onChange={event => setPreset(event.target.value === 'preview' ? 'preview' : '4k')}>
            <option value="4k">4K PNG</option><option value="preview">Hızlı önizleme</option>
          </select></label>
          <button className="primary" disabled={!canRender || busy || !selected.length || selected.some(row => !row.frame)}
            onClick={() => void queueAction(async () => {
              for (const { frame, scene } of selected) {
                if (!frame) continue
                await submitSceneJob({ project: frame, context: { projectId, projectName: project.title,
                  layout: layoutName(project, scene.layoutId ?? project.layouts?.entries[0].id),
                  design: designName(project, scene.designId ?? ''),
                  cameraLabel: project.cameraViews?.find(camera => camera.id === scene.cameraId)?.name ?? 'Kayıtlı kadraj' } }, preset)
                setChecked(rows => rows.filter(id => id !== scene.id))
              }
            })}><Film size={16} /> Seçili sahneleri kuyruğa al</button>
        </div>
      </section>
      {draft && <fieldset className="render-fieldset"><legend>Sahne ayarları</legend>
        <label className="measure">Sahne adı <input value={draft.name} maxLength={100} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
        <label className="measure">Sahne yerleşimi <select value={activeLayout} onChange={event => {
          const layoutId = event.target.value || undefined
          const fixtures = sceneFixtures(project, layoutId, draft.light).map(fixture => draft.fixtures.find(value => value.id === fixture.id) ?? fixture)
          setDraft({ ...draft, layoutId, fixtures })
        }}>
          {!project.layouts && <option value="">Oda yerleşimi</option>}
          {activeLayout && !project.layouts?.entries.some(entry => entry.id === activeLayout) && <option value={activeLayout} disabled>Yerleşim bulunamadı</option>}
          {project.layouts?.entries.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select></label>
        <label className="measure">Sahne tasarımı <select value={draft.designId ?? ''}
          onChange={event => setDraft({ ...draft, designId: event.target.value || undefined })}>
          <option value="">{originalDesignName}</option>
          {draft.designId && !project.designs?.entries.some(entry => entry.id === draft.designId) && <option value={draft.designId} disabled>Tasarım bulunamadı</option>}
          {project.designs?.entries.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select></label>
        <label className="measure">Sahne kamerası <select value={draft.cameraId}
          onChange={event => setDraft({ ...draft, cameraId: event.target.value })}>
          {!project.cameraViews?.some(view => view.id === draft.cameraId) && <option value={draft.cameraId} disabled>Kayıtlı bir kamera seçin</option>}
          {project.cameraViews?.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
        </select></label>
        <label className="measure">Sahne ışığı <select value={draft.light} onChange={event => {
          const light = event.target.value as RenderScene['light']
          setDraft({ ...draft, light, ambience: sceneAmbience(project, light), lighting: sceneLighting(project, light),
            fixtures: sceneFixtures(project, draft.layoutId, light) })
        }}>
          {lightProfiles.map(light => <option key={light} value={light}>{lightNames[light]}</option>)}
        </select></label>
        <AmbienceFields value={draft.ambience ?? sceneAmbience(project, draft.light)} evening={draft.light === 'evening'}
          strength={(draft.lighting ?? sceneLighting(project, draft.light)).lightStrength}
          change={patch => setDraft({ ...draft, ambience: { ...draft.ambience ?? sceneAmbience(project, draft.light), ...patch } })} />
        <SunSettings project={project} sun={draft.sun === undefined ? project.style.sun : draft.sun ?? undefined}
          change={sun => setDraft({ ...draft, sun: sun ?? null })} />
        <details className="render-fieldset"><summary>Sahne çevresi ve tekstiller</summary>
          <RenderDetailFields project={renderSceneLayout(project, draft.layoutId) ?? project}
            value={draft.renderDetail ?? project.style.renderDetail ?? {}} change={patch =>
              setDraft({ ...draft, renderDetail: { ...(draft.renderDetail ?? project.style.renderDetail), ...patch } })} />
        </details>
        {available && available.length > 0 && <fieldset className="render-fieldset"><legend>Armatürler</legend>
          {available.map(fixture => <label className="render-checkbox" key={fixture.id}>
            <input type="checkbox" checked={draft.fixtures.find(row => row.id === fixture.id)?.on ?? fixture.on}
              onChange={event => setDraft({ ...draft, fixtures: [...draft.fixtures.filter(row => row.id !== fixture.id),
                { ...fixture, on: event.target.checked }] })} />{fixture.name}
          </label>)}
        </fieldset>}
        {missing.map(fixture => <button key={fixture.id} onClick={() => setDraft({ ...draft, fixtures: draft.fixtures.filter(row => row.id !== fixture.id) })}>
          {fixture.name} referansını kaldır</button>)}
        <div className="draw-actions">
          <button className="primary" disabled={!draft.name.trim() || !draft.cameraId} onClick={saveDraft}>Sahneyi kaydet</button>
          <button onClick={() => setDraft(undefined)}>Vazgeç</button>
          {scenes.some(scene => scene.id === draft.id) && <button onClick={() => {
            if (save(scenes.filter(scene => scene.id !== draft.id))) setDraft(undefined)
          }}><Trash2 size={15} /> Sahneyi kaldır</button>}
        </div>
      </fieldset>}
    </div>
    {error && <p role="alert">{error}</p>}
    <RenderGallery projectId={projectId} openSnapshot={openSnapshot} />
  </div>
}
