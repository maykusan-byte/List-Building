import { describe, expect, it } from 'vitest';
import {
  executeGameCommand,
  sessionCompatibilityFingerprint
} from '../domain';
import { validateSimulationSave } from '../domain/serialization';
import {
  createCompleteGameDeploymentFixture,
  deployAllCompleteGameUnits,
  resolveCompleteGameCommandPhaseForTests
} from '../testing/complete-game-deployment-fixture';
import { executeCompleteGameMovementCommand } from '../orchestration/battle-movement';
import { executePassFightWindowCommand } from '../orchestration/battle-fight';
import { executeObjectiveAwareAdvanceBattlePhaseCommand } from '../orchestration/objective-control';
import { executeBasicShootingCommand } from '../orchestration/shooting';
import { createAutosaveFromImport, createSimulationAutosave, exportSimulation, importSimulation, validateSimulationAutosave } from './autosave';

function fixture() {
  const base = createCompleteGameDeploymentFixture('persisted-complete-game');
  const deployment = deployAllCompleteGameUnits(base.state, base.environment, 'persisted-deploy');
  const firstPlayer = executeGameCommand(deployment.state, {
    id: 'persisted-first-player',
    actorId: deployment.state.battle!.defenderPlayerId,
    type: 'determine-first-player'
  });
  if (!firstPlayer.accepted) throw new Error(firstPlayer.rejection.message);
  const started = executeGameCommand(firstPlayer.state, {
    id: 'persisted-start',
    actorId: firstPlayer.state.battle!.firstPlayerId!,
    type: 'start-battle'
  });
  if (!started.accepted) throw new Error(started.rejection.message);
  const commandPhase = resolveCompleteGameCommandPhaseForTests(started.state, 'persisted-command');
  const movementPhase = executeObjectiveAwareAdvanceBattlePhaseCommand(commandPhase.state, {
    id: 'persisted-to-movement',
    actorId: started.state.battle!.activePlayerId!,
    type: 'advance-battle-phase'
  }, base.environment);
  if (!movementPhase.accepted) throw new Error(movementPhase.rejection.message);
  const unitId = Object.keys(movementPhase.state.unitTurnStatuses).sort()[0]!;
  const moved = executeCompleteGameMovementCommand(movementPhase.state, {
    id: 'persisted-normal-move',
    actorId: movementPhase.state.battle!.activePlayerId!,
    type: 'move-unit',
    unitId,
    movementType: 'normal',
    paths: movementPhase.state.units[unitId]!.models.map((member) => ({
      modelId: member.id,
      waypoints: [{
        x: movementPhase.state.models[member.id]!.position.x + 254,
        y: movementPhase.state.models[member.id]!.position.y
      }]
    }))
  }, base.environment);
  if (!moved.accepted) throw new Error(moved.rejection.message);
  return { environment: base.environment, session: base.session, initial: base.initial, state: moved.state };
}

