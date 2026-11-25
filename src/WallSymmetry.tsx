import { Measure } from './fields'
import { fmt } from './model'
import type { MountSymmetry, SymmetryPreview, WallSymmetryOptions } from './wall-mount-edit'
import type { MountSymmetryRule, Project } from './model'
import { SymmetryRangeSearch } from './SymmetryRangeSearch'

export function WallSymmetryControls({ project, setup, options, preview, update, apply, close, rules, ruleId, pickRule, removeRule }: {
  project: Project;
  setup: MountSymmetry; options: WallSymmetryOptions; preview: SymmetryPreview;
  update: (value: MountSymmetry) => void; apply: (save: boolean) => void; close: () => void;
  rules: MountSymmetryRule[]; ruleId?: string; pickRule: (id: string) => void; removeRule: (id: string) => void;
}) {
  const sides = [
    { name: 'Sol', key: 'leftId', other: setup.rightId, result: preview.left },
    { name: 'Sağ', key: 'rightId', other: setup.leftId, result: preview.right },
  ] as const
  const blocked = preview.items.length !== 2 || preview.left?.blocked || preview.right?.blocked || preview.error
  return <form className="wall-symmetry-panel" aria-label="Simetrik yerleşim" onSubmit={event => {
    event.preventDefault()
    if (!blocked) apply(Boolean(ruleId))
  }}>
    {rules.length > 0 && <div className="wall-copy-controls wall-symmetry-fields">
      <label className="measure">Kayıtlı simetri <select value={ruleId ?? ''} onChange={event => pickRule(event.currentTarget.value)}>
        <option value="">Yeni simetri</option>
        {rules.map((rule, i) => <option key={rule.id} value={rule.id}>{i + 1}. {
          options.mounts.find(({ item }) => item.id === rule.leftId)?.item.name ?? 'Sol eşya'} / {
          options.mounts.find(({ item }) => item.id === rule.rightId)?.item.name ?? 'Sağ eşya'}</option>)}
      </select></label>
      {ruleId && <button type="button" onClick={() => removeRule(ruleId)}>Kuralı kaldır</button>}
    </div>}
    <div className="wall-copy-controls wall-symmetry-fields">
      <label className="measure">Referans <select value={setup.referenceId} onChange={event => update({ ...setup, referenceId: event.currentTarget.value })}>
        {options.references.map(ref => <option key={ref.id} value={ref.id}
          disabled={ref.id === setup.leftId || ref.id === setup.rightId}>{ref.name}</option>)}
      </select></label>
      {sides.map(({ key, other, name }) => <label className="measure" key={key}>{name} eşya
        <select value={setup[key]} onChange={event => update({ ...setup, [key]: event.currentTarget.value })}>
          {options.mounts.map(({ item }) => <option key={item.id} value={item.id}
            disabled={item.id === other || item.id === setup.referenceId}>{item.name}</option>)}
        </select>
      </label>)}
      <Measure label="Eksenden uzaklık" min={.1} value={setup.distance} change={distance => update({ ...setup, distance })} />
    </div>
    <SymmetryRangeSearch project={project} setup={setup} select={distance => update({ ...setup, distance })} />
    <div className="wall-symmetry-status" aria-live="polite">
      {preview.error ? <p className="error-message">{preview.error}</p> : sides.map(({ name, result }) => result &&
        <section key={name} className={result.blocked ? 'blocked' : undefined} aria-label={`${name} konum`}>
          <p><strong>{name}</strong> · {result.name} · {fmt(result.offset)} cm merkez</p>
          {result.blocked && <p className="error-message">{result.blocked}</p>}
          {result.mirrorGap !== undefined && <p className="meta">{result.mirrorGap >= 0
            ? `Ayna kenarına ${fmt(result.mirrorGap)} cm yatay boşluk`
            : `Aynayla ${fmt(-result.mirrorGap)} cm yatay örtüşme`}</p>}
        </section>)}
    </div>
    <div className="wall-symmetry-actions">
      <button type="button" onClick={close}>Vazgeç</button>
      {!ruleId && <button type="button" disabled={Boolean(blocked)} onClick={() => apply(true)}>Kural olarak kaydet</button>}
      <button type="submit" className="primary" disabled={Boolean(blocked)}>
        {ruleId ? 'Simetri kuralını güncelle' : 'Simetrik yerleşimi uygula'}
      </button>
    </div>
  </form>
}

export function WallSymmetryGuide({ preview, height, size }: { preview: SymmetryPreview; height: number; size: number }) {
  if (preview.center === undefined) return null
  const center = preview.center
  return <g className="wall-symmetry-guide" aria-label="Simetrik konum önizlemesi" role="img" pointerEvents="none">
    <line x1={center} y1={-30} x2={center} y2={height + 35} vectorEffect="non-scaling-stroke" />
    <text x={center} y={-44} textAnchor="middle" fontSize={size * .72} className="wall-label">Referans ekseni</text>
    {[preview.left, preview.right].map((row, index) => {
      if (!row?.item?.mount) return null
      const { item, offset } = row
      const y = height - item.mount!.bottom
      return <g key={item.id} className={row.blocked ? 'wall-copy-guide blocked' : 'wall-copy-guide'}>
        <rect className="wall-copy-ghost" x={offset - item.width / 2} y={y - item.height} width={item.width}
          height={item.height} rx="18" vectorEffect="non-scaling-stroke" />
        <path d={`M ${center} ${y + size * .56} H ${offset}`} vectorEffect="non-scaling-stroke" />
        <text x={(center + offset) / 2} y={y + size * .47} textAnchor="middle"
          fontSize={size * .73} className="wall-label">{fmt(Math.abs(center - offset))} cm</text>
        <title>{index === 0 ? 'Sol' : 'Sağ'} · {row.name}{row.blocked ? ` · ${row.blocked}` : ''}</title>
      </g>
    })}
  </g>
}
