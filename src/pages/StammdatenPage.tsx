import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useAppStore } from '../store/appStore'
import type { Line, MasterdataState, Product, Stirrer } from '../store/types'

const createProduct = (): Product => ({
  productId: '',
  name: '',
  articleNo: '',
  makeTimeMinPerL: 0,
})

const createLine = (): Line => ({
  lineId: '',
  name: '',
  rates: {
    l250MlPerMin: 0,
    l500MlPerMin: 0,
    l1000MlPerMin: 0,
    l5000MlPerMin: 0,
  },
})

const createStirrer = (): Stirrer => ({ rwId: '', name: '' })

function StammdatenPage() {
  const { state, updateMasterdata } = useAppStore()
  const [draft, setDraft] = useState<MasterdataState>(state.masterdata)
  const [advancedJson, setAdvancedJson] = useState('')

  useEffect(() => {
    setDraft(state.masterdata)
  }, [state.masterdata])

  useEffect(() => {
    setAdvancedJson(JSON.stringify(draft, null, 2))
  }, [draft])

  const validationMessage = useMemo(() => {
    if (!draft.products.length || !draft.lines.length || !draft.stirrers.length) {
      return 'Produkte, Linien und Rührwerke müssen jeweils mindestens einen Eintrag enthalten.'
    }
    return null
  }, [draft])

  const updateProduct = (index: number, patch: Partial<Product>) => {
    setDraft((prev) => ({
      ...prev,
      products: prev.products.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    }))
  }

  const updateLine = (index: number, patch: Partial<Line>) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    }))
  }

  const updateStirrer = (index: number, patch: Partial<Stirrer>) => {
    setDraft((prev) => ({
      ...prev,
      stirrers: prev.stirrers.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    }))
  }

  const parseOptionalNumber = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.value) return undefined
    return Number(event.target.value)
  }

  const onSave = () => {
    const result = updateMasterdata(draft)
    if (!result.ok) return
    setDraft((prev) => ({ ...prev }))
  }

  const onApplyJson = () => {
    try {
      const parsed = JSON.parse(advancedJson) as MasterdataState
      setDraft(parsed)
    } catch {
      // silent: save action shows store validation errors
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-cyan-600/40 bg-slate-800 p-5">
        <h1 className="text-2xl font-bold text-cyan-300">Stammdaten</h1>
        <p className="mt-2 text-sm text-slate-300">Linienraten werden einheitlich als Leistung in Litern pro Minute gespeichert.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Produkte</h2>
          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, products: [...prev.products, createProduct()] }))}
            className="rounded bg-slate-700 px-3 py-2"
          >
            Produkt hinzufügen
          </button>
        </div>

        {draft.products.map((product, index) => (
          <article key={`${product.productId || 'new'}-${index}`} className="grid gap-2 rounded border border-slate-700 p-3 md:grid-cols-3">
            <input className="rounded bg-slate-700 px-3 py-2" placeholder="productId" value={product.productId} onChange={(event) => updateProduct(index, { productId: event.target.value })} />
            <input className="rounded bg-slate-700 px-3 py-2" placeholder="Name" value={product.name} onChange={(event) => updateProduct(index, { name: event.target.value })} />
            <input className="rounded bg-slate-700 px-3 py-2" placeholder="articleNo" value={product.articleNo} onChange={(event) => updateProduct(index, { articleNo: event.target.value })} />
            <input className="rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.1" placeholder="Viskosität (optional)" value={product.viscosity ?? ''} onChange={(event) => updateProduct(index, { viscosity: parseOptionalNumber(event) })} />
            <input className="rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" placeholder="makeTimeMinPerL" value={product.makeTimeMinPerL} onChange={(event) => updateProduct(index, { makeTimeMinPerL: Number(event.target.value) })} />
            <input className="rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" placeholder="fillFactor (optional)" value={product.fillFactor ?? ''} onChange={(event) => updateProduct(index, { fillFactor: parseOptionalNumber(event) })} />
            <input className="rounded bg-slate-700 px-3 py-2 md:col-span-2" type="number" min="0" step="1" placeholder="bufferMin pro Produkt (optional)" value={product.bufferMin ?? ''} onChange={(event) => updateProduct(index, { bufferMin: parseOptionalNumber(event) })} />
            <button type="button" onClick={() => setDraft((prev) => ({ ...prev, products: prev.products.filter((_, idx) => idx !== index) }))} className="rounded bg-rose-600/80 px-3 py-2">
              Löschen
            </button>
          </article>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Linien</h2>
          <button type="button" onClick={() => setDraft((prev) => ({ ...prev, lines: [...prev.lines, createLine()] }))} className="rounded bg-slate-700 px-3 py-2">
            Linie hinzufügen
          </button>
        </div>
        {draft.lines.map((line, index) => (
          <article key={`${line.lineId || 'new'}-${index}`} className="grid gap-2 rounded border border-slate-700 p-3 md:grid-cols-3">
            <input className="rounded bg-slate-700 px-3 py-2" placeholder="lineId" value={line.lineId} onChange={(event) => updateLine(index, { lineId: event.target.value })} />
            <input className="rounded bg-slate-700 px-3 py-2" placeholder="Name" value={line.name} onChange={(event) => updateLine(index, { name: event.target.value })} />
            <button type="button" onClick={() => setDraft((prev) => ({ ...prev, lines: prev.lines.filter((_, idx) => idx !== index) }))} className="rounded bg-rose-600/80 px-3 py-2">
              Löschen
            </button>
            <input className="rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" placeholder="250 ml (L/min)" value={line.rates.l250MlPerMin} onChange={(event) => updateLine(index, { rates: { ...line.rates, l250MlPerMin: Number(event.target.value) } })} />
            <input className="rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" placeholder="500 ml (L/min)" value={line.rates.l500MlPerMin} onChange={(event) => updateLine(index, { rates: { ...line.rates, l500MlPerMin: Number(event.target.value) } })} />
            <input className="rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" placeholder="1000 ml (L/min)" value={line.rates.l1000MlPerMin} onChange={(event) => updateLine(index, { rates: { ...line.rates, l1000MlPerMin: Number(event.target.value) } })} />
            <input className="rounded bg-slate-700 px-3 py-2 md:col-span-3" type="number" min="0" step="0.01" placeholder="5000 ml (L/min)" value={line.rates.l5000MlPerMin} onChange={(event) => updateLine(index, { rates: { ...line.rates, l5000MlPerMin: Number(event.target.value) } })} />
          </article>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Rührwerke</h2>
          <button type="button" onClick={() => setDraft((prev) => ({ ...prev, stirrers: [...prev.stirrers, createStirrer()] }))} className="rounded bg-slate-700 px-3 py-2">
            Rührwerk hinzufügen
          </button>
        </div>
        {draft.stirrers.map((stirrer, index) => (
          <article key={`${stirrer.rwId || 'new'}-${index}`} className="grid gap-2 rounded border border-slate-700 p-3 md:grid-cols-3">
            <input className="rounded bg-slate-700 px-3 py-2" placeholder="rwId" value={stirrer.rwId} onChange={(event) => updateStirrer(index, { rwId: event.target.value })} />
            <input className="rounded bg-slate-700 px-3 py-2" placeholder="Name" value={stirrer.name} onChange={(event) => updateStirrer(index, { name: event.target.value })} />
            <button type="button" onClick={() => setDraft((prev) => ({ ...prev, stirrers: prev.stirrers.filter((_, idx) => idx !== index) }))} className="rounded bg-rose-600/80 px-3 py-2">
              Löschen
            </button>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <label className="mb-2 block font-semibold" htmlFor="bufferMin">Globaler bufferMin (optional, Minuten)</label>
        <input id="bufferMin" className="rounded bg-slate-700 px-3 py-2" type="number" min="0" step="1" value={draft.bufferMin ?? ''} onChange={(event) => setDraft((prev) => ({ ...prev, bufferMin: parseOptionalNumber(event) }))} />
      </div>

      <details className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <summary className="cursor-pointer font-semibold">Erweitert: JSON</summary>
        <div className="mt-3 space-y-3">
          <textarea className="h-64 w-full rounded bg-slate-700 p-3 font-mono text-sm" value={advancedJson} onChange={(event) => setAdvancedJson(event.target.value)} />
          <button type="button" onClick={onApplyJson} className="rounded bg-slate-700 px-3 py-2">JSON ins Formular laden</button>
        </div>
      </details>

      {validationMessage ? <p className="text-sm text-amber-300">{validationMessage}</p> : null}

      <button type="button" onClick={onSave} className="rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-900">
        Stammdaten speichern
      </button>
    </section>
  )
}

export default StammdatenPage
