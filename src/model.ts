import { z } from 'zod'
import { bedroomCatalog, bedroomModelKinds } from './bedroom-models'
import type { BedroomModel } from './bedroom-models'
import { appearancePresets, finishes, furnitureMaterialPreset, furnitureMaterialPresets, maxTextureBytes, textureLibraryIds, texturePrefix } from './materials'
import { maxIesBytes, validIesProfile } from './ies-profile'

export const mm = (cm: number) => Math.round(cm * 10)
export const cm = (millimeters: number) => millimeters / 10
export const meters = (millimeters: number) => millimeters / 1000
export const fmt = (millimeters: number) => cm(millimeters).toLocaleString('tr-TR', { maximumFractionDigits: 1 })
export const uid = () => crypto.randomUUID()

const dimension = z.number().int().min(1).max(50_000)
const offset = z.number().int().min(0).max(50_000)
const coordinate = z.number().int().min(-200_000).max(200_000)
const color = z.string().regex(/^#[0-9a-f]{6}$/i)
const rotation = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)])
const id = z.string().min(1).max(100)
const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
export const cameraSchema = z.object({ position: vec3, target: vec3, fov: z.number().min(20).max(95),
  verticalShift: z.number().min(-.4).max(.4).optional() })
  .refine(camera => Math.hypot(...camera.position.map((component, i) => component - camera.target[i])) > .001,
    { message: 'Kamera ile bakış hedefi aynı noktada olamaz.' })
const textureSchema = z.object({
  name: z.string().min(1).max(100),
  data: z.string().max(texturePrefix.length + Math.ceil(maxTextureBytes / 3) * 4).startsWith(texturePrefix),
  tileMm: z.number().int().min(10).max(10_000),
  originalColors: z.boolean().optional(),
  libraryId: z.enum(textureLibraryIds).optional(),
})
const appearanceSchema = z.object({
  preset: z.enum(appearancePresets), color: color.optional(), texture: textureSchema.optional(),
  roughnessMap: textureSchema.optional(), normalMap: textureSchema.optional(),
  tileMm: z.number().int().min(10).max(10_000).optional(),
  scale: z.number().min(.35).max(3).optional(), direction: z.number().min(0).lt(360).optional(),
  relief: z.number().min(0).max(2).optional(), roughness: z.number().min(0).max(1).optional(),
})
const trimDepth = z.number().int().min(1).max(200)
const windowTrimSchema = z.object({ width: z.number().int().min(1).max(300), depth: trimDepth,
  appearance: appearanceSchema.optional() })
export const maxBaseboardGaps = 12
const baseboardSchema = z.object({ height: z.number().int().min(1).max(400), depth: trimDepth,
  appearance: appearanceSchema.optional(), gaps: z.array(z.object({ id, start: offset, width: dimension })).max(maxBaseboardGaps).optional() })
const roomLightSchema = z.object({
  id, name: z.string().trim().min(1).max(100), position: vec3,
  power: z.number().min(1).max(2000), color,
})
export const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const

const openingSchema = z.object({
  id, kind: z.enum(['door', 'window']), offset, width: dimension, bottom: offset, height: dimension,
  swing: z.object({ hinge: z.enum(['start', 'end']), angle: z.number().min(0).max(110) }).optional(),
  sill: z.object({ width: dimension, depth: z.number().int().min(1).max(1500),
    thickness: z.number().int().min(1).max(150), finish: z.enum(['white', 'gray']), appearance: appearanceSchema.optional() }).optional(),
  trim: windowTrimSchema.optional(),
}).refine(opening => opening.kind === 'door' ? !opening.sill && !opening.trim : !opening.swing,
  { message: 'Kapı kanadı, pencere denizliği ve pervazı kendi açıklık türüne uygulanabilir.' })
const obstacleSchema = z.object({
  id, name: z.string().trim().min(1).max(100), offset, width: dimension,
  depth: dimension, bottom: offset, top: dimension,
})
const wallSurveySchema = z.object({
  floor: dimension.optional(), middle: dimension.optional(), upper: dimension.optional(),
  allowance: z.number().int().min(0).max(1000),
})
export const maxElectricalPoints = 24
const electricalPointSchema = z.object({
  id, kind: z.enum(['outlet', 'switch', 'light-feed']), name: z.string().trim().min(1).max(100),
  offset, height: offset, example: z.boolean().optional(),
})
const wallSchema = z.object({
  id, dir: rotation, length: dimension, locked: z.boolean().optional(), openings: z.array(openingSchema).max(24),
  obstacles: z.array(obstacleSchema).max(30),
  survey: wallSurveySchema.optional(),
  electricalPoints: z.array(electricalPointSchema).max(maxElectricalPoints).optional(),
  baseboard: baseboardSchema.optional(),
})
const modelReference = z.discriminatedUnion('source', [
  z.object({ source: z.literal('upload'), data: z.string().min(1).max(14_000_000) }),
  z.object({ source: z.literal('catalog'), id, version: z.literal(1) }),
])
const furnitureMaterialSchema = z.object({
  preset: z.enum(furnitureMaterialPresets), color,
  scale: z.number().min(.35).max(3), relief: z.number().min(0).max(2), roughness: z.number().min(0).max(1),
})
const appearanceSlotsSchema = z.record(z.string().regex(/^(all|[a-z][a-z0-9-]{0,29})$/), appearanceSchema.nullable())
  .refine(slots => Object.keys(slots).length <= 65, { message: 'En fazla 65 malzeme yüzeyi düzenlenebilir.' })
