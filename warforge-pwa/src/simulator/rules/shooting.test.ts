import { describe, expect, it } from 'vitest';
import { createPrngState, rollDice } from '../domain';
import { CORE_ATTACK_SEQUENCE_STEP_SOURCES, CORE_BASIC_RANGED_ATTACK_SOURCE, CORE_BENEFIT_OF_COVER_SOURCE, requiredWoundRoll, resolveBasicShooting, resolveRerollableHitStage, resolveRerollableShootingContinuation, resolveRerollableWoundStage } from './shooting';
import { OFFICIAL_APP_MODIFIERS_SOURCE, OFFICIAL_APP_REROLLS_SOURCE } from './m5-source-references';
import { CORE_ANTI_SOURCE, CORE_LETHAL_HITS_SOURCE, CORE_SUSTAINED_HITS_SOURCE } from './m5-source-references';

const request = {
  attackerId: 'red-unit',
  targetId: 'blue-unit',
  weapon: { id: 'training-rifle', range: 24 * 254, attacks: 10, ballisticSkill: 3, strength: 4, armourPenetration: -1, damage: 1 },
  target: { toughness: 4, save: 3, woundsPerModel: 2, modelCount: 5 },
  distance: 12 * 254,
  visible: true
} as const;

describe('closed core shooting sequence', () => {
  const firstSeedForFaces = (faces: readonly number[]): ReturnType<typeof createPrngState> => {
    for (let seed = 0; seed < 100_000; seed += 1) {
      const outcome = rollDice(createPrngState(seed), 6, faces.length);
      if (outcome.results.every((face, index) => face === faces[index])) return createPrngState(seed);
    }
    throw new Error(`Missing deterministic seed for D6=${faces.join(',')}.`);
  };

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

  it('preserves natural 1 failures and natural 6 critical hits after hit modifiers', () => {
    const firstSeedFor = (face: number) => {
      for (let seed = 0; seed < 10_000; seed += 1) {
        if (rollDice(createPrngState(seed), 6, 1).results[0] === face) return createPrngState(seed);
      }
      throw new Error(`Missing deterministic seed for D6=${face}.`);
    };
    const naturalOne = resolveBasicShooting({
      ...request,
      weapon: { ...request.weapon, attacks: 1, ballisticSkill: 2 },
      attackModifiers: { rerollFailedHits: false, woundRollModifier: 0, sourceRefs: [OFFICIAL_APP_MODIFIERS_SOURCE], hitRollModifiers: { modifiers: [{ id: 'plus-one', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE }] } }
    }, firstSeedFor(1));
    const naturalSix = resolveBasicShooting({
      ...request,
      weapon: { ...request.weapon, attacks: 1, ballisticSkill: 7 },
      attackModifiers: { rerollFailedHits: false, woundRollModifier: 0, sourceRefs: [OFFICIAL_APP_MODIFIERS_SOURCE], hitRollModifiers: { modifiers: [{ id: 'minus-one', value: -1, source: OFFICIAL_APP_MODIFIERS_SOURCE }] } }
    }, firstSeedFor(6));
    expect(naturalOne).toMatchObject({ accepted: true, hitRequired: 2, hitRolls: [{ roll: 1, modifiedRoll: 2, hit: false, critical: false }] });
    expect(naturalSix).toMatchObject({ accepted: true, hitRequired: 7, hitRolls: [{ roll: 6, modifiedRoll: 5, hit: true, critical: true }] });
  });

  it('treats a matching [ANTI-X Y+] threshold as a critical wound while a natural 1 still fails', () => {
    const antiWeapon = {
      ...request.weapon,
      attacks: 1,
      ballisticSkill: 2,
      strength: 1,
      armourPenetration: -6,
      weaponKeywords: [{ kind: 'anti' as const, targetKeyword: 'INFANTRY', criticalWound: 4 as const, source: CORE_ANTI_SOURCE }]
    };
    const matching = resolveBasicShooting({
      ...request,
      weapon: antiWeapon,
      target: { ...request.target, keywords: ['Infantry'] }
    }, firstSeedForFaces([2, 4, 1]));
    const nonMatching = resolveBasicShooting({
      ...request,
      weapon: antiWeapon,
      target: { ...request.target, keywords: ['VEHICLE'] }
    }, firstSeedForFaces([2, 4]));
    const naturalOne = resolveBasicShooting({
      ...request,
      weapon: antiWeapon,
      target: { ...request.target, keywords: ['INFANTRY'] }
    }, firstSeedForFaces([2, 1]));
    expect(matching).toMatchObject({ accepted: true, woundRolls: [{ roll: 4, wound: true, critical: true }] });
    expect(nonMatching).toMatchObject({ accepted: true, woundRolls: [{ roll: 4, wound: false, critical: false }] });
    expect(naturalOne).toMatchObject({ accepted: true, woundRolls: [{ roll: 1, wound: false, critical: false }] });
  });

  it('adds [SUSTAINED HITS X] as distinct non-critical hits in deterministic draw order', () => {
    const sustained = resolveBasicShooting({
      ...request,
      weapon: {
        ...request.weapon,
        attacks: 1,
        ballisticSkill: 2,
        weaponKeywords: [{ kind: 'sustained-hits', value: 2, source: CORE_SUSTAINED_HITS_SOURCE }]
      }
    }, firstSeedForFaces([6, 1, 1, 1]));
    expect(sustained.accepted).toBe(true);
    if (!sustained.accepted) return;
    expect(sustained.hitRolls).toEqual([expect.objectContaining({ attackIndex: 0, roll: 6, critical: true, sustainedHitsGenerated: 2 })]);
    expect(sustained.hits).toBe(3);
    expect(sustained.woundRolls).toEqual([
      expect.objectContaining({ attackIndex: 0, roll: 1, wound: false }),
      expect.objectContaining({ attackIndex: 1, roll: 1, wound: false, generatedByCriticalHitOfAttackIndex: 0 }),
      expect.objectContaining({ attackIndex: 2, roll: 1, wound: false, generatedByCriticalHitOfAttackIndex: 0 })
    ]);
    expect(sustained.steps.map((step) => step.attackIndex)).toEqual([0, 1, 2]);
    expect(sustained.sourceRefs).toContainEqual(CORE_SUSTAINED_HITS_SOURCE);
  });

  it('rejects [LETHAL HITS] before entropy until each critical-hit decision can be journaled', () => {
    const seed = createPrngState(91);
    const lethal = resolveBasicShooting({
      ...request,
      weapon: {
        ...request.weapon,
        attacks: 1,
        ballisticSkill: 2,
        strength: 1,
        armourPenetration: -6,
        weaponKeywords: [{ kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE }]
      }
    }, seed);
    expect(lethal).toMatchObject({
      accepted: false,
      code: 'lethal-hits-decision-required',
      prngAfter: seed
    });
    expect(lethal.accepted ? [] : lethal.sourceRefs).toContainEqual(CORE_LETHAL_HITS_SOURCE);
  });

  it('rejects an unproved or duplicated critical-trigger fact before consuming entropy', () => {
    const seed = createPrngState(9);
    const duplicate = resolveBasicShooting({
      ...request,
      weapon: {
        ...request.weapon,
        weaponKeywords: [
          { kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE },
          { kind: 'lethal-hits', source: CORE_LETHAL_HITS_SOURCE }
        ]
      }
    }, seed);
    const forged = resolveBasicShooting({
      ...request,
      weapon: {
        ...request.weapon,
        weaponKeywords: [{ kind: 'anti', targetKeyword: 'INFANTRY', criticalWound: 4, source: { ...CORE_ANTI_SOURCE, page: 80 } }]
      },
      target: { ...request.target, keywords: ['INFANTRY'] }
    }, seed);
    expect(duplicate).toMatchObject({ accepted: false, code: 'invalid-profile', prngAfter: seed });
    expect(forged).toMatchObject({ accepted: false, code: 'invalid-profile', prngAfter: seed });
  });

  it('rolls a covered random D only after an unsaved allocation and records every result for replay', () => {
    const seed = createPrngState(0x57465247);
    const variableDamage = resolveBasicShooting({
      ...request,
      weapon: {
        ...request.weapon,
        attacks: 12,
        ballisticSkill: 2,
        strength: 8,
        armourPenetration: -6,
        damage: 1,
        randomDamage: 'D3'
      }
    }, seed);
    const fixedDamage = resolveBasicShooting({
      ...request,
      weapon: { ...request.weapon, attacks: 12, ballisticSkill: 2, strength: 8, armourPenetration: -6, damage: 1 }
    }, seed);
    expect(variableDamage.accepted).toBe(true);
    expect(fixedDamage.accepted).toBe(true);
    if (!variableDamage.accepted || !fixedDamage.accepted) return;
    const damaged = variableDamage.allocations.filter((allocation) => allocation.damage !== undefined);
    expect(damaged.length).toBeGreaterThan(0);
    expect(damaged.every((allocation) => allocation.randomDamage?.expression === 'D3'
      && allocation.randomDamage.dice.length === 1
      && allocation.randomDamage.value >= 1
      && allocation.randomDamage.value <= 3)).toBe(true);
    expect(variableDamage.prngAfter.draws).toBeGreaterThan(fixedDamage.prngAfter.draws);
    expect(variableDamage.steps.filter((step) => step.damage !== undefined).every((step) => step.randomDamage?.expression === 'D3')).toBe(true);
  });

  it('rejects malformed random D before consuming entropy', () => {
    const seed = createPrngState(9);
    expect(resolveBasicShooting({
      ...request,
      weapon: { ...request.weapon, randomDamage: 'D8' }
    }, seed)).toMatchObject({ accepted: false, code: 'invalid-profile', prngAfter: seed });
  });
});

