# RPS – Gantt Planner Core (V1) Requirements

## 0. Goal
Build the deterministic core of a Gantt planner for **Filling Lines** and **Mixing Tanks (Rührwerke)**.
The core must produce a stable, conflict-free plan and a UI can render it without embedding business logic.

Scope: **planning logic + correct timelines**.
Non-goal: optimizer / auto batching / advanced material simulation.

---

## 1. Domain Model (V1)

### 1.1 Lanes
Two lane groups:
- **Lines**: `L1..Ln`
- **Rührwerke**: `RW1..RWm`

### 1.2 Job / Order
A job exists once and can generate multiple blocks.

Minimum fields:
- `jobId`
- `productId`
- `qtyL` (quantity in liters)
- `lineId` (assigned line)
- `rwId` (optional assigned RW)
- `status`: `PLANNED | IN_PROGRESS | DONE`
- `createdAt` (or stable sequence tie-break)

### 1.3 Master Data
Minimum:
- `lineRateLPerMin` per `lineId`

Optional (scope guardrails apply):
- RW capacity checks: `maxVolumeL`, `minVolumeL` (see §8)

### 1.4 Blocks (derived output)
Blocks are computed from jobs + masterdata (not manually persisted).

Types (V1):
- `LINE_FILL` on a line lane
- `RW_SUPPLY` on a RW lane

Block fields:
- `blockId`
- `type` (`LINE_FILL` | `RW_SUPPLY`)
- `laneType` (`LINE` | `RW`)
- `laneId` (e.g., `L1`, `RW3`)
- `startTs`, `endTs` (timestamps)
- `jobId`

---

## 2. Core Rule: RW ↔ Line Coupling (hard requirement)

If a job has both `lineId` and `rwId`, it generates:
- One `LINE_FILL` block on the line
- One `RW_SUPPLY` block on the RW

Coupling rule:
- `RW_SUPPLY.start = LINE_FILL.start`
- `RW_SUPPLY.end   = LINE_FILL.end`

Meaning: the RW is considered **occupied for the entire filling duration**.

---

## 3. Default Scheduling Mode: Append-to-tail (hard requirement)

When a job is added or assigned to a line:
- If line has no active plan blocks → start at **DayStart** (e.g. 06:00)
- Else → start at **end of the last block** on that line
- End = Start + Duration

Manual start-time entry is not enforced in V1 (no “respect manual start” mode).
A later milestone may add locking behavior, but V1 is append-first.

---

## 4. Duration Calculation (hard requirement)

Duration of `LINE_FILL` is computed:
- `durationMinutes = qtyL / lineRateLPerMin`
- `end = start + duration`

UI must not allow resizing duration.
Duration changes only if:
- `qtyL` changes
- `lineRateLPerMin` changes

---

## 5. Interaction Model: Ripple (hard requirement)

### 5.1 Move within same line
When a `LINE_FILL` block is moved to a new start time:
- Snap to time grid (see §7)
- Apply **Ripple to the right**:
  - push all subsequent blocks right until no overlaps remain
- Preserve sequence ordering; repair changes time, not order

### 5.2 Move to another line
When a job is moved to another line:
- Default placement is **Append-to-tail** on the target line
- Apply ripple on the target line if needed

### 5.3 RW follows line
Any change in `LINE_FILL.start/end` updates the coupled `RW_SUPPLY` to match 1:1.

---

## 6. Conflict Freedom / Repair: RW as bottleneck (hard requirement)

Constraints:
- **No overlaps on a line**
- **No overlaps on a RW**

Repair behavior (deterministic):
- Line overlaps are resolved by ripple (push right).
- RW overlaps are resolved by pushing the **affected job** to the right:
  - Shift the job’s `LINE_FILL` right until the RW is free
  - Then re-run ripple on its line (because the shifted block may collide on the line)

Outcome: Plan is conflict-free by construction (or clearly mark invalid if locks are introduced later).

---

## 7. Time Grid / Snap (hard requirement)
- The planner uses a fixed snap grid (recommended: **5 minutes**).
- Rounding happens in the **planner-core**, not in the UI.
- All computed/moved start times align to the grid.

---

## 8. Finished / Running Jobs (hard requirement)

Statuses:
- `PLANNED`
- `IN_PROGRESS`
- `DONE`

Rules:
- `DONE` blocks are **historical & immutable**:
  - visible in Gantt
  - never moved by ripple/repair
  - not draggable in UI

- `IN_PROGRESS`:
  - start time is at least fixed
  - planner must not move them left into the past
  - plan updates only propagate **to the right** (e.g., if end extends, ripple right)

---

## 9. Explicit Non-Goals (V1 scope guardrails)

Not part of V1:
- No auto batch splitting, no clustering, no optimizer
- No material balance simulation (fill level curve)
- No automatic RW assignment (beyond explicit selection)
- No complex cleaning/changeover modeling (may be added later)

Optional minimal RW checks (allowed but must remain simple):
- If `qtyL > RW.maxVolumeL` → mark job invalid / block RW selection
- If `qtyL < RW.minVolumeL` → warning only
No auto-split, no auto-reassign.

---

## 10. Architecture Contract (hard requirement)

- UI emits **Intents** only:
  - `ADD_JOB`
  - `MOVE_JOB_WITHIN_LINE`
  - `MOVE_JOB_TO_LINE`
  - `ASSIGN_RW` / `CHANGE_RW`
- Planner-core resolves intents → outputs computed blocks.
- Gantt UI is a pure renderer for blocks; business logic stays in core.