describe('complete-game V6 persistence', () => {
  it('exports, imports and autosaves V6 without downgrading its scope', () => {
    const { environment, session, initial, state } = fixture();
    const manifestFingerprint = sessionCompatibilityFingerprint(session);
    const exported = exportSimulation(initial, state, '2026-08-27T12:00:00.000Z', environment);
    expect(JSON.parse(exported).schemaVersion).toBe('warforge-simulation-save/v6');
    expect(validateSimulationSave(JSON.parse(exported))).toMatchObject({ ok: false, errors: [expect.stringContaining('vérificateur spatial')] });

    const imported = importSimulation(exported, environment, manifestFingerprint);
    expect(imported).toMatchObject({ ok: true, save: { schemaVersion: 'warforge-simulation-save/v6' }, state });
    expect(imported.ok && imported.state.unitTurnStatuses[Object.keys(state.unitTurnStatuses).sort()[0]!]!.movementType).toBe('normal');
    expect(importSimulation(exported)).toMatchObject({ ok: false, errors: ['Une sauvegarde V6 exige son environnement de partie complète pour être importée.'] });

    const autosave = createSimulationAutosave(initial, state, '2026-08-27T12:01:00.000Z', environment);
    expect(autosave.save.schemaVersion).toBe('warforge-simulation-save/v6');
    expect(validateSimulationAutosave(autosave, environment, manifestFingerprint)).toMatchObject({ ok: true, state });
    expect(validateSimulationAutosave(autosave)).toMatchObject({ ok: false, errors: ['Sauvegarde : une V6 exige son environnement de partie complète.'] });

    const fromImport = createAutosaveFromImport(exported, '2026-08-27T12:02:00.000Z', environment, manifestFingerprint);
    expect(fromImport).toMatchObject({ ok: true, autosave: { save: { schemaVersion: 'warforge-simulation-save/v6' } }, state });
  });

  it('refuses V6 under a different compiled manifest', () => {
    const { environment, initial, state } = fixture();
    const exported = exportSimulation(initial, state, '2026-08-27T12:00:00.000Z', environment);
    expect(importSimulation(exported, environment, 'another-manifest')).toMatchObject({ ok: false, errors: ['La sauvegarde ne correspond pas au manifeste de session fermée attendu.'] });
  });

  it('refuses an unknown decision producer in a trusted V6 replay', () => {
    const { environment, session, initial, state } = fixture();
    const forged = JSON.parse(exportSimulation(initial, state, '2026-08-27T12:03:00.000Z', environment)) as {
      events: Array<Record<string, unknown>>;
    };
    forged.events.push({
      id: 'forged-decision:0',
      commandId: 'forged-decision',
      type: 'decision-requested',
      decision: {
        id: 'invented-rule-choice',
        kind: 'invented-rule-choice',
        playerId: state.battle!.activePlayerId!,
        prompt: 'Invented rule',
        options: [{ id: 'accept', label: 'Accept' }],
        sourceRuleIds: ['invented.rule']
      }
    });
    const imported = importSimulation(JSON.stringify(forged), environment, sessionCompatibilityFingerprint(session));
    expect(imported.ok).toBe(false);
    if (imported.ok) return;
    expect(imported.errors.join('\n')).toContain('has no covered complete-game producer');
  });

  it('exports, imports and autosaves a legal Insane Bravery use with its durable resource state', () => {
    // Seed 17 resolves the first-player roll-off, then yields 5/5/1 for the
    // Captain's hit, wound and failed save: exactly one legal wound is lost.
    const base = createCompleteGameDeploymentFixture('persisted-insane-bravery', 17);
    const deployment = deployAllCompleteGameUnits(base.state, base.environment, 'persisted-insane-deploy');
    const first = executeGameCommand(deployment.state, {
      id: 'persisted-insane-first', actorId: deployment.state.battle!.defenderPlayerId, type: 'determine-first-player'
    });
    if (!first.accepted) throw new Error(first.rejection.message);
    const started = executeGameCommand(first.state, {
      id: 'persisted-insane-start', actorId: first.state.battle!.firstPlayerId!, type: 'start-battle'
    });
    if (!started.accepted) throw new Error(started.rejection.message);
    const command = resolveCompleteGameCommandPhaseForTests(started.state, 'persisted-insane-command-one');
    const movement = executeObjectiveAwareAdvanceBattlePhaseCommand(command.state, {
      id: 'persisted-insane-movement', actorId: command.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, base.environment);
    if (!movement.accepted) throw new Error(movement.rejection.message);
    let state = movement.state;
    const target = Object.values(state.units)
      .filter((unit) => unit.playerId !== state.battle!.activePlayerId && unit.models.length === 1)[0]!;
    const shooter = Object.values(state.units)
      .filter((unit) => unit.playerId === state.battle!.activePlayerId && unit.models.length === 1)[0]!;
    for (const unitId of Object.keys(state.unitTurnStatuses).sort()) {
      const unit = state.units[unitId]!;
      const stationary = executeCompleteGameMovementCommand(state, {
        id: `persisted-insane-move-${unitId}`, actorId: state.battle!.activePlayerId!, type: 'move-unit', unitId,
        movementType: 'remain-stationary',
        paths: unit.models.filter((model) => model.active).map((model) => ({
          modelId: model.id,
          waypoints: []
        }))
      }, base.environment);
      if (!stationary.accepted) throw new Error(stationary.rejection.message);
      state = stationary.state;
    }
    state = {
      ...state,
      firedWeaponKeys: [`${shooter.id}:stale-previous-turn-weapon`],
      shootingSelectedUnitIds: [shooter.id]
    };
    const shootingPhase = executeObjectiveAwareAdvanceBattlePhaseCommand(state, {
      id: 'persisted-insane-shooting', actorId: state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, base.environment);
    if (!shootingPhase.accepted) throw new Error(shootingPhase.rejection.message);
    expect(shootingPhase.state).toMatchObject({ firedWeaponKeys: [], shootingSelectedUnitIds: [] });
    const shot = executeBasicShootingCommand(shootingPhase.state, {
      id: 'persisted-insane-shot', actorId: shooter.playerId, type: 'resolve-basic-shooting',
      attackerUnitId: shooter.id, targetUnitId: target.id,
      weaponProfileId: shooter.weaponProfiles.find((weapon) => weapon.weaponType === 'ranged')!.id
    }, base.environment);
    if (!shot.accepted) throw new Error(`${shot.rejection.code}: ${shot.rejection.message}`);
    expect(shot.state.units[target.id]!.models).toEqual([expect.objectContaining({ active: true, wounds: 1 })]);
    expect(shot.state.shootingSelectedUnitIds).toEqual([shooter.id]);
    expect(shot.state.firedWeaponKeys).toEqual([`${shooter.id}:${shooter.weaponProfiles.find((weapon) => weapon.weaponType === 'ranged')!.id}`]);
    state = shot.state;
    const chargePhase = executeObjectiveAwareAdvanceBattlePhaseCommand(state, {
      id: 'persisted-insane-charge', actorId: state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, base.environment);
    if (!chargePhase.accepted) throw new Error(chargePhase.rejection.message);
    const fightPhase = executeObjectiveAwareAdvanceBattlePhaseCommand(chargePhase.state, {
      id: 'persisted-insane-fight', actorId: chargePhase.state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, base.environment);
    if (!fightPhase.accepted) throw new Error(fightPhase.rejection.message);
    state = fightPhase.state;
    let fightPassIndex = 0;
    while (state.fightPhase?.stage !== 'complete') {
      const passed = executePassFightWindowCommand(state, {
        id: `persisted-insane-fight-pass-${fightPassIndex++}`, actorId: state.fightPhase!.currentPlayerId!, type: 'pass-fight-window'
      }, base.environment);
      if (!passed.accepted) throw new Error(`${passed.rejection.code}: ${passed.rejection.message}`);
      state = passed.state;
    }
    state = {
      ...state,
      oathOfMomentSelections: {
        [shooter.playerId]: {
          ruleId: 'adeptus-astartes.oath-of-moment',
          playerId: shooter.playerId,
          targetUnitId: target.id,
          round: state.round,
          rerollFailedHits: true,
          woundRollModifier: 0,
          sourceRefs: shooter.sourceRefs
        }
      }
    };
    const secondTurn = executeObjectiveAwareAdvanceBattlePhaseCommand(state, {
      id: 'persisted-insane-second-turn', actorId: state.battle!.activePlayerId!, type: 'advance-battle-phase'
    }, base.environment);
    if (!secondTurn.accepted) throw new Error(secondTurn.rejection.message);
    state = secondTurn.state;
    expect(state.oathOfMomentSelections).toEqual({});
    for (let index = 0; index < 3; index += 1) {
      const stage = executeGameCommand(state, {
        id: `persisted-insane-command-two-${index}`, actorId: state.battle!.activePlayerId!, type: 'resolve-command-stage'
      });
      if (!stage.accepted) throw new Error(`${stage.rejection.code}: ${stage.rejection.message}`);
      state = stage.state;
    }
    expect(state.commandPhase).toMatchObject({ stage: 'battle-shock', pendingBattleShockUnitIds: [target.id] });
    const bravery = executeGameCommand(state, {
      id: 'persisted-insane-use', actorId: target.playerId, type: 'use-insane-bravery', unitId: target.id
    });
    if (!bravery.accepted) throw new Error(`${bravery.rejection.code}: ${bravery.rejection.message}`);
    expect(bravery.state).toMatchObject({
      commandPhase: { stage: 'abilities', pendingBattleShockUnitIds: [], testedBattleShockUnitIds: [target.id] },
      battleResources: { stratagemUses: [{ stratagemId: 'insane-bravery', targetUnitId: target.id }] }
    });

    const manifestFingerprint = sessionCompatibilityFingerprint(base.session);
    const exported = exportSimulation(base.initial, bravery.state, '2026-08-30T00:10:00.000Z', base.environment);
    expect(importSimulation(exported, base.environment, manifestFingerprint)).toMatchObject({ ok: true, state: bravery.state });
    const autosave = createSimulationAutosave(base.initial, bravery.state, '2026-08-30T00:11:00.000Z', base.environment);
    expect(validateSimulationAutosave(autosave, base.environment, manifestFingerprint)).toMatchObject({ ok: true, state: bravery.state });
  });
});
