import { findPlacements } from './placement-search'
import type { PlacementOptions } from './placement-search'
import type { Project } from './model'

self.onmessage = (event: MessageEvent<{ scene: Project; ids: string[]; options: PlacementOptions }>) => {
  const { scene, ids, options } = event.data
  self.postMessage(findPlacements(scene, ids, options))
}
