/** Detects WebGL support so we can fall back to CSS blur (wireframe state 1.6). */
export function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"))
  } catch {
    return false
  }
}
