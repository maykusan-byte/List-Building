import { useCallback, useEffect, useMemo, useState } from 'react';
import { sessionCompatibilityFingerprint, type GameState } from '../domain';
import {
  CORE_POC_TECHNICAL_GAME_ID,
  createCorePocTechnicalGameV1,
  executeCorePocTechnicalStepV1,
  runCorePocTechnicalGameToCompletionV1
} from '../orchestration/core-poc-controller';
import {
  exportSimulation,
  importSimulation,
  IndexedDbSimulationStorageAdapter,
  SimulationAutosaveController
} from '../persistence';
import { assembleCurrentCorePocRuntimeV1, type CorePocRuntimeV1 } from '../runtime';

const storage = new IndexedDbSimulationStorageAdapter();

function phaseLabel(state: GameState): string {
  if (!state.battle) return state.phase;
  if (state.phase === 'deployment') return state.battle.firstPlayerId ? 'Déploiement terminé · démarrage' : 'Déploiement';
  if (state.phase === 'completed') return 'Terminée';
  return `${state.phase} · round ${state.battle.battleRound}, tour ${state.battle.turnNumber}`;
}

function activeModels(state: GameState, unitId: string): number {
  return state.units[unitId]?.models.filter((model) => model.active).length ?? 0;
}

export default function CorePocTechnicalPage(): React.JSX.Element {
  const [runtime, setRuntime] = useState<CorePocRuntimeV1 | null>(null);
  const [initial, setInitial] = useState<GameState | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [notice, setNotice] = useState('Chargement du POC technique…');
  const [exportBuffer, setExportBuffer] = useState('');

  const manifestFingerprint = useMemo(
    () => runtime ? sessionCompatibilityFingerprint(runtime.session) : undefined,
    [runtime]
  );

  const installFresh = useCallback((loaded: CorePocRuntimeV1): void => {
    const game = createCorePocTechnicalGameV1(loaded);
    setRuntime(loaded);
    setInitial(game.initial);
    setState(game.state);
    setExportBuffer('');
    setNotice('Session V6 prête. Avancez une commande à la fois ou lancez le parcours technique complet.');
  }, []);

  useEffect(() => {
    try {
      const loaded = assembleCurrentCorePocRuntimeV1();
      installFresh(loaded);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Chargement du POC technique impossible.');
    }
  }, [installFresh]);

  const persist = useCallback(async (next: GameState): Promise<void> => {
    if (!runtime || !initial || !manifestFingerprint) return;
    const now = new Date().toISOString();
    const serialized = exportSimulation(initial, next, now, runtime.environment);
    await new SimulationAutosaveController(storage, () => now, runtime.environment, manifestFingerprint).autosave(initial, next);
    setExportBuffer(serialized);
  }, [initial, manifestFingerprint, runtime]);

  const step = (): void => {
    if (!state || !runtime) return;
    const result = executeCorePocTechnicalStepV1(state, runtime);
    if (!result.accepted) {
      setNotice(`Refus explicite : ${result.rejection.code} — ${result.rejection.message}`);
      return;
    }
    setState(result.state);
    setNotice(`Commande acceptée : ${result.events.map((event) => event.type).join(', ')}.`);
    void persist(result.state).catch(() => setNotice('Commande acceptée ; autosauvegarde IndexedDB indisponible.'));
  };

  const finish = (): void => {
    if (!state || !runtime) return;
    try {
      const result = runCorePocTechnicalGameToCompletionV1(state, runtime);
      setState(result.state);
      setNotice(`Parcours technique terminé en ${result.commandCount} commandes normales journalisées.`);
      void persist(result.state).catch(() => setNotice('Parcours terminé ; autosauvegarde IndexedDB indisponible.'));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Le parcours technique a échoué.');
    }
  };

  const save = (): void => {
    if (!state) return;
    void persist(state).then(() => setNotice('Sauvegarde V6 exportée et autosauvegardée dans IndexedDB.'))
      .catch(() => setNotice('Export V6 créé, mais IndexedDB est indisponible.'));
  };

  const resume = async (): Promise<void> => {
    if (!runtime || !manifestFingerprint) return;
    const restored = await new SimulationAutosaveController(
      storage,
      () => new Date().toISOString(),
      runtime.environment,
      manifestFingerprint
    ).restore(CORE_POC_TECHNICAL_GAME_ID);
    if (!restored) { setNotice('Aucune autosauvegarde IndexedDB du POC technique.'); return; }
    if (!restored.ok) { setNotice(`Refus explicite : ${restored.errors.join(' ')}`); return; }
    setInitial(restored.autosave.save.initialState);
    setState(restored.state);
    setExportBuffer(JSON.stringify(restored.autosave.save));
    setNotice(`Reprise IndexedDB exacte ${restored.autosave.save.schemaVersion}.`);
  };

  const importExport = (): void => {
    if (!runtime || !manifestFingerprint || !exportBuffer) { setNotice('Aucun export V6 à importer.'); return; }
    const restored = importSimulation(exportBuffer, runtime.environment, manifestFingerprint);
    if (!restored.ok) { setNotice(`Refus explicite : ${restored.errors.join(' ')}`); return; }
    setInitial(restored.save.initialState);
    setState(restored.state);
    setNotice('Export V6 importé avec replay autoritaire vérifié.');
  };

  const replay = (): void => {
    if (!runtime || !manifestFingerprint || !initial || !state) return;
    const restored = importSimulation(
      exportSimulation(initial, state, new Date().toISOString(), runtime.environment),
      runtime.environment,
      manifestFingerprint
    );
    if (!restored.ok) { setNotice(`Refus explicite : ${restored.errors.join(' ')}`); return; }
    setState(restored.state);
    setNotice('Replay exact du journal V6 terminé.');
  };

  if (!runtime || !state) {
    return <main className="simulator-duel-page" data-testid="core-poc-technical"><p role="status" data-testid="poc-notice">{notice}</p></main>;
  }

  const report = runtime.session.completeGame!.compatibility.report;
  const players = runtime.session.players;
  const scores = state.mission?.scoresByPlayerId ?? {};
  const recentEvents = state.eventLog.slice(-12).reverse();

  return <main className="simulator-duel-page core-poc-technical-page" data-testid="core-poc-technical">
    <header className="simulator-lab-hero">
      <div>
        <span className="simulator-kicker">WARFORGE · M9 POC TECHNIQUE</span>
        <h1>POC technique — cinq rounds</h1>
        <p>Cette console valide la boucle, Disruption, le score et la sauvegarde V6 avec 22 figurines synthétiques. Elle n’est pas encore une partie W40K V11 fidèle.</p>
      </div>
      <div className="simulator-foundation-notice">
        <strong data-testid="poc-compatibility">Session technique compatible · fixture-only</strong>
        <span>Zéro datasheet, codex, détachement, point ou règle de faction couverte.</span>
      </div>
    </header>

    <section className="poc-limitations" aria-label="Limites obligatoires du POC" data-testid="poc-limitations">
      <h2>Quatre règles volontairement non exécutables</h2>
      <p>Le moteur ne les propose et ne les approxime jamais. Elles sont planifiées en dette XL avant les codex.</p>
      <ul>{report.nonReachableRequirements.map((requirement) => <li key={requirement.nodeId}><strong>{requirement.nodeId}</strong> — {requirement.title}</li>)}</ul>
      <p><strong>Stratagèmes déjà couverts :</strong> Courage Insensé (15.04) et Contre-offensive (15.12). Le parcours automatique n’essaie pas de provoquer artificiellement leurs fenêtres.</p>
      <p><strong>Convention de score technique :</strong> les deux forces synthétiques reçoivent un verdict externe Battle Ready positif afin de tester le résultat final.</p>
    </section>

    <section className="duel-toolbar" aria-label="Contrôles du POC technique">
      <button data-testid="poc-step" onClick={step} disabled={state.phase === 'completed'}>Avancer une commande</button>
      <button data-testid="poc-finish" onClick={finish} disabled={state.phase === 'completed'}>Terminer le parcours technique</button>
      <button onClick={save}>Sauvegarder / exporter V6</button>
      <button onClick={importExport}>Importer l’export V6</button>
      <button onClick={() => void resume()}>Reprendre IndexedDB</button>
      <button onClick={replay}>Rejouer le journal V6</button>
      <button onClick={() => installFresh(runtime)}>Réinitialiser</button>
    </section>

    <p className="duel-notice" role="status" data-testid="poc-notice">{notice}</p>
    <section className="m4-status-grid" aria-label="État du POC technique">
      <div><span>Étape</span><strong data-testid="poc-phase">{phaseLabel(state)}</strong></div>
      <div><span>Joueur actif</span><strong>{state.battle?.activePlayerId ?? '—'}</strong></div>
      <div><span>PRNG</span><strong data-testid="poc-prng">{state.prng.seed}/{state.prng.draws}</strong></div>
      <div><span>Journal</span><strong data-testid="poc-event-count">{state.eventLog.length}</strong></div>
    </section>

    <section className="poc-score-grid" aria-label="Score du POC">
      {players.map((player) => <article key={player.id}>
        <h2>{player.displayName}</h2>
        <strong data-testid={`poc-score-${player.id}`}>{scores[player.id] ?? 0} VP</strong>
        <ul>{Object.values(state.units).filter((unit) => unit.playerId === player.id).sort((left, right) => left.id.localeCompare(right.id)).map((unit) =>
          <li key={unit.id}>{unit.id} · {activeModels(state, unit.id)}/{unit.models.length} figurines · {state.battle?.deployedUnitIds.includes(unit.id) ? 'déployée' : 'en attente'}</li>)}</ul>
      </article>)}
    </section>

    <section className="duel-resolution" data-testid="poc-journal">
      <h2>Journal récent</h2>
      <ol>{recentEvents.map((event) => <li key={event.id}><code>{event.type}</code> · {event.id}</li>)}</ol>
      {state.mission?.finalResult ? <p data-testid="poc-final-result"><strong>Résultat final :</strong> {state.mission.finalResult.outcome === 'draw' ? 'égalité' : `vainqueur ${state.mission.finalResult.winnerPlayerId}`}</p> : <p>Le résultat final sera produit au dernier checkpoint du round 5.</p>}
    </section>

    <details open><summary>Export / import JSON V6</summary><textarea data-testid="poc-export-json" value={exportBuffer} onChange={(event) => setExportBuffer(event.target.value)} aria-label="Export JSON V6 POC technique" /></details>
  </main>;
}
