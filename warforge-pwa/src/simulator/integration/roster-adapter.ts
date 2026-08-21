import type { NormalizedDatabase, RosterDraft } from '../../domain/types';
import { resolveWargear } from '../../domain/wargear';
import approvedM4RosterPilotProposalRaw from '../../../docs/simulator/roster-pilots/real-roster-shooting-duel-v1.proposal.json';
import type { CoverageEntryV1, RosterSimulationAdaptation, RosterSimulationAdapter, RosterSimulationRefusal } from '../domain';

export interface SimulatorCoverageIndex {
  readonly version: string;
  readonly coveredSubjectIds: ReadonlySet<string>;
}

interface FrozenEquipmentEntry {
  readonly name: string;
  readonly count: number;
}

interface FrozenWeaponProfile {
  readonly name: string;
  readonly count: number;
  readonly melee: boolean;
}

interface FrozenDefaultLoadout {
  readonly byComposition: ReadonlyArray<{
    readonly id: string;
    readonly modelName: string;
    readonly modelCount: number;
    readonly equipment: ReadonlyArray<FrozenEquipmentEntry>;
    readonly weaponProfiles: ReadonlyArray<FrozenWeaponProfile>;
  }>;
}

interface ApprovedM4RosterPilot {
  readonly catalog: {
    readonly fingerprint: string;
    readonly version: string;
    readonly publishDate: string;
  };
  readonly id: string;
  readonly status: 'human-approved';
  readonly rosters: ReadonlyArray<{
    readonly draft: RosterDraft;
    readonly resolved: {
      readonly units: ReadonlyArray<{
        readonly id: string;
        readonly frozenDefaultLoadout: FrozenDefaultLoadout;
      }>;
    };
  }>;
}

function freezeApprovedProposal<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) freezeApprovedProposal(descriptor.value);
  }
  return Object.freeze(value);
}

/**
 * The single, human-approved M4 source.  This adapter only proves roster
 * identity and deterministic model naming; it intentionally says nothing
 * about executable rules, weapon profiles, physical profiles or scenarios.
 */
export const approvedM4RosterPilotProposal = freezeApprovedProposal(approvedM4RosterPilotProposalRaw as ApprovedM4RosterPilot);

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function missing(subjectType: CoverageEntryV1['subjectType'], subjectId: string, reason: string): CoverageEntryV1 {
  return { subjectType, subjectId, status: 'unsupported', reason };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isArrayIndex(name: string): boolean {
  if (!/^(0|[1-9]\d*)$/u.test(name)) return false;
  const index = Number(name);
  return Number.isSafeInteger(index) && index >= 0 && String(index) === name;
}

const nativeObjectPrototype = Object.prototype;
const nativeArrayPrototype = Array.prototype;
const getOwnPropertyNames = Object.getOwnPropertyNames.bind(Object);
const getOwnPropertySymbols = Object.getOwnPropertySymbols.bind(Object);
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor.bind(Object);
const getPrototypeOf = Object.getPrototypeOf.bind(Object);
const isArray = Array.isArray.bind(Array);
const hasOwn = Function.call.bind(Object.prototype.hasOwnProperty) as (value: object, key: PropertyKey) => boolean;
const ownKeys = Reflect.ownKeys.bind(Reflect);
const stringify = JSON.stringify.bind(JSON);

function snapshotDescriptors(value: object): ReadonlyMap<PropertyKey, PropertyDescriptor> {
  const snapshot = new Map<PropertyKey, PropertyDescriptor>();
  for (const key of ownKeys(value)) {
    const descriptor = getOwnPropertyDescriptor(value, key);
    if (!descriptor) throw new Error('Impossible de figer les descripteurs natifs du compilateur M4.');
    snapshot.set(key, descriptor);
  }
  return snapshot;
}

const objectPrototypeSnapshot = snapshotDescriptors(nativeObjectPrototype);
const arrayPrototypeSnapshot = snapshotDescriptors(nativeArrayPrototype);

function sameDescriptor(left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean {
  if (!left || !right || left.enumerable !== right.enumerable || left.configurable !== right.configurable) return false;
  if ('value' in left || 'value' in right) {
    return 'value' in left && 'value' in right && left.value === right.value && left.writable === right.writable;
  }
  return left.get === right.get && left.set === right.set;
}

function hasUnmodifiedPrototype(prototype: object, snapshot: ReadonlyMap<PropertyKey, PropertyDescriptor>): boolean {
  const keys = ownKeys(prototype);
  return keys.length === snapshot.size
    && keys.every((key) => snapshot.has(key) && sameDescriptor(snapshot.get(key), getOwnPropertyDescriptor(prototype, key)));
}

function isDataArray(value: unknown): value is unknown[] {
  if (!isArray(value) || getPrototypeOf(value) !== nativeArrayPrototype || !hasUnmodifiedPrototype(nativeArrayPrototype, arrayPrototypeSnapshot)) return false;
  const names = getOwnPropertyNames(value);
  if (getOwnPropertySymbols(value).length > 0 || !names.every((name) => name === 'length' || isArrayIndex(name))) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !('value' in descriptor)) return false;
  }
  return true;
}

