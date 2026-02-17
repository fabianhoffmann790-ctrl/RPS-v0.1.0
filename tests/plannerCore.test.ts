import test from 'node:test'
import assert from 'node:assert/strict'
import { computePlanner } from '../src/core/plannerCore.js'
import { applyIntent } from '../src/core/plannerIntents.js'
import type { PlannerJob, PlannerMasterData } from '../src/core/plannerTypes.js'

const dayStart = Date.UTC(2026, 0, 1, 6, 0, 0, 0)
const mins = (value: number) => value * 60_000
const t = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return Date.UTC(2026, 0, 1, hours, minutes, 0, 0)
}

const masterData: PlannerMasterData = {
  dayStartTs: dayStart,
  snapGridMin: 5,
  lineRateLPerMin: { L1: 100, L2: 50 },
}

const makeJob = (overrides: Partial<PlannerJob>): PlannerJob => ({
  jobId: 'J',
  productId: 'P1',
  qtyL: 1000,
  lineId: 'L1',
  status: 'PLANNED',
  createdAt: dayStart,
  ...overrides,
})

const lineBlock = (jobId: string, result: ReturnType<typeof computePlanner>) =>
  result.blocks.find((block) => block.type === 'LINE_FILL' && block.jobId === jobId)

const rwBlock = (jobId: string, result: ReturnType<typeof computePlanner>) =>
  result.blocks.find((block) => block.type === 'RW_SUPPLY' && block.jobId === jobId)

test('T01 – Append-to-tail on empty line', () => {
  const result = computePlanner([makeJob({ jobId: 'J1', qtyL: 3000, rwId: 'RW1' })], masterData)
  const fill = lineBlock('J1', result)
  const supply = rwBlock('J1', result)

  assert.equal(fill?.startTs, t('06:00'))
  assert.equal(fill?.endTs, t('06:30'))
  assert.equal(supply?.startTs, fill?.startTs)
  assert.equal(supply?.endTs, fill?.endTs)
})

test('T02 – Append-to-tail with existing planned job', () => {
  const jobs = [makeJob({ jobId: 'J1', qtyL: 3000, createdAt: dayStart }), makeJob({ jobId: 'J2', qtyL: 6000, createdAt: dayStart + 1 })]
  const result = computePlanner(jobs, masterData)

  assert.equal(lineBlock('J2', result)?.startTs, t('06:30'))
  assert.equal(lineBlock('J2', result)?.endTs, t('07:30'))
})

test('T03 – Duration recompute from qty / line rate', () => {
  const first = computePlanner([makeJob({ jobId: 'J1', qtyL: 3000 })], masterData)
  assert.equal(lineBlock('J1', first)?.endTs, t('06:30'))

  const second = computePlanner([makeJob({ jobId: 'J1', qtyL: 6000 })], masterData)
  assert.equal(lineBlock('J1', second)?.endTs, t('07:00'))
})

test('T04 – Move within line triggers ripple right', () => {
  const jobs = [
    makeJob({ jobId: 'J1', qtyL: 3000, createdAt: dayStart }),
    makeJob({ jobId: 'J2', qtyL: 3000, createdAt: dayStart + 1 }),
    makeJob({ jobId: 'J3', qtyL: 3000, createdAt: dayStart + 2 }),
  ]

  const moved = applyIntent(jobs, masterData, { type: 'MOVE_JOB_WITHIN_LINE', jobId: 'J1', newStartTs: t('06:40') })

  assert.equal(lineBlock('J1', moved)?.startTs, t('06:40'))
  assert.equal(lineBlock('J2', moved)?.startTs, t('07:10'))
  assert.equal(lineBlock('J3', moved)?.startTs, t('07:40'))
  assert.deepEqual(moved.jobs.map((job) => job.jobId), ['J1', 'J2', 'J3'])
})

test('T05 – Move within line earlier triggers ripple right', () => {
  const jobs = [
    makeJob({ jobId: 'J1', qtyL: 3000, createdAt: dayStart }),
    makeJob({ jobId: 'J2', qtyL: 3000, createdAt: dayStart + 1 }),
    makeJob({ jobId: 'J3', qtyL: 3000, createdAt: dayStart + 2 }),
  ]

  const moved = applyIntent(jobs, masterData, { type: 'MOVE_JOB_WITHIN_LINE', jobId: 'J2', newStartTs: t('06:10') })
  assert.equal(lineBlock('J2', moved)?.startTs, t('06:30'))
  assert.equal(lineBlock('J3', moved)?.startTs, t('07:00'))
})

test('T06 – Move to another line uses append-to-tail', () => {
  const jobs = [
    makeJob({ jobId: 'Jx', qtyL: 1000, lineId: 'L1', createdAt: dayStart }),
    makeJob({ jobId: 'L2A', qtyL: 6000, lineId: 'L2', createdAt: dayStart + 1 }),
    makeJob({ jobId: 'L2B', qtyL: 3000, lineId: 'L2', createdAt: dayStart + 2 }),
  ]

  const moved = applyIntent(jobs, masterData, { type: 'MOVE_JOB_TO_LINE', jobId: 'Jx', targetLineId: 'L2' })
  assert.equal(lineBlock('Jx', moved)?.startTs, t('09:00'))
})

