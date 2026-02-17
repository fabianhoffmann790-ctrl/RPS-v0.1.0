# Planner-Core V1 Testkatalog

## Pflicht (T01–T12)
- **T01**: Append-to-tail startet bei DayStart 06:00.
- **T02**: Dauerberechnung `qtyL / lineRateLPerMin`.
- **T03**: Snap-to-grid (5 Minuten) im Core.
- **T04**: Ripple-right pro Linie ohne Reordering.
- **T05**: RW 1:1 Coupling (`RW_SUPPLY` == `LINE_FILL` Start/Ende).
- **T06**: RW-Overlap-Repair verschiebt betroffenen Job nach rechts.
- **T07**: Nach RW-Repair wird Line-Ripple erneut ausgeführt.
- **T08**: Status `DONE` bleibt unveränderlich.
- **T09**: Status `IN_PROGRESS`: Start fixiert, kein Left-Shift.
- **T10**: Intent `ADD_JOB` als Entry-Point.
- **T11**: Intents `MOVE_JOB_WITHIN_LINE` + `MOVE_JOB_TO_LINE` als Entry-Points.
- **T12**: Intents `ASSIGN_RW` + `CHANGE_RW` als Entry-Points.

## Optional (nur low risk)
- **T13**: Multi-RW parallel, keine unnötigen Verschiebungen.
- **T14**: Leere Linien bleiben stabil.

## Zusatz
- Determinismus-Test: identischer Input => identischer Output.
