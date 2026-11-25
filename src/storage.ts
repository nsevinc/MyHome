import { validateModel } from './catalog'
import { validateProject } from './geometry'
import { projectItemLists, projectSchema, projectTextures } from './model'
import type { Project } from './model'
import { textureBytes } from './materials'

export function readProject(raw: unknown) {
  const project = projectSchema.parse(raw)
  const error = validateProject(project)
  if (error) throw new Error(error)
  for (const item of projectItemLists(project).flat()) if (item.model) validateModel(item.model)
  for (const data of new Set(projectTextures(project).map(texture => texture.data))) textureBytes(data)
  return project
}

export function projectFilename(title: string) {
  return title.trim().replace(/[<>:"/\\|?*]/g, '-').slice(0, 75) || 'MyHome'
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
