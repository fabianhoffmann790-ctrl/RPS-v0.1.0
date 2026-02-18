# RPS – Gantt Planner Core V1 (UPDATED) Test Plan

## 0. Teststrategie
Fokus auf deterministische Unit-Tests für den Planner-Core.

Kernziele:
- Linien bleiben unverändert (kein Ripple/Repair)
- RW-Blöcke korrekt aus Produktdauer + Fill + Reinigung
- RW-Assignment wird korrekt akzeptiert/abgelehnt

Rahmen:
- Linien: L1..L4
- RWs: RW1..RW10
- `cleanDurationMin = 20`

---

## 1. Fixtures

### 1.1 Produkte
- P1: `productionDurationMin = 45`
- P2: `productionDurationMin = 30`

### 1.2 Jobs
- Job-Felder enthalten mindestens: `positionIndex`, `fillStartTs`, `fillEndTs`, `productId`, `lineId`, `rwId?`, `status`.

### 1.3 Helper
- `t("HH:MM")` -> Timestamp am Testtag

---

## 2. Pflichttests

### T01 – LINE_FILL übernimmt fixe Linienzeiten 1:1
**Given:** Job J1 mit `fillStartTs=06:00`, `fillEndTs=06:50`, `positionIndex=1`  
**Then:** `LINE_FILL` ist exakt `06:00 -> 06:50` (ohne Neuberechnung)

### T02 – Linienreihenfolge bleibt fix
**Given:** Jobs J1/J2 auf L1 mit `positionIndex` 1 und 2  
**When:** RW-Zuweisungen/Rejects passieren  
**Then:** `positionIndex` und Linienzeiten bleiben unverändert

### T03 – RW-Blöcke korrekt aus Produktdauer + Fill + Cleaning
**Given:** J1 (P1) mit Fill `07:00 -> 08:00`, P1 hat `productionDurationMin=45`  
**When:** J1 wird RW1 zugewiesen  
**Then:**
- `RW_PREP = 06:15 -> 07:00`
- `RW_SUPPLY = 07:00 -> 08:00`
- `RW_CLEAN = 08:00 -> 08:20`

### T04 – RW_SUPPLY ist 1:1 Spiegel von LINE_FILL
**Given:** zugewiesener Job mit fixem `LINE_FILL`  
**Then:** `RW_SUPPLY.start/end == LINE_FILL.start/end`

### T05 – ASSIGN_RW akzeptiert bei freiem Fenster
**Given:** RW2 hat keine überlappende Belegung  
**When:** `ASSIGN_RW(J1, RW2)`  
**Then:** Ergebnis `ACCEPTED`, `rwId` gesetzt, RW-Blöcke erzeugt

### T06 – ASSIGN_RW lehnt bei Overlap ab
**Given:** RW1 hat bestehende Belegung `[06:15, 08:20]`  
**When:** neuer Job mit Fenster `[07:30, 09:00]` wird auf RW1 zugewiesen  
**Then:** Ergebnis `REJECTED_RW_OCCUPIED`, keine Zustandsänderung am Job

### T07 – CHANGE_RW lehnt bei Overlap ab
**Given:** Job J2 ist auf RW2, Wechsel auf RW1 wäre überlappend  
**When:** `CHANGE_RW(J2, RW1)`  
**Then:** Reject + bisherige RW-Zuweisung bleibt erhalten

### T08 – Boundary: touching windows erlaubt
**Given:** Belegung A endet um 10:00, neue Belegung startet exakt 10:00  
**Then:** kein Overlap, Assignment wird akzeptiert

### T09 – DONE blockiert RW weiterhin
**Given:** DONE-Job mit RW-Fenster auf RW3  
**When:** neuer Job kollidiert mit diesem Fenster  
**Then:** Reject (`REJECTED_RW_OCCUPIED`)

### T10 – IN_PROGRESS verändert Linienzeiten nicht
**Given:** IN_PROGRESS-Job mit fixen Linienzeiten  
**When:** Assignment/Change versucht  
**Then:** Linienzeiten bleiben exakt unverändert

### T11 – Kein Auto-Repair bei Konflikt
**Given:** überlappendes RW-Assignment  
**When:** Assign aufgerufen  
**Then:** Core verschiebt nichts und sortiert nichts um; nur Reject

### T12 – Determinismus
**Given:** gleicher Input-State  
**When:** `computeBlocks` zweimal aufgerufen  
**Then:** identischer Output (gleiche Zeiten, gleiche Blocktypen, gleiche Zuordnung)

---

## 3. Optional

### T13 – Conflict Details enthalten Kollisionspartner
Bei Reject enthält Rückgabe mindestens:
- `conflictingJobId`
- `conflictingRwId`
- `conflictingStartTs`
- `conflictingEndTs`

### T14 – Alle 4 Linien und 10 RWs renderbar
Smoke-Test: Blockableitung bleibt stabil bei voller Lane-Anzahl.
