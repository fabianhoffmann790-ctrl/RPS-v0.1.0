import { computePlanner } from './plannerCore.js'
import type { IntentPayloads, Job, MasterData, PlannerResult } from './plannerTypes.js'

const reorderWithinLine = (jobs: Job[], jobId: string, targetIndex: number): Job[] => {
  const targetJob = jobs.find((job) => job.id === jobId)
  if (!targetJob) return jobs

  const lineJobs = jobs
    .filter((job) => job.lineId === targetJob.lineId)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.id.localeCompare(b.id))

  const currentIndex = lineJobs.findIndex((job) => job.id === jobId)
  if (currentIndex < 0) return jobs

  const [spliced] = lineJobs.splice(currentIndex, 1)
  const clampedIndex = Math.max(0, Math.min(targetIndex, lineJobs.length))
  lineJobs.splice(clampedIndex, 0, spliced)

  const sequenceById = new Map(lineJobs.map((job, index) => [job.id, index + 1]))
  return jobs.map((job) => (sequenceById.has(job.id) ? { ...job, sequence: sequenceById.get(job.id) } : job))
}

export const applyIntent = (jobs: Job[], masterData: MasterData, intent: IntentPayloads): PlannerResult => {
  let nextJobs = [...jobs]

  switch (intent.type) {
    case 'ADD_JOB':
      nextJobs = [...nextJobs, intent.job]
      break
    case 'MOVE_JOB_WITHIN_LINE':
      nextJobs = reorderWithinLine(nextJobs, intent.jobId, intent.targetIndex)
      break
    case 'MOVE_JOB_TO_LINE':
      nextJobs = nextJobs.map((job) =>
        job.id === intent.jobId
          ? {
              ...job,
              lineId: intent.targetLineId,
              sequence: undefined,
            }
          : job,
      )
      break
    case 'ASSIGN_RW':
    case 'CHANGE_RW':
      nextJobs = nextJobs.map((job) => (job.id === intent.jobId ? { ...job, rwId: intent.rwId } : job))
      break
    default:
      return computePlanner(nextJobs, masterData)
  }

  return computePlanner(nextJobs, masterData)
}