describe('generic individual D6 rerolls', () => {
  const firstSeedForFaces = (faces: readonly number[]): ReturnType<typeof createPrngState> => {
    for (let seed = 0; seed < 100_000; seed += 1) {
      const outcome = rollDice(createPrngState(seed), 6, faces.length);
      if (outcome.results.every((face, index) => face === faces[index])) return createPrngState(seed);
    }
    throw new Error(`Missing deterministic seed for D6=${faces.join(',')}.`);
  };

  const rerollRequest = (attacks = 1) => ({
    ...request,
    weapon: { ...request.weapon, attacks, ballisticSkill: 3 },
    attackModifiers: { rerollFailedHits: false, woundRollModifier: 0 as const, sourceRefs: [OFFICIAL_APP_REROLLS_SOURCE] }
  });

  it('lets the player keep or reroll each individual hit die, leaving untouched dice unchanged', () => {
    const seed = firstSeedForFaces([1, 4, 6]);
    const hitStage = resolveRerollableHitStage(rerollRequest(2), seed);
    expect(hitStage).toMatchObject({ accepted: true, hitRolls: [{ attackIndex: 0, roll: 1 }, { attackIndex: 1, roll: 4 }] });
    if (!hitStage.accepted) return;
    const woundStage = resolveRerollableWoundStage(rerollRequest(2), hitStage, [
      { groupIndex: 0, attackIndex: 0, rollKind: 'hit', optionId: 'keep' },
      { groupIndex: 0, attackIndex: 1, rollKind: 'hit', optionId: 'reroll' }
    ], hitStage.prngAfter);
    expect(woundStage.accepted).toBe(true);
    if (!woundStage.accepted) return;
    expect(woundStage.hitRolls[0]).toMatchObject({ roll: 1, hit: false });
    expect(woundStage.hitRolls[1]).toMatchObject({ roll: 4, rerollRoll: 6, hit: true, critical: true });
  });

  it('applies the chosen reroll before hit modifiers and treats its natural six as critical', () => {
    const seed = firstSeedForFaces([1, 6]);
    const stagedRequest = {
      ...rerollRequest(),
      weapon: { ...rerollRequest().weapon, ballisticSkill: 7 },
      attackModifiers: {
        rerollFailedHits: false,
        woundRollModifier: 0 as const,
        sourceRefs: [OFFICIAL_APP_REROLLS_SOURCE, OFFICIAL_APP_MODIFIERS_SOURCE],
        hitRollModifiers: { modifiers: [{ id: 'minus-one', value: -1, source: OFFICIAL_APP_MODIFIERS_SOURCE }] }
      }
    };
    const hitStage = resolveRerollableHitStage(stagedRequest, seed);
    if (!hitStage.accepted) throw new Error(hitStage.message);
    const woundStage = resolveRerollableWoundStage(stagedRequest, hitStage, [{ groupIndex: 0, attackIndex: 0, rollKind: 'hit', optionId: 'reroll' }], hitStage.prngAfter);
    expect(woundStage).toMatchObject({ accepted: true, hitRolls: [{ roll: 1, rerollRoll: 6, modifiedRoll: 5, hit: true, critical: true }] });
  });

  it('journals one optional wound reroll and rejects an attempted second reroll without consuming entropy', () => {
    const seed = firstSeedForFaces([6, 1, 6]);
    const hitStage = resolveRerollableHitStage(rerollRequest(), seed);
    if (!hitStage.accepted) throw new Error(hitStage.message);
    const woundStage = resolveRerollableWoundStage(rerollRequest(), hitStage, [{ groupIndex: 0, attackIndex: 0, rollKind: 'hit', optionId: 'keep' }], hitStage.prngAfter);
    if (!woundStage.accepted) throw new Error(woundStage.message);
    const completed = resolveRerollableShootingContinuation(rerollRequest(), woundStage, [{ groupIndex: 0, attackIndex: 0, rollKind: 'wound', optionId: 'reroll' }], woundStage.prngAfter);
    expect(completed).toMatchObject({ accepted: true, woundRolls: [{ roll: 1, rerollRoll: 6, wound: true, critical: true }] });
    const tampered = resolveRerollableShootingContinuation(rerollRequest(), woundStage, [
      { groupIndex: 0, attackIndex: 0, rollKind: 'wound', optionId: 'reroll' },
      { groupIndex: 0, attackIndex: 0, rollKind: 'wound', optionId: 'reroll' }
    ], woundStage.prngAfter);
    expect(tampered).toMatchObject({ accepted: false, code: 'invalid-profile', prngAfter: woundStage.prngAfter });
  });
});