const leafSchema = z.object({
  hinge: z.enum(['left', 'right']).optional(),
  limit: z.number().min(1).max(110).optional(),
  angle: z.number().min(0).max(110).optional(),
})
const wardrobeStackSchema = z.object({
  type: z.enum(['drawers', 'niche']), lower: z.number().min(.1).max(.7), middle: z.number().min(.08).max(.6),
  drawers: z.number().int().min(1).max(3).optional(),
}).refine(stack => stack.lower + stack.middle <= .90 + 1e-8 && (stack.type === 'drawers') === (stack.drawers !== undefined),
  { message: 'Alt, orta ve üst gardırop bölümlerinin ölçülerini kontrol edin.' })
const wardrobeSchema = z.object({
  doors: z.number().int().min(1).max(5),
  front: z.enum(['solid', 'glass']),
  pose: z.enum(['closed', 'open', 'none']),
  motion: z.enum(['hinged', 'sliding']).optional(),
  leaves: z.array(leafSchema.nullable()).max(10).optional(),
  interior: z.array(z.object({
    shelves: z.array(z.number().min(.1).max(.9)).max(5),
    rail: z.number().min(.2).max(.94).optional(),
    drawers: z.number().int().min(0).max(3),
  }).nullable()).max(5).optional(),
  parking: z.enum(['left', 'right']).optional(),
  slide: z.number().min(0).max(1).optional(),
  stack: wardrobeStackSchema.optional(),
}).refine(wardrobe => wardrobe.motion !== 'sliding' || wardrobe.doors === 2,
  { message: 'Sürgülü gardırop iki panelli olmalı.' })
  .refine(wardrobe => !wardrobe.stack || wardrobe.motion !== 'sliding', { message: 'Katlı gardıroplarda menteşeli kapak kullanılır.' })
  .refine(wardrobe => wardrobe.stack || (wardrobe.leaves?.length ?? 0) <= 5, { message: 'Kapak sayısı desteklenen sınırı aşıyor.' })
// An odd millimetre body width can put the centre of a flush cabinet on a half millimetre.
const mountCenter = z.number().min(0).max(50_000).multipleOf(.5)
const mountSchema = z.object({ wallId: id, offset: mountCenter, bottom: offset })
export const defaultWardrobeGap = 2
export const maxFurnitureItems = 300
export const maxWardrobeGap = 200
const wardrobeFillAreaSchema = z.object({ start: offset, end: offset, depth: dimension,
  profile: z.enum(['ready', 'custom']), margin: offset, passage: dimension, entrance: id.optional(),
}).refine(area => area.end > area.start, { message: 'Gardırop alanının bitişi başlangıçtan sonra olmalı.' })
const wardrobeRunSchema = z.object({ id, wallId: id, index: z.number().int().min(0).max(maxFurnitureItems - 1),
  gap: z.number().int().min(0).max(maxWardrobeGap).optional(),
  fill: wardrobeFillAreaSchema.optional(), anchor: z.object({ start: offset, inset: offset, fixed: z.boolean().optional() }).optional() })
