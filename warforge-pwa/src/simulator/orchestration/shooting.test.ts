import { describe, expect, it } from 'vitest';
import {
  createInitialGameState,
  createSimulationSave,
  createSimulationSaveV2,
  createSimulationSaveV3,
  executeGameCommand,
  reduceGameEvent,
  replayGameEvents,
  rollDice,
  type CoverageReportV1,
  type GameCommand,
  type GameState,
  type PhysicalModelProfileV1,
  type SessionSetup,
  type SourceReferenceV1,
  type WeaponProfileV1
} from '../domain';
import { CORE_ANTI_SOURCE, CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE, CORE_BLAST_SOURCE, CORE_DICE_SOURCE, CORE_LETHAL_HITS_SOURCE, CORE_RAPID_FIRE_SOURCE, CORE_SUSTAINED_HITS_SOURCE, CORE_TWIN_LINKED_SOURCE, CORE_UNIT_SELECTED_TO_SHOOT_SOURCE, OFFICIAL_APP_MODIFIERS_SOURCE, OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE, OFFICIAL_APP_REROLLS_SOURCE } from '../rules';
import { createSessionCompatibilityReport } from './compatibility';
import { createSimulatorActor, dispatchGameCommand, getSimulatorGameState } from './machine';
import { createShootingEnvironment, createShootingReplayVerifier, executeBasicShootingCommand, executeGenericRerollDecisionCommand, executeLethalHitsDecisionCommand, executeOathOfMomentSelectionCommand, replayGameEventsWithShootingEnvironment, type ShootingEnvironment } from './shooting';

const GOLDEN_SEED = 0x57465247;
const physicalSource: SourceReferenceV1 = {
  sourceId: 'closed-core-infantry-geometry-v1',
  version: '1.0.0',
  effectiveFrom: '2026-08-13'
};
const profile: PhysicalModelProfileV1 = {
  schemaVersion: 'warforge-simulator/v1',
  id: 'training-infantry-32mm-v1',
  displayName: 'Training infantry',
  baseShape: { kind: 'circle', radius: 160 },
  height: 400,
  visibilityPoints: [{ x: 0, y: 0, z: 320 }],
  source: physicalSource,
  isConvention: true
};

function weapon(overrides: Partial<WeaponProfileV1> = {}): WeaponProfileV1 {
  return {
    id: 'training-rifle',
    displayName: 'Training rifle',
    range: 24 * 254,
    attacks: 2,
    ballisticSkill: 3,
    strength: 4,
    armourPenetration: -1,
    damage: 1,
    sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE],
    ...overrides
  };
}

function session(options: { readonly targetX?: number; readonly weapon?: WeaponProfileV1 } = {}): SessionSetup {
  const targetX = options.targetX ?? 4_000;
  const rifle = options.weapon ?? weapon();
  const redModels = Array.from({ length: 5 }, (_unused, index) => ({
    id: `red-${index + 1}`,
    playerId: 'red',
    profileId: profile.id,
    position: { x: 0, y: index * 400 },
    orientationDegrees: 0
  }));
  const blueModels = Array.from({ length: 5 }, (_unused, index) => ({
    id: `blue-${index + 1}`,
    playerId: 'blue',
    profileId: profile.id,
    position: { x: targetX, y: index * 400 },
    orientationDegrees: 180
  }));
  return {
    manifest: {
      schemaVersion: 'warforge-simulator/v1',
      simulatorVersion: '0.1.0',
      catalogFingerprint: 'closed-fixture-v1',
      rulePackIds: ['core-basic-shooting-v1'],
      rulePackFingerprint: 'closed-rules-v1',
      scenarioId: 'closed-core-shooting-duel-v1',
      scenarioFingerprint: 'closed-scenario-v1',
      coverageVersion: 'closed-coverage-v1'
    },
    players: [
      { id: 'red', displayName: 'Red', rosterId: 'closed-core-red-unit-v1' },
      { id: 'blue', displayName: 'Blue', rosterId: 'closed-core-blue-unit-v1' }
    ],
    models: [...redModels, ...blueModels],
    shootingEnvironmentFingerprint: environment().fingerprint,
    units: [
      {
        id: 'red-unit',
        fixtureId: 'closed-core-red-unit-v1',
        playerId: 'red',
        modelIds: redModels.map((model) => model.id),
        keywords: ['INFANTRY'],
        toughness: 4,
        save: 3,
        woundsPerModel: 2,
        weaponProfiles: [rifle],
        weaponAssignments: redModels.map((model) => ({ modelId: model.id, weaponProfileId: rifle.id, quantity: 1 })),
        sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
      },
      {
        id: 'blue-unit',
        fixtureId: 'closed-core-blue-unit-v1',
        playerId: 'blue',
        modelIds: blueModels.map((model) => model.id),
        keywords: ['INFANTRY'],
        toughness: 4,
        save: 3,
        woundsPerModel: 2,
        weaponProfiles: [rifle],
        weaponAssignments: blueModels.map((model) => ({ modelId: model.id, weaponProfileId: rifle.id, quantity: 1 })),
        sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
      }
    ]
  };
}

function environment(withCover = false, blocksSight = false, environmentWeapon = weapon()): ShootingEnvironment {
  const terrainZones = withCover ? [{
    id: 'light-cover-zone-v1',
    footprint: { polygons: [{ outer: [{ x: 3_500, y: -200 }, { x: 5_000, y: -200 }, { x: 5_000, y: 2_000 }, { x: 3_500, y: 2_000 }] }] },
    ruleIds: ['core.benefit-of-cover']
  }] : blocksSight ? [{
    id: 'opaque-wall-v1',
    footprint: { polygons: [{ outer: [{ x: 1_900, y: -200 }, { x: 2_100, y: -200 }, { x: 2_100, y: 2_000 }, { x: 1_900, y: 2_000 }] }] },
    ruleIds: [],
    blocker: {
      id: 'opaque-wall-v1',
      footprint: { polygons: [{ outer: [{ x: 1_900, y: -200 }, { x: 2_100, y: -200 }, { x: 2_100, y: 2_000 }, { x: 1_900, y: 2_000 }] }] },
      minZ: 0,
      maxZ: 400
    }
  }] : [];
  return createShootingEnvironment({
    physicalProfiles: { [profile.id]: profile },
    weaponProfiles: { [environmentWeapon.id]: environmentWeapon },
    terrainZones,
    coverRules: [{
      id: 'core.benefit-of-cover',
      source: CORE_BENEFIT_OF_COVER_SOURCE,
      ballisticSkillPenalty: 1,
      branches: [
        { kind: 'inside-terrain-zone', qualifyingKeywords: ['INFANTRY', 'BEAST', 'SWARM'] },
        { kind: 'not-entirely-visible-due-to-terrain' }
      ]
    }]
  });
}

function genericRerollEnvironment(environmentWeapon: WeaponProfileV1, hitRolls: boolean, woundRolls: boolean): ShootingEnvironment {
  const base = environment(false, false, environmentWeapon);
  return createShootingEnvironment({
    physicalProfiles: base.physicalProfiles,
    weaponProfiles: base.weaponProfiles,
    terrainZones: base.terrainZones,
    coverRules: base.coverRules,
    genericRerolls: {
      id: 'simulator.fixture-generic-rerolls-v1',
      source: OFFICIAL_APP_REROLLS_SOURCE,
      hitRolls,
      woundRolls
    }
  });
}

function attackVolumeEnvironment(weapons: readonly WeaponProfileV1[]): ShootingEnvironment {
  return createShootingEnvironment({
    physicalProfiles: { [profile.id]: profile },
    weaponProfiles: Object.fromEntries(weapons.map((entry) => [entry.id, entry])),
    terrainZones: [],
    coverRules: [{
      id: 'core.benefit-of-cover',
      source: CORE_BENEFIT_OF_COVER_SOURCE,
      ballisticSkillPenalty: 1,
      branches: [
        { kind: 'inside-terrain-zone', qualifyingKeywords: ['INFANTRY', 'BEAST', 'SWARM'] },
        { kind: 'not-entirely-visible-due-to-terrain' }
      ]
    }]
  });
}

function attackVolumeSession(targetModelCount: number, targetX: number, weapons: readonly WeaponProfileV1[]): SessionSetup {
  const redModels = [{ id: 'red-1', playerId: 'red', profileId: profile.id, position: { x: 0, y: 0 }, orientationDegrees: 0 }];
  const blueModels = Array.from({ length: targetModelCount }, (_unused, index) => ({
    id: `blue-${index + 1}`,
    playerId: 'blue',
    profileId: profile.id,
    position: { x: targetX, y: index * 400 },
    orientationDegrees: 180
  }));
  const defenderWeapon = weapons[0];
  return {
    ...session(),
    models: [...redModels, ...blueModels],
    units: [
      {
        id: 'red-unit', fixtureId: 'closed-core-red-unit-v1', playerId: 'red', modelIds: ['red-1'], keywords: ['INFANTRY'], toughness: 4, save: 3, woundsPerModel: 2,
        weaponProfiles: weapons,
        weaponAssignments: weapons.map((entry) => ({ modelId: 'red-1', weaponProfileId: entry.id, quantity: 1 })),
        sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
      },
      {
        id: 'blue-unit', fixtureId: 'closed-core-blue-unit-v1', playerId: 'blue', modelIds: blueModels.map((model) => model.id), keywords: ['INFANTRY'], toughness: 4, save: 3, woundsPerModel: 2,
        weaponProfiles: [defenderWeapon],
        weaponAssignments: [{ modelId: 'blue-1', weaponProfileId: defenderWeapon.id, quantity: 1 }],
        sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE]
      }
    ]
  };
}

