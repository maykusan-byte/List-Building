import {
  EVENT_COMPANION_BATTLE_READY_SOURCE,
  EVENT_COMPANION_CUMULATIVE_OR_SOURCE,
  EVENT_COMPANION_GAME_END_SOURCE,
  EVENT_COMPANION_SCORING_LIMITS_SOURCE,
  GDM_ASSASSINATION_FIXED_SOURCE,
  GDM_ENGAGE_FIXED_SOURCE,
  GDM_OUTMANOEUVRE_SOURCE
} from '../rules/m9-source-references';
import {
  MISSION_SCORING_V1_SCHEMA_VERSION,
  type GameState,
  type MissionFinalResultV1,
  type MissionObjectiveRoleV1,
  type MissionScoreBreakdownV1,
  type MissionScoreEventV1,
  type MissionScoringCheckpointV1,
  type MissionScoringEvidenceV1,
  type MissionTableQuarterV1,
  type SourceReferenceV1
} from './types';

export const CLOSED_MISSION_SCORING_PROFILE_ID = 'closed-complete-game-disruption-v1' as const;

const OBJECTIVE_ROLES: readonly MissionObjectiveRoleV1[] = [
  'attacker-home', 'defender-home', 'no-mans-land-1', 'no-mans-land-2', 'centre-1', 'centre-2'
];
const QUARTERS: readonly MissionTableQuarterV1[] = ['bottom-left', 'bottom-right', 'top-left', 'top-right'];
const PRIMARY_MAX = 45;
const PRIMARY_ROUND_MAX = 15;
const SECONDARY_MAX = 45;
const SECONDARY_ROUND_MAX = 15;
const FIXED_SECONDARY_MAX = 20;
const BATTLE_READY_VP = 10;

