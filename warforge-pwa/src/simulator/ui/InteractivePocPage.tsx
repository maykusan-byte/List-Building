import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react';
import type { Application, Graphics } from 'pixi.js';
import type { GameCommand, GameState, UnitMovementTypeV1, WorldPoint } from '../domain';
import {
  createCorePocTechnicalGameV1,
  deriveInteractivePocViewV1,
  executeInteractivePocCommandV1,
  type InteractivePocActionV1
} from '../orchestration';
import { assembleCurrentCorePocRuntimeV1, type CorePocRuntimeV1 } from '../runtime';

interface PoseDraftV1 {
  readonly action: InteractivePocActionV1;
  readonly kind: 'deployment' | 'movement';
  readonly movementType?: UnitMovementTypeV1;
  readonly poses: readonly {
    readonly modelId: string;
    readonly position: WorldPoint;
    readonly orientationDegrees: number;
  }[];
}

type BoardSelectionV1 =
  | { readonly kind: 'model'; readonly id: string }
  | { readonly kind: 'objective'; readonly id: string }
  | { readonly kind: 'terrain'; readonly id: string };

interface BoardModelV1 {
  readonly id: string;
  readonly unitId: string;
  readonly playerId: string;
  readonly position: WorldPoint;
  readonly radius: number;
  readonly draft: boolean;
}

interface BoardTransformV1 {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

interface BoardRuntimeV1 {
  readonly app: Application;
  readonly staticLayer: Graphics;
  readonly dynamicLayer: Graphics;
}

interface InteractivePocBoardProps {
  readonly runtime: CorePocRuntimeV1;
  readonly state: GameState;
  readonly draft: PoseDraftV1 | null;
  readonly selection: BoardSelectionV1 | null;
  readonly onSelection: (selection: BoardSelectionV1) => void;
  readonly onDraftPose: (modelId: string, position: WorldPoint) => void;
}

const BOARD_PADDING = 22;

function fitBoard(width: number, height: number, boardWidth: number, boardHeight: number): BoardTransformV1 {
  const scale = Math.max(0.001, Math.min(
    (Math.max(width, BOARD_PADDING * 2 + 1) - BOARD_PADDING * 2) / boardWidth,
    (Math.max(height, BOARD_PADDING * 2 + 1) - BOARD_PADDING * 2) / boardHeight
  ));
  return {
    scale,
    offsetX: (width - boardWidth * scale) / 2,
    offsetY: (height - boardHeight * scale) / 2
  };
}

function screenPoint(point: WorldPoint, transform: BoardTransformV1): WorldPoint {
  return {
    x: transform.offsetX + point.x * transform.scale,
    y: transform.offsetY + point.y * transform.scale
  };
}

function worldPoint(point: WorldPoint, transform: BoardTransformV1): WorldPoint {
  return {
    x: Math.round((point.x - transform.offsetX) / transform.scale),
    y: Math.round((point.y - transform.offsetY) / transform.scale)
  };
}

function drawPolygon(graphics: Graphics, points: readonly WorldPoint[], transform: BoardTransformV1): void {
  if (points.length < 3) return;
  const first = screenPoint(points[0]!, transform);
  graphics.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    const next = screenPoint(point, transform);
    graphics.lineTo(next.x, next.y);
  }
  graphics.closePath();
}

function pointInPolygon(point: WorldPoint, polygon: readonly WorldPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]!;
    const previousPoint = polygon[previous]!;
    const crosses = (currentPoint.y > point.y) !== (previousPoint.y > point.y)
      && point.x < (previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)
        / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function modelRadius(runtime: CorePocRuntimeV1, state: GameState, modelId: string): number {
  const profile = runtime.environment.physicalProfiles[state.models[modelId]!.profileId];
  return profile?.baseShape.kind === 'circle' ? profile.baseShape.radius : 160;
}

