import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ActionResult,
  AppState,
  HistoryEventType,
  MasterdataState,
  Order,
} from './types'

const STORAGE_KEY = 'rps-store-v2'

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

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

const mergeState = (parsed: Partial<AppState> & { masterdata?: Partial<MasterdataState> & { machines?: string[] } }): AppState => ({
  ...initialState,
  ...parsed,
  masterdata: sanitizeMasterdata(parsed.masterdata),
  orders: parsed.orders ?? [],
  assignments: parsed.assignments ?? [],
  history: parsed.history ?? [],
  meta: {
    ...initialState.meta,
    ...parsed.meta,
    usedOrderNumbers: Array.from(new Set(parsed.meta?.usedOrderNumbers ?? [])),
  },
})

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
  createOrder: (input: Pick<Order, 'orderNo' | 'title'>) => ActionResult
  editOrder: (orderId: string, updates: Partial<Pick<Order, 'title' | 'status'>>) => ActionResult
  moveOrder: (orderId: string, status: Order['status']) => ActionResult
  assignOrder: (orderId: string, machine: string) => ActionResult
  unassignOrder: (orderId: string) => ActionResult
  reportIst: (orderId: string, actualQuantity: number) => ActionResult
  updateMasterdata: (masterdata: MasterdataState) => ActionResult
  importData: (rawJson: string) => ActionResult
  exportData: () => string
}

const AppStoreContext = createContext<StoreContextValue | null>(null)

const historyMessage = (type: HistoryEventType, message: string) => ({
  id: createId(),
  type,
  message,
  timestamp: new Date().toISOString(),
})

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
    if (product.makeTimeMinPerL <= 0) return `makeTimeMinPerL muss > 0 sein (${product.productId}).`
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
    const orderNo = input.orderNo.trim()
    const title = input.title.trim()

    if (!orderNo) return fail('Auftragsnummer ist erforderlich.')
    if (!title) return fail('Titel ist erforderlich.')
    if (state.meta.usedOrderNumbers.includes(orderNo)) {
      return fail(`Auftragsnummer ${orderNo} ist bereits verwendet und gesperrt.`)
    }

    commit((prev) => ({
      ...prev,
      orders: [...prev.orders, { id: createId(), orderNo, title, status: 'new', actualQuantity: 0 }],
      meta: {
        ...prev.meta,
        usedOrderNumbers: [...prev.meta.usedOrderNumbers, orderNo],
        lastError: null,
      },
      history: [...prev.history, historyMessage('CREATE', `Auftrag ${orderNo} erstellt.`)],
    }))

    return { ok: true }
  }

  const editOrder: StoreContextValue['editOrder'] = (orderId, updates) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return fail('Auftrag nicht gefunden.')

    commit((prev) => ({
      ...prev,
      orders: prev.orders.map((item) => (item.id === orderId ? { ...item, ...updates } : item)),
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('EDIT', `Auftrag ${order.orderNo} bearbeitet.`)],
    }))
    return { ok: true }
  }

  const moveOrder: StoreContextValue['moveOrder'] = (orderId, status) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return fail('Auftrag nicht gefunden.')

    commit((prev) => ({
      ...prev,
      orders: prev.orders.map((item) => (item.id === orderId ? { ...item, status } : item)),
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('MOVE', `Auftrag ${order.orderNo} nach ${status} verschoben.`)],
    }))
    return { ok: true }
  }

  const assignOrder: StoreContextValue['assignOrder'] = (orderId, machine) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return fail('Auftrag nicht gefunden.')
    if (!state.masterdata.lines.some((line) => line.name === machine)) return fail('Linie unbekannt.')

    commit((prev) => ({
      ...prev,
      assignments: [...prev.assignments.filter((item) => item.orderId !== orderId), { orderId, machine }],
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('ASSIGN', `Auftrag ${order.orderNo} zu ${machine} zugewiesen.`)],
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
      history: [...prev.history, historyMessage('UNASSIGN', `Zuweisung für Auftrag ${order.orderNo} entfernt.`)],
    }))
    return { ok: true }
  }

  const reportIst: StoreContextValue['reportIst'] = (orderId, actualQuantity) => {
    const order = state.orders.find((item) => item.id === orderId)
    if (!order) return fail('Auftrag nicht gefunden.')
    if (actualQuantity < 0) return fail('IST-Menge darf nicht negativ sein.')

    commit((prev) => ({
      ...prev,
      orders: prev.orders.map((item) => (item.id === orderId ? { ...item, actualQuantity } : item)),
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('IST', `IST-Menge für ${order.orderNo} auf ${actualQuantity} gesetzt.`)],
    }))
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

  const importData: StoreContextValue['importData'] = (rawJson) => {
    try {
      const parsed = mergeState(JSON.parse(rawJson) as Partial<AppState>)
      commit((prev) => ({
        ...parsed,
        meta: {
          ...parsed.meta,
          usedOrderNumbers: Array.from(
            new Set([...(prev.meta.usedOrderNumbers ?? []), ...(parsed.meta.usedOrderNumbers ?? [])]),
          ),
          lastError: null,
        },
        history: [...parsed.history, historyMessage('IMPORT', 'Datenimport durchgeführt.')],
      }))
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
      assignOrder,
      unassignOrder,
      reportIst,
      updateMasterdata,
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
