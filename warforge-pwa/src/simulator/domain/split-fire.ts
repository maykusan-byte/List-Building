import type { SplitFireWeaponDeclarationV1 } from './types';

/**
 * Rebuilds only the unresolved suffix of a split-fire declaration after an
 * authoritative retarget choice.  A weapon retargeted to a still scheduled
 * unit is inserted immediately before that unit's group, so that the unit is
 * never left and later targeted again.  A genuinely new target stays at the
 * current point in the sequence and is resolved before the previously queued
 * groups.
 */
export function scheduleSplitFireRetarget(
  declarations: readonly SplitFireWeaponDeclarationV1[],
  nextResolutionIndex: number,
  targetUnitId: string
): readonly SplitFireWeaponDeclarationV1[] {
  const current = declarations[nextResolutionIndex];
  if (!current || targetUnitId === 'abandon') return declarations;
  const retargeted = { ...current, targetUnitId };
  const prefix = declarations.slice(0, nextResolutionIndex);
  const suffix = declarations.slice(nextResolutionIndex + 1);
  const futureTargetIndex = suffix.findIndex((declaration) => declaration.targetUnitId === targetUnitId);
  if (futureTargetIndex < 0) return [...prefix, retargeted, ...suffix];
  return [
    ...prefix,
    ...suffix.slice(0, futureTargetIndex),
    retargeted,
    ...suffix.slice(futureTargetIndex)
  ];
}
