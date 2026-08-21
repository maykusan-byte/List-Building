import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateSimulatorData } from './validate-simulator-data.mjs';

const sourceDirectory = resolve(import.meta.dirname, '../data/simulator');

async function expectInvalidMutation(filename, mutate, message) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'warforge-simulator-data-'));
  try {
    await cp(sourceDirectory, temporaryDirectory, { recursive: true });
    const path = join(temporaryDirectory, filename);
    const document = JSON.parse(await readFile(path, 'utf8'));
    mutate(document);
    await writeFile(path, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await expect(validateSimulatorData({ dataDirectory: temporaryDirectory, validatePublicMirror: false })).rejects.toThrow(message);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

describe('simulator data contract', () => {
  it('validates ready synthetic fixtures without claiming scenario or rule coverage', async () => {
    const { manifest } = await validateSimulatorData();
    expect(manifest.schemaVersion).toBe('warforge-simulator-manifest/v1');
    expect(manifest.version).toBe('0.1.0');
  });

  it.each([
    ['missing', (profile) => { delete profile.approval; }],
    ['mismatched scope', (profile) => { profile.approval.scope = 'another-scenario'; }],
    ['mismatched reviewer', (profile) => { profile.approval.reviewedBy = 'someone-else'; }],
    ['mismatched review date', (profile) => { profile.approval.reviewedAt = '2026-08-12'; }]
  ])('rejects %s physical-profile approval', async (_label, mutate) => {
    await expectInvalidMutation('physical-profiles.json', (document) => mutate(document.profiles[0]), /approbation|reviewer|date de revue|portée d’approbation/);
  });

  it.each([
    ['coverage support', 'coverage.json', (document) => { document.supportedUnitIds.push('real-catalog-unit'); }],
    ['coverage metadata', 'coverage.json', (document) => { document.metadata = { supportedUnitId: 'real-catalog-unit' }; }],
    ['fixture linkage', 'scenarios.json', (document) => { document.fixtureUnits[0].supportedUnitId = 'real-catalog-unit'; }],
    ['template linkage', 'scenarios.json', (document) => { document.fixtureUnitTemplates[0].supportedUnitId = 'real-catalog-unit'; }],
    ['nested template linkage', 'scenarios.json', (document) => { document.fixtureUnitTemplates[0].weapons[0].catalogUnitId = 'real-catalog-unit'; }],
    ['scenario root linkage', 'scenarios.json', (document) => { document.scenarios[0].catalogUnitId = 'real-catalog-unit'; }],
    ['scenario player linkage', 'scenarios.json', (document) => { document.scenarios[0].players[0].supportedUnitId = 'real-catalog-unit'; }],
    ['physical profile linkage', 'physical-profiles.json', (document) => { document.profiles[0].unitId = 'real-catalog-unit'; }],
    ['rulepack metadata linkage', 'rulepacks.json', (document) => { document.rulepacks[0].metadata = { databaseFingerprint: 'catalog-fingerprint' }; }]
  ])('rejects real catalog IDs through %s', async (_label, filename, mutate) => {
    await expectInvalidMutation(filename, mutate, /catalogue|identité catalogue interdite/);
  });

  it.each([
    ['covered boolean', (document) => { document.covered = true; }],
    ['covered coverageStatus', (document) => { document.coverageStatus = 'covered'; }],
    ['supported alias', (document) => { document.supported = true; }]
  ])('rejects the M4 draft top-level claim %s', async (_label, mutate) => {
    await expectInvalidMutation('m4-real-roster-facts.json', mutate, /clés exactes requises/);
  });

  it('rejects a changed M4 PISTOL formalization', async () => {
    await expectInvalidMutation('m4-real-roster-facts.json', (document) => {
      document.mandatoryRules[1].formalizedConstraint = 'Les armes PISTOL peuvent toujours tirer.';
    }, /contrainte formalisée exacte requise/);
  });

  it.each([
    ['legacy visibility points', (document) => { document.physicalProfiles[0].visibilityPoints = [{ x: 0, y: 0, z: 320 }]; }, /points legacy|clés exactes requises/],
    ['sampled endpoint domain', (document) => { document.lineOfSightConvention.endpointDomain = 'normalized-points'; }, /lineOfSightConvention/],
    ['sampled policy layout', (document) => { document.lineOfSightConvention.pointLayout.pointsPerHitbox = 14; }, /lineOfSightConvention/],
    ['sampled policy ray width', (document) => { document.lineOfSightConvention.rayWidthWorldUnits = 1; }, /lineOfSightConvention/],
    ['sampled policy blocker domain', (document) => { document.lineOfSightConvention.blockerDomain = 'models'; }, /lineOfSightConvention/],
    ['sampled policy review', (document) => { document.sampledLineOfSightReview.reviewedBy = 'someone-else'; }, /sampledLineOfSightReview/],
    ['terrain layout review state', (document) => { document.terrainLayout.reviewStatus = 'pending-human-review'; }, /convention de terrain M4 approuvée requise/],
    ['terrain layout approval', (document) => { document.terrainLayout.approval.reviewedBy = 'someone-else'; }, /terrainLayout\.approval/],
    ['terrain layout occlusion', (document) => { document.terrainLayout.zones[0].occlusion = 'terrain-blocker'; }, /terrainLayout\.zones\[0\]/],
    ['terrain layout geometry', (document) => { document.terrainLayout.zones[0].footprint.outer[0].x += 1; }, /terrainLayout\.zones\[0\]/],
    ['weapon profile', (document) => { document.unitFacts[0].selectedRangedWeapon.strength = 5; }, /selectedRangedWeapon/],
    ['catalog source', (document) => { document.catalogSnapshots[0].sha256 = '0'.repeat(64); }, /sha256 ne correspond pas/]
  ])('rejects M4 drift in %s', async (_label, mutate, message) => {
    await expectInvalidMutation('m4-real-roster-facts.json', mutate, message);
  });

  it.each([
    ['physical convention visibility points', (document) => { document.physicalConventions[0].visibilityPoints = [{ x: 0, y: 0, z: 320 }]; }],
    ['unit fact visibility points', (document) => { document.unitFacts[0].visibilityPoints = [{ x: 0, y: 0, z: 320 }]; }],
    ['shape finite sampling strategy', (document) => { document.physicalProfiles[0].shape.samplingStrategy = 'finite-normalized-points'; }],
    ['mandatory-rule visibility points', (document) => { document.mandatoryRules[0].visibilityPoints = [{ x: 0, y: 0, z: 320 }]; }],
    ['mandatory-rule snake-case visibility points', (document) => { document.mandatoryRules[0].visibility_points = [{ x: 0, y: 0, z: 320 }]; }],
    ['mandatory-rule sampling object', (document) => { document.mandatoryRules[0].sampling = { mode: 'finite normalized point pairs' }; }]
  ])('rejects legacy or unversioned M4 point fields through %s', async (_label, mutate) => {
    await expectInvalidMutation('m4-real-roster-facts.json', mutate, /points legacy|clés exactes requises/);
  });

  it.each([
    ['convention statement', (document) => { document.physicalConventions[0].statement += ' La LoS est décidée par cinq sampled-points normalisés.'; }, /statement de convention physique exact requis/],
    ['profile display name', (document) => { document.physicalProfiles[0].displayName = 'Infanterie réelle M4 — cinq sampled-points normalisés'; }, /displayName exact requis/]
  ])('rejects contradictory M4 geometry policy text in %s', async (_label, mutate, message) => {
    await expectInvalidMutation('m4-real-roster-facts.json', mutate, message);
  });

  it.each([
    ['sourceId substitution', (document) => { document.legalityAndPhaseDispositions[0].sourceId = 'warforge-catalog-blood-angels-1.2.13.0'; }],
    ['collection substitution', (document) => { document.legalityAndPhaseDispositions[0].collection = 'Dettachments'; }]
  ])('rejects M4 disposition %s', async (_label, mutate) => {
    await expectInvalidMutation('m4-real-roster-facts.json', mutate, /provenance/);
  });

  it.each([
    ['wrong printed page', (rule) => { rule.source.printedPage = 51; }, /page imprimée 50 requise/],
    ['save characteristic', (rule) => { rule.effect.characteristic = 'save'; }, /la CT doit être dégradée/],
    ['save bonus field', (rule) => { rule.effect.coverSaveBonus = 1; }, /clés exactes requises/],
    ['saveModifier field', (rule) => { rule.effect.saveModifier = 1; }, /clés exactes requises/],
    ['bonus alias', (rule) => { rule.effect.bonus = 1; }, /clés exactes requises/],
    ['effect alias', (rule) => { rule.effect = { kind: 'degrade-ballistic-skill', amount: 1 }; }, /clés exactes requises/],
    ['wrong trigger', (rule) => { rule.trigger = 'saving-throw'; }, /trigger ranged-attack-targeting requis/],
    ['missing conditions', (rule) => { delete rule.conditions; }, /clés exactes requises/],
    ['removed condition branch', (rule) => { rule.conditions.allTargetModelsMatchAny.pop(); }, /exactement deux branches/],
    ['additional effect', (rule) => { rule.additionalEffect = { kind: 'modify-save', amount: 1 }; }, /clés exactes requises/],
    ['extra condition key', (rule) => { rule.conditions.appliesToSaves = true; }, /clés exactes requises/],
    ['altered keyword branch', (rule) => { rule.conditions.allTargetModelsMatchAny[0].keywordsAny = ['INFANTRY']; }, /mots-clés INFANTRY\/BEAST\/SWARM exacts/]
  ])('rejects cover formalization with %s', async (_label, mutate, message) => {
    await expectInvalidMutation('rulepacks.json', (document) => mutate(document.rulepacks[0].rules[0]), message);
  });

  it.each([
    ['nonexistent PDF', (source) => { source.path = '../references/warhammer-40k/rules/core/missing.pdf'; }, /PDF local introuvable/],
    ['forged PDF hash', (source) => { source.sha256 = '0'.repeat(64); }, /sha256 ne correspond pas/],
    ['path outside references', (source) => { source.path = 'data/rules/core-rules-fr.json'; }, /hors du répertoire references/],
    ['missing snapshot date', (source) => { delete source.retrievedAt; }, /retrievedAt requis/]
  ])('rejects an official source with %s', async (_label, mutate, message) => {
    await expectInvalidMutation('manifest.json', (document) => mutate(document.sources[0]), message);
  });

  it.each([
    ['orphan provenance registry reference', (document) => { document.profiles[0].provenance.sourceId = 'missing-convention'; }, /convention orpheline/],
    ['mismatched registry version', (document) => { document.profiles[0].provenance.version = '2.0.0'; }, /provenance incohérente/],
    ['mismatched registry reviewer', (document) => { document.conventions[0].reviewedBy = 'someone-else'; }, /approbation incorrecte/]
  ])('rejects %s', async (_label, mutate, message) => {
    await expectInvalidMutation('physical-profiles.json', mutate, message);
  });

  it('rejects a broken fixture reference from the scenario', async () => {
    await expectInvalidMutation('scenarios.json', (document) => {
      document.scenarios[0].players[0].fixtureUnitId = 'missing-fixture';
    }, /fixture orpheline missing-fixture/);
  });
});