function visibleBoardModels(runtime: CorePocRuntimeV1, state: GameState, draft: PoseDraftV1 | null): BoardModelV1[] {
  const deployed = new Set(state.battle?.deployedUnitIds ?? []);
  const draftPositions = new Map(draft?.poses.map((pose) => [pose.modelId, pose.position]) ?? []);
  const draftUnitId = draft?.action.unitId;
  return Object.values(state.units)
    .filter((unit) => deployed.has(unit.id) || unit.id === draftUnitId)
    .flatMap((unit) => unit.models.filter((member) => member.active).map((member) => ({
      id: member.id,
      unitId: unit.id,
      playerId: unit.playerId,
      position: draftPositions.get(member.id) ?? state.models[member.id]!.position,
      radius: modelRadius(runtime, state, member.id),
      draft: unit.id === draftUnitId && (draft?.kind === 'movement' || !deployed.has(unit.id))
    })))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function InteractivePocBoard({ runtime, state, draft, selection, onSelection, onDraftPose }: InteractivePocBoardProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const pixiRef = useRef<BoardRuntimeV1 | null>(null);
  const transformRef = useRef<BoardTransformV1>({ scale: 1, offsetX: 0, offsetY: 0 });
  const dragModelIdRef = useRef<string | null>(null);
  const drawStaticRef = useRef<() => void>(() => undefined);
  const drawDynamicRef = useRef<() => void>(() => undefined);
  const [ready, setReady] = useState(false);
  const models = useMemo(() => visibleBoardModels(runtime, state, draft), [draft, runtime, state]);
  const board = runtime.spatial.layout.board;

  const drawStatic = useCallback((): void => {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const graphics = pixi.staticLayer;
    const transform = transformRef.current;
    graphics.clear();
    graphics.rect(0, 0, pixi.app.screen.width, pixi.app.screen.height).fill({ color: 0x0b1520 });
    const topLeft = screenPoint({ x: 0, y: 0 }, transform);
    const bottomRight = screenPoint({ x: board.width, y: board.height }, transform);
    graphics.rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y)
      .fill({ color: 0x24353f })
      .stroke({ color: 0xd6c49b, width: 2 });

    for (const zone of runtime.spatial.deploymentZones) {
      drawPolygon(graphics, zone.polygon, transform);
      graphics.fill({ color: zone.role === 'attacker' ? 0xb84d4d : 0x3c70a4, alpha: 0.18 });
      drawPolygon(graphics, zone.polygon, transform);
      graphics.stroke({ color: zone.role === 'attacker' ? 0xff8585 : 0x7ab8f5, width: 2, alpha: 0.75 });
    }

    for (const terrain of runtime.spatial.terrainAreas) {
      drawPolygon(graphics, terrain.footprint.polygons[0].outer, transform);
      graphics.fill({ color: 0x536f5b, alpha: 0.82 }).stroke({ color: 0x8db296, width: 1.5 });
    }
    for (const feature of runtime.spatial.featureSurfaces) {
      drawPolygon(graphics, feature.polygon, transform);
      graphics.fill({ color: feature.kind === 'ruin-wall' ? 0x403d4d : 0x725d3f, alpha: 0.95 });
    }
    for (const objective of runtime.spatial.layout.objectiveMarkers) {
      const point = screenPoint(objective.position, transform);
      graphics.circle(point.x, point.y, Math.max(7, objective.radius * transform.scale))
        .fill({ color: 0xf0cd61, alpha: 0.9 })
        .stroke({ color: 0xfff0a8, width: 2 });
    }
  }, [board.height, board.width, runtime]);

  const drawDynamic = useCallback((): void => {
    const pixi = pixiRef.current;
    if (!pixi) return;
    const graphics = pixi.dynamicLayer;
    const transform = transformRef.current;
    graphics.clear();

    if (selection?.kind === 'terrain') {
      const terrain = runtime.spatial.terrainAreas.find((candidate) => candidate.id === selection.id);
      if (terrain) {
        drawPolygon(graphics, terrain.footprint.polygons[0].outer, transform);
        graphics.stroke({ color: 0xffdc78, width: 4, alpha: 0.95 });
      }
    } else if (selection?.kind === 'objective') {
      const objective = runtime.spatial.layout.objectiveMarkers.find((candidate) => candidate.id === selection.id);
      if (objective) {
        const point = screenPoint(objective.position, transform);
        graphics.circle(point.x, point.y, Math.max(12, objective.radius * transform.scale + 5))
          .stroke({ color: 0xffffff, width: 3 });
      }
    }

    if (draft?.kind === 'movement') {
      for (const pose of draft.poses) {
        const start = state.models[pose.modelId]?.position;
        if (!start || (start.x === pose.position.x && start.y === pose.position.y)) continue;
        const from = screenPoint(start, transform);
        const to = screenPoint(pose.position, transform);
        graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0xffdc78, width: 2.5, alpha: 0.9 });
      }
    }

    for (const model of models) {
      const point = screenPoint(model.position, transform);
      const radius = Math.max(5, model.radius * transform.scale);
      const attacker = model.playerId === state.battle?.attackerPlayerId;
      graphics.circle(point.x, point.y, radius)
        .fill({ color: attacker ? 0xd85d57 : 0x4d8fd1, alpha: model.draft ? 0.7 : 1 })
        .stroke({ color: model.draft ? 0xffefb0 : 0x13232d, width: model.draft ? 2.5 : 1.5 });
      if (selection?.kind === 'model' && selection.id === model.id) {
        graphics.circle(point.x, point.y, radius + 5).stroke({ color: 0xffffff, width: 3 });
      }
    }
  }, [draft, models, runtime, selection, state, state.battle?.attackerPlayerId]);

  drawStaticRef.current = drawStatic;
  drawDynamicRef.current = drawDynamic;

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    if (!host) return undefined;
    const resize = (): void => {
      transformRef.current = fitBoard(host.clientWidth, host.clientHeight, board.width, board.height);
      requestAnimationFrame(() => {
        drawStaticRef.current();
        drawDynamicRef.current();
      });
    };
    const observer = new ResizeObserver(resize);
    void (async () => {
      const { Application: PixiApplication, Graphics: PixiGraphics } = await import('pixi.js');
      const app = new PixiApplication();
      await app.init({ resizeTo: host, autoStart: false, antialias: true, backgroundAlpha: 0, preference: 'webgl' });
      if (disposed) { app.destroy(true); return; }
      const staticLayer = new PixiGraphics();
      const dynamicLayer = new PixiGraphics();
      app.stage.addChild(staticLayer, dynamicLayer);
      app.canvas.setAttribute('aria-hidden', 'true');
      host.prepend(app.canvas);
      pixiRef.current = { app, staticLayer, dynamicLayer };
      observer.observe(host);
      setReady(true);
      resize();
    })();
    return () => {
      disposed = true;
      observer.disconnect();
      const pixi = pixiRef.current;
      pixiRef.current = null;
      pixi?.app.destroy(true);
    };
  }, [board.height, board.width]);

  useEffect(() => { drawDynamic(); }, [drawDynamic, ready]);

  const eventWorldPoint = (event: ReactPointerEvent<HTMLDivElement>): WorldPoint => {
    const bounds = hostRef.current!.getBoundingClientRect();
    return worldPoint({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, transformRef.current);
  };

  const hitModel = (point: WorldPoint): BoardModelV1 | undefined => [...models].reverse().find((model) =>
    Math.hypot(model.position.x - point.x, model.position.y - point.y) <= model.radius
  );

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const point = eventWorldPoint(event);
    const model = hitModel(point);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (model) {
      onSelection({ kind: 'model', id: model.id });
      if (model.draft) dragModelIdRef.current = model.id;
      return;
    }
    const objective = [...runtime.spatial.layout.objectiveMarkers].reverse().find((candidate) =>
      Math.hypot(candidate.position.x - point.x, candidate.position.y - point.y) <= Math.max(candidate.radius, 220)
    );
    if (objective) { onSelection({ kind: 'objective', id: objective.id }); return; }
    const terrain = [...runtime.spatial.terrainAreas].reverse().find((candidate) =>
      pointInPolygon(point, candidate.footprint.polygons[0].outer)
    );
    if (terrain) onSelection({ kind: 'terrain', id: terrain.id });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragModelIdRef.current) onDraftPose(dragModelIdRef.current, eventWorldPoint(event));
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragModelIdRef.current && event.type !== 'pointercancel') {
      onDraftPose(dragModelIdRef.current, eventWorldPoint(event));
    }
    dragModelIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div
    ref={hostRef}
    className="interactive-poc-board"
    data-testid="interactive-poc-board"
    data-renderer={ready ? 'pixi-webgl-ready' : 'loading'}
    role="application"
    aria-label="Plateau interactif du POC Warforge"
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerEnd}
    onPointerCancel={handlePointerEnd}
  >
    <div className="interactive-board-caption">44″ × 60″ · layout Disruption · Pixi à la demande</div>
  </div>;
}

