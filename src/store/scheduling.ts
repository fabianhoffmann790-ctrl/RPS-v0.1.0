import type { MasterdataState, Order, Product } from './types'

export interface OrderRwWindow {
  makeStart: string
  makeEnd: string
  fillStart: string
  fillEnd: string
  makeDurationMin: number
  bufferMin: number
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

export const calcMakeDurationMin = (order: Order, product: Product) => Math.max(order.quantity * product.makeTimeMinPerL, 0)

export const getOrderRwWindow = (order: Order, masterdata: MasterdataState): OrderRwWindow | null => {
  const fillStartMs = parseMs(order.fillStart)
  const fillEndMs = parseMs(order.fillEnd)
  if (Number.isNaN(fillStartMs) || Number.isNaN(fillEndMs)) return null

  const product = masterdata.products.find((item) => item.productId === order.productId)
  if (!product) return null

  const makeDurationMin = calcMakeDurationMin(order, product)
  const bufferMin = product.bufferMin ?? masterdata.bufferMin ?? 0

  const makeEndMs = fillStartMs - bufferMin * 60_000
  const makeStartMs = makeEndMs - makeDurationMin * 60_000

  return {
    makeStart: fmt(makeStartMs),
    makeEnd: fmt(makeEndMs),
    fillStart: order.fillStart!,
    fillEnd: order.fillEnd!,
    makeDurationMin,
    bufferMin,
  }
}

export const hasOverlap = (left: OrderRwWindow, right: OrderRwWindow) => {
  const leftStart = parseMs(left.makeStart)
  const leftEnd = parseMs(left.fillEnd)
  const rightStart = parseMs(right.makeStart)
  const rightEnd = parseMs(right.fillEnd)

  return leftStart < rightEnd && rightStart < leftEnd
}
