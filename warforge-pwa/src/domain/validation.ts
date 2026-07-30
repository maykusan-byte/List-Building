import { calculateItemCost, enhancementIsEligible, getEnhancement } from './calculations';
import type { NormalizedDatabase, RosterDraft, ValidationIssue } from './types';

export function validateDraft(database: NormalizedDatabase, draft: RosterDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const battleSize = database.battleSizes.find((size) => size.PointsTotal === draft.battleSizePoints);
  const detachments = database.detachments.filter((detachment) => draft.detachmentIds.includes(detachment.id));
  const items = draft.items.map((item) => ({ item, unit: database.units.find((unit) => unit.id === item.unitId) }));

  if (!battleSize) issues.push({ id: 'battle-size', level: 'error', message: 'Le format de bataille sélectionné est introuvable.' });
  if (!draft.primaryFaction) issues.push({ id: 'faction', level: 'error', message: 'Choisissez une faction avant de valider la liste.' });
  if (!draft.scenario) issues.push({ id: 'scenario', level: 'error', message: 'Choisissez un scénario.' });
  if (detachments.length === 0) issues.push({ id: 'detachment-none', level: 'warning', message: 'La liste ne contient aucun détachement.' });

  const knownDetachmentCost = detachments.reduce((total, detachment) => total + (typeof detachment.Cost === 'number' ? detachment.Cost : 0), 0);
  detachments.forEach((detachment) => {
    if (!detachment.ForceDispositions?.includes(draft.scenario)) {
      issues.push({ id: `scenario-${detachment.id}`, level: 'error', message: `${detachment.displayName} n’est pas lié à ${draft.scenario}.` });
    }
    if (typeof detachment.Cost !== 'number') {
      issues.push({ id: `cost-${detachment.id}`, level: 'warning', message: `${detachment.displayName} n’a pas de coût de détachement renseigné.` });
    }
    if (detachment.Rule?.Restrictions) {
      issues.push({ id: `restriction-${detachment.id}`, level: 'info', message: `${detachment.displayName} : ${detachment.Rule.Restrictions}` });
    }
  });

  if (battleSize && knownDetachmentCost > battleSize.DetachmentPoints) {
    issues.push({
      id: 'detachment-budget',
      level: 'error',
      message: `Budget de détachements dépassé : ${knownDetachmentCost}/${battleSize.DetachmentPoints} DP connus.`
    });
  }

  const total = draft.items.reduce((sum, item) => sum + calculateItemCost(database, item, draft.detachmentIds).total, 0);
  if (battleSize && total > battleSize.PointsTotal) {
    issues.push({ id: 'points-budget', level: 'error', message: `Budget d’armée dépassé : ${total}/${battleSize.PointsTotal} pts.` });
  }

  const countByUnit = new Map<string, number>();
  let enhancements = 0;
  items.forEach(({ item, unit }) => {
    if (!unit) {
      issues.push({ id: `unit-${item.id}`, level: 'error', message: 'Une unité de la liste est introuvable dans la base.' });
      return;
    }
    if (unit.factionName !== draft.primaryFaction) {
      issues.push({ id: `faction-${item.id}`, level: 'error', message: `${unit.displayName} ne vient pas de la faction sélectionnée.` });
    }
    countByUnit.set(unit.id, (countByUnit.get(unit.id) ?? 0) + 1);
    if (item.enhancement) {
      enhancements += 1;
      const chosen = getEnhancement(database, item.enhancement);
      if (!chosen || !enhancementIsEligible(unit, chosen.enhancement)) {
        issues.push({ id: `enhancement-${item.id}`, level: 'error', message: `L’amélioration de ${unit.displayName} n’est pas éligible.` });
      }
    }
    calculateItemCost(database, item, draft.detachmentIds).notices.forEach((notice, noticeIndex) => {
      issues.push({ id: `cost-${item.id}-${noticeIndex}`, level: 'warning', message: `${unit.displayName} : ${notice}` });
    });
  });

  if (battleSize && enhancements > battleSize.EnhancementLimit) {
    issues.push({
      id: 'enhancement-limit',
      level: 'error',
      message: `Limite d’améliorations dépassée : ${enhancements}/${battleSize.EnhancementLimit}.`
    });
  }

  if (battleSize) {
    countByUnit.forEach((count, unitId) => {
      if (count > battleSize.UnitLimit) {
        const name = database.units.find((unit) => unit.id === unitId)?.displayName ?? 'Cette unité';
        issues.push({
          id: `unit-limit-${unitId}`,
          level: 'warning',
          message: `${name} apparaît ${count} fois ; le format indique une limite usuelle de ${battleSize.UnitLimit}.`
        });
      }
    });
  }

  return issues;
}
