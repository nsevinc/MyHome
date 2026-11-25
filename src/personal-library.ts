import { appearanceTextures, furnitureSchema, uid } from './model'
import type { Furniture, ModelReference, Point } from './model'
import { validateModel } from './catalog'
import { textureBytes } from './materials'
import { idbResult, workspaceDatabase, writeWorkspace } from './workspace-db'

export type PersonalModel = Pick<Furniture, 'id' | 'name' | 'width' | 'depth' | 'height' | 'rotation' | 'angle' | 'color' | 'appearances'>
  & { model: ModelReference }

export function personalModelFrom(item: Furniture): PersonalModel | undefined {
  if (item.kind !== 'model' || !item.model) return
  const { name, width, depth, height, rotation, angle, color, appearances, model } = item
  return { id: uid(), name, width, depth, height, rotation, angle, color, appearances, model }
}

export function makePersonalFurniture(entry: PersonalModel, point: Point): Furniture {
  return { ...entry, ...point, id: uid(), kind: 'model' }
}

export async function readPersonalModels(): Promise<PersonalModel[]> {
  const db = await workspaceDatabase()
  return idbResult(db.transaction('models').objectStore('models').getAll())
}

export async function editPersonalModels(change: (models: IDBObjectStore) => void) {
  await writeWorkspace(['models'], tx => change(tx.objectStore('models')))
}

export function readPersonalModel(raw: unknown): PersonalModel {
  const row = furnitureSchema.parse({ ...(raw as Record<string, unknown>), kind: 'model', x: 0, z: 0 })
  validateModel(row.model!)
  for (const texture of Object.values(row.appearances ?? {}).flatMap(appearanceTextures)) textureBytes(texture.data)
  return { ...personalModelFrom(row)!, id: row.id }
}
