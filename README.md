# RPS v0.1.0

Dieses Repository enthält die Grundlagen für das **Rührwerk Plan System (RPS)**.

## Dokumente

- `REQUIREMENTS.md` – bindende V1-Spezifikation (UPDATED): 4 fixe Linien, 10 RWs, manuelle RW-Zuweisung mit Reject bei Konflikt.
- `TEST.md` – aktualisierter Core-Testplan (Accept/Reject, unveränderte Linienzeiten, Boundary-Fälle).
- `TASK_BREAKDOWN.md` – Umsetzungsplan für Core, UI und Tests.

## Zielbild (V1, UPDATED)

- Linienplan ist fix (`positionIndex`, `fillStartTs`, `fillEndTs`).
- Keine automatische Umplanung (kein Ripple/Repair auf Linien).
- RW-Belegung wird aus `RW_PREP + RW_SUPPLY + RW_CLEAN` abgeleitet.
- Konflikt bei RW-Zuweisung => **Reject** (`REJECTED_RW_OCCUPIED`) statt Auto-Verschiebung.
