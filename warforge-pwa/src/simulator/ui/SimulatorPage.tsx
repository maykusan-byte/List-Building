import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { Application, Graphics } from 'pixi.js';
import { WORLD_UNITS_PER_INCH } from '../geometry';
import type { Point2, Point3, TerrainBlocker } from '../geometry';
import {
  LABORATORY_BOARD,
  LABORATORY_COHERENCY_DISTANCE,
  LABORATORY_MODELS,
  LABORATORY_TERRAIN,
  inchesFromWorldUnits,
  inspectLaboratory
} from './laboratory';
import type { LaboratoryAnalysis, LaboratoryModel, LaboratoryMove } from './laboratory';
import './simulator.css';
import ClosedDuelPage from './ClosedDuelPage';
import CorePocTechnicalPage from './CorePocTechnicalPage';
import InteractivePocPage from './InteractivePocPage';
import M4RealRosterDuelPage from './M4RealRosterDuelPage';

export interface SimulatorPageProps {
  readonly locale: 'fr' | 'en';
}

interface Camera {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

interface PixiRuntime {
  readonly app: Application;
  readonly Graphics: typeof Graphics;
}

interface DragState {
  readonly modelId: string;
  readonly from: Point2;
}

const GRID_STEP = 6 * WORLD_UNITS_PER_INCH;
const MIN_ZOOM = 0.018;
const MAX_ZOOM = 0.14;

function isFrench(locale: SimulatorPageProps['locale']): boolean {
  return locale === 'fr';
}

function formatDistance(value: number | undefined, locale: SimulatorPageProps['locale']): string {
  if (value === undefined) return '—';
  const inches = inchesFromWorldUnits(value);
  return `${new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 2 }).format(inches)}″ · ${Math.round(value)} u`;
}

function fitCamera(width: number, height: number): Camera {
  const padding = 42;
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (width - padding * 2) / LABORATORY_BOARD.width, (height - padding * 2) / LABORATORY_BOARD.height));
  return {
    zoom,
    panX: (width - LABORATORY_BOARD.width * zoom) / 2,
    panY: (height - LABORATORY_BOARD.height * zoom) / 2
  };
}

function worldToScreen(point: Point2, camera: Camera): Point2 {
  return { x: point.x * camera.zoom + camera.panX, y: point.y * camera.zoom + camera.panY };
}

function screenToWorld(point: Point2, camera: Camera): Point2 {
  return { x: (point.x - camera.panX) / camera.zoom, y: (point.y - camera.panY) / camera.zoom };
}

function updateModelPosition(models: readonly LaboratoryModel[], modelId: string, position: Point2): LaboratoryModel[] {
  const nextPosition = { x: Math.round(position.x), y: Math.round(position.y) };
  return models.map((model) => model.id === modelId ? { ...model, position: nextPosition } : model);
}

function formatPoint(point: Point3): string {
  return `x=${Math.round(point.x)} · y=${Math.round(point.y)} · z=${Math.round(point.z)} u`;
}

function terrainRings(terrain: TerrainBlocker): readonly (readonly Point2[])[] {
  if ('kind' in terrain.footprint) return [terrain.footprint.vertices];
  return terrain.footprint.polygons.flatMap((polygon) => [polygon.outer, ...(polygon.holes ?? [])]);
}

