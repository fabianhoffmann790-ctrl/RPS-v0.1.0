import type { PlannerBlock, PlannerJob, PlannerMasterData, PlannerResult } from './plannerTypes.js'

const MS_PER_MIN = 60_000

const snapTs = (timestamp: number, snapGridMin: number) => {
  const step = snapGridMin * MS_PER_MIN
  return Math.ceil(timestamp / step) * step
}

const durationMinutes = (job: PlannerJob, masterData: PlannerMasterData) => {
  const rate = masterData.lineRateLPerMin[job.lineId] ?? 0
  if (rate <= 0) return 0
  return job.qtyL / rate
}

const durationMs = (job: PlannerJob, masterData: PlannerMasterData) => durationMinutes(job, masterData) * MS_PER_MIN

const lineSort = (left: PlannerJob, right: PlannerJob) => {
  const leftSeq = left.sequence ?? 0
  const rightSeq = right.sequence ?? 0
  if (leftSeq !== rightSeq) return leftSeq - rightSeq
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
  return left.jobId.localeCompare(right.jobId)
}

const normalizeLineSequences = (jobs: PlannerJob[]) => {
  const byLine = new Map<string, PlannerJob[]>()
  jobs.forEach((job) => {
    const bucket = byLine.get(job.lineId) ?? []
    bucket.push({ ...job })
    byLine.set(job.lineId, bucket)
  })

  const normalized: PlannerJob[] = []
  byLine.forEach((lineJobs) => {
    lineJobs.sort(lineSort).forEach((job, index) => normalized.push({ ...job, sequence: index + 1 }))
  })

  return normalized
}

const scheduleLines = (jobs: PlannerJob[], masterData: PlannerMasterData, floorByJobId = new Map<string, number>()) => {
  const normalized = normalizeLineSequences(jobs)
  const byLine = new Map<string, PlannerJob[]>()
  normalized.forEach((job) => {
    const bucket = byLine.get(job.lineId) ?? []
    bucket.push(job)
    byLine.set(job.lineId, bucket)
  })

  const output: PlannerJob[] = []

  byLine.forEach((lineJobs) => {
    let cursor = masterData.dayStartTs

    lineJobs.sort(lineSort).forEach((job) => {
      if (job.status === 'DONE' && Number.isFinite(job.startTs) && Number.isFinite(job.endTs)) {
        output.push({ ...job })
        cursor = Math.max(cursor, job.endTs as number)
        return
      }

      const duration = durationMs(job, masterData)
      const requestedStart = Number.isFinite(job.requestedStartTs) ? snapTs(job.requestedStartTs as number, masterData.snapGridMin) : undefined
      const inProgressFloor =
        job.status === 'IN_PROGRESS' && Number.isFinite(job.startTs) ? (job.startTs as number) : Number.NEGATIVE_INFINITY
      const repairFloor = floorByJobId.get(job.jobId) ?? Number.NEGATIVE_INFINITY
      const earliestStart = Math.max(cursor, inProgressFloor, repairFloor)
      const desiredStart = requestedStart ?? earliestStart
      const startTs = snapTs(Math.max(desiredStart, earliestStart), masterData.snapGridMin)
      const endTs = snapTs(startTs + duration, masterData.snapGridMin)

      output.push({ ...job, startTs, endTs })
      cursor = endTs
    })
  })

  return output
}

const buildBlocks = (jobs: PlannerJob[]): PlannerBlock[] => {
  const blocks: PlannerBlock[] = []

  jobs.forEach((job) => {
    if (!Number.isFinite(job.startTs) || !Number.isFinite(job.endTs)) return

    blocks.push({
      blockId: `LINE_FILL:${job.jobId}`,
      type: 'LINE_FILL',
      laneType: 'LINE',
      laneId: job.lineId,
      startTs: job.startTs as number,
      endTs: job.endTs as number,
      jobId: job.jobId,
    })

    if (job.rwId) {
      blocks.push({
        blockId: `RW_SUPPLY:${job.jobId}`,
        type: 'RW_SUPPLY',
        laneType: 'RW',
        laneId: job.rwId,
        startTs: job.startTs as number,
        endTs: job.endTs as number,
        jobId: job.jobId,
      })
    }
  })

  return blocks
}

const repairRwCollisions = (jobs: PlannerJob[], masterData: PlannerMasterData) => {
  let scheduled = jobs
  const floorByJobId = new Map<string, number>()
  let hasCollisions = true

  while (hasCollisions) {
    hasCollisions = false
    const rwBlocks = buildBlocks(scheduled)
      .filter((block) => block.laneType === 'RW')
      .sort((a, b) => {
        if (a.laneId !== b.laneId) return a.laneId.localeCompare(b.laneId)
        if (a.startTs !== b.startTs) return a.startTs - b.startTs
        return a.jobId.localeCompare(b.jobId)
      })

    for (let index = 1; index < rwBlocks.length; index += 1) {
      const left = rwBlocks[index - 1]
      const right = rwBlocks[index]
      if (left.laneId !== right.laneId) continue
      if (right.startTs >= left.endTs) continue

      const rightJob = scheduled.find((job) => job.jobId === right.jobId)
      if (!rightJob || rightJob.status === 'DONE') continue

      floorByJobId.set(right.jobId, left.endTs)
      scheduled = scheduleLines(scheduled, masterData, floorByJobId)
      hasCollisions = true
      break
    }
  }

  return scheduled
}

export const computePlanner = (jobs: PlannerJob[], masterData: PlannerMasterData): PlannerResult => {
  const firstPass = scheduleLines(jobs, masterData)
  const repairedJobs = repairRwCollisions(firstPass, masterData)
  return {
    jobs: repairedJobs,
    blocks: buildBlocks(repairedJobs),
  }
}
