import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ActionResult,
  AppState,
  HistoryEventType,
  MasterdataState,
  Order,
  SchedulingSettingsState,
} from './types'
import { getOrderRwWindow, hasOverlap } from './scheduling'

const STORAGE_KEY = 'rps-store-v2'

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const packageRateKey = {
  '250ml': 'l250MlPerMin',
  '500ml': 'l500MlPerMin',
  '1l': 'l1000MlPerMin',
  '5l': 'l5000MlPerMin',
} as const

const toDateTimeLocal = (value: Date) => {
  const pad = (input: number) => input.toString().padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

const minutesForOrder = (order: Order) => {
  if (order.lineRate <= 0) return 0
  return Math.max(order.quantity / order.lineRate, 0)
}

const isValidShiftStartTime = (value: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)

const sanitizeSettings = (input?: Partial<SchedulingSettingsState>): SchedulingSettingsState => ({
  shiftStartTime: isValidShiftStartTime(input?.shiftStartTime ?? '') ? input!.shiftStartTime! : '06:00',
  rwCleanMin: Number.isFinite(input?.rwCleanMin) && (input?.rwCleanMin ?? 0) >= 0 ? (input?.rwCleanMin as number) : 30,
})

const getShiftAnchorMs = (shiftStartTime: string) => {
  const [hours, minutes] = shiftStartTime.split(':').map((value) => Number(value))
  const anchor = new Date()
  anchor.setHours(Number.isFinite(hours) ? hours : 6, Number.isFinite(minutes) ? minutes : 0, 0, 0)
  return anchor.getTime()
}

const withReflowForLine = (orders: Order[], lineId: string, shiftStartTime: string): Order[] => {
  const lineOrders = orders
    .filter((order) => order.lineId === lineId && activeStatuses.includes(order.status))
    .sort((a, b) => (a.sequence === b.sequence ? a.id.localeCompare(b.id) : a.sequence - b.sequence))

  if (!lineOrders.length) return orders

  let cursorMs = getShiftAnchorMs(shiftStartTime)
  const updates = new Map<string, Pick<Order, 'fillStart' | 'fillEnd' | 'sequence' | 'manualStartWarning'>>()

  lineOrders.forEach((order, index) => {
    const durationMs = minutesForOrder(order) * 60_000
    const manualStartMs = order.startTime ? Date.parse(order.startTime) : Number.NaN
    const hasManualStart = Number.isFinite(manualStartMs)
    const manualStartWarning = Boolean(hasManualStart && manualStartMs < cursorMs)
    const fillStartMs = hasManualStart ? Math.max(cursorMs, manualStartMs) : cursorMs
    const fillStart = toDateTimeLocal(new Date(fillStartMs))
    const fillEnd = toDateTimeLocal(new Date(fillStartMs + durationMs))

    updates.set(order.id, {
      fillStart,
      fillEnd,
      sequence: index + 1,
      manualStartWarning,
    })
    cursorMs = fillStartMs + durationMs
  })

  return orders.map((order) => {
    const update = updates.get(order.id)
    return update ? { ...order, ...update } : order
  })
}

const initialState: AppState = {
  masterdata: {
    products: [
      {
        productId: 'P-STD',
        name: 'Standardprodukt',
        articleNo: 'ART-001',
        makeTimeMinPerL: 0.5,
      },
    ],
    lines: [
      {
        lineId: 'L-A',
        name: 'Linie A',
        rates: { l250MlPerMin: 120, l500MlPerMin: 100, l1000MlPerMin: 70, l5000MlPerMin: 25 },
      },
    ],
    stirrers: [{ rwId: 'RW-1', name: 'Rührwerk 1' }],
    bufferMin: 30,
  },
  orders: [],
  assignments: [],
  history: [],
  meta: {
    usedOrderNumbers: [],
    lastError: null,
  },
  settings: {
    shiftStartTime: '06:00',
    rwCleanMin: 30,
  },
}

const sanitizeMasterdata = (input?: Partial<MasterdataState> & { machines?: string[] }): MasterdataState => {
  const legacyLines = (input?.machines ?? []).map((name, index) => ({
    lineId: `L-LEGACY-${index + 1}`,
    name,
    rates: { l250MlPerMin: 0, l500MlPerMin: 0, l1000MlPerMin: 0, l5000MlPerMin: 0 },
  }))

  return {
    products: (input?.products ?? initialState.masterdata.products).map((product) => ({
      ...product,
      productId: product.productId.trim(),
      name: product.name.trim(),
      articleNo: product.articleNo.trim(),
    })),
    lines: (input?.lines?.length ? input.lines : legacyLines.length ? legacyLines : initialState.masterdata.lines).map(
      (line) => ({
        ...line,
        lineId: line.lineId.trim(),
        name: line.name.trim(),
      }),
    ),
    stirrers: (input?.stirrers ?? initialState.masterdata.stirrers).map((stirrer) => ({
      ...stirrer,
      rwId: stirrer.rwId.trim(),
      name: stirrer.name.trim(),
    })),
    bufferMin: input?.bufferMin,
  }
}

const sanitizeOrders = (orders: Order[], masterdata: MasterdataState): Order[] => {
  const defaultProduct = masterdata.products[0]
  const defaultLine = masterdata.lines[0]

  return orders.map((order) => {
    const packageSize = order.packageSize ?? '1l'
    const line = masterdata.lines.find((item) => item.lineId === order.lineId) ?? defaultLine

    return {
      ...order,
      productId: order.productId ?? defaultProduct?.productId ?? '',
      articleNo: order.articleNo ?? defaultProduct?.articleNo ?? '',
      quantity: order.quantity ?? order.actualQuantity ?? 0,
      packageSize,
      lineId: order.lineId ?? line?.lineId ?? '',
      lineName: order.lineName ?? line?.name ?? '',
      lineRate: order.lineRate ?? (line ? line.rates[packageRateKey[packageSize]] : 0),
      startTime: order.startTime ?? '',
      startPosition: order.startPosition ?? '',
      startPolicy: order.startPolicy ?? 'asap',
      sequence: order.sequence ?? 0,
      fillStart: order.fillStart,
      fillEnd: order.fillEnd,
      manualStartWarning: order.manualStartWarning ?? false,
      status: ['planned', 'made', 'running', 'done'].includes(order.status) ? order.status : 'planned',
      actualQuantity: order.actualQuantity ?? 0,
    }
  })
}

const mergeState = (parsed: Partial<AppState> & { masterdata?: Partial<MasterdataState> & { machines?: string[] } }): AppState => {
  const masterdata = sanitizeMasterdata(parsed.masterdata)

  return {
    ...initialState,
    ...parsed,
    masterdata,
    orders: sanitizeOrders(parsed.orders ?? [], masterdata),
    assignments: parsed.assignments ?? [],
    history: (parsed.history ?? []).map((event) => ({
      ...event,
      orderNo: event.orderNo,
      productId: event.productId,
    })),
    meta: {
      ...initialState.meta,
      ...parsed.meta,
      usedOrderNumbers: Array.from(new Set(parsed.meta?.usedOrderNumbers ?? [])),
    },
    settings: sanitizeSettings(parsed.settings),
  }
}

const loadState = (): AppState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    return mergeState(JSON.parse(raw) as Partial<AppState>)
  } catch {
    return initialState
  }
}

