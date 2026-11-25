import { footprintCorners } from './geometry'
import type { WallEdge } from './geometry'
import { furnitureAngle } from './model'
import type { Project } from './model'

export const surveyLevels = [
  { key: 'floor', label: 'Zemine yakın' },
  { key: 'middle', label: 'Orta kot' },
  { key: 'upper', label: 'Tavana yakın' },
] as const

export function surveyWardrobes(project: Project, edge: WallEdge) {
  return project.items.flatMap(item => {
    if (item.kind !== 'wardrobe') return []
    const corners = footprintCorners(item).map(p => {
      const x = p.x - edge.a.x, z = p.z - edge.a.z
      return { along: x * edge.dx + z * edge.dz, inset: x * edge.nx + z * edge.nz }
    })
    const start = Math.min(...corners.map(p => p.along)), end = Math.max(...corners.map(p => p.along))
    const angle = furnitureAngle(item) * Math.PI / 180
    const frontsRoom = -Math.sin(angle) * edge.nx + Math.cos(angle) * edge.nz > .99
    const belongs = item.wardrobeRun ? item.wardrobeRun.wallId === edge.wall.id
      : frontsRoom && start < edge.wall.length && end > 0 && Math.abs(Math.min(...corners.map(p => p.inset))) <= 50
    return belongs ? [{ item, start, end }] : []
  })
}

export function wallSurvey(project: Project, edge: WallEdge) {
  const survey = edge.wall.survey
  if (!survey) return
  const rows = surveyLevels.map(level => ({ ...level, width: survey[level.key] }))
  const widths = rows.flatMap(row => row.width === undefined ? [] : [row.width])
  if (widths.length < surveyLevels.length) return { rows, survey, result: undefined }
  const narrowest = Math.min(...widths), spread = Math.max(...widths) - narrowest
  const usable = Math.max(0, narrowest - survey.allowance * 2)
  const left = survey.allowance, right = left + usable
  const modules = surveyWardrobes(project, edge).map(({ item, start, end }) => {
    const deficit = usable > 0 ? Math.max(0, Math.ceil(Math.max(left - start, end - right) - 1e-6)) : Math.ceil(end - start)
    return { item, deficit }
  })
  return { rows, survey, result: { narrowest, spread, usable, left, right, modules } }
}
