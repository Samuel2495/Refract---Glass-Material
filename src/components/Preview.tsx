
import { useEffect, useId, useState } from "react"
import type { CSSProperties } from "react"
import type { GlassParams } from "../types"

interface Props {
  params: GlassParams
  cssMode: boolean
  backdrop?: string | null
}

const THICK: Record<string, number> = {
  low: 0.6,
  medium: 1,
  high: 1.5,
}

const PREVIEW_RADIUS = 24

const NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.9 0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(%23n)'/></svg>\")"

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return x * x * (3 - 2 * x)
}

function getBlurPixels(value: number): number {
  const normalized = clamp(value, 0, 100) / 100
  return Number((Math.pow(normalized, 1.6) * 32).toFixed(2))
}

/**
 * Same edge-aware displacement map used by the generated component.
 */
function makeDisplacementMap(
  w: number,
  h: number,
  radius: number,
  bevelPx: number,
  irregularity: number
): string {
  if (typeof document === "undefined" || w < 2 || h < 2) {
    return ""
  }

  const k = Math.min(1, 384 / Math.max(w, h))
  const cw = Math.max(2, Math.round(w * k))
  const ch = Math.max(2, Math.round(h * k))

  const hx = cw / 2
  const hy = ch / 2

  const r = clamp(radius * k, 0, Math.min(hx, hy))
  const bevel = clamp(bevelPx * k, 1, Math.min(hx, hy))
  const amount = clamp(irregularity, 0, 100) / 100

  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch

  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  const img = ctx.createImageData(cw, ch)
  const data = img.data

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const px = x + 0.5 - hx
      const py = y + 0.5 - hy

      const nx = px / Math.max(1, hx)
      const ny = py / Math.max(1, hy)

      const qx = Math.abs(px) - hx + r
      const qy = Math.abs(py) - hy + r

      const sd =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        r

      const depth = -sd

      const waveX =
        Math.sin(ny * 5.5 + nx * 2.2) * 0.45 +
        Math.sin(nx * 9.0 - ny * 3.5) * 0.3 +
        Math.sin(ny * 13.0 + nx * 7.0) * 0.25

      const waveY =
        Math.sin(nx * 6.0 - ny * 2.5) * 0.45 +
        Math.sin(ny * 8.5 + nx * 4.0) * 0.3 +
        Math.sin(nx * 12.0 - ny * 6.0) * 0.25

      let vx = waveX * amount * 0.24
      let vy = waveY * amount * 0.24

      let ex = 0
      let ey = 0

      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy) || 1
        ex = (qx / len) * Math.sign(px)
        ey = (qy / len) * Math.sign(py)
      } else if (qx > qy) {
        ex = Math.sign(px)
      } else {
        ey = Math.sign(py)
      }

      if (depth > 0 && depth < bevel) {
        const edgeProfile = 1 - smoothstep(0, bevel, depth)
        const bevelStrength =
          edgeProfile * edgeProfile * (0.65 + amount * 0.35)

        vx += ex * bevelStrength * 0.55
        vy += ey * bevelStrength * 0.55

        vx += waveX * amount * bevelStrength * 0.12
        vy += waveY * amount * bevelStrength * 0.12
      }

      const i = (y * cw + x) * 4

      data[i] = Math.round(127.5 + clamp(vx, -1, 1) * 127.5)
      data[i + 1] = Math.round(127.5 + clamp(vy, -1, 1) * 127.5)
      data[i + 2] = 128
      data[i + 3] = 255
    }
  }

  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL("image/png")
}

