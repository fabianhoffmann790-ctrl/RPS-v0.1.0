# RPS – Gantt Planner Core V1 (UPDATED, binding)

## 0. Ziel
Implementiere den deterministischen Planner-Core für:
- **4 Linien-Zeitstrahlen (fix)**
- **10 RW-Zeitstrahlen (Belegung)**

Fokus: korrekte Blockableitung und konfliktfreie RW-Zuweisung durch **Reject statt Auto-Reparatur**.

---

## 1. Grundprinzip (bindend)

- **Linienplan ist fix**: Positionen (`Pos1..PosN`) und Zeiten (`fillStartTs`, `fillEndTs`) ändern sich nie automatisch.
- **Kein Ripple, kein Repair, keine automatische Umreihung** auf Linien.
- **Linien laufen parallel**: L1, L2, L3, L4 sind unabhängig.

---

## 2. Domain-Modell (V1)

### 2.1 Lanes (fixe Anzahl)
- Linien: `L1`, `L2`, `L3`, `L4`
- Rührwerke: `RW1` … `RW10`

### 2.2 Job
Pflichtfelder:
- `jobId`
- `productId`
- `qtyL`
- `lineId`
- `positionIndex` (fixe Reihenfolge in der Linie)
- `fillStartTs` (fix)
- `fillEndTs` (fix)
- `rwId?` (optional, manuell)
- `status`: `PLANNED | IN_PROGRESS | DONE`

### 2.3 Produkt-Stammdaten
Pflichtfelder:
- `productionDurationMin(productId)` (Herstellungsdauer pro Produkt)

Konstante:
- `cleanDurationMin = 20`

### 2.4 Abgeleitete Blöcke
Blöcke sind reine Ableitung aus Jobs + Stammdaten.

Blocktypen:
- `LINE_FILL`
- `RW_PREP`
- `RW_SUPPLY`
- `RW_CLEAN`

Gemeinsame Blockfelder:
- `blockId`
- `type`
- `laneType` (`LINE` | `RW`)
- `laneId`
- `startTs`
- `endTs`
- `jobId`

---

## 3. Linien-Zeitstrahl (4×)

Für jeden Job wird genau ein Linienblock erzeugt:
- `LINE_FILL.start = fillStartTs(job)`
- `LINE_FILL.end = fillEndTs(job)`
- Reihenfolge in der Darstellung = `positionIndex`

Bindend:
- Core verändert weder `positionIndex` noch `fillStartTs/fillEndTs` automatisch.

---

## 4. RW-Zeitstrahl (10×) – Blockierung

Wenn ein Job einem RW zugewiesen ist (`rwId` gesetzt), wird das RW in drei Segmenten blockiert:

1. `RW_PREP`: `prepStart -> fillStart`
2. `RW_SUPPLY`: `fillStart -> fillEnd` (1:1 Spiegel von `LINE_FILL`)
3. `RW_CLEAN`: `fillEnd -> cleanEnd`

Abgeleitete Zeiten:
- `fillStart = fillStartTs(job)`
- `fillEnd = fillEndTs(job)`
- `prepStart = fillStart - productionDurationMin(productId)`
- `cleanEnd = fillEnd + 20min`

Gesamtbelegungsfenster für Overlap-Prüfung:
- `[prepStart, cleanEnd]`

---

## 5. RW Assignment Regel (bindend)

RW-Zuweisung ist **manuell** (z. B. Drag von Linie auf RW).

Intent:
- `ASSIGN_RW(jobId, rwId)`
- `CHANGE_RW(jobId, rwId)`

Ablauf:
1. Berechne neues Belegungsfenster `[prepStart, cleanEnd]` des Jobs auf Ziel-RW.
2. Prüfe Overlap gegen alle bestehenden Belegungen auf diesem RW.
3. Overlap-Formel:
   - `newStart < otherEnd && newEnd > otherStart`

Wenn Overlap:
- Assignment **ablehnen**
- Keine Änderung am Job (`rwId` bleibt unverändert)
- Ergebniscode: `REJECTED_RW_OCCUPIED`
- Conflict-Details zurückgeben (betroffener Job/Zeitraum)

Wenn frei:
- Assignment setzen
- RW-Blöcke erzeugen

Bindend:
- **Keine** automatische Verschiebung von Linienzeiten
- **Keine** automatische Umreihung
- **Kein** automatischer Repair

---

## 6. Statusregeln

- `DONE`:
  - sichtbar als Historie
  - blockiert RW im belegten Fenster wie normal
  - wird nicht automatisch verändert

- `IN_PROGRESS`:
  - Linienzeiten bleiben fix
  - optionale UI-Policy, ob Umzuweisung erlaubt ist

Grundsatz:
- Core verschiebt Linienzeiten niemals.

---

## 7. Architekturvertrag

UI sendet nur Intents, Core entscheidet:
- `ASSIGN_RW`
- `CHANGE_RW`

Optional (nicht planend, nur Datenpflege):
- `ADD_JOB`
- `UPDATE_JOB_LINE_SLOT` (setzt explizit `positionIndex`, `fillStartTs`, `fillEndTs`)

Core liefert:
- abgeleitete Blöcke (`LINE_FILL`, `RW_PREP`, `RW_SUPPLY`, `RW_CLEAN`)
- Ergebnisstatus (`ACCEPTED` | `REJECTED_RW_OCCUPIED`)
- Conflict-Details bei Reject

---

## 8. Scope Guardrails (V1)

Nicht Teil von V1:
- Kein Optimizer
- Kein Batch-Splitting
- Kein Clustering
- Keine Materialbilanzsimulation
- Keine automatische Änderung von Linienzeiten/-reihenfolge

Fixe Annahmen:
- Reinigung immer 20 Minuten
- Herstellungsdauer nur produktabhängig
