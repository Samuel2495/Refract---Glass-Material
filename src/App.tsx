
import { useCallback, useEffect, useMemo, useState } from "react"
import { framer } from "framer-plugin"

import { Preview } from "./components/Preview"
import { BUILT_IN_PRESETS, DEFAULT_PARAMS, normalizeParams } from "./presets"
import { loadCustomPresets, saveCustomPresets } from "./storage"
import { applyGlass, exportNodeImage } from "./framerApi"

import type { GlassParams, Preset, Thickness } from "./types"

type Tab = "apply" | "adjust"

export function App() {
  const [tab, setTab] = useState<Tab>("apply")
  const [params, setParams] = useState<GlassParams>(DEFAULT_PARAMS)
  const [presetId, setPresetId] = useState("frosted")
  const [custom, setCustom] = useState<Preset[]>([])
  const [selected, setSelected] = useState(0)
  const [backdrop, setBackdrop] = useState<string | null>(null)
  const [perfMode] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cssMode = perfMode

  const allPresets = [...BUILT_IN_PRESETS, ...custom]

  // Track selection and export the first selected element as preview backdrop.
  useEffect(() => {
    let seq = 0
    let current: string | null = null

    const swap = (url: string | null) => {
      if (current?.startsWith("blob:")) {
        URL.revokeObjectURL(current)
      }

      current = url
      setBackdrop(url)
    }

    const off = framer.subscribeToSelection(async nodes => {
      setSelected(nodes.length)
      const id = ++seq

      if (!nodes[0]) {
        swap(null)
        return
      }

      const url = await exportNodeImage(nodes[0].id)

      if (id !== seq) {
        if (url?.startsWith("blob:")) {
          URL.revokeObjectURL(url)
        }
        return
      }

      swap(url)
    })

    return () => {
      off()

      if (current?.startsWith("blob:")) {
        URL.revokeObjectURL(current)
      }
    }
  }, [])

  // Load and migrate custom presets.
  useEffect(() => {
    let active = true

    loadCustomPresets()
      .then(items => {
        if (!active) return

        const normalized = items.map(p => ({
          ...p,
          params: normalizeParams(p.params),
        }))

        setCustom(normalized)

        // Persist migrated values so old blur values are not restored later.
        if (JSON.stringify(items) !== JSON.stringify(normalized)) {
          void saveCustomPresets(normalized)
        }
      })
      .catch(error => {
        console.error("Could not load custom presets:", error)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!toast) return

    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const update = (patch: Partial<GlassParams>) => {
  setParams(current =>
    normalizeParams({
      ...current,
      ...patch,
    })
  )
}

  const choose = (preset: Preset) => {
    setParams(normalizeParams(preset.params))
    setPresetId(preset.id)
  }

  const apply = useCallback(async () => {
    setBusy(true)

    try {
      const safeParams = normalizeParams(params)
      const note = await applyGlass(safeParams, cssMode)

      setToast(note ?? "Glass material applied")
    } catch (error) {
      console.error(error)

      setToast(
        error instanceof Error
          ? error.message
          : "Something went wrong"
      )
    } finally {
      setBusy(false)
    }
  }, [params, cssMode])

    const reset = () => {
    console.log("RESET CLICKED")
    console.log("Current presetId:", JSON.stringify(presetId))
    console.log(
        "Available preset IDs:",
        allPresets.map(p => p.id)
    )

    const base = allPresets.find(p => p.id === presetId)

    console.log("Matched preset:", base)

    if (!base) {
        setToast("Unable to reset preset")
        return
    }

    setParams(normalizeParams(base.params))
    setToast(`Reset to ${base.name} defaults`)
    }

  const savePreset = async () => {
    if (!name.trim()) {
      setNameError(true)
      return
    }

    const safeParams = normalizeParams(params)

    const preset: Preset = {
      id: "custom-" + Date.now(),
      name: name.trim(),
      description:
        `Blur ${safeParams.blur}px · ` +
        `Refraction ${safeParams.refraction}% · ` +
        `Dispersion ${safeParams.dispersion}%`,
      params: safeParams,
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

    if (presetId === id) {
      setPresetId("")
    }

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
          <button
            key={t}
            className={tab === t ? "on" : ""}
            onClick={() => setTab(t)}
          >
            {t === "apply" ? "Apply" : "Adjust"}
          </button>
        ))}
      </nav>

      {tab === "apply" && (
        <div className="card info">
          <b>
            {selected === 0
              ? "No element selected"
              : `${selected} element${selected > 1 ? "s" : ""} selected`}
          </b>

          <span>
            {selected > 1
              ? "Glass is applied to the first selected element in v0.1."
              : "Selected element will receive the glass material."}
          </span>
        </div>
      )}

      <Preview
        params={params}
        cssMode={cssMode}
        backdrop={backdrop}
      />

      {tab === "apply" && (
        <>
          <h2>Material Presets</h2>

          <div className="presets">
            {allPresets.map(p => (
              <div
                key={p.id}
                className={"preset" + (presetId === p.id ? " on" : "")}
                onClick={() => choose(p)}
              >
                <b>{p.name}</b>
                <span>{p.description}</span>

                {p.custom && (
                  <button
                    className="x"
                    title="Delete"
                    onClick={e => {
                      e.stopPropagation()
                      void deletePreset(p.id)
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            className="primary full-width"
            disabled={busy || selected === 0}
            onClick={apply}
          >
            {busy ? "Applying..." : "Apply to Framer →"}
          </button>

          {selected === 0 && (
            <p className="hint">
              Select an element on the canvas to apply
            </p>
          )}
        </>
      )}

      {tab === "adjust" && (
        <>
          <Slider
            label="Blur"
            value={params.blur}
            min={0}
            max={20}
            suffix="px"
            onChange={v => update({ blur: v })}
          />

          <Slider
            label="Refraction Strength"
            value={params.refraction}
            min={0}
            max={100}
            suffix="%"
            onChange={v => update({ refraction: v })}
          />

          <Slider
            label="Chromatic Dispersion"
            value={params.dispersion}
            min={0}
            max={100}
            suffix="%"
            onChange={v => update({ dispersion: v })}
          />

          <div className="card">
            <label>Glass Thickness</label>

            <div className="seg">
              {(["low", "medium", "high"] as Thickness[]).map(t => (
                <button
                  key={t}
                  className={params.thickness === t ? "on" : ""}
                  onClick={() => update({ thickness: t })}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {naming ? (
            <div className="card">
              <label>Preset name</label>

              <input
                className={nameError ? "err" : ""}
                value={name}
                placeholder="Enter a preset name"
                onChange={e => {
                  setName(e.target.value)
                  setNameError(false)
                }}
              />

              {nameError && (
                <p className="warn">Enter a preset name</p>
              )}

              <div className="row">
                <button
                  className="ghost"
                  onClick={() => {
                    setNaming(false)
                    setNameError(false)
                  }}
                >
                  Cancel
                </button>

                <button
                  className="primary"
                  onClick={() => void savePreset()}
                >
                  Save Preset
                </button>
              </div>
            </div>
          ) : (
            <div className="row">
              <button className="ghost" onClick={reset}>
                ↺ Reset
              </button>

              <button
                className="ghost"
                onClick={() => setNaming(true)}
              >
                Save as Preset
              </button>
            </div>
          )}

          <button
            className="primary full-width"
            disabled={busy || selected === 0}
            onClick={apply}
          >
            {busy ? "Applying..." : "Apply to Framer →"}
          </button>

          {selected === 0 && (
            <p className="hint">
              Select an element on the canvas to apply
            </p>
          )}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <div className="card">
      <div className="between">
        <label>{props.label}</label>
        <b>{props.value}{props.suffix}</b>
      </div>

      <input
        type="range"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={e => props.onChange(Number(e.target.value))}
      />

      <div className="between muted">
        <span>{props.min}{props.suffix}</span>
        <span>{props.max}{props.suffix}</span>
      </div>
    </div>
  )
}
