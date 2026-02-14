import { useState } from 'react'
import { useAppStore } from '../store/appStore'

function ExportImportPage() {
  const { state, importData, exportData } = useAppStore()
  const [payload, setPayload] = useState('')

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-cyan-600/40 bg-slate-800 p-5">
        <h1 className="text-2xl font-bold text-cyan-300">Export / Import</h1>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-700 bg-slate-800 p-5">
        <textarea
          className="min-h-64 rounded bg-slate-900 p-3 text-xs"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          placeholder="JSON für Import oder Export"
        />
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded bg-cyan-500 px-3 py-2 font-semibold text-slate-900"
            onClick={() => setPayload(exportData())}
          >
            Export erzeugen
          </button>
          <button
            type="button"
            className="rounded bg-slate-600 px-3 py-2 font-semibold"
            onClick={() => importData(payload)}
          >
            Import ausführen
          </button>
        </div>
        <p className="text-sm text-slate-300">
          Verwendete Auftragsnummern (permanent): {state.meta.usedOrderNumbers.join(', ') || '—'}
        </p>
      </div>
    </section>
  )
}

export default ExportImportPage
