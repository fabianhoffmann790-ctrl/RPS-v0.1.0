# RPS – Gantt Planner Core (V1) Test Plan

## 0. Test Strategy
Focus on deterministic unit tests of the planner-core:
- time placement (append-to-tail)
- duration calculation
- ripple behavior
- RW collision repair
- status handling (DONE / IN_PROGRESS)
All tests should be independent of UI.

Assumptions:
- DayStart = 06:00 local (or a provided timestamp)
- Snap grid = 5 minutes

---

## 1. Fixtures

### 1.1 Master data
- L1 rate = 100 L/min
- L2 rate = 50 L/min

### 1.2 Helpers
- `t("06:00")` returns dayStart + offset timestamp
- `mins(n)` converts minutes to ms
- All expected times should be grid-aligned

---

## 2. Unit Tests (Planner-Core)

### T01 – Append-to-tail on empty line
**Given:** line L1 has no non-DONE blocks  
**When:** add job J1 qty=3000L on L1 (rate=100L/min)  
**Then:**
- J1 LINE_FILL.start = 06:00
- duration = 3000/100 = 30 min
- end = 06:30
- if J1 has rwId → RW_SUPPLY mirrors start/end

### T02 – Append-to-tail with existing planned job
**Given:** J1 on L1 ends at 06:30  
**When:** add J2 qty=6000L on L1  
**Then:** J2 starts at 06:30 (tail) and ends correctly by computed duration

### T03 – Duration recompute from qty / line rate
**Given:** J1 qty=3000L on L1 rate=100L/min  
**Then:** duration = 30 min  
**When:** change qty to 6000L  
**Then:** duration = 60 min and end updates accordingly

### T04 – Move within line triggers ripple right
**Given:** three jobs J1,J2,J3 on L1 with no gaps  
**When:** move J1 later such that it overlaps J2  
**Then:** J2 and J3 are pushed right minimally to remove overlaps  
**And:** ordering remains J1→J2→J3

### T05 – Move within line earlier triggers ripple right (push followers)
**Given:** J1,J2,J3 on L1  
**When:** move J2 earlier to overlap J1  
**Then:** J2 is placed at requested time (snapped)  
**And:** ripple pushes J2 and then J3 right as needed, without reordering

### T06 – Move to another line uses append-to-tail
**Given:** L2 has jobs ending at 09:00  
**When:** move Jx from L1 to L2  
**Then:** Jx start on L2 = 09:00 (tail), not the dragged time (V1 behavior)

### T07 – RW coupling mirrors line times
**Given:** job J1 has lineId=L1 and rwId=RW1  
**When:** compute plan  
**Then:** RW_SUPPLY.start/end exactly equals LINE_FILL.start/end  
**When:** move J1 on line  
**Then:** RW_SUPPLY updates to match

### T08 – RW collision repair shifts affected job right
**Given:** J1 and J2 both assigned RW1  
- J1 is on L1 from 06:00–07:00
- J2 is on L2 initially placed 06:30–07:30 (overlaps on RW1)
**When:** compute/repair plan  
**Then:** J2 must be shifted right until RW1 is free (>=07:00)  
**And:** J2’s LINE_FILL shift causes ripple on its line if needed

### T09 – RW collision chain
**Given:** J1, J2, J3 all on RW1 with overlapping initial placements  
**Then:** repair results in a sequential non-overlapping schedule on RW1  
**And:** corresponding line blocks match their RW shifts

### T10 – DONE blocks are immutable and ignored by ripple/repair
**Given:** J_done is DONE with LINE_FILL 06:00–07:00  
**When:** add planned job after it  
**Then:** planned job uses tail of last non-DONE or latest relevant tail logic (implementation choice)  
**And:** any move/repair never changes J_done times

### T11 – IN_PROGRESS not moved left; only right propagation allowed
**Given:** J_run is IN_PROGRESS with start fixed at 08:00  
**When:** repair would otherwise shift it earlier  
**Then:** it remains at 08:00 (no left shift)  
**And:** if its end extends, ripple shifts following planned jobs right

### T12 – Snap grid enforcement
**Given:** move job start to 08:03  
**Then:** start is snapped to 08:05 (or the configured rule)  
**And:** all subsequent ripple results remain grid-aligned

---

## 3. Optional Tests (if minimal RW capacity checks enabled)

### T13 – qty > RW.max blocks assignment / marks invalid
**Given:** RW1 max=4800L, job qty=6000L  
**Then:** planner marks job invalid OR RW assignment invalid (as per chosen UX)  
**And:** no silent auto-splitting occurs

### T14 – qty < RW.min warning only
**Given:** RW1 min=6500L, job qty=3000L  
**Then:** assignment allowed, but warning metadata is emitted
