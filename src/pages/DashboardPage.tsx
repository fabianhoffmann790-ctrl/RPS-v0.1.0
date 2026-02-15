import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useAppStore } from '../store/appStore'

const packageOptions = [
  { value: '250ml', label: '250 ml' },
  { value: '500ml', label: '500 ml' },
  { value: '1l', label: '1 L' },
  { value: '5l', label: '5 L' },
] as const

function DashboardPage() {
  const { state, createOrder } = useAppStore()
  const [search, setSearch] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [quantity, setQuantity] = useState('')
  const [packageSize, setPackageSize] = useState<(typeof packageOptions)[number]['value']>('1l')
  const [lineId, setLineId] = useState(state.masterdata.lines[0]?.lineId ?? '')
  const [startTime, setStartTime] = useState('')
  const [startPosition, setStartPosition] = useState('')

  const selectedProduct = useMemo(() => {
    const searchValue = search.trim().toLowerCase()
    if (!searchValue) return null

    return (
      state.masterdata.products.find(
        (product) =>
          product.name.toLowerCase() === searchValue ||
          product.articleNo.toLowerCase() === searchValue ||
          `${product.name} (${product.articleNo})`.toLowerCase() === searchValue,
      ) ?? null
    )
  }, [search, state.masterdata.products])

  const searchMatches = useMemo(() => {
    const value = search.trim().toLowerCase()
    return state.masterdata.products.filter(
      (product) =>
        product.name.toLowerCase().includes(value) || product.articleNo.toLowerCase().includes(value),
    )
  }, [search, state.masterdata.products])

  const onCreateOrder = (event: FormEvent) => {
    event.preventDefault()
    if (!selectedProduct || !lineId) return

    const result = createOrder({
      orderNo,
      title: selectedProduct.name,
      productId: selectedProduct.productId,
      articleNo: selectedProduct.articleNo,
      quantity: Number(quantity),
      packageSize,
      lineId,
      lineName: state.masterdata.lines.find((line) => line.lineId === lineId)?.name ?? '',
      startTime,
      startPosition,
    })

    if (result.ok) {
      setSearch('')
      setOrderNo('')
      setQuantity('')
      setPackageSize('1l')
      setStartTime('')
      setStartPosition('')
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-cyan-600/40 bg-slate-800 p-5">
        <h1 className="text-2xl font-bold text-cyan-300">Auftrag anlegen</h1>
        <p className="mt-2 text-slate-300">Betriebstaugliche Erfassung inkl. Produktsuche, Mengen und Linienzuordnung.</p>
      </div>

      <form onSubmit={onCreateOrder} className="grid gap-4 rounded-xl border border-slate-700 bg-slate-800 p-5 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <label className="text-sm text-slate-300">Produktsuche (Name oder Artikelnummer)</label>
          <input
            list="product-options"
            className="w-full rounded bg-slate-700 px-3 py-2"
            placeholder="z. B. Standardprodukt oder ART-001"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <datalist id="product-options">
            {state.masterdata.products.map((product) => (
              <option key={product.productId} value={`${product.name} (${product.articleNo})`} />
            ))}
          </datalist>
          <p className="text-xs text-slate-400">
            {selectedProduct
              ? `Ausgewählt: ${selectedProduct.name} · ${selectedProduct.articleNo}`
              : search
                ? 'Kein exakter Treffer ausgewählt. Bitte Vorschlag übernehmen.'
                : 'Tippen für Autocomplete.'}
          </p>
          {search && !selectedProduct && searchMatches.length > 0 ? (
            <p className="text-xs text-slate-400">
              Treffer: {searchMatches.slice(0, 4).map((product) => `${product.name} (${product.articleNo})`).join(', ')}
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Menge</label>
          <input
            type="number"
            min={1}
            className="w-full rounded bg-slate-700 px-3 py-2"
            placeholder="Liter"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Gebindegröße</label>
          <select
            className="w-full rounded bg-slate-700 px-3 py-2"
            value={packageSize}
            onChange={(event) => setPackageSize(event.target.value as (typeof packageOptions)[number]['value'])}
          >
            {packageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Linie</label>
          <select className="w-full rounded bg-slate-700 px-3 py-2" value={lineId} onChange={(event) => setLineId(event.target.value)}>
            {state.masterdata.lines.map((line) => (
              <option key={line.lineId} value={line.lineId}>
                {line.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Optionale Auftragsnummer</label>
          <input
            className="w-full rounded bg-slate-700 px-3 py-2"
            placeholder="leer = AUTO-Nummer"
            value={orderNo}
            onChange={(event) => setOrderNo(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Startzeit</label>
          <input
            type="datetime-local"
            className="w-full rounded bg-slate-700 px-3 py-2"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Startposition</label>
          <input
            className="w-full rounded bg-slate-700 px-3 py-2"
            placeholder="z. B. Slot 1"
            value={startPosition}
            onChange={(event) => setStartPosition(event.target.value)}
          />
        </div>

        <button type="submit" className="rounded bg-cyan-500 px-3 py-2 font-semibold text-slate-900 md:col-span-2">
          Auftrag speichern
        </button>
      </form>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="mb-3 text-xl font-semibold">Neue Aufträge pro Linie</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {state.masterdata.lines.map((line) => {
            const lineOrders = state.orders.filter((order) => order.lineId === line.lineId && order.status === 'new')
            return (
              <article key={line.lineId} className="rounded border border-slate-700 bg-slate-900/70 p-3">
                <h3 className="font-semibold text-cyan-300">{line.name}</h3>
                <div className="mt-2 space-y-2 text-sm">
                  {lineOrders.length === 0 ? (
                    <p className="text-slate-400">Keine neuen Aufträge.</p>
                  ) : (
                    lineOrders.map((order) => (
                      <div key={order.id} className="rounded border border-slate-700 p-2">
                        <p className="font-semibold">
                          {order.orderNo} · {order.title}
                        </p>
                        <p className="text-slate-300">
                          {order.quantity} L · {order.packageSize} · Start {order.startTime || '—'} · Pos {order.startPosition}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default DashboardPage