/**
 * Imported rosters are data, not objects with behaviour. In particular, a
 * custom `toJSON`, an inherited field, an accessor or a Map must never decide
 * whether an imported roster matches the human-approved pilot.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || isArray(value)) return false;
  const prototype = getPrototypeOf(value);
  if ((prototype !== nativeObjectPrototype && prototype !== null) || (prototype === nativeObjectPrototype && !hasUnmodifiedPrototype(nativeObjectPrototype, objectPrototypeSnapshot))) return false;
  if (getOwnPropertySymbols(value).length > 0 || hasOwn(value, 'toJSON')) return false;
  return getOwnPropertyNames(value).every((key) => {
    const descriptor = getOwnPropertyDescriptor(value, key);
    return Boolean(descriptor && 'value' in descriptor && descriptor.enumerable);
  });
}

function ownDataValue(value: Record<string, unknown>, key: string): unknown {
  const descriptor = getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = ownDataValue(value, key);
  return typeof candidate === 'string' ? candidate : undefined;
}

function canonicalData(value: unknown, ancestors = new Set<object>()): string | undefined {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value !== 'object' || ancestors.has(value)) return undefined;

  ancestors.add(value);
  try {
    if (isArray(value)) {
      if (!isDataArray(value)) return undefined;
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor)) return undefined;
        const entry = canonicalData(descriptor.value, ancestors);
        if (entry === undefined) return undefined;
        entries.push(entry);
      }
      return `[${entries.join(',')}]`;
    }

    if (!isRecord(value)) return undefined;
    const entries: string[] = [];
    for (const key of getOwnPropertyNames(value).sort(compareText)) {
      const entry = canonicalData(ownDataValue(value, key), ancestors);
      if (entry === undefined) return undefined;
      entries.push(`${stringify(key)}:${entry}`);
    }
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function stableString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'absent';
  return canonicalData(value) ?? '<invalid-imported-data>';
}

function hasExactOwnKeys(actual: Record<string, unknown>, expected: object): boolean {
  const actualKeys = getOwnPropertyNames(actual).sort(compareText);
  const expectedKeys = getOwnPropertyNames(expected).sort(compareText);
  return actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index]);
}

function mapEquals(value: unknown, expected: Readonly<Record<string, number>>): boolean {
  if (!isRecord(value)) return false;
  const keys = getOwnPropertyNames(value).sort(compareText);
  const expectedKeys = Object.keys(expected).sort(compareText);
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index] && ownDataValue(value, key) === expected[key]);
}

function emptySelectionMap(value: unknown, optional = false): 'empty' | 'selected' | 'malformed' {
  if (value === undefined && optional) return 'empty';
  if (!isRecord(value)) return 'malformed';
  return getOwnPropertyNames(value).length === 0 ? 'empty' : 'selected';
}

interface ComparableLoadout {
  readonly byComposition: ReadonlyArray<{
    readonly id: string;
    readonly modelName: string;
    readonly modelCount: number;
    readonly equipment: ReadonlyArray<FrozenEquipmentEntry>;
    readonly weaponProfiles: ReadonlyArray<FrozenWeaponProfile>;
  }>;
}

function canonicalEquipment(entries: ReadonlyArray<FrozenEquipmentEntry>): FrozenEquipmentEntry[] {
  return entries
    .map((entry) => ({ name: slug(entry.name), count: entry.count }))
    .sort((left, right) => compareText(left.name, right.name) || left.count - right.count);
}

function canonicalWeaponProfiles(entries: ReadonlyArray<FrozenWeaponProfile>): FrozenWeaponProfile[] {
  return entries
    .map((entry) => ({ name: slug(entry.name), count: entry.count, melee: entry.melee }))
    .sort((left, right) => compareText(left.name, right.name) || Number(left.melee) - Number(right.melee) || left.count - right.count);
}

function comparableFrozenLoadout(loadout: FrozenDefaultLoadout): ComparableLoadout {
  return {
    byComposition: loadout.byComposition.map((composition) => ({
      id: composition.id,
      modelName: slug(composition.modelName),
      modelCount: composition.modelCount,
      equipment: canonicalEquipment(composition.equipment),
      weaponProfiles: canonicalWeaponProfiles(composition.weaponProfiles)
    })).sort((left, right) => compareText(left.id, right.id))
  };
}

function defaultLoadoutFromCatalog(database: NormalizedDatabase, draft: RosterDraft, item: RosterDraft['items'][number]): ComparableLoadout | undefined {
  const unit = Array.isArray(database.units) ? database.units.find((candidate) => candidate.id === item.unitId) : undefined;
  if (!unit) return undefined;
  const detachmentNames = (Array.isArray(database.detachments) ? database.detachments : [])
    .filter((detachment) => draft.detachmentIds.includes(detachment.id))
    .map((detachment) => detachment.displayName);

  try {
    const resolved = resolveWargear(unit, item, detachmentNames);
    return {
      byComposition: resolved.byComposition.map(({ composition, equipment, profiles }) => ({
        id: composition.id,
        modelName: slug(composition.label),
        modelCount: composition.count,
        equipment: canonicalEquipment(equipment.map(({ name, count }) => ({ name, count }))),
        weaponProfiles: canonicalWeaponProfiles(profiles.map(({ profile, count, melee }) => ({ name: profile.Name ?? '', count, melee })))
      })).sort((left, right) => compareText(left.id, right.id))
    };
  } catch {
    return undefined;
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  const leftCanonical = canonicalData(left);
  const rightCanonical = canonicalData(right);
  return leftCanonical !== undefined && leftCanonical === rightCanonical;
}

function modelId(proposalId: string, rosterId: string, itemId: string, compositionId: string, index: number): string {
  return `m4:${proposalId}:${rosterId}:${itemId}:${compositionId}:model:${index}`;
}

function copyApprovedArray<T>(values: readonly T[]): T[] {
  const copy: T[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const descriptor = getOwnPropertyDescriptor(values, String(index));
    if (!descriptor || !('value' in descriptor)) throw new Error('Le pilote M4 approuvé contient un tableau non déterministe.');
    copy.push(descriptor.value as T);
  }
  return copy;
}

/**
 * Strictly compiles either human-approved M4 roster.  This is intentionally
 * not a coverage adapter: T03/T04 still own all claims about rules, weapons,
 * physical profiles and scenario execution.
 */
