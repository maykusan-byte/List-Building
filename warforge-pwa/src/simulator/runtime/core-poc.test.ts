import { describe, expect, it } from 'vitest';
import {
  CORE_POC_RUNTIME_DOCUMENTS,
  assembleCorePocRuntimeDraftV1,
  assembleCurrentCorePocRuntimeDraftV1,
  type CorePocRuntimeDocumentsV1
} from './core-poc';

function documents(): CorePocRuntimeDocumentsV1 {
  return structuredClone(CORE_POC_RUNTIME_DOCUMENTS);
}

describe('core POC runtime draft', () => {
  it('compiles six synthetic units without catalog or codex coverage', () => {
    const runtime = assembleCurrentCorePocRuntimeDraftV1();

    expect(runtime.readyForCompleteGame).toBe(true);
    expect(runtime.session.completeGame?.compatibility.coverageScope).toBe('closed-complete-game-core-poc-v1');
    expect(runtime.session.players).toHaveLength(2);
    expect(runtime.session.units).toHaveLength(6);
    expect(runtime.session.models).toHaveLength(22);
    expect(runtime.session.units?.every((unit) => unit.coverageSubject?.subjectType === 'fixture-unit')).toBe(true);
    expect(runtime.session.manifest.catalogFingerprint).toBe('fixture-only:no-catalog-coverage');
    expect(runtime.compatibility.supportedCatalogUnitIds).toEqual([]);
    expect(runtime.spatial.readyForPlay).toBe(true);
    expect(runtime.environment.terrainZones).toHaveLength(41);
    expect(runtime.environment.terrainZones.filter((zone) => zone.blocker)).toHaveLength(28);
    expect(runtime.environment.lineOfSightPolicy).toEqual({ id: 'm4-sampled-cylinder-los-v1', version: '1.0.0' });
    expect(Object.keys(runtime.environment.weaponProfiles).sort()).toEqual([
      'core-poc-command-blade-v1',
      'core-poc-training-blade-v1',
      'core-poc-training-rifle-v1'
    ]);
    expect(runtime.blockers).toEqual([]);
    expect(runtime.session.completeGame?.compatibility.report.nonReachableRequirements.map((requirement) => requirement.nodeId).sort()).toEqual([
      'core-stratagem.command-reroll',
      'core-stratagem.epic-challenge',
      'core-stratagem.heroic-intervention',
      'core-stratagem.overwatch'
    ]);
    expect(runtime.blockers.some((blocker) => blocker.includes('murs'))).toBe(false);
  });

  it('reuses one immutable spatial materialization across current session assemblies', () => {
    const first = assembleCurrentCorePocRuntimeDraftV1();
    const second = assembleCurrentCorePocRuntimeDraftV1();

    expect(first).not.toBe(second);
    expect(first.spatial).toBe(second.spatial);
    expect(CORE_POC_RUNTIME_DOCUMENTS).not.toHaveProperty('measurements');
  });

  it('refuses a fixture source missing from the manifest', () => {
    const changed = documents();
    const sources = changed.manifest.sources as unknown as { id: string }[];
    sources.splice(sources.findIndex((source) => source.id === changed.fixtures.sourceId), 1);

    expect(() => assembleCorePocRuntimeDraftV1(changed)).toThrow(/source locale des fixtures absente/);
  });

  it('refuses conflicting copies of a shared synthetic weapon', () => {
    const changed = documents();
    const character = changed.fixtures.templates.find((template) => template.role === 'character')!;
    const rifle = character.weapons.find((weapon) => weapon.id === 'core-poc-training-rifle-v1')!;
    (rifle as { attacks: number }).attacks = 3;

    expect(() => assembleCorePocRuntimeDraftV1(changed)).toThrow(/profil d'arme partagé incohérent/);
  });

  it('refuses a fixture associated with a template of the wrong role', () => {
    const changed = documents();
    (changed.fixtures.unitTemplateByFixtureId as Record<string, string>)['core-poc-a-character-v1'] = 'core-poc-line-template-v1';

    expect(() => assembleCorePocRuntimeDraftV1(changed)).toThrow(/rôle du template incohérent/);
  });
});
