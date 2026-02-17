import { computePlanner } from './plannerCore.js'
import type { PlannerIntent, PlannerJob, PlannerMasterData, PlannerResult } from './plannerTypes.js'

const nextSequenceForLine = (jobs: PlannerJob[], lineId: string) => {
  const lineJobs = jobs.filter((job) => job.lineId === lineId)
  const maxSequence = lineJobs.reduce((max, job) => Math.max(max, job.sequence ?? 0), 0)
  return Math.max(maxSequence, lineJobs.length) + 1
}

export const applyIntent = (jobs: PlannerJob[], masterData: PlannerMasterData, intent: PlannerIntent): PlannerResult => {
  let nextJobs = [...jobs]

  switch (intent.type) {
    case 'ADD_JOB':
      nextJobs = [...nextJobs, { ...intent.job, sequence: intent.job.sequence ?? nextSequenceForLine(nextJobs, intent.job.lineId) }]
      break
    case 'MOVE_JOB_WITHIN_LINE':
      nextJobs = nextJobs.map((job) => (job.jobId === intent.jobId ? { ...job, requestedStartTs: intent.newStartTs } : job))
      break
    case 'MOVE_JOB_TO_LINE':
      nextJobs = nextJobs.map((job) =>
        job.jobId === intent.jobId
          ? {
              ...job,
              lineId: intent.targetLineId,
              requestedStartTs: undefined,
              sequence: nextSequenceForLine(nextJobs, intent.targetLineId),
            }
          : job,
      )
      break
    case 'ASSIGN_RW':
    case 'CHANGE_RW':
      nextJobs = nextJobs.map((job) => (job.jobId === intent.jobId ? { ...job, rwId: intent.rwId } : job))
      break
    default:
      break
  }

  return computePlanner(nextJobs, masterData)
}
