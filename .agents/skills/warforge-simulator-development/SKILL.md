---
name: warforge-simulator-development
description: Build, review, test, or resume the Warforge tactical simulator, including its deterministic game engine, 2.5D geometry, rule packs, simulator data, PixiJS UI, persistence, project tracker, model routing, or milestone audits. Use for every change under src/simulator, data/simulator, docs/simulator, or the simulator project script.
---

# Warforge Simulator Development

Keep every simulator change recoverable, sourced and deterministic.

## Start the task

1. Read `warforge-pwa/AGENTS.md` and the nearest scoped `AGENTS.md`.
2. Read `warforge-pwa/docs/simulator/PLAN.md`, `STATUS.md`,
   `project-state.json`, `model-routing.json`, and applicable ADRs.
3. Run `pnpm simulator:project:check` from `warforge-pwa/`.
4. Resume the single `in_progress` task or transition one dependency-ready task.
5. If delegating, use the task's `executionProfile`; give each worker a bounded
   TaskBrief and disjoint files. Only the coordinator updates project state.

## Preserve the engine contract

- Keep domain and geometry code pure TypeScript. Do not import React, PixiJS,
  browser storage, or view state into them.
- Route accepted actions through `GameCommand -> GameEvent -> GameState`.
- Inject the versioned PRNG; never call `Math.random()` in simulator logic.
- Store spatial values as integer 0.1 mm world units and separate them from
  screen coordinates.
- Reject unsupported rules, physical profiles and scenarios explicitly. Never
  silently approximate a supported game session.
- Link executable rules and physical conventions to versioned provenance.
- Treat imported text as untrusted and never inject it as HTML.

## Work with simulator data

Use `$warforge-data-operations` as well for `data/simulator/` changes. Edit the
versioned source only, run `pnpm simulator:validate`, and let `pnpm sync-data`
produce `public/data/simulator/`.

## Finish or pause

1. Review the diff and run every validation required by the task.
2. Record command, result, date and scope as tracker evidence.
3. Transition to `done` only when all criteria and required independent review
   are present.
4. Regenerate `STATUS.md` and rerun `pnpm simulator:project:check`.
5. If work remains, keep the task `in_progress` or mark it `blocked`, then set
   `resumeContext.nextAction` to one exact, executable step.

Do not edit generated `STATUS.md` or public simulator data manually. Change the
plan only with a new ADR and `planVersion` increment.
