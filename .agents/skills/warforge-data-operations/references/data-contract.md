# Warforge data contract

## Sources and generated artifacts

| Domain | Versioned source | Generated or archival counterpart |
| --- | --- | --- |
| Catalogue | `warforge-pwa/data/units/` | `warforge-pwa/public/data/catalog.json` |
| French locales | `warforge-pwa/data/locales/fr/official.json` | `warforge-pwa/public/data/locales/fr/catalog.json` |
| Inventory | `warforge-pwa/data/inventory/datasheet_x_figs.csv` | `warforge-pwa/public/data/datasheet_x_figs.csv` |
| Core rules | `references/warhammer-40k/rules/core/` | `warforge-pwa/data/rules/core-rules-fr.json` then public copy |
| Unit images | `warforge-pwa/data/unit-image-seeds.json` and validated WebP assets | `warforge-pwa/public/data/unit-images.json` |
| Historical migration | `legacy/warorgan/master_warorgan.json` | Never loaded by the PWA |

## Invariants

- The current catalog schema is `warforge-catalog/v2`. `UnitId` uses the
  source-key-derived book identity and unit index; changing ordering or a
  source filename is an identity migration.
- `DataInfo.json` supplies the V11 data version. Keep optional source values
  intact and do not collapse multiple point rows into one value.
- The inventory header requires `DatabaseFingerprint`, `UnitId`,
  `ID_figurine`, and `Type`; the latter is exactly `real` or `proxy`.
- French core rules are generated from the archived French PDF. The English
  core PDF and faction packs are contextual references, not automatic inputs.
- Images require an exact seeded match and source/license metadata. The missing
  image report is a validation queue, not a license to add approximate matches.
