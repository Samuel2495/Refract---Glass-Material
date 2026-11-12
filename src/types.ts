
export type Thickness = "low" | "medium" | "high"

export interface GlassParams {
  blur: number
  refraction: number
  dispersion: number
  irregularity: number
  thickness: Thickness
  tint: number
}

export interface Preset {
  id: string
  name: string
  description: string
  params: GlassParams
  custom?: boolean
}
