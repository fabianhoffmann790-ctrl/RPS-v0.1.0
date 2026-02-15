import { memo, useMemo, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { useAppStore } from '../store/appStore'
import { getOrderRwWindow } from '../store/scheduling'

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

const statusOptions = [
  { value: 'planned', label: 'planned' },
  { value: 'made', label: 'made' },
  { value: 'running', label: 'running' },
  { value: 'done', label: 'done' },
] as const

type PackageValue = (typeof packageOptions)[number]['value']
type StartPolicyValue = (typeof startPolicyOptions)[number]['value']
type StatusValue = (typeof statusOptions)[number]['value']
type StoreState = ReturnType<typeof useAppStore>['state']
type StoreOrder = StoreState['orders'][number]

interface LineBoardColumn {
  lineId: string
  lineName: string
  orders: StoreState['orders']
}

const EmptyColumn = memo(function EmptyColumn() {
  return <p className="text-sm text-slate-400">Keine Aufträge auf dieser Linie.</p>
})

function DashboardPage() {
  const { state, createOrder, editOrder, reorderLineOrders, assignOrder, moveOrder, reportIst } = useAppStore()
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
      (product) => product.name.toLowerCase().includes(value) || product.articleNo.toLowerCase().includes(value),
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

  const assignmentByOrderId = useMemo(() => {
    const map = new Map<string, string>()
    state.assignments.forEach((assignment) => map.set(assignment.orderId, assignment.machine))
    return map
  }, [state.assignments])

  const rwColumns = useMemo(() => {
    return state.masterdata.stirrers.map((rw) => ({
      rw,
      entries: state.assignments
        .filter((assignment) => assignment.machine === rw.rwId)
        .map((assignment) => {
          const order = state.orders.find((item) => item.id === assignment.orderId)
          if (!order) return null
          const window = getOrderRwWindow(order, state.masterdata)
          if (!window) return null
          return { order, window }
        })
        .filter((entry): entry is { order: StoreOrder; window: NonNullable<ReturnType<typeof getOrderRwWindow>> } => Boolean(entry))
        .sort((a, b) => a.window.makeStart.localeCompare(b.window.makeStart)),
    }))
  }, [state.assignments, state.masterdata, state.orders])

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

  const onDropRw = (event: DragEvent<HTMLElement>, rwId: string) => {
    event.preventDefault()
    if (!dragOrderId) return
    assignOrder(dragOrderId, rwId)
    setDragOrderId(null)
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-cyan-600/40 bg-slate-800 p-5">
        <h1 className="text-2xl font-bold text-cyan-300">Auftrag anlegen</h1>
      </div>

      <form onSubmit={onCreateOrder} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-800 p-5 md:grid-cols-2">
        <label className="text-sm text-slate-300">Produktsuche (Name / Artikelnummer)
          <input list="product-options" className="w-full rounded bg-slate-700 px-3 py-2" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="z. B. Standardprodukt oder ART-001" />
          <datalist id="product-options">{searchMatches.map((product) => <option key={product.productId} value={`${product.name} (${product.articleNo})`} />)}</datalist>
        </label>
        <label className="text-sm text-slate-300">Menge
          <input type="number" min={1} className="w-full rounded bg-slate-700 px-3 py-2" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <label className="text-sm text-slate-300">Gebinde
          <select className="w-full rounded bg-slate-700 px-3 py-2" value={packageSize} onChange={(event) => setPackageSize(event.target.value as PackageValue)}>
            {packageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-300">Linie
          <select className="w-full rounded bg-slate-700 px-3 py-2" value={lineId} onChange={(event) => setLineId(event.target.value)}>
            {state.masterdata.lines.map((line) => <option key={line.lineId} value={line.lineId}>{line.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-300">Optionale Auftragsnummer
          <input className="w-full rounded bg-slate-700 px-3 py-2" value={orderNo} onChange={(event) => setOrderNo(event.target.value)} />
        </label>
        <label className="text-sm text-slate-300">Startzeit (für Fix-Policy)
          <input type="datetime-local" className="w-full rounded bg-slate-700 px-3 py-2" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label className="text-sm text-slate-300">Start-Policy
          <select className="w-full rounded bg-slate-700 px-3 py-2" value={startPolicy} onChange={(event) => setStartPolicy(event.target.value as StartPolicyValue)}>
            {startPolicyOptions.map((policy) => <option key={policy.value} value={policy.value}>{policy.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-300">Startposition
          <input className="w-full rounded bg-slate-700 px-3 py-2" value={startPosition} onChange={(event) => setStartPosition(event.target.value)} />
        </label>

        <button type="submit" className="rounded bg-cyan-500 px-3 py-2 font-semibold text-slate-900 md:col-span-2">Auftrag speichern</button>
      </form>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="mb-3 text-xl font-semibold">Linienboard (4 Spalten)</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {boardColumns.map((lineColumn) => (
            <article key={lineColumn.lineId} className="rounded border border-slate-700 bg-slate-900/70 p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropCard(event, lineColumn)}>
              <h3 className="font-semibold text-cyan-300">{lineColumn.lineName}</h3>
              <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {lineColumn.orders.length === 0 ? <EmptyColumn /> : lineColumn.orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    products={state.masterdata.products}
                    stirrers={state.masterdata.stirrers}
                    assignedRwId={assignmentByOrderId.get(order.id)}
                    onDragStart={() => setDragOrderId(order.id)}
                    onDragEnd={() => setDragOrderId(null)}
                    onDrop={(event) => onDropCard(event, lineColumn, order.id)}
                    onEdit={(updates) => editOrder(order.id, updates)}
                    onAssign={(rwId) => assignOrder(order.id, rwId)}
                    onStatusChange={(status) => moveOrder(order.id, status)}
                    onIstActual={(actualQuantity) => reportIst(order.id, { actualQuantity })}
                    onIstRemaining={(remainingQuantity) => reportIst(order.id, { remainingQuantity })}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h2 className="mb-3 text-xl font-semibold">RW-Board (Kacheln + Zeitdarstellung)</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rwColumns.map(({ rw, entries }) => (
            <article key={rw.rwId} className="rounded border border-slate-700 bg-slate-900/70 p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropRw(event, rw.rwId)}>
              <h3 className="font-semibold text-amber-300">{rw.name} ({rw.rwId})</h3>
              <p className="mt-1 text-xs text-slate-400">Drop Auftrag hier für Assignment.</p>
              <div className="mt-3 space-y-2">
                {entries.length === 0 ? <p className="text-sm text-slate-500">Keine Belegung.</p> : entries.map(({ order, window }) => (
                  <div key={order.id} className="rounded border border-slate-700 bg-slate-950/70 p-2 text-xs" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropRw(event, rw.rwId)}>
                    <p className="font-semibold text-slate-100">{order.orderNo}</p>
                    <p className="text-slate-400">Sperrbereich: {window.makeStart} → {window.fillEnd}</p>
                  </div>
                ))}
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
  stirrers,
  assignedRwId,
  onDragStart,
  onDragEnd,
  onDrop,
  onEdit,
  onAssign,
  onStatusChange,
  onIstActual,
  onIstRemaining,
}: {
  order: StoreOrder
  products: StoreState['masterdata']['products']
  stirrers: StoreState['masterdata']['stirrers']
  assignedRwId?: string
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onEdit: (updates: Partial<Pick<StoreOrder, 'quantity' | 'packageSize' | 'productId' | 'startPolicy'>>) => void
  onAssign: (rwId: string) => void
  onStatusChange: (status: StatusValue) => void
  onIstActual: (actualQuantity: number) => void
  onIstRemaining: (remainingQuantity: number) => void
}) {
  const [selectedRw, setSelectedRw] = useState(assignedRwId ?? stirrers[0]?.rwId ?? '')
  const [actualInput, setActualInput] = useState(order.actualQuantity ? String(order.actualQuantity) : '')
  const [remainingInput, setRemainingInput] = useState('')
  const lockDrag = (order.status === 'made' || order.status === 'running') && (!order.fillEnd || Date.parse(order.fillEnd) > Date.now())

  return (
    <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="rounded border border-slate-700 bg-slate-950/80 p-3 text-sm">
      <div draggable={!lockDrag} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`mb-2 rounded px-2 py-1 text-xs text-slate-300 ${lockDrag ? 'cursor-not-allowed bg-red-900/50' : 'cursor-grab bg-slate-800'}`}>
        {lockDrag ? '🔒 made/running: Umhängen gesperrt bis FillEnd' : '↕ Reihenfolge ändern / auf RW ziehen'}
      </div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-100">{order.orderNo} · {order.title}</p>
        <span className="rounded bg-slate-800 px-2 py-1 text-xs text-cyan-300">{order.status}</span>
      </div>
      <p className="text-xs text-slate-400">Fill: {order.fillStart ?? '—'} → {order.fillEnd ?? '—'}</p>
      <p className="text-xs text-amber-300">RW: {assignedRwId ?? 'nicht zugewiesen'}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-300">Status<select value={order.status} onChange={(event) => onStatusChange(event.target.value as StatusValue)} className="mt-1 w-full rounded bg-slate-700 px-2 py-1">{statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <div className="text-xs text-slate-300">IST {order.actualQuantity}/{order.quantity}</div>
        <label className="text-xs text-slate-300">Menge<input type="number" min={1} value={order.quantity} onChange={(event) => { const next = Number(event.target.value); if (!Number.isNaN(next) && next > 0) onEdit({ quantity: next }) }} className="mt-1 w-full rounded bg-slate-700 px-2 py-1" /></label>
        <label className="text-xs text-slate-300">Gebinde<select value={order.packageSize} onChange={(event) => onEdit({ packageSize: event.target.value as PackageValue })} className="mt-1 w-full rounded bg-slate-700 px-2 py-1">{packageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="col-span-2 text-xs text-slate-300">Produkt<select value={order.productId} onChange={(event) => onEdit({ productId: event.target.value })} className="mt-1 w-full rounded bg-slate-700 px-2 py-1">{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.articleNo})</option>)}</select></label>
        <label className="col-span-2 text-xs text-slate-300">Start-Policy<select value={order.startPolicy} onChange={(event) => onEdit({ startPolicy: event.target.value as StartPolicyValue })} className="mt-1 w-full rounded bg-slate-700 px-2 py-1">{startPolicyOptions.map((policy) => <option key={policy.value} value={policy.value}>{policy.label}</option>)}</select></label>
        <label className="text-xs text-slate-300">already filled<input type="number" min={0} value={actualInput} onChange={(event) => setActualInput(event.target.value)} className="mt-1 w-full rounded bg-slate-700 px-2 py-1" /></label>
        <button type="button" onClick={() => { const next = Number(actualInput); if (!Number.isNaN(next)) onIstActual(next) }} className="rounded bg-cyan-600 px-2 py-1 text-xs font-semibold">IST übernehmen</button>
        <label className="text-xs text-slate-300">Restmenge<input type="number" min={0} value={remainingInput} onChange={(event) => setRemainingInput(event.target.value)} className="mt-1 w-full rounded bg-slate-700 px-2 py-1" /></label>
        <button type="button" onClick={() => { const next = Number(remainingInput); if (!Number.isNaN(next)) onIstRemaining(next) }} className="rounded bg-violet-600 px-2 py-1 text-xs font-semibold">Rest übernehmen</button>
        <div className="col-span-2 grid grid-cols-3 items-end gap-2">
          <label className="col-span-2 text-xs text-slate-300">RW zuweisen<select value={selectedRw} onChange={(event) => setSelectedRw(event.target.value)} className="mt-1 w-full rounded bg-slate-700 px-2 py-1">{stirrers.map((rw) => <option key={rw.rwId} value={rw.rwId}>{rw.name} ({rw.rwId})</option>)}</select></label>
          <button type="button" className="rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-slate-900" onClick={() => onAssign(selectedRw)}>Assign</button>
        </div>
      </div>
    </div>
  )
})

export default DashboardPage
