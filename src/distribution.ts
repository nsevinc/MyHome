// Static builds work entirely in the browser. The local server accompanies these two targets.
export const localCyclesAvailable = import.meta.env?.DEV === true || import.meta.env?.MODE === 'portable'
export const windowsReleaseUrl = import.meta.env?.VITE_MYHOME_RELEASE_URL || './windows.html'
