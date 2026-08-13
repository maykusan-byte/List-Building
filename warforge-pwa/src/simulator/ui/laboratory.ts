import {
  WORLD_UNITS_PER_INCH,
  checkUnitCoherency,
  circleIntersectsCircle,
  distanceBetweenPoints,
  evaluateLineOfSight,
  evaluateMovement,
  footprintDistance
} from '../geometry';
import type { CircleFootprint, MovementVerdict, Point2, TerrainBlocker } from '../geometry';

/**
 * The spatial laboratory uses integer world positions only. It is deliberately
 * separate from a GameState: these fixtures demonstrate predicates and do not
 * create a playable, rules-covered session.
 */
export interface LaboratoryModel {
  readonly id: string;
  readonly label: string;
  readonly unitId: 'amber' | 'cobalt';
  readonly position: Point2;
  readonly radius: number;
  readonly height: number;
}

export interface LaboratoryMove {
  readonly modelId: string;
  readonly from: Point2;
  readonly to: Point2;
}

export interface LaboratoryAnalysis {
  readonly selectedModel: LaboratoryModel | undefined;
  readonly rulerTarget: LaboratoryModel | undefined;
  readonly rulerDistance: number | undefined;
  readonly centerDistance: number | undefined;
  readonly collidingModelIds: readonly string[];
  /** Generic movement verdict; the lab models happen to use circular profiles. */
  readonly movementVerdict: MovementVerdict | undefined;
  readonly coherency: ReturnType<typeof checkUnitCoherency> | undefined;
  readonly lineOfSight: ReturnType<typeof evaluateLineOfSight> | undefined;
}

export const LABORATORY_BOARD = {
  width: 60 * WORLD_UNITS_PER_INCH,
  height: 44 * WORLD_UNITS_PER_INCH
} as const;

/** A visible calibration threshold, not a supported game-rule assertion. */
export const LABORATORY_COHERENCY_DISTANCE = 2 * WORLD_UNITS_PER_INCH;

export const LABORATORY_TERRAIN: readonly TerrainBlocker[] = [
  {
    id: 'ruin-amber',
    footprint: {
      polygons: [{
        outer: [
          { x: 5_000, y: 3_600 },
          { x: 7_200, y: 3_600 },
          { x: 7_700, y: 5_400 },
          { x: 5_300, y: 5_700 }
        ]
      }]
    },
    minZ: 0,
    maxZ: 1_000,
    occlusionBands: [{ minZ: 0, maxZ: 1_000 }]
  },
  {
    id: 'ruin-cobalt',
    footprint: {
      kind: 'convex-polygon',
      vertices: [
        { x: 9_000, y: 7_100 },
        { x: 11_200, y: 7_400 },
        { x: 10_700, y: 9_000 },
        { x: 8_700, y: 8_700 }
      ]
    },
    minZ: 0,
    maxZ: 750
  }
];

export const LABORATORY_MODELS: readonly LaboratoryModel[] = [
  { id: 'amber-1', label: 'Ambre 1', unitId: 'amber', position: { x: 2_900, y: 4_800 }, radius: 380, height: 600 },
  { id: 'amber-2', label: 'Ambre 2', unitId: 'amber', position: { x: 3_900, y: 5_100 }, radius: 380, height: 600 },
  { id: 'amber-3', label: 'Ambre 3', unitId: 'amber', position: { x: 3_100, y: 6_100 }, radius: 380, height: 600 },
  { id: 'cobalt-1', label: 'Cobalt 1', unitId: 'cobalt', position: { x: 11_500, y: 4_800 }, radius: 380, height: 600 },
  { id: 'cobalt-2', label: 'Cobalt 2', unitId: 'cobalt', position: { x: 12_500, y: 5_150 }, radius: 380, height: 600 },
  { id: 'cobalt-3', label: 'Cobalt 3', unitId: 'cobalt', position: { x: 11_700, y: 6_150 }, radius: 380, height: 600 }
];

function footprintFor(model: LaboratoryModel): CircleFootprint {
  return { kind: 'circle', center: model.position, radius: model.radius };
}

export function inchesFromWorldUnits(value: number): number {
  return value / WORLD_UNITS_PER_INCH;
}

export function inspectLaboratory(
  models: readonly LaboratoryModel[],
  selectedModelId: string | null,
  rulerTargetId: string | null,
  lastMove: LaboratoryMove | null
): LaboratoryAnalysis {
  const selectedModel = models.find((model) => model.id === selectedModelId);
  const rulerTarget = models.find((model) => model.id === rulerTargetId);
  const selectedFootprint = selectedModel && footprintFor(selectedModel);
  const targetFootprint = rulerTarget && footprintFor(rulerTarget);
  const rulerDistance = selectedFootprint && targetFootprint && selectedModel?.id !== rulerTarget?.id
    ? footprintDistance(selectedFootprint, targetFootprint)
    : undefined;
  const centerDistance = selectedModel && rulerTarget && selectedModel.id !== rulerTarget.id
    ? distanceBetweenPoints(selectedModel.position, rulerTarget.position)
    : undefined;
  const collidingModelIds = selectedModel
    ? models
      .filter((model) => model.id !== selectedModel.id && circleIntersectsCircle(footprintFor(selectedModel), footprintFor(model)))
      .map((model) => model.id)
    : [];
  const selectedUnit = selectedModel ? models.filter((model) => model.unitId === selectedModel.unitId) : [];
  const coherency = selectedUnit.length > 0
    ? checkUnitCoherency(selectedUnit.map((model) => ({ id: model.id, footprint: footprintFor(model) })), LABORATORY_COHERENCY_DISTANCE)
    : undefined;
  const movementVerdict = selectedModel && lastMove?.modelId === selectedModel.id
    ? evaluateMovement(
      { kind: 'circle', center: lastMove.from, radius: selectedModel.radius },
      [{ position: lastMove.from }, { position: lastMove.to }],
      models
        .filter((model) => model.id !== selectedModel.id)
        .map((model) => ({ id: model.id, footprint: footprintFor(model) })),
      {
        board: {
          minX: 0,
          minY: 0,
          maxX: LABORATORY_BOARD.width,
          maxY: LABORATORY_BOARD.height
        }
      }
    )
    : undefined;
  const lineOfSight = selectedModel && rulerTarget && selectedModel.id !== rulerTarget.id
    ? evaluateLineOfSight(
      {
        from: { ...selectedModel.position, z: selectedModel.height },
        to: { ...rulerTarget.position, z: rulerTarget.height }
      },
      LABORATORY_TERRAIN
    )
    : undefined;

  return {
    selectedModel,
    rulerTarget,
    rulerDistance,
    centerDistance,
    collidingModelIds,
    movementVerdict,
    coherency,
    lineOfSight
  };
}
