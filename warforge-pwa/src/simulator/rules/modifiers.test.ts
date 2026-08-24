import { describe, expect, it } from 'vitest';
import { OFFICIAL_APP_MODIFIERS_SOURCE } from './m5-source-references';
import { resolveCharacteristicModifierPlan, resolveDieRollModifierPlan } from './modifiers';

describe('M5 modifier plans', () => {
  it('uses replacement, multiplication, addition, division, subtraction then ceiling independently from entry order', () => {
    const result = resolveCharacteristicModifierPlan({
      characteristic: 'attacks',
      baseValue: 5,
      modifiers: [
        { id: 'subtract', operation: 'subtract', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE },
        { id: 'divide', operation: 'divide', value: 3, source: OFFICIAL_APP_MODIFIERS_SOURCE },
        { id: 'add', operation: 'add', value: 3, source: OFFICIAL_APP_MODIFIERS_SOURCE },
        { id: 'multiply', operation: 'multiply', value: 2, source: OFFICIAL_APP_MODIFIERS_SOURCE },
        { id: 'replace', operation: 'replace', value: 6, source: OFFICIAL_APP_MODIFIERS_SOURCE }
      ]
    });
    expect(result).toMatchObject({ accepted: true, valueBeforeRounding: 4, value: 4, appliedModifierIds: ['add', 'divide', 'multiply', 'replace', 'subtract'] });
  });

  it('enforces official characteristic bounds after the ordered calculation', () => {
    expect(resolveCharacteristicModifierPlan({
      characteristic: 'ballistic-skill', baseValue: 5,
      modifiers: [{ id: 'worse', operation: 'add', value: 5, source: OFFICIAL_APP_MODIFIERS_SOURCE }]
    })).toMatchObject({ accepted: true, value: 7 });
    expect(resolveCharacteristicModifierPlan({
      characteristic: 'armour-penetration', baseValue: -1,
      modifiers: [{ id: 'reduce', operation: 'add', value: 3, source: OFFICIAL_APP_MODIFIERS_SOURCE }]
    })).toMatchObject({ accepted: true, value: 0 });
  });

  it('requires canonical provenance and an explicit opt-in before a modifier can be ignored', () => {
    const unknownSource = { ...OFFICIAL_APP_MODIFIERS_SOURCE, sourceId: 'not-canonical' };
    expect(resolveCharacteristicModifierPlan({
      characteristic: 'range', baseValue: 10,
      modifiers: [{ id: 'unknown', operation: 'add', value: 1, source: unknownSource }]
    })).toMatchObject({ accepted: false, code: 'unsupported-modifier-source' });
    expect(resolveCharacteristicModifierPlan({
      characteristic: 'range', baseValue: 10,
      modifiers: [{ id: 'locked', operation: 'add', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE }],
      ignoredModifierIds: ['locked']
    })).toMatchObject({ accepted: false, code: 'invalid-ignored-modifier' });
  });

  it('rejects an unknown operation instead of recording it as applied', () => {
    expect(resolveCharacteristicModifierPlan({
      characteristic: 'range', baseValue: 10,
      modifiers: [{ id: 'unknown', operation: 'power', value: 2, source: OFFICIAL_APP_MODIFIERS_SOURCE } as never]
    })).toMatchObject({ accepted: false, code: 'invalid-modifier-plan' });
  });

  it('rejects malformed characteristic and roll discriminators from untrusted JSON', () => {
    expect(resolveCharacteristicModifierPlan({
      characteristic: 'initiative', baseValue: 4, modifiers: []
    } as never)).toMatchObject({ accepted: false, code: 'invalid-modifier-plan' });
    expect(resolveDieRollModifierPlan({
      rollKind: 'save', unmodifiedRoll: 4, sides: 6,
      modifiers: [{ id: 'invalid-window', value: 2, source: OFFICIAL_APP_MODIFIERS_SOURCE }]
    } as never)).toMatchObject({ accepted: false, code: 'invalid-modifier-plan' });
  });

  it('keeps a value replaced by 0 at 0 and does not apply later modifiers', () => {
    expect(resolveCharacteristicModifierPlan({
      characteristic: 'attacks', baseValue: 5,
      modifiers: [
        { id: 'replace-zero', operation: 'replace', value: 0, source: OFFICIAL_APP_MODIFIERS_SOURCE },
        { id: 'would-add', operation: 'add', value: 3, source: OFFICIAL_APP_MODIFIERS_SOURCE }
      ]
    })).toMatchObject({
      accepted: true,
      valueBeforeRounding: 0,
      value: 0,
      appliedModifierIds: ['replace-zero']
    });
  });

  it('caps cumulative hit and wound modifiers at ±1 after rerolls, and bounds the final die face', () => {
    expect(resolveDieRollModifierPlan({
      rollKind: 'hit', unmodifiedRoll: 2, sides: 6,
      modifiers: [
        { id: 'one', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE },
        { id: 'two', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE }
      ]
    })).toMatchObject({ accepted: true, modifierTotal: 2, effectiveModifierTotal: 1, modifiedRoll: 3 });
    expect(resolveDieRollModifierPlan({
      rollKind: 'other', unmodifiedRoll: 6, sides: 6,
      modifiers: [{ id: 'up', value: 3, source: OFFICIAL_APP_MODIFIERS_SOURCE }]
    })).toMatchObject({ accepted: true, effectiveModifierTotal: 3, modifiedRoll: 6 });
  });

  it('supports an explicit, sourced partial ignore without changing the other modifier', () => {
    expect(resolveDieRollModifierPlan({
      rollKind: 'wound', unmodifiedRoll: 4, sides: 6,
      modifiers: [
        { id: 'ignored', value: -1, source: OFFICIAL_APP_MODIFIERS_SOURCE, canBeIgnored: true },
        { id: 'kept', value: 1, source: OFFICIAL_APP_MODIFIERS_SOURCE }
      ],
      ignoredModifierIds: ['ignored']
    })).toMatchObject({ accepted: true, modifierTotal: 1, effectiveModifierTotal: 1, modifiedRoll: 5, ignoredModifierIds: ['ignored'] });
  });
});