export const maxTransportPoints = 20
const routeCoordinate = z.number().min(-200_000).max(200_000)
const transportPathSchema = z.object({
  entrance: id,
  entryDepth: dimension.optional(),
  points: z.array(z.object({ x: routeCoordinate, z: routeCoordinate })).max(maxTransportPoints),
  finish: z.enum(['x', 'z']),
})
const wardrobeAssemblySchema = z.object({
  allowance: z.number().int().min(0).max(500),
  transport: z.object({
    orientation: z.enum(['upright', 'side', 'back']),
    doorWidth: offset, doorHeight: offset, corridorWidth: offset,
    turnWidth: offset, turnDepth: offset,
  }).optional(),
  routePath: transportPathSchema.optional(),
})
const iesSchema = z.object({
  name: z.string().trim().min(1).max(100),
  text: z.string().max(maxIesBytes).refine(validIesProfile, { message: 'IES profili geçersiz.' }),
  gain: z.number().min(.01).max(5), aim: z.enum(['down', 'out']),
})
const lightFixtureSchema = z.object({ on: z.boolean(), power: z.number().min(1).max(250), ies: iesSchema.optional() })
const fixtureSchema = z.discriminatedUnion('variant', [
  lightFixtureSchema.extend({ variant: z.enum(['globe', 'bar']), color }),
  lightFixtureSchema.extend({ variant: z.literal('pendant'), temperature: z.number().int().min(1800).max(6500) }),
])
const curtainSchema = z.object({
  windowId: id, fabric: z.enum(['sheer', 'opaque']), open: z.number().min(0).max(1), setback: offset,
})
const wallFurnitureKinds = ['wall-cabinet', 'sconce', 'radiator', 'mirror'] as const
const mountedKinds = [...wallFurnitureKinds, 'curtain'] as const
export type MountedKind = typeof wallFurnitureKinds[number]
export { bedroomModelKinds } from './bedroom-models'
export type { BedroomModel } from './bedroom-models'
const bedroomModelSchema = z.enum(Object.keys(bedroomModelKinds) as BedroomModel[])
const isMountedKind = (kind: string) => mountedKinds.some(mounted => mounted === kind)
const cabinetLedSchema = z.object({
  on: z.boolean(), placement: z.enum(['shelves', 'ceiling', 'left', 'right', 'top']),
  color, brightness: z.number().int().min(1).max(100),
})
export type CabinetLed = z.infer<typeof cabinetLedSchema>
export function supportsCabinetLed(item: { kind: string; bedroomModel?: BedroomModel }) {
  return item.kind === 'wardrobe' || (item.kind === 'wall-cabinet' &&
    (!item.bedroomModel || ['overhead', 'side'].includes(bedroomCatalog[item.bedroomModel].family)))
}
export const furnitureSchema = z.object({
  id, name: z.string().trim().min(1).max(100),
  kind: z.enum(['sofa', 'bed', 'table', 'wardrobe', 'box', 'model', 'rug', 'pendant', ...mountedKinds]),
  width: dimension, depth: dimension, height: dimension,
  x: coordinate, z: coordinate, rotation, angle: z.number().min(0).lt(360).optional(), color, model: modelReference.optional(),
  locked: z.boolean().optional(),
  material: furnitureMaterialSchema.optional(), appearances: appearanceSlotsSchema.optional(),
  wardrobe: wardrobeSchema.optional(), wardrobeRun: wardrobeRunSchema.optional(), assembly: wardrobeAssemblySchema.optional(),
  cabinetLed: cabinetLedSchema.optional(),
  drawerTravel: z.number().int().min(10).max(3000).optional(),
  liftAngle: z.number().int().min(5).max(70).optional(),
  mount: mountSchema.optional(), fixture: fixtureSchema.optional(), curtain: curtainSchema.optional(),
  bedroomModel: bedroomModelSchema.optional(), separateHeadboard: z.boolean().optional(),
}).refine(item => (item.kind === 'model') === Boolean(item.model), { message: 'Eşya ve model türü uyuşmuyor.' })
  .refine(item => !item.cabinetLed || supportsCabinetLed(item), { message: 'LED montajı için bir dolap seçin.' })
  .refine(item => (!item.bedroomModel || bedroomModelKinds[item.bedroomModel] === item.kind)
    && (item.separateHeadboard === undefined || item.kind === 'bed'), { message: 'Yatak odası modeli eşya türüyle uyuşmuyor.' })
  .refine(item => (item.drawerTravel === undefined || item.kind === 'box' || item.bedroomModel === 'floating-nightstand')
    && (item.liftAngle === undefined || item.kind === 'bed'),
    { message: 'Çekmece veya baza ayarı eşya türüyle uyuşmuyor.' })
  .refine(item => (!item.wardrobeRun && !item.assembly) || item.kind === 'wardrobe', { message: 'Dizi ve montaj ayarları gardıroplarda kullanılabilir.' })
  .refine(item => !item.wardrobe || item.kind === 'wardrobe' || (item.bedroomModel &&
    ['overhead', 'side'].includes(bedroomCatalog[item.bedroomModel].family)), { message: 'Kapak ayarları gardırop ve yatak başı dolaplarında kullanılabilir.' })
  .refine(item => isMountedKind(item.kind) === Boolean(item.mount)
    && (item.kind === 'pendant') === (item.fixture?.variant === 'pendant')
    && (item.kind === 'sconce') === (item.fixture?.variant === 'globe' || item.fixture?.variant === 'bar'),
    { message: 'Montaj veya aydınlatma bilgisi geçersiz.' })
  .refine(item => !item.material || furnitureMaterialPreset(item.kind) === item.material.preset,
    { message: 'Malzeme seçilen eşya türüyle uyumlu değil.' })
  .refine(item => (item.kind === 'curtain') === Boolean(item.curtain) && (item.kind !== 'rug' || item.height <= 30),
    { message: 'Perde bağlantısı veya halı kalınlığı geçersiz.' })
