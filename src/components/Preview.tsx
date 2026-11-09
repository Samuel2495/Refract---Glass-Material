import { useEffect, useRef } from "react"
import type { GlassParams } from "../types"
import { createRenderer } from "../webgl"

interface Props {
  params: GlassParams
  cssMode: boolean
}

const THICK = { low: 0.6, medium: 1, high: 1.5 }

export function Preview({ params, cssMode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)

  useEffect(() => {
    if (cssMode || !canvasRef.current) return
    const r = createRenderer(canvasRef.current)
    rendererRef.current = r
    return () => {
      r?.destroy()
      rendererRef.current = null
    }
  }, [cssMode])

  useEffect(() => {
    rendererRef.current?.draw(params)
  }, [params, cssMode])

  if (cssMode) {
    const bf = `blur(${params.blur}px) saturate(1.3)`
    return (
      <div className="preview css-bg">
        <div
          className="css-glass"
          style={{
            backdropFilter: bf,
            WebkitBackdropFilter: bf,
            background: `rgba(190,150,255,${(params.tint / 100) * 0.3})`,
            boxShadow: `inset 2px 0 0 rgba(255,60,140,.25), inset -2px 0 0 rgba(40,220,255,.25)`,
          }}
        />
        <span className="badge">CSS blur · Performance mode</span>
      </div>
    )
  }
  void THICK
  return (
    <div className="preview">
      <canvas ref={canvasRef} />
      <span className="badge"><i className="dot" /> Live Preview</span>
    </div>
  )
}
