import { Measure } from './fields'
import { fmt } from './model'
import type { Furniture, Project } from './model'
import { assemblyText, checkTransport, emptyRoute, wardrobeAssembly } from './wardrobe-assembly'

export function AssemblyReadings({ result }: { result: ReturnType<typeof wardrobeAssembly> }) {
  return <div className="wardrobe-run-checks">
    <p>Yerde kurup kaldırma · <strong>{fmt(result.diagonal)} cm</strong> en yüksek kot</p>
    <p>{assemblyText(result, 'raise')} · Önde gövde için {fmt(result.roomwardFloorLength)} cm alan</p>
    <p>Dik kurulum · <strong>{fmt(result.uprightHeight)} cm</strong> · {assemblyText(result, 'stand')}</p>
  </div>
}

const routeDimensions = [
  ['doorWidth', 'Kapı net eni'], ['doorHeight', 'Kapı net yüksekliği'], ['corridorWidth', 'Koridor net eni'],
  ['turnWidth', 'Dönüş alanı eni'], ['turnDepth', 'Dönüş alanı boyu'],
] as const

export function WardrobeAssembly({ project, item, change, openRoute }: {
  project: Project; item: Furniture; change: (value: NonNullable<Furniture['assembly']>) => void; openRoute?: () => void
}) {
  const assembly = item.assembly ?? { allowance: 0 }
  const route = assembly.transport ?? emptyRoute
  const result = checkTransport(item, route)
  return <details className="render-fieldset" data-review-anchor="assembly">
    <summary>Montaj ve taşıma kontrolü</summary>
    <Measure label="Dik kurulum için ek üst pay" value={assembly.allowance} max={50}
      change={allowance => change({ ...assembly, allowance })} />
    <AssemblyReadings result={wardrobeAssembly(project, item)} />
    <p className="meta">Gövde son konumunda ve ön alt kenarı etrafında kaldırılır. Bağlantı ve çalışma payını üretici ölçüsüne göre girin.</p>
    <fieldset className="render-fieldset">
      <legend>Ölçülen taşıma güzergâhı</legend>
      <label className="measure">Gövde yönü <select value={route.orientation} onChange={event => {
        const orientation = event.target.value as typeof route.orientation
        change({ ...assembly, transport: { ...route, orientation } })
      }}>
        <option value="upright">Dik</option><option value="side">Yan yatırılmış, uzun kenar ileri</option>
        <option value="back">Sırt üstü, uzun kenar ileri</option>
      </select></label>
      {routeDimensions.map(([key, label]) => <Measure key={key} label={label} value={route[key]}
        change={value => change({ ...assembly, transport: { ...route, [key]: value } })} />)}
      <p className="meta">Girilmemiş ölçüler 0. Kapı genişliği kanat ve kasa arasındaki net açıklıktır.</p>
      <p>Kapı · {fmt(result.width)} × {fmt(result.height)} cm gerekir{result.door === undefined ? '' : result.door ? ' · Yeterli' : ' · Yetersiz'}</p>
      {result.corridor !== undefined && <p>Düz koridor · {result.corridor ? 'Yeterli en' : 'Yetersiz en'}</p>}
      <p>90° yerinde dönüş · {fmt(result.turnClearance)} cm kare alan{result.turn === undefined ? ''
        : result.turn ? ' · Yeterli alan' : ' · Yerinde dönüş için yetersiz'}</p>
    </fieldset>
    {openRoute && <button type="button" onClick={openRoute}>
      {assembly.routePath ? 'Ölçülü rotayı düzenle' : 'Ölçülü rota çiz'}
    </button>}
  </details>
}
