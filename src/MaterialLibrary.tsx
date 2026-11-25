import { useState } from 'react'
import type { CSSProperties } from 'react'
import { appearanceNames, appearancePresets, materialFamilies, materialSamples, textureLibrary, textureLibraryIds } from './materials'
import type { MaterialFamily } from './materials'
import type { Appearance, SurfaceTexture } from './model'
import { libraryTextureUrl } from './texture-upload'

type Preset = Appearance['preset']
type TextureId = typeof textureLibraryIds[number]

export function MaterialSwatch({ texture, color, gloss = false }: { texture?: TextureId; color: string; gloss?: boolean }) {
  const style: CSSProperties = { backgroundColor: color,
    backgroundImage: texture ? `url("${libraryTextureUrl(texture)}")` : undefined }
  return <span aria-hidden="true" className={`material-swatch${gloss ? ' material-swatch-gloss' : ''}`} style={style} />
}

export function MaterialLibrary({ value, color, busy, choosePreset, chooseTexture }: {
  value: Appearance; color: string; busy: boolean; choosePreset: (preset: Preset) => void; chooseTexture: (id: TextureId) => void;
}) {
  const current = materialSamples[value.preset]
  const [family, setFamily] = useState<MaterialFamily | 'all'>(current.family === 'ref' ? 'all' : current.family)
  return <>
    <details className="material-library">
      <summary>
        <MaterialSwatch texture={current.textureId} color={value.color ?? current.color ?? color} gloss={value.preset === 'gloss-lacquer'} />
        <span>Hazır malzemeler<strong>{appearanceNames[value.preset]}</strong></span>
      </summary>
      <div className="material-library-body">
        <label className="measure">Malzeme kategorisi <select value={family} onChange={event =>
          setFamily(event.currentTarget.value as MaterialFamily | 'all')}>
          <option value="all">Tümü</option>
          {Object.entries(materialFamilies).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <div className="material-card-grid" role="group" aria-label="Malzeme örnekleri">
          {appearancePresets.filter(id => family === 'all' || materialSamples[id].family === family).map(id => {
            const sample = materialSamples[id]
            return <button type="button" key={id} disabled={busy} aria-pressed={value.preset === id} onClick={() => choosePreset(id)}>
              <MaterialSwatch texture={sample.textureId} color={sample.color ?? color} gloss={id === 'gloss-lacquer'} />
              <span>{appearanceNames[id]}</span>
            </button>
          })}
        </div>
      </div>
    </details>
    <TextureLibrary texture={value.texture} color={value.color} family={current.family} busy={busy} choose={chooseTexture} />
  </>
}

export function TextureLibrary({ texture, color, family, busy, choose }: {
  texture?: SurfaceTexture; color?: string; family?: MaterialFamily; busy: boolean; choose: (id: TextureId) => void;
}) {
  const [allTextures, setAllTextures] = useState(false)
  const hasMatching = textureLibraryIds.some(id => textureLibrary[id].family === family)
  const textures = textureLibraryIds.filter(id => allTextures || !hasMatching || textureLibrary[id].family === family || id === texture?.libraryId)
  return <details className="material-library">
      <summary>
        {texture && <span className="material-swatch"
          style={{ backgroundColor: texture.originalColors ? '#ffffff' : color ?? '#ffffff', backgroundImage: `url("${texture.data}")` }}
          aria-hidden="true" />}
        <span>Hazır dokular<strong>{texture?.name ?? 'Doku seç'}</strong></span>
      </summary>
      <div className="material-library-body">
        {hasMatching && <label className="measure check">
          <input type="checkbox" checked={allTextures} onChange={event => setAllTextures(event.currentTarget.checked)} /> Tüm dokuları göster
        </label>}
        <div className="material-card-grid" role="group" aria-label="Doku örnekleri">
          {textures.map(id => {
            const sample = textureLibrary[id]
            return <button type="button" key={id} disabled={busy} aria-pressed={texture?.libraryId === id}
              onClick={() => choose(id)}>
              <MaterialSwatch texture={id} color={sample.tint} />
              <span>{sample.label}</span>
            </button>
          })}
        </div>
      </div>
    </details>
}
