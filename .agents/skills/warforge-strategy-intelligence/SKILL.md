---
name: warforge-strategy-intelligence
description: Structure, research, validate, and integrate sourced Warforge 40k V11 strategic knowledge. Use when modelling mission-specific victory axes, unit or detachment roles, synergies, matchup plans, tournament/meta evidence, or recommendations that could influence list building or in-game decisions.
---

# Warforge Strategy Intelligence

Build reviewable knowledge. Tactical judgement is neither an official rule nor an observed win rate.

Read [knowledge-contract.md](references/knowledge-contract.md) completely before creating or editing a strategy record. The PWA source of truth is `warforge-pwa/data/strategy/knowledge-base.json`; its validator and its public mirror are part of the same canonical pipeline.

## Workflow

1. Establish scope: V11 source version, `DataInfo.Version`, mission-pack ID, format, date range, and the question being answered.
2. Add or update source records first. Archive a stable local copy and its SHA-256 for every external document, result set, article, or export.
3. Classify every claim:
   - **official fact**: rule, points, FAQ, mission, or catalogue content;
   - **observation**: dated tournament or playtest measurements with a method and sample;
   - **inference**: contextual tactical conclusion derived from cited evidence;
   - **hypothesis**: candidate to test, never published as advice.
4. Model the scenario before units. Capture scoring windows, board constraints, and prioritised victory axes without copying unsupported mission-card content.
   - For secondary missions, also use the dedicated `warforge-secondary-mission-analysis` skill; it owns the portfolio, family, claim and decision-example workflow.
   - For a primary-mission guide, run `node warforge-pwa/scripts/seed-primary-guides.mjs` only when intentionally rebuilding the complete 15-guide matrix.
   - Break advice into atomic `tacticalClaims`: one statement, one rationale, explicit preconditions, counterplay, trade-offs, axes, sources and review date.
   - Compose claims through `matchupGuides`; keep worked score ledgers in `workedExamples`. Narrative exports are generated projections, never sources of rules.
5. Model official rules before tactical conclusions. Add a V3 `ruleNode` for each rule, stratagem, enhancement, mission rule, army rule, or datasheet ability: stable owner ID, optional composition prerequisites, factual wording, timing, target selector, activation mode, official source/page, limitations, and review date.
6. Use pinned normalised catalogue IDs for unit and detachment profiles. Never link strategy data with a displayed unit name.
7. Model each synergy as an inference edge: participants, non-empty `ruleIds`, a bounded `relationKind`, preconditions, timing, counterplay, trade-offs, limitations, axis effects, sources, and review date. A reviewed edge can reference only reviewed rule nodes.
8. Treat the roster resolver as a composition check, not a game-state simulator. It may resolve selected detachments, units, catalogue keywords, and selected enhancements; it must not silently assume CP, distances, target legality, phase timing, dice results, hidden state, or mission scoring are satisfied.
9. Add a recommendation or victory plan only when every cited source and contextual reference resolves. A victory plan binds one precise primary mission, a detachment profile, rule nodes and synergy edges; add ordered operational stages and decision branches with explicit gates, safer fallbacks, and only rule/synergy IDs already owned by the plan. State confidence, counterplay, limitations, trade-offs, and a review date.
10. Pin each reference roster to its catalogue version, precise primary mission and victory plan. Validate its exact points total and canonical roster legality; loading it in the builder must create an editable copy, never overwrite a user list.
11. Run the canonical validation and synchronize the generated public mirror:

   ~~~powershell
   pnpm --dir warforge-pwa strategy:validate
   pnpm --dir warforge-pwa build
   ~~~

   Review `warforge-pwa/public/data/strategy-guides/coverage.json`: missing validated roster sides are an explicit review queue and must never be filled with inferred points or unvalidated lists.

   The skill relay is available for a workspace-level check, but delegates to the exact same validator:

   ~~~powershell
   node .agents/skills/warforge-strategy-intelligence/scripts/validate-strategy-knowledge.mjs warforge-pwa/data/strategy/knowledge-base.json --workspace .
   ~~~

## Evidence and safety gates

- Use official, versioned documents for rules facts. Never infer points from rules prose.
- Preserve the distinction between a trusted mission archive and an official mission source. Respect summary-only mission-pack limits.
- Treat GDM as an approved, non-official mission archive. It can support archived mission context; it never upgrades a fact to an official rule.
- Give every meta claim a collection period, format, region or event scope, sample definition, local archive/hash, and review date. An observation does not establish causality.
- Do not state a win probability or rate without the exact measured population and calculation. All advice must remain contextual.
- Mark contradictory, weak, stale, or incomplete evidence as `needs-review`; wording alone cannot upgrade it.
- Render imported narrative as DOM text, never injected HTML.

## Integration boundary

The source lives in `warforge-pwa/data/strategy/knowledge-base.json`. `pnpm build` first validates it and then copies it to `warforge-pwa/public/data/strategy-knowledge.json`; the latter and the secondary-mission report are generated and must not be edited manually.

Before changing catalogue, rules, French locales, missions, points, inventory, or image metadata, read and follow the `warforge-data-operations` skill. Read `warforge-pwa/AGENTS.md` before application changes. Keep strategic claims, data operations, and UI changes in focused commits or reviews.

## Resources

- [knowledge-contract.md](references/knowledge-contract.md): canonical schema, evidence rules, and publication gates.
- [validate-strategy-knowledge.mjs](scripts/validate-strategy-knowledge.mjs): thin workspace relay to the PWA canonical validator.
