export type JobStatus = 'PLANNED' | 'IN_PROGRESS' | 'DONE'

export interface PlannerJob {
  jobId: string
  productId: string
  qtyL: number
  lineId: string
  rwId?: string
  status: JobStatus
  createdAt: number
  sequence?: number
  requestedStartTs?: number
  startTs?: number
  endTs?: number
}

export interface PlannerMasterData {
  dayStartTs: number
  snapGridMin: number
  lineRateLPerMin: Record<string, number>
}

export type PlannerBlockType = 'LINE_FILL' | 'RW_SUPPLY'
export type PlannerLaneType = 'LINE' | 'RW'

export interface PlannerBlock {
  blockId: string
  type: PlannerBlockType
  laneType: PlannerLaneType
  laneId: string
  startTs: number
  endTs: number
  jobId: string
}

export interface PlannerResult {
  jobs: PlannerJob[]
  blocks: PlannerBlock[]
}

export interface AddJobIntent {
  type: 'ADD_JOB'
  job: PlannerJob
}

export interface MoveJobWithinLineIntent {
  type: 'MOVE_JOB_WITHIN_LINE'
  jobId: string
  newStartTs: number
}

export interface MoveJobToLineIntent {
  type: 'MOVE_JOB_TO_LINE'
  jobId: string
  targetLineId: string
}

export interface AssignRwIntent {
  type: 'ASSIGN_RW'
  jobId: string
  rwId: string
}

export interface ChangeRwIntent {
  type: 'CHANGE_RW'
  jobId: string
  rwId: string
}

export type PlannerIntent = AddJobIntent | MoveJobWithinLineIntent | MoveJobToLineIntent | AssignRwIntent | ChangeRwIntent
