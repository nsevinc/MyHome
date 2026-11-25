import { z } from 'zod'
import { defaultWardrobeGap, furnitureSchema, maxWardrobeGap, uid } from './model'
import type { Furniture } from './model'
import { idbResult, workspaceDatabase, writeWorkspace } from './workspace-db'
import { maxWardrobeModules } from './wardrobe-run'

const prefix = 'wardrobe-template:'
const schema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(100), updated: z.number().int(),
  gap: z.number().int().min(0).max(maxWardrobeGap).default(defaultWardrobeGap),
  modules: z.array(furnitureSchema).min(1).max(maxWardrobeModules) })
  .refine(record => record.modules.every(item => item.kind === 'wardrobe'))
export type WardrobeTemplate = z.infer<typeof schema>

function cleanModule(item: Furniture): Furniture {
  return { ...item, id: uid(), x: 0, z: 0, rotation: 0, angle: undefined, locked: undefined, wardrobeRun: undefined,
    assembly: item.assembly && { allowance: item.assembly.allowance } }
}

export function makeWardrobeTemplate(name: string, modules: Furniture[], gap = defaultWardrobeGap) {
  return schema.parse({ id: uid(), name, gap, updated: Date.now(), modules: modules.map(cleanModule) })
}

export function loadWardrobeTemplate(template: WardrobeTemplate) {
  return template.modules.map(cleanModule)
}

export async function wardrobeTemplates() {
  const db = await workspaceDatabase()
  const entries = await idbResult(db.transaction('projects').objectStore('projects')
    .getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`)))
  return entries.flatMap(entry => {
    const parsed = schema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  }).sort((a, b) => b.updated - a.updated)
}

export async function saveWardrobeTemplate(template: WardrobeTemplate) {
  await writeWorkspace(['projects'], tx => tx.objectStore('projects').put(template, `${prefix}${template.id}`))
}