test('T07 – RW coupling mirrors line times', () => {
  const jobs = [makeJob({ jobId: 'J1', qtyL: 3000, rwId: 'RW1' })]
  const initial = computePlanner(jobs, masterData)
  assert.equal(rwBlock('J1', initial)?.startTs, lineBlock('J1', initial)?.startTs)

  const moved = applyIntent(initial.jobs, masterData, { type: 'MOVE_JOB_WITHIN_LINE', jobId: 'J1', newStartTs: t('07:05') })
  assert.equal(rwBlock('J1', moved)?.startTs, lineBlock('J1', moved)?.startTs)
  assert.equal(rwBlock('J1', moved)?.endTs, lineBlock('J1', moved)?.endTs)
})

test('T08 – RW collision repair shifts affected job right', () => {
  const jobs = [
    makeJob({ jobId: 'J1', lineId: 'L1', qtyL: 6000, rwId: 'RW1', createdAt: dayStart }),
    makeJob({ jobId: 'J2', lineId: 'L2', qtyL: 3000, rwId: 'RW1', createdAt: dayStart + 1 }),
    makeJob({ jobId: 'J3', lineId: 'L2', qtyL: 3000, createdAt: dayStart + 2 }),
  ]

  const result = computePlanner(jobs, masterData)
  assert.ok((lineBlock('J2', result)?.startTs ?? 0) >= t('07:00'))
  assert.equal(lineBlock('J3', result)?.startTs, lineBlock('J2', result)?.endTs)
})

test('T09 – RW collision chain', () => {
  const jobs = [
    makeJob({ jobId: 'J1', lineId: 'L1', qtyL: 6000, rwId: 'RW1', createdAt: dayStart }),
    makeJob({ jobId: 'J2', lineId: 'L2', qtyL: 3000, rwId: 'RW1', createdAt: dayStart + 1 }),
    makeJob({ jobId: 'J3', lineId: 'L1', qtyL: 3000, rwId: 'RW1', createdAt: dayStart + 2 }),
  ]
  const result = computePlanner(jobs, masterData)

  const rw = result.blocks.filter((block) => block.type === 'RW_SUPPLY').sort((a, b) => a.startTs - b.startTs)
  assert.ok(rw[1].startTs >= rw[0].endTs)
  assert.ok(rw[2].startTs >= rw[1].endTs)
})

test('T10 – DONE blocks are immutable and never moved', () => {
  const done = makeJob({ jobId: 'J_DONE', status: 'DONE', lineId: 'L1', rwId: 'RW1', startTs: t('06:00'), endTs: t('07:00') })
  const planned = makeJob({ jobId: 'J2', lineId: 'L1', qtyL: 3000, createdAt: dayStart + 1 })
  const result = computePlanner([done, planned], masterData)

  assert.equal(lineBlock('J_DONE', result)?.startTs, t('06:00'))
  assert.equal(lineBlock('J_DONE', result)?.endTs, t('07:00'))
  assert.equal(lineBlock('J2', result)?.startTs, t('07:00'))
})

test('T11 – IN_PROGRESS not moved left; right propagation allowed', () => {
  const jobs = [
    makeJob({ jobId: 'J1', lineId: 'L1', qtyL: 6000, rwId: 'RW1', createdAt: dayStart }),
    makeJob({ jobId: 'J_RUN', lineId: 'L2', qtyL: 3000, rwId: 'RW1', status: 'IN_PROGRESS', startTs: t('08:00'), createdAt: dayStart + 1 }),
    makeJob({ jobId: 'J_FOLLOW', lineId: 'L2', qtyL: 3000, createdAt: dayStart + 2 }),
  ]

  const result = computePlanner(jobs, masterData)
  assert.equal(lineBlock('J_RUN', result)?.startTs, t('08:00'))
  assert.ok((lineBlock('J_FOLLOW', result)?.startTs ?? 0) >= (lineBlock('J_RUN', result)?.endTs ?? 0))
})

test('T12 – Snap grid enforcement', () => {
  const result = applyIntent([makeJob({ jobId: 'J1', qtyL: 3000 })], masterData, {
    type: 'MOVE_JOB_WITHIN_LINE',
    jobId: 'J1',
    newStartTs: t('08:03'),
  })

  assert.equal(lineBlock('J1', result)?.startTs, t('08:05'))
  result.jobs.forEach((job) => {
    assert.equal(((job.startTs ?? 0) - dayStart) % mins(5), 0)
    assert.equal(((job.endTs ?? 0) - dayStart) % mins(5), 0)
  })
})
