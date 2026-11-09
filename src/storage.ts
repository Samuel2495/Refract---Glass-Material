import { framer } from "framer-plugin"
import type { Preset } from "./types"

// Custom presets live in the current Framer file only (no account, no network).
const KEY = "refract.customPresets.v1"

export async function loadCustomPresets(): Promise<Preset[]> {
  try {
    const raw = await framer.getPluginData(KEY)
    return raw ? (JSON.parse(raw) as Preset[]) : []
  } catch {
    return []
  }
}

export async function saveCustomPresets(presets: Preset[]): Promise<void> {
  await framer.setPluginData(KEY, JSON.stringify(presets))
}