function LabStatus({ analysis, locale }: { analysis: LaboratoryAnalysis; locale: SimulatorPageProps['locale'] }): React.JSX.Element {
  const french = isFrench(locale);
  const selectedLabel = analysis.selectedModel?.label ?? (french ? 'Aucune figurine' : 'No model');
  const targetLabel = analysis.rulerTarget?.label ?? (french ? 'Cible non définie' : 'No target');
  const movement = analysis.movementVerdict;
  const collision = movement?.firstCollision;
  const boardExit = movement?.boardExit;
  const blocker = analysis.lineOfSight?.firstBlocker;

  return (
    <aside className="simulator-lab-sidebar" data-testid="simulator-readout" aria-label={french ? 'Lecture de géométrie' : 'Geometry readout'}>
      <section className="simulator-readout-card">
        <span className="simulator-readout-label">{french ? 'Sélection' : 'Selection'}</span>
        <strong>{selectedLabel}</strong>
        <small>{french ? 'Glisser pour déplacer · Molette pour zoomer' : 'Drag to move · Wheel to zoom'}</small>
      </section>

      <section className="simulator-readout-card">
        <span className="simulator-readout-label">{french ? 'Réglette (bord à bord)' : 'Ruler (edge to edge)'}</span>
        <strong data-testid="simulator-ruler-edge-distance"><span data-testid="simulator-ruler-distance">{formatDistance(analysis.rulerDistance, locale)}</span></strong>
        <small>{targetLabel} · {french ? 'centre à centre' : 'centre to centre'} <span data-testid="simulator-ruler-center-distance">{formatDistance(analysis.centerDistance, locale)}</span></small>
      </section>

      <section className={`simulator-readout-card ${analysis.collidingModelIds.length > 0 || movement?.allowed === false ? 'is-alert' : 'is-ok'}`}>
        <span className="simulator-readout-label">{french ? 'Collision et volume balayé' : 'Collision and swept volume'}</span>
        <strong data-testid="simulator-collision-verdict">
          {collision
            ? (french ? `Contact : ${collision.obstacleId}` : `Contact: ${collision.obstacleId}`)
            : boardExit
              ? (french ? 'Hors du plateau' : 'Outside board')
            : analysis.collidingModelIds.length > 0
              ? (french ? `Chevauchement : ${analysis.collidingModelIds.join(', ')}` : `Overlap: ${analysis.collidingModelIds.join(', ')}`)
              : (french ? 'Aucun contact détecté' : 'No contact detected')}
        </strong>
        <small>
          {collision
            ? <>
                <span data-testid="simulator-movement-contact-type">{collision.contact.classification} · {collision.contact.leftKind} → {collision.contact.rightKind}</span>
                {' · '}<span data-testid="simulator-movement-path-distance">{formatDistance(collision.pathDistance, locale)}</span>
                {' · '}<span data-testid="simulator-movement-segment">{french ? 'segment' : 'segment'} {collision.pathSegmentIndex} · t={collision.segmentT.toFixed(3)}</span>
              </>
            : boardExit
              ? <>
                  <span data-testid="simulator-movement-board-exit">{french ? 'Cause : hors du plateau' : 'Cause: outside board'} · {boardExit.containment.crossedEdges.join(', ')}</span>
                  {' · '}<span data-testid="simulator-movement-path-distance">{formatDistance(boardExit.pathDistance, locale)}</span>
                  {' · '}<span data-testid="simulator-movement-segment">{french ? 'segment' : 'segment'} {boardExit.pathSegmentIndex} · t={boardExit.segmentT.toFixed(3)}</span>
                </>
            : (french ? 'Lecture spatiale du laboratoire — aucun mouvement de partie n’est résolu.' : 'Laboratory spatial readout — no game movement is resolved.')}
        </small>
      </section>

      <section className={`simulator-readout-card ${analysis.coherency?.isCoherent ? 'is-ok' : 'is-alert'}`}>
        <span className="simulator-readout-label">{french ? 'Liens de cohérence (démonstration)' : 'Coherency links (demonstration)'}</span>
        <strong>{analysis.coherency?.isCoherent ? (french ? 'Tous les liens sont présents' : 'All links are present') : (french ? 'Membre isolé détecté' : 'Isolated member detected')}</strong>
        <small>{french ? 'Seuil de laboratoire' : 'Laboratory threshold'} : {formatDistance(LABORATORY_COHERENCY_DISTANCE, locale)} · {analysis.coherency?.incoherentMemberIds.join(', ') || (french ? 'aucun' : 'none')}</small>
      </section>

      <section className={`simulator-readout-card ${analysis.lineOfSight?.visible ? 'is-ok' : 'is-alert'}`}>
        <span className="simulator-readout-label">{french ? 'Ligne de vue 2.5D' : '2.5D line of sight'}</span>
        <strong data-testid="simulator-los-verdict">
          {analysis.lineOfSight
            ? analysis.lineOfSight.visible
              ? (french ? 'Rayon dégagé' : 'Clear ray')
              : (french ? `Bloquée par ${blocker?.blockerId ?? 'un volume'}` : `Blocked by ${blocker?.blockerId ?? 'a volume'}`)
            : (french ? 'Sélectionner une cible de réglette' : 'Select a ruler target')}
        </strong>
        <small>
          {blocker
            ? <>
                <span data-testid="simulator-los-blocker-id">{blocker.blockerId}</span>
                {' · '}<span data-testid="simulator-los-entry">{french ? 'Entrée' : 'Enter'} t={blocker.enterT.toFixed(3)} · {formatPoint(blocker.enterPoint)}</span>
                {' · '}<span data-testid="simulator-los-exit">{french ? 'Sortie' : 'Exit'} t={blocker.exitT.toFixed(3)} · {formatPoint(blocker.exitPoint)}</span>
                {' · '}<span data-testid="simulator-los-band">{blocker.occlusionBandIndex === undefined ? (french ? 'bande intégrale' : 'full volume band') : `${french ? 'bande' : 'band'} ${blocker.occlusionBandIndex}`}</span>
              </>
            : (french ? 'Le trait montre le rayon et, le cas échéant, son premier bloqueur.' : 'The line shows the ray and, when applicable, its first blocker.')}
        </small>
      </section>
    </aside>
  );
}

