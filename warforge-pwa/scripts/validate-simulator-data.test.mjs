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
