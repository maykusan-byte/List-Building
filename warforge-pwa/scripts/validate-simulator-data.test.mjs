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
  it('validates the closed duel and keeps the complete-game pilot blocked', async () => {
    const { manifest } = await validateSimulatorData();
    expect(manifest.schemaVersion).toBe('warforge-simulator-manifest/v1');
    expect(manifest.version).toBe('0.7.0');
    expect(manifest.sources).toContainEqual(expect.objectContaining({
      id: 'warforge-event-companion-fr-2026-07',
      version: '1.1',
      effectiveDate: '2026-07-22',
      sha256: 'e32e6f6565e8ff608e347e904c4d730a71cd761a2970d03f1721d4418994b893'
    }));
    expect(manifest.sources).toContainEqual(expect.objectContaining({
      id: 'warforge-official-app-supplemental-rules-fr-2026-08',
      kind: 'official-app-owner-transcription',
      driveFileId: '1A_1ZqTzi6WF9FJnGuvVaHH1Ud2pBDFQH',
      sha256: '7e446091d5b6d8e4d1584307c3002f628a786d9e9445cdd4ab120e0dbe8b7bdc'
    }));
    expect(manifest.sources).toContainEqual(expect.objectContaining({
      id: 'approved-gdm-2026-11th-archive',
      kind: 'trusted-mission-archive',
      status: 'project-approved',
      reviewedBy: 'project-owner',
      officialGwPublication: false,
      sha256: 'a8320287a3fbdde6fb126dee241374110a086383fd2b1cd5012e5a09bb3ccc71'
    }));
  });

  it.each([
    ['orphan source', (document) => { document.nodes[0].sourceRefs[0].sourceId = 'missing-source'; }, /source non canonique/],
    ['orphan official-app reference', (document) => { document.nodes.find((node) => node.id === 'coverage.charge-phase').sourceRefs[1].references = ['faq.missing']; }, /référence orpheline/],
    ['orphan dependency', (document) => { document.nodes[1].dependsOn = ['coverage.missing']; }, /dépendance orpheline/],
    ['missing inverse gap relation', (document) => { document.gaps[0].blocksNodeIds.pop(); }, /relation inverse absente/],
    ['covered node with blocker', (document) => { document.nodes.find((node) => node.id === 'coverage.rosters').status = 'covered'; }, /covered ne peut conserver de gap/],
    ['premature compatibility', (document) => { document.readiness.compatible = true; }, /ne doit pas être compatible/],
    ['incomplete readiness blockers', (document) => { document.readiness.blockingNodeIds.shift(); }, /tous les nœuds reachable non couverts/],
    ['missing required capability', (document) => { document.nodes = document.nodes.filter((node) => node.id !== 'coverage.out-of-scope-zones'); }, /nœud obligatoire absent/],
    ['incomplete complete-game blockers', (document) => { document.nodes.find((node) => node.id === 'coverage.complete-game').blockingGapIds.pop(); }, /relation inverse absente|tous les gaps ouverts/],
    ['roster points drift', (document) => { document.rosterCandidates[0].units[0].points += 5; }, /total de points incohérent/],
    ['missing command-phase source', (document) => { document.nodes.find((node) => node.id === 'coverage.command-phase').sourceRefs.pop(); }, /provenance exacte de coverage.command-phase/],
    ['missing persistent-effects reference', (document) => {
      document.nodes.find((node) => node.id === 'coverage.command-phase').sourceRefs
        .find((source) => source.sourceId === 'warforge-official-app-supplemental-rules-fr-2026-08').references
        .splice(1, 1);
    }, /provenance exacte de coverage.command-phase/],
    ['missing objective-control reference', (document) => {
      document.nodes.find((node) => node.id === 'coverage.terrain-objectives').sourceRefs[0].references.pop();
    }, /provenance exacte de coverage.terrain-objectives/],
    ['missing approved mission source', (document) => {
      document.nodes.find((node) => node.id === 'coverage.mission').sourceRefs.shift();
    }, /provenance exacte de coverage.mission/],
    ['missing covered stratagem reference', (document) => {
      document.nodes.find((node) => node.id === 'coverage.stratagems').sourceRefs[0].references.pop();
    }, /provenance exacte de coverage.stratagems/],
    ['missing stratagem fight dependency', (document) => {
      document.nodes.find((node) => node.id === 'coverage.stratagems').dependsOn.pop();
    }, /dépendances exactes de coverage.stratagems/]
  ])('rejects full-game coverage drift: %s', async (_label, mutate, message) => {
    await expectInvalidMutation('full-game-coverage.json', mutate, message);
  });

  it.each([
    ['a changed Outmanoeuvre score', (document) => { document.primaryMission.scoringWindows[0].award.vp = 9; }, /primaryMission.scoringWindows/],
    ['a forged layout asset hash', (document) => { document.layout.measuredAsset.sha256 = '0'.repeat(64); }, /ressource ou hash incohérent/],
    ['an official-GW claim for GDM', (document) => { document.approval.officialGwPublication = true; }, /approval/],
    ['premature mission playability', (document) => { document.executionReadiness.playable = true; }, /executionReadiness/]
  ])('rejects closed M9 mission drift: %s', async (_label, mutate, message) => {
    await expectInvalidMutation('closed-complete-game-mission.json', mutate, message);
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
    ['forged archive hash', (source) => { source.sha256 = '0'.repeat(64); }, /sha256 ne correspond pas à l'archive locale/],
    ['missing app archive', (source) => { source.path = '../references/warhammer-40k/rules/commentary/missing/archive.json'; }, /archive locale introuvable/]
  ])('rejects the official app FAQ source with %s', async (_label, mutate, message) => {
    await expectInvalidMutation('manifest.json', (document) => mutate(document.sources.find((source) => source.id === 'warforge-official-app-faq-fr-2026-07')), message);
  });

  it.each([
    ['forged transcription hash', (source) => { source.sha256 = '0'.repeat(64); }, /sha256 ne correspond pas à la transcription locale/],
    ['missing owner review', (source) => { delete source.reviewedBy; }, /approbation propriétaire/],
    ['missing local transcription', (source) => { source.path = '../references/warhammer-40k/rules/app-transcriptions/missing.txt'; }, /transcription locale introuvable/]
  ])('rejects the official app owner transcription with %s', async (_label, mutate, message) => {
    await expectInvalidMutation('manifest.json', (document) => mutate(document.sources.find((source) => source.id === 'warforge-official-app-supplemental-rules-fr-2026-08')), message);
  });

  it.each([
    ['forged archive hash', (source) => { source.sha256 = '0'.repeat(64); }, /URL ou empreinte déclarée incohérente|sha256/],
    ['missing owner approval', (source) => { delete source.reviewedBy; }, /approbation propriétaire/],
    ['false official claim', (source) => { source.officialGwPublication = true; }, /officielle GW/]
  ])('rejects the approved GDM source with %s', async (_label, mutate, message) => {
    await expectInvalidMutation('manifest.json', (document) => mutate(document.sources.find((source) => source.id === 'approved-gdm-2026-11th-archive')), message);
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