interface PixiBoardProps {
  readonly models: readonly LaboratoryModel[];
  readonly selectedModelId: string | null;
  readonly rulerTargetId: string | null;
  readonly rulerMode: boolean;
  readonly analysis: LaboratoryAnalysis;
  readonly resetToken: number;
  readonly onSelectModel: (modelId: string) => void;
  readonly onSelectRulerTarget: (modelId: string) => void;
  readonly onMoveModel: (move: LaboratoryMove) => void;
}

function PixiBoard({ models, selectedModelId, rulerTargetId, rulerMode, analysis, resetToken, onSelectModel, onSelectRulerTarget, onMoveModel }: PixiBoardProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<PixiRuntime | null>(null);
  const [camera, setCamera] = useState<Camera>({ zoom: MIN_ZOOM, panX: 36, panY: 36 });
  const cameraRef = useRef(camera);
  const drawRef = useRef<() => void>(() => undefined);
  const dragRef = useRef<DragState | null>(null);
  const pendingMoveRef = useRef<LaboratoryMove | null>(null);
  const moveFrameRef = useRef<number | null>(null);
  const panRef = useRef<{ readonly pointerX: number; readonly pointerY: number; readonly panX: number; readonly panY: number } | null>(null);

  useEffect(() => { cameraRef.current = camera; }, [camera]);

  const eventPoint = useCallback((event: { clientX: number; clientY: number }): Point2 => {
    const bounds = hostRef.current?.getBoundingClientRect();
    return bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : { x: 0, y: 0 };
  }, []);

  const draw = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const { app, Graphics: PixiGraphics } = runtime;
    const currentCamera = cameraRef.current;
    const graphics = new PixiGraphics();
    const boardTopLeft = worldToScreen({ x: 0, y: 0 }, currentCamera);
    const boardBottomRight = worldToScreen({ x: LABORATORY_BOARD.width, y: LABORATORY_BOARD.height }, currentCamera);

    graphics.rect(0, 0, app.screen.width, app.screen.height).fill({ color: 0x101827, alpha: 1 });
    graphics.rect(boardTopLeft.x, boardTopLeft.y, boardBottomRight.x - boardTopLeft.x, boardBottomRight.y - boardTopLeft.y).fill({ color: 0x253846, alpha: 1 });
    for (let x = 0; x <= LABORATORY_BOARD.width; x += GRID_STEP) {
      const start = worldToScreen({ x, y: 0 }, currentCamera);
      const end = worldToScreen({ x, y: LABORATORY_BOARD.height }, currentCamera);
      graphics.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color: 0x8fa8b6, alpha: 0.18, width: 1 });
    }
    for (let y = 0; y <= LABORATORY_BOARD.height; y += GRID_STEP) {
      const start = worldToScreen({ x: 0, y }, currentCamera);
      const end = worldToScreen({ x: LABORATORY_BOARD.width, y }, currentCamera);
      graphics.moveTo(start.x, start.y).lineTo(end.x, end.y).stroke({ color: 0x8fa8b6, alpha: 0.18, width: 1 });
    }
    graphics.rect(boardTopLeft.x, boardTopLeft.y, boardBottomRight.x - boardTopLeft.x, boardBottomRight.y - boardTopLeft.y).stroke({ color: 0xe8d2a4, alpha: 0.8, width: 2 });

    for (const terrain of LABORATORY_TERRAIN) {
      for (const ring of terrainRings(terrain)) {
        const first = worldToScreen(ring[0], currentCamera);
        graphics.moveTo(first.x, first.y);
        for (const vertex of ring.slice(1)) {
          const screenPoint = worldToScreen(vertex, currentCamera);
          graphics.lineTo(screenPoint.x, screenPoint.y);
        }
        graphics.closePath().fill({ color: 0x5e536f, alpha: 0.78 }).stroke({ color: 0xc6aedb, alpha: 0.95, width: 2 });
      }
    }

    if (analysis.coherency) {
      for (const member of analysis.coherency.members) {
        for (const neighbourId of member.neighbourIds.filter((id) => id > member.id)) {
          const source = models.find((model) => model.id === member.id);
          const target = models.find((model) => model.id === neighbourId);
          if (!source || !target) continue;
          const from = worldToScreen(source.position, currentCamera);
          const to = worldToScreen(target.position, currentCamera);
          graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0x69d2c6, alpha: 0.56, width: 2 });
        }
      }
    }

    if (analysis.lineOfSight) {
      const from = worldToScreen(analysis.lineOfSight.ray.from, currentCamera);
      const to = worldToScreen(analysis.lineOfSight.ray.to, currentCamera);
      graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: analysis.lineOfSight.visible ? 0x8ce99a : 0xff7b72, alpha: 0.95, width: 3 });
      if (analysis.lineOfSight.firstBlocker) {
        const contact = worldToScreen(analysis.lineOfSight.firstBlocker.enterPoint, currentCamera);
        graphics.circle(contact.x, contact.y, 7).fill({ color: 0xff7b72, alpha: 1 });
      }
    }

    if (analysis.rulerDistance !== undefined && analysis.selectedModel && analysis.rulerTarget) {
      const from = worldToScreen(analysis.selectedModel.position, currentCamera);
      const to = worldToScreen(analysis.rulerTarget.position, currentCamera);
      graphics.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: 0xffdc78, alpha: 0.95, width: 1.5 });
    }

    for (const model of models) {
      const point = worldToScreen(model.position, currentCamera);
      const radius = Math.max(5, model.radius * currentCamera.zoom);
      const isSelected = model.id === selectedModelId;
      const isTarget = model.id === rulerTargetId;
      const isColliding = analysis.collidingModelIds.includes(model.id) || (isSelected && analysis.movementVerdict?.allowed === false);
      const fill = model.unitId === 'amber' ? 0xe3a645 : 0x6ca8dd;
      graphics.circle(point.x, point.y, radius).fill({ color: fill, alpha: 0.97 }).stroke({ color: isColliding ? 0xff6b6b : 0x14222d, width: 2 });
      if (isSelected || isTarget) {
        graphics.circle(point.x, point.y, radius + (isSelected ? 7 : 4)).stroke({ color: isSelected ? 0xffffff : 0xffdc78, alpha: 0.95, width: isSelected ? 3 : 2 });
      }
      if (analysis.coherency?.incoherentMemberIds.includes(model.id)) {
        graphics.circle(point.x, point.y, radius + 3).stroke({ color: 0xff7b72, alpha: 0.95, width: 2 });
      }
    }

    if (analysis.movementVerdict?.firstCollision) {
      const point = worldToScreen(analysis.movementVerdict.firstCollision.contactCenter, currentCamera);
      graphics.moveTo(point.x - 8, point.y - 8).lineTo(point.x + 8, point.y + 8).stroke({ color: 0xff7b72, width: 3 });
      graphics.moveTo(point.x + 8, point.y - 8).lineTo(point.x - 8, point.y + 8).stroke({ color: 0xff7b72, width: 3 });
    }

    const previous = app.stage.removeChildren();
    for (const child of previous) child.destroy();
    app.stage.addChild(graphics);
    app.render();
  }, [analysis, models, rulerTargetId, selectedModelId]);

  drawRef.current = draw;

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    const resizeObserver = new ResizeObserver(() => {
      if (!host) return;
      setCamera(fitCamera(host.clientWidth, host.clientHeight));
      requestAnimationFrame(() => drawRef.current());
    });
    if (!host) return undefined;
    void (async () => {
      const { Application: PixiApplication, Graphics: PixiGraphics } = await import('pixi.js');
      const app = new PixiApplication();
      await app.init({
        resizeTo: host,
        autoStart: false,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        preference: 'webgl'
      });
      if (disposed) {
        app.destroy(true);
        return;
      }
      app.canvas.setAttribute('aria-hidden', 'true');
      host.prepend(app.canvas);
      runtimeRef.current = { app, Graphics: PixiGraphics };
      setCamera(fitCamera(host.clientWidth, host.clientHeight));
      resizeObserver.observe(host);
      requestAnimationFrame(() => drawRef.current());
    })();
    return () => {
      disposed = true;
      resizeObserver.disconnect();
      if (moveFrameRef.current !== null) cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = null;
      pendingMoveRef.current = null;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      runtime?.app.destroy(true);
    };
  }, []);

  useEffect(() => { draw(); }, [draw, camera]);

  useEffect(() => {
    const host = hostRef.current;
    if (host) setCamera(fitCamera(host.clientWidth, host.clientHeight));
  }, [resetToken]);

  const hitModel = (worldPoint: Point2): LaboratoryModel | undefined => models
    .slice()
    .reverse()
    .find((model) => Math.hypot(model.position.x - worldPoint.x, model.position.y - worldPoint.y) <= model.radius);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const screenPoint = eventPoint(event);
    const worldPoint = screenToWorld(screenPoint, cameraRef.current);
    const hit = hitModel(worldPoint);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit && rulerMode && hit.id !== selectedModelId) {
      onSelectRulerTarget(hit.id);
      return;
    }
    if (hit && event.button === 0) {
      onSelectModel(hit.id);
      dragRef.current = { modelId: hit.id, from: hit.position };
      return;
    }
    panRef.current = { pointerX: screenPoint.x, pointerY: screenPoint.y, panX: cameraRef.current.panX, panY: cameraRef.current.panY };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const screenPoint = eventPoint(event);
    const drag = dragRef.current;
    if (drag) {
      const worldPoint = screenToWorld(screenPoint, cameraRef.current);
      pendingMoveRef.current = { modelId: drag.modelId, from: drag.from, to: worldPoint };
      if (moveFrameRef.current === null) {
        moveFrameRef.current = requestAnimationFrame(() => {
          moveFrameRef.current = null;
          const pendingMove = pendingMoveRef.current;
          pendingMoveRef.current = null;
          if (pendingMove) onMoveModel(pendingMove);
        });
      }
      return;
    }
    const pan = panRef.current;
    if (pan) {
      setCamera((current) => ({ ...current, panX: pan.panX + screenPoint.x - pan.pointerX, panY: pan.panY + screenPoint.y - pan.pointerY }));
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (moveFrameRef.current !== null) cancelAnimationFrame(moveFrameRef.current);
    moveFrameRef.current = null;
    pendingMoveRef.current = null;
    if (drag && event.type !== 'pointercancel') {
      onMoveModel({
        modelId: drag.modelId,
        from: drag.from,
        to: screenToWorld(eventPoint(event), cameraRef.current)
      });
    }
    dragRef.current = null;
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const cursor = eventPoint(event);
    setCamera((current) => {
      const world = screenToWorld(cursor, current);
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * (event.deltaY > 0 ? 0.9 : 1.1)));
      return { zoom, panX: cursor.x - world.x * zoom, panY: cursor.y - world.y * zoom };
    });
  };

  return (
    <div
      ref={hostRef}
      className={`simulator-pixi-board ${rulerMode ? 'is-ruler-mode' : ''}`}
      data-testid="simulator-board"
      role="application"
      aria-label="Warforge geometry laboratory board"
      data-camera-zoom={camera.zoom.toFixed(4)}
      data-camera-pan={`${Math.round(camera.panX)},${Math.round(camera.panY)}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={handleWheel}
    >
      <div className="simulator-board-corner simulator-board-corner-top">60″ × 44″ · 0.1 mm units</div>
      <div className="simulator-board-corner simulator-board-corner-bottom">WebGL / PixiJS 8 · {rulerMode ? 'Ruler target mode' : 'Pan · zoom · drag'}</div>
      <div className="simulator-board-camera" aria-live="polite">
        <span data-testid="simulator-camera-zoom">{camera.zoom.toFixed(4)}×</span>
        <span data-testid="simulator-camera-pan">x={Math.round(camera.panX)} px · y={Math.round(camera.panY)} px</span>
      </div>
    </div>
  );
}

function LaboratoryPage({ locale }: SimulatorPageProps): React.JSX.Element {
  const french = isFrench(locale);
  const [models, setModels] = useState<readonly LaboratoryModel[]>(LABORATORY_MODELS);
  const [selectedModelId, setSelectedModelId] = useState<string | null>('amber-1');
  const [rulerTargetId, setRulerTargetId] = useState<string | null>('cobalt-1');
  const [rulerMode, setRulerMode] = useState(false);
  const [lastMove, setLastMove] = useState<LaboratoryMove | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const analysis = useMemo(
    () => inspectLaboratory(models, selectedModelId, rulerTargetId, lastMove),
    [lastMove, models, rulerTargetId, selectedModelId]
  );

  const handleMove = useCallback((move: LaboratoryMove) => {
    const roundedMove = { ...move, to: { x: Math.round(move.to.x), y: Math.round(move.to.y) } };
    setModels((current) => updateModelPosition(current, roundedMove.modelId, roundedMove.to));
    setLastMove(roundedMove);
  }, []);

  const resetLaboratory = (): void => {
    setModels(LABORATORY_MODELS);
    setSelectedModelId('amber-1');
    setRulerTargetId('cobalt-1');
    setLastMove(null);
    setRulerMode(false);
    setResetToken((current) => current + 1);
  };

  return (
    <main className="simulator-lab-page">
      <header className="simulator-lab-hero">
        <div>
          <span className="simulator-kicker">WARFORGE · {french ? 'FONDATION TECHNIQUE' : 'TECHNICAL FOUNDATION'}</span>
          <h1>{french ? 'Laboratoire de géométrie tactique' : 'Tactical geometry laboratory'}</h1>
          <p>
            {french
              ? 'Plateau de démonstration déterministe : caméra, empreintes circulaires, réglette, volume balayé, cohérence et ligne de vue.'
              : 'A deterministic demonstration board: camera, circular footprints, ruler, swept volume, coherency and line of sight.'}
          </p>
        </div>
        <div className="simulator-foundation-notice" role="status">
          <strong>{french ? 'Fondation M2 — pas une partie jouable' : 'M2 foundation — not a playable game'}</strong>
          <span>{french ? 'Aucune phase, règle de faction, tir, score ou sauvegarde n’est encore couvert.' : 'No phases, faction rules, shooting, scoring, or saves are covered yet.'}</span>
        </div>
      </header>

      <section className="simulator-lab-toolbar" aria-label={french ? 'Outils du laboratoire' : 'Laboratory tools'}>
        <div className="simulator-toolbar-instruction">
          <strong>{rulerMode ? (french ? 'Réglette active' : 'Ruler active') : (french ? 'Manipulation active' : 'Manipulation active')}</strong>
          <span>{rulerMode ? (french ? 'Cliquez une autre figurine pour mesurer et tester la ligne de vue.' : 'Click another model to measure and test line of sight.') : (french ? 'Glissez une figurine. Glissez le plateau vide pour déplacer la caméra.' : 'Drag a model. Drag empty board space to pan the camera.')}</span>
        </div>
        <div className="simulator-toolbar-actions">
          <button type="button" className={rulerMode ? 'active' : ''} onClick={() => setRulerMode((current) => !current)} aria-pressed={rulerMode}>
            {rulerMode ? (french ? 'Quitter la réglette' : 'Exit ruler') : (french ? 'Choisir une cible de réglette' : 'Choose ruler target')}
          </button>
          <button type="button" className="secondary" onClick={() => setResetToken((current) => current + 1)}>{french ? 'Centrer le plateau' : 'Center board'}</button>
          <button type="button" className="secondary" onClick={resetLaboratory}>{french ? 'Réinitialiser le laboratoire' : 'Reset laboratory'}</button>
        </div>
      </section>

      <section className="simulator-lab-workspace">
        <PixiBoard
          models={models}
          selectedModelId={selectedModelId}
          rulerTargetId={rulerTargetId}
          rulerMode={rulerMode}
          analysis={analysis}
          resetToken={resetToken}
          onSelectModel={(modelId) => { setSelectedModelId(modelId); setLastMove(null); }}
          onSelectRulerTarget={(modelId) => { setRulerTargetId(modelId); setRulerMode(false); }}
          onMoveModel={handleMove}
        />
        <LabStatus analysis={analysis} locale={locale} />
      </section>

      <section className="simulator-lab-notes" aria-label={french ? 'Limites du laboratoire' : 'Laboratory limitations'}>
        <h2>{french ? 'Ce que cette vue vérifie' : 'What this view verifies'}</h2>
        <p>{french ? 'Tous les calculs utilisent les exports de géométrie purs et des unités monde entières. Les lignes et marqueurs expliquent le résultat affiché ; ils ne valident pas encore une action de jeu.' : 'Every calculation uses pure geometry exports and integer world units. Lines and markers explain the displayed result; they do not yet validate a game action.'}</p>
      </section>
    </main>
  );
}

/** M2 stays a laboratory and M3 an isolated fixture beside the real-roster pilot. */
export default function SimulatorPage({ locale }: SimulatorPageProps): React.JSX.Element {
  const [mode, setMode] = useState<'interactive' | 'poc' | 'm4' | 'duel' | 'laboratory'>('interactive');
  return <>
    <nav className="simulator-mode-tabs" aria-label="Modes du simulateur">
      <button type="button" className={mode === 'interactive' ? 'active' : ''} aria-pressed={mode === 'interactive'} onClick={() => setMode('interactive')}>POC interactif M10</button>
      <button type="button" className={mode === 'poc' ? 'active' : ''} aria-pressed={mode === 'poc'} onClick={() => setMode('poc')}>POC technique M9</button>
      <button type="button" className={mode === 'm4' ? 'active' : ''} aria-pressed={mode === 'm4'} onClick={() => setMode('m4')}>Duel réel M4</button>
      <button type="button" className={mode === 'duel' ? 'active' : ''} aria-pressed={mode === 'duel'} onClick={() => setMode('duel')}>Duel fermé M3</button>
      <button type="button" className={mode === 'laboratory' ? 'active' : ''} aria-pressed={mode === 'laboratory'} onClick={() => setMode('laboratory')}>Laboratoire M2</button>
    </nav>
    {mode === 'interactive' ? <InteractivePocPage /> : mode === 'poc' ? <CorePocTechnicalPage /> : mode === 'm4' ? <M4RealRosterDuelPage /> : mode === 'duel' ? <ClosedDuelPage /> : <LaboratoryPage locale={locale} />}
  </>;
}
