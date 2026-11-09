import { framer } from "framer-plugin"
import componentSource from "./RefractGlass.tsx.txt?raw"
import type { GlassParams } from "./types"

const FILE_NAME = "RefractGlass.tsx"

async function ensureCodeFile() {
  const files = await framer.getCodeFiles()
  const existing = files.find(f => f.name === FILE_NAME)

  if (existing) {
    await existing.setFileContent(componentSource)
    return existing
  }

  return framer.createCodeFile(FILE_NAME, componentSource)
}

/** Exports the node as an image and returns a URL (or null if unsupported / failed). */
export async function exportNodeImage(nodeId: string): Promise<string | null> {
  try {
    const res: any = await (framer as any).exportImage({ nodeId, format: "png", scale: 1 })
    if (!res) return null
    if (typeof res === "string") return res
    if (typeof res.url === "string") return res.url
    if (res instanceof Blob) return URL.createObjectURL(res)
    const bytes = res.bytes ?? res.data
    if (bytes) return URL.createObjectURL(new Blob([bytes], { type: res.mimeType ?? "image/png" }))
  } catch (e) {
    console.warn("Refract: could not export selection preview", e)
  }
  return null
}

type Rect = { x: number; y: number; width: number; height: number }

/** Measures a node: node.getRect() first, then framer.getRect(id). */
async function measure(node: any): Promise<Rect | null> {
  try {
    const r = (await node.getRect?.()) ?? (await (framer as any).getRect?.(node.id))
    if (r && Number.isFinite(r.width) && Number.isFinite(r.height)) return r
  } catch (e) {
    console.warn("Refract: getRect failed", e)
  }
  return null
}

const LAYOUT_KEYS = ["left", "right", "top", "bottom", "centerX", "centerY", "width", "height"] as const

/** A usable absolute-layout length: 120, "120px" or "50%". Rejects "1fr", "auto", "fit-content"… */
const isLen = (v: unknown): boolean =>
  (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && /^-?\d+(\.\d+)?(px|%)$/.test(v.trim()))
const len = (v: unknown): string => (typeof v === "number" ? `${v}px` : String(v).trim())

/**
 * Fallback for nodes that can't be measured (e.g. Shader layers):
 * mirror the node's own layout attributes onto the glass layer.
 * `exact` is true only when the node is absolutely positioned and fully specified.
 */
function layoutFromAttributes(t: any): { layout: Record<string, unknown>; exact: boolean } {
  const layout: Record<string, unknown> = { position: "absolute" }
  for (const k of LAYOUT_KEYS) layout[k] = isLen(t[k]) ? len(t[k]) : null

  const hasX = layout.left !== null || layout.right !== null || layout.centerX !== null
  const hasY = layout.top !== null || layout.bottom !== null || layout.centerY !== null
  const hasW = layout.width !== null || (layout.left !== null && layout.right !== null)
  const hasH = layout.height !== null || (layout.top !== null && layout.bottom !== null)
  const exact = t.position === "absolute" && hasX && hasY && hasW && hasH

  if (!hasW) layout.width = "100%"
  if (!hasH) layout.height = "100%"
  if (!hasX) layout.left = "0px"
  if (!hasY) layout.top = "0px"
  return { layout, exact }
}

/**
 * Adds a Refract Glass layer that overlaps the selected element:
 *  - same parent (sibling in the same hierarchy)
 *  - position: absolute at the element's position, with the element's size
 * Returns a note when the result is approximate, otherwise null.
 */
export async function applyGlass(params: GlassParams, performance: boolean): Promise<string | null> {
  const selection = await framer.getSelection()
  if (selection.length === 0) throw new Error("Select an element on the canvas first.")

  const target: any = selection[0]
  const parent: any = await target.getParent?.()

  let layout: Record<string, unknown>
  let note: string | null = null

  const rect = await measure(target)
  if (rect) {
    // Geometry in the parent's coordinate space.
    const parentRect = parent ? await measure(parent) : null
    layout = {
      position: "absolute",
      left: `${rect.x - (parentRect?.x ?? 0)}px`,
      top: `${rect.y - (parentRect?.y ?? 0)}px`,
      right: null,
      bottom: null,
      centerX: null,
      centerY: null,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    }
  } else {
    const fb = layoutFromAttributes(target)
    layout = fb.layout
    if (!fb.exact) note = "Applied approximately: this element's size couldn't be measured. Adjust the layer if needed."
    console.warn("Refract: element not measurable, using its layout attributes", {
      type: target?.constructor?.name,
      ...Object.fromEntries(LAYOUT_KEYS.map(k => [k, target[k]])),
      position: target.position,
    })
  }
  if (typeof target.rotation === "number") layout.rotation = target.rotation

  const file = await ensureCodeFile()
  const exp =
    file.exports.find(e => e.type === "component" && e.isDefaultExport) ??
    file.exports.find(e => e.type === "component")
  if (!exp || exp.type !== "component") throw new Error("Could not find the Refract component export.")

  const br = parseFloat(String(target.borderRadius ?? ""))
  const controls = { ...params, performance, ...(Number.isFinite(br) ? { radius: br } : {}) }

  const instance: any = await framer.addComponentInstance({
    url: exp.insertURL,
    attributes: { controls, ...layout } as any,
    ...(parent ? { parentId: parent.id } : {}),
  } as any)

  if (parent) {
    const actualParent = await instance.getParent?.()
    if (actualParent?.id !== parent.id) await framer.setParent(instance.id, parent.id)
  }

  // Apply layout last (re-parenting can reset positioning).
  await instance.setAttributes(layout)
  await instance.select()
  return note
}