export interface MissionScoringCalculationV1 {
  readonly checkpointId: string;
  readonly checkpoint: MissionScoringCheckpointV1;
  readonly scoreEvents: readonly MissionScoreEventV1[];
  readonly finalResult: MissionFinalResultV1 | null;
  readonly scoreBreakdownByPlayerId: Readonly<Record<string, MissionScoreBreakdownV1>>;
  readonly scoresByPlayerId: Readonly<Record<string, number>>;
  readonly scoredAssassinationModelIds: readonly string[];
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneBreakdown(value: MissionScoreBreakdownV1): MissionScoreBreakdownV1 {
  return {
    ...value,
    fixedSecondaryVpById: { ...value.fixedSecondaryVpById },
    primaryVpByBattleRound: { ...value.primaryVpByBattleRound },
    secondaryVpByBattleRound: { ...value.secondaryVpByBattleRound }
  };
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer.`);
}

export function missionScoringCheckpointV1(state: GameState): MissionScoringCheckpointV1 {
  const battle = state.battle;
  const mission = state.mission;
  if (!battle || battle.lifecycle !== 'in-progress' || battle.activePlayerId === null
    || mission?.scoringProfileId !== CLOSED_MISSION_SCORING_PROFILE_ID || mission.lifecycle !== 'in-progress') {
    throw new RangeError('No executable mission-scoring profile is active.');
  }
  if (battle.phase === 'command' && state.commandPhase?.stage === 'complete') return 'end-of-own-command-phase';
  if (battle.phase === 'fight' && state.fightPhase?.stage === 'complete') return 'end-of-own-turn';
  throw new RangeError('Mission scoring is outside a covered checkpoint.');
}

export function missionScoringCheckpointIdV1(
  battleRound: number,
  turnNumber: number,
  checkpoint: MissionScoringCheckpointV1
): string {
  return `round-${battleRound}:turn-${turnNumber}:${checkpoint}`;
}

export function missionScoringSourceRefsV1(): readonly SourceReferenceV1[] {
  return [
    GDM_OUTMANOEUVRE_SOURCE,
    GDM_ASSASSINATION_FIXED_SOURCE,
    GDM_ENGAGE_FIXED_SOURCE,
    EVENT_COMPANION_SCORING_LIMITS_SOURCE,
    EVENT_COMPANION_BATTLE_READY_SOURCE,
    EVENT_COMPANION_GAME_END_SOURCE,
    EVENT_COMPANION_CUMULATIVE_OR_SOURCE
  ];
}

function validateEvidence(state: GameState, checkpoint: MissionScoringCheckpointV1, evidence: MissionScoringEvidenceV1): void {
  const battle = state.battle!;
  const mission = state.mission!;
  if (evidence.schemaVersion !== MISSION_SCORING_V1_SCHEMA_VERSION) throw new RangeError('Mission-scoring evidence schema is unsupported.');
  const objectiveIds = [...mission.objectiveMarkerIds].sort((left, right) => left.localeCompare(right));
  const roleIds = Object.keys(evidence.objectiveRoleById).sort((left, right) => left.localeCompare(right));
  const roles = Object.values(evidence.objectiveRoleById).sort((left, right) => left.localeCompare(right));
  if (!sameJson(roleIds, objectiveIds) || !sameJson(roles, [...OBJECTIVE_ROLES].sort((left, right) => left.localeCompare(right)))) {
    throw new RangeError('The closed mission requires exactly one objective for each canonical role.');
  }
  if (mission.objectiveRoleById === undefined
    || objectiveIds.some((objectiveId) => evidence.objectiveRoleById[objectiveId] !== mission.objectiveRoleById![objectiveId])) {
    throw new RangeError('Mission-scoring objective roles do not match the compiled session.');
  }
  const objectiveBoundary = checkpoint === 'end-of-own-command-phase' ? 'phase-end' : 'turn-end';
  for (const objectiveId of objectiveIds) {
    const latest = mission.latestObjectiveControlById[objectiveId];
    if (!latest || latest.checkpoint.battleRound !== battle.battleRound || latest.checkpoint.turnNumber !== battle.turnNumber
      || latest.checkpoint.phase !== battle.phase || latest.checkpoint.boundary !== objectiveBoundary) {
      throw new RangeError(`Objective ${objectiveId} has not been resolved at the scoring checkpoint.`);
    }
  }
  for (const [unitId, quarter] of Object.entries(evidence.engageQuarterByUnitId)) {
    const unit = state.units[unitId];
    if (!QUARTERS.includes(quarter) || !unit || !battle.deployedUnitIds.includes(unitId) || !unit.models.some((model) => model.active)
      || unit.keywords.includes('AIRCRAFT') || state.battleResources?.battleShockedUnitIds.includes(unitId)) {
      throw new RangeError(`Engage evidence references ineligible unit ${unitId}.`);
    }
  }
  const isFinal = checkpoint === 'end-of-own-turn' && battle.battleRound === 5 && battle.turnNumber === 2;
  if (isFinal) {
    const readiness = evidence.battleReadyByPlayerId;
    if (readiness === null || !sameJson(Object.keys(readiness), [...battle.playerIds])
      || Object.values(readiness).some((value) => typeof value !== 'boolean')) {
      throw new RangeError('The final scoring checkpoint requires one Battle Ready verdict per player.');
    }
  } else if (evidence.battleReadyByPlayerId !== null) {
    throw new RangeError('Battle Ready evidence is accepted only at the final scoring checkpoint.');
  }
}

function roleForPlayerHome(state: GameState, playerId: string): MissionObjectiveRoleV1 {
  return playerId === state.battle!.attackerPlayerId ? 'attacker-home' : 'defender-home';
}

export function calculateMissionScoringV1(state: GameState, evidence: MissionScoringEvidenceV1): MissionScoringCalculationV1 {
  const checkpoint = missionScoringCheckpointV1(state);
  validateEvidence(state, checkpoint, evidence);
  const battle = state.battle!;
  const mission = state.mission!;
  const checkpointId = missionScoringCheckpointIdV1(battle.battleRound, battle.turnNumber, checkpoint);
  if (mission.scoredCheckpointIds?.includes(checkpointId)) throw new RangeError(`Scoring checkpoint ${checkpointId} was already resolved.`);
  if (!mission.scoreBreakdownByPlayerId || !mission.scoredAssassinationModelIds) {
    throw new RangeError('The executable mission-scoring state is incomplete.');
  }

  const breakdowns: Record<string, MissionScoreBreakdownV1> = Object.fromEntries(battle.playerIds.map((playerId) => {
    const breakdown = mission.scoreBreakdownByPlayerId![playerId];
    if (!breakdown) throw new RangeError(`Mission score breakdown is missing for player ${playerId}.`);
    return [playerId, cloneBreakdown(breakdown)];
  }));
  const scoreEvents: MissionScoreEventV1[] = [];
  const roundKey = String(battle.battleRound);

  const addAward = (
    playerId: string,
    category: MissionScoreEventV1['category'],
    cardId: MissionScoreEventV1['cardId'],
    scoringWindowId: string,
    rawVp: number,
    awardEvidence: MissionScoreEventV1['evidence'],
    sourceRefs: readonly SourceReferenceV1[]
  ): void => {
    assertNonNegativeInteger(rawVp, `${scoringWindowId}.rawVp`);
    let breakdown = breakdowns[playerId]!;
    const categoryRemainingBefore = category === 'primary'
      ? PRIMARY_MAX - breakdown.primaryVp
      : category === 'secondary' ? SECONDARY_MAX - breakdown.secondaryVp : BATTLE_READY_VP - breakdown.battleReadyVp;
    const battleRoundRemainingBefore = category === 'primary'
      ? PRIMARY_ROUND_MAX - (breakdown.primaryVpByBattleRound[roundKey] ?? 0)
      : category === 'secondary' ? SECONDARY_ROUND_MAX - (breakdown.secondaryVpByBattleRound[roundKey] ?? 0) : null;
    const fixedSecondaryRemainingBefore = cardId === 'assassination' || cardId === 'engage-on-all-fronts'
      ? FIXED_SECONDARY_MAX - breakdown.fixedSecondaryVpById[cardId]
      : null;
    const appliedVp = Math.max(0, Math.min(
      rawVp,
      categoryRemainingBefore,
      battleRoundRemainingBefore ?? Number.POSITIVE_INFINITY,
      fixedSecondaryRemainingBefore ?? Number.POSITIVE_INFINITY
    ));
    const event: MissionScoreEventV1 = {
      id: `${checkpointId}:${playerId}:${scoringWindowId}`,
      playerId,
      battleRound: battle.battleRound,
      turnNumber: battle.turnNumber,
      checkpoint,
      category,
      cardId,
      scoringWindowId,
      rawVp,
      appliedVp,
      caps: { categoryRemainingBefore, battleRoundRemainingBefore, fixedSecondaryRemainingBefore },
      evidence: awardEvidence,
      sourceRefs
    };
    scoreEvents.push(event);
    if (category === 'primary') breakdown = {
      ...breakdown,
      primaryVp: breakdown.primaryVp + appliedVp,
      primaryVpByBattleRound: { ...breakdown.primaryVpByBattleRound, [roundKey]: (breakdown.primaryVpByBattleRound[roundKey] ?? 0) + appliedVp },
      totalVp: breakdown.totalVp + appliedVp
    };
    else if (category === 'secondary') breakdown = {
      ...breakdown,
      secondaryVp: breakdown.secondaryVp + appliedVp,
      fixedSecondaryVpById: { ...breakdown.fixedSecondaryVpById, [cardId]: breakdown.fixedSecondaryVpById[cardId as 'assassination' | 'engage-on-all-fronts'] + appliedVp },
      secondaryVpByBattleRound: { ...breakdown.secondaryVpByBattleRound, [roundKey]: (breakdown.secondaryVpByBattleRound[roundKey] ?? 0) + appliedVp },
      totalVp: breakdown.totalVp + appliedVp
    };
    else breakdown = { ...breakdown, battleReadyVp: breakdown.battleReadyVp + appliedVp, totalVp: breakdown.totalVp + appliedVp };
    breakdowns[playerId] = breakdown;
  };

  const activePlayerId = battle.activePlayerId!;
  const controlledObjectiveIds = Object.entries(mission.objectiveControllers)
    .filter(([, controllerPlayerId]) => controllerPlayerId === activePlayerId)
    .map(([objectiveId]) => objectiveId)
    .sort((left, right) => left.localeCompare(right));
  const ownHomeRole = roleForPlayerHome(state, activePlayerId);
  const opponentHomeRole = ownHomeRole === 'attacker-home' ? 'defender-home' : 'attacker-home';
  const controlledNonHomeIds = controlledObjectiveIds.filter((objectiveId) => evidence.objectiveRoleById[objectiveId] !== ownHomeRole);
  const controlledOpponentHomeIds = controlledObjectiveIds.filter((objectiveId) => evidence.objectiveRoleById[objectiveId] === opponentHomeRole);

  if (checkpoint === 'end-of-own-command-phase' && [2, 3].includes(battle.battleRound)) {
    addAward(activePlayerId, 'primary', 'outmanoeuvre', 'rounds-2-3-non-home-objectives', controlledNonHomeIds.length * 5,
      { controlledObjectiveIds: controlledNonHomeIds }, [GDM_OUTMANOEUVRE_SOURCE, EVENT_COMPANION_SCORING_LIMITS_SOURCE]);
  }
  if (checkpoint === 'end-of-own-turn') {
    addAward(activePlayerId, 'primary', 'outmanoeuvre', 'control-opponent-home', controlledOpponentHomeIds.length > 0 ? 10 : 0,
      { controlledObjectiveIds: controlledOpponentHomeIds }, [GDM_OUTMANOEUVRE_SOURCE, EVENT_COMPANION_SCORING_LIMITS_SOURCE]);
    if (battle.battleRound === 1) addAward(activePlayerId, 'primary', 'outmanoeuvre', 'round-1-non-home-objectives', controlledNonHomeIds.length * 4,
      { controlledObjectiveIds: controlledNonHomeIds }, [GDM_OUTMANOEUVRE_SOURCE, EVENT_COMPANION_SCORING_LIMITS_SOURCE]);
    if ([4, 5].includes(battle.battleRound)) addAward(activePlayerId, 'primary', 'outmanoeuvre', 'rounds-4-5-non-home-objectives', controlledNonHomeIds.length * 6,
      { controlledObjectiveIds: controlledNonHomeIds }, [GDM_OUTMANOEUVRE_SOURCE, EVENT_COMPANION_SCORING_LIMITS_SOURCE]);

    const previouslyScored = new Set(mission.scoredAssassinationModelIds);
    for (const scorerPlayerId of [...battle.playerIds].sort((left, right) => left.localeCompare(right))) {
      const destroyed = Object.values(state.units)
        .filter((unit) => unit.playerId !== scorerPlayerId && unit.keywords.includes('CHARACTER'))
        .flatMap((unit) => unit.models.filter((model) => !model.active && !previouslyScored.has(model.id)).map((model) => ({ model, unit })))
        .sort((left, right) => left.model.id.localeCompare(right.model.id));
      for (const { model, unit } of destroyed) {
        const rawVp = 3 + (unit.woundsPerModel >= 4 ? 1 : 0);
        addAward(scorerPlayerId, 'secondary', 'assassination', `destroyed-enemy-character:${model.id}`, rawVp,
          { destroyedCharacterModelIds: [model.id] },
          [GDM_ASSASSINATION_FIXED_SOURCE, EVENT_COMPANION_CUMULATIVE_OR_SOURCE, EVENT_COMPANION_SCORING_LIMITS_SOURCE]);
        previouslyScored.add(model.id);
      }
    }

    const eligibleUnitIdsByQuarter: Partial<Record<MissionTableQuarterV1, string[]>> = {};
    for (const [unitId, quarter] of Object.entries(evidence.engageQuarterByUnitId)) {
      if (state.units[unitId]!.playerId !== activePlayerId) continue;
      (eligibleUnitIdsByQuarter[quarter] ??= []).push(unitId);
    }
    for (const unitIds of Object.values(eligibleUnitIdsByQuarter)) unitIds.sort((left, right) => left.localeCompare(right));
    const quarterCount = Object.keys(eligibleUnitIdsByQuarter).length;
    addAward(activePlayerId, 'secondary', 'engage-on-all-fronts', 'eligible-table-quarters', quarterCount === 4 ? 4 : quarterCount === 3 ? 2 : 0,
      { eligibleUnitIdsByQuarter }, [GDM_ENGAGE_FIXED_SOURCE, EVENT_COMPANION_CUMULATIVE_OR_SOURCE, EVENT_COMPANION_SCORING_LIMITS_SOURCE]);

    if (battle.battleRound === 5 && battle.turnNumber === 2) {
      for (const playerId of battle.playerIds) addAward(playerId, 'battle-ready', 'battle-ready-army', 'battle-ready-army',
        evidence.battleReadyByPlayerId![playerId] ? BATTLE_READY_VP : 0,
        { battleReady: evidence.battleReadyByPlayerId![playerId] }, [EVENT_COMPANION_BATTLE_READY_SOURCE]);
    }
  }

  const scoresByPlayerId = Object.fromEntries(battle.playerIds.map((playerId) => [playerId, breakdowns[playerId]!.totalVp]));
  let finalResult: MissionFinalResultV1 | null = null;
  if (checkpoint === 'end-of-own-turn' && battle.battleRound === 5 && battle.turnNumber === 2) {
    const [firstPlayerId, secondPlayerId] = battle.playerIds;
    const firstScore = scoresByPlayerId[firstPlayerId] ?? 0;
    const secondScore = scoresByPlayerId[secondPlayerId] ?? 0;
    const draw = firstScore === secondScore;
    finalResult = {
      battleRound: 5,
      scoresByPlayerId,
      outcome: draw ? 'draw' : 'winner',
      winnerPlayerId: draw ? null : firstScore > secondScore ? firstPlayerId : secondPlayerId,
      sourceRefs: [EVENT_COMPANION_GAME_END_SOURCE, EVENT_COMPANION_SCORING_LIMITS_SOURCE, EVENT_COMPANION_BATTLE_READY_SOURCE]
    };
  }
  return {
    checkpointId,
    checkpoint,
    scoreEvents,
    finalResult,
    scoreBreakdownByPlayerId: breakdowns,
    scoresByPlayerId,
    scoredAssassinationModelIds: [...new Set([
      ...mission.scoredAssassinationModelIds,
      ...scoreEvents.flatMap((event) => event.evidence.destroyedCharacterModelIds ?? [])
    ])].sort((left, right) => left.localeCompare(right))
  };
}
