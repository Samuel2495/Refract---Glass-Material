
import type { GlassParams, Preset, Thickness } from "./types"

export const DEFAULT_PARAMS: GlassParams = {
  blur: 35,
  refraction: 64,
  dispersion: 38,
  irregularity: 35,
  thickness: "medium",
  tint: 0,
}

export function normalizeParams(
  params: Partial<GlassParams>
): GlassParams {
  const clamp = (
    value: number,
    min: number,
    max: number,
    fallback: number
  ) =>
    Math.min(
      max,
      Math.max(min, Number.isFinite(value) ? value : fallback)
    )

  const validThickness: Thickness =
    params.thickness === "low" ||
    params.thickness === "medium" ||
    params.thickness === "high"
      ? params.thickness
      : DEFAULT_PARAMS.thickness

  return {
    blur: Math.round(
      clamp(params.blur ?? DEFAULT_PARAMS.blur, 0, 100, DEFAULT_PARAMS.blur)
    ),

    refraction: Math.round(
      clamp(params.refraction ?? DEFAULT_PARAMS.refraction, 0, 100, DEFAULT_PARAMS.refraction)
    ),

    dispersion: Math.round(
      clamp(params.dispersion ?? DEFAULT_PARAMS.dispersion, 0, 100, DEFAULT_PARAMS.dispersion)
    ),

    irregularity: Math.round(
      clamp(params.irregularity ?? DEFAULT_PARAMS.irregularity, 0, 100, DEFAULT_PARAMS.irregularity)
    ),

    thickness: validThickness,

    tint: Math.round(
      clamp(params.tint ?? DEFAULT_PARAMS.tint, 0, 100, DEFAULT_PARAMS.tint)
    ),
  }
}

const PRESETS: Preset[] = [
  {
    id: "frosted",
    name: "Frosted",
    description: "Rough, misty glass with a subtle icy texture",
    params: {
      blur: 85,
      refraction: 12,
      dispersion: 5,
      irregularity: 38,
      thickness: "medium",
      tint: 4,
    },
  },
  {
    id: "clear",
    name: "Clear Glass",
    description: "Crystal clarity with subtle optical distortion",
    params: {
      blur: 5,
      refraction: 25,
      dispersion: 5,
      irregularity: 5,
      thickness: "low",
      tint: 0,
    },
  },
  {
    id: "soft",
    name: "Soft Glass",
    description: "Gentle diffusion with soft colour separation",
    params: {
      blur: 35,
      refraction: 35,
      dispersion: 18,
      irregularity: 20,
      thickness: "medium",
      tint: 8,
    },
  },
  {
    id: "liquid",
    name: "Liquid",
    description: "Flowing distortion with strong refraction",
    params: {
      blur: 12,
      refraction: 95,
      dispersion: 40,
      irregularity: 65,
      thickness: "high",
      tint: 4,
    },
  },
  {
    id: "prism",
    name: "Prism",
    description: "Intense chromatic separation and optical distortion",
    params: {
      blur: 8,
      refraction: 75,
      dispersion: 100,
      irregularity: 45,
      thickness: "high",
      tint: 10,
    },
  },
  {
    id: "ice",
    name: "Ice",
    description: "Polished ice with irregular internal refraction",
    params: {
      blur: 8,
      refraction: 90,
      dispersion: 22,
      irregularity: 90,
      thickness: "high",
      tint: 5,
    },
  },
]

export const BUILT_IN_PRESETS: Preset[] = PRESETS.map((preset) => ({
  ...preset,
  params: normalizeParams(preset.params),
}))
