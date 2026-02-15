import { memo, useMemo, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { useAppStore } from '../store/appStore'
import { deriveRwSegments, getOrderRwWindow } from '../store/scheduling'

const packageOptions = [
  { value: '250ml', label: '250 ml' },
  { value: '500ml', label: '500 ml' },
  { value: '1l', label: '1 L' },
  { value: '5l', label: '5 L' },
] as const

const statusOptions = [
  { value: 'planned', label: 'planned' },
  { value: 'made', label: 'made' },
  { value: 'running', label: 'running' },
  { value: 'done', label: 'done' },
] as const

type PackageValue = (typeof packageOptions)[number]['value']
type StatusValue = (typeof statusOptions)[number]['value']
type StoreState = ReturnType<typeof useAppStore>['state']
type StoreOrder = StoreState['orders'][number]

interface LineBoardColumn {
  lineId: string
  lineName: string
  orders: StoreState['orders']
}

interface TimelineBlock {
  id: string
  label: string
  start: string
  end: string
  tone: 'lineFill' | 'make' | 'hold' | 'clean'
  orderId?: string
}

type TimelineRange = { min: number; max: number } | null

const parseMs = (value?: string) => (value ? Date.parse(value) : Number.NaN)

const toDateTimeLocal = (valueMs: number) => {
  const date = new Date(valueMs)
  const pad = (input: number) => input.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const EmptyColumn = memo(function EmptyColumn() {
  return <p className="text-sm text-slate-400">Keine Aufträge auf dieser Linie.</p>
})

function DashboardPage() {
  const { state, createOrder, editOrder, reorderLineOrders, assignOrder, moveOrder } = useAppStore()
  const [search, setSearch] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [quantity, setQuantity] = useState('')
  const [packageSize, setPackageSize] = useState<PackageValue>('1l')
  const [lineId, setLineId] = useState(state.masterdata.lines[0]?.lineId ?? '')
  const [manualStartEnabled, setManualStartEnabled] = useState(false)
  const [manualStartTime, setManualStartTime] = useState('')
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
          const window = getOrderRwWindow(order, state.masterdata, state.settings, rw.rwId)
          if (!window) return null
          return { order, window }
        })
        .filter((entry): entry is { order: StoreOrder; window: NonNullable<ReturnType<typeof getOrderRwWindow>> } => Boolean(entry))
        .sort((a, b) => a.window.makeStart.localeCompare(b.window.makeStart)),
    }))
  }, [state.assignments, state.masterdata, state.orders, state.settings])

  const lineEvents = useMemo(() => {
    const byLineId = new Map<string, TimelineBlock[]>()

    boardColumns.forEach((column) => {
      const entries = column.orders
        .filter((order) => Boolean(order.fillStart && order.fillEnd))
        .map((order) => ({
          id: order.id,
          orderId: order.id,
          label: order.orderNo,
          start: order.fillStart as string,
          end: order.fillEnd as string,
          tone: 'lineFill' as const,
        }))

      byLineId.set(column.lineId, entries)
    })

    return byLineId
  }, [boardColumns])

  const rwDerived = useMemo(
    () => deriveRwSegments({ orders: state.orders, assignments: state.assignments, masterdata: state.masterdata, settings: state.settings }),
    [state.orders, state.assignments, state.masterdata, state.settings],
  )

  const lineMakeEvents = useMemo(() => {
    const byLineId = new Map<string, TimelineBlock[]>()
    const rwNameById = new Map(state.masterdata.stirrers.map((rw) => [rw.rwId, rw.name]))

    state.orders.forEach((order) => {
      const assignment = state.assignments.find((item) => item.orderId === order.id)
      if (!assignment) return

      const window = rwDerived.windowsByOrderId.get(order.id)
      if (!window) return

      const list = byLineId.get(order.lineId) ?? []
      const rwName = rwNameById.get(assignment.machine) ?? assignment.machine
      list.push({
        id: `make-${order.id}`,
        orderId: order.id,
        label: rwName,
        start: window.makeStart,
        end: window.makeEnd,
        tone: 'make',
      })
      byLineId.set(order.lineId, list)
    })

    return byLineId
  }, [rwDerived.windowsByOrderId, state.assignments, state.masterdata.stirrers, state.orders])

  const rwEvents = useMemo(() => {
    const byRwId = new Map<string, TimelineBlock[]>()

    rwDerived.rwSegments.forEach((segment) => {
      const list = byRwId.get(segment.rwId) ?? []
      const order = state.orders.find((item) => item.id === segment.orderId)
      const start = toDateTimeLocal(segment.startMs)
      const end = toDateTimeLocal(segment.endMs)
      list.push({
        id: `${segment.orderId}-${segment.phase}-${segment.startMs}`,
        orderId: segment.orderId,
        label: order?.orderNo ?? segment.orderId,
        start,
        end,
        tone: segment.phase === 'MAKE' ? 'make' : segment.phase === 'CLEAN' ? 'clean' : 'hold',
      })
      byRwId.set(segment.rwId, list)
    })

    return byRwId
  }, [rwDerived.rwSegments, state.orders])

  const timelineRange = useMemo(() => {
    const values = [
      ...Array.from(lineEvents.values()).flatMap((events) => events.flatMap((entry) => [parseMs(entry.start), parseMs(entry.end)])),
      ...Array.from(lineMakeEvents.values()).flatMap((events) => events.flatMap((entry) => [parseMs(entry.start), parseMs(entry.end)])),
      ...Array.from(rwEvents.values()).flatMap((events) => events.flatMap((entry) => [parseMs(entry.start), parseMs(entry.end)])),
    ].filter(Number.isFinite)

    if (!values.length) return null
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [lineEvents, lineMakeEvents, rwEvents])

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
      startTime: manualStartEnabled ? manualStartTime : '',
      startPolicy: manualStartEnabled && manualStartTime ? 'fixed' : 'asap',
      startPosition,
    })

    if (result.ok) {
      setSearch('')
      setOrderNo('')
      setQuantity('')
      setPackageSize('1l')
      setManualStartEnabled(false)
      setManualStartTime('')
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
        <label className="text-sm text-slate-300 md:col-span-2">
          <span className="mb-2 flex items-center gap-2">
            <input type="checkbox" checked={manualStartEnabled} onChange={(event) => setManualStartEnabled(event.target.checked)} />
            Manuelle Startzeit setzen (optional)
          </span>
          {manualStartEnabled ? <input type="datetime-local" className="w-full rounded bg-slate-700 px-3 py-2" value={manualStartTime} onChange={(event) => setManualStartTime(event.target.value)} /> : <p className="text-xs text-slate-400">Ohne manuelle Startzeit wird automatisch ans Linienende angehängt.</p>}
        </label>
        <label className="text-sm text-slate-300">Startposition
          <input className="w-full rounded bg-slate-700 px-3 py-2" value={startPosition} onChange={(event) => setStartPosition(event.target.value)} />
        </label>

        <button type="submit" className="rounded bg-cyan-500 px-3 py-2 font-semibold text-slate-900 md:col-span-2">Auftrag speichern</button>
      </form>

      <div className="space-y-6">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h2 className="mb-3 text-xl font-semibold">Linienboard (oben)</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {boardColumns.map((lineColumn) => (
              <article key={lineColumn.lineId} className="rounded border border-slate-700 bg-slate-900/70 p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropCard(event, lineColumn)}>
                <h3 className="font-semibold text-cyan-300">{lineColumn.lineName} · Aufträge</h3>
                <div className="mt-3 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
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
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
          <article className="mt-4 rounded border border-slate-700 bg-slate-900/70 p-3">
            <h3 className="font-semibold text-cyan-300">Linien-Zeitachsen</h3>
            <div className="mt-3 space-y-3">
              {boardColumns.map((lineColumn) => (
                <div key={`${lineColumn.lineId}-timeline`}>
                  <LineTimeline
                    title={`Zeitachse ${lineColumn.lineName}`}
                    fillEntries={lineEvents.get(lineColumn.lineId) ?? []}
                    makeEntries={lineMakeEvents.get(lineColumn.lineId) ?? []}
                    range={timelineRange}
                  />
                </div>
              ))}
            </div>
          </article>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <h2 className="mb-3 text-xl font-semibold">RW-Board (unten)</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rwColumns.map(({ rw, entries }) => (
              <article key={rw.rwId} className="rounded border border-slate-700 bg-slate-900/70 p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropRw(event, rw.rwId)}>
                <h3 className="font-semibold text-amber-300">{rw.name} ({rw.rwId})</h3>
                <p className="mt-1 text-xs text-slate-400">Drop Auftrag hier für Assignment.</p>
                {rwDerived.conflicts.some((conflict) => conflict.rwId === rw.rwId) ? (
                  <div className="mt-3 rounded border border-rose-500/70 bg-rose-950/40 p-2 text-xs text-rose-200">Konflikt im RW-Zeitstrahl erkannt. Assignment blockiert.</div>
                ) : (
                  <SingleTrackTimeline
                    title="RWTimeline"
                    entries={rwEvents.get(rw.rwId) ?? []}
                    range={timelineRange}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onDropRw(event, rw.rwId)}
                  />
                )}
                <div className="mt-3 space-y-2">
                  {entries.length === 0 ? <p className="text-sm text-slate-500">Keine Belegung.</p> : entries.map(({ order, window }) => (
                    <div key={order.id} className="rounded border border-slate-700 bg-slate-950/70 p-2 text-xs" onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropRw(event, rw.rwId)}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-100">{order.orderNo}</p>
                        <select value={order.status} onChange={(event) => moveOrder(order.id, event.target.value as StatusValue)} className="rounded bg-slate-700 px-2 py-1 text-[11px] text-slate-100">
                          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <p className="text-slate-400">Sperrbereich: {window.makeStart} → {window.cleanEnd}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}


const toneClass = (tone: TimelineBlock['tone']) => {
  if (tone === 'make') return 'border border-blue-300/80 bg-blue-500/70 text-slate-100'
  if (tone === 'clean') return 'border border-orange-300/80 bg-orange-500/70 text-slate-900'
  if (tone === 'hold' || tone === 'lineFill') return 'border border-slate-300/70 bg-slate-100/10 text-slate-100'
  return 'border border-slate-500 bg-slate-600/40 text-slate-100'
}

const renderTimelineBlock = (entry: TimelineBlock, range: NonNullable<TimelineRange>, width: number, topClass = 'top-1') => {
  const start = parseMs(entry.start)
  const end = parseMs(entry.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  const left = ((start - range.min) / width) * 100
  const blockWidth = Math.max(((end - start) / width) * 100, 2)
  return (
    <div
      key={entry.id}
      className={`absolute ${topClass} h-8 overflow-hidden rounded px-1 text-[10px] ${toneClass(entry.tone)}`}
      style={{ left: `${left}%`, width: `${Math.min(blockWidth, 100 - left)}%` }}
      title={`${entry.label}: ${entry.start} → ${entry.end}`}
    >
      {entry.label}
    </div>
  )
}

const LineTimeline = memo(function LineTimeline({
  title,
  fillEntries,
  makeEntries,
  range,
}: {
  title: string
  fillEntries: TimelineBlock[]
  makeEntries: TimelineBlock[]
  range: TimelineRange
}) {
  if (!range) return null

  const width = Math.max(range.max - range.min, 60_000)
  const connectorTargets = makeEntries
    .map((makeEntry) => {
      const fillEntry = fillEntries.find((fill) => fill.orderId === makeEntry.orderId)
      if (!fillEntry) return null
      const makeEnd = parseMs(makeEntry.end)
      const fillStart = parseMs(fillEntry.start)
      if (!Number.isFinite(makeEnd) || !Number.isFinite(fillStart)) return null
      const makeEndLeft = ((makeEnd - range.min) / width) * 100
      const fillStartLeft = ((fillStart - range.min) / width) * 100
      return { id: makeEntry.id, makeEndLeft, fillStartLeft }
    })
    .filter((entry): entry is { id: string; makeEndLeft: number; fillStartLeft: number } => Boolean(entry))

  return (
    <div className="mt-3 rounded border border-slate-700 bg-slate-950/70 p-2">
      <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">{title}</p>
      <div className="overflow-x-auto pb-1">
        <div className="relative h-20 min-w-[42rem]">
          <div className="absolute inset-x-0 top-1 h-8 rounded border border-slate-700/70" />
          <div className="absolute inset-x-0 top-11 h-8 rounded border border-slate-700/70" />
          {fillEntries.map((entry) => renderTimelineBlock(entry, range, width, 'top-1'))}
          {makeEntries.map((entry) => renderTimelineBlock(entry, range, width, 'top-11'))}
          {connectorTargets.map((connector) => (
            <div
              key={connector.id}
              className="absolute top-9 h-2 border-t border-cyan-300/70"
              style={{ left: `${Math.min(connector.makeEndLeft, connector.fillStartLeft)}%`, width: `${Math.max(Math.abs(connector.fillStartLeft - connector.makeEndLeft), 0.5)}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
})

const SingleTrackTimeline = memo(function SingleTrackTimeline({
  title,
  entries,
  range,
  fixedHeight,
  onDragOver,
  onDrop,
}: {
  title: string
  entries: TimelineBlock[]
  range: TimelineRange
  fixedHeight?: boolean
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void
  onDrop?: (event: DragEvent<HTMLDivElement>) => void
}) {
  if (!range) return null

  if (entries.length === 0) {
    return (
      <div className="mt-3 rounded border border-slate-700 bg-slate-950/40 p-2" onDragOver={onDragOver} onDrop={onDrop}>
        <p className="text-[11px] text-slate-500">{title}: keine Events im aktuellen Zeitfenster.</p>
      </div>
    )
  }

  const width = Math.max(range.max - range.min, 60_000)

  return (
    <div className="mt-3 rounded border border-slate-700 bg-slate-950/70 p-2" onDragOver={onDragOver} onDrop={onDrop}>
      <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">{title}</p>
      <div className="overflow-x-auto pb-1">
        <div className={`relative min-w-[42rem] ${fixedHeight ? 'h-16' : 'h-10'}`}>
          {entries.map((entry) => renderTimelineBlock(entry, range, width))}
        </div>
      </div>
    </div>
  )
})

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
}: {
  order: StoreOrder
  products: StoreState['masterdata']['products']
  stirrers: StoreState['masterdata']['stirrers']
  assignedRwId?: string
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onEdit: (updates: Partial<Pick<StoreOrder, 'quantity' | 'packageSize' | 'productId'>>) => void
  onAssign: (rwId: string) => void
}) {
  const [selectedRw, setSelectedRw] = useState(assignedRwId ?? stirrers[0]?.rwId ?? '')
  const [expanded, setExpanded] = useState(false)
  const [renderTs] = useState(() => Date.now())
  const lockDrag = (order.status === 'made' || order.status === 'running') && (!order.fillEnd || Date.parse(order.fillEnd) > renderTs)

  return (
    <div onDragOver={(event) => event.preventDefault()} onDrop={onDrop} className="rounded border border-slate-700 bg-slate-950/80 p-2 text-sm">
      <div className="flex items-center gap-2">
        <div
          draggable={!lockDrag}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className={`rounded px-2 py-1 text-xs text-slate-300 ${lockDrag ? 'cursor-not-allowed bg-red-900/50' : 'cursor-grab bg-slate-800'}`}
          title={lockDrag ? 'made/running: Umhängen gesperrt bis FillEnd' : 'Reihenfolge ändern / auf RW ziehen'}
        >
          ↕
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-100">{order.orderNo}</p>
          <p className="truncate text-xs text-slate-400">{order.title} · {order.quantity} L</p>
        </div>
        <span className="rounded bg-slate-800 px-2 py-1 text-xs text-cyan-300">{order.status}</span>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
          aria-label={expanded ? 'Details einklappen' : 'Details ausklappen'}
        >
          {expanded ? '▴' : '▾'}
        </button>
      </div>
      {expanded ? (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-700 pt-2">
          <p className="col-span-2 text-xs text-slate-400">Artikelnummer: {order.articleNo}</p>
          <p className="col-span-2 text-xs text-slate-400">Fill: {order.fillStart ?? '—'} → {order.fillEnd ?? '—'}</p>
          {order.manualStartWarning ? <p className="col-span-2 inline-flex rounded bg-amber-500/20 px-2 py-1 text-[11px] text-amber-200">⚠ Manuelle Startzeit lag vor möglichem Start</p> : null}
          <p className="col-span-2 text-xs text-amber-300">RW: {assignedRwId ?? 'nicht zugewiesen'}</p>
          <label className="text-xs text-slate-300">Menge<input type="number" min={1} value={order.quantity} onChange={(event) => { const next = Number(event.target.value); if (!Number.isNaN(next) && next > 0) onEdit({ quantity: next }) }} className="mt-1 w-full rounded bg-slate-700 px-2 py-1" /></label>
          <label className="text-xs text-slate-300">Gebinde<select value={order.packageSize} onChange={(event) => onEdit({ packageSize: event.target.value as PackageValue })} className="mt-1 w-full rounded bg-slate-700 px-2 py-1">{packageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="col-span-2 text-xs text-slate-300">Produkt<select value={order.productId} onChange={(event) => onEdit({ productId: event.target.value })} className="mt-1 w-full rounded bg-slate-700 px-2 py-1">{products.map((product) => <option key={product.productId} value={product.productId}>{product.name} ({product.articleNo})</option>)}</select></label>
          <div className="col-span-2 grid grid-cols-3 items-end gap-2">
            <label className="col-span-2 text-xs text-slate-300">RW direkt<select value={selectedRw} onChange={(event) => setSelectedRw(event.target.value)} className="mt-1 w-full rounded bg-slate-700 px-2 py-1">{stirrers.map((rw) => <option key={rw.rwId} value={rw.rwId}>{rw.name} ({rw.rwId})</option>)}</select></label>
            <button type="button" className="rounded bg-amber-400 px-2 py-1 text-xs font-semibold text-slate-900" onClick={() => onAssign(selectedRw)}>Assign</button>
          </div>
        </div>
      ) : null}
    </div>
  )
})

export default DashboardPage