const saveState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

interface StoreContextValue {
  state: AppState
  clearError: () => void
  createOrder: (
    input: Pick<
      Order,
      | 'orderNo'
      | 'title'
      | 'productId'
      | 'articleNo'
      | 'quantity'
      | 'packageSize'
      | 'lineId'
      | 'lineName'
      | 'startTime'
      | 'startPolicy'
      | 'startPosition'
    >,
  ) => ActionResult
  editOrder: (
    orderId: string,
    updates: Partial<Pick<Order, 'title' | 'status' | 'quantity' | 'packageSize' | 'productId' | 'articleNo' | 'startPolicy'>>,
  ) => ActionResult
  moveOrder: (orderId: string, status: Order['status']) => ActionResult
  reorderLineOrders: (lineId: string, orderedIds: string[]) => ActionResult
  assignOrder: (orderId: string, machine: string) => ActionResult
  unassignOrder: (orderId: string) => ActionResult
  reportIst: (orderId: string, input: { actualQuantity?: number; remainingQuantity?: number }) => ActionResult
  updateMasterdata: (masterdata: MasterdataState) => ActionResult
  updateSettings: (settings: Partial<SchedulingSettingsState>) => ActionResult
  importData: (rawJson: string) => ActionResult
  exportData: () => string
}

const AppStoreContext = createContext<StoreContextValue | null>(null)

