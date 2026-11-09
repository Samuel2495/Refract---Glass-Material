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

/** Measures a node: node.getRect() first, then framer.getRect(id) as a fallback. */
async function measure(node: any): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    const r = (await node.getRect?.()) ?? (await (framer as any).getRect?.(node.id))
    if (r && Number.isFinite(r.width) && Number.isFinite(r.height)) return r
  } catch (e) {
    console.warn("Refract: getRect failed", e)
  }
  return null
}

/** Parses "120px" / 120 into a number. Returns null for "1fr", "100%", "auto", null, etc. */
function px(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string" && /^-?\d+(\.\d+)?px$/.test(v.trim())) return parseFloat(v)
  return null
}

/**
 * Adds a Refract Glass layer that overlaps the selected element:
 *  - same parent (sibling in the same hierarchy, e.g. inside Desktop)
 *  - position: absolute, at the element's exact position
 *  - same width / height (and rotation / corner radius when available)
 */
export async function applyGlass(params: GlassParams, performance: boolean): Promise<void> {
  const selection = await framer.getSelection()
  if (selection.length === 0) throw new Error("Select an element on the canvas first.")

  const target: any = selection[0]

  // 1. Parent: the glass must live in the same hierarchy as the selected element.
  const parent: any = await target.getParent?.()

  // 2. Geometry in the PARENT's coordinate space (absolute left/top are relative to the parent).
  const rect = await measure(target)
  let left: number | null
  let top: number | null
  let width: number | null
  let height: number | null

  if (rect) {
    const parentRect = parent ? await measure(parent) : null
    left = rect.x - (parentRect?.x ?? 0)
    top = rect.y - (parentRect?.y ?? 0)
    width = rect.width
    height = rect.height
  } else {
    // Fallback: read pixel values straight from the element's own attributes.
    left = px(target.left)
    top = px(target.top)
    width = px(target.width)
    height = px(target.height)
  }

  if (left === null || top === null || width === null || height === null) {
    throw new Error(
      "Could not read the selected element's size and position. Select a visible element on the open page and try again."
    )
  }

  // 3. Make sure the component file exists.
  const file = await ensureCodeFile()
  const exp =
    file.exports.find(e => e.type === "component" && e.isDefaultExport) ??
    file.exports.find(e => e.type === "component")
  if (!exp || exp.type !== "component") throw new Error("Could not find the Refract component export.")

  // Match the element's corner radius (e.g. "16px" or 16) and rotation when present.
  const br = parseFloat(String(target.borderRadius ?? ""))
  const controls = { ...params, performance, ...(Number.isFinite(br) ? { radius: br } : {}) }

  const layout: Record<string, unknown> = {
    position: "absolute",
    left: `${left}px`,
    top: `${top}px`,
    right: null,
    bottom: null,
    width: `${width}px`,
    height: `${height}px`,
    ...(typeof target.rotation === "number" ? { rotation: target.rotation } : {}),
  }

  // 4. Insert directly into the target's parent.
  const instance: any = await framer.addComponentInstance({
    url: exp.insertURL,
    attributes: { controls, ...layout } as any,
    ...(parent ? { parentId: parent.id } : {}),
  } as any)

  // 5. If the insert didn't land in the right parent, move it there.
  if (parent) {
    const actualParent = await instance.getParent?.()
    if (actualParent?.id !== parent.id) {
      await framer.setParent(instance.id, parent.id)
    }
  }

  // 6. Apply the layout last (re-parenting can reset positioning).
  await instance.setAttributes(layout)

  console.log("Refract: target", target.id, "→ glass", instance.id, "| parent", parent?.id ?? "(none)", "| rect", { left, top, width, height })

  await instance.select()
}