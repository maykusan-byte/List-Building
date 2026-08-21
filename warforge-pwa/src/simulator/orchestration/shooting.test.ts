import { describe, expect, it } from 'vitest';
import {
  createInitialGameState,
  createSimulationSave,
  executeGameCommand,
  reduceGameEvent,
  replayGameEvents,
  type CoverageReportV1,
  type GameCommand,
  type GameState,
  type PhysicalModelProfileV1,
  type SessionSetup,
  type SourceReferenceV1,
  type WeaponProfileV1
} from '../domain';
import { CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE } from '../rules';
import { createSessionCompatibilityReport } from './compatibility';
import { createSimulatorActor, dispatchGameCommand, getSimulatorGameState } from './machine';
import { createShootingEnvironment, executeBasicShootingCommand, executeOathOfMomentSelectionCommand, replayGameEventsWithShootingEnvironment, type ShootingEnvironment } from './shooting';

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
    expect(coverEvent.sourceRefs).toEqual([CORE_BASIC_RANGED_ATTACK_SOURCE, ...CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BENEFIT_OF_COVER_SOURCE]);
    expect(coverEvent.sourceRefs).toContainEqual(expect.objectContaining({ reference: '04' }));
    expect(coverEvent.sourceRefs).toContainEqual(expect.objectContaining({ reference: '13.08', page: 50 }));
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
});
