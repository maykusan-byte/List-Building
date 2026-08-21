import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createInitialGameState,
  sessionCompatibilityFingerprint,
  type GameCommand,
  type GameEvent,
  type GameState,
  type UnitState
} from '../domain';
import { dispatchGameCommand, getSimulatorGameState, type SimulatorActor } from '../orchestration';
import { exportSimulation, importSimulation, IndexedDbSimulationStorageAdapter, SimulationAutosaveController } from '../persistence';
import { assembleM4RealRosterSession, createM4RealRosterActor, type M4RealRosterSessionPlan } from '../runtime';

const gameId = 'm4-real-roster-shooting-duel-v1';
const seed = 0x57465247;
const movementStep = 6 * 254;
const storage = new IndexedDbSimulationStorageAdapter();

function command(id: string, actorId: string, type: GameCommand['type'], extra: Record<string, unknown> = {}): GameCommand {
  return { id, actorId, type, ...extra } as GameCommand;
}

function displayUnit(unit: UnitState): string {
  const side = unit.playerId === 'salamanders' ? 'Salamanders' : 'Blood Angels';
  const weapon = unit.weaponProfiles[0]?.displayName ?? 'arme non couverte';
  return `${side} · ${weapon}`;
}

function currentShooting(state: GameState | null): Extract<GameEvent, { readonly type: 'basic-shooting-resolved' }> | null {
  if (!state) return null;
  return state.eventLog.filter((event): event is Extract<GameEvent, { readonly type: 'basic-shooting-resolved' }> => event.type === 'basic-shooting-resolved').at(-1) ?? null;
}

function unitForModel(state: GameState, modelId: string): UnitState | undefined {
  return Object.values(state.units).find((unit) => unit.models.some((model) => model.id === modelId));
}

function frontModel(state: GameState, unit: UnitState): string | null {
  const direction = unit.playerId === 'salamanders' ? 1 : -1;
  return unit.models
    .filter((model) => model.active)
    .map((model) => state.models[model.id])
    .filter((model): model is NonNullable<typeof model> => Boolean(model))
    .sort((left, right) => direction * (right.position.x - left.position.x) || left.id.localeCompare(right.id))[0]?.id ?? null;
}

function createStartedActor(runtime: M4RealRosterSessionPlan): { readonly actor: SimulatorActor; readonly initial: GameState; readonly state: GameState } {
  const initial = createInitialGameState(gameId, seed);
  const actor = createM4RealRosterActor({ initialState: initial, runtime });
  actor.start();
  for (const next of [
    command('m4-setup', 'salamanders', 'setup-session', { session: runtime.session }),
    command('m4-command', 'salamanders', 'transition-phase', { nextPhase: 'command' })
  ]) {
    dispatchGameCommand(actor, next);
    const rejection = actor.getSnapshot().context.lastRejection;
    if (rejection) {
      actor.stop();
      throw new Error(`Duel M4 refusé : ${rejection.message}`);
    }
  }
  return { actor, initial, state: getSimulatorGameState(actor) };
}

