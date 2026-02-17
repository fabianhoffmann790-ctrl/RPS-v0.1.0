export type Status = 'PLANNED' | 'IN_PROGRESS' | 'DONE'

export interface Job {
  id: string
  lineId: string
  qtyL: number
  lineRateLPerMin: number
  status: Status
  rwId?: string
  sequence?: number
  startMin?: number
  endMin?: number
}

export interface MasterData {
  dayStartMin: number
  snapGridMin: number
  lineIds: string[]
  rwIds: string[]
}

export type BlockType = 'LINE_FILL' | 'RW_SUPPLY'

export interface Block {
  id: string
  type: BlockType
  resourceId: string
  jobId: string
  startMin: number
  endMin: number
}

export interface PlannerResult {
  jobs: Job[]
  lineBlocks: Block[]
  rwBlocks: Block[]
}

export interface AddJobIntentPayload {
  type: 'ADD_JOB'
  job: Job
}

export interface MoveJobWithinLineIntentPayload {
  type: 'MOVE_JOB_WITHIN_LINE'
  jobId: string
  targetIndex: number
}

export interface MoveJobToLineIntentPayload {
  type: 'MOVE_JOB_TO_LINE'
  jobId: string
  targetLineId: string
}

export interface AssignRwIntentPayload {
  type: 'ASSIGN_RW'
  jobId: string
  rwId: string
}

export interface ChangeRwIntentPayload {
  type: 'CHANGE_RW'
  jobId: string
  rwId: string
}

export type IntentPayloads =
  | AddJobIntentPayload
  | MoveJobWithinLineIntentPayload
  | MoveJobToLineIntentPayload
  | AssignRwIntentPayload
  | ChangeRwIntentPayload
