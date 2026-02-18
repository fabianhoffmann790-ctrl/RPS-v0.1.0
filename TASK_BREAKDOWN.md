# RPS – Gantt Planner Core V1 (UPDATED) Task Breakdown

## Overview
Umsetzung in drei Deliverables:
1) Planner-Core (Blockableitung + RW-Assignment-Entscheidung)
2) Gantt UI (Renderer + manuelle RW-Zuweisung)
3) Tests (Unit-Tests auf Core-Regeln)

Leitregel: **Linienzeiten/-reihenfolge bleiben unverändert.**

---

## Agent A – Planner-Core

### A1. Datenmodell
- Job-Felder sicherstellen:
  - `jobId`, `productId`, `qtyL`, `lineId`, `positionIndex`, `fillStartTs`, `fillEndTs`, `rwId?`, `status`
- Produkt-Masterdata:
  - `productionDurationMin(productId)`
- Konstante:
  - `cleanDurationMin = 20`

### A2. Blockableitung
Implementiere `computeBlocks(state)`:
- Immer `LINE_FILL` aus fixen Linienzeiten
- Falls `rwId` gesetzt:
  - `RW_PREP: fillStart - productionDurationMin -> fillStart`
  - `RW_SUPPLY: fillStart -> fillEnd`
  - `RW_CLEAN: fillEnd -> fillEnd + 20min`

Wichtig:
- Keine Zeitneuberechnung für `LINE_FILL`
- Kein Ripple, kein Repair

### A3. Assignment-Entscheidung
Implementiere Intents:
- `ASSIGN_RW(jobId, rwId)`
- `CHANGE_RW(jobId, rwId)`

Algorithmus:
1. Kandidatenfenster `[prepStart, cleanEnd]` berechnen
2. Overlap prüfen (`newStart < otherEnd && newEnd > otherStart`)
3. Bei Overlap: Reject `REJECTED_RW_OCCUPIED` + Konfliktdetails
4. Sonst: Accept und `rwId` setzen

### A4. Ergebnisvertrag
Core-Response enthält:
- `result: ACCEPTED | REJECTED_RW_OCCUPIED`
- `blocks`
- `conflict?` (nur bei Reject)

Deliverable: `plannerCore.ts` (oder äquivalent) + klare API.

---

## Agent B – Gantt UI

### B1. Rendering
- 4 Linien-Lanes + 10 RW-Lanes darstellen
- `LINE_FILL`, `RW_PREP`, `RW_SUPPLY`, `RW_CLEAN` unterschiedlich visualisieren
- DONE / IN_PROGRESS visuell markieren

### B2. Interaktion
- RW-Zuweisung manuell (z. B. Drag Linie -> RW)
- UI ruft nur `ASSIGN_RW/CHANGE_RW` auf
- Bei `REJECTED_RW_OCCUPIED` Popup/Alert „RW belegt“ + Konfliktdetails

### B3. Keine Auto-Logik in UI
- Keine Verschiebung/Umreihung im UI
- UI rendert nur Core-Output

Deliverable: `GanttView` mit Core-Integration.

---

## Agent C – Tests

### C1. Pflichttests
- Linien unverändert
- RW-Blöcke korrekt aus prod+fill+clean
- Assignment accept/reject
- Boundary: touching windows allowed
- DONE blockiert normal
- Determinismus

### C2. Negative Cases
- Overlap bei Assign/Change -> Reject ohne Seiteneffekte
- Keine automatische Zeitverschiebung bei Konflikt

Deliverable: Unit-Testdateien im bestehenden Test-Runner.

---

## Acceptance Criteria
- Linienzeiten/-positionen bleiben unverändert (immer)
- RW-Blöcke werden korrekt aus fixen Linienzeiten abgeleitet
- RW-Konflikte führen zu Reject, nicht zu Auto-Reparatur
- Conflict-Details werden bei Reject zurückgegeben
- Pflichttests sind grün
