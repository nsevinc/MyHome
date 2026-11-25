export const cycles4k = { width: 3840, height: 2160, samples: 192 } as const
export const cyclesPreview = { width: 960, height: 540, samples: 32 } as const
export const cyclesPanorama = { width: 3840, height: 1920, samples: 128, projection: 'equirectangular' } as const
export const renderPresets = {
  standard: { width: 1920, height: 1080, samples: 96 },
  '4k': cycles4k,
  preview: cyclesPreview,
} as const
export const renderDevices = ['CPU', 'CUDA', 'OPTIX', 'HIP', 'ONEAPI', 'METAL'] as const
export type RenderDevice = typeof renderDevices[number]
export type RenderPreset = keyof typeof renderPresets
export type StudioRenderPreset = Exclude<RenderPreset, 'standard'>
export type LocalRenderPreset = StudioRenderPreset | 'panorama'
export const localCyclesPath = '/__myhome/cycles'
export const localRenderJobsPath = localCyclesPath + '/jobs'
