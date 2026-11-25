import type { Project } from './model'
import { buildWardrobeRun, wardrobeRunMembers } from './wardrobe-run'
import { searchBedSolutions } from './wardrobe-solutions'

self.onmessage = ({ data }: MessageEvent<{ scene: Project; runId: string; bedId: string }>) => {
  const modules = wardrobeRunMembers(data.scene, data.runId)
  const entry = modules[0]?.wardrobeRun
  const run = entry?.fill && buildWardrobeRun(data.scene, entry.id, entry.wallId, entry.fill.start, modules, entry.gap, entry.fill)
  if (!run) throw new Error('Dolap dizisi bulunamadı.')
  self.postMessage(searchBedSolutions(run, data.bedId))
}
