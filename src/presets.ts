import type { GlassParams, Preset } from "./types"

export const DEFAULT_PARAMS: GlassParams = {
  blur: 18,
  refraction: 64,
  dispersion: 38,
  thickness: "medium",
  tint: 0,
}

export const BUILT_IN_PRESETS: Preset[] = [
  { id: "frosted", name: "Frosted", description: "Soft blur with natural refraction", params: DEFAULT_PARAMS },
  { id: "clear", name: "Clear", description: "High clarity with sharp refraction", params: { blur: 4, refraction: 82, dispersion: 52, thickness: "high", tint: 0 } },
  { id: "tinted", name: "Tinted", description: "Subtle color tint and depth", params: { blur: 14, refraction: 42, dispersion: 22, thickness: "medium", tint: 55 } },
  { id: "satin", name: "Satin", description: "Smooth blur with soft edges", params: { blur: 28, refraction: 26, dispersion: 10, thickness: "low", tint: 10 } },
]