export class M4ApprovedRosterSimulationAdapter implements RosterSimulationAdapter<RosterDraft> {
  readonly version = 'm4-approved-roster-adapter/v1';
  private readonly proposal = approvedM4RosterPilotProposal;

  constructor(private readonly database: NormalizedDatabase) {}

  adapt(draft: RosterDraft): RosterSimulationAdaptation {
    const refusalByKey = new Map<string, RosterSimulationRefusal>();
    const add = (code: string, subjectId: string, reason: string, expected?: unknown, actual?: unknown): void => {
      const refusal: RosterSimulationRefusal = {
        code,
        subjectId,
        reason,
        ...(expected === undefined ? {} : { expected: stableString(expected) }),
        ...(actual === undefined ? {} : { actual: stableString(actual) })
      };
      refusalByKey.set(`${code}\u0000${subjectId}\u0000${refusal.expected ?? ''}\u0000${refusal.actual ?? ''}`, refusal);
    };

    const rawDraft: unknown = draft;
    if (!isRecord(rawDraft)) {
      return {
        rosterId: 'malformed-roster',
        modelIds: [],
        missingCoverage: [],
        coverageStatus: 'not-assessed',
        refusals: [{ code: 'malformed-roster', subjectId: 'm4:roster:unknown', reason: 'Le roster reçu n’est pas un objet RosterDraft.' }]
      };
    }

    const rosterId = stringField(rawDraft, 'id');
    const subjectRosterId = rosterId ?? 'unknown-roster';
    if (!rosterId) {
      add('malformed-roster', `m4:roster:${subjectRosterId}`, 'Le roster M4 doit avoir un identifiant textuel.');
    }
    if (this.database.fingerprint !== this.proposal.catalog.fingerprint
      || this.database.dataInfo?.Version !== this.proposal.catalog.version
      || this.database.dataInfo?.PublishDate !== this.proposal.catalog.publishDate) {
      add(
        'catalog-stale',
        'm4:catalog',
        'Le catalogue actif ne correspond pas à l’empreinte, la version et la date approuvées du pilote M4.',
        this.proposal.catalog,
        { fingerprint: this.database.fingerprint, version: this.database.dataInfo?.Version, publishDate: this.database.dataInfo?.PublishDate }
      );
    }
    const approvedRoster = rosterId ? this.proposal.rosters.find((candidate) => candidate.draft.id === rosterId) : undefined;
    if (!approvedRoster) {
      add(
        'roster-identity',
        `m4:roster:${subjectRosterId}`,
        'Ce roster ne correspond à aucun des deux pilotes M4 approuvés.',
        this.proposal.rosters.map((candidate) => candidate.draft.id),
        rosterId
      );
      return this.result(subjectRosterId, refusalByKey, []);
    }

    const approvedDraft = approvedRoster.draft;
    const rosterSubject = `m4:roster:${approvedDraft.id}`;
    if (!hasExactOwnKeys(rawDraft, approvedDraft)) {
      add('roster-shape-mismatch', rosterSubject, 'Les champs du roster doivent correspondre exactement au pilote M4 approuvé.', getOwnPropertyNames(approvedDraft).sort(compareText), getOwnPropertyNames(rawDraft).sort(compareText));
    }
    this.compareRosterIdentity(rawDraft, approvedDraft, rosterSubject, add);
    this.compareItems(ownDataValue(rawDraft, 'items'), approvedRoster, approvedDraft, rosterSubject, add);

    const modelIds = refusalByKey.size === 0 ? this.modelIds(approvedDraft, approvedRoster) : [];
    return this.result(approvedDraft.id, refusalByKey, modelIds);
  }

