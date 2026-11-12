import { framer } from "framer-plugin"
import componentSource from "./RefractGlass.tsx.txt?raw"
import type { GlassParams } from "./types"

const FILE_NAME = "RefractGlass.tsx"

function requirePermission(
  method: Parameters<typeof framer.isAllowedTo>[0],
  action: string
) {
  if (!framer.isAllowedTo(method)) {
    throw new Error(
      `You don't have permission to ${action}.`
    )
  }
}

async function ensureCodeFile() {
  const files = await framer.getCodeFiles()
  const existing = files.find(f => f.name === FILE_NAME)

  if (existing) {
    requirePermission(
      "CodeFile.setFileContent",
      "update the Refract code component"
    )

    await existing.setFileContent(componentSource)
    return existing
  }

  requirePermission(
    "createCodeFile",
    "create the Refract code component"
  )

  return framer.createCodeFile(FILE_NAME, componentSource)
}

function bytesToUrl(bytes: any, mime?: string): string {
  return URL.createObjectURL(new Blob([bytes], { type: mime || "image/png" }))
}

/** Normalises whatever exportImage returns (URL string, {url}, Blob, {bytes|data}) to a URL. */
function exportResultToUrl(res: any): string | null {
  if (!res) return null
  if (typeof res === "string") return res
  if (typeof res.url === "string") return res.url
  if (res instanceof Blob) return URL.createObjectURL(res)
  const bytes = res.bytes ?? res.data
  return bytes ? bytesToUrl(bytes, res.mimeType) : null
}

/** Grabs one frame of a video as an image URL (null if blocked by CORS / timeout). */
function videoFrameUrl(src: string): Promise<string | null> {
  return new Promise(resolve => {
    const v = document.createElement("video")
    let finished = false
    const done = (u: string | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(u)
    }
    const timer = setTimeout(() => done(null), 6000)
    v.crossOrigin = "anonymous"
    v.muted = true
    v.preload = "auto"
    v.onloadeddata = () => {
      try {
        const k = Math.min(1, 1024 / (v.videoWidth || 1024))
        const c = document.createElement("canvas")
        c.width = Math.max(1, Math.round(v.videoWidth * k))
        c.height = Math.max(1, Math.round(v.videoHeight * k))
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height)
        c.toBlob(b => done(b ? URL.createObjectURL(b) : null), "image/jpeg", 0.85)
      } catch {
        done(null)
      }
    }
    v.onerror = () => done(null)
    v.src = src
  })
}

/** A flat-colour image for frames that only have a background colour. */
function colorToUrl(color: unknown): string | null {
  const c = typeof color === "string" ? color : (color as any)?.light
  if (typeof c !== "string" || !c) return null
  try {
    const cv = document.createElement("canvas")
    cv.width = cv.height = 64
    const ctx = cv.getContext("2d")!
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 64, 64)
    return cv.toDataURL("image/png")
  } catch {
    return null
  }
}

/**
 * Returns an image URL representing the selected element, for the live preview backdrop.
 * Order: image fill → framer.exportImage → video frame → background colour → null.
 */
export async function exportNodeImage(nodeId: string): Promise<string | null> {
  const node: any = await (framer as any).getNode?.(nodeId)

  // 1. Image fill (most reliable: read the asset bytes directly, no CORS issues).
  try {
    const asset = node?.backgroundImage
    if (asset) {
      if (typeof asset.getData === "function") {
        const d = await asset.getData()
        if (d?.bytes) {
          console.info("Refract preview: image fill (getData)")
          return bytesToUrl(d.bytes, d.mimeType)
        }
      }
      if (typeof asset.url === "string") {
        console.info("Refract preview: image fill (url)")
        return asset.url
      }
    }
  } catch (e) {
    console.warn("Refract preview: reading image fill failed", e)
  }

  // 2. Render the node with exportImage (option names differ between framer-plugin versions).
  const attempts = [
    { nodeId, type: "png", scale: 1 },
    { nodeId, format: "png", scale: 1 },
    { nodeId },
  ]
  for (const opts of attempts) {
    try {
      const url = exportResultToUrl(await (framer as any).exportImage?.(opts))
      if (url) {
        console.info("Refract preview: exportImage", opts)
        return url
      }
    } catch (e) {
      console.warn("Refract preview: exportImage failed", opts, e)
    }
  }

  // 3. Video fill → first frame.
  try {
    const vsrc = node?.backgroundVideo?.url
    if (typeof vsrc === "string") {
      const url = await videoFrameUrl(vsrc)
      if (url) {
        console.info("Refract preview: video frame")
        return url
      }
    }
  } catch (e) {
    console.warn("Refract preview: video frame failed", e)
  }

  // 4. Plain background colour.
  const flat = colorToUrl(node?.backgroundColor)
  if (flat) {
    console.info("Refract preview: background colour")
    return flat
  }

  console.warn("Refract preview: no image available for this element", node?.constructor?.name)
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

  requirePermission(
    "addComponentInstance",
    "insert a component into the canvas"
  )

// Insert the glass component.
requirePermission(
  "addComponentInstance",
  "insert a component into the canvas"
)

const instance = await framer.addComponentInstance({
  url: exp.insertURL,
  attributes: { controls, ...layout } as any,
})

// Place it under the same parent as the selected element.
if (parent) {
  requirePermission(
    "setParent",
    "place the glass component under the selected element's parent"
  )

  await framer.setParent(instance.id, parent.id)
}

// Apply layout after re-parenting.
requirePermission(
  "Node.setAttributes",
  "modify the glass component's layout"
)

await instance.setAttributes(layout)

await instance.select()
  return note
}