function poseDraft(action: InteractivePocActionV1, state: GameState, kind: PoseDraftV1['kind']): PoseDraftV1 {
  const unit = state.units[action.unitId!]!;
  return {
    action,
    kind,
    ...(kind === 'movement' ? { movementType: 'normal' as const } : {}),
    poses: unit.models.filter((member) => member.active).map((member) => {
      const model = state.models[member.id]!;
      return { modelId: model.id, position: model.position, orientationDegrees: model.orientationDegrees };
    })
  };
}

function draftCommand(state: GameState, draft: PoseDraftV1, suffix: string): GameCommand {
  if (draft.kind === 'movement') {
    return {
      id: `${state.gameId}:interactive:${state.eventLog.length}:${suffix}`,
      actorId: draft.action.actorId,
      type: 'move-unit',
      unitId: draft.action.unitId!,
      movementType: draft.movementType!,
      paths: draft.poses.map((pose) => {
        const start = state.models[pose.modelId]!.position;
        return {
          modelId: pose.modelId,
          waypoints: start.x === pose.position.x && start.y === pose.position.y ? [] : [pose.position]
        };
      })
    };
  }
  return {
    id: `${state.gameId}:interactive:${state.eventLog.length}:${suffix}`,
    actorId: draft.action.actorId,
    type: 'deploy-unit',
    unitId: draft.action.unitId!,
    modelPoses: draft.poses
  };
}

