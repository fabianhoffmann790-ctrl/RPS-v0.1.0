import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ActionResult, AppState, HistoryEventType, Order } from './types'

const STORAGE_KEY = 'rps-store-v2'

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const initialState: AppState = {
  masterdata: {
    machines: ['Maschine-A', 'Maschine-B'],
    materials: ['Standard'],
  },
  orders: [],
  assignments: [],
  history: [],
  meta: {
    usedOrderNumbers: [],
    lastError: null,
  },
}

const mergeState = (parsed: Partial<AppState>): AppState => ({
  ...initialState,
  ...parsed,
  masterdata: {
    ...initialState.masterdata,
    ...parsed.masterdata,
  },
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
  addMachine: (machine: string) => ActionResult
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
    if (!state.masterdata.machines.includes(machine)) return fail('Maschine unbekannt.')

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

  const addMachine: StoreContextValue['addMachine'] = (machine) => {
    const normalized = machine.trim()
    if (!normalized) return fail('Maschinenname ist erforderlich.')
    if (state.masterdata.machines.includes(normalized)) return fail('Maschine existiert bereits.')

    commit((prev) => ({
      ...prev,
      masterdata: { ...prev.masterdata, machines: [...prev.masterdata.machines, normalized] },
      meta: { ...prev.meta, lastError: null },
      history: [...prev.history, historyMessage('MASTERDATA', `Maschine ${normalized} hinzugefügt.`)],
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
      addMachine,
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
