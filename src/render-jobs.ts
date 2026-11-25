import { z } from 'zod'
import { cameraSchema, sunStudySchema } from './model'
import type { Project } from './model'
import type { LocalRenderPreset } from './cycles-settings'

const label = z.string().trim().min(1).max(100)
export const renderContextSchema = z.object({ projectId: z.string().min(1).max(100).optional(), projectName: label,
  cameraLabel: label, layout: label.optional(), design: label.optional() })
export const renderMetadataSchema = renderContextSchema.extend({
  camera: cameraSchema, light: z.enum(['day', 'warm', 'evening']),
  layoutCode: z.string().regex(/^[0-9A-F]{12}$/).optional(),
  sun: sunStudySchema.optional(),
  fixtures: z.array(z.object({ name: label, on: z.boolean() })).max(300),
})
export const renderJobInput = z.object({
  id: z.uuid(), preset: z.enum(['4k', 'preview', 'panorama']), project: z.unknown(),
  context: renderContextSchema,
})
export type RenderContext = z.infer<typeof renderContextSchema>
export type RenderJobSpec = { id?: string; project: Project; context: RenderContext }
export type RenderMetadata = z.infer<typeof renderMetadataSchema>
export type SceneJob = {
  id: string; name: string; preset: LocalRenderPreset | 'png'; order: number
  state: 'queued' | 'rendering' | 'succeeded' | 'failed'; error?: string
  metadata?: RenderMetadata; browser?: boolean; archived?: boolean; projectId?: string; hasSnapshot?: boolean
}

export const renderOutputLabels: Record<SceneJob['preset'], string> = {
  '4k': '4K PNG', preview: 'Cycles önizleme', panorama: '360° panorama', png: 'PNG',
}