const OATH_SALAMANDERS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-catalog-salamanders-1.2.13.0',
  version: '1.2.13.0',
  effectiveFrom: '2026-07-24'
};
const OATH_BLOOD_ANGELS_SOURCE: SourceReferenceV1 = {
  sourceId: 'warforge-catalog-blood-angels-1.2.13.0',
  version: '1.2.13.0',
  effectiveFrom: '2026-07-24'
};

function oathEnvironment(): ShootingEnvironment {
  const base = environment();
  return createShootingEnvironment({
    physicalProfiles: base.physicalProfiles,
    weaponProfiles: base.weaponProfiles,
    terrainZones: base.terrainZones,
    coverRules: base.coverRules,
    oathOfMoment: {
      id: 'adeptus-astartes.oath-of-moment',
      variants: [
        { playerId: 'red', rerollFailedHits: true, woundRollModifier: 1, sourceRefs: [OATH_SALAMANDERS_SOURCE] },
        { playerId: 'blue', rerollFailedHits: true, woundRollModifier: 0, sourceRefs: [OATH_BLOOD_ANGELS_SOURCE] }
      ]
    }
  });
}

function accept(state: GameState, command: GameCommand): GameState {
  const result = executeGameCommand(state, command);
  expect(result.accepted).toBe(true);
  if (!result.accepted) throw new Error(result.rejection.message);
  return result.state;
}

function shootingState(seed = GOLDEN_SEED, setup = session()): { readonly initial: GameState; readonly state: GameState } {
  const initial = createInitialGameState('closed-core-shooting', seed);
  let state = accept(initial, { id: 'setup', actorId: 'red', type: 'setup-session', session: setup });
  state = accept(state, { id: 'command', actorId: 'red', type: 'transition-phase', nextPhase: 'command' });
  state = accept(state, { id: 'movement', actorId: 'red', type: 'transition-phase', nextPhase: 'movement' });
  state = accept(state, { id: 'shooting', actorId: 'red', type: 'transition-phase', nextPhase: 'shooting' });
  return { initial, state };
}

function shootingCommand(id = 'shoot'): Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }> {
  return { id, actorId: 'red', type: 'resolve-basic-shooting', attackerUnitId: 'red-unit', targetUnitId: 'blue-unit', weaponProfileId: 'training-rifle' };
}

function coverage(): CoverageReportV1 {
  return {
    schemaVersion: 'warforge-simulator/v1',
    version: 'closed-coverage-v1',
    entries: [
      { subjectType: 'physical-profile', subjectId: profile.id, status: 'covered' },
      { subjectType: 'fixture-unit', subjectId: 'closed-core-red-unit-v1', status: 'covered' },
      { subjectType: 'fixture-unit', subjectId: 'closed-core-blue-unit-v1', status: 'covered' },
      { subjectType: 'weapon', subjectId: 'training-rifle', status: 'covered' },
      { subjectType: 'rule', subjectId: 'core-basic-shooting-v1', status: 'covered' },
      { subjectType: 'scenario', subjectId: 'closed-core-shooting-duel-v1', status: 'covered' }
    ]
  };
}

