# RPS v0.1.0

Dieses Repository enthält die Grundlagen für das **Rührwerk Plan System (RPS)**.

## Dokumente

- `REQUIREMENTS.md` – fachliche Anforderungen für den Gantt Planner Core V1.
- `TEST.md` – Testplan (Pflicht- und optionale Tests) für den Planner Core.
- `TASK_BREAKDOWN.md` – Aufgabenaufteilung für die Umsetzung (Core, UI, Tests).

## Zielbild (V1)

- Deterministische Planung für Linien und Rührwerke.
- Conflict-free Blöcke durch Ripple + Repair.
- UI als reiner Renderer mit Intents zum Planner-Core.

## Tests lokal ausführen

```bash
npm test
```

Der Test-Command kompiliert den Planner-Core + Tests mit TypeScript (`tsc -p tsconfig.test.json`) und führt danach die Unit-Tests aus (`node --test .tmp-test/tests/plannerCore.test.js`).

## CI

GitHub Actions führt auf Push und Pull-Requests ebenfalls `npm test` aus (`.github/workflows/ci.yml`).
