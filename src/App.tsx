import { useCallback, useEffect, useMemo, useState } from "react"
import { framer } from "framer-plugin"
import { Preview } from "./components/Preview"
import { BUILT_IN_PRESETS, DEFAULT_PARAMS } from "./presets"
import { supportsWebGL } from "./support"
import { loadCustomPresets, saveCustomPresets } from "./storage"
import { applyGlass } from "./framerApi"
import type { GlassParams, Preset, Thickness } from "./types"

type Tab = "apply" | "adjust"

export function App() {
  const [tab, setTab] = useState<Tab>("apply")
  const [params, setParams] = useState<GlassParams>(DEFAULT_PARAMS)
  const [presetId, setPresetId] = useState<string>("frosted")
  const [custom, setCustom] = useState<Preset[]>([])
  const [selected, setSelected] = useState(0)
  const [perfMode, setPerfMode] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const webgl = useMemo(supportsWebGL, [])
  const cssMode = perfMode || !webgl
  const allPresets = [...BUILT_IN_PRESETS, ...custom]

  useEffect(() => framer.subscribeToSelection(nodes => setSelected(nodes.length)), [])
  useEffect(() => { loadCustomPresets().then(setCustom) }, [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [toast])

  const update = (patch: Partial<GlassParams>) => {
    setParams(p => ({ ...p, ...patch }))
    setPresetId("")
  }

  const choose = (p: Preset) => {
    setPresetId(p.id)
    setParams(p.params)
  }

  const apply = useCallback(async () => {
    setBusy(true)
    try {
      await applyGlass(params, cssMode)
      setToast("Glass material applied")
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }, [params, cssMode])

  const reset = () => {
    const base = allPresets.find(p => p.id === (presetId || "frosted")) ?? BUILT_IN_PRESETS[0]
    setParams(base.params)
    setPresetId(base.id)
    setToast(`Reset to ${base.name} defaults`)
  }

  const savePreset = async () => {
    if (!name.trim()) return setNameError(true)
    const preset: Preset = {
      id: "custom-" + Date.now(),
      name: name.trim(),
      description: `Blur ${params.blur} · Refraction ${params.refraction}% · Dispersion ${params.dispersion}%`,
      params,
      custom: true,
    }
    const next = [...custom, preset]
    setCustom(next)
    setPresetId(preset.id)
    await saveCustomPresets(next)
    setNaming(false)
    setName("")
    setNameError(false)
    setToast("Preset saved to this file")
  }

  const deletePreset = async (id: string) => {
    const next = custom.filter(p => p.id !== id)
    setCustom(next)
    await saveCustomPresets(next)
  }

  return (
    <main>
      <header>
        <img src="/icon.png" alt="" />
        <div>
          <h1>Refract</h1>
          <small>GLASS MATERIAL</small>
        </div>
      </header>

      <nav className="tabs">
        {(["apply", "adjust"] as Tab[]).map(t => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "apply" ? "Apply" : "Adjust"}
          </button>
        ))}
      </nav>

      {tab === "apply" && (
        <div className="card info">
          <b>{selected === 0 ? "No element selected" : `${selected} element${selected > 1 ? "s" : ""} selected`}</b>
          <span>{selected > 1 ? "Glass is applied to the first selected element in v0.1." : "Selected element will receive the glass material."}</span>
        </div>
      )}

      <Preview params={params} cssMode={cssMode} />
      {!webgl && <p className="warn">WebGL not supported. Using CSS blur (performance mode).</p>}

      {tab === "apply" && (
        <>
          <h2>Material Presets</h2>
          <div className="presets">
            {allPresets.map(p => (
              <div key={p.id} className={"preset" + (presetId === p.id ? " on" : "")} onClick={() => choose(p)}>
                <b>{p.name}</b>
                <span>{p.description}</span>
                {p.custom && (
                  <button className="x" title="Delete" onClick={e => { e.stopPropagation(); deletePreset(p.id) }}>×</button>
                )}
              </div>
            ))}
          </div>
          <div className="row">
            <button className="ghost" onClick={() => setTab("adjust")}>Adjust</button>
            <button className="primary" disabled={busy || selected === 0} onClick={apply}>Apply to Canvas →</button>
          </div>
          {selected === 0 && <p className="hint">Select an element on the canvas to apply</p>}
        </>
      )}

      {tab === "adjust" && (
        <>
          <Slider label="Blur" value={params.blur} min={0} max={40} suffix="" onChange={v => update({ blur: v })} />
          <Slider label="Refraction Strength" value={params.refraction} min={0} max={100} suffix="%" onChange={v => update({ refraction: v })} />
          <Slider label="Chromatic Dispersion" value={params.dispersion} min={0} max={100} suffix="%" onChange={v => update({ dispersion: v })} />

          <div className="card">
            <label>Glass Thickness</label>
            <div className="seg">
              {(["low", "medium", "high"] as Thickness[]).map(t => (
                <button key={t} className={params.thickness === t ? "on" : ""} onClick={() => update({ thickness: t })}>
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="card toggle">
            <div>
              <b>Mobile / Performance Mode</b>
              <span>Uses CSS blur instead of WebGL for better performance.</span>
            </div>
            <input type="checkbox" checked={perfMode} onChange={e => setPerfMode(e.target.checked)} />
          </div>

          {naming ? (
            <div className="card">
              <label>Preset name</label>
              <input
                className={nameError ? "err" : ""}
                value={name}
                placeholder="Enter a preset name"
                onChange={e => { setName(e.target.value); setNameError(false) }}
              />
              {nameError && <p className="warn">Enter a preset name</p>}
              <div className="row">
                <button className="ghost" onClick={() => { setNaming(false); setNameError(false) }}>Cancel</button>
                <button className="primary" onClick={savePreset}>Save Preset</button>
              </div>
            </div>
          ) : (
            <div className="row">
              <button className="ghost" onClick={reset}>↺ Reset</button>
              <button className="primary" onClick={() => setNaming(true)}>Save as Preset</button>
            </div>
          )}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}

function Slider(props: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div className="card">
      <div className="between">
        <label>{props.label}</label>
        <b>{props.value}{props.suffix}</b>
      </div>
      <input type="range" min={props.min} max={props.max} value={props.value} onChange={e => props.onChange(Number(e.target.value))} />
      <div className="between muted"><span>{props.min}{props.suffix}</span><span>{props.max}{props.suffix}</span></div>
    </div>
  )
}
