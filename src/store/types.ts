export type HistoryEventType =
  | 'CREATE'
  | 'EDIT'
  | 'MOVE'
  | 'ASSIGN'
  | 'UNASSIGN'
  | 'IST'
  | 'MASTERDATA'
  | 'SETTINGS'
  | 'IMPORT'
  | 'EXPORT'

export interface Product {
  productId: string
  name: string
  articleNo: string
  viscosity?: number
  makeTimeMinPerL: number
  fillFactor?: number
  bufferMin?: number
}

export interface LineRates {
  l250MlPerMin: number
  l500MlPerMin: number
  l1000MlPerMin: number
  l5000MlPerMin: number
}

export interface Line {
  lineId: string
  name: string
  rates: LineRates
}

export interface Stirrer {
  rwId: string
  name: string
}

export interface MasterdataState {
  products: Product[]
  lines: Line[]
  stirrers: Stirrer[]
  bufferMin?: number
}

export interface Order {
  id: string
  orderNo: string
  title: string
  productId: string
  articleNo: string
  quantity: number
  packageSize: '250ml' | '500ml' | '1l' | '5l'
  lineId: string
  lineName: string
  lineRate: number
  startTime: string
  startPolicy: 'asap' | 'fixed'
  startPosition: string
  fillStart?: string
  fillEnd?: string
  manualStartWarning?: boolean
  sequence: number
  status: 'planned' | 'made' | 'running' | 'done'
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
  orderNo?: string
  productId?: string
}

export interface MetaSettingsState {
  usedOrderNumbers: string[]
  lastError: string | null
}

export interface SchedulingSettingsState {
  shiftStartTime: string
}

export interface AppState {
  masterdata: MasterdataState
  orders: Order[]
  assignments: Assignment[]
  history: HistoryEvent[]
  meta: MetaSettingsState
  settings: SchedulingSettingsState
}

export interface ActionResult {
  ok: boolean
  error?: string
}