/** UI adapter for the closed M4 pilot. It never calculates game facts itself. */
export default function M4RealRosterDuelPage(): React.JSX.Element {
  const actorRef = useRef<SimulatorActor | null>(null);
  const [runtime, setRuntime] = useState<M4RealRosterSessionPlan | null>(null);
  const [initial, setInitial] = useState<GameState | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [attackerUnitId, setAttackerUnitId] = useState<string | null>(null);
  const [targetUnitId, setTargetUnitId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [notice, setNotice] = useState('Chargement du pilote réel Salamanders–Blood Angels…');
  const [exportBuffer, setExportBuffer] = useState('');

  const saveFingerprint = useMemo(() => runtime ? sessionCompatibilityFingerprint(runtime.session) : undefined, [runtime]);

  const persist = useCallback(async (next: GameState, currentRuntime: M4RealRosterSessionPlan, eventFree: GameState) => {
    const now = new Date().toISOString();
    const serialized = exportSimulation(eventFree, next, now, currentRuntime.environment);
    await new SimulationAutosaveController(storage, () => now, currentRuntime.environment, sessionCompatibilityFingerprint(currentRuntime.session)).autosave(eventFree, next);
    setExportBuffer(serialized);
  }, []);

  const selectAttacker = useCallback((nextState: GameState, unitId: string): void => {
    const unit = nextState.units[unitId];
    if (!unit) return;
    setAttackerUnitId(unitId);
    setSelectedModelId(frontModel(nextState, unit));
    const target = Object.values(nextState.units)
      .filter((candidate) => candidate.playerId !== unit.playerId)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (target) setTargetUnitId(target.id);
  }, []);

  const install = useCallback((loaded: M4RealRosterSessionPlan, restored?: { readonly initial: GameState; readonly state: GameState }) => {
    actorRef.current?.stop();
    const started = restored
      ? { actor: createM4RealRosterActor({ initialState: restored.initial, gameState: restored.state, runtime: loaded }), initial: restored.initial, state: restored.state }
      : createStartedActor(loaded);
    if (restored) started.actor.start();
    actorRef.current = started.actor;
    setRuntime(loaded);
    setInitial(started.initial);
    setState(started.state);
    const forwardSalamander = Object.values(started.state.models)
      .filter((model) => model.playerId === 'salamanders' && model.active)
      .sort((left, right) => right.position.x - left.position.x || left.id.localeCompare(right.id))[0];
    const salamanders = forwardSalamander ? unitForModel(started.state, forwardSalamander.id) : undefined;
    const bloodAngels = Object.values(started.state.units).find((unit) => unit.playerId === 'blood-angels');
    if (salamanders && forwardSalamander) {
      setAttackerUnitId(salamanders.id);
      setSelectedModelId(forwardSalamander.id);
    }
    if (bloodAngels) setTargetUnitId(bloodAngels.id);
  }, [selectAttacker]);

  const start = useCallback((loaded: M4RealRosterSessionPlan) => {
    install(loaded);
    setNotice('Session réelle compatible chargée. Désignez Oath of Moment, puis passez au mouvement.');
  }, [install]);

  useEffect(() => {
    try { start(assembleM4RealRosterSession()); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Chargement M4 impossible.'); }
    return () => actorRef.current?.stop();
  }, [start]);

  const apply = useCallback((next: GameCommand, acceptedNotice = 'Action acceptée et journalisée.'): boolean => {
    const actor = actorRef.current;
    if (!actor || !runtime || !initial) return false;
    dispatchGameCommand(actor, next);
    const rejection = actor.getSnapshot().context.lastRejection;
    if (rejection) {
      setNotice(`Refus explicite : ${rejection.code} — ${rejection.message}`);
      return false;
    }
    const nextState = getSimulatorGameState(actor);
    setState(nextState);
    setNotice(acceptedNotice);
    void persist(nextState, runtime, initial).catch(() => setNotice('Action acceptée ; autosauvegarde IndexedDB indisponible.'));
    return true;
  }, [initial, persist, runtime]);

  const currentAttacker = state && attackerUnitId ? state.units[attackerUnitId] : undefined;
  const selectedModel = state && selectedModelId ? state.models[selectedModelId] : undefined;
  const shooting = currentShooting(state);

  const setOath = (): void => {
    if (!state || !currentAttacker || !targetUnitId) return;
    apply(command(`m4-oath-${state.eventLog.length}`, currentAttacker.playerId, 'select-oath-of-moment-target', { targetUnitId }), 'Oath of Moment est journalisé pour ce round.');
  };
  const enterMovement = (): void => {
    if (!state || !currentAttacker) return;
    apply(command(`m4-movement-${state.eventLog.length}`, currentAttacker.playerId, 'transition-phase', { nextPhase: 'movement' }), 'Phase de mouvement : choisissez une figurine et une distance légale.');
  };
  const move = (distance: number): void => {
    if (!state || !selectedModel || !currentAttacker) return;
    const direction = selectedModel.playerId === 'salamanders' ? 1 : -1;
    apply(command(`m4-move-${state.eventLog.length}`, currentAttacker.playerId, 'move-model', {
      modelId: selectedModel.id,
      to: { x: selectedModel.position.x + direction * distance, y: selectedModel.position.y },
      orientationDegrees: selectedModel.orientationDegrees
    }), distance > movementStep ? 'Tentative de déplacement hors limite.' : 'Mouvement normal M4 accepté.');
  };
  const enterShooting = (): void => {
    if (!state || !currentAttacker) return;
    apply(command(`m4-shooting-${state.eventLog.length}`, currentAttacker.playerId, 'transition-phase', { nextPhase: 'shooting' }), 'Phase de tir : sélectionnez l’attaquant et la cible.');
  };
  const resolve = (): void => {
    if (!state || !currentAttacker || !targetUnitId) return;
    const weapon = currentAttacker.weaponProfiles[0];
    if (!weapon) { setNotice('Refus explicite : cette unité ne possède pas de profil d’arme couvert.'); return; }
    apply(command(`m4-shoot-${state.eventLog.length}`, currentAttacker.playerId, 'resolve-basic-shooting', {
      attackerUnitId: currentAttacker.id, targetUnitId, weaponProfileId: weapon.id
    }), 'Tir M4 résolu depuis les données autoritaires de portée, LoS et couvert.');
  };
  const nextRound = (): void => {
    if (!state || !currentAttacker || state.phase !== 'shooting') return;
    for (const nextPhase of ['charge', 'fight', 'command'] as const) {
      if (!apply(command(`m4-phase-${nextPhase}-${actorRef.current?.getSnapshot().context.gameState.eventLog.length ?? 0}`, currentAttacker.playerId, 'transition-phase', { nextPhase }))) return;
    }
    setNotice('Nouveau round : les phases Charge et Combat, hors périmètre M4, ont été passées explicitement. Désignez Oath of Moment avant le mouvement.');
  };
  const save = (): void => { if (runtime && state && initial) void persist(state, runtime, initial).then(() => setNotice('Sauvegarde V2 exportée et autosauvegardée dans IndexedDB.')); };
  const resume = async (): Promise<void> => {
    if (!runtime || !saveFingerprint) return;
    const restored = await new SimulationAutosaveController(storage, () => new Date().toISOString(), runtime.environment, saveFingerprint).restore(gameId);
    if (!restored) { setNotice('Aucune autosauvegarde IndexedDB M4.'); return; }
    if (!restored.ok) { setNotice(`Refus explicite : ${restored.errors.join(' ')}`); return; }
    install(runtime, { initial: restored.autosave.save.initialState, state: restored.state });
    setExportBuffer(JSON.stringify(restored.autosave.save));
    setNotice(`Reprise IndexedDB exacte ${restored.autosave.save.schemaVersion}.`);
  };
  const importExport = (): void => {
    if (!runtime || !exportBuffer || !saveFingerprint) { setNotice('Aucun export V2 M4 à importer.'); return; }
    const restored = importSimulation(exportBuffer, runtime.environment, saveFingerprint);
    if (!restored.ok) { setNotice(`Refus explicite : ${restored.errors.join(' ')}`); return; }
    install(runtime, { initial: restored.save.initialState, state: restored.state });
    setNotice('Export V2 M4 importé avec replay vérifié.');
  };
  const replay = (): void => {
    if (!runtime || !initial || !state || !saveFingerprint) return;
    const restored = importSimulation(exportSimulation(initial, state, new Date().toISOString(), runtime.environment), runtime.environment, saveFingerprint);
    if (!restored.ok) { setNotice(`Refus explicite : ${restored.errors.join(' ')}`); return; }
    install(runtime, { initial: restored.save.initialState, state: restored.state });
    setNotice('Replay exact du journal M4 terminé.');
  };

  if (!runtime || !state) return <main className="simulator-duel-page" data-testid="m4-real-duel"><p role="status" data-testid="m4-notice">{notice}</p></main>;
  const units = Object.values(state.units).sort((left, right) => left.id.localeCompare(right.id));
  const models = Object.values(state.models).sort((left, right) => left.id.localeCompare(right.id));
  return <main className="simulator-duel-page m4-real-duel-page" data-testid="m4-real-duel">
    <header className="simulator-lab-hero"><div><span className="simulator-kicker">WARFORGE · M4 REAL-ROSTER PILOT</span><h1>Duel réel Salamanders – Blood Angels</h1><p>Deux RosterDraft figés, limités au mouvement normal et au tir couvert. Charge, Combat, objectifs et missions restent explicitement hors périmètre.</p></div><div className="simulator-foundation-notice"><strong data-testid="m4-compatibility">Session compatible · 14 figurines</strong><span>La LoS échantillonnée, le couvert et les limites de mouvement sont calculés par le runtime M4, jamais par cette interface.</span></div></header>
    <section className="duel-toolbar" aria-label="Contrôles du duel réel"><button data-testid="m4-set-oath" onClick={setOath} disabled={state.phase !== 'command' || !currentAttacker || !targetUnitId}>Désigner Oath of Moment</button><button data-testid="m4-enter-movement" onClick={enterMovement} disabled={state.phase !== 'command' || !currentAttacker}>Passer au mouvement</button><button data-testid="m4-advance" onClick={() => move(movementStep)} disabled={state.phase !== 'movement' || !selectedModel}>Avancer de 6″ vers l’adversaire</button><button data-testid="m4-illegal-move" onClick={() => move(movementStep + 1)} disabled={state.phase !== 'movement' || !selectedModel}>Tester mouvement illégal (&gt;6″)</button><button data-testid="m4-enter-shooting" onClick={enterShooting} disabled={state.phase !== 'movement' || !currentAttacker}>Passer au tir</button><button data-testid="m4-resolve-shooting" onClick={resolve} disabled={state.phase !== 'shooting' || !currentAttacker || !targetUnitId}>Résoudre le tir</button><button data-testid="m4-next-round" onClick={nextRound} disabled={state.phase !== 'shooting' || !currentAttacker}>Passer les phases hors périmètre</button><button onClick={save}>Sauvegarder / exporter V2</button><button onClick={importExport}>Importer l’export V2</button><button onClick={() => void resume()}>Reprendre IndexedDB</button><button onClick={replay}>Rejouer le journal</button><button onClick={() => start(runtime)}>Réinitialiser</button></section>
    <p className="duel-notice" role="status" data-testid="m4-notice">{notice}</p>
    <section className="m4-status-grid" aria-label="État de la partie réelle"><div><span>Phase</span><strong data-testid="m4-phase">{state.phase}</strong></div><div><span>Round</span><strong>{state.round}</strong></div><div><span>PRNG</span><strong data-testid="m4-prng">{state.prng.seed}/{state.prng.draws}</strong></div><div><span>Journal</span><strong data-testid="m4-event-count">{state.eventLog.length}</strong></div></section>
    <section className="duel-board m4-board" aria-label="Rosters et plateau réels" data-testid="m4-placement">{['salamanders', 'blood-angels'].map((playerId) => <div key={playerId} className={`duel-unit ${playerId === 'salamanders' ? 'red' : 'blue'}`}><h2>{playerId === 'salamanders' ? 'Salamanders' : 'Blood Angels'}</h2>{units.filter((unit) => unit.playerId === playerId).map((unit) => <button key={unit.id} type="button" className={unit.id === attackerUnitId ? 'm4-unit-selector active' : 'm4-unit-selector'} onClick={() => selectAttacker(state, unit.id)} data-testid={`m4-attacker-${unit.id}`}><strong>{displayUnit(unit)}</strong><span>{unit.models.filter((model) => model.active).length}/{unit.models.length} figurines · sélectionner comme attaquant</span></button>)}{models.filter((model) => model.playerId === playerId).map((model) => <button key={model.id} type="button" onClick={() => { const unit = unitForModel(state, model.id); if (unit) { setAttackerUnitId(unit.id); setSelectedModelId(model.id); const target = units.find((candidate) => candidate.playerId !== unit.playerId); if (target) setTargetUnitId(target.id); } }} className={`m4-model ${model.id === selectedModelId ? 'active' : ''} ${!model.active ? 'lost' : ''}`} data-testid={`m4-model-${model.id}`}>{model.id.split(':').at(-1)} · ({model.position.x}, {model.position.y}){!model.active ? ' — perte' : ''}</button>)}</div>)}<div className="duel-terrain"><strong>Terrain approuvé M4</strong><span>Plateau 44″ × 30″ · zone centrale de couvert léger : elle peut dégrader la CT de 1, mais ne bloque jamais la LoS.</span></div></section>
    <section className="m4-targets" aria-label="Sélection de la cible"><h2>Cible de tir</h2>{units.filter((unit) => !currentAttacker || unit.playerId !== currentAttacker.playerId).map((unit) => <button key={unit.id} type="button" className={unit.id === targetUnitId ? 'active' : ''} onClick={() => setTargetUnitId(unit.id)} data-testid={`m4-target-${unit.id}`}>{displayUnit(unit)}</button>)}</section>
    <section className="duel-resolution" data-testid="m4-resolution"><h2>Résolution autoritaire</h2>{shooting ? <><p>Portée et LoS : <strong>{shooting.evidence.lineOfSight.visible ? 'valides' : 'refusées'}</strong> · couvert : <strong data-testid="m4-cover">{shooting.evidence.cover.applies ? `CT +${shooting.evidence.cover.ballisticSkillPenalty}` : 'aucun'}</strong> · touches {shooting.result.hits} · blessures {shooting.result.wounds} · sauvegardes ratées {shooting.result.failedSaves}.</p><p>Pertes : <strong data-testid="m4-losses">{shooting.casualtyModelIds.join(', ') || 'aucune'}</strong></p><ol>{shooting.rolls.map((roll) => <li key={roll.attackIndex}>#{roll.attackIndex + 1} : touche {roll.hitRoll ?? '—'} → blessure {roll.woundRoll ?? '—'} → sauvegarde {roll.saveRoll ?? '—'} → {roll.outcome}{roll.destroyedModelId ? ` (${roll.destroyedModelId})` : ''}</li>)}</ol></> : <p>Aucun tir encore résolu. Tout rejet de portée, de LoS ou de phase est expliqué ci-dessus et ne consomme pas le PRNG.</p>}</section>
    <details open><summary>Export / import JSON V2</summary><textarea data-testid="m4-export-json" value={exportBuffer} onChange={(event) => setExportBuffer(event.target.value)} aria-label="Export JSON V2 M4" /></details>
  </main>;
}