function selectionLabel(selection: BoardSelectionV1 | null, draft: PoseDraftV1 | null): string {
  if (!selection) return 'Aucun élément sélectionné';
  if (selection.kind !== 'model') return `${selection.kind === 'terrain' ? 'Terrain' : 'Objectif'} · ${selection.id}`;
  const pose = draft?.poses.find((candidate) => candidate.modelId === selection.id);
  return pose
    ? `Figurine · ${selection.id} · x ${(pose.position.x / 254).toFixed(1)}″ · y ${(pose.position.y / 254).toFixed(1)}″`
    : `Figurine déployée · ${selection.id}`;
}

export default function InteractivePocPage(): React.JSX.Element {
  const runtime = useMemo(() => assembleCurrentCorePocRuntimeV1(), []);
  const game = useMemo(() => createCorePocTechnicalGameV1(runtime, 'closed-complete-game-core-poc-interactive-v1'), [runtime]);
  const [state, setState] = useState(game.state);
  const [draft, setDraft] = useState<PoseDraftV1 | null>(null);
  const [selection, setSelection] = useState<BoardSelectionV1 | null>(null);
  const [notice, setNotice] = useState('Choisissez l’unité indiquée, ajustez ses figurines, puis confirmez le déploiement.');
  const view = useMemo(() => deriveInteractivePocViewV1(state, runtime), [runtime, state]);
  const preview = useMemo(() => draft
    ? executeInteractivePocCommandV1(state, draftCommand(state, draft, 'preview'), runtime)
    : null, [draft, runtime, state]);
  const deploymentActions = view.actions.filter((action) => action.kind === 'deploy-unit');
  const movementActions = view.actions.filter((action) => action.kind === 'move-unit');
  const simpleActionKinds = new Set<InteractivePocActionV1['kind']>([
    'determine-first-player', 'start-battle', 'resolve-command-stage', 'resolve-battle-shock-test',
    'use-insane-bravery', 'resolve-mission-scoring', 'advance-battle-phase'
  ]);
  const simpleActions = view.actions.filter((action) => simpleActionKinds.has(action.kind));
  const selectedModelId = selection?.kind === 'model' ? selection.id : null;

  const selectDeployment = (action: InteractivePocActionV1): void => {
    const next = poseDraft(action, state, 'deployment');
    setDraft(next);
    setSelection({ kind: 'model', id: next.poses[0]!.modelId });
    setNotice(`Prévisualisation de ${action.unitId}. Les positions ne seront journalisées qu’après confirmation.`);
  };

  const selectMovement = (action: InteractivePocActionV1): void => {
    const next = poseDraft(action, state, 'movement');
    setDraft(next);
    setSelection({ kind: 'model', id: next.poses[0]!.modelId });
    setNotice(`Trajectoires de ${action.unitId} en prévisualisation. Aucun jet ni événement n’est adopté avant confirmation.`);
  };

  const updateDraftPose = useCallback((modelId: string, position: WorldPoint): void => {
    setDraft((current) => current ? {
      ...current,
      poses: current.poses.map((pose) => pose.modelId === modelId ? { ...pose, position } : pose)
    } : null);
  }, []);

  const nudgeSelected = (delta: WorldPoint): void => {
    if (!selectedModelId) return;
    const pose = draft?.poses.find((candidate) => candidate.modelId === selectedModelId);
    if (pose) updateDraftPose(selectedModelId, { x: pose.position.x + delta.x, y: pose.position.y + delta.y });
  };

  const testSelectedMovementTooFar = (): void => {
    if (!selectedModelId || draft?.kind !== 'movement') return;
    const pose = draft.poses.find((candidate) => candidate.modelId === selectedModelId);
    if (!pose) return;
    const direction = pose.position.x > runtime.spatial.layout.board.width / 2 ? -1 : 1;
    updateDraftPose(selectedModelId, { x: pose.position.x + direction * 2_000, y: pose.position.y });
  };

  const applyResult = (result: ReturnType<typeof executeInteractivePocCommandV1>): void => {
    if (!result.accepted) {
      setNotice(`Refus explicite : ${result.rejection.code} — ${result.rejection.message}`);
      return;
    }
    setState(result.state);
    setDraft(null);
    setSelection(null);
    setNotice(`Commande acceptée : ${result.events.map((event) => event.type).join(', ')}.`);
  };

  const confirmDeployment = (): void => {
    if (draft) applyResult(executeInteractivePocCommandV1(state, draftCommand(state, draft, 'confirm'), runtime));
  };

  const executeSimpleAction = (action: InteractivePocActionV1): void => {
    const id = `${state.gameId}:interactive:${state.eventLog.length}:${action.kind}`;
    let command: GameCommand | null = null;
    switch (action.kind) {
      case 'determine-first-player': command = { id, actorId: action.actorId, type: 'determine-first-player' }; break;
      case 'start-battle': command = { id, actorId: action.actorId, type: 'start-battle' }; break;
      case 'resolve-command-stage': command = { id, actorId: action.actorId, type: 'resolve-command-stage' }; break;
      case 'resolve-battle-shock-test': command = { id, actorId: action.actorId, type: 'resolve-battle-shock-test', unitId: action.unitId! }; break;
      case 'use-insane-bravery': command = { id, actorId: action.actorId, type: 'use-insane-bravery', unitId: action.unitId! }; break;
      case 'resolve-mission-scoring': command = { id, actorId: action.actorId, type: 'resolve-mission-scoring' }; break;
      case 'advance-battle-phase': command = { id, actorId: action.actorId, type: 'advance-battle-phase' }; break;
      default: return;
    }
    applyResult(executeInteractivePocCommandV1(state, command, runtime));
  };

  const setMovementType = (movementType: UnitMovementTypeV1): void => {
    setDraft((current) => current?.kind === 'movement' ? { ...current, movementType } : current);
  };

  const previewSummary = (): string => {
    if (!draft || !preview) return '';
    if (!preview.accepted) {
      const details = preview.rejection.details;
      const detailText = details?.modelId ? ` · figurine ${details.modelId}`
        : details?.obstacleId ? ` · obstacle ${details.obstacleId}` : '';
      return `Prévisualisation refusée : ${preview.rejection.code}${detailText} — ${preview.rejection.message}`;
    }
    const movement = preview.events.find((event) => event.type === 'unit-movement-resolved');
    if (movement?.type === 'unit-movement-resolved') {
      const distances = movement.evidence.paths.map((path) => `${path.modelId.split(':').at(-1)} ${ (path.pathLength / 254).toFixed(1)}″`).join(' · ');
      return `Prévisualisation autorisée par le moteur : ${movement.movementType} · maximum ${(movement.maximumDistance / 254).toFixed(1)}″ · ${distances || 'stationnaire'} · cohérence conforme.`;
    }
    return 'Prévisualisation autorisée par le moteur.';
  };

  const reset = (): void => {
    setState(game.state);
    setDraft(null);
    setSelection(null);
    setNotice('Session interactive réinitialisée.');
  };

  return <main className="simulator-duel-page interactive-poc-page" data-testid="interactive-poc-page">
    <header className="simulator-lab-hero">
      <div>
        <span className="simulator-kicker">WARFORGE · M10 POC INTERACTIF</span>
        <h1>Déploiement tactique fixture-only</h1>
        <p>Le plateau, ses treize terrains, six objectifs et vingt-deux figurines synthétiques utilisent le runtime déterministe de M9.</p>
      </div>
      <div className="simulator-foundation-notice">
        <strong>Tranche active · mouvements</strong>
        <span>Les déplacements sont des brouillons visibles ; le moteur reste seul juge de chaque commande confirmée.</span>
      </div>
    </header>

    <section className="poc-limitations interactive-limitations" data-testid="interactive-limitations">
      <strong>Fixture-only, sans codex.</strong> Limites visibles : {view.limitations.join(' · ')}.
    </section>

    <section className="interactive-poc-status" aria-label="État du déploiement">
      <div><span>Étape</span><strong data-testid="interactive-phase">{view.phase} · {view.lifecycle}</strong></div>
      <div><span>Joueur attendu</span><strong data-testid="interactive-player">{view.actionPlayerId ?? '—'}</strong></div>
      <div><span>Déployées</span><strong data-testid="interactive-deployed-count">{view.units.filter((unit) => unit.deployed).length}/{view.units.length}</strong></div>
      <div><span>Journal</span><strong data-testid="interactive-event-count">{view.eventCount} événements</strong></div>
    </section>

    <section className="interactive-poc-workspace">
      <InteractivePocBoard
        runtime={runtime}
        state={state}
        draft={draft}
        selection={selection}
        onSelection={setSelection}
        onDraftPose={updateDraftPose}
      />

      <aside className="interactive-poc-panel" aria-label="Contrôles du POC interactif">
        <h2>Actions autorisées</h2>
        {deploymentActions.length > 0 ? <div className="interactive-action-list">
          {deploymentActions.map((action) => <button
            key={action.id}
            type="button"
            className={draft?.action.id === action.id ? 'active' : ''}
            data-testid={`interactive-deploy-${action.unitId}`}
            onClick={() => selectDeployment(action)}
          >{action.label}</button>)}
        </div> : null}
        {deploymentActions.length === 0 && simpleActions.length > 0 ? <div className="interactive-action-list">
          {simpleActions.map((action) => <button key={action.id} type="button" data-testid={`interactive-${action.kind}`} onClick={() => executeSimpleAction(action)}>{action.label}</button>)}
        </div> : null}
        {deploymentActions.length === 0 && movementActions.length > 0 ? <div className="interactive-action-list">
          <h3>Mouvement</h3>
          {movementActions.map((action) => <button
            key={action.id}
            type="button"
            className={draft?.kind === 'movement' && draft.action.id === action.id ? 'active' : ''}
            data-testid={`interactive-move-${action.unitId}`}
            onClick={() => selectMovement(action)}
          >{action.label}</button>)}
        </div> : null}

        {draft ? <>
          <h3>{draft.kind === 'movement' ? 'Trajectoires prévisualisées' : 'Figurines prévisualisées'}</h3>
          {draft.kind === 'movement' ? <label>Type de mouvement
            <select data-testid="interactive-movement-type" value={draft.movementType} onChange={(event) => setMovementType(event.target.value as UnitMovementTypeV1)}>
              <option value="remain-stationary">Rester stationnaire</option>
              <option value="normal">Mouvement normal</option>
              <option value="advance">Avancer</option>
              <option value="fall-back">Battre en retraite</option>
            </select>
          </label> : null}
          <div className="interactive-model-list">{draft.poses.map((pose) => <button
            key={pose.modelId}
            type="button"
            className={selectedModelId === pose.modelId ? 'active' : ''}
            data-testid={`interactive-draft-model-${pose.modelId}`}
            onClick={() => setSelection({ kind: 'model', id: pose.modelId })}
          >{pose.modelId.split(':').at(-1)}</button>)}</div>
          <div className="interactive-nudge" aria-label="Ajuster la figurine sélectionnée">
            <button type="button" onClick={() => nudgeSelected({ x: 0, y: -254 })}>↑ 1″</button>
            <button type="button" onClick={() => nudgeSelected({ x: -254, y: 0 })}>← 1″</button>
            <button type="button" onClick={() => nudgeSelected({ x: 254, y: 0 })}>→ 1″</button>
            <button type="button" onClick={() => nudgeSelected({ x: 0, y: 254 })}>↓ 1″</button>
            <button type="button" data-testid="interactive-preview-outside" onClick={() => draft.kind === 'movement'
              ? testSelectedMovementTooFar()
              : selectedModelId && updateDraftPose(selectedModelId, { x: -1_000, y: -1_000 })
            }>{draft.kind === 'movement' ? 'Tester trop loin' : 'Tester hors plateau'}</button>
          </div>
          <p className={preview?.accepted ? 'interactive-preview allowed' : 'interactive-preview rejected'} data-testid="interactive-preview">
            {previewSummary()}
          </p>
          <div className="interactive-confirm-actions">
            <button type="button" data-testid="interactive-confirm-deployment" onClick={confirmDeployment}>Confirmer la commande</button>
            <button type="button" className="secondary" onClick={() => { setDraft(null); setSelection(null); }}>Annuler le brouillon</button>
          </div>
        </> : null}

        <h3>Inspecter le plateau</h3>
        <label>Objectif
          <select value={selection?.kind === 'objective' ? selection.id : ''} onChange={(event) => event.target.value && setSelection({ kind: 'objective', id: event.target.value })}>
            <option value="">Choisir…</option>
            {runtime.spatial.layout.objectiveMarkers.map((objective) => <option key={objective.id} value={objective.id}>{objective.id}</option>)}
          </select>
        </label>
        <label>Terrain
          <select value={selection?.kind === 'terrain' ? selection.id : ''} onChange={(event) => event.target.value && setSelection({ kind: 'terrain', id: event.target.value })}>
            <option value="">Choisir…</option>
            {runtime.spatial.terrainAreas.map((terrain) => <option key={terrain.id} value={terrain.id}>{terrain.id}</option>)}
          </select>
        </label>
        <p className="interactive-selection" data-testid="interactive-selection">{selectionLabel(selection, draft)}</p>
        <button type="button" className="secondary" onClick={reset}>Réinitialiser le POC interactif</button>
      </aside>
    </section>

    <p className="duel-notice" role="status" data-testid="interactive-notice">{notice}</p>
  </main>;
}