  private compareRosterIdentity(
    draft: Record<string, unknown>,
    approved: RosterDraft,
    rosterSubject: string,
    add: (code: string, subjectId: string, reason: string, expected?: unknown, actual?: unknown) => void
  ): void {
    const textChecks: ReadonlyArray<readonly [keyof Pick<RosterDraft, 'name' | 'primaryFaction' | 'scenario'>, string, string]> = [
      ['name', 'roster-name-mismatch', 'Le nom du roster diffère de la version approuvée.'],
      ['primaryFaction', 'faction-mismatch', 'La faction primaire diffère de la version approuvée.'],
      ['scenario', 'scenario-mismatch', 'Le scénario de liste diffère de la version approuvée.']
    ];
    for (const [field, code, reason] of textChecks) {
      const actual = ownDataValue(draft, field);
      if (actual !== approved[field]) add(code, `${rosterSubject}:${field}`, reason, approved[field], actual);
    }
    const battleSizePoints = ownDataValue(draft, 'battleSizePoints');
    if (battleSizePoints !== approved.battleSizePoints) {
      add('battle-size-mismatch', `${rosterSubject}:battle-size`, 'Le format de bataille diffère de la version approuvée.', approved.battleSizePoints, battleSizePoints);
    }
    const detachmentIds = ownDataValue(draft, 'detachmentIds');
    if (!sameValue(detachmentIds, approved.detachmentIds)) {
      add('detachment-mismatch', `${rosterSubject}:detachments`, 'Les détachements doivent correspondre exactement au pilote approuvé.', approved.detachmentIds, detachmentIds);
    }
    const primaryMissionId = ownDataValue(draft, 'primaryMissionId');
    if (!sameValue(primaryMissionId, approved.primaryMissionId)) {
      add('scenario-mismatch', `${rosterSubject}:primary-mission`, 'Le contexte de mission ne fait pas partie du pilote approuvé.', approved.primaryMissionId, primaryMissionId);
    }
  }

