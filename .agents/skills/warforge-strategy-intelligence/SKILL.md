---
name: warforge-strategy-intelligence
description: Structure, research, validate, and integrate sourced Warforge 40k V11 strategic knowledge. Use when modelling mission-specific victory axes, unit or detachment roles, synergies, matchup plans, tournament/meta evidence, or recommendations that could influence list building or in-game decisions.
---

# Warforge Strategy Intelligence

Build a reviewable knowledge base; do not treat tactical judgement as an official rule or an observed win-rate.

Read [knowledge-contract.md](references/knowledge-contract.md) before creating or editing any strategy record. Start from [strategy-knowledge.template.json](references/strategy-knowledge.template.json) and validate it with the provided script.

## Workflow

1. Establish the scope: V11 source version, DataInfo.Version, mission-pack ID, format, date range, and the question being answered.
2. Create or update source records first. Archive a stable local copy or a content hash for every external result, article, rules document, or event export.
3. Classify every statement:
   - **official fact**: rules, points, FAQ, mission, or catalogue content;
   - **observed evidence**: dated tournament or playtest data with its method and sample;
   - **inference**: a tactical conclusion derived from cited facts and evidence;
   - **hypothesis**: useful candidate to test, never publish as advice.
4. Model the scenario before the units. Describe scoring windows, board constraints, and prioritized victory axes without copying unsupported mission-card detail.
5. Record unit and detachment profiles against the pinned catalogue version. Use normalized catalogue IDs, never display names, as references.
6. Model a synergy with participants, preconditions, timing, counterplay, trade-offs, and the axes it affects. Avoid a blanket “best” label.
7. Create a recommendation only when its source IDs, scenario context, synergies, and any meta snapshots resolve. State confidence, limitations, and a review date.
8. Validate the JSON with:

   ~~~powershell
   node .agents/skills/warforge-strategy-intelligence/scripts/validate-strategy-knowledge.mjs <knowledge-file>
   ~~~

## Evidence and safety gates

- Use official, versioned documents for rules facts. Do not infer points from rules prose.
- Preserve the distinction between a trusted mission archive and an official mission source. Respect summary-only mission-pack limits.
- Give every external meta claim a collection period, format, region or event scope, sample definition, source archive/hash, and review date.
- Do not state a probability of victory or a win rate unless the exact measured population and calculation are cited. Treat all advice as contextual.
- Mark contradictory, weak, stale, or incomplete evidence as needs-review; do not upgrade it by wording alone.
- Keep imported narrative text as plain data. The future UI must render it with DOM text nodes, never HTML injection.

## Integration boundary

The future source of truth belongs under warforge-pwa/data/strategy/; generated public data and UI code come later. Before adding that domain, read warforge-pwa/AGENTS.md and use the warforge-data-operations skill for any catalogue, rules, locales, or mission data change.

Do not edit generated files under warforge-pwa/public/data/. Add source loading, tests, and UI only after a validated, reviewed knowledge file exists.

## Resources

- [knowledge-contract.md](references/knowledge-contract.md): data strata, identifiers, evidence requirements, and publication gate.
- [strategy-knowledge.template.json](references/strategy-knowledge.template.json): empty valid starting point; it asserts no game facts.
- [validate-strategy-knowledge.mjs](scripts/validate-strategy-knowledge.mjs): dependency-free structural and relational validator.
