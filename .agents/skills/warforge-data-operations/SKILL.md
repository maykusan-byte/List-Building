---
name: warforge-data-operations
description: Maintain versioned Warforge 40k game data safely. Use for catalog or faction JSON changes, official French locales, rules/PDF imports, inventory CSV migrations, unit-image metadata, or data validation; do not use for ordinary React UI work.
---

# Warforge Data Operations

Use this skill only for a data operation in `warforge-pwa/`. Read the nearest
`AGENTS.md` and [data-contract.md](references/data-contract.md) before editing.
Keep one data domain per change and report the authoritative source, version,
and effective date whenever game content changes.

## Choose the workflow

### Catalogue and locales

- Modify `data/units/` or `data/locales/`, never generated catalog or locale
  files under `public/data/`.
- Preserve `SourceKey`, file ordering, optional source fields, and point lines;
  they determine stable unit identities and costing behavior.
- Run `pnpm test` and `pnpm build` from `warforge-pwa/`.

### Rules

- Start from the relevant PDF in `references/warhammer-40k/`; verify its
  document version and validity date before changing gameplay data.
- For the French core rules, run `pnpm rules:extract`, inspect the generated
  source pages and supplemental blocks, then run `pnpm rules:validate`.
- Do not infer points from rules prose, and do not add mission-card detail
  without a versioned official source.

### Inventory

- Treat `data/inventory/datasheet_x_figs.csv` as the active inventory source.
  Keep its required columns and database fingerprint consistent with the
  generated catalog.
- Treat `inventory:migrate` and `inventory:rebase` as explicit, one-way
  historical migrations. They consume `legacy/warorgan/master_warorgan.json`
  and can rewrite the active CSV; never use them as routine validation.
- Use `pnpm inventory:index` to produce a reviewable catalog index and review
  every migration result before it becomes the active inventory.

### Unit images

- Add exact unit and, when necessary, faction matches to
  `data/unit-image-seeds.json`, including provenance and license metadata.
- Download or transform images only when the user has requested that external
  operation. Then use `images:fetch`, `images:prepare`, `images:build`, and
  `images:validate` in that order.
- Do not identify a unit by approximate filename matching.

### Tactical simulator

- Use `warforge-simulator-development` as well for `data/simulator/` changes.
- Keep manifests, rulepacks, physical profiles, scenarios and coverage in the
  versioned source directory; never edit `public/data/simulator/`.
- Require provenance, version and effective date for executable game rules.
- Mark project-specific geometry assumptions as conventions requiring human
  review; do not present inferred heights or silhouettes as official data.
- Run `pnpm simulator:validate`, `pnpm test` and `pnpm build`.

## Finish every operation

- Run the domain-specific command plus `pnpm test`; run `pnpm build` whenever
  public catalog inputs change.
- Review generated files rather than editing them by hand, and verify text
  with accents, apostrophes, and quotes.
- State the source document, validation performed, generated artifacts, and
  any remaining human review in the handoff.