  private compareItems(
    rawItems: unknown,
    approvedRoster: ApprovedM4RosterPilot['rosters'][number],
    approvedDraft: RosterDraft,
    rosterSubject: string,
    add: (code: string, subjectId: string, reason: string, expected?: unknown, actual?: unknown) => void
  ): void {
    if (!isDataArray(rawItems)) {
      add('malformed-roster', `${rosterSubject}:items`, 'Les éléments du roster M4 doivent former un tableau.', 'array', rawItems);
      return;
    }

    const supplied = new Map<string, Record<string, unknown>[]>();
    for (let index = 0; index < rawItems.length; index += 1) {
      const descriptor = getOwnPropertyDescriptor(rawItems, String(index));
      const rawItem = descriptor && 'value' in descriptor ? descriptor.value : undefined;
      if (!isRecord(rawItem)) {
        add('malformed-roster-item', `${rosterSubject}:item:at-${index}`, 'Un élément de roster doit être un objet.', 'RosterItem', rawItem);
        continue;
      }
      const itemId = stringField(rawItem, 'id');
      if (!itemId) {
        add('malformed-roster-item', `${rosterSubject}:item:at-${index}`, 'Chaque élément du roster doit avoir un identifiant textuel.', 'approved item id', rawItem.id);
        continue;
      }
      const entries = supplied.get(itemId) ?? [];
      entries.push(rawItem);
      supplied.set(itemId, entries);
    }

    const approvedById = new Map(approvedDraft.items.map((item) => [item.id, item]));
    for (const [itemId, entries] of supplied) {
      if (!approvedById.has(itemId)) {
        add('roster-item-extra', `${rosterSubject}:item:${itemId}`, 'Cet élément n’appartient pas au pilote M4 approuvé.', [...approvedById.keys()].sort(compareText), itemId);
      }
      if (entries.length > 1) {
        add('roster-item-duplicate', `${rosterSubject}:item:${itemId}`, 'Un élément approuvé apparaît plusieurs fois dans le roster.', 1, entries.length);
      }
    }

    for (const approvedItem of approvedDraft.items) {
      const entries = supplied.get(approvedItem.id) ?? [];
      const itemSubject = `${rosterSubject}:item:${approvedItem.id}`;
      if (entries.length === 0) {
        add('roster-item-missing', itemSubject, 'Un élément requis par le pilote M4 est absent.', approvedItem.id);
        continue;
      }
      this.compareItem(entries[0], approvedItem, approvedRoster, approvedDraft, itemSubject, add);
    }
  }

