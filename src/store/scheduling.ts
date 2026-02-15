import type { Assignment, MasterdataState, Order, Product, SchedulingSettingsState } from './types'

export interface OrderRwWindow {
  makeStart: string
  makeEnd: string
  fillStart: string
  fillEnd: string
  cleanEnd: string
  makeDurationMin: number
  cleanDurationMin: number
}

export type RwPhase = 'MAKE' | 'HOLD' | 'CLEAN'

export interface RwSegment {
  rwId: string
  orderId: string
  phase: RwPhase
  startMs: number
  endMs: number
}

export interface RwConflict {
  rwId: string
  leftOrderId: string
  rightOrderId: string
}

const parseMs = (value?: string) => {
  if (!value) return Number.NaN
  return Date.parse(value)
}

const fmt = (valueMs: number) => {
  const date = new Date(valueMs)
  const pad = (input: number) => input.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const getProductMakeDurationMin = (order: Order, product: Product) => {
  if (Number.isFinite(product.makeTimePerBatchMin) && (product.makeTimePerBatchMin ?? 0) > 0) {
    return product.makeTimePerBatchMin as number
  }
  return Math.max(order.quantity * product.makeTimeMinPerL, 0)
}

const getRwCleanDurationMin = (rwId: string, masterdata: MasterdataState, settings: SchedulingSettingsState) => {
  const stirrer = masterdata.stirrers.find((item) => item.rwId === rwId)
  if (Number.isFinite(stirrer?.rwCleanMin) && (stirrer?.rwCleanMin ?? 0) >= 0) return stirrer?.rwCleanMin as number
  return Math.max(settings.rwCleanMin, 0)
}

export const getOrderRwWindow = (
  order: Order,
  masterdata: MasterdataState,
  settings: SchedulingSettingsState,
  rwId: string,
): OrderRwWindow | null => {
  const fillStartMs = parseMs(order.fillStart)
  const fillEndMs = parseMs(order.fillEnd)
  if (!Number.isFinite(fillStartMs) || !Number.isFinite(fillEndMs) || fillEndMs <= fillStartMs) return null

  const product = masterdata.products.find((item) => item.productId === order.productId)
  if (!product) return null

  const makeDurationMin = getProductMakeDurationMin(order, product)
  if (!Number.isFinite(makeDurationMin) || makeDurationMin <= 0) return null

  const cleanDurationMin = getRwCleanDurationMin(rwId, masterdata, settings)
  if (!Number.isFinite(cleanDurationMin) || cleanDurationMin < 0) return null

  const makeEndMs = fillStartMs
  const makeStartMs = makeEndMs - makeDurationMin * 60_000
  const cleanEndMs = fillEndMs + cleanDurationMin * 60_000

  if (!Number.isFinite(makeStartMs) || !Number.isFinite(cleanEndMs) || makeStartMs >= makeEndMs || cleanEndMs <= fillEndMs) return null

  return {
    makeStart: fmt(makeStartMs),
    makeEnd: fmt(makeEndMs),
    fillStart: order.fillStart as string,
    fillEnd: order.fillEnd as string,
    cleanEnd: fmt(cleanEndMs),
    makeDurationMin,
    cleanDurationMin,
  }
}

export const hasOverlap = (left: OrderRwWindow, right: OrderRwWindow) => {
  const leftStart = parseMs(left.makeStart)
  const leftEnd = parseMs(left.cleanEnd)
  const rightStart = parseMs(right.makeStart)
  const rightEnd = parseMs(right.cleanEnd)

  return leftStart < rightEnd && rightStart < leftEnd
}

export const deriveRwSegments = ({
  orders,
  assignments,
  masterdata,
  settings,
}: {
  orders: Order[]
  assignments: Assignment[]
  masterdata: MasterdataState
  settings: SchedulingSettingsState
}) => {
  const rwSegments: RwSegment[] = []
  const windowsByOrderId = new Map<string, OrderRwWindow>()

  assignments.forEach((assignment) => {
    const order = orders.find((item) => item.id === assignment.orderId)
    if (!order) return

    const window = getOrderRwWindow(order, masterdata, settings, assignment.machine)
    if (!window) return

    windowsByOrderId.set(order.id, window)

    const segments: RwSegment[] = [
      { rwId: assignment.machine, orderId: order.id, phase: 'MAKE', startMs: parseMs(window.makeStart), endMs: parseMs(window.makeEnd) },
      { rwId: assignment.machine, orderId: order.id, phase: 'HOLD', startMs: parseMs(window.fillStart), endMs: parseMs(window.fillEnd) },
      { rwId: assignment.machine, orderId: order.id, phase: 'CLEAN', startMs: parseMs(window.fillEnd), endMs: parseMs(window.cleanEnd) },
    ]

    segments.forEach((segment) => {
      if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.endMs <= segment.startMs) return
      rwSegments.push(segment)
    })
  })

  const conflicts: RwConflict[] = []
  const byRw = new Map<string, RwSegment[]>()
  rwSegments.forEach((segment) => {
    const list = byRw.get(segment.rwId) ?? []
    list.push(segment)
    byRw.set(segment.rwId, list)
  })

  byRw.forEach((segments, rwId) => {
    const sorted = [...segments].sort((a, b) => (a.startMs === b.startMs ? a.endMs - b.endMs : a.startMs - b.startMs))
    for (let index = 1; index < sorted.length; index += 1) {
      const left = sorted[index - 1]
      const right = sorted[index]
      if (left.orderId === right.orderId) continue
      if (right.startMs < left.endMs) {
        conflicts.push({ rwId, leftOrderId: left.orderId, rightOrderId: right.orderId })
      }
    }
  })

  return { rwSegments, windowsByOrderId, conflicts }
}
