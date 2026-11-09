export type Thickness = "low" | "medium" | "high"

export interface GlassParams {
  blur: number // 0 - 40 (px)
  refraction: number // 0 - 100 (%)
  dispersion: number // 0 - 100 (%)
  thickness: Thickness
  tint: number // 0 - 100 (%)
}

export interface Preset {
  id: string
  name: string
  description: string
  params: GlassParams
  custom?: boolean
}
