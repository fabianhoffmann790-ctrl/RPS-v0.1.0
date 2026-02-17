import test from 'node:test'
import assert from 'node:assert/strict'
import { computePlanner } from '../src/core/plannerCore.js'
import { applyIntent } from '../src/core/plannerIntents.js'
import type { Job, MasterData } from '../src/core/plannerTypes.js'

const baseMasterData: MasterData = {
  dayStartMin: 360,
  snapGridMin: 5,
  lineIds: ['L1', 'L2'],
  rwIds: ['RW1', 'RW2'],
}

const makeJob = (overrides: Partial<Job>): Job => ({
  id: 'J',
  lineId: 'L1',
  qtyL: 100,
  lineRateLPerMin: 10,
  status: 'PLANNED',
  ...overrides,
})

test('T01 append-to-tail starts at day start 06:00', () => {
  const result = computePlanner([makeJob({ id: 'J1' })], baseMasterData)
  assert.equal(result.jobs[0].startMin, 360)
})

test('T02 duration = qtyL / lineRateLPerMin', () => {
  const result = computePlanner([makeJob({ id: 'J1', qtyL: 90, lineRateLPerMin: 10 })], baseMasterData)
  assert.equal(result.jobs[0].endMin, 370)
})

test('T03 snap-to-grid (5 min) happens in core', () => {
  const result = computePlanner([makeJob({ id: 'J1', qtyL: 73, lineRateLPerMin: 10 })], baseMasterData)
  assert.equal(result.jobs[0].endMin, 370)
})

test('T04 ripple right on same line without reorder', () => {
  const result = computePlanner([
    makeJob({ id: 'J1', sequence: 1, qtyL: 100 }),
    makeJob({ id: 'J2', sequence: 2, qtyL: 100 }),
  ], baseMasterData)
  assert.deepEqual(result.jobs.map((j) => j.id), ['J1', 'J2'])
  assert.equal(result.jobs[1].startMin, result.jobs[0].endMin)
})

test('T05 RW_SUPPLY coupled 1:1 to LINE_FILL timings', () => {
  const result = computePlanner([makeJob({ id: 'J1', rwId: 'RW1' })], baseMasterData)
  assert.equal(result.rwBlocks.length, 1)
  assert.equal(result.rwBlocks[0].startMin, result.lineBlocks[0].startMin)
  assert.equal(result.rwBlocks[0].endMin, result.lineBlocks[0].endMin)
})

test('T06 RW overlap repaired by shifting affected job right', () => {
  const result = computePlanner([
    makeJob({ id: 'J1', lineId: 'L1', sequence: 1, qtyL: 200, rwId: 'RW1' }),
    makeJob({ id: 'J2', lineId: 'L2', sequence: 1, qtyL: 100, rwId: 'RW1' }),
  ], baseMasterData)

  const j1 = result.jobs.find((j) => j.id === 'J1')
  const j2 = result.jobs.find((j) => j.id === 'J2')
  assert.ok(j1)
  assert.ok(j2)
  assert.ok((j2.startMin ?? 0) >= (j1.endMin ?? 0))
})

test('T07 line ripple re-run after RW repair', () => {
  const result = computePlanner([
    makeJob({ id: 'J1', lineId: 'L1', sequence: 1, qtyL: 200, rwId: 'RW1' }),
    makeJob({ id: 'J2', lineId: 'L2', sequence: 1, qtyL: 100, rwId: 'RW1' }),
    makeJob({ id: 'J3', lineId: 'L2', sequence: 2, qtyL: 100 }),
  ], baseMasterData)

  const j2 = result.jobs.find((j) => j.id === 'J2')
  const j3 = result.jobs.find((j) => j.id === 'J3')
  assert.ok(j2)
  assert.ok(j3)
  assert.equal(j3.startMin, j2.endMin)
})

test('T08 DONE remains immutable', () => {
  const done = makeJob({ id: 'J1', status: 'DONE', startMin: 400, endMin: 430 })
  const result = computePlanner([done], baseMasterData)
  assert.equal(result.jobs[0].startMin, 400)
  assert.equal(result.jobs[0].endMin, 430)
})

test('T09 IN_PROGRESS start fixed and never left-shifted', () => {
  const result = computePlanner([
    makeJob({ id: 'J1', qtyL: 300 }),
    makeJob({ id: 'J2', status: 'IN_PROGRESS', startMin: 390, qtyL: 100 }),
  ], baseMasterData)
  const inProgress = result.jobs.find((j) => j.id === 'J2')
  assert.ok(inProgress)
  assert.ok((inProgress.startMin ?? 0) >= 390)
})

test('T10 ADD_JOB is available as intent entry-point', () => {
  const result = applyIntent([], baseMasterData, { type: 'ADD_JOB', job: makeJob({ id: 'J1' }) })
  assert.equal(result.jobs.length, 1)
})

test('T11 MOVE_JOB_WITHIN_LINE and MOVE_JOB_TO_LINE work via intents', () => {
  const seed = [
    makeJob({ id: 'J1', lineId: 'L1', sequence: 1 }),
    makeJob({ id: 'J2', lineId: 'L1', sequence: 2 }),
  ]
  const movedWithin = applyIntent(seed, baseMasterData, { type: 'MOVE_JOB_WITHIN_LINE', jobId: 'J2', targetIndex: 0 })
  assert.deepEqual(movedWithin.jobs.filter((j) => j.lineId === 'L1').map((j) => j.id), ['J2', 'J1'])

  const movedLine = applyIntent(movedWithin.jobs, baseMasterData, { type: 'MOVE_JOB_TO_LINE', jobId: 'J1', targetLineId: 'L2' })
  assert.equal(movedLine.jobs.find((j) => j.id === 'J1')?.lineId, 'L2')
})

test('T12 ASSIGN_RW / CHANGE_RW + deterministic output', () => {
  const seed = [makeJob({ id: 'J1' }), makeJob({ id: 'J2', lineId: 'L2' })]
  const assigned = applyIntent(seed, baseMasterData, { type: 'ASSIGN_RW', jobId: 'J1', rwId: 'RW1' })
  const changed = applyIntent(assigned.jobs, baseMasterData, { type: 'CHANGE_RW', jobId: 'J1', rwId: 'RW2' })
  assert.equal(changed.jobs.find((j) => j.id === 'J1')?.rwId, 'RW2')

  const rerun1 = computePlanner(changed.jobs, baseMasterData)
  const rerun2 = computePlanner(changed.jobs, baseMasterData)
  assert.equal(JSON.stringify(rerun1), JSON.stringify(rerun2))
})
