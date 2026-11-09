import { useEffect, useRef, useState } from "react"
import type { GlassParams } from "../types"
import { createRenderer } from "../webgl"

interface Props {
  params: GlassParams
  cssMode: boolean
  /** Image URL of the selected element (optional). */
  backdrop?: string | null
}

export function Preview({ params, cssMode, backdrop }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  // If WebGL fails to initialise, fall back to the CSS preview instead of a black canvas.
  const [glFailed, setGlFailed] = useState(false)
  const useCss = cssMode || glFailed

  useEffect(() => {
    if (useCss || !canvasRef.current) return
    const r = createRenderer(canvasRef.current)
    if (!r) {
      setGlFailed(true)
      return
    }
    rendererRef.current = r
    r.draw(params)
    return () => {
      r.destroy()
      rendererRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCss])

  useEffect(() => {
    if (useCss) return
    let cancelled = false
    if (!backdrop) {
      rendererRef.current?.setImage(null)
      rendererRef.current?.draw(params)
      return
    }
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      rendererRef.current?.setImage(img)
      rendererRef.current?.draw(params)
    }
    img.onerror = () => {
      if (cancelled) return
      rendererRef.current?.setImage(null)
      rendererRef.current?.draw(params)
    }
    img.src = backdrop
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backdrop, useCss])

  useEffect(() => {
    rendererRef.current?.draw(params)
  }, [params, useCss])

  if (useCss) {
    const bf = `blur(${params.blur}px) saturate(1.3)`
    return (
      <div
        className="preview css-bg"
        style={backdrop ? { backgroundImage: `url(${backdrop})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        <div
          className="css-glass"
          style={{
            backdropFilter: bf,
            WebkitBackdropFilter: bf,
            background: `rgba(190,150,255,${(params.tint / 100) * 0.3})`,
            boxShadow: `inset 2px 0 0 rgba(255,60,140,.25), inset -2px 0 0 rgba(40,220,255,.25)`,
          }}
        />
        <span className="badge">CSS blur · {glFailed ? "WebGL unavailable" : "Performance mode"}</span>
      </div>
    )
  }

  return (
    <div className="preview">
      <canvas ref={canvasRef} />
      <span className="badge"><i className="dot" /> {backdrop ? "Live Preview · Selected element" : "Live Preview"}</span>
    </div>
  )
}