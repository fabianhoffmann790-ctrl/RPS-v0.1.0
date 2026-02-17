import type { Block, Job, MasterData, PlannerResult } from './plannerTypes.js'

const snap = (valueMin: number, gridMin: number) => Math.ceil(valueMin / gridMin) * gridMin

const durationMin = (job: Job) => {
  if (job.lineRateLPerMin <= 0) return 0
  return job.qtyL / job.lineRateLPerMin
}

const bySequence = (left: Job, right: Job) => {
  const leftSeq = left.sequence ?? Number.MAX_SAFE_INTEGER
  const rightSeq = right.sequence ?? Number.MAX_SAFE_INTEGER
  if (leftSeq !== rightSeq) return leftSeq - rightSeq
  return left.id.localeCompare(right.id)
}

const groupByLine = (jobs: Job[], lineIds: string[]) => {
  const byLine = new Map<string, Job[]>()
  lineIds.forEach((lineId) => byLine.set(lineId, []))

  jobs.forEach((job) => {
    const items = byLine.get(job.lineId) ?? []
    items.push({ ...job })
    byLine.set(job.lineId, items)
  })

  byLine.forEach((items, lineId) => {
    const sorted = [...items].sort(bySequence).map((job, idx) => ({ ...job, sequence: idx + 1, lineId }))
    byLine.set(lineId, sorted)
  })

  return byLine
}

const computeLineSchedule = (jobs: Job[], masterData: MasterData, minStartByJobId = new Map<string, number>()) => {
  const byLine = groupByLine(jobs, masterData.lineIds)
  const nextJobs: Job[] = []

  byLine.forEach((lineJobs) => {
    let cursor = masterData.dayStartMin

    lineJobs.forEach((job) => {
      const duration = durationMin(job)
      const minStart = snap(cursor, masterData.snapGridMin)

      if (job.status === 'DONE' && Number.isFinite(job.startMin) && Number.isFinite(job.endMin)) {
        nextJobs.push({ ...job })
        cursor = Math.max(cursor, job.endMin as number)
        return
      }

      const fixedInProgressStart = job.status === 'IN_PROGRESS' && Number.isFinite(job.startMin) ? (job.startMin as number) : undefined
      const repairedFloor = minStartByJobId.get(job.id)
      const startFloor = Math.max(minStart, fixedInProgressStart ?? minStart, repairedFloor ?? minStart)
      const start = snap(startFloor, masterData.snapGridMin)
      const end = snap(start + duration, masterData.snapGridMin)
      cursor = end
      nextJobs.push({ ...job, startMin: start, endMin: end })
    })
  })

  return nextJobs
}

const lineBlocksFromJobs = (jobs: Job[]): Block[] =>
  jobs
    .filter((job) => Number.isFinite(job.startMin) && Number.isFinite(job.endMin))
    .map((job) => ({
      id: `LINE_FILL:${job.id}`,
      type: 'LINE_FILL',
      resourceId: job.lineId,
      jobId: job.id,
      startMin: job.startMin as number,
      endMin: job.endMin as number,
    }))

const rwBlocksFromJobs = (jobs: Job[]): Block[] =>
  jobs
    .filter((job) => job.rwId && Number.isFinite(job.startMin) && Number.isFinite(job.endMin))
    .map((job) => ({
      id: `RW_SUPPLY:${job.id}`,
      type: 'RW_SUPPLY',
      resourceId: job.rwId as string,
      jobId: job.id,
      startMin: job.startMin as number,
      endMin: job.endMin as number,
    }))

const repairRwOverlaps = (scheduledJobs: Job[], masterData: MasterData): Job[] => {
  let jobs = [...scheduledJobs]
  const minStartByJobId = new Map<string, number>()
  let repaired = true

  while (repaired) {
    repaired = false
    const rwBlocks = rwBlocksFromJobs(jobs).sort((a, b) => {
      if (a.resourceId !== b.resourceId) return a.resourceId.localeCompare(b.resourceId)
      if (a.startMin !== b.startMin) return a.startMin - b.startMin
      return a.jobId.localeCompare(b.jobId)
    })

    for (let i = 1; i < rwBlocks.length; i += 1) {
      const prev = rwBlocks[i - 1]
      const next = rwBlocks[i]
      if (prev.resourceId !== next.resourceId) continue
      if (next.startMin >= prev.endMin) continue

      minStartByJobId.set(next.jobId, snap(prev.endMin, masterData.snapGridMin))
      repaired = true
      jobs = computeLineSchedule(jobs, masterData, minStartByJobId)
      break
    }
  }

  return jobs
}

export const computePlanner = (jobs: Job[], masterData: MasterData): PlannerResult => {
  const firstPass = computeLineSchedule(jobs, masterData)
  const repaired = repairRwOverlaps(firstPass, masterData)
  return {
    jobs: repaired,
    lineBlocks: lineBlocksFromJobs(repaired),
    rwBlocks: rwBlocksFromJobs(repaired),
  }
}
