import { describe, expect, it } from 'vitest';
import { createInitialGameState, executeGameCommand, sessionCompatibilityFingerprint, sessionCoverageRequirements, type CoverageReportV1 } from '../domain';
import { createSessionCompatibilityReport, createSimulatorActor, dispatchGameCommand, executeM4RealRosterMove, getSimulatorGameState } from '../orchestration';
import { exportSimulation, importSimulation } from '../persistence';
import { CORE_BENEFIT_OF_COVER_SOURCE } from '../rules';
import { executeBasicShootingCommand, executeOathOfMomentSelectionCommand, replayGameEventsWithShootingEnvironment } from '../orchestration/shooting';
import {
  createM4RealRosterActor,
  M4_REAL_ROSTER_SESSION_DOCUMENTS,
  assembleM4RealRosterSession
} from './m4-real-roster-session';

function plan() {
  return assembleM4RealRosterSession();
}

describe('M4 real-roster session plan', () => {
  it('compiles exactly the approved fourteen actual models with catalog-unit coverage subjects', () => {
    const compiled = plan();
    const modelIds = compiled.session.models.map((model) => model.id);
    const requirements = sessionCoverageRequirements(compiled.session);

    expect(compiled.session.players.map((player) => player.id)).toEqual(['blood-angels', 'salamanders']);
    expect(compiled.session.units).toHaveLength(4);
    expect(modelIds).toHaveLength(14);
    expect(new Set(modelIds)).toHaveLength(14);
    expect(modelIds).toContain('m4:real-roster-shooting-duel-v1:real-roster-salamanders-pilot-v1:m4-salamanders-assault-intercessors-v1:c0:model:0');
    expect(modelIds).toContain('m4:real-roster-shooting-duel-v1:real-roster-blood-angels-pilot-v1:m4-blood-angels-captain-v1:c0:model:0');
    expect(compiled.session.units?.every((unit) => unit.coverageSubject?.subjectType === 'unit')).toBe(true);
    expect(requirements.filter((entry) => entry.subjectType === 'fixture-unit')).toEqual([]);
    expect(requirements.filter((entry) => entry.subjectType === 'unit').map((entry) => entry.subjectId)).toEqual([
      'book-blood-angels:unit:33',
      'book-blood-angels:unit:12',
      'book-space-marines:unit:18',
      'book-space-marines:unit:28'
    ]);
  });

  it('binds roster, catalogue, rules, terrain and preset scenario into the compatibility fingerprint', () => {
    const compiled = plan();

    expect(compiled.session.manifest).toMatchObject({
      catalogFingerprint: 'fnv1a-32fc3f46-5031198',
      scenarioId: 'real-roster-shooting-duel-v1',
      coverageVersion: 'm4-real-roster-integration/v3',
      rulePackIds: [
        'adeptus-astartes.oath-of-moment',
        'core-basic-shooting-v1',
        'core.benefit-of-cover',
        'm4-sampled-cylinder-los-v1',
        'simulator.m4.real-roster-movement',
        'weapon.pistol'
      ]
    });
    expect(compiled.compatibility.manifestFingerprint).toEqual(expect.any(String));
    expect(compiled.deployment).toMatchObject({ status: 'covered', board: { width: 11_176, height: 7_620 } });
  });

  it('authorizes setup only because every mandatory M4 dependency is now covered', () => {
    const compiled = plan();

    expect(compiled.compatibility).toMatchObject({ isCompatible: true, failures: [] });
    expect(compiled.coverage.entries.every((entry) => entry.status === 'covered')).toBe(true);
    expect(compiled.compatibility.requirements).toEqual(expect.arrayContaining([
      { subjectType: 'rule', subjectId: 'adeptus-astartes.oath-of-moment' },
      { subjectType: 'rule', subjectId: 'weapon.pistol' },
      { subjectType: 'rule', subjectId: 'core.benefit-of-cover' },
      { subjectType: 'rule', subjectId: 'm4-sampled-cylinder-los-v1' },
      { subjectType: 'terrain', subjectId: 'm4-central-light-cover-layout-v1' },
      { subjectType: 'scenario', subjectId: 'real-roster-shooting-duel-v1' },
      { subjectType: 'unit', subjectId: 'book-space-marines:unit:18' },
      { subjectType: 'weapon', subjectId: 'm4-heavy-bolt-pistol-ct2-v1' },
      { subjectType: 'physical-profile', subjectId: 'm4-real-infantry-40mm-draft-v1' }
    ]));
    const actor = createM4RealRosterActor({ initialState: createInitialGameState('m4-plan', 0x57465247), runtime: compiled });
    actor.start();
    dispatchGameCommand(actor, { id: 'm4-setup', actorId: 'salamanders', type: 'setup-session', session: compiled.session });
    expect(actor.getSnapshot().context.lastRejection).toBeNull();
    expect(getSimulatorGameState(actor).manifest?.scenarioId).toBe('real-roster-shooting-duel-v1');
    actor.stop();
  });

  it('binds the M4 movement resolver in the normal actor factory', () => {
    const compiled = plan();
    const mover = compiled.session.models.find((model) => model.playerId === 'salamanders');
    if (!mover) throw new Error('Figurine Salamanders requise.');
    const actor = createM4RealRosterActor({ initialState: createInitialGameState('m4-factory-movement', 9), runtime: compiled });
    actor.start();
    dispatchGameCommand(actor, { id: 'setup', actorId: 'salamanders', type: 'setup-session', session: compiled.session });
    dispatchGameCommand(actor, { id: 'command', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'command' });
    dispatchGameCommand(actor, { id: 'movement', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'movement' });
    dispatchGameCommand(actor, {
      id: 'too-far', actorId: 'salamanders', type: 'move-model', modelId: mover.id,
      to: { x: mover.position.x - 1_525, y: mover.position.y }
    });
    expect(actor.getSnapshot().context.lastRejection).toMatchObject({
      code: 'movement-too-far',
      sourceRuleIds: ['weapon.pistol', 'simulator.m4.real-roster-movement']
    });
    expect(getSimulatorGameState(actor).eventLog.map((event) => event.commandId)).not.toContain('too-far');
    actor.stop();
  });

  it('derives sourced Oath modifiers and sampled-cylinder LoS in the trusted M4 environment', () => {
    const compiled = plan();
    const salamanders = compiled.session.units?.find((unit) => unit.playerId === 'salamanders');
    const bloodAngels = compiled.session.units?.find((unit) => unit.playerId === 'blood-angels');
    if (!salamanders || !bloodAngels) throw new Error('Pilotes M4 requis.');
    const session = {
      ...compiled.session,
      models: compiled.session.models.map((model) => model.playerId === 'blood-angels'
        ? { ...model, position: { x: 4_500, y: model.position.y } }
        : model)
    };
    const initial = createInitialGameState('m4-oath-sampled', 0x57465247);
    const setup = executeGameCommand(initial, { id: 'setup', actorId: 'salamanders', type: 'setup-session', session });
    if (!setup.accepted) throw new Error(setup.rejection.message);
    const command = executeGameCommand(setup.state, { id: 'command', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'command' });
    if (!command.accepted) throw new Error(command.rejection.message);
    const oath = executeOathOfMomentSelectionCommand(command.state, {
      id: 'oath', actorId: 'salamanders', type: 'select-oath-of-moment-target', targetUnitId: bloodAngels.id
    }, compiled.environment);
    expect(oath.accepted).toBe(true);
    if (!oath.accepted) return;
    const movement = executeGameCommand(oath.state, { id: 'movement', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'movement' });
    if (!movement.accepted) throw new Error(movement.rejection.message);
    const shooting = executeGameCommand(movement.state, { id: 'shooting', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'shooting' });
    if (!shooting.accepted) throw new Error(shooting.rejection.message);
    const result = executeBasicShootingCommand(shooting.state, {
      id: 'shoot', actorId: 'salamanders', type: 'resolve-basic-shooting', attackerUnitId: salamanders.id,
      targetUnitId: bloodAngels.id, weaponProfileId: salamanders.weaponProfiles[0].id
    }, compiled.environment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    expect(result.events[0].evidence.attackModifiers).toMatchObject({ rerollFailedHits: true, woundRollModifier: 1, sourceRuleIds: ['adeptus-astartes.oath-of-moment'] });
    expect(result.events[0].evidence.lineOfSight).toMatchObject({ visible: true, reason: 'clear', ray: { from: { z: 0 }, to: { z: 0 } } });
    expect(result.events[0].result).toEqual({
      hitRequired: 3,
      woundRequired: 3,
      saveRequired: 4,
      hits: 4,
      wounds: 1,
      failedSaves: 1,
      damageInflicted: 1,
      modelsDestroyed: 0,
      remainingModels: 5,
      remainingWoundsOnDamagedModel: 1
    });
    expect(result.events[0].prngAfter).toEqual({ algorithm: 'mulberry32', version: 1, seed: 0x57465247, value: 1_968_179_651, draws: 12 });
    expect(result.events[0].rolls.filter((roll) => roll.initialHitRoll !== undefined)).toHaveLength(2);
    expect(replayGameEventsWithShootingEnvironment(initial, result.state.eventLog, compiled.environment)).toEqual(result.state);
    const repeated = executeBasicShootingCommand(result.state, {
      id: 'shoot-twice', actorId: 'salamanders', type: 'resolve-basic-shooting', attackerUnitId: salamanders.id,
      targetUnitId: bloodAngels.id, weaponProfileId: salamanders.weaponProfiles[0].id
    }, compiled.environment);
    expect(repeated).toMatchObject({ accepted: false, rejection: { code: 'unit-already-selected-to-shoot' }, state: result.state });
    const exported = exportSimulation(initial, result.state, '2026-08-21T14:00:00.000Z', compiled.environment);
    expect(JSON.parse(exported)).toMatchObject({ schemaVersion: 'warforge-simulation-save/v2', environment: { scenarioId: 'real-roster-shooting-duel-v1' } });
    expect(importSimulation(exported, compiled.environment, sessionCompatibilityFingerprint(session))).toMatchObject({ ok: true, state: result.state });
  });

  it('applies the Blood Angels Oath variant without a wound-roll bonus', () => {
    const compiled = plan();
    const bloodAngels = compiled.session.units?.find((unit) => unit.playerId === 'blood-angels');
    const salamanders = compiled.session.units?.find((unit) => unit.playerId === 'salamanders');
    if (!bloodAngels || !salamanders) throw new Error('Pilotes M4 requis.');
    const session = {
      ...compiled.session,
      models: compiled.session.models.map((model) => model.playerId === 'salamanders'
        ? { ...model, position: { x: 7_000, y: model.position.y } }
        : model)
    };
    const initial = createInitialGameState('m4-blood-angels-oath', 13);
    const setup = executeGameCommand(initial, { id: 'setup', actorId: 'blood-angels', type: 'setup-session', session });
    if (!setup.accepted) throw new Error(setup.rejection.message);
    const command = executeGameCommand(setup.state, { id: 'command', actorId: 'blood-angels', type: 'transition-phase', nextPhase: 'command' });
    if (!command.accepted) throw new Error(command.rejection.message);
    const oath = executeOathOfMomentSelectionCommand(command.state, {
      id: 'oath', actorId: 'blood-angels', type: 'select-oath-of-moment-target', targetUnitId: salamanders.id
    }, compiled.environment);
    if (!oath.accepted) throw new Error(oath.rejection.message);
    const movement = executeGameCommand(oath.state, { id: 'movement', actorId: 'blood-angels', type: 'transition-phase', nextPhase: 'movement' });
    if (!movement.accepted) throw new Error(movement.rejection.message);
    const shooting = executeGameCommand(movement.state, { id: 'shooting', actorId: 'blood-angels', type: 'transition-phase', nextPhase: 'shooting' });
    if (!shooting.accepted) throw new Error(shooting.rejection.message);
    const result = executeBasicShootingCommand(shooting.state, {
      id: 'shoot', actorId: 'blood-angels', type: 'resolve-basic-shooting', attackerUnitId: bloodAngels.id,
      targetUnitId: salamanders.id, weaponProfileId: bloodAngels.weaponProfiles[0].id
    }, compiled.environment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    expect(result.events[0].evidence.attackModifiers).toMatchObject({
      rerollFailedHits: true,
      woundRollModifier: 0,
      sourceRuleIds: ['adeptus-astartes.oath-of-moment'],
      sourceRefs: [{ sourceId: 'warforge-catalog-blood-angels-1.2.13.0' }]
    });
    expect(replayGameEventsWithShootingEnvironment(initial, result.state.eventLog, compiled.environment)).toEqual(result.state);
  });

  it('persists and restores an accepted M4 move from the bound actor factory', () => {
    const compiled = plan();
    const mover = compiled.session.models.find((model) => model.playerId === 'salamanders');
    if (!mover) throw new Error('Figurine Salamanders requise.');
    const initial = createInitialGameState('m4-persisted-movement', 10);
    const actor = createM4RealRosterActor({ initialState: initial, runtime: compiled });
    actor.start();
    dispatchGameCommand(actor, { id: 'setup', actorId: 'salamanders', type: 'setup-session', session: compiled.session });
    dispatchGameCommand(actor, { id: 'command', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'command' });
    dispatchGameCommand(actor, { id: 'movement', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'movement' });
    dispatchGameCommand(actor, {
      id: 'legal-move', actorId: 'salamanders', type: 'move-model', modelId: mover.id,
      to: { x: mover.position.x - 500, y: mover.position.y }
    });
    const moved = getSimulatorGameState(actor);
    expect(moved.eventLog.map((event) => event.commandId)).toContain('legal-move');
    const exported = exportSimulation(initial, moved, '2026-08-21T15:00:00.000Z', compiled.environment);
    expect(importSimulation(exported, compiled.environment, sessionCompatibilityFingerprint(compiled.session))).toMatchObject({ ok: true, state: moved });
    actor.stop();
  });

  it('enforces the normal-move, board and [PISTOL] Engagement Range guard before emitting an event', () => {
    const compiled = plan();
    const movingModel = compiled.session.models.find((model) => model.playerId === 'salamanders');
    const opposingModel = compiled.session.models.find((model) => model.playerId === 'blood-angels');
    if (!movingModel || !opposingModel) throw new Error('Modèles M4 requis.');
    const session = {
      ...compiled.session,
      models: compiled.session.models.map((model, index) => model.id === opposingModel.id
        ? { ...model, position: { x: 2_800, y: movingModel.position.y } }
        : model.id === movingModel.id
          ? model
          : { ...model, position: { x: model.position.x, y: 5_000 + index * 100 } })
    };
    const setup = executeGameCommand(createInitialGameState('m4-movement', 5), { id: 'setup', actorId: 'salamanders', type: 'setup-session', session });
    if (!setup.accepted) throw new Error(setup.rejection.message);
    const command = executeGameCommand(setup.state, { id: 'command', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'command' });
    if (!command.accepted) throw new Error(command.rejection.message);
    const movement = executeGameCommand(command.state, { id: 'movement', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'movement' });
    if (!movement.accepted) throw new Error(movement.rejection.message);
    const legal = executeM4RealRosterMove(movement.state, {
      id: 'legal', actorId: 'salamanders', type: 'move-model', modelId: movingModel.id,
      to: { x: movingModel.position.x - 500, y: movingModel.position.y }
    }, compiled);
    expect(legal.accepted).toBe(true);
    const engagement = executeM4RealRosterMove(movement.state, {
      id: 'engagement', actorId: 'salamanders', type: 'move-model', modelId: movingModel.id,
      to: { x: 2_250, y: movingModel.position.y }
    }, compiled);
    expect(engagement).toMatchObject({ accepted: false, rejection: { code: 'movement-enters-engagement-range' }, state: movement.state });
    expect(engagement.state.eventLog).toEqual(movement.state.eventLog);
  });

  it('derives M4 cover from authoritative terrain, independently from the sampled LoS witness', () => {
    const compiled = plan();
    const salamanders = compiled.session.units?.find((unit) => unit.playerId === 'salamanders');
    const bloodAngels = compiled.session.units?.find((unit) => unit.playerId === 'blood-angels');
    if (!salamanders || !bloodAngels) throw new Error('Pilotes M4 requis.');
    const session = {
      ...compiled.session,
      models: compiled.session.models.map((model) => model.playerId === 'blood-angels'
        ? { ...model, position: { x: 5_500, y: 3_000 + model.position.y % 200 } }
        : model)
    };
    const initial = createInitialGameState('m4-covered-shot', 8);
    const setup = executeGameCommand(initial, { id: 'setup', actorId: 'salamanders', type: 'setup-session', session });
    if (!setup.accepted) throw new Error(setup.rejection.message);
    const command = executeGameCommand(setup.state, { id: 'command', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'command' });
    if (!command.accepted) throw new Error(command.rejection.message);
    const oath = executeOathOfMomentSelectionCommand(command.state, { id: 'oath', actorId: 'salamanders', type: 'select-oath-of-moment-target', targetUnitId: bloodAngels.id }, compiled.environment);
    if (!oath.accepted) throw new Error(oath.rejection.message);
    const movement = executeGameCommand(oath.state, { id: 'movement', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'movement' });
    if (!movement.accepted) throw new Error(movement.rejection.message);
    const shooting = executeGameCommand(movement.state, { id: 'shooting', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'shooting' });
    if (!shooting.accepted) throw new Error(shooting.rejection.message);
    const result = executeBasicShootingCommand(shooting.state, {
      id: 'covered-shot', actorId: 'salamanders', type: 'resolve-basic-shooting', attackerUnitId: salamanders.id,
      targetUnitId: bloodAngels.id, weaponProfileId: salamanders.weaponProfiles[0].id
    }, compiled.environment);
    expect(result.accepted).toBe(true);
    if (!result.accepted || result.events[0].type !== 'basic-shooting-resolved') return;
    expect(result.events[0].evidence.lineOfSight).toMatchObject({ visible: true, blockerIds: [] });
    expect(result.events[0].evidence.cover).toEqual({
      applies: true,
      ballisticSkillPenalty: 1,
      sourceRuleIds: ['core.benefit-of-cover'],
      terrainZoneIds: ['m4-central-light-cover-zone-v1'],
      sourceRefs: [CORE_BENEFIT_OF_COVER_SOURCE]
    });
    expect(result.events[0].result.hitRequired).toBe(4);
    expect(replayGameEventsWithShootingEnvironment(initial, result.state.eventLog, compiled.environment)).toEqual(result.state);
  });

  it('routes M4 movement through the actor’s authoritative resolver', () => {
    const compiled = plan();
    const mover = compiled.session.models.find((model) => model.playerId === 'salamanders');
    const opponent = compiled.session.models.find((model) => model.playerId === 'blood-angels');
    if (!mover || !opponent) throw new Error('Modèles M4 requis.');
    const session = {
      ...compiled.session,
      models: compiled.session.models.map((model, index) => model.id === opponent.id
        ? { ...model, position: { x: 2_800, y: mover.position.y } }
        : model.id === mover.id
          ? model
          : { ...model, position: { x: model.position.x, y: 5_000 + index * 100 } })
    };
    const coverage: CoverageReportV1 = {
      schemaVersion: 'warforge-simulator/v1',
      version: session.manifest.coverageVersion,
      entries: sessionCoverageRequirements(session).map((requirement) => ({ ...requirement, status: 'covered' as const }))
    };
    const actor = createSimulatorActor({
      initialState: createInitialGameState('m4-machine-movement', 6),
      compatibility: createSessionCompatibilityReport(session, coverage),
      shootingEnvironment: compiled.environment,
      movementCommandResolver: { execute: (state, command) => executeM4RealRosterMove(state, command, compiled) }
    });
    actor.start();
    dispatchGameCommand(actor, { id: 'setup', actorId: 'salamanders', type: 'setup-session', session });
    dispatchGameCommand(actor, { id: 'command', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'command' });
    dispatchGameCommand(actor, { id: 'movement', actorId: 'salamanders', type: 'transition-phase', nextPhase: 'movement' });
    dispatchGameCommand(actor, { id: 'engagement', actorId: 'salamanders', type: 'move-model', modelId: mover.id, to: { x: 2_250, y: mover.position.y } });
    expect(actor.getSnapshot().context.lastRejection?.code).toBe('movement-enters-engagement-range');
    expect(getSimulatorGameState(actor).eventLog.map((event) => event.commandId)).not.toContain('engagement');
    actor.stop();
  });

  it('keeps source-only facts free of direct coverage claims and requires both approved rosters', () => {
    const promotedFacts = structuredClone(M4_REAL_ROSTER_SESSION_DOCUMENTS.facts) as { coverageClaim: string };
    promotedFacts.coverageClaim = 'covered';
    expect(() => assembleM4RealRosterSession({ ...M4_REAL_ROSTER_SESSION_DOCUMENTS, facts: promotedFacts })).toThrow(/ne doivent pas revendiquer de couverture/i);

    const missingRoster = structuredClone(M4_REAL_ROSTER_SESSION_DOCUMENTS.proposal) as { rosters: unknown[] };
    missingRoster.rosters.pop();
    expect(() => assembleM4RealRosterSession({ ...M4_REAL_ROSTER_SESSION_DOCUMENTS, proposal: missingRoster })).toThrow(/Deux rosters M4 exacts/i);
  });

  it('rejects an invalid real-unit coverage discriminator before any setup event is produced', () => {
    const compiled = plan();
    const invalidSession = {
      ...compiled.session,
      units: compiled.session.units?.map((unit, index) => index === 0
        ? { ...unit, coverageSubject: { subjectType: 'scenario', subjectId: 'forged' } }
        : unit)
    };
    const result = executeGameCommand(createInitialGameState('invalid-m4-coverage-subject', 7), {
      id: 'invalid-m4-setup', actorId: 'salamanders', type: 'setup-session', session: invalidSession as typeof compiled.session
    });
    expect(result).toMatchObject({ accepted: false, rejection: { code: 'invalid-unit-coverage-subject' } });
  });

  it('rejects a malformed coverage subject as a normal command rejection', () => {
    const compiled = plan();
    const invalidSession = {
      ...compiled.session,
      units: compiled.session.units?.map((unit, index) => index === 0
        ? { ...unit, coverageSubject: { subjectType: 'unit', subjectId: 42 } }
        : unit)
    };

    const result = executeGameCommand(createInitialGameState('invalid-m4-coverage-subject-type', 8), {
      id: 'invalid-m4-setup-type', actorId: 'salamanders', type: 'setup-session', session: invalidSession as typeof compiled.session
    });

    expect(result).toMatchObject({ accepted: false, rejection: { code: 'invalid-unit-coverage-subject' } });
  });
});