const furnitureList = z.array(furnitureSchema).max(maxFurnitureItems)
const linkAxisSchema = z.union([
  z.object({ mode: z.enum(['center', 'start', 'end']) }),
  z.object({ mode: z.enum(['before', 'after']), gap: offset }),
])
const furnitureLinkSchema = z.object({
  id, referenceId: id, itemId: id, x: linkAxisSchema.optional(), z: linkAxisSchema.optional(),
}).refine(rule => rule.referenceId !== rule.itemId && Boolean(rule.x || rule.z))
export const maxFurnitureLinks = 120
const furnitureLinksSchema = z.array(furnitureLinkSchema).max(maxFurnitureLinks)
export const maxMountSymmetries = 12
const mountSymmetrySchema = z.object({
  id, wallId: id, leftId: id, rightId: id, referenceId: z.string().max(100), distance: dimension,
}).refine(rule => rule.leftId !== rule.rightId && rule.referenceId !== rule.leftId && rule.referenceId !== rule.rightId)
const mountSymmetriesSchema = z.array(mountSymmetrySchema).max(maxMountSymmetries).refine(rules => {
  const moved = new Set(rules.flatMap(rule => [rule.leftId, rule.rightId]))
  return moved.size === rules.length * 2 && new Set(rules.map(rule => rule.id)).size === rules.length
    && rules.every(rule => !moved.has(rule.referenceId))
}, { message: 'Bir eşya tek bir simetri kuralında hareket edebilir. Hareket eden eşya referans olarak kullanılamaz.' })
export const maxLayouts = 8
const keepClearRuleSchema = z.object({
  owner: z.enum(['item', 'run']), ownerId: id, side: z.enum(['front', 'right', 'back', 'left']), distance: dimension,
}).refine(rule => rule.owner !== 'run' || rule.side === 'front')
const keepClearRulesSchema = z.array(keepClearRuleSchema).max(maxFurnitureItems * 4).refine(rules =>
  new Set(rules.map(rule => JSON.stringify([rule.owner, rule.ownerId, rule.side]))).size === rules.length)
