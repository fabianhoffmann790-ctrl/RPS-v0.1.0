import { useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
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

function HelpHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex items-center gap-1">
      <span className="cursor-help text-xs text-slate-400" title={text}>ⓘ</span>
      <button type="button" className="rounded bg-slate-700 px-1 text-[10px] text-slate-300" onClick={() => setOpen((value) => !value)}>?</button>
      {open ? <span className="absolute left-0 top-6 z-10 w-56 rounded border border-slate-600 bg-slate-900 p-2 text-[11px] text-slate-200">{text}</span> : null}
    </span>
  )
}

function LabeledField({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <label className="space-y-1 text-sm text-slate-300">
      <span className="inline-flex items-center gap-2">
        {label}
        <HelpHint text={help} />
      </span>
      {children}
    </label>
  )
}

function StammdatenPage() {
  const { state, updateMasterdata, updateSettings } = useAppStore()
  const [draft, setDraft] = useState<MasterdataState>(state.masterdata)
  const [shiftStartTime, setShiftStartTime] = useState(state.settings.shiftStartTime)

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
    const masterdataResult = updateMasterdata(draft)
    if (!masterdataResult.ok) return
    updateSettings({ shiftStartTime })
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-cyan-600/40 bg-slate-800 p-5">
        <h1 className="text-2xl font-bold text-cyan-300">Stammdaten</h1>
        <p className="mt-2 text-sm text-slate-300">Alle Felder sind als Formularfelder mit Einheiten und Hilfetexten sichtbar.</p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="mb-3 text-xl font-semibold">Planungs-Settings</h2>
        <LabeledField label="Schichtstart (HH:mm)" help="Startanker für den Reflow pro Linie. Der erste Auftrag startet immer zu dieser Uhrzeit.">
          <input type="time" value={shiftStartTime} onChange={(event) => setShiftStartTime(event.target.value)} className="w-full rounded bg-slate-700 px-3 py-2 md:w-72" />
        </LabeledField>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Produkte</h2>
          <button type="button" onClick={() => setDraft((prev) => ({ ...prev, products: [...prev.products, createProduct()] }))} className="rounded bg-slate-700 px-3 py-2">Produkt hinzufügen</button>
        </div>

        {draft.products.map((product, index) => (
          <article key={`${product.productId || 'new'}-${index}`} className="grid gap-3 rounded border border-slate-700 p-3 md:grid-cols-3">
            <LabeledField label="Produkt-ID" help="Eindeutige interne ID."><input className="w-full rounded bg-slate-700 px-3 py-2" value={product.productId} onChange={(event) => updateProduct(index, { productId: event.target.value })} /></LabeledField>
            <LabeledField label="Produktname" help="Anzeigename im Auftrag."><input className="w-full rounded bg-slate-700 px-3 py-2" value={product.name} onChange={(event) => updateProduct(index, { name: event.target.value })} /></LabeledField>
            <LabeledField label="Artikelnummer" help="Eindeutige Referenz aus ERP."><input className="w-full rounded bg-slate-700 px-3 py-2" value={product.articleNo} onChange={(event) => updateProduct(index, { articleNo: event.target.value })} /></LabeledField>
            <LabeledField label="Viskosität (optional)" help="Nur Dokumentation, aktuell ohne Einfluss."><input className="w-full rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.1" value={product.viscosity ?? ''} onChange={(event) => updateProduct(index, { viscosity: parseOptionalNumber(event) })} /></LabeledField>
            <LabeledField label="Rüstzeit (min/L)" help="Misch-/Herstellzeit je Liter Produkt."><input className="w-full rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" value={product.makeTimeMinPerL} onChange={(event) => updateProduct(index, { makeTimeMinPerL: Number(event.target.value) })} /></LabeledField>
            <LabeledField label="Abfüllfaktor (optional)" help="Korrekturfaktor für Ausbringung."><input className="w-full rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" value={product.fillFactor ?? ''} onChange={(event) => updateProduct(index, { fillFactor: parseOptionalNumber(event) })} /></LabeledField>
            <LabeledField label="Produktpuffer (min, optional)" help="Zusätzliche Pufferzeit für dieses Produkt."><input className="w-full rounded bg-slate-700 px-3 py-2" type="number" min="0" step="1" value={product.bufferMin ?? ''} onChange={(event) => updateProduct(index, { bufferMin: parseOptionalNumber(event) })} /></LabeledField>
            <button type="button" onClick={() => setDraft((prev) => ({ ...prev, products: prev.products.filter((_, idx) => idx !== index) }))} className="rounded bg-rose-600/80 px-3 py-2">Löschen</button>
          </article>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Linien</h2>
          <button type="button" onClick={() => setDraft((prev) => ({ ...prev, lines: [...prev.lines, createLine()] }))} className="rounded bg-slate-700 px-3 py-2">Linie hinzufügen</button>
        </div>
        {draft.lines.map((line, index) => (
          <article key={`${line.lineId || 'new'}-${index}`} className="grid gap-3 rounded border border-slate-700 p-3 md:grid-cols-3">
            <LabeledField label="Linien-ID" help="Eindeutige technische ID."><input className="w-full rounded bg-slate-700 px-3 py-2" value={line.lineId} onChange={(event) => updateLine(index, { lineId: event.target.value })} /></LabeledField>
            <LabeledField label="Linienname" help="Sichtbarer Name im Board."><input className="w-full rounded bg-slate-700 px-3 py-2" value={line.name} onChange={(event) => updateLine(index, { name: event.target.value })} /></LabeledField>
            <button type="button" onClick={() => setDraft((prev) => ({ ...prev, lines: prev.lines.filter((_, idx) => idx !== index) }))} className="rounded bg-rose-600/80 px-3 py-2">Löschen</button>
            <LabeledField label="Leistung 250 ml (L/min)" help="Abfüllrate für 250-ml-Gebinde."><input className="w-full rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" value={line.rates.l250MlPerMin} onChange={(event) => updateLine(index, { rates: { ...line.rates, l250MlPerMin: Number(event.target.value) } })} /></LabeledField>
            <LabeledField label="Leistung 500 ml (L/min)" help="Abfüllrate für 500-ml-Gebinde."><input className="w-full rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" value={line.rates.l500MlPerMin} onChange={(event) => updateLine(index, { rates: { ...line.rates, l500MlPerMin: Number(event.target.value) } })} /></LabeledField>
            <LabeledField label="Leistung 1 L (L/min)" help="Abfüllrate für 1-L-Gebinde."><input className="w-full rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" value={line.rates.l1000MlPerMin} onChange={(event) => updateLine(index, { rates: { ...line.rates, l1000MlPerMin: Number(event.target.value) } })} /></LabeledField>
            <LabeledField label="Leistung 5 L (L/min)" help="Abfüllrate für 5-L-Gebinde."><input className="w-full rounded bg-slate-700 px-3 py-2" type="number" min="0" step="0.01" value={line.rates.l5000MlPerMin} onChange={(event) => updateLine(index, { rates: { ...line.rates, l5000MlPerMin: Number(event.target.value) } })} /></LabeledField>
          </article>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Rührwerke</h2>
          <button type="button" onClick={() => setDraft((prev) => ({ ...prev, stirrers: [...prev.stirrers, createStirrer()] }))} className="rounded bg-slate-700 px-3 py-2">Rührwerk hinzufügen</button>
        </div>
        {draft.stirrers.map((stirrer, index) => (
          <article key={`${stirrer.rwId || 'new'}-${index}`} className="grid gap-3 rounded border border-slate-700 p-3 md:grid-cols-3">
            <LabeledField label="Rührwerk-ID" help="Eindeutiger Schlüssel."><input className="w-full rounded bg-slate-700 px-3 py-2" value={stirrer.rwId} onChange={(event) => updateStirrer(index, { rwId: event.target.value })} /></LabeledField>
            <LabeledField label="Rührwerkname" help="Anzeigename."><input className="w-full rounded bg-slate-700 px-3 py-2" value={stirrer.name} onChange={(event) => updateStirrer(index, { name: event.target.value })} /></LabeledField>
            <button type="button" onClick={() => setDraft((prev) => ({ ...prev, stirrers: prev.stirrers.filter((_, idx) => idx !== index) }))} className="rounded bg-rose-600/80 px-3 py-2">Löschen</button>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <LabeledField label="Globaler Puffer (min, optional)" help="Wird auf Rührwerksfenster addiert, falls kein Produktpuffer gesetzt ist.">
          <input className="w-full rounded bg-slate-700 px-3 py-2 md:w-72" type="number" min="0" step="1" value={draft.bufferMin ?? ''} onChange={(event) => setDraft((prev) => ({ ...prev, bufferMin: parseOptionalNumber(event) }))} />
        </LabeledField>
      </div>

      {validationMessage ? <p className="text-sm text-amber-300">{validationMessage}</p> : null}

      <button type="button" onClick={onSave} className="rounded bg-cyan-500 px-4 py-2 font-semibold text-slate-900">Stammdaten & Settings speichern</button>
    </section>
  )
}

export default StammdatenPage
