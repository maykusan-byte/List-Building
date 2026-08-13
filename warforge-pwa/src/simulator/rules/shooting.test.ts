import { describe, expect, it } from 'vitest';
import { createPrngState, rollDice } from '../domain';
import { CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE, requiredWoundRoll, resolveBasicShooting } from './shooting';

const request = {
  attackerId: 'red-unit',
  targetId: 'blue-unit',
  weapon: { id: 'training-rifle', range: 24 * 254, attacks: 10, ballisticSkill: 3, strength: 4, armourPenetration: -1, damage: 1 },
  target: { toughness: 4, save: 3, woundsPerModel: 2, modelCount: 5 },
  distance: 12 * 254,
  visible: true
} as const;

describe('closed core shooting sequence', () => {
  it('uses the official strength versus toughness table', () => {
    expect([requiredWoundRoll(8, 4), requiredWoundRoll(5, 4), requiredWoundRoll(4, 4), requiredWoundRoll(3, 4), requiredWoundRoll(2, 4)]).toEqual([2, 3, 4, 5, 6]);
  });

  it('is deterministic and records every attack decision', () => {
    const first = resolveBasicShooting(request, createPrngState(40_000));
    const second = resolveBasicShooting(request, createPrngState(40_000));
    expect(first).toEqual(second);
    expect(first.accepted).toBe(true);
    if (!first.accepted) return;
    expect(first.steps).toHaveLength(10);
    expect(first.source.pages).toEqual([16, 18, 19]);
    expect(first.hits).toBe(first.steps.filter((step) => step.hit).length);
    expect(first.remainingModels).toBe(5 - first.modelsDestroyed);
    expect(first.hitRolls.map((entry) => entry.attackIndex)).toEqual([...Array(10).keys()]);
    expect(first.woundRolls.map((entry) => entry.attackIndex)).toEqual(first.hitRolls.filter((entry) => entry.hit).map((entry) => entry.attackIndex));
    expect(first.saveRolls.map((entry) => entry.attackIndex)).toEqual(first.woundRolls.filter((entry) => entry.wound).map((entry) => entry.attackIndex));
    expect(first.allocations).toEqual([...first.allocations].sort((left, right) => left.saveRoll - right.saveRoll || left.attackIndex - right.attackIndex));

    const expectedHits = rollDice(createPrngState(40_000), 6, request.weapon.attacks);
    const hitCount = expectedHits.results.filter((roll) => roll >= 3).length;
    const expectedWounds = hitCount === 0 ? { results: [], state: expectedHits.state } : rollDice(expectedHits.state, 6, hitCount);
    const woundCount = expectedWounds.results.filter((roll) => roll >= 4).length;
    const expectedSaves = woundCount === 0 ? { results: [], state: expectedWounds.state } : rollDice(expectedWounds.state, 6, woundCount);
    expect(first.hitRolls.map((entry) => entry.roll)).toEqual(expectedHits.results);
    expect(first.woundRolls.map((entry) => entry.roll)).toEqual(expectedWounds.results);
    expect(first.saveRolls.map((entry) => entry.roll)).toEqual(expectedSaves.results);
    expect(first.prngAfter).toEqual(expectedSaves.state);
  });

  it('does not spill excess damage to another model', () => {
    const result = resolveBasicShooting({
      ...request,
      weapon: { ...request.weapon, attacks: 20, ballisticSkill: 2, strength: 8, armourPenetration: -6, damage: 3 }
    }, createPrngState(7));
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.damageInflicted).toBe(result.modelsDestroyed * 2);
    expect(result.steps.filter((step) => step.damage !== undefined).every((step) => step.damage === 2)).toBe(true);
  });

  it('allocates to an already wounded active model before the smallest fresh model ID', () => {
    const result = resolveBasicShooting({
      ...request,
      weapon: { ...request.weapon, attacks: 20, ballisticSkill: 2, strength: 8, armourPenetration: -6, damage: 3 },
      target: {
        toughness: 4,
        save: 3,
        woundsPerModel: 2,
        models: [
          { id: 'model-a', wounds: 2, active: true },
          { id: 'model-b', wounds: 1, active: true }
        ]
      }
    }, createPrngState(7));
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.allocations.find((step) => step.damage !== undefined)).toMatchObject({ allocatedModelId: 'model-b', damage: 1, destroyedModelId: 'model-b' });
  });

  it('marks attacks after the last casualty as lost without claiming a save', () => {
    const result = resolveBasicShooting({
      ...request,
      weapon: { ...request.weapon, attacks: 6, ballisticSkill: 2, strength: 8, armourPenetration: -6, damage: 3 },
      target: { toughness: 4, save: 3, woundsPerModel: 2, models: [{ id: 'last-model', wounds: 2, active: true }] }
    }, createPrngState(7));
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.prngAfter.draws).toBe(18);
    expect(result.steps).toHaveLength(6);
    expect(result.destroyedModelIds).toEqual(['last-model']);
    const lost = result.steps.filter((step) => step.outcome === 'lost-no-target');
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.every((step) => step.saved !== true && step.allocatedModelId === undefined)).toBe(true);
  });

  it('loses every remaining allocation after the unit is destroyed, including successful saves', () => {
    const result = resolveBasicShooting({
      ...request,
      weapon: { ...request.weapon, attacks: 8, ballisticSkill: 2, strength: 8, armourPenetration: 0, damage: 2 },
      target: { toughness: 4, save: 3, woundsPerModel: 2, models: [{ id: 'last-model', wounds: 2, active: true }] }
    }, createPrngState(0));
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.allocations[0]).toMatchObject({ outcome: 'destroyed', destroyedModelId: 'last-model' });
    expect(result.allocations.slice(1).every((allocation) => allocation.outcome === 'lost-no-target')).toBe(true);
    expect(result.steps.filter((step) => step.outcome === 'lost-no-target').every((step) => step.saved === false)).toBe(true);
    expect(result.failedSaves).toBe(1);
  });

  it('degrades ballistic skill for cover while AP still worsens the armour save', () => {
    const noCover = resolveBasicShooting({ ...request, weapon: { ...request.weapon, attacks: 1 } }, createPrngState(0x57465247));
    const covered = resolveBasicShooting({
      ...request,
      weapon: { ...request.weapon, attacks: 1 },
      target: { ...request.target, coverBallisticSkillPenalty: 1 }
    }, createPrngState(0x57465247));
    expect(noCover).toMatchObject({ accepted: true, hitRequired: 3, saveRequired: 4, sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE, ...CORE_ATTACK_SEQUENCE_STEP_SOURCES] });
    expect(covered).toMatchObject({
      accepted: true,
      hitRequired: 4,
      saveRequired: 4,
      sourceRefs: [CORE_BASIC_RANGED_ATTACK_SOURCE, ...CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BENEFIT_OF_COVER_SOURCE]
    });
  });

  it('rejects invisible and out-of-range targets without consuming entropy', () => {
    const seed = createPrngState(9);
    const hidden = resolveBasicShooting({ ...request, visible: false }, seed);
    const distant = resolveBasicShooting({ ...request, distance: 25 * 254 }, seed);
    expect(hidden).toMatchObject({ accepted: false, code: 'not-visible', prngAfter: seed });
    expect(distant).toMatchObject({ accepted: false, code: 'out-of-range', prngAfter: seed });
  });
});