const historyMessage = (
  type: HistoryEventType,
  message: string,
  details?: Pick<NonNullable<AppState['history'][number]>, 'orderNo' | 'productId'>,
) => ({
  id: createId(),
  type,
  message,
  timestamp: new Date().toISOString(),
  ...details,
})

const activeStatuses: Order['status'][] = ['planned', 'made', 'running']
const isOrderLockedForMove = (order: Order) => {
  if (order.status !== 'made' && order.status !== 'running') return false
  if (!order.fillEnd) return true
  return Date.parse(order.fillEnd) > Date.now()
}

const hasUnique = (values: string[]) => new Set(values).size === values.length

const validateMasterdata = (masterdata: MasterdataState): string | null => {
  if (!masterdata.products.length) return 'Mindestens ein Produkt ist erforderlich.'
  if (!masterdata.lines.length) return 'Mindestens eine Linie ist erforderlich.'
  if (!masterdata.stirrers.length) return 'Mindestens ein Rührwerk ist erforderlich.'

  const productIds = masterdata.products.map((item) => item.productId)
  const articleNos = masterdata.products.map((item) => item.articleNo)
  const lineIds = masterdata.lines.map((item) => item.lineId)
  const lineNames = masterdata.lines.map((item) => item.name)
  const rwIds = masterdata.stirrers.map((item) => item.rwId)

  if (!hasUnique(productIds)) return 'Produkt-IDs müssen eindeutig sein.'
  if (!hasUnique(articleNos)) return 'Artikelnummern müssen eindeutig sein.'
  if (!hasUnique(lineIds)) return 'Linien-IDs müssen eindeutig sein.'
  if (!hasUnique(lineNames)) return 'Liniennamen müssen eindeutig sein.'
  if (!hasUnique(rwIds)) return 'Rührwerks-IDs müssen eindeutig sein.'

  for (const product of masterdata.products) {
    if (!product.productId || !product.name || !product.articleNo) {
      return 'Produkte benötigen productId, Name und articleNo.'
    }
    const hasBatch = product.makeTimePerBatchMin !== undefined && product.makeTimePerBatchMin > 0
    const hasPerLiter = product.makeTimeMinPerL > 0
    if (!hasBatch && !hasPerLiter) return `makeTimePerBatchMin oder makeTimeMinPerL muss > 0 sein (${product.productId}).`
    if (product.viscosity !== undefined && product.viscosity < 0) return `Viskosität darf nicht negativ sein (${product.productId}).`
    if (product.fillFactor !== undefined && product.fillFactor <= 0) return `fillFactor muss > 0 sein (${product.productId}).`
    if (product.bufferMin !== undefined && product.bufferMin < 0) return `bufferMin darf nicht negativ sein (${product.productId}).`
  }

  for (const line of masterdata.lines) {
    if (!line.lineId || !line.name) return 'Linien benötigen lineId und Namen.'
    const rates = Object.values(line.rates)
    if (rates.some((rate) => rate <= 0)) return `Alle Linienraten müssen > 0 sein (${line.lineId}).`
  }

  for (const stirrer of masterdata.stirrers) {
    if (!stirrer.rwId || !stirrer.name) return 'Rührwerke benötigen rwId und Namen.'
  }

  if (masterdata.bufferMin !== undefined && masterdata.bufferMin < 0) {
    return 'Globaler bufferMin darf nicht negativ sein.'
  }

  return null
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState())

  const commit = (updater: (prev: AppState) => AppState): AppState => {
    let nextState = state
    setState((prev) => {
      nextState = updater(prev)
      saveState(nextState)
      return nextState
    })
    return nextState
  }

  const fail = (error: string): ActionResult => {
    commit((prev) => ({ ...prev, meta: { ...prev.meta, lastError: error } }))
    return { ok: false, error }
  }

  const clearError = () => {
    commit((prev) => ({ ...prev, meta: { ...prev.meta, lastError: null } }))
  }

  const createOrder: StoreContextValue['createOrder'] = (input) => {
    const rawOrderNo = input.orderNo.trim()
    const title = input.title.trim()
    const startPosition = input.startPosition.trim()
    const line = state.masterdata.lines.find((item) => item.lineId === input.lineId)
    const rate = line ? line.rates[packageRateKey[input.packageSize]] : 0

    if (!title) return fail('Produktname ist erforderlich.')
    if (input.quantity <= 0) return fail('Menge muss größer als 0 sein.')
    if (!line) return fail('Linie ist ungültig.')
    if (rate <= 0) return fail('Die Linienrate für das gewählte Gebinde muss größer als 0 sein.')
    if (!startPosition) return fail('Startposition ist erforderlich.')

    let orderNo = rawOrderNo
    if (!orderNo) {
      let autoCounter = state.orders.length + 1
      orderNo = `AUTO-${autoCounter.toString().padStart(4, '0')}`
      while (state.meta.usedOrderNumbers.includes(orderNo)) {
        autoCounter += 1
        orderNo = `AUTO-${autoCounter.toString().padStart(4, '0')}`
      }
    }

    if (state.meta.usedOrderNumbers.includes(orderNo)) {
      return fail(`Auftragsnummer ${orderNo} ist bereits verwendet und gesperrt.`)
    }

    const newOrderId = createId()
    commit((prev) => ({
      ...prev,
      orders: [
        ...prev.orders,
        {
          id: newOrderId,
          orderNo,
          title,
          productId: input.productId,
          articleNo: input.articleNo,
          quantity: input.quantity,
          packageSize: input.packageSize,
          lineId: line.lineId,
          lineName: line.name,
          lineRate: rate,
          startTime: input.startTime,
          startPolicy: input.startTime ? 'fixed' : 'asap',
          startPosition,
          sequence: prev.orders.filter((order) => order.lineId === line.lineId).length + 1,
          status: 'planned',
          actualQuantity: 0,
        },
      ],
      meta: {
        ...prev.meta,
        usedOrderNumbers: [...prev.meta.usedOrderNumbers, orderNo],
        lastError: null,
      },
      history: [...prev.history, historyMessage('CREATE', `Auftrag ${orderNo} erstellt (${line.name}, ${input.quantity} ${input.packageSize}).`, { orderNo, productId: input.productId })],
    }))

    commit((prev) => ({ ...prev, orders: withReflowForLine(prev.orders, line.lineId, prev.settings.shiftStartTime) }))

    return { ok: true }
  }

  const editOrder: StoreContextValue['editOrder'] = (orderId, updates) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return fail('Auftrag nicht gefunden.')

    if (isOrderLockedForMove(order) && updates.startPolicy !== undefined) return fail('Auftrag im Status made/running darf bis FillEnd nicht umgehängt werden.')

    const nextPackageSize = updates.packageSize ?? order.packageSize
    const nextProductId = updates.productId ?? order.productId
    const nextProduct = state.masterdata.products.find((item) => item.productId === nextProductId)
    if (!nextProduct) return fail('Produkt nicht gefunden.')

    const nextQuantity = updates.quantity ?? order.quantity
    if (nextQuantity <= 0) return fail('Menge muss größer als 0 sein.')

    const line = state.masterdata.lines.find((item) => item.lineId === order.lineId)
    if (!line) return fail('Linie nicht gefunden.')
    const nextLineRate = line.rates[packageRateKey[nextPackageSize]]

    commit((prev) => ({
      ...prev,
      orders: withReflowForLine(
        prev.orders.map((item) =>
          item.id === orderId
            ? {
                ...item,
                ...updates,
                quantity: nextQuantity,
                packageSize: nextPackageSize,
                productId: nextProduct.productId,
                title: updates.title ?? nextProduct.name,
                articleNo: updates.articleNo ?? nextProduct.articleNo,
                lineRate: nextLineRate,
              }
            : item,
        ),
        order.lineId,
        prev.settings.shiftStartTime,
      ),
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('EDIT', `Auftrag ${order.orderNo} bearbeitet (Karte).`, { orderNo: order.orderNo, productId: nextProduct.productId })],
    }))
    return { ok: true }
  }

  const moveOrder: StoreContextValue['moveOrder'] = (orderId, status) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return fail('Auftrag nicht gefunden.')

    if (isOrderLockedForMove(order) && status !== order.status) {
      return fail('Auftrag im Status made/running darf bis FillEnd nicht umgehängt werden.')
    }

    commit((prev) => ({
      ...prev,
      orders: prev.orders.map((item) => (item.id === orderId ? { ...item, status } : item)),
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('MOVE', `Auftrag ${order.orderNo} nach ${status} verschoben.`, { orderNo: order.orderNo, productId: order.productId })],
    }))
    return { ok: true }
  }

  const reorderLineOrders: StoreContextValue['reorderLineOrders'] = (lineId, orderedIds) => {
    const lineOrders = state.orders
      .filter((order) => order.lineId === lineId && activeStatuses.includes(order.status))
      .sort((a, b) => a.sequence - b.sequence)
    const lineOrderIds = lineOrders.map((order) => order.id)

    if (!lineOrders.length) return fail('Linie enthält keine Aufträge.')
    if (lineOrderIds.length !== orderedIds.length) return fail('Ungültige Sortierungslänge.')
    if (!orderedIds.every((id) => lineOrderIds.includes(id))) return fail('Sortierung enthält unbekannte Aufträge.')

    const hasLockedOrder = lineOrders.some((order) => isOrderLockedForMove(order))
    const orderingChanged = lineOrderIds.some((id, index) => orderedIds[index] !== id)
    if (hasLockedOrder && orderingChanged) {
      return fail('Aufträge im Status made/running dürfen bis FillEnd nicht umgehängt werden.')
    }

    commit((prev) => {
      const mapped = prev.orders.map((order) => {
        if (order.lineId !== lineId) return order
        const index = orderedIds.indexOf(order.id)
        return index === -1 ? order : { ...order, sequence: index + 1 }
      })

      const reflown = withReflowForLine(mapped, lineId, prev.settings.shiftStartTime)
      const lineName = prev.masterdata.lines.find((line) => line.lineId === lineId)?.name ?? lineId

      return {
        ...prev,
        orders: reflown,
        meta: { ...prev.meta, lastError: null },
        history: [...prev.history, historyMessage('MOVE', `Linienboard ${lineName} neu sortiert.`)],
      }
    })

    return { ok: true }
  }

  const assignOrder: StoreContextValue['assignOrder'] = (orderId, machine) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return fail('Auftrag nicht gefunden.')
    const rw = state.masterdata.stirrers.find((item) => item.rwId === machine)
    if (!rw) return fail('Rührwerk unbekannt.')

    const nextWindow = getOrderRwWindow(order, state.masterdata, state.settings, machine)
    if (!nextWindow) return fail('Zuweisung blockiert: Für den Auftrag fehlen Fill-Zeiten.')

    const conflicts = state.assignments
      .filter((item) => item.machine === machine && item.orderId !== orderId)
      .map((item) => ({ assignment: item, order: state.orders.find((orderItem) => orderItem.id === item.orderId) }))
      .filter((item): item is { assignment: { orderId: string; machine: string }; order: Order } => Boolean(item.order))

    for (const conflict of conflicts) {
      const conflictWindow = getOrderRwWindow(conflict.order, state.masterdata, state.settings, machine)
      if (!conflictWindow) continue

      if (hasOverlap(nextWindow, conflictWindow)) {
        return fail(
          `${rw.rwId} belegt von ${conflictWindow.makeStart} bis ${conflictWindow.cleanEnd} durch Auftrag ${conflict.order.orderNo}.`,
        )
      }
    }

    commit((prev) => ({
      ...prev,
      assignments: [...prev.assignments.filter((item) => item.orderId !== orderId), { orderId, machine }],
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('ASSIGN', `Auftrag ${order.orderNo} zu ${rw.name} (${rw.rwId}) zugewiesen.`, { orderNo: order.orderNo, productId: order.productId })],
    }))
    return { ok: true }
  }

  const unassignOrder: StoreContextValue['unassignOrder'] = (orderId) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return fail('Auftrag nicht gefunden.')

    commit((prev) => ({
      ...prev,
      assignments: prev.assignments.filter((item) => item.orderId !== orderId),
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('UNASSIGN', `Zuweisung für Auftrag ${order.orderNo} entfernt.`, { orderNo: order.orderNo, productId: order.productId })],
    }))
    return { ok: true }
  }

  const reportIst: StoreContextValue['reportIst'] = (orderId, input) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return fail('Auftrag nicht gefunden.')

    const hasActual = typeof input.actualQuantity === 'number'
    const hasRemaining = typeof input.remainingQuantity === 'number'
    if (!hasActual && !hasRemaining) {
      return fail('Bitte Restmenge oder bereits abgefüllte Menge angeben.')
    }

    const actualQuantity = hasActual ? Number(input.actualQuantity) : order.quantity - Number(input.remainingQuantity)
    if (!Number.isFinite(actualQuantity) || actualQuantity < 0) {
      return fail('IST-Menge darf nicht negativ sein.')
    }
    if (actualQuantity > order.quantity) {
      return fail('IST-Menge darf Soll-Menge nicht überschreiten.')
    }

    const now = new Date()
    const nowLocal = toDateTimeLocal(now)
    const remaining = Math.max(order.quantity - actualQuantity, 0)
    const durationMs = order.lineRate > 0 ? (remaining / order.lineRate) * 60_000 : 0
    const fillEnd = toDateTimeLocal(new Date(now.getTime() + durationMs))
    const nextStatus: Order['status'] = remaining <= 0 ? 'done' : 'running'

    commit((prev) => {
      const updatedOrders = prev.orders.map((item) =>
        item.id === orderId
          ? {
              ...item,
              actualQuantity,
              fillStart: nowLocal,
              fillEnd,
              status: nextStatus,
            }
          : item,
      )

      const reflown = withReflowForLine(updatedOrders, order.lineId, prev.settings.shiftStartTime)

      return {
        ...prev,
        orders: reflown,
        meta: { ...prev.meta, lastError: null },
        history: [
          ...prev.history,
          historyMessage(
            'IST',
            `IST-Update für ${order.orderNo}: ${actualQuantity}/${order.quantity} abgefüllt, FillEnd neu ${fillEnd}.`,
            { orderNo: order.orderNo, productId: order.productId },
          ),
        ],
      }
    })
    return { ok: true }
  }


  const updateMasterdata: StoreContextValue['updateMasterdata'] = (masterdata) => {
    const sanitized = sanitizeMasterdata(masterdata)
    const validationError = validateMasterdata(sanitized)
    if (validationError) return fail(validationError)

    commit((prev) => ({
      ...prev,
      masterdata: sanitized,
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('MASTERDATA', 'Stammdaten aktualisiert.')],
    }))
    return { ok: true }
  }

  const updateSettings: StoreContextValue['updateSettings'] = (settings) => {
    const sanitized = sanitizeSettings(settings)

    commit((prev) => {
      if (prev.settings.shiftStartTime === sanitized.shiftStartTime && prev.settings.rwCleanMin === sanitized.rwCleanMin) {
        return { ...prev, meta: { ...prev.meta, lastError: null } }
      }

      const lineIds = Array.from(new Set(prev.orders.map((order) => order.lineId)))
      let reflownOrders = prev.orders
      for (const lineId of lineIds) {
        reflownOrders = withReflowForLine(reflownOrders, lineId, sanitized.shiftStartTime)
      }

      return {
        ...prev,
        settings: sanitized,
        orders: reflownOrders,
        meta: { ...prev.meta, lastError: null },
        history: [...prev.history, historyMessage('SETTINGS', `Planungs-Settings aktualisiert (shiftStartTime: ${sanitized.shiftStartTime}, rwCleanMin: ${sanitized.rwCleanMin}).`)],
      }
    })

    return { ok: true }
  }

  const importData: StoreContextValue['importData'] = (rawJson) => {
    try {
      const parsed = mergeState(JSON.parse(rawJson) as Partial<AppState>)
      commit((prev) => {
        const parsedOrderNumbers = parsed.orders.map((order) => order.orderNo)
        const prevOrderNumbers = prev.orders.map((order) => order.orderNo)

        return {
          ...parsed,
          meta: {
            ...parsed.meta,
            usedOrderNumbers: Array.from(
              new Set([
                ...(prev.meta.usedOrderNumbers ?? []),
                ...(parsed.meta.usedOrderNumbers ?? []),
                ...prevOrderNumbers,
                ...parsedOrderNumbers,
              ]),
            ),
            lastError: null,
          },
          history: [...parsed.history, historyMessage('IMPORT', 'Datenimport durchgeführt.')],
        }
      })
      return { ok: true }
    } catch {
      return fail('Import fehlgeschlagen: Ungültiges JSON.')
    }
  }

  const exportData = () => {
    const next = commit((prev) => ({
      ...prev,
      history: [...prev.history, historyMessage('EXPORT', 'Export ausgelöst.')],
      meta: { ...prev.meta, lastError: null },
    }))
    return JSON.stringify(next, null, 2)
  }

  const value = useMemo(
    () => ({
      state,
      clearError,
      createOrder,
      editOrder,
      moveOrder,
      reorderLineOrders,
      assignOrder,
      unassignOrder,
      reportIst,
      updateMasterdata,
      updateSettings,
      importData,
      exportData,
    }),
    [state],
  )

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

export function useAppStore() {
  const context = useContext(AppStoreContext)
  if (!context) {
    throw new Error('useAppStore muss innerhalb des AppStoreProvider verwendet werden.')
  }
  return context
}
