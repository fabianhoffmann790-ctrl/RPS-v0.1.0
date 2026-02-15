import { memo, useMemo, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { useAppStore } from '../store/appStore'

const packageOptions = [
  { value: '250ml', label: '250 ml' },
  { value: '500ml', label: '500 ml' },
  { value: '1l', label: '1 L' },
  { value: '5l', label: '5 L' },
] as const

const startPolicyOptions = [
  { value: 'asap', label: 'ASAP' },
  { value: 'fixed', label: 'Fix' },
] as const

type PackageValue = (typeof packageOptions)[number]['value']
type StartPolicyValue = (typeof startPolicyOptions)[number]['value']

interface LineBoardColumn {
  lineId: string
  lineName: string
  orders: ReturnType<typeof useAppStore>['state']['orders']
}

const EmptyColumn = memo(function EmptyColumn() {
  return <p className="text-sm text-slate-400">Keine Aufträge auf dieser Linie.</p>
})

function DashboardPage() {
  const { state, createOrder, editOrder, reorderLineOrders } = useAppStore()
  const [search, setSearch] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [quantity, setQuantity] = useState('')
  const [packageSize, setPackageSize] = useState<PackageValue>('1l')
  const [lineId, setLineId] = useState(state.masterdata.lines[0]?.lineId ?? '')
  const [startTime, setStartTime] = useState('')
  const [startPolicy, setStartPolicy] = useState<StartPolicyValue>('asap')
  const [startPosition, setStartPosition] = useState('')
  const [dragOrderId, setDragOrderId] = useState<string | null>(null)

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

  const boardColumns = useMemo<LineBoardColumn[]>(() => {
    const base = [...state.masterdata.lines]
    while (base.length < 4) {
      base.push({
        lineId: `placeholder-${base.length + 1}`,
        name: `Linie ${base.length + 1}`,
        rates: { l250MlPerMin: 0, l500MlPerMin: 0, l1000MlPerMin: 0, l5000MlPerMin: 0 },
      })
    }

    return base.slice(0, 4).map((line) => ({
      lineId: line.lineId,
      lineName: line.name,
      orders: state.orders
        .filter((order) => order.lineId === line.lineId && order.status !== 'done')
        .sort((a, b) => (a.sequence === b.sequence ? a.id.localeCompare(b.id) : a.sequence - b.sequence)),
    }))
  }, [state.masterdata.lines, state.orders])

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
      startPolicy,
      startPosition,
    })

    if (result.ok) {
      setSearch('')
      setOrderNo('')
      setQuantity('')
      setPackageSize('1l')
      setStartTime('')
      setStartPolicy('asap')
      setStartPosition('')
    }
  }

  const onDropCard = (event: DragEvent<HTMLElement>, lineColumn: LineBoardColumn, targetId?: string) => {
    event.preventDefault()
    if (!dragOrderId || dragOrderId === targetId) return

    const ids = [...lineColumn.orders.map((item) => item.id)]
    const fromIndex = ids.indexOf(dragOrderId)
    if (fromIndex === -1) return

    ids.splice(fromIndex, 1)
    const targetIndex = targetId ? ids.indexOf(targetId) : ids.length
    const insertIndex = targetIndex === -1 ? ids.length : targetIndex
    ids.splice(insertIndex, 0, dragOrderId)
    reorderLineOrders(lineColumn.lineId, ids)
    setDragOrderId(null)
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
            onChange={(event) => setPackageSize(event.target.value as PackageValue)}
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
          <label className="text-sm text-slate-300">Startzeit (für Fix-Policy)</label>
          <input
            type="datetime-local"
            className="w-full rounded bg-slate-700 px-3 py-2"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm text-slate-300">Start-Policy</label>
          <select
            className="w-full rounded bg-slate-700 px-3 py-2"
            value={startPolicy}
            onChange={(event) => setStartPolicy(event.target.value as StartPolicyValue)}
          >
            {startPolicyOptions.map((policy) => (
              <option key={policy.value} value={policy.value}>
                {policy.label}
              </option>
            ))}
          </select>
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
        <h2 className="mb-3 text-xl font-semibold">Linienboard (4 Spalten)</h2>
        <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
          {boardColumns.map((lineColumn) => (
            <article
              key={lineColumn.lineId}
              className="rounded border border-slate-700 bg-slate-900/70 p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDropCard(event, lineColumn)}
            >
              <h3 className="font-semibold text-cyan-300">{lineColumn.lineName}</h3>
              <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {lineColumn.orders.length === 0 ? (
                  <EmptyColumn />
                ) : (
                  lineColumn.orders.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      products={state.masterdata.products}
                      onDragStart={() => setDragOrderId(order.id)}
                      onDragEnd={() => setDragOrderId(null)}
                      onDrop={(event) => onDropCard(event, lineColumn, order.id)}
                      onEdit={(updates) => editOrder(order.id, updates)}
                    />
                  ))
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const OrderCard = memo(function OrderCard({
  order,
  products,
  onDragStart,
  onDragEnd,
  onDrop,
  onEdit,
}: {
  order: ReturnType<typeof useAppStore>['state']['orders'][number]
  products: ReturnType<typeof useAppStore>['state']['masterdata']['products']
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onEdit: (
    updates: Partial<
      Pick<ReturnType<typeof useAppStore>['state']['orders'][number], 'quantity' | 'packageSize' | 'productId' | 'startPolicy'>
    >,
  ) => void
}) {
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="rounded border border-slate-700 bg-slate-950/80 p-3 text-sm"
    >
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="mb-2 cursor-grab rounded bg-slate-800 px-2 py-1 text-xs text-slate-300"
      >
        ↕ Reihenfolge ändern
      </div>
      <p className="font-semibold text-slate-100">
        {order.orderNo} · {order.title}
      </p>
      <p className="text-xs text-slate-400">Fill: {order.fillStart ?? '—'} → {order.fillEnd ?? '—'}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-300">
          Menge
          <input
            type="number"
            min={1}
            value={order.quantity}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (!Number.isNaN(next) && next > 0) onEdit({ quantity: next })
            }}
            className="mt-1 w-full rounded bg-slate-700 px-2 py-1"
          />
        </label>
        <label className="text-xs text-slate-300">
          Gebinde
          <select
            value={order.packageSize}
            onChange={(event) => onEdit({ packageSize: event.target.value as PackageValue })}
            className="mt-1 w-full rounded bg-slate-700 px-2 py-1"
          >
            {packageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-300 col-span-2">
          Produkt
          <select
            value={order.productId}
            onChange={(event) => onEdit({ productId: event.target.value })}
            className="mt-1 w-full rounded bg-slate-700 px-2 py-1"
          >
            {products.map((product) => (
              <option key={product.productId} value={product.productId}>
                {product.name} ({product.articleNo})
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-300 col-span-2">
          Start-Policy
          <select
            value={order.startPolicy}
            onChange={(event) => onEdit({ startPolicy: event.target.value as StartPolicyValue })}
            className="mt-1 w-full rounded bg-slate-700 px-2 py-1"
          >
            {startPolicyOptions.map((policy) => (
              <option key={policy.value} value={policy.value}>
                {policy.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
})

export default DashboardPage
