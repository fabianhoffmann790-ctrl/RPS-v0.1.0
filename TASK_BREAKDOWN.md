# RPS – Gantt Planner Core (V1) Agent Task Breakdown

## Overview
We implement the Gantt planner in three deliverables:
1) Planner-Core (deterministic scheduling + repair)
2) Gantt UI (render + DnD emitting intents)
3) Tests (unit tests for core + minimal integration checks)

Repo source of truth: `fabianhoffmann790-ctrl/RPS`

---

## Agent A – Planner-Core (Scheduling + Repair)

### A1. Data Structures
- Define Job model:
  - jobId, productId, qtyL, lineId, rwId?, status, createdAt/sequence
- Define MasterData:
  - lineRateLPerMin per lineId
- Define Block model (derived):
  - blockId, type, laneType, laneId, startTs, endTs, jobId

### A2. Core Algorithms
Implement deterministic planner function:
- Inputs:
  - jobs[], masterData, dayStartTs, nowTs? (optional)
- Outputs:
  - blocks[] for lines and RWs
  - optional metadata: warnings/invalid flags

Rules to implement:
- Append-to-tail default placement
- Duration = qty / lineRate
- Snap-to-grid in core (e.g. 5 min)
- Ripple right on a line
- RW coupling 1:1 with line
- RW collision repair:
  - shift affected job right until RW free
  - re-run ripple on the job’s line

Status rules:
- DONE blocks immutable and excluded from shifts
- IN_PROGRESS start fixed; only right shifts allowed

### A3. Intents API (core entrypoints)
Implement intent handlers that call the core repair:
- ADD_JOB(lineId, jobData)
- MOVE_JOB_WITHIN_LINE(jobId, newStartTs)
- MOVE_JOB_TO_LINE(jobId, targetLineId) -> append-to-tail
- ASSIGN_RW(jobId, rwId) / CHANGE_RW(jobId, rwId)

Each intent must return updated plan (blocks).

### A4. Determinism
- Ensure stable ordering per line (sequenceIndex or createdAt tie-break)
- Repair must never reorder jobs; only adjust times

Deliverable: `plannerCore.ts` (or equivalent) + exported APIs.

---

## Agent B – Gantt UI (Render + Interaction)

### B1. UI Requirements
- Two lane groups: Lines, RWs
- Render blocks from core output
- No duration resize handles
- Visual distinction for DONE / IN_PROGRESS
- Optional tooltip: qty, rate, duration formula, start/end

### B2. Drag & Drop Behavior
- Drag within a line:
  - UI computes proposed newStart
  - emits MOVE_JOB_WITHIN_LINE intent to core
- Drag to another line:
  - emits MOVE_JOB_TO_LINE intent (append-to-tail default)
- RW blocks are not directly draggable (they follow line)

### B3. Performance / Rendering
- Ensure timeline scroll & lane list are responsive
- (Optional) virtualization if lanes are many

Deliverable: `GanttView` component wired to planner-core intents.

---

## Agent C – Tests

### C1. Unit Test Suite
Implement tests from `TEST.md`:
- append-to-tail
- duration calc
- ripple
- RW coupling
- RW collision repair
- DONE immutability
- IN_PROGRESS no-left-shift
- snap grid

### C2. Determinism Tests
- same input produces identical blocks (stable ids + stable start/end)

Deliverable: test files integrated into repo test runner.

---

## Agent D (Optional) – Minimal RW Capacity Checks
Only if desired and low-risk:
- RW masterdata: maxVolumeL/minVolumeL
- qty > max => invalid/blocked
- qty < min => warning
NO auto-splitting, NO auto-reassign

Deliverable: metadata flags + UI badges.

---

## Acceptance Criteria (Project)
- Planner-core always outputs conflict-free blocks for lines and RWs under V1 rules
- RW blocks mirror line blocks 1:1
- UI actions produce expected ripple/repair behavior
- DONE never moved
- IN_PROGRESS never moved left
- All required unit tests pass