export type KeepClearRule = z.infer<typeof keepClearRuleSchema>
const upperRowSchema = z.object({
  id, wallId: id, members: z.array(id).min(2).max(maxFurnitureItems), gap: offset, bottom: offset,
  alignment: z.enum(['left', 'right', 'bed']), anchor: mountCenter, bedId: id.optional(),
}).refine(row => row.alignment !== 'bed' || !!row.bedId)
const upperRowsSchema = z.array(upperRowSchema).max(Math.floor(maxFurnitureItems / 2)).refine(rows => {
  const members = rows.flatMap(row => row.members)
  return new Set(rows.map(row => row.id)).size === rows.length && new Set(members).size === members.length
})
export type UpperCabinetRow = z.infer<typeof upperRowSchema>
const layoutSchema = z.object({
  active: id,
  entries: z.array(z.object({
    id, name: z.string().trim().min(1).max(100), items: furnitureList.optional(), furnitureLinks: furnitureLinksSchema.optional(),
    mountSymmetries: mountSymmetriesSchema.optional(), keepClear: keepClearRulesSchema.optional(), upperCabinetRows: upperRowsSchema.optional(),
  })).min(2).max(maxLayouts),
}).refine(({ active, entries }) => {
  const ids = new Set(entries.map(entry => entry.id))
  return ids.size === entries.length && ids.has(active) && entries.every(entry =>
    (entry.id === active) === (entry.items === undefined) &&
    (entry.id !== active || (entry.furnitureLinks === undefined && entry.mountSymmetries === undefined && entry.keepClear === undefined && entry.upperCabinetRows === undefined)))
}, { message: 'Etkin yerleşim ve kayıtlı eşya listeleri uyuşmuyor.' })
const passageSchema = z.object({
  origin: z.object({ x: coordinate, z: coordinate }), axis: z.enum(['x', 'z']),
  minimum: dimension, headroom: dimension,
})
const measurementHeader = { id, name: z.string().trim().min(1).max(100) }
const measurementSchema = z.discriminatedUnion('kind', [
  passageSchema.extend({ ...measurementHeader, kind: z.literal('passage') }),
  z.object({ ...measurementHeader, kind: z.literal('gap'), sourceId: id, targetId: id })
    .refine(entry => entry.sourceId !== entry.targetId, { message: 'İki farklı eşya seçin.' }),
  z.object({ ...measurementHeader, kind: z.literal('height'), sourceId: id, obstacleId: id.optional() }),
])
export const maxMeasurements = 30
export const maxUsageScenarios = 12
export const maxUsageRoutePoints = 18
export const maxUsageStates = 24
const usageScenarioSchema = z.object({
  ...measurementHeader,
  points: z.array(z.object({ x: coordinate, z: coordinate })).max(maxUsageRoutePoints)
    .refine(points => points.every((point, index) => !index || Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z) >= 10)),
  minimum: dimension, headroom: dimension,
  layouts: z.tuple([id, id]).refine(([a, b]) => a !== b).optional(),
  states: z.array(z.object({ itemId: id, partId: id, amount: z.number().min(0).max(3000) })).max(maxUsageStates)
    .refine(states => new Set(states.map(row => JSON.stringify([row.itemId, row.partId]))).size === states.length),
})
export const maxSections = 12
export const maxWallRegions = 8
const wallRegionSchema = z.object({
  id, start: offset, bottom: offset, width: dimension, height: dimension, appearance: appearanceSchema,
})
const wallCoveringSchema = z.object({
  base: appearanceSchema.optional(),
  regions: z.array(wallRegionSchema).max(maxWallRegions)
    .refine(regions => new Set(regions.map(region => region.id)).size === regions.length),
})
const sketchSchema = z.string().max(14_000_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
const sketchPoint = z.object({ x: z.number().min(-2000).max(2000), z: z.number().min(-2000).max(2000) })
const sketchRuler = z.object({ from: sketchPoint, to: sketchPoint, mm: dimension })
  .refine(({ from, to }) => Math.hypot(from.x - to.x, from.z - to.z) >= 4)
const sketchReferenceSchema = z.object({
  opacity: z.number().min(0).max(1), rotation: z.number().min(-180).max(180),
  calibration: sketchRuler.optional(), verification: sketchRuler.optional(), origin: sketchPoint.optional(),
})
const roomSurfaceSchema = z.object({
  floor: color, wall: color,
  floorFinish: z.enum(finishes).optional(), wallFinish: z.enum(finishes).optional(),
  floorTexture: textureSchema.optional(), wallTexture: textureSchema.optional(),
  surfaceRelief: z.number().min(0).max(2).optional(), colorSaturation: z.number().min(.7).max(1.6).optional(),
  wallCoverings: z.record(id, wallCoveringSchema).refine(value => Object.keys(value).length <= 60).optional(),
})
const designItemSchema = z.object({
  id, color, material: furnitureMaterialSchema.optional(), appearances: appearanceSlotsSchema.optional(),
})
export const maxDesigns = 8
export const maxRenderScenes = 12
export const sunStudySchema = z.object({
  north: z.number().min(0).lt(360), azimuth: z.number().min(0).lt(360), elevation: z.number().min(1).max(90),
})
const ambienceSchema = z.object({
  windowStrength: z.number().min(0).max(3).optional(),
  windowSize: z.number().min(.25).max(2).optional(),
  windowTemperature: z.number().int().min(1800).max(9000).optional(),
  exposure: z.number().min(-4).max(4).optional(),
  whiteBalance: z.number().int().min(2500).max(10000).optional(),
  fixtures: z.record(id, z.object({
    on: z.boolean().optional(), power: z.number().min(1).max(250).optional(),
    temperature: z.number().int().min(1800).max(6500).optional(),
    diameter: z.number().min(10).max(2000).optional(),
  })).refine(values => Object.keys(values).length <= 300 * maxLayouts).optional(),
})
const renderDetailSchema = z.object({
  corridor: z.object({ wallId: id, openingId: id, depth: z.number().int().min(500).max(4000),
    color, power: z.number().min(0).max(150) }).optional(),
  exterior: z.object({ brightness: z.number().min(0).max(3) }).optional(),
  detailedBedding: z.boolean().optional(),
})
const renderSceneSchema = z.object({
  id, name: z.string().trim().min(1).max(100), layoutId: id.optional(), designId: id.optional(), cameraId: id,
  light: z.enum(['day', 'warm', 'evening']),
  ambience: ambienceSchema.optional(),
  renderDetail: renderDetailSchema.optional(),
  lighting: z.object({ lightStrength: z.number().min(0).max(3), lights: z.array(roomLightSchema).max(8) }).optional(),
  sun: sunStudySchema.nullable().optional(),
  fixtures: z.array(z.object({ id, name: z.string().trim().min(1).max(100), on: z.boolean() })).max(300)
    .refine(fixtures => new Set(fixtures.map(fixture => fixture.id)).size === fixtures.length),
})
const designsSchema = z.object({
  active: id.optional(),
  entries: z.array(z.object({
    id, name: z.string().trim().min(1).max(100), surface: roomSurfaceSchema,
    items: z.array(designItemSchema).max(300 * maxLayouts)
      .refine(items => new Set(items.map(item => item.id)).size === items.length),
  })).min(1).max(maxDesigns),
}).refine(({ active, entries }) => {
  const ids = new Set(entries.map(entry => entry.id))
  return ids.size === entries.length && (active === undefined || ids.has(active))
}, { message: 'Tasarım seçenekleri veya etkin tasarım geçersiz.' })

export const projectSchema = z.object({
  version: z.literal(1), title: z.string().trim().min(1).max(100), height: dimension,
  thickness: dimension, walls: z.array(wallSchema).min(4).max(60),
  items: furnitureList, layouts: layoutSchema.optional(), designs: designsSchema.optional(), sketch: sketchSchema.optional(),
  furnitureLinks: furnitureLinksSchema.optional(),
  keepClear: keepClearRulesSchema.optional(),
  upperCabinetRows: upperRowsSchema.optional(),
  mountSymmetries: mountSymmetriesSchema.optional(),
  sketchReference: sketchReferenceSchema.optional(),
  style: roomSurfaceSchema.extend({
    light: z.enum(['day', 'warm', 'evening']),
    ambiences: z.partialRecord(z.enum(['day', 'warm', 'evening']), ambienceSchema).optional(),
    renderDetail: renderDetailSchema.optional(),
    sun: sunStudySchema.optional(),
    lightStrength: z.number().min(0).max(3).optional(), lights: z.array(roomLightSchema).max(8).optional(),
    eveningLighting: z.object({
      lightStrength: z.number().min(0).max(3).optional(), lights: z.array(roomLightSchema).max(8).optional(),
    }).optional(),
  }),
  camera: cameraSchema.optional(),
  cameraViews: z.array(z.object({ id, name: z.string().trim().min(1).max(100), camera: cameraSchema })).max(12).optional(),
  renderScenes: z.array(renderSceneSchema).max(maxRenderScenes)
    .refine(scenes => new Set(scenes.map(scene => scene.id)).size === scenes.length).optional(),
  passage: passageSchema.optional(),
  sections: z.array(z.object({ ...measurementHeader, axis: z.enum(['x', 'z']), offset: coordinate })).max(maxSections)
    .refine(list => new Set(list.map(section => section.id)).size === list.length).optional(),
  measurements: z.array(measurementSchema).max(maxMeasurements)
    .refine(list => new Set(list.map(measurement => measurement.id)).size === list.length).optional(),
  usageScenarios: z.array(usageScenarioSchema).max(maxUsageScenarios)
    .refine(list => new Set(list.map(scenario => scenario.id)).size === list.length).optional(),
})

export type Project = z.infer<typeof projectSchema>
export type SketchReference = z.infer<typeof sketchReferenceSchema>
export type SketchRuler = z.infer<typeof sketchRuler>
export type RenderScene = z.infer<typeof renderSceneSchema>
export type RenderDetail = z.infer<typeof renderDetailSchema>
export type Ambience = z.infer<typeof ambienceSchema>
export type SunStudy = z.infer<typeof sunStudySchema>
export type Wall = z.infer<typeof wallSchema>
export type ElectricalPoint = z.infer<typeof electricalPointSchema>
export type MountSymmetryRule = z.infer<typeof mountSymmetrySchema>
export type WallSurvey = NonNullable<Wall['survey']>
export type Opening = z.infer<typeof openingSchema>
export type WindowSill = NonNullable<Opening['sill']>
export type WindowTrim = z.infer<typeof windowTrimSchema>
export type Baseboard = z.infer<typeof baseboardSchema>
export type Obstacle = z.infer<typeof obstacleSchema>
export type Furniture = z.infer<typeof furnitureSchema>
export type FurnitureLink = z.infer<typeof furnitureLinkSchema>
export type LinkAxis = z.infer<typeof linkAxisSchema>
export type FurnitureMaterial = z.infer<typeof furnitureMaterialSchema>
export type Appearance = z.infer<typeof appearanceSchema>
export type Wardrobe = z.infer<typeof wardrobeSchema>
export type WardrobeStack = z.infer<typeof wardrobeStackSchema>
export type WardrobeFillArea = z.infer<typeof wardrobeFillAreaSchema>
export type TransportPath = z.infer<typeof transportPathSchema>
export type DoorLeaf = z.infer<typeof leafSchema>
export type WallMount = z.infer<typeof mountSchema>
export type Fixture = z.infer<typeof fixtureSchema>
export type ModelReference = z.infer<typeof modelReference>
export type SurfaceTexture = z.infer<typeof textureSchema>
export type RoomLight = z.infer<typeof roomLightSchema>
export type CameraView = NonNullable<Project['cameraViews']>[number]
export type Presentation = Pick<Project, 'style' | 'camera' | 'cameraViews'>
export type RoomSurface = z.infer<typeof roomSurfaceSchema>
export type WallRegion = z.infer<typeof wallRegionSchema>
export type WallCovering = z.infer<typeof wallCoveringSchema>
export type DesignItem = z.infer<typeof designItemSchema>
export type Passage = NonNullable<Project['passage']>
export type Measurement = z.infer<typeof measurementSchema>
export type UsageScenario = z.infer<typeof usageScenarioSchema>
export type RoomSection = NonNullable<Project['sections']>[number]
export type LayoutEntry = NonNullable<Project['layouts']>['entries'][number]
export type Direction = Wall['dir']
export type Point = { x: number; z: number }
export type View = 'plan' | 'scene' | 'split' | 'elevation' | 'section'

export function projectItemLists(project: Project): Furniture[][] {
  return [project.items, ...(project.layouts?.entries.flatMap(entry => entry.items ? [entry.items] : []) ?? [])]
}

export function appearanceTextures(appearance?: Appearance | null): SurfaceTexture[] {
  return [appearance?.texture, appearance?.roughnessMap, appearance?.normalMap]
    .filter((texture): texture is SurfaceTexture => Boolean(texture))
}

export function projectTextures(project: Project): SurfaceTexture[] {
  const surfaces = [project.style, ...(project.designs?.entries.map(entry => entry.surface) ?? [])]
  const items = [...projectItemLists(project).flat(), ...(project.designs?.entries.flatMap(entry => entry.items) ?? [])]
  return [
    ...surfaces.flatMap(({ floorTexture, wallTexture }) => [floorTexture, wallTexture]),
    ...surfaces.flatMap(surface => Object.values(surface.wallCoverings ?? {}).flatMap(covering =>
      [covering.base, ...covering.regions.map(region => region.appearance)].flatMap(appearanceTextures))),
    ...items.flatMap(item => Object.values(item.appearances ?? {}).flatMap(appearanceTextures)),
    ...project.walls.flatMap(wall => [wall.baseboard?.appearance, ...wall.openings.flatMap(opening =>
      [opening.trim?.appearance, opening.sill?.appearance])].flatMap(appearanceTextures)),
  ].filter((texture): texture is SurfaceTexture => Boolean(texture))
}

export const furnitureAngle = (item: Pick<Furniture, 'angle' | 'rotation'>) => item.angle ?? item.rotation * 90
export const normalizeAngle = (angle: number) => ((Math.round((angle % 360) * 10) + 3600) % 3600) / 10

export function makeWall(dir: Direction, length: number): Wall {
  return { id: uid(), dir, length, openings: [], obstacles: [] }
}

export const furnitureTypes = {
  sofa: { label: 'Koltuk', size: [2100, 920, 850], color: '#56776f' },
  bed: { label: 'Yatak', size: [1600, 2000, 950], color: '#7f8c81' },
  table: { label: 'Masa', size: [1200, 650, 740], color: '#a67856' },
  wardrobe: { label: 'Dolap', size: [1400, 580, 2200], color: '#b08b67' },
  box: { label: 'Özel ölçü', size: [600, 600, 600], color: '#a87363' },
  rug: { label: 'Dokuma halı', size: [1600, 2300, 12], color: '#9d8670' },
  curtain: { label: 'Perde', size: [1400, 55, 2100], color: '#ddd3bc' },
  'wall-cabinet': { label: 'Asma dolap', size: [800, 340, 580], color: '#b68f68' },
  sconce: { label: 'Küre aplik', size: [200, 205, 260], color: '#6d5948' },
  radiator: { label: 'Panel kalorifer peteği', size: [900, 112, 550], color: '#e6e3dc' },
  mirror: { label: 'Duvar aynası', size: [650, 34, 740], color: '#694c37' },
  pendant: { label: 'Konik sarkıt', size: [340, 340, 540], color: '#605042' },
} as const

export function makeFurniture(kind: keyof typeof furnitureTypes, point: Point): Furniture {
  const type = furnitureTypes[kind]
  const [width, depth, height] = type.size
  return { id: uid(), name: type.label, kind, width, depth, height, ...point, rotation: 0, color: type.color }
}

export function makeWideBed(point: Point): Furniture {
  return { ...makeFurniture('bed', point), name: 'Çift kişilik yatak · 180 cm', width: 1800 }
}

export function makeMountedFurniture(kind: MountedKind, wallId: string, along: number, roomHeight: number, bar = false): Furniture {
  const item = makeFurniture(kind, { x: 0, z: 0 })
  const defaultHeight = { 'wall-cabinet': 1500, sconce: 1550, radiator: 120, mirror: 1200 }
  if (kind === 'sconce') {
    item.fixture = { variant: bar ? 'bar' : 'globe', on: true, power: 34, color: '#ffdfae' }
    if (bar) Object.assign(item, { name: 'Yatay aplik', width: 420, height: 130, depth: 135 })
  }
  return { ...item, mount: { wallId, offset: Math.max(0, Math.round(along)),
    bottom: Math.max(0, Math.min(defaultHeight[kind], roomHeight - item.height)) } }
}

export function makePendant(point: Point, roomHeight: number): Furniture {
  const item = makeFurniture('pendant', point)
  return { ...item, height: Math.min(item.height, roomHeight),
    fixture: { variant: 'pendant', on: true, power: 48, temperature: 3000 } }
}

export function makeCurtain(wall: Wall, window: Opening, fabric: 'sheer' | 'opaque', roomHeight: number): Furniture {
  const item = makeFurniture('curtain', { x: 0, z: 0 })
  const bottom = Math.min(20, window.bottom)
  return { ...item, name: fabric === 'sheer' ? 'Tül perde' : 'Kalın perde',
    color: fabric === 'sheer' ? '#eee6d6' : '#a18a71',
    width: Math.min(wall.length, window.width + 300),
    height: Math.max(1, Math.min(roomHeight, window.bottom + window.height + 150) - bottom),
    mount: { wallId: wall.id, offset: Math.round(window.offset + window.width / 2), bottom },
    curtain: { windowId: window.id, fabric, open: 0, setback: 150 } }
}

export const wardrobeDoorCounts = [1, 2, 3, 4, 5] as const
export const defaultWardrobe: Wardrobe = { doors: 2, front: 'solid', pose: 'closed' }
export function makeWardrobe(doors: typeof wardrobeDoorCounts[number], point: Point): Furniture {
  return { ...makeFurniture('wardrobe', point), name: `${doors} kapılı gardırop`,
    width: doors * 500, depth: 600, height: 2000, wardrobe: { ...defaultWardrobe, doors } }
}

export function makeSlidingWardrobe(point: Point): Furniture {
  const item = makeWardrobe(2, point)
  return { ...item, name: 'Sürgülü gardırop', wardrobe: { ...item.wardrobe!, motion: 'sliding' } }
}

export const wardrobeStackCatalog = {
  drawers: { name: 'Dıştan çekmeceli gardırop', width: 1000, depth: 600, lower: 700, middle: 380, drawers: 2 },
  niche: { name: 'Komodinli açık nişli gardırop', width: 900, depth: 500, lower: 550, middle: 550, drawers: undefined },
} as const

export function makeStackedWardrobe(type: WardrobeStack['type'], point: Point): Furniture {
  const { name, width, depth, lower, middle, drawers } = wardrobeStackCatalog[type]
  const item = makeWardrobe(2, point)
  const height = 2200
  return { ...item, name, width, depth, height,
    wardrobe: { ...defaultWardrobe, stack: { type, lower: lower / height, middle: middle / height, drawers } },
    appearances: type === 'drawers'
      ? { 'drawer-fronts': { preset: 'matte-lacquer', color: '#dacebb', roughness: .72 } }
      : { 'upper-doors': { preset: 'matte-lacquer', color: '#e7dfd0', roughness: .72 } },
  }
}

export function wardrobeZones(item: Pick<Furniture, 'height' | 'wardrobe'>) {
  const stack = item.wardrobe?.stack
  const lowerTop = stack ? item.height * stack.lower : item.height
  const upperBottom = stack ? lowerTop + item.height * stack.middle : item.height
  return { lowerTop, upperBottom, top: item.height }
}

export function makeProject(demo = true): Project {
  const walls = [makeWall(0, 4200), makeWall(1, 3400), makeWall(2, 4200), makeWall(3, 3400)]
  if (demo) {
    walls[0].openings.push({ id: uid(), kind: 'window', offset: 1050, width: 1740, bottom: 950, height: 1200 })
    walls[1].obstacles.push({ id: uid(), name: 'Tavan kirişi', offset: 150, width: 1400, depth: 550, bottom: 2250, top: 2650 })
    walls[2].openings.push({ id: uid(), kind: 'door', offset: 450, width: 870, bottom: 0, height: 2100 })
  }
  return {
    version: 1, title: demo ? 'Çalışma odası' : 'Yeni oda', height: 2650, thickness: 150, walls,
    items: demo ? [
      makeFurniture('sofa', { x: 1000, z: 1700 }),
      { ...makeFurniture('table', { x: 2330, z: 1710 }), name: 'Orta sehpa', width: 900, depth: 550, height: 430 },
      { ...makeFurniture('wardrobe', { x: 3900, z: 850 }), rotation: 1 as const },
    ].map((item, index): Furniture => index === 0 ? { ...item, rotation: 3 } : item) : [],
    style: { floor: '#c9a988', wall: '#f1e9dc', light: 'day', floorFinish: 'wood' },
  }
}
