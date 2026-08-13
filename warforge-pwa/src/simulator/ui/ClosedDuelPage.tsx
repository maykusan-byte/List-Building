import { useCallback, useEffect, useState } from 'react';
import { createInitialGameState, executeGameCommand, type GameCommand, type GameState } from '../domain';
import { createSimulatorActor, dispatchGameCommand, executeBasicShootingCommand, executeClosedDuelMove, getSimulatorGameState } from '../orchestration';
import { exportSimulation, importSimulation, IndexedDbSimulationStorageAdapter, SimulationAutosaveController } from '../persistence';
import { loadClosedDuelRuntime, type ClosedDuelRuntime } from '../runtime';

const gameId = 'closed-duel-training-v1';
const seed = 3;
const storage = new IndexedDbSimulationStorageAdapter();

function command(id: string, actorId: string, type: GameCommand['type'], extra: Record<string, unknown> = {}): GameCommand {
  return { id, actorId, type, ...extra } as GameCommand;
}

export default function ClosedDuelPage(): React.JSX.Element {
  const [runtime, setRuntime] = useState<ClosedDuelRuntime | null>(null);
  const [initial, setInitial] = useState<GameState | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState('Chargement des données de duel validées…');
  const [exportBuffer, setExportBuffer] = useState('');

  const start = useCallback((loaded: ClosedDuelRuntime) => {
    const eventFree = createInitialGameState(gameId, seed);
    if (!loaded.compatibility.isCompatible) throw new Error(`Duel refusé : ${loaded.compatibility.failures.map((failure) => failure.message).join(' ')}`);
    const actor = createSimulatorActor({ initialState: eventFree, compatibility: loaded.compatibility, shootingEnvironment: loaded.environment });
    actor.start();
    for (const nextCommand of [
      command('duel-setup', 'red', 'setup-session', { session: loaded.session }),
      command('duel-command', 'red', 'transition-phase', { nextPhase: 'command' }),
      command('duel-movement', 'red', 'transition-phase', { nextPhase: 'movement' })
    ]) {
      dispatchGameCommand(actor, nextCommand);
      const rejection = actor.getSnapshot().context.lastRejection;
      if (rejection) { actor.stop(); throw new Error(`Duel refusé : ${rejection.message}`); }
    }
    const nextState = getSimulatorGameState(actor);
    actor.stop();
    setInitial(eventFree); setState(nextState); setTarget(null); setNotice('Placement chargé. Rouge peut effectuer son mouvement légal.');
  }, []);

  useEffect(() => { loadClosedDuelRuntime().then((loaded) => { setRuntime(loaded); start(loaded); }).catch((error: unknown) => setNotice(error instanceof Error ? error.message : 'Chargement impossible.')); }, [start]);

  const persist = useCallback(async (next: GameState, currentRuntime: ClosedDuelRuntime, eventFree: GameState) => {
    const now = new Date().toISOString();
    const text = exportSimulation(eventFree, next, now, currentRuntime.environment);
    await new SimulationAutosaveController(storage, () => now, currentRuntime.environment, currentRuntime.compatibility.manifestFingerprint ?? undefined).autosave(eventFree, next);
    setExportBuffer(text);
  }, []);

  const apply = useCallback((result: ReturnType<typeof executeGameCommand> | ReturnType<typeof executeClosedDuelMove> | ReturnType<typeof executeBasicShootingCommand>) => {
    if (!result.accepted) { setNotice(`Refus explicite : ${result.rejection.code} — ${result.rejection.message}`); return; }
    setState(result.state); setNotice('Action acceptée et journalisée.');
    if (runtime && initial) void persist(result.state, runtime, initial).catch(() => setNotice('Action acceptée ; autosauvegarde IndexedDB indisponible.'));
  }, [initial, persist, runtime]);

  const move = (distance: number, id: string): void => {
    if (!runtime || !state) return;
    const red = state.models['red-1'];
    apply(executeClosedDuelMove(state, command(`${id}-${state.eventLog.length}`, 'red', 'move-model', { modelId: red.id, to: { x: red.position.x - distance, y: red.position.y }, orientationDegrees: red.orientationDegrees }) as Extract<GameCommand, { type: 'move-model' }>, runtime));
  };
  const enterShooting = (): void => { if (state) apply(executeGameCommand(state, command(`shooting-${state.eventLog.length}`, 'red', 'transition-phase', { nextPhase: 'shooting' }))); };
  const resolve = (): void => {
    if (!runtime || !state || target !== 'blue-unit') { setNotice('Refus explicite : sélectionnez l’unité bleue comme cible.'); return; }
    apply(executeBasicShootingCommand(state, command(`shoot-${state.eventLog.length}`, 'red', 'resolve-basic-shooting', { attackerUnitId: 'red-unit', targetUnitId: target, weaponProfileId: 'closed-core-training-rifle-v1' }) as Extract<GameCommand, { type: 'resolve-basic-shooting' }>, runtime.environment));
  };
  const save = (): void => { if (runtime && state && initial) void persist(state, runtime, initial).then(() => setNotice('Sauvegarde V2 exportée et autosauvegardée dans IndexedDB.')); };
  const resume = async (): Promise<void> => {
    if (!runtime) return;
    const restored = await new SimulationAutosaveController(storage, () => new Date().toISOString(), runtime.environment, runtime.compatibility.manifestFingerprint ?? undefined).restore(gameId);
    if (!restored) { setNotice('Aucune autosauvegarde IndexedDB de duel.'); return; }
    if (!restored.ok) { setNotice(`Refus explicite : ${restored.errors.join(' ')}`); return; }
    setInitial(restored.autosave.save.initialState); setState(restored.state); setExportBuffer(JSON.stringify(restored.autosave.save));
    setNotice(`Reprise IndexedDB exacte ${restored.autosave.save.schemaVersion}.`);
  };
  const importExport = (): void => {
    if (!runtime || !exportBuffer) { setNotice('Aucun export V2 à importer.'); return; }
    const restored = importSimulation(exportBuffer, runtime.environment, runtime.compatibility.manifestFingerprint ?? undefined);
    if (!restored.ok) { setNotice(`Refus explicite : ${restored.errors.join(' ')}`); return; }
    setInitial(restored.save.initialState); setState(restored.state); setNotice('Export V2 importé avec vérification du journal.');
  };
  const replay = (): void => {
    if (!runtime || !initial || !state) return;
    const restored = importSimulation(exportSimulation(initial, state, new Date().toISOString(), runtime.environment), runtime.environment, runtime.compatibility.manifestFingerprint ?? undefined);
    if (!restored.ok) { setNotice(`Refus explicite : ${restored.errors.join(' ')}`); return; }
    setState(restored.state); setNotice('Replay exact du journal V2 terminé.');
  };
  const shooting = state?.eventLog.filter((event) => event.type === 'basic-shooting-resolved').at(-1);

  if (!runtime || !state) return <main className="simulator-duel-page"><p role="status" data-testid="duel-notice">{notice}</p></main>;
  return <main className="simulator-duel-page" data-testid="closed-duel">
    <header className="simulator-lab-hero"><div><span className="simulator-kicker">WARFORGE · M3 CLOSED FIXTURE</span><h1>Duel fermé d’entraînement</h1><p>Deux unités synthétiques de cinq figurines. Ce mode ne représente jamais un roster réel.</p></div><div className="simulator-foundation-notice"><strong>Fixture fermée · hors catalogue</strong><span>Règles, armes et géométrie versionnées et couvertes.</span></div></header>
    <section className="duel-toolbar" aria-label="Contrôles du duel"><button onClick={() => move(200, 'move')} disabled={state.phase !== 'movement'}>Mouvement légal rouge (+0,79″)</button><button data-testid="duel-illegal-move" onClick={() => move(2_000, 'illegal')} disabled={state.phase !== 'movement'}>Tester mouvement illégal (&gt;6″)</button><button onClick={enterShooting} disabled={state.phase !== 'movement'}>Passer au tir</button><button onClick={() => setTarget('blue-unit')} className={target ? 'active' : ''} disabled={state.phase !== 'shooting'}>Cibler bleu</button><button onClick={resolve} disabled={state.phase !== 'shooting'}>Résoudre le tir</button><button onClick={save}>Sauvegarder / exporter V2</button><button onClick={importExport}>Importer l’export V2</button><button onClick={() => void resume()}>Reprendre IndexedDB</button><button onClick={replay}>Rejouer le journal</button><button onClick={() => start(runtime)}>Réinitialiser</button></section>
    <p className="duel-notice" role="status" data-testid="duel-notice">{notice}</p>
    <section className="duel-board" aria-label="Placement du duel" data-testid="duel-placement">
      {['red', 'blue'].map((player) => <div key={player} className={`duel-unit ${player}`}><h2>{player === 'red' ? 'Rouge — tireur' : 'Bleu — cible'}</h2>{Object.values(state.models).filter((model) => model.playerId === player).map((model) => <div key={model.id} data-testid={`duel-model-${model.id}`} className={!model.active ? 'lost' : ''}>{model.id} · ({model.position.x}, {model.position.y}) {!model.active ? ' — perte' : ''}</div>)}</div>)}
      <div className="duel-terrain">{runtime.terrain.map((zone) => <span key={zone.id}>{zone.label}</span>)}</div>
    </section>
    <section className="duel-resolution" data-testid="duel-resolution"><h2>Résolution pas à pas</h2><p>Phase : <strong>{state.phase}</strong> · PRNG : <span data-testid="duel-prng">{state.prng.seed}/{state.prng.draws}</span> · Journal : <span data-testid="duel-event-count">{state.eventLog.length}</span></p>{shooting ? <><p>Touches {shooting.result.hits} · Blessures {shooting.result.wounds} · Sauvegardes ratées {shooting.result.failedSaves} · Pertes : <strong data-testid="duel-losses">{shooting.casualtyModelIds.join(', ') || 'aucune'}</strong></p><ol>{shooting.rolls.map((roll) => <li key={roll.attackIndex}>#{roll.attackIndex + 1} : touche {roll.hitRoll ?? '—'} → blessure {roll.woundRoll ?? '—'} → sauvegarde {roll.saveRoll ?? '—'} → {roll.outcome}{roll.destroyedModelId ? ` (${roll.destroyedModelId})` : ''}</li>)}</ol></> : <p>Aucun tir résolu.</p>}</section>
    <details open><summary>Export / import JSON V2</summary><textarea data-testid="duel-export-json" value={exportBuffer} onChange={(event) => setExportBuffer(event.target.value)} aria-label="Export JSON V2" /></details>
  </main>;
}