export function Preview({ params, cssMode, backdrop }: Props) {
  const uid = `preview-${useId().replace(/:/g, "")}`

  const [chromium, setChromium] = useState(false)
  const [aspect, setAspect] = useState<number | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [mapUrl, setMapUrl] = useState("")

  const t = THICK[params.thickness] ?? 1

  const blurPercent = clamp(params.blur, 0, 100)
  const refr = clamp(params.refraction, 0, 100)
  const disp = clamp(params.dispersion, 0, 100)
  const irregular = clamp(params.irregularity, 0, 100)
  const tint = clamp(params.tint, 0, 100)

  const blur = getBlurPixels(blurPercent)

  // Same refraction and dispersion scaling as the generated component.
  const scale = (refr / 100) * 65 * t
  const spread = (disp / 100) * 0.8

  const sR = scale * (1 + spread)
  const sG = scale
  const sB = scale * (1 - spread)

  const wantSvg = chromium && !cssMode && refr > 0

  // Detect Chromium-based browsers.
  useEffect(() => {
    const ua = navigator.userAgent
    setChromium(/Chrome|Chromium|Edg\//.test(ua) && !/Firefox/.test(ua))
  }, [])

  // Load the preview backdrop's aspect ratio.
  useEffect(() => {
    if (!backdrop) {
      setAspect(null)
      return
    }

    let cancelled = false
    const img = new Image()

    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setAspect(img.naturalWidth / img.naturalHeight)
      }
    }

    img.onerror = () => {
      if (!cancelled) setAspect(null)
    }

    img.src = backdrop

    return () => {
      cancelled = true
    }
  }, [backdrop])

  // Measure the preview so the displacement map matches its dimensions.
  useEffect(() => {
    const el = document.querySelector(".preview")
    if (!(el instanceof HTMLElement)) return

    const measure = () => {
      setSize({
        w: el.offsetWidth,
        h: el.offsetHeight,
      })
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)

    return () => observer.disconnect()
  }, [aspect, backdrop])

  // Generate the same optical displacement map as the actual component.
  useEffect(() => {
    if (!wantSvg || size.w < 2 || size.h < 2) {
      setMapUrl("")
      return
    }

    setMapUrl(
      makeDisplacementMap(
        size.w,
        size.h,
        PREVIEW_RADIUS,
        30 * t,
        irregular
      )
    )
  }, [wantSvg, size.w, size.h, t, irregular])

  const useSvg = wantSvg && !!mapUrl

  // IMPORTANT: Apply the SVG filter to backdrop-filter.
  const backdropFilter =
    `blur(${blur}px) ` +
    `${useSvg ? `url(#${uid}) ` : ""}` +
    "saturate(1.6) brightness(1.05)"

  const frostAmount =
    Math.pow(clamp((blurPercent - 55) / 45, 0, 1), 1.2) *
    clamp(irregular / 45, 0, 1)

  const frameStyle: CSSProperties = {
    position: "relative",
    width: "100%",
    overflow: "hidden",
    borderRadius: PREVIEW_RADIUS,
    aspectRatio: aspect
      ? String(Math.min(2.4, Math.max(0.6, aspect)))
      : "1.6 / 1",
    background: backdrop
      ? "#222"
      : "linear-gradient(135deg, #ff4e87, #3635a5 45%, #ffb04a)",
  }

  const glassStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: PREVIEW_RADIUS,
    overflow: "hidden",

    backdropFilter,
    WebkitBackdropFilter: backdropFilter,

    background: `
      linear-gradient(
        145deg,
        rgba(255,255,255,${0.09 + t * 0.025}) 0%,
        rgba(255,255,255,0.015) 35%,
        rgba(160,210,255,0.035) 70%,
        rgba(255,255,255,${0.07 + t * 0.025}) 100%
      ),
      rgba(180,205,255,${(tint / 100) * 0.22})
    `,

    boxShadow: `
      0 12px 32px rgba(0,0,0,0.12),
      0 3px 10px rgba(0,0,0,0.06),
      inset 0 0 14px rgba(255,255,255,0.07)
    `,
  }

  const bevelLighting = `
    linear-gradient(
      180deg,
      rgba(255,255,255,${0.20 * t}) 0%,
      rgba(255,255,255,${0.08 * t}) 4%,
      transparent 17%
    ),
    linear-gradient(
      0deg,
      rgba(255,255,255,${0.13 * t}) 0%,
      rgba(255,255,255,${0.04 * t}) 5%,
      transparent 18%
    ),
    linear-gradient(
      90deg,
      rgba(255,255,255,${0.13 * t}) 0%,
      transparent 13%,
      transparent 87%,
      rgba(180,230,255,${0.10 * t}) 100%
    )
  `

  return (
    <div className="preview" style={frameStyle}>
      {backdrop ? (
        <img
          src={backdrop}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 20% 30%, #ff4e87, transparent 45%)," +
              "radial-gradient(circle at 80% 25%, #248cff, transparent 45%)," +
              "radial-gradient(circle at 60% 90%, #ffb04a, transparent 45%)," +
              "#17142d",
          }}
        />
      )}

      {useSvg && (
        <svg
          width="0"
          height="0"
          style={{ position: "absolute", pointerEvents: "none" }}
        >
          <filter
            id={uid}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feImage
              href={mapUrl}
              preserveAspectRatio="none"
              result="map"
            />

            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={sR}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dR"
            />

            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={sG}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dG"
            />

            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={sB}
              xChannelSelector="R"
              yChannelSelector="G"
              result="dB"
            />

            <feColorMatrix
              in="dR"
              type="matrix"
              values="
                1 0 0 0 0
                0 0 0 0 0
                0 0 0 0 0
                0 0 0 0 1
              "
              result="r"
            />

            <feColorMatrix
              in="dG"
              type="matrix"
              values="
                0 0 0 0 0
                0 1 0 0 0
                0 0 0 0 0
                0 0 0 0 1
              "
              result="g"
            />

            <feColorMatrix
              in="dB"
              type="matrix"
              values="
                0 0 0 0 0
                0 0 0 0 0
                0 0 1 0 0
                0 0 0 0 1
              "
              result="b"
            />

            <feBlend in="r" in2="g" mode="screen" result="rg" />
            <feBlend in="rg" in2="b" mode="screen" />
          </filter>
        </svg>
      )}

      <div style={glassStyle}>
        {/* Broad reflection across the front surface */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            pointerEvents: "none",
            zIndex: 2,
            background: `
              linear-gradient(
                125deg,
                rgba(255,255,255,0.22) 0%,
                rgba(255,255,255,0.08) 13%,
                transparent 34%,
                transparent 65%,
                rgba(100,220,255,0.06) 83%,
                rgba(255,255,255,0.13) 100%
              )
            `,
            mixBlendMode: "screen",
          }}
        />

        {/* Soft bevel lighting without a drawn outline */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            pointerEvents: "none",
            zIndex: 3,
            background: bevelLighting,
            boxShadow: `
              inset 0 0 ${12 * t}px rgba(255,255,255,0.07),
              inset 0 3px 8px rgba(255,255,255,0.10),
              inset 3px 0 7px rgba(255,255,255,0.06),
              inset -3px 0 7px rgba(180,230,255,0.05),
              inset 0 -3px 8px rgba(255,255,255,0.07)
            `,
          }}
        />

        {/* Diffused upper reflection */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: "2%",
            left: "9%",
            width: "54%",
            height: "13%",
            borderRadius: "50%",
            pointerEvents: "none",
            zIndex: 4,
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.22), rgba(255,255,255,0.07), transparent)",
            filter: "blur(5px)",
          }}
        />

        {/* Surface grain, increasingly visible with frost */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            pointerEvents: "none",
            opacity: 0.025 + frostAmount * 0.12,
            backgroundImage: NOISE,
            backgroundSize: "110px 110px",
            mixBlendMode: "soft-light",
            zIndex: 5,
          }}
        />

        {/* Subtle dew droplets for frosted and icy presets */}
        {frostAmount > 0.01 && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              pointerEvents: "none",
              zIndex: 6,
              opacity: frostAmount * 0.65,
              backgroundImage: `
                radial-gradient(ellipse 5px 7px at 16% 25%,
                  rgba(255,255,255,0.42), rgba(255,255,255,0.12) 45%, transparent 100%),
                radial-gradient(ellipse 8px 10px at 73% 30%,
                  rgba(255,255,255,0.32), rgba(255,255,255,0.10) 48%, transparent 100%),
                radial-gradient(ellipse 4px 6px at 42% 72%,
                  rgba(255,255,255,0.35), rgba(255,255,255,0.08) 55%, transparent 100%),
                radial-gradient(ellipse 7px 9px at 86% 78%,
                  rgba(255,255,255,0.30), rgba(255,255,255,0.08) 50%, transparent 100%),
                radial-gradient(ellipse 3px 4px at 29% 53%,
                  rgba(255,255,255,0.30), transparent 100%),
                radial-gradient(ellipse 2px 3px at 61% 57%,
                  rgba(255,255,255,0.28), transparent 100%)
              `,
              backgroundRepeat: "no-repeat",
              filter: "blur(0.4px)",
              mixBlendMode: "screen",
            }}
          />
        )}
      </div>

      <span className="badge">
        <i className="dot" />
        {cssMode
          ? "Performance Preview"
          : useSvg
            ? "Live Preview · Refraction"
            : "Live Preview · CSS"}
      </span>
    </div>
  )
}