  private compareItem(
    item: Record<string, unknown>,
    approvedItem: RosterDraft['items'][number],
    approvedRoster: ApprovedM4RosterPilot['rosters'][number],
    approvedDraft: RosterDraft,
    itemSubject: string,
    add: (code: string, subjectId: string, reason: string, expected?: unknown, actual?: unknown) => void
  ): void {
    if (!hasExactOwnKeys(item, approvedItem)) {
      add('roster-item-shape-mismatch', `${itemSubject}:shape`, 'Les champs de cet élément doivent correspondre exactement au pilote M4 approuvé.', getOwnPropertyNames(approvedItem).sort(compareText), getOwnPropertyNames(item).sort(compareText));
    }
    const unitId = ownDataValue(item, 'unitId');
    if (unitId !== approvedItem.unitId) {
      add('unit-mismatch', `${itemSubject}:unit`, 'La fiche d’unité diffère de celle approuvée pour cet élément.', approvedItem.unitId, unitId);
    }
    const pointIndex = ownDataValue(item, 'pointIndex');
    if (pointIndex !== approvedItem.pointIndex) {
      add('point-index-mismatch', `${itemSubject}:point-index`, 'La taille ou le coût sélectionné diffère de la version approuvée.', approvedItem.pointIndex, pointIndex);
    }
    const modelCounts = ownDataValue(item, 'modelCounts');
    if (!mapEquals(modelCounts, approvedItem.modelCounts ?? {})) {
      add('model-count-mismatch', `${itemSubject}:model-counts`, 'Les effectifs par composition doivent correspondre exactement au pilote approuvé.', approvedItem.modelCounts ?? {}, modelCounts);
    }
    const enhancement = ownDataValue(item, 'enhancement');
    if (enhancement !== undefined) {
      add('enhancement-mismatch', `${itemSubject}:enhancement`, 'Aucune amélioration n’est approuvée pour cet élément M4.', undefined, enhancement);
    }

    const wargearSelections = ownDataValue(item, 'wargearSelections');
    const wargearSelectionCounts = ownDataValue(item, 'wargearSelectionCounts');
    const summaryMap = emptySelectionMap(wargearSelections);
    const countMap = emptySelectionMap(wargearSelectionCounts, true);
    if (summaryMap === 'malformed' || countMap === 'malformed') {
      add('malformed-wargear', `${itemSubject}:wargear`, 'Les sélections d’équipement doivent être des cartes vides pour conserver l’équipement par défaut.', '{}', {
        wargearSelections,
        wargearSelectionCounts
      });
    } else if (summaryMap === 'selected' || countMap === 'selected') {
      add('elected-wargear', `${itemSubject}:wargear`, 'Toute option d’équipement élue est hors du pilote M4 : seul l’équipement par défaut figé est accepté.', '{}', {
        wargearSelections,
        wargearSelectionCounts
      });
    }

    const frozenUnit = approvedRoster.resolved.units.find((candidate) => candidate.id === approvedItem.unitId);
    const catalogDefault = defaultLoadoutFromCatalog(this.database, approvedDraft, approvedItem);
    if (!frozenUnit || !catalogDefault || !sameValue(catalogDefault, comparableFrozenLoadout(frozenUnit.frozenDefaultLoadout))) {
      add(
        'default-equipment-mismatch',
        `${itemSubject}:default-equipment`,
        'L’équipement par défaut résolu depuis le catalogue ne correspond pas à l’équipement figé et approuvé du pilote.',
        frozenUnit ? comparableFrozenLoadout(frozenUnit.frozenDefaultLoadout) : 'approved frozen loadout',
        catalogDefault ?? 'unresolvable catalog loadout'
      );
    }
  }

  private modelIds(approvedDraft: RosterDraft, approvedRoster: ApprovedM4RosterPilot['rosters'][number]): string[] {
    const frozenByUnitId = new Map(approvedRoster.resolved.units.map((unit) => [unit.id, unit.frozenDefaultLoadout]));
    return copyApprovedArray(approvedDraft.items)
      .sort((left, right) => compareText(left.id, right.id))
      .flatMap((item) => (frozenByUnitId.get(item.unitId)?.byComposition ?? [])
        .slice()
        .sort((left, right) => compareText(left.id, right.id))
        .flatMap((composition) => Array.from(
          { length: composition.modelCount },
          (_, index) => modelId(this.proposal.id, approvedDraft.id, item.id, composition.id, index)
        )));
  }

  private result(rosterId: string, refusals: ReadonlyMap<string, RosterSimulationRefusal>, modelIds: readonly string[]): RosterSimulationAdaptation {
    return {
      rosterId,
      modelIds,
      missingCoverage: [],
      coverageStatus: 'not-assessed',
      refusals: [...refusals.values()].sort((left, right) => compareText(left.code, right.code) || compareText(left.subjectId, right.subjectId))
    };
  }
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
