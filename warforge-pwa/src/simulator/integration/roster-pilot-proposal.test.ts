import { describe, expect, it } from 'vitest';
import { calculateRosterTotal } from '../../domain/calculations';
import { normalizeDatabase } from '../../domain/normalize';
import type { RosterDraft, ValidationIssue } from '../../domain/types';
import { validateDraft } from '../../domain/validation';
import { resolveWargear } from '../../domain/wargear';
import catalogRaw from '../../../public/data/catalog.json?raw';
import proposalRaw from '../../../docs/simulator/roster-pilots/real-roster-shooting-duel-v1.proposal.json';

interface PilotRosterProposal {
  readonly id: string;
  readonly status: string;
  readonly catalog: {
    readonly fingerprint: string;
    readonly version: string;
  };
  readonly approval: {
    readonly status: string;
    readonly reviewedBy: string | null;
    readonly reviewedAt: string | null;
  };
  readonly rosters: ReadonlyArray<{
    readonly draft: RosterDraft;
    readonly resolved: {
      readonly points: number;
      readonly units: ReadonlyArray<{
        readonly id: string;
        readonly frozenDefaultLoadout: FrozenDefaultLoadout;
      }>;
    };
  }>;
  readonly mandatoryRuleDisposition: ReadonlyArray<{
    readonly id: string;
    readonly status: string;
  }>;
}

interface FrozenDefaultLoadout {
  readonly byComposition: ReadonlyArray<{
    readonly id: string;
    readonly modelName: string;
    readonly modelCount: number;
    readonly equipment: ReadonlyArray<{ readonly name: string; readonly count: number }>;
    readonly weaponProfiles: ReadonlyArray<{ readonly name: string; readonly count: number; readonly melee: boolean }>;
  }>;
}

const proposal = proposalRaw as PilotRosterProposal;
const database = normalizeDatabase(catalogRaw);

function resolvedDefaultLoadout(draft: RosterDraft, item: RosterDraft['items'][number]): FrozenDefaultLoadout {
  const unit = database.units.find((candidate) => candidate.id === item.unitId);
  if (!unit) throw new Error(`Unité introuvable : ${item.unitId}`);
  const detachmentNames = database.detachments
    .filter((detachment) => draft.detachmentIds.includes(detachment.id))
    .map((detachment) => detachment.displayName);
  const resolved = resolveWargear(unit, item, detachmentNames);
  return {
    byComposition: resolved.byComposition.map((composition) => ({
      id: composition.composition.id,
      modelName: composition.composition.label,
      modelCount: composition.composition.count,
      equipment: composition.equipment.map(({ name, count }) => ({ name, count })),
      weaponProfiles: composition.profiles.map(({ profile, count, melee }) => ({ name: profile.Name ?? '', count, melee }))
    }))
  };
}

describe('M4 real-roster pilot proposal', () => {
  it('pins two legal, human-approved RosterDraft pilots to the current catalog', () => {
    expect(proposal.id).toBe('real-roster-shooting-duel-v1');
    expect(proposal.status).toBe('human-approved');
    expect(proposal.approval).toMatchObject({
      status: 'human-approved',
      reviewedBy: 'project-owner',
      reviewedAt: '2026-08-21',
      decision: 'approved'
    });
    expect(proposal.catalog).toMatchObject({ version: '1.2.13.0', fingerprint: database.fingerprint });
    expect(proposal.rosters).toHaveLength(2);

    for (const roster of proposal.rosters) {
      const errors: ValidationIssue[] = validateDraft(database, roster.draft).filter((issue) => issue.level === 'error');
      expect(errors).toEqual([]);
      expect(calculateRosterTotal(database, roster.draft.items, roster.draft.detachmentIds)).toBe(roster.resolved.points);
      expect(roster.draft.items).toHaveLength(2);
      expect(roster.draft.items.every((item) => Object.keys(item.wargearSelections).length === 0)).toBe(true);
      expect(roster.draft.items.every((item) => Object.keys(item.wargearSelectionCounts ?? {}).length === 0)).toBe(true);
      for (const item of roster.draft.items) {
        const frozenUnit = roster.resolved.units.find((unit) => unit.id === item.unitId);
        expect(frozenUnit?.frozenDefaultLoadout).toEqual(resolvedDefaultLoadout(roster.draft, item));
      }
    }
  });

  it('keeps Oath of Moment and the PISTOL engagement condition visible as M4 requirements', () => {
    expect(proposal.mandatoryRuleDisposition.find((rule) => rule.id === 'adeptus-astartes.oath-of-moment'))
      .toMatchObject({ status: 'uncovered-blocker' });
    expect(proposal.mandatoryRuleDisposition.find((rule) => rule.id === 'weapon.pistol'))
      .toMatchObject({ status: 'guarded-requirement' });
    expect(proposal.mandatoryRuleDisposition.find((rule) => rule.id === 'adeptus-astartes.oath-of-moment'))
      .toMatchObject({
        source: 'ArmyRules de data/units/Salamanders.json et data/units/Blood Angels.json',
        byRoster: [
          { side: 'salamanders', effects: ['relance des jets de touche contre la cible Oath', '+1 au jet de blessure contre la cible Oath'] },
          { side: 'blood-angels', effects: ['relance des jets de touche contre la cible Oath'] }
        ]
      });
    expect(proposal.mandatoryRuleDisposition.find((rule) => rule.id === 'weapon.pistol'))
      .toMatchObject({ source: 'Mot-clé [PISTOL] des quatre profils de Heavy bolt pistol sélectionnés (14 armes équipées)' });
    expect(proposal.mandatoryRuleDisposition.find((rule) => rule.id === 'army-rule.space-marine-chapters.salamanders'))
      .toMatchObject({ status: 'validated-legality' });
    expect(proposal.mandatoryRuleDisposition.find((rule) => rule.id === 'army-rule.the-sons-of-sanguinius.blood-angels'))
      .toMatchObject({ status: 'validated-legality' });
  });
});
