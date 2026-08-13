import type { NormalizedDatabase, RosterDraft } from '../../domain/types';
import { resolveWargear } from '../../domain/wargear';
import type { CoverageEntryV1, RosterSimulationAdaptation, RosterSimulationAdapter } from '../domain';

export interface SimulatorCoverageIndex {
  readonly version: string;
  readonly coveredSubjectIds: ReadonlySet<string>;
}

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function missing(subjectType: CoverageEntryV1['subjectType'], subjectId: string, reason: string): CoverageEntryV1 {
  return { subjectType, subjectId, status: 'unsupported', reason };
}

export class WarforgeRosterSimulationAdapter implements RosterSimulationAdapter<RosterDraft> {
  readonly version = '1.0.0';

  constructor(
    private readonly database: NormalizedDatabase,
    private readonly coverage: SimulatorCoverageIndex
  ) {}

  adapt(draft: RosterDraft): RosterSimulationAdaptation {
    const missingByKey = new Map<string, CoverageEntryV1>();
    const modelIds: string[] = [];
    const detachmentNames = this.database.detachments
      .filter((detachment) => draft.detachmentIds.includes(detachment.id))
      .map((detachment) => detachment.displayName);

    const requireCoverage = (type: CoverageEntryV1['subjectType'], id: string, reason: string): void => {
      if (!this.coverage.coveredSubjectIds.has(id)) missingByKey.set(`${type}:${id}`, missing(type, id, reason));
    };

    for (const item of draft.items) {
      const unit = this.database.units.find((candidate) => candidate.id === item.unitId);
      if (!unit) {
        missingByKey.set(`unit:${item.unitId}`, missing('unit', item.unitId, 'Unité absente du catalogue actif.'));
        continue;
      }
      requireCoverage('unit', `unit:${unit.id}`, `La fiche ${unit.displayName} n'est pas formalisée pour le simulateur.`);
      requireCoverage('physical-profile', `physical-profile:${unit.id}`, `Aucun profil physique revu pour ${unit.displayName}.`);

      const resolved = resolveWargear(unit, item, detachmentNames);
      const totalModels = Math.max(0, resolved.totalModels);
      for (let index = 0; index < totalModels; index += 1) modelIds.push(`${item.id}:model:${index}`);
      for (const selected of resolved.profiles) {
        const name = selected.profile.Name?.trim();
        if (name) requireCoverage('weapon', `weapon:${slug(name)}`, `Le profil d'arme ${name} n'est pas exécutable.`);
      }
      for (const ability of unit.UnitAbilities ?? []) {
        const title = ability.Title?.trim();
        if (title) requireCoverage('rule', `ability:${unit.id}:${slug(title)}`, `L'aptitude ${title} n'est pas exécutable.`);
      }
      for (const ability of unit.CoreAbilities ?? []) {
        requireCoverage('rule', `core-ability:${slug(ability)}`, `L'aptitude de base ${ability} n'est pas couverte.`);
      }
    }

    return { rosterId: draft.id, modelIds, missingCoverage: [...missingByKey.values()].sort((left, right) => left.subjectId.localeCompare(right.subjectId)) };
  }
}
