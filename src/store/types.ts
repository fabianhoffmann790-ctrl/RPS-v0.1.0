export type HistoryEventType =
  | 'CREATE'
  | 'EDIT'
  | 'MOVE'
  | 'ASSIGN'
  | 'UNASSIGN'
  | 'IST'
  | 'MASTERDATA'
  | 'IMPORT'
  | 'EXPORT'

export interface MasterdataState {
  machines: string[]
  materials: string[]
}

export interface Order {
  id: string
  orderNo: string
  title: string
  status: 'new' | 'planned' | 'done'
  actualQuantity: number
}

export interface Assignment {
  orderId: string
  machine: string
}

export interface HistoryEvent {
  id: string
  type: HistoryEventType
  message: string
  timestamp: string
}

export interface MetaSettingsState {
  usedOrderNumbers: string[]
  lastError: string | null
}

export interface AppState {
  masterdata: MasterdataState
  orders: Order[]
  assignments: Assignment[]
  history: HistoryEvent[]
  meta: MetaSettingsState
}

export interface ActionResult {
  ok: boolean
  error?: string
}