describe('M3 trusted basic shooting path', () => {
  it('persists and replays the source-backed Oath selection before applying its bounded attack modifiers', () => {
    const environmentWithOath = oathEnvironment();
    const oathSession = { ...session(), shootingEnvironmentFingerprint: environmentWithOath.fingerprint };
    const initial = createInitialGameState('oath-selection', GOLDEN_SEED);
    let state = accept(initial, { id: 'setup', actorId: 'red', type: 'setup-session', session: oathSession });
    state = accept(state, { id: 'command', actorId: 'red', type: 'transition-phase', nextPhase: 'command' });
    const selected = executeOathOfMomentSelectionCommand(state, { id: 'oath', actorId: 'red', type: 'select-oath-of-moment-target', targetUnitId: 'blue-unit' }, environmentWithOath);
    expect(selected.accepted).toBe(true);
    if (!selected.accepted) return;
    expect(selected.state.oathOfMomentSelections.red).toMatchObject({ targetUnitId: 'blue-unit', round: 0, rerollFailedHits: true, woundRollModifier: 1, sourceRefs: [OATH_SALAMANDERS_SOURCE] });
    state = accept(selected.state, { id: 'movement', actorId: 'red', type: 'transition-phase', nextPhase: 'movement' });
    state = accept(state, { id: 'shooting', actorId: 'red', type: 'transition-phase', nextPhase: 'shooting' });
    const shot = executeBasicShootingCommand(state, shootingCommand('oath-shot'), environmentWithOath);
    expect(shot.accepted).toBe(true);
    if (!shot.accepted || shot.events[0].type !== 'basic-shooting-resolved') return;
    expect(shot.events[0].evidence.attackModifiers).toEqual({
      rerollFailedHits: true,
      woundRollModifier: 1,
      sourceRuleIds: ['adeptus-astartes.oath-of-moment'],
      sourceRefs: [OATH_SALAMANDERS_SOURCE]
    });
    expect(shot.events[0].attackGroups[0].result.woundRequired).toBe(3);
    expect(shot.events[0].sourceRefs).toContainEqual(OATH_SALAMANDERS_SOURCE);
    expect(replayGameEventsWithShootingEnvironment(initial, shot.state.eventLog, environmentWithOath)).toEqual(shot.state);
  });

  it('uses the versioned M4 sampled-cylinder convention instead of profile visibility points', () => {
    const base = environment();
    const sampled = createShootingEnvironment({
      physicalProfiles: base.physicalProfiles,
      weaponProfiles: base.weaponProfiles,
      terrainZones: base.terrainZones,
      coverRules: base.coverRules,
      lineOfSightPolicy: { id: 'm4-sampled-cylinder-los-v1', version: '1.0.0' }
    });
    const ready = shootingState(GOLDEN_SEED, { ...session(), shootingEnvironmentFingerprint: sampled.fingerprint });
    const result = executeBasicShootingCommand(ready.state, shootingCommand('sampled-los'), sampled);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    expect(result.events[0].evidence.lineOfSight).toMatchObject({
      visible: true,
      reason: 'clear',
      ray: { from: { x: 0, y: 0, z: 0 }, to: { x: 4_000, y: 0, z: 0 } }
    });
    expect(replayGameEventsWithShootingEnvironment(ready.initial, result.state.eventLog, sampled)).toEqual(result.state);
  });

  it('keeps command input free of range, visibility and cover facts', () => {
    const { state } = shootingState();
    const command = shootingCommand();
    expect(Object.keys(command).sort()).toEqual(['actorId', 'attackerUnitId', 'id', 'targetUnitId', 'type', 'weaponProfileId']);
    const direct = executeGameCommand(state, command);
    expect(direct).toMatchObject({ accepted: false, rejection: { code: 'trusted-shooting-environment-required' }, state });
  });

  it('computes no-cover CT 3, cover CT 4 and AP -1 save 4 from trusted facts', () => {
    const plain = shootingState();
    const coveredEnvironment = environment(true);
    const covered = shootingState(GOLDEN_SEED, { ...session(), shootingEnvironmentFingerprint: coveredEnvironment.fingerprint });
    const plainResult = executeBasicShootingCommand(plain.state, shootingCommand('plain'), environment());
    const coverResult = executeBasicShootingCommand(covered.state, shootingCommand('cover'), coveredEnvironment);
    expect(plainResult.accepted).toBe(true);
    expect(coverResult.accepted).toBe(true);
    if (!plainResult.accepted || !coverResult.accepted) return;
    const plainEvent = plainResult.events[0];
    const coverEvent = coverResult.events[0];
    expect(plainEvent).toMatchObject({ type: 'basic-shooting-resolved', result: { hitRequired: 3, saveRequired: 4 }, evidence: { cover: { applies: false, ballisticSkillPenalty: 0 } } });
    expect(coverEvent).toMatchObject({
      type: 'basic-shooting-resolved',
      result: { hitRequired: 4, saveRequired: 4 },
      evidence: { cover: { applies: true, ballisticSkillPenalty: 1, sourceRuleIds: ['core.benefit-of-cover'], terrainZoneIds: ['light-cover-zone-v1'] } }
    });
    if (coverEvent.type !== 'basic-shooting-resolved') throw new Error('Expected shooting event.');
    expect(coverEvent.sourceRefs).toEqual([CORE_BASIC_RANGED_ATTACK_SOURCE, ...CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_UNIT_SELECTED_TO_SHOOT_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE]);
    expect(coverEvent.sourceRefs).toContainEqual(expect.objectContaining({ reference: '04' }));
    expect(coverEvent.sourceRefs).toContainEqual(expect.objectContaining({ reference: '13.08', page: 50 }));
  });

  it('derives Rapid Fire and Blast attack volumes from authoritative range and active target models', () => {
    const volumeWeapon = weapon({
      id: 'rapid-blast-rifle',
      attackVolumeAbilities: [
        { kind: 'rapid-fire', value: 1, source: CORE_RAPID_FIRE_SOURCE },
        { kind: 'blast', value: 1, source: CORE_BLAST_SOURCE }
      ]
    });
    const environmentWithVolume = attackVolumeEnvironment([volumeWeapon]);
    const atHalfRange = attackVolumeSession(4, volumeWeapon.range / 2 + 320, [volumeWeapon]);
    const atHalfReady = shootingState(GOLDEN_SEED, { ...atHalfRange, shootingEnvironmentFingerprint: environmentWithVolume.fingerprint });
    const atHalf = executeBasicShootingCommand(atHalfReady.state, { ...shootingCommand('rapid-half'), weaponProfileId: volumeWeapon.id }, environmentWithVolume);
    expect(atHalf.accepted).toBe(true);
    if (!atHalf.accepted || atHalf.events[0].type !== 'basic-shooting-resolved') return;
    expect(atHalf.events[0].attackGroups[0].attackVolume).toEqual({
      targetModelCount: 4,
      baseAttacksPerWeapon: 2,
      rapidFireBonus: 1,
      blastBonus: 0,
      attacksPerWeapon: 3,
      atHalfRange: true,
      sourceRefs: [CORE_RAPID_FIRE_SOURCE, CORE_BLAST_SOURCE]
    });
    const beyondHalfRange = attackVolumeSession(4, volumeWeapon.range / 2 + 321, [volumeWeapon]);
    const beyondReady = shootingState(GOLDEN_SEED, { ...beyondHalfRange, shootingEnvironmentFingerprint: environmentWithVolume.fingerprint });
    const beyond = executeBasicShootingCommand(beyondReady.state, { ...shootingCommand('rapid-beyond'), weaponProfileId: volumeWeapon.id }, environmentWithVolume);
    expect(beyond.accepted).toBe(true);
    if (!beyond.accepted || beyond.events[0].type !== 'basic-shooting-resolved') return;
    expect(beyond.events[0].attackGroups[0].attackVolume.rapidFireBonus).toBe(0);

    for (const [targetModelCount, expectedBlastBonus] of [[4, 0], [5, 1], [10, 2]] as const) {
      const scenario = attackVolumeSession(targetModelCount, 2_000, [volumeWeapon]);
      const ready = shootingState(GOLDEN_SEED, { ...scenario, shootingEnvironmentFingerprint: environmentWithVolume.fingerprint });
      const resolved = executeBasicShootingCommand(ready.state, { ...shootingCommand(`blast-${targetModelCount}`), weaponProfileId: volumeWeapon.id }, environmentWithVolume);
      expect(resolved.accepted).toBe(true);
      if (resolved.accepted && resolved.events[0]?.type === 'basic-shooting-resolved') {
        expect(resolved.events[0].attackGroups[0].attackVolume).toMatchObject({ targetModelCount, blastBonus: expectedBlastBonus });
      }
    }
  });

  it('accepts one atomic multi-weapon declaration and rejects a second unit selection without entropy', () => {
    const firstWeapon = weapon({ id: 'rifle-a' });
    const secondWeapon = weapon({ id: 'rifle-b', attacks: 1 });
    const multiEnvironment = attackVolumeEnvironment([firstWeapon, secondWeapon]);
    const multiSession = attackVolumeSession(5, 2_000, [firstWeapon, secondWeapon]);
    const ready = shootingState(GOLDEN_SEED, { ...multiSession, shootingEnvironmentFingerprint: multiEnvironment.fingerprint });
    const forgedCount = executeBasicShootingCommand(ready.state, {
      ...shootingCommand('forged-target-count'), weaponProfileId: firstWeapon.id, targetModelCount: 999
    } as Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }>, multiEnvironment);
    expect(forgedCount).toMatchObject({ accepted: false, rejection: { code: 'non-authoritative-shooting-input' }, state: ready.state });
    expect(forgedCount.state.prng).toEqual(ready.state.prng);
    const declared = executeBasicShootingCommand(ready.state, {
      id: 'multi-weapon', actorId: 'red', type: 'resolve-basic-shooting', attackerUnitId: 'red-unit', targetUnitId: 'blue-unit', weaponProfileIds: [firstWeapon.id, secondWeapon.id]
    }, multiEnvironment);
    expect(declared.accepted).toBe(true);
    if (!declared.accepted || declared.events[0].type !== 'basic-shooting-resolved') return;
    expect(declared.events[0].weaponProfileIds).toEqual([firstWeapon.id, secondWeapon.id]);
    expect(declared.events[0].attackGroups.map((group) => group.weaponProfileId)).toEqual([firstWeapon.id, secondWeapon.id]);
    expect(declared.state.shootingSelectedUnitIds).toEqual(['red-unit']);
    expect(declared.state.firedWeaponKeys).toEqual(['red-unit:rifle-a', 'red-unit:rifle-b']);
    expect(replayGameEventsWithShootingEnvironment(ready.initial, declared.state.eventLog, multiEnvironment)).toEqual(declared.state);
    const repeated = executeBasicShootingCommand(declared.state, { ...shootingCommand('multi-second'), weaponProfileId: secondWeapon.id }, multiEnvironment);
    expect(repeated).toMatchObject({ accepted: false, rejection: { code: 'unit-already-selected-to-shoot' }, state: declared.state });
    expect(repeated.state.prng).toEqual(declared.state.prng);
    expect(repeated.state.eventLog).toEqual(declared.state.eventLog);
    let nextShooting = declared.state;
    for (const [id, nextPhase] of [['multi-charge', 'charge'], ['multi-fight', 'fight'], ['multi-command', 'command'], ['multi-movement', 'movement'], ['multi-next-shooting', 'shooting']] as const) {
      nextShooting = accept(nextShooting, { id, actorId: 'red', type: 'transition-phase', nextPhase });
    }
    expect(nextShooting.shootingSelectedUnitIds).toEqual([]);
  });

  it('gives sustained hits globally contiguous identities and rebases their critical-hit origins across weapon groups', () => {
    const firstWeapon = weapon({
      id: 'sustained-first-a2',
      attacks: 2,
      ballisticSkill: 2,
      weaponKeywords: [{ kind: 'sustained-hits', value: 2, source: CORE_SUSTAINED_HITS_SOURCE }]
    });
    const secondWeapon = weapon({
      id: 'sustained-second-a1',
      attacks: 1,
      ballisticSkill: 2,
      weaponKeywords: [{ kind: 'sustained-hits', value: 1, source: CORE_SUSTAINED_HITS_SOURCE }]
    });
    const multiEnvironment = attackVolumeEnvironment([firstWeapon, secondWeapon]);
    const multiSession = {
      ...attackVolumeSession(5, 2_000, [firstWeapon, secondWeapon]),
      shootingEnvironmentFingerprint: multiEnvironment.fingerprint
    };
    const command: Extract<GameCommand, { readonly type: 'resolve-basic-shooting' }> = {
      id: 'multi-sustained-identities', actorId: 'red', type: 'resolve-basic-shooting', attackerUnitId: 'red-unit', targetUnitId: 'blue-unit', weaponProfileIds: [firstWeapon.id, secondWeapon.id]
    };
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        const ready = shootingState(candidate, multiSession);
        const attempt = executeBasicShootingCommand(ready.state, command, multiEnvironment);
        if (!attempt.accepted || attempt.events[0].type !== 'basic-shooting-resolved') continue;
        const [firstGroup, secondGroup] = attempt.events[0].attackGroups;
        if (firstGroup.hitRolls.filter((roll) => roll.critical).length === 1
          && firstGroup.hitRolls.some((roll) => roll.sustainedHitsGenerated === 2)
          && secondGroup.hitRolls.some((roll) => roll.critical && roll.sustainedHitsGenerated === 1)) return candidate;
      }
      throw new Error('No deterministic seed covers the multi-group sustained-hit fixture.');
    })();
    const ready = shootingState(seed, multiSession);
    const result = executeBasicShootingCommand(ready.state, command, multiEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    const event = result.events[0];
    const [firstGroup, secondGroup] = event.attackGroups;
    expect(firstGroup.attackVolume.baseAttacksPerWeapon).toBe(2);
    expect(firstGroup.hitRolls.filter((roll) => roll.sustainedHitsGenerated === 2)).toHaveLength(1);
    expect(event.rolls.map((roll) => roll.attackIndex)).toEqual([...Array(event.rolls.length).keys()]);
    expect(new Set(event.rolls.map((roll) => roll.attackIndex)).size).toBe(event.rolls.length);

    const secondGeneratedLocal = secondGroup.rolls.find((roll) => roll.generatedByCriticalHitOfAttackIndex !== undefined);
    expect(secondGeneratedLocal).toBeDefined();
    if (!secondGeneratedLocal || secondGeneratedLocal.generatedByCriticalHitOfAttackIndex === undefined) return;
    const secondOffset = firstGroup.rolls.length;
    const secondGeneratedGlobal = event.rolls.find((roll) => roll.attackIndex === secondGeneratedLocal.attackIndex + secondOffset);
    expect(secondGeneratedGlobal).toMatchObject({
      attackIndex: secondGeneratedLocal.attackIndex + secondOffset,
      generatedByCriticalHitOfAttackIndex: secondGeneratedLocal.generatedByCriticalHitOfAttackIndex + secondOffset
    });
    expect(replayGameEventsWithShootingEnvironment(ready.initial, result.state.eventLog, multiEnvironment)).toEqual(result.state);
  });

  it('uses the golden seed for deterministic casualty IDs, PRNG chain and exact replay', () => {
    const first = shootingState();
    const second = shootingState();
    const firstResult = executeBasicShootingCommand(first.state, shootingCommand('golden'), environment());
    const secondResult = executeBasicShootingCommand(second.state, shootingCommand('golden'), environment());
    expect(firstResult).toEqual(secondResult);
    expect(firstResult.accepted).toBe(true);
    if (!firstResult.accepted) return;
    const event = firstResult.events[0];
    expect(event).toMatchObject({ type: 'basic-shooting-resolved', prngBefore: first.state.prng, prngAfter: { seed: GOLDEN_SEED } });
    if (event.type !== 'basic-shooting-resolved') throw new Error('Expected shooting event.');
    expect(event.evidence.weapon).toEqual({ firingModelIds: ['red-1', 'red-2', 'red-3', 'red-4', 'red-5'], weaponCount: 5, attacksPerWeapon: 2, totalAttacks: 10 });
    expect(event.result).toEqual({ hitRequired: 3, woundRequired: 4, saveRequired: 4, hits: 5, wounds: 2, failedSaves: 1, damageInflicted: 1, modelsDestroyed: 0, remainingModels: 5, remainingWoundsOnDamagedModel: 1 });
    expect(event.prngAfter).toEqual({ algorithm: 'mulberry32', version: 1, seed: GOLDEN_SEED, value: 2_536_074_124, draws: 17 });
    expect(event.casualtyModelIds).toEqual([]);
    expect(event.targetModelsAfter).toEqual(firstResult.state.units['blue-unit'].models);
    expect(firstResult.state.units['blue-unit'].models.find((model) => model.id === 'blue-1')).toMatchObject({ wounds: 1, active: true });
    expect(() => replayGameEvents(first.initial, firstResult.state.eventLog)).toThrow('trusted shooting environment verifier');
    expect(replayGameEventsWithShootingEnvironment(first.initial, firstResult.state.eventLog, environment())).toEqual(firstResult.state);
    expect(() => createSimulationSave(first.initial, firstResult.state.eventLog, '2026-08-13T12:00:00.000Z')).toThrow('vérificateur spatial');
    const forged = { ...event, prngAfter: { ...event.prngAfter, draws: event.prngAfter.draws + 1 } };
    expect(() => replayGameEvents(first.initial, [...firstResult.state.eventLog.slice(0, -1), forged])).toThrow('trusted shooting environment verifier');
    const spatialForgery = { ...event, evidence: { ...event.evidence, range: { ...event.evidence.range, edgeToEdgeDistance: event.evidence.range.edgeToEdgeDistance + 1 } } };
    const forgedJournal = [...firstResult.state.eventLog.slice(0, -1), spatialForgery];
    expect(() => replayGameEvents(first.initial, forgedJournal)).toThrow('trusted shooting environment verifier');
    expect(() => replayGameEventsWithShootingEnvironment(first.initial, forgedJournal, environment())).toThrow('spatial verification');
    expect(() => reduceGameEvent(first.state, event)).toThrow('trusted shooting environment verifier');
    const omittedGroup = { ...event, attackGroups: event.attackGroups.slice(0, -1) };
    expect(() => replayGameEventsWithShootingEnvironment(first.initial, [...firstResult.state.eventLog.slice(0, -1), omittedGroup], environment())).toThrow('spatial verification');
  });

  it('journals random damage at each allocation and replays it from the trusted fixture profile', () => {
    const variableDamageWeapon = weapon({
      id: 'fixture-random-damage-rifle',
      attacks: 12,
      ballisticSkill: 2,
      strength: 8,
      armourPenetration: -6,
      damage: 1,
      randomDamage: 'D3'
    });
    const variableDamageEnvironment = environment(false, false, variableDamageWeapon);
    const fixture = session({ weapon: variableDamageWeapon });
    const ready = shootingState(GOLDEN_SEED, { ...fixture, shootingEnvironmentFingerprint: variableDamageEnvironment.fingerprint });
    const result = executeBasicShootingCommand(ready.state, { ...shootingCommand('random-damage'), weaponProfileId: variableDamageWeapon.id }, variableDamageEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    const allocations = result.events[0].attackGroups.flatMap((group) => group.allocations).filter((allocation) => allocation.damage !== undefined);
    expect(allocations.length).toBeGreaterThan(0);
    allocations.forEach((allocation) => {
      expect(allocation.randomDamage?.expression).toBe('D3');
      expect(allocation.randomDamage?.sourceRefs).toEqual([OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE, CORE_DICE_SOURCE]);
    });
    expect(result.events[0].sourceRefs).toContainEqual(OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE);
    expect(replayGameEventsWithShootingEnvironment(ready.initial, result.state.eventLog, variableDamageEnvironment)).toEqual(result.state);
  });

  it('generates random A separately for each identical carried weapon before resolving its attacks', () => {
    const variableAttackWeapon = weapon({
      id: 'fixture-random-attack-rifle',
      attacks: 1,
      randomAttacks: 'D3',
      ballisticSkill: 2,
      strength: 8,
      armourPenetration: -6,
      damage: 1
    });
    const variableAttackEnvironment = environment(false, false, variableAttackWeapon);
    const fixture = session({ weapon: variableAttackWeapon });
    const ready = shootingState(GOLDEN_SEED, { ...fixture, shootingEnvironmentFingerprint: variableAttackEnvironment.fingerprint });
    const result = executeBasicShootingCommand(ready.state, { ...shootingCommand('random-attacks'), weaponProfileId: variableAttackWeapon.id }, variableAttackEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    expect(result.events[0].attackGroups).toHaveLength(5);
    const allAttackDice = rollDice(ready.state.prng, 6, 5);
    expect(result.events[0].attackGroups.flatMap((group) => group.randomAttacks?.dice ?? [])).toEqual(allAttackDice.results);
    expect(result.events[0].attackGroups[0].prngBefore).toEqual(allAttackDice.state);
    result.events[0].attackGroups.forEach((group) => {
      expect(group.randomAttacks?.expression).toBe('D3');
      expect(group.randomAttacks?.dice).toHaveLength(1);
      expect(group.randomAttacks?.value).toBeGreaterThanOrEqual(1);
      expect(group.randomAttacks?.value).toBeLessThanOrEqual(3);
      expect(group.attackVolume.baseAttacksPerWeapon).toBe(group.randomAttacks?.value);
    });
    expect(result.events[0].sourceRefs).toContainEqual(OFFICIAL_APP_RANDOM_CHARACTERISTICS_SOURCE);
    expect(replayGameEventsWithShootingEnvironment(ready.initial, result.state.eventLog, variableAttackEnvironment)).toEqual(result.state);
  });

  it('generates random A separately for every physical weapon carried by one model', () => {
    const variableAttackWeapon = weapon({
      id: 'fixture-two-random-attack-rifles',
      attacks: 1,
      randomAttacks: 'D3',
      ballisticSkill: 2,
      strength: 8,
      armourPenetration: -6,
      damage: 1
    });
    const variableAttackEnvironment = attackVolumeEnvironment([variableAttackWeapon]);
    const base = attackVolumeSession(1, 4_000, [variableAttackWeapon]);
    const fixture: SessionSetup = {
      ...base,
      shootingEnvironmentFingerprint: variableAttackEnvironment.fingerprint,
      units: base.units?.map((unit) => unit.id === 'red-unit'
        ? { ...unit, weaponAssignments: [{ modelId: 'red-1', weaponProfileId: variableAttackWeapon.id, quantity: 2 }] }
        : unit)
    };
    const ready = shootingState(0, fixture);
    const result = executeBasicShootingCommand(ready.state, { ...shootingCommand('two-random-attacks'), weaponProfileId: variableAttackWeapon.id }, variableAttackEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    const expectedDice = rollDice(ready.state.prng, 6, 2);
    expect(result.events[0].attackGroups).toHaveLength(2);
    expect(result.events[0].attackGroups.map((group) => group.weaponInstanceIndex)).toEqual([0, 1]);
    expect(result.events[0].attackGroups.every((group) => group.weaponCount === 1)).toBe(true);
    expect(result.events[0].attackGroups.flatMap((group) => group.randomAttacks?.dice ?? [])).toEqual(expectedDice.results);
    expect(result.events[0].attackGroups[0].prngBefore).toEqual(expectedDice.state);
    expect(replayGameEventsWithShootingEnvironment(ready.initial, result.state.eventLog, variableAttackEnvironment)).toEqual(result.state);
    const forgedInstances = {
      ...result.events[0],
      attackGroups: result.events[0].attackGroups.map((group, index) => index === 0 ? { ...group, weaponInstanceIndex: 1 } : group)
    };
    expect(() => replayGameEventsWithShootingEnvironment(ready.initial, [...result.state.eventLog.slice(0, -1), forgedInstances], variableAttackEnvironment)).toThrow('trusted spatial verification');
  });

  it('derives range, A, CT and post-reroll hit modifiers from a trusted fixture plan', () => {
    const modifiedWeapon = weapon({
      id: 'fixture-modifier-rifle',
      range: 3_000,
      attacks: 1,
      ballisticSkill: 3,
      modifierPlan: {
        range: { modifiers: [{ id: 'range-add', operation: 'add', value: 1_000, source: OFFICIAL_APP_MODIFIERS_SOURCE }] },
        attacks: { modifiers: [{ id: 'attacks-add', operation: 'add', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE }] },
        ballisticSkill: { modifiers: [{ id: 'bs-worse', operation: 'add', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE }] },
        hitRoll: { modifiers: [{ id: 'hit-improve', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE }] }
      }
    });
    const modifiedEnvironment = environment(false, false, modifiedWeapon);
    const fixture = session({ weapon: modifiedWeapon });
    const ready = shootingState(GOLDEN_SEED, { ...fixture, shootingEnvironmentFingerprint: modifiedEnvironment.fingerprint });
    const result = executeBasicShootingCommand(ready.state, { ...shootingCommand('fixture-modifiers'), weaponProfileId: modifiedWeapon.id }, modifiedEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    expect(result.events[0].evidence.weapon).toMatchObject({ attacksPerWeapon: 2, totalAttacks: 10 });
    result.events[0].attackGroups.forEach((group) => {
      expect(group.range.weaponRange).toBe(4_000);
      expect(group.attackVolume).toMatchObject({ baseAttacksPerWeapon: 2, attacksPerWeapon: 2 });
      expect(group.result.hitRequired).toBe(4);
      expect(group.modifierSourceRefs).toEqual([OFFICIAL_APP_MODIFIERS_SOURCE]);
      expect(group.hitRolls.every((roll) => roll.modifiedRoll !== undefined)).toBe(true);
    });
    expect(result.events[0].sourceRefs).toContainEqual(OFFICIAL_APP_MODIFIERS_SOURCE);
    expect(replayGameEventsWithShootingEnvironment(ready.initial, result.state.eventLog, modifiedEnvironment)).toEqual(result.state);
  });

  it('derives ANTI and sustained critical triggers from authoritative facts and replays them exactly', () => {
    const criticalWeapon = weapon({
      id: 'critical-trigger-rifle',
      attacks: 1,
      ballisticSkill: 2,
      strength: 1,
      armourPenetration: -6,
      weaponKeywords: [
        { kind: 'anti', targetKeyword: 'INFANTRY', criticalWound: 4, source: CORE_ANTI_SOURCE },
        { kind: 'sustained-hits', value: 1, source: CORE_SUSTAINED_HITS_SOURCE }
      ]
    });
    const criticalEnvironment = environment(false, false, criticalWeapon);
    const base = session({ weapon: criticalWeapon });
    const criticalSession: SessionSetup = {
      ...base,
      shootingEnvironmentFingerprint: criticalEnvironment.fingerprint,
      models: base.models.filter((model) => model.id === 'red-1' || model.id === 'blue-1'),
      units: base.units?.map((unit) => ({
        ...unit,
        modelIds: [unit.playerId === 'red' ? 'red-1' : 'blue-1'],
        weaponAssignments: [{ modelId: unit.playerId === 'red' ? 'red-1' : 'blue-1', weaponProfileId: criticalWeapon.id, quantity: 1 }]
      }))
    };
    const seedForCritical = (() => {
      for (let seed = 0; seed < 10_000; seed += 1) {
        if (rollDice(createInitialGameState('critical-seed', seed).prng, 6, 1).results[0] === 6) return seed;
      }
      throw new Error('No deterministic critical-hit seed.');
    })();
    const ready = shootingState(seedForCritical, criticalSession);
    const result = executeBasicShootingCommand(ready.state, { ...shootingCommand('critical-trigger'), weaponProfileId: criticalWeapon.id }, criticalEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    const group = result.events[0].attackGroups[0];
    expect(group.hitRolls).toMatchObject([{ roll: 6, critical: true, sustainedHitsGenerated: 1 }]);
    expect(group.woundRolls).toEqual(expect.arrayContaining([
      expect.objectContaining({ generatedByCriticalHitOfAttackIndex: 0 })
    ]));
    expect(result.events[0].sourceRefs).toEqual(expect.arrayContaining([CORE_ANTI_SOURCE, CORE_SUSTAINED_HITS_SOURCE]));
    expect(replayGameEventsWithShootingEnvironment(ready.initial, result.state.eventLog, criticalEnvironment)).toEqual(result.state);
  });

  it('refuses [LETHAL HITS] outside its one-carrier fixture scope before an event or PRNG consumption', () => {
    const lethalWeapon = weapon({
      id: 'lethal-decision-pending-rifle',
      weaponKeywords: [{ kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE }]
    });
    const lethalEnvironment = environment(false, false, lethalWeapon);
    const ready = shootingState(GOLDEN_SEED, {
      ...session({ weapon: lethalWeapon }),
      shootingEnvironmentFingerprint: lethalEnvironment.fingerprint
    });
    const result = executeBasicShootingCommand(ready.state, { ...shootingCommand('lethal-decision-pending'), weaponProfileId: lethalWeapon.id }, lethalEnvironment);
    expect(result).toMatchObject({
      accepted: false,
      state: ready.state,
      rejection: { code: 'unsupported-lethal-hits-fixture-scope', sourceRuleIds: ['core.weapon-ability.lethal-hits'] }
    });
    expect(result.state.prng).toEqual(ready.state.prng);
    expect(result.state.eventLog).toEqual(ready.state.eventLog);
  });

  it('keeps the historic atomic event when the eligible lethal fixture rolls no critical hit', () => {
    const lethalWeapon = weapon({ id: 'lethal-single-rifle', attacks: 3, ballisticSkill: 2, weaponKeywords: [{ kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE }] });
    const lethalEnvironment = environment(false, false, lethalWeapon);
    const lethalSession = {
      ...attackVolumeSession(1, 4_000, [lethalWeapon]),
      shootingEnvironmentFingerprint: lethalEnvironment.fingerprint
    };
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        if (!rollDice(createInitialGameState('lethal-no-critical', candidate).prng, 6, 3).results.includes(6)) return candidate;
      }
      throw new Error('No deterministic no-critical seed.');
    })();
    const ready = shootingState(seed, lethalSession);
    const shot = executeBasicShootingCommand(ready.state, { ...shootingCommand('lethal-no-critical'), weaponProfileId: lethalWeapon.id }, lethalEnvironment);
    expect(shot.accepted).toBe(true);
    if (!shot.accepted) return;
    expect(shot.events).toHaveLength(1);
    expect(shot.events[0]).toMatchObject({ type: 'basic-shooting-resolved' });
    expect(shot.state.pendingLethalShooting).toBeNull();
    expect(replayGameEventsWithShootingEnvironment(ready.initial, shot.state.eventLog, lethalEnvironment)).toEqual(shot.state);
  });

  it('journals each ordered lethal choice without consuming entropy and completes from the hit-stage PRNG', () => {
    const lethalWeapon = weapon({ id: 'lethal-mixed-rifle', attacks: 3, ballisticSkill: 2, strength: 1, armourPenetration: -6, weaponKeywords: [{ kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE }] });
    const lethalEnvironment = environment(false, false, lethalWeapon);
    const lethalSession = {
      ...attackVolumeSession(1, 4_000, [lethalWeapon]),
      shootingEnvironmentFingerprint: lethalEnvironment.fingerprint
    };
    const seed = (() => {
      for (let candidate = 0; candidate < 100_000; candidate += 1) {
        if (rollDice(createInitialGameState('lethal-multiple-critical', candidate).prng, 6, 3).results.filter((roll) => roll === 6).length === 2) return candidate;
      }
      throw new Error('No deterministic multiple-critical seed.');
    })();
    const ready = shootingState(seed, lethalSession);
    const staged = executeBasicShootingCommand(ready.state, { ...shootingCommand('lethal-staged'), weaponProfileId: lethalWeapon.id }, lethalEnvironment);
    expect(staged.accepted).toBe(true);
    if (!staged.accepted) return;
    expect(staged.events.map((event) => event.type)).toEqual(['basic-shooting-hit-stage-resolved', 'decision-requested']);
    const beforeChoices = staged.state.prng;
    const firstDecision = staged.state.pendingDecisions[0];
    const first = executeLethalHitsDecisionCommand(staged.state, { id: 'lethal-choice-one', actorId: 'red', type: 'resolve-decision', decisionId: firstDecision.id, optionId: 'auto-wound' }, lethalEnvironment);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(first.events.map((event) => event.type)).toEqual(['basic-shooting-lethal-choice-resolved', 'decision-requested']);
    expect(first.state.prng).toEqual(beforeChoices);
    const secondDecision = first.state.pendingDecisions[0];
    const final = executeLethalHitsDecisionCommand(first.state, { id: 'lethal-choice-two', actorId: 'red', type: 'resolve-decision', decisionId: secondDecision.id, optionId: 'roll-to-wound' }, lethalEnvironment);
    expect(final.accepted).toBe(true);
    if (!final.accepted) return;
    expect(final.events.map((event) => event.type)).toEqual(['basic-shooting-lethal-choice-resolved', 'basic-shooting-completed']);
    expect(final.state.pendingLethalShooting).toBeNull();
    const completed = final.events[1];
    if (completed.type !== 'basic-shooting-completed') throw new Error('Expected lethal completion.');
    expect(completed.attackGroups[0].woundRolls).toEqual(expect.arrayContaining([
      expect.objectContaining({ automatic: true, wound: true, critical: false })
    ]));
    expect(completed.attackGroups[0].woundRolls.some((roll) => roll.automatic === undefined && typeof roll.roll === 'number')).toBe(true);
    expect(completed.attackGroups[0].rolls.find((step) => step.wound && step.criticalHit && step.criticalWound === false && step.woundRoll === undefined)).toBeDefined();
    expect(replayGameEventsWithShootingEnvironment(ready.initial, final.state.eventLog, lethalEnvironment)).toEqual(final.state);
    expect(() => reduceGameEvent(ready.state, staged.events[0])).toThrow('trusted shooting environment verifier');
    const v3 = createSimulationSaveV3(ready.initial, first.state.eventLog, '2026-08-24T12:00:00.000Z', createShootingReplayVerifier(lethalEnvironment));
    expect(v3.schemaVersion).toBe('warforge-simulation-save/v3');
    const forged = structuredClone(final.state.eventLog) as any[];
    const hitStage = forged.find((event) => event.type === 'basic-shooting-hit-stage-resolved');
    if (!hitStage || hitStage.type !== 'basic-shooting-hit-stage-resolved') throw new Error('Expected hit stage.');
    hitStage.resolution.criticalHitKeys = [{ groupIndex: 0, attackIndex: 99 }];
    expect(() => replayGameEventsWithShootingEnvironment(ready.initial, forged, lethalEnvironment)).toThrow('trusted verification');
    const genericDecision = {
      id: 'forged-generic-lethal-decision:0',
      commandId: 'forged-generic-lethal-decision',
      type: 'decision-resolved' as const,
      decisionId: staged.state.pendingDecisions[0].id,
      optionId: 'auto-wound',
      playerId: 'red'
    };
    expect(() => reduceGameEvent(staged.state, genericDecision)).toThrow('trusted shooting environment verifier');
    expect(() => replayGameEventsWithShootingEnvironment(ready.initial, [...staged.state.eventLog, genericDecision], lethalEnvironment)).toThrow('bypasses the trusted shooting continuation');
  });

  it('routes the specialised lethal decision through the existing XState decision state', () => {
    const lethalWeapon = weapon({ id: 'lethal-machine-rifle', attacks: 1, ballisticSkill: 2, weaponKeywords: [{ kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE }] });
    const lethalEnvironment = environment(false, false, lethalWeapon);
    const lethalSession = { ...attackVolumeSession(1, 4_000, [lethalWeapon]), shootingEnvironmentFingerprint: lethalEnvironment.fingerprint };
    const seed = (() => {
      for (let candidate = 0; candidate < 10_000; candidate += 1) {
        if (rollDice(createInitialGameState('lethal-machine-seed', candidate).prng, 6, 1).results[0] === 6) return candidate;
      }
      throw new Error('No deterministic lethal machine seed.');
    })();
    const ready = shootingState(seed, lethalSession);
    const staged = executeBasicShootingCommand(ready.state, { ...shootingCommand('lethal-machine-stage'), weaponProfileId: lethalWeapon.id }, lethalEnvironment);
    if (!staged.accepted) throw new Error(staged.rejection.message);
    const actor = createSimulatorActor({ initialState: ready.initial, gameState: staged.state, shootingEnvironment: lethalEnvironment });
    actor.start();
    expect(actor.getSnapshot().value).toEqual({ active: 'decision' });
    const prngAfterHits = staged.state.prng;
    dispatchGameCommand(actor, { id: 'lethal-machine-choice', actorId: 'red', type: 'resolve-decision', decisionId: staged.state.pendingDecisions[0].id, optionId: 'auto-wound' });
    expect(actor.getSnapshot().value).toEqual({ active: 'shooting' });
    expect(getSimulatorGameState(actor).prng.draws).toBeGreaterThanOrEqual(prngAfterHits.draws);
    expect(getSimulatorGameState(actor).eventLog.at(-1)?.type).toBe('basic-shooting-completed');
  });

  it('rejects an unproven modifier plan during session setup without consuming the PRNG', () => {
    const invalidSource = { ...OFFICIAL_APP_MODIFIERS_SOURCE, sourceId: 'unproven-modifier-source' };
    const invalidWeapon = weapon({
      id: 'fixture-invalid-modifier-rifle',
      modifierPlan: { range: { modifiers: [{ id: 'unproven', operation: 'add', value: 1, source: invalidSource }] } }
    });
    const initial = createInitialGameState('invalid-modifier-fixture', GOLDEN_SEED);
    const setup = executeGameCommand(initial, { id: 'setup-invalid-modifier', actorId: 'red', type: 'setup-session', session: session({ weapon: invalidWeapon }) });
    expect(setup).toMatchObject({ accepted: false, rejection: { code: 'invalid-weapon-profile' }, state: initial });
    expect(setup.state.prng).toEqual(initial.prng);
  });

  it('rejects forged, unsupported and duplicate weapon keywords at session setup before they reach shooting', () => {
    const forgedLethal = weapon({
      id: 'forged-lethal-keyword',
      weaponKeywords: [{ kind: 'lethal-hits', source: { ...CORE_LETHAL_HITS_SOURCE, page: 84 } }]
    });
    const unsupportedKeyword = weapon({
      id: 'unsupported-keyword',
      weaponKeywords: [{ kind: 'unsupported-critical-trigger', source: CORE_LETHAL_HITS_SOURCE }] as unknown as WeaponProfileV1['weaponKeywords']
    });
    const duplicateKeyword = weapon({
      id: 'duplicate-keyword',
      weaponKeywords: [
        { kind: 'sustained-hits', value: 1, source: CORE_SUSTAINED_HITS_SOURCE },
        { kind: 'sustained-hits', value: 2, source: CORE_SUSTAINED_HITS_SOURCE }
      ]
    });
    const malformedKeyword = weapon({
      id: 'malformed-keyword',
      weaponKeywords: [null] as unknown as WeaponProfileV1['weaponKeywords']
    });
    for (const invalidWeapon of [forgedLethal, unsupportedKeyword, duplicateKeyword, malformedKeyword]) {
      const initial = createInitialGameState(`invalid-keyword-${invalidWeapon.id}`, GOLDEN_SEED);
      const setup = executeGameCommand(initial, {
        id: `setup-${invalidWeapon.id}`,
        actorId: 'red',
        type: 'setup-session',
        session: session({ weapon: invalidWeapon })
      });
      expect(setup).toMatchObject({ accepted: false, rejection: { code: 'invalid-weapon-profile' }, state: initial });
      expect(setup).not.toMatchObject({ rejection: { code: 'lethal-hits-decision-required' } });
      expect(setup.state.prng).toEqual(initial.prng);
    }
  });

  it('records actual casualty allocation order, wounded model before smallest fresh ID', () => {
    const lethal = weapon({ attacks: 20, ballisticSkill: 2, strength: 8, armourPenetration: -6, damage: 3 });
    const lethalEnvironment = environment(false, false, lethal);
    const ready = shootingState(7, { ...session({ weapon: lethal }), shootingEnvironmentFingerprint: lethalEnvironment.fingerprint });
    const woundedState: GameState = {
      ...ready.state,
      units: {
        ...ready.state.units,
        'blue-unit': {
          ...ready.state.units['blue-unit'],
          models: ready.state.units['blue-unit'].models.map((model) => model.id === 'blue-2' ? { ...model, wounds: 1 } : model)
        }
      }
    };
    const result = executeBasicShootingCommand(woundedState, shootingCommand('casualty-order'), lethalEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const event = result.events[0];
    if (event.type !== 'basic-shooting-resolved') throw new Error('Expected shooting event.');
    expect(event.casualtyModelIds.slice(0, 2)).toEqual(['blue-2', 'blue-1']);
    expect(result.state.models['blue-2'].active).toBe(false);
    expect(result.state.models['blue-1'].active).toBe(false);
  });

  it('allocates excess fixed damage to one wounded model only', () => {
    const highDamage = weapon({ attacks: 20, ballisticSkill: 2, strength: 8, armourPenetration: -6, damage: 3 });
    const highDamageEnvironment = environment(false, false, highDamage);
    const ready = shootingState(7, { ...session({ weapon: highDamage }), shootingEnvironmentFingerprint: highDamageEnvironment.fingerprint });
    const result = executeBasicShootingCommand(ready.state, shootingCommand('overflow'), highDamageEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    const event = result.events[0];
    if (event.type !== 'basic-shooting-resolved') throw new Error('Expected shooting event.');
    expect(event.casualtyModelIds).toEqual(['blue-1', 'blue-2', 'blue-3', 'blue-4', 'blue-5']);
    expect(event.rolls.filter((roll) => roll.damage !== undefined).every((roll) => roll.damage === 2)).toBe(true);
    expect(event.result.damageInflicted).toBe(event.result.modelsDestroyed * 2);
    expect(event.rolls.filter((roll) => roll.outcome === 'lost-no-target').every((roll) => roll.saved !== true)).toBe(true);
  });

  it('rejects out-of-range and no-LoS requests before drawing entropy', () => {
    const distant = shootingState(GOLDEN_SEED, session({ targetX: 7_000 }));
    const blockedEnvironment = environment(false, true);
    const blocked = shootingState(GOLDEN_SEED, { ...session(), shootingEnvironmentFingerprint: blockedEnvironment.fingerprint });
    const outOfRange = executeBasicShootingCommand(distant.state, shootingCommand('distant'), environment());
    const noLineOfSight = executeBasicShootingCommand(blocked.state, shootingCommand('blocked'), blockedEnvironment);
    expect(outOfRange).toMatchObject({ accepted: false, rejection: { code: 'out-of-range' }, state: distant.state });
    expect(noLineOfSight).toMatchObject({ accepted: false, rejection: { code: 'not-visible' }, state: blocked.state });
    expect(outOfRange.state.prng).toEqual(distant.state.prng);
    expect(noLineOfSight.state.prng).toEqual(blocked.state.prng);
  });

  it('requires the same model pair to be both visible and in range', () => {
    const split = session();
    const splitSession: SessionSetup = {
      ...split,
      models: split.models.map((model) => {
        if (model.id === 'blue-1') return { ...model, position: { x: 1_000, y: 0 } };
        if (model.playerId === 'blue') return { ...model, position: { x: 7_000, y: 5_000 + Number(model.id.at(-1)) * 400 } };
        return model;
      }),
      units: split.units?.map((unit) => unit.id === 'red-unit'
        ? { ...unit, weaponAssignments: [{ modelId: 'red-1', weaponProfileId: 'training-rifle', quantity: 1 }] }
        : unit)
    };
    const wall = environment();
    const splitEnvironment = createShootingEnvironment({
      physicalProfiles: wall.physicalProfiles,
      weaponProfiles: wall.weaponProfiles,
      coverRules: wall.coverRules,
      terrainZones: [{
        id: 'near-wall',
        footprint: { polygons: [{ outer: [{ x: 400, y: -100 }, { x: 600, y: -100 }, { x: 600, y: 100 }, { x: 400, y: 100 }] }] },
        ruleIds: [],
        blocker: {
          id: 'near-wall',
          footprint: { polygons: [{ outer: [{ x: 400, y: -100 }, { x: 600, y: -100 }, { x: 600, y: 100 }, { x: 400, y: 100 }] }] },
          minZ: 0,
          maxZ: 400
        }
      }]
    });
    const boundSession = { ...splitSession, shootingEnvironmentFingerprint: splitEnvironment.fingerprint };
    const ready = shootingState(GOLDEN_SEED, boundSession);
    const result = executeBasicShootingCommand(ready.state, shootingCommand('split-pair'), splitEnvironment);
    expect(result).toMatchObject({ accepted: false, rejection: { code: 'out-of-range' }, state: ready.state });
    expect(result.state.prng).toEqual(ready.state.prng);
  });

  it('counts only weapons carried by active models', () => {
    const ready = shootingState();
    const state: GameState = {
      ...ready.state,
      models: { ...ready.state.models, 'red-1': { ...ready.state.models['red-1'], active: false } },
      units: {
        ...ready.state.units,
        'red-unit': {
          ...ready.state.units['red-unit'],
          models: ready.state.units['red-unit'].models.map((model) => model.id === 'red-1' ? { ...model, wounds: 0, active: false } : model)
        }
      }
    };
    const result = executeBasicShootingCommand(state, shootingCommand('four-carriers'), environment());
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    expect(result.events[0].evidence.weapon).toEqual({ firingModelIds: ['red-2', 'red-3', 'red-4', 'red-5'], weaponCount: 4, attacksPerWeapon: 2, totalAttacks: 8 });
    const noCarriers: GameState = {
      ...state,
      models: Object.fromEntries(Object.entries(state.models).map(([id, model]) => [id, id.startsWith('red-') ? { ...model, active: false } : model])),
      units: { ...state.units, 'red-unit': { ...state.units['red-unit'], models: state.units['red-unit'].models.map((model) => ({ ...model, wounds: 0, active: false })) } }
    };
    expect(executeBasicShootingCommand(noCarriers, shootingCommand('no-carriers'), environment())).toMatchObject({ accepted: false, rejection: { code: 'no-active-weapon-carriers' } });
  });

  it('excludes a blocked carrier and resolves only the eligible carrier at its own cover threshold', () => {
    const base = session();
    const reduced: SessionSetup = {
      ...base,
      models: base.models.filter((model) => ['red-1', 'red-2', 'blue-1', 'blue-2'].includes(model.id)),
      units: base.units?.map((unit) => ({
        ...unit,
        modelIds: unit.playerId === 'red' ? ['red-1', 'red-2'] : ['blue-1', 'blue-2'],
        weaponAssignments: (unit.playerId === 'red' ? ['red-1', 'red-2'] : ['blue-1', 'blue-2']).map((modelId) => ({ modelId, weaponProfileId: 'training-rifle', quantity: 1 }))
      }))
    };
    const canonical = environment();
    const carrierEnvironment = createShootingEnvironment({
      physicalProfiles: canonical.physicalProfiles,
      weaponProfiles: canonical.weaponProfiles,
      coverRules: canonical.coverRules,
      terrainZones: [{
        id: 'r2-wall',
        footprint: { polygons: [{ outer: [{ x: 400, y: 150 }, { x: 600, y: 150 }, { x: 600, y: 1_000 }, { x: 400, y: 1_000 }] }] },
        ruleIds: [],
        blocker: {
          id: 'r2-wall',
          footprint: { polygons: [{ outer: [{ x: 400, y: 150 }, { x: 600, y: 150 }, { x: 600, y: 1_000 }, { x: 400, y: 1_000 }] }] },
          minZ: 0,
          maxZ: 400
        }
      }]
    });
    const ready = shootingState(GOLDEN_SEED, { ...reduced, shootingEnvironmentFingerprint: carrierEnvironment.fingerprint });
    const result = executeBasicShootingCommand(ready.state, shootingCommand('one-eligible'), carrierEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    expect(result.events[0].evidence.weapon).toEqual({ firingModelIds: ['red-1'], weaponCount: 1, attacksPerWeapon: 2, totalAttacks: 2 });
    expect(result.events[0].attackGroups).toHaveLength(1);
    expect(result.events[0].attackGroups[0]).toMatchObject({ firingModelId: 'red-1', result: { hitRequired: 3 }, cover: { applies: false } });
  });

  it('applies the second 13.08 branch when terrain makes the target not entirely visible', () => {
    const base = session();
    const oneModelSession: SessionSetup = {
      ...base,
      models: base.models.filter((model) => model.id === 'red-1' || model.id === 'blue-1'),
      units: base.units?.map((unit) => ({
        ...unit,
        modelIds: [unit.playerId === 'red' ? 'red-1' : 'blue-1'],
        weaponAssignments: [{ modelId: unit.playerId === 'red' ? 'red-1' : 'blue-1', weaponProfileId: 'training-rifle', quantity: 1 }]
      }))
    };
    const partialProfile: PhysicalModelProfileV1 = { ...profile, visibilityPoints: [{ x: 0, y: -100, z: 320 }, { x: 0, y: 100, z: 320 }] };
    const partialEnvironment = createShootingEnvironment({
      physicalProfiles: { [profile.id]: partialProfile },
      weaponProfiles: environment().weaponProfiles,
      coverRules: environment().coverRules,
      terrainZones: [{
        id: 'partial-wall',
        footprint: { polygons: [{ outer: [{ x: 1_900, y: -60 }, { x: 2_100, y: -60 }, { x: 2_100, y: 60 }, { x: 1_900, y: 60 }] }] },
        ruleIds: [],
        blocker: {
          id: 'partial-wall',
          footprint: { polygons: [{ outer: [{ x: 1_900, y: -60 }, { x: 2_100, y: -60 }, { x: 2_100, y: 60 }, { x: 1_900, y: 60 }] }] },
          minZ: 0,
          maxZ: 400
        }
      }]
    });
    const ready = shootingState(GOLDEN_SEED, { ...oneModelSession, shootingEnvironmentFingerprint: partialEnvironment.fingerprint });
    const result = executeBasicShootingCommand(ready.state, shootingCommand('partial-cover'), partialEnvironment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    expect(result.events[0].evidence.cover).toEqual({
      applies: true,
      ballisticSkillPenalty: 1,
      sourceRuleIds: ['core.benefit-of-cover'],
      terrainZoneIds: ['partial-wall'],
      sourceRefs: [CORE_BENEFIT_OF_COVER_SOURCE]
    });
  });

  it('rejects non-canonical cover penalties and extra compiled facts', () => {
    const ready = shootingState();
    const canonical = environment();
    const penaltyTwo = createShootingEnvironment({ physicalProfiles: canonical.physicalProfiles, weaponProfiles: canonical.weaponProfiles, terrainZones: canonical.terrainZones, coverRules: [{ ...canonical.coverRules[0], ballisticSkillPenalty: 2 }] } as unknown as Parameters<typeof createShootingEnvironment>[0]);
    const extras = createShootingEnvironment({ physicalProfiles: canonical.physicalProfiles, weaponProfiles: canonical.weaponProfiles, terrainZones: canonical.terrainZones, coverRules: [...canonical.coverRules, canonical.coverRules[0]] } as unknown as Parameters<typeof createShootingEnvironment>[0]);
    const penaltyState = shootingState(GOLDEN_SEED, { ...session(), shootingEnvironmentFingerprint: penaltyTwo.fingerprint });
    const extraState = shootingState(GOLDEN_SEED, { ...session(), shootingEnvironmentFingerprint: extras.fingerprint });
    expect(executeBasicShootingCommand(penaltyState.state, shootingCommand('penalty-two'), penaltyTwo)).toMatchObject({ accepted: false, rejection: { code: 'invalid-cover-rule-fact' } });
    expect(executeBasicShootingCommand(extraState.state, shootingCommand('extra-cover'), extras)).toMatchObject({ accepted: false, rejection: { code: 'invalid-cover-rule-fact' } });
  });

  it('derives the fingerprint from canonical content and detects mutation', () => {
    const original = environment();
    const modified = createShootingEnvironment({
      physicalProfiles: { ...original.physicalProfiles, [profile.id]: { ...profile, height: profile.height + 1 } },
      weaponProfiles: original.weaponProfiles,
      terrainZones: original.terrainZones,
      coverRules: original.coverRules
    });
    expect(modified.fingerprint).not.toBe(original.fingerprint);
    const mutable = original as unknown as { physicalProfiles: Record<string, { height: number }> };
    mutable.physicalProfiles[profile.id].height += 1;
    const ready = shootingState(GOLDEN_SEED, { ...session(), shootingEnvironmentFingerprint: original.fingerprint });
    expect(executeBasicShootingCommand(ready.state, shootingCommand('mutated-env'), original)).toMatchObject({ accepted: false, rejection: { code: 'invalid-shooting-environment' } });
  });

  it('runs the closed fixture through the complete phase path in the statechart', () => {
    const fixture = session();
    const actor = createSimulatorActor({
      initialState: createInitialGameState('machine-closed-shooting', GOLDEN_SEED),
      compatibility: createSessionCompatibilityReport(fixture, coverage()),
      shootingEnvironment: environment()
    });
    actor.start();
    dispatchGameCommand(actor, { id: 'setup', actorId: 'red', type: 'setup-session', session: fixture });
    for (const [id, nextPhase] of [['command', 'command'], ['movement', 'movement'], ['shooting', 'shooting']] as const) {
      dispatchGameCommand(actor, { id, actorId: 'red', type: 'transition-phase', nextPhase });
    }
    dispatchGameCommand(actor, shootingCommand('machine-shoot'));
    const state = getSimulatorGameState(actor);
    expect(actor.getSnapshot().value).toEqual({ active: 'shooting' });
    expect(state.eventLog.at(-1)).toMatchObject({ type: 'basic-shooting-resolved', commandId: 'machine-shoot' });
    expect(state.units['blue-unit'].models).toHaveLength(5);
  });

  it('requires inferred fixture-unit and weapon coverage for the concrete session', () => {
    const fixture = session();
    const complete = createSessionCompatibilityReport(fixture, coverage());
    expect(complete.isCompatible).toBe(true);
    expect(complete.requirements).toEqual(expect.arrayContaining([
      { subjectType: 'fixture-unit', subjectId: 'closed-core-red-unit-v1' },
      { subjectType: 'fixture-unit', subjectId: 'closed-core-blue-unit-v1' },
      { subjectType: 'weapon', subjectId: 'training-rifle' }
    ]));
    const incomplete = createSessionCompatibilityReport(fixture, {
      ...coverage(),
      entries: coverage().entries.filter((entry) => entry.subjectType !== 'fixture-unit' && entry.subjectType !== 'weapon')
    });
    expect(incomplete.isCompatible).toBe(false);
    expect(incomplete.failures.map((failure) => failure.requirement.subjectType)).toEqual(expect.arrayContaining(['fixture-unit', 'weapon']));
    const changedFixture = {
      ...fixture,
      units: fixture.units?.map((unit, index) => index === 0 ? { ...unit, fixtureId: 'another-fixture' } : unit)
    };
    const changedWeapon = {
      ...fixture,
      units: fixture.units?.map((unit, index) => index === 0 ? {
        ...unit,
        weaponProfiles: unit.weaponProfiles.map((profile) => ({ ...profile, damage: profile.damage + 1 }))
      } : unit)
    };
    expect(createSessionCompatibilityReport(changedFixture, coverage()).manifestFingerprint).not.toBe(complete.manifestFingerprint);
    expect(createSessionCompatibilityReport(changedWeapon, coverage()).manifestFingerprint).not.toBe(complete.manifestFingerprint);
  });

  it('rejects an empty fixture identity during setup instead of throwing in the reducer', () => {
    const fixture = session();
    const invalid = {
      ...fixture,
      units: fixture.units?.map((unit, index) => index === 0 ? { ...unit, fixtureId: '' } : unit)
    };
    const result = executeGameCommand(createInitialGameState('invalid-fixture', GOLDEN_SEED), {
      id: 'invalid-fixture-setup',
      actorId: 'red',
      type: 'setup-session',
      session: invalid
    });
    expect(result).toMatchObject({ accepted: false, rejection: { code: 'invalid-unit' } });
  });

  it('gives [JUMELÉ] a source-backed individual wound-reroll window that saves and replays exactly', () => {
    const twinLinked = weapon({
      attacks: 1,
      ballisticSkill: 2,
      strength: 1,
      armourPenetration: -6,
      weaponKeywords: [{ kind: 'twin-linked', source: CORE_TWIN_LINKED_SOURCE }]
    });
    const rerollEnvironment = environment(false, false, twinLinked);
    const rerollSession = { ...attackVolumeSession(1, 4_000, [twinLinked]), shootingEnvironmentFingerprint: rerollEnvironment.fingerprint };
    const seed = (() => {
      for (let candidate = 0; candidate < 100_000; candidate += 1) {
        const dice = rollDice(createInitialGameState('twin-seed', candidate).prng, 6, 3).results;
        if (dice[0] === 2 && dice[1] === 1 && dice[2] === 6) return candidate;
      }
      throw new Error('Missing deterministic [JUMELÉ] seed.');
    })();
    const ready = shootingState(seed, rerollSession);
    const staged = executeBasicShootingCommand(ready.state, shootingCommand('twin-stage'), rerollEnvironment);
    if (!staged.accepted) throw new Error(staged.rejection.message);
    expect(staged.events.map((event) => event.type)).toEqual(['basic-shooting-reroll-stage-resolved', 'basic-shooting-reroll-stage-resolved', 'decision-requested']);
    expect(staged.state.pendingRerollShooting?.permissions.sourceRefs).toEqual([OFFICIAL_APP_REROLLS_SOURCE, CORE_TWIN_LINKED_SOURCE]);
    expect(createSimulationSaveV3(ready.initial, staged.state.eventLog, '2026-08-24T13:59:00.000Z', createShootingReplayVerifier(rerollEnvironment)).schemaVersion).toBe('warforge-simulation-save/v3');
    expect(replayGameEventsWithShootingEnvironment(ready.initial, staged.state.eventLog, rerollEnvironment)).toEqual(staged.state);
    expect(() => createSimulationSave(ready.initial, staged.state.eventLog, '2026-08-24T13:59:00.000Z')).toThrow('tir interrompu');
    expect(() => createSimulationSaveV2(ready.initial, staged.state.eventLog, '2026-08-24T13:59:00.000Z', createShootingReplayVerifier(rerollEnvironment))).toThrow('tir interrompu');
    const decision = staged.state.pendingDecisions[0];
    const completed = executeGenericRerollDecisionCommand(staged.state, { id: 'twin-reroll', actorId: 'red', type: 'resolve-decision', decisionId: decision.id, optionId: 'reroll' }, rerollEnvironment);
    expect(completed.accepted).toBe(true);
    if (!completed.accepted) return;
    expect(completed.events.map((event) => event.type)).toEqual(['basic-shooting-reroll-choice-resolved', 'basic-shooting-reroll-completed']);
    const event = completed.events[1];
    if (event.type !== 'basic-shooting-reroll-completed') throw new Error('Expected generic reroll completion.');
    expect(event.attackGroups[0].woundRolls).toEqual([expect.objectContaining({ roll: 1, rerollRoll: 6, wound: true, critical: true })]);
    expect(event.rolls).toEqual([expect.objectContaining({ initialWoundRoll: 1, woundRoll: 6, criticalWound: true })]);
    expect(createSimulationSaveV3(ready.initial, completed.state.eventLog, '2026-08-24T14:00:00.000Z', createShootingReplayVerifier(rerollEnvironment)).schemaVersion).toBe('warforge-simulation-save/v3');
    expect(replayGameEventsWithShootingEnvironment(ready.initial, completed.state.eventLog, rerollEnvironment)).toEqual(completed.state);
    const forged = structuredClone(completed.state.eventLog) as any[];
    const choice = forged.find((entry) => entry.type === 'basic-shooting-reroll-choice-resolved');
    choice.choice.optionId = 'keep';
    expect(() => replayGameEventsWithShootingEnvironment(ready.initial, forged, rerollEnvironment)).toThrow('trusted verification');
  });

  it('journals the player-selected hit dice, does not consume entropy for keep choices, and refuses an unsupported generic scope before PRNG', () => {
    const genericWeapon = weapon({ attacks: 2, ballisticSkill: 3 });
    const rerollEnvironment = genericRerollEnvironment(genericWeapon, true, false);
    const fixture = { ...attackVolumeSession(1, 4_000, [genericWeapon]), shootingEnvironmentFingerprint: rerollEnvironment.fingerprint };
    const seed = (() => {
      for (let candidate = 0; candidate < 100_000; candidate += 1) {
        const dice = rollDice(createInitialGameState('generic-seed', candidate).prng, 6, 3).results;
        if (dice[0] === 1 && dice[1] === 4 && dice[2] === 6) return candidate;
      }
      throw new Error('Missing deterministic generic reroll seed.');
    })();
    const ready = shootingState(seed, fixture);
    const staged = executeBasicShootingCommand(ready.state, shootingCommand('generic-stage'), rerollEnvironment);
    if (!staged.accepted) throw new Error(staged.rejection.message);
    const prngAfterOriginalHits = staged.state.prng;
    const firstDecision = staged.state.pendingDecisions[0];
    const kept = executeGenericRerollDecisionCommand(staged.state, { id: 'generic-keep', actorId: 'red', type: 'resolve-decision', decisionId: firstDecision.id, optionId: 'keep' }, rerollEnvironment);
    if (!kept.accepted) throw new Error(kept.rejection.message);
    expect(kept.state.prng).toEqual(prngAfterOriginalHits);
    const secondDecision = kept.state.pendingDecisions[0];
    expect(secondDecision.id).not.toBe(firstDecision.id);
    const replayAttempt = executeGenericRerollDecisionCommand(kept.state, { id: 'generic-second-reroll', actorId: 'red', type: 'resolve-decision', decisionId: firstDecision.id, optionId: 'reroll' }, rerollEnvironment);
    expect(replayAttempt).toMatchObject({ accepted: false, state: kept.state, rejection: { code: 'unknown-decision' } });
    const completed = executeGenericRerollDecisionCommand(kept.state, { id: 'generic-reroll', actorId: 'red', type: 'resolve-decision', decisionId: secondDecision.id, optionId: 'reroll' }, rerollEnvironment);
    if (!completed.accepted) throw new Error(completed.rejection.message);
    const terminal = completed.events.at(-1);
    expect(terminal).toMatchObject({ type: 'basic-shooting-reroll-completed', attackGroups: [expect.objectContaining({ hitRolls: [expect.objectContaining({ roll: 1 }), expect.objectContaining({ roll: 4, rerollRoll: 6, critical: true })] })] });

    const unsupportedReady = shootingState(seed, { ...session({ weapon: genericWeapon }), shootingEnvironmentFingerprint: rerollEnvironment.fingerprint });
    const rejected = executeBasicShootingCommand(unsupportedReady.state, shootingCommand('generic-unsupported'), rerollEnvironment);
    expect(rejected).toMatchObject({ accepted: false, state: unsupportedReady.state, rejection: { code: 'unsupported-generic-reroll-fixture-scope' } });
    expect(rejected.state.prng).toEqual(unsupportedReady.state.prng);
  });
});
