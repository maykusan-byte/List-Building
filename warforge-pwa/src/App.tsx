import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calculateItemCost, calculateRosterTotal, enhancementIsEligible, getDetachmentCost, getPointSizes, getSelectedDetachments, occurrenceForItem, resolvePointOption } from './domain/calculations';
import { isAlliedUnit, isUnitAvailableToFaction, sourceLabel } from './domain/catalog';
import { createCatalogLocalization, loadCatalogLocaleOverlay } from './domain/catalog-localization';
import { loadUnitImageManifest, unitImageMap, unitImageUrl } from './domain/unit-images';
import { EMPTY_ADVANCED_CATALOG_FILTERS, advancedCatalogFilterCount, matchesAdvancedCatalogFilters } from './domain/advanced-filters';
import { analyzeRoster } from './domain/analysis';
import { allocateInventory, getInventoryAvailability, parseInventoryCsv } from './domain/inventory';
import { normalizeDatabase } from './domain/normalize';
import { keepSelectableScenario, selectableScenarios } from './domain/scenarios';
import { cacheDatabase, cacheInventory, getCachedDatabase, getCachedInventory, readActiveDraftId, readFavorites, readSavedDrafts, writeActiveDraftId, writeFavorites, writeLocale, writeSavedDrafts } from './domain/storage';
import { localeTag, supportedLocale } from './i18n';
import { RulesPage } from './rules/RulesPage';
import { WeaponsPage } from './weapons/WeaponsPage';
import type { InventoryDataset, InventoryReservation } from './domain/inventory';
import type { AdvancedCatalogFilters } from './domain/advanced-filters';
import type { AnalysisTarget, ListAnalysis } from './domain/analysis';
import type { ExportedList, NormalizedDatabase, NormalizedDetachment, NormalizedUnit, RosterDraft, RosterItem, SavedDraft } from './domain/types';
import { validateDraft } from './domain/validation';
import { normalizeRosterItemWargear, optionQuantityLimit, resolveWargear, ruleLimit, selectionQuantity, updateModelCount, updateWargearQuantity, weaponProfiles } from './domain/wargear';
import type { SelectedWeaponProfile } from './domain/wargear';
import type { CatalogLocaleOverlay, CatalogLocaleStatus, CatalogLocalization } from './domain/catalog-localization';
import type { UnitImageEntry, UnitImageStatus } from './domain/unit-images';
import './styles.css';

const NEW_SCHEMA = 'warforge-list/v1';
const DATA_BASE_URL = `${import.meta.env.BASE_URL}data/`;

type AppView = 'builder' | 'rules' | 'weapons';

function viewFromHash(): AppView {
  if (window.location.hash.startsWith('#rules')) return 'rules';
  if (window.location.hash.startsWith('#weapons')) return 'weapons';
  return 'builder';
}

interface CustomTargetForm {
  enabled: boolean;
  label: string;
  toughness: string;
  save: string;
  vehicle: boolean;
  monster: boolean;
}

const DEFAULT_CUSTOM_TARGET: CustomTargetForm = {
  enabled: false,
  label: '',
  toughness: '8',
  save: '3',
  vehicle: false,
  monster: false
};

function newDraft(database: NormalizedDatabase): RosterDraft {
  const format = database.battleSizes.find((size) => size.PointsTotal === 2000) ?? database.battleSizes[0];
  return {
    id: crypto.randomUUID(),
    name: 'Nouvelle liste',
    primaryFaction: database.factions[0]?.id ?? '',
    battleSizePoints: format?.PointsTotal ?? 2000,
    scenario: 'TAKE AND HOLD',
    detachmentIds: [],
    items: []
  };
}

function restoreSavedDraft(saved: SavedDraft, database: NormalizedDatabase): RosterDraft | null {
  const stored = saved.draft;
  if (!stored || (saved.databaseFingerprint && saved.databaseFingerprint !== database.fingerprint)) return null;
  if (!database.factions.some((faction) => faction.id === stored.primaryFaction)) return null;
  if (!database.battleSizes.some((size) => size.PointsTotal === stored.battleSizePoints)) return null;
  if (!Array.isArray(stored.detachmentIds) || !Array.isArray(stored.items)) return null;
  if (!stored.detachmentIds.every((id) => database.detachments.some((detachment) => detachment.id === id))) return null;
  if (!stored.items.every((item) => item && database.units.some((unit) => unit.id === item.unitId))) return null;
  const detachments = database.detachments.filter((detachment) => stored.detachmentIds.includes(detachment.id));
  return {
    ...stored,
    id: saved.id,
    name: typeof stored.name === 'string' ? stored.name : saved.name,
    scenario: keepSelectableScenario(detachments, stored.scenario),
    items: stored.items.map(normalizeRosterItemWargear)
  };
}

function normalizeWithWorker(raw: string, workerFailureMessage: string): Promise<NormalizedDatabase> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; database?: NormalizedDatabase; error?: string }>) => {
      worker.terminate();
      if (event.data.ok && event.data.database) resolve(event.data.database);
      else reject(new Error(event.data.error ?? 'Erreur de normalisation de la base.'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error(workerFailureMessage));
    };
    worker.postMessage({ raw });
  });
}

function pointLabel(unit: NormalizedUnit, index: number, occurrence = 1, noCost = '—'): string {
  const option = resolvePointOption(unit, index, occurrence);
  if (!option) return noCost;
  return `${option.modelCount} fig. — ${option.cost} pts`;
}

function minimumPointCost(unit: NormalizedUnit, occurrence: number): number | null {
  const costs = getPointSizes(unit)
    .map((_, index) => resolvePointOption(unit, index, occurrence)?.cost)
    .filter((cost): cost is number => typeof cost === 'number');
  return costs.length > 0 ? Math.min(...costs) : null;
}

function downloadJson(filename: string, content: unknown): void {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function makeRosterItem(unitId: string): RosterItem {
  return { id: crypto.randomUUID(), unitId, pointIndex: 0, wargearSelections: {} };
}

const PROFILE_STATS = [
  { key: 'Movement', label: 'M', description: 'Mouvement' },
  { key: 'Toughness', label: 'E', description: 'Endurance' },
  { key: 'Save', label: 'Svg', description: 'Sauvegarde' },
  { key: 'Wounds', label: 'PV', description: 'Points de vie' },
  { key: 'Leadership', label: 'Cd', description: 'Commandement' },
  { key: 'OC', label: 'OC', description: 'Contrôle d’objectif' }
] as const;

function compositionLabel(model: { ModelName?: string; Limit?: { Min?: number; Max?: number } }, fallbackName: string): string {
  const name = model.ModelName?.trim() || fallbackName;
  const min = model.Limit?.Min;
  const max = model.Limit?.Max;
  if (typeof min === 'number' && typeof max === 'number') return min === max ? `x${min} ${name}` : `${min}–${max} ${name}`;
  if (typeof min === 'number') return `min. ${min} ${name}`;
  if (typeof max === 'number') return `max. ${max} ${name}`;
  return name;
}

function UnitProfile({ line }: { line: Record<string, unknown> }): React.JSX.Element {
  const { t } = useTranslation();
  const profileName = typeof line.StatName === 'string' ? line.StatName.trim() : '';
  return (
    <section className="unit-profile">
      {profileName && <h4>{profileName}</h4>}
      <dl className="unit-stat-grid">
        {PROFILE_STATS.map(({ key, label, description }) => (
          <div key={key}>
            <dt aria-label={t(`profile.${key === 'Movement' ? 'movement' : key === 'Toughness' ? 'toughness' : key === 'Save' ? 'save' : key === 'Wounds' ? 'wounds' : key === 'Leadership' ? 'leadership' : 'objectiveControl'}`)}>{label}</dt>
            <dd>{String(line[key] ?? '—')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function UnitThumbnail({
  unit,
  image,
  display,
  dataBaseUrl
}: {
  unit: NormalizedUnit;
  image: UnitImageEntry | undefined;
  display: CatalogLocalization;
  dataBaseUrl: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const name = display.unitName(unit);

  if (!image || failed) {
    return (
      <div className="unit-thumbnail unavailable" role="img" aria-label={t('library.imageUnavailable', { name })}>
        <span aria-hidden="true">?</span>
      </div>
    );
  }

  return (
    <div className="unit-thumbnail">
      <img
        src={unitImageUrl(image, dataBaseUrl)}
        alt={t('library.unitImage', { name })}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function WeaponTable({ profiles, display, compact = false }: { profiles: SelectedWeaponProfile[]; display: CatalogLocalization; compact?: boolean }): React.JSX.Element | null {
  const { t } = useTranslation();
  if (profiles.length === 0) return null;
  const groups = new Map<string, SelectedWeaponProfile[]>();
  profiles.forEach((entry) => {
    const values = groups.get(entry.group) ?? [];
    values.push(entry);
    groups.set(entry.group, values);
  });
  return (
    <div className={`weapon-tables ${compact ? 'compact' : ''}`}>
      {[...groups.entries()].map(([group, entries]) => (
        <section className="weapon-table-section" key={group}>
          <h4>{display.term(group)}</h4>
          <div className="weapon-table-scroll">
            <table>
              <thead><tr><th>{t('weapons.weapon')}</th><th>{t('weapons.range')}</th><th>A</th><th>{entries[0].melee ? 'CC' : 'CT'}</th><th>F</th><th>PA</th><th>D</th><th>{t('weapons.abilities')}</th></tr></thead>
              <tbody>
                {entries.map(({ profile }, index) => (
                  <tr key={`${profile.Name ?? 'arme'}-${index}`}>
                    <th scope="row">{profile.Name || t('weapons.weapon')}</th>
                    <td>{profile.Range || '—'}</td><td>{profile.Attacks || '—'}</td><td>{profile.ToHit || '—'}</td>
                    <td>{profile.Strength || '—'}</td><td>{profile.AP || '—'}</td><td>{profile.Damage || '—'}</td><td>{display.term(profile.Keywords) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

type AdvancedCatalogFilterKey = keyof AdvancedCatalogFilters;

function AdvancedCatalogFilterInput({
  field,
  label,
  filters,
  onChange
}: {
  field: AdvancedCatalogFilterKey;
  label: string;
  filters: AdvancedCatalogFilters;
  onChange: (field: AdvancedCatalogFilterKey, value: string) => void;
}): React.JSX.Element {
  return (
    <label className="advanced-filter-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        step="1"
        placeholder="—"
        value={filters[field]}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </label>
  );
}

function AdvancedCatalogFilterMenu({
  filters,
  activeCount,
  onChange,
  onReset
}: {
  filters: AdvancedCatalogFilters;
  activeCount: number;
  onChange: (field: AdvancedCatalogFilterKey, value: string) => void;
  onReset: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <details className="advanced-filters">
      <summary>{t('library.advanced')}{activeCount > 0 ? ` · ${t('library.active', { count: activeCount })}` : ''}</summary>
      <div className="advanced-filter-content">
        <section className="advanced-filter-group" aria-labelledby="unit-stat-filter-title">
          <div>
            <h3 id="unit-stat-filter-title">{t('library.unitStats')}</h3>
            <p>{t('library.unitStatsHelp')}</p>
          </div>
          <div className="advanced-filter-grid">
            <AdvancedCatalogFilterInput field="minimumMovement" label="M ≥" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="minimumToughness" label="E ≥" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="maximumSave" label="Svg ≤" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="minimumWounds" label="PV ≥" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="maximumLeadership" label="Cd ≤" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="minimumObjectiveControl" label="OC ≥" filters={filters} onChange={onChange} />
          </div>
        </section>
        <section className="advanced-filter-group" aria-labelledby="weapon-stat-filter-title">
          <div>
            <h3 id="weapon-stat-filter-title">{t('library.weaponStats')}</h3>
            <p>{t('library.weaponStatsHelp')}</p>
          </div>
          <div className="advanced-filter-grid">
            <AdvancedCatalogFilterInput field="minimumWeaponRange" label={`${t('weapons.range')} ≥`} filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="minimumWeaponAttacks" label="A ≥" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="maximumWeaponSkill" label="CC / CT ≤" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="minimumWeaponStrength" label="F ≥" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="maximumWeaponAP" label="PA ≤" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="minimumWeaponDamage" label="D ≥" filters={filters} onChange={onChange} />
          </div>
        </section>
        <div className="advanced-filter-footer">
          <p className="muted">{t('library.randomValues')}</p>
          <button className="secondary" type="button" disabled={activeCount === 0} onClick={onReset}>{t('action.reset')}</button>
        </div>
      </div>
    </details>
  );
}

function formatAnalysisValue(value: number, locale: string): string {
  return value.toLocaleString(localeTag(locale), { maximumFractionDigits: 1 });
}

function AnalysisMetric({ label, value, detail }: { label: string; value: string | number; detail?: string }): React.JSX.Element {
  return (
    <div className="analysis-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function ListAnalysisPanel({
  analysis,
  customTarget,
  database,
  display,
  onCustomTargetChange
}: {
  analysis: ListAnalysis;
  customTarget: CustomTargetForm;
  database: NormalizedDatabase;
  display: CatalogLocalization;
  onCustomTargetChange: (target: CustomTargetForm) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const utilityMetrics = [
    { label: t('analysis.utility.fly'), count: analysis.mobility.flyUnits },
    { label: t('analysis.utility.deepStrike'), count: analysis.mobility.deepStrikeUnits },
    { label: t('analysis.utility.scouts'), count: analysis.mobility.scoutUnits },
    { label: t('analysis.utility.infiltrators'), count: analysis.mobility.infiltratorUnits },
    { label: t('analysis.utility.stealth'), count: analysis.utility.stealthUnits },
    { label: t('analysis.utility.loneOperative'), count: analysis.utility.loneOperativeUnits },
    { label: t('analysis.utility.feelNoPain'), count: analysis.utility.feelNoPainUnits },
    { label: t('analysis.utility.indirectFire'), count: analysis.utility.indirectFireUnits },
    { label: t('analysis.utility.torrent'), count: analysis.utility.torrentUnits }
  ].filter(({ count }) => count > 0);

  return (
    <details className="list-analysis" open>
      <summary>
        <span>{t('analysis.title')}</span>
        <small>{t('analysis.subtitle')}</small>
      </summary>
      <div className="list-analysis-content">
        <section className="analysis-section">
          <div className="analysis-heading">
            <div><h3>{t('analysis.offense')}</h3><p>{t('analysis.offenseHelp')}</p></div>
          </div>
          <details className="custom-target-controls">
            <summary>{t('analysis.customTarget')}</summary>
            <div className="custom-target-grid">
              <label className="custom-target-enable"><input type="checkbox" checked={customTarget.enabled} onChange={(event) => onCustomTargetChange({ ...customTarget, enabled: event.target.checked })} /> {t('analysis.include')}</label>
              <label>{t('analysis.name')}<input type="text" placeholder={t('analysis.customTarget')} value={customTarget.label} onChange={(event) => onCustomTargetChange({ ...customTarget, label: event.target.value })} /></label>
              <label>{t('analysis.toughness')}<input type="number" min="1" max="99" value={customTarget.toughness} onChange={(event) => onCustomTargetChange({ ...customTarget, toughness: event.target.value })} /></label>
              <label>{t('analysis.save')}<select value={customTarget.save} onChange={(event) => onCustomTargetChange({ ...customTarget, save: event.target.value })}>{[2, 3, 4, 5, 6].map((save) => <option key={save} value={save}>{save}+</option>)}</select></label>
              <label className="custom-target-check"><input type="checkbox" checked={customTarget.vehicle} onChange={(event) => onCustomTargetChange({ ...customTarget, vehicle: event.target.checked })} /> {t('analysis.vehicle')}</label>
              <label className="custom-target-check"><input type="checkbox" checked={customTarget.monster} onChange={(event) => onCustomTargetChange({ ...customTarget, monster: event.target.checked })} /> {t('analysis.monster')}</label>
            </div>
          </details>
          <div className="analysis-damage-table-scroll">
            <table className="analysis-damage-table">
              <thead>
                <tr>
                  <th scope="col">{t('analysis.unit')}</th>
                  {analysis.targets.map((target) => <th key={target.id} scope="col"><span>{target.label || t(`analysis.target.${target.id}`)}</span><small>E {target.toughness} · Svg {target.save}+</small></th>)}
                </tr>
              </thead>
              <tbody>
                {analysis.unitDamages.map((unit) => (
                  <tr key={unit.itemId}>
                    <th scope="row"><span>{(() => { const source = database.units.find((candidate) => candidate.id === unit.unitId); return source ? display.unitName(source) : unit.unitName; })()}</span><small>{t('app.model', { count: unit.modelCount })}</small><small className="analysis-unit-points">{unit.points} pts</small></th>
                    {unit.targets.map((target) => (
                      <td key={target.targetId}>
                        <strong>{formatAnalysisValue(target.totalDamage, i18n.language)}</strong>
                        <small>{t('weapons.ranged')} {formatAnalysisValue(target.rangedDamage, i18n.language)} · {t('weapons.melee')} {formatAnalysisValue(target.meleeDamage, i18n.language)}</small>
                      </td>
                    ))}
                  </tr>
                ))}
                {analysis.unitDamages.length === 0 && <tr><td className="analysis-empty" colSpan={analysis.targets.length + 1}>{t('analysis.empty')}</td></tr>}
              </tbody>
              {analysis.unitDamages.length > 0 && (
                <tfoot>
                  <tr>
                    <th scope="row">{t('analysis.total')}</th>
                    {analysis.targets.map((target) => (
                      <td key={target.id}>
                        <strong>{formatAnalysisValue(target.totalDamage, i18n.language)}</strong>
                        <small><span className={`coverage-badge ${target.coverage}`}>{t(`analysis.coverage.${target.coverage === 'couvert' ? 'covered' : target.coverage}`)}</span> {t('analysis.sources', { count: target.sourceUnits })}</small>
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        <section className="analysis-section analysis-overview-grid">
          <article>
            <h3>{t('analysis.mobility')}</h3>
            <dl className="analysis-metrics-grid">
              <AnalysisMetric label={t('analysis.bestMove')} value={analysis.mobility.maximumMove === null ? '—' : `${formatAnalysisValue(analysis.mobility.maximumMove, i18n.language)}″`} />
              <AnalysisMetric label={t('analysis.longestRange')} value={analysis.mobility.longestRange === null ? '—' : `${formatAnalysisValue(analysis.mobility.longestRange, i18n.language)}″`} />
              <AnalysisMetric label={t('analysis.fastUnits')} value={analysis.mobility.fastUnits} detail="M ≥ 10″" />
              <AnalysisMetric label={t('analysis.rapidDeployment')} value={analysis.mobility.deepStrikeUnits + analysis.mobility.scoutUnits + analysis.mobility.infiltratorUnits} detail={t('analysis.utility.deepStrike')} />
            </dl>
          </article>
          <article>
            <h3>{t('analysis.resilience')}</h3>
            <dl className="analysis-metrics-grid">
              <AnalysisMetric label={t('analysis.totalWounds')} value={formatAnalysisValue(analysis.resilience.totalWounds, i18n.language)} />
              <AnalysisMetric label={t('analysis.toughCore')} value={formatAnalysisValue(analysis.resilience.toughWounds, i18n.language)} detail="Wounds" />
              <AnalysisMetric label={t('analysis.saveTwo')} value={formatAnalysisValue(analysis.resilience.saveTwoWounds, i18n.language)} detail="Wounds" />
              <AnalysisMetric label={t('analysis.saveThree')} value={formatAnalysisValue(analysis.resilience.saveThreeWounds, i18n.language)} detail="Wounds" />
            </dl>
          </article>
          <article>
            <h3>{t('analysis.control')}</h3>
            <dl className="analysis-metrics-grid">
              <AnalysisMetric label={t('analysis.baseOc')} value={formatAnalysisValue(analysis.control.totalObjectiveControl, i18n.language)} />
              <AnalysisMetric label={t('analysis.models')} value={analysis.control.modelCount} />
              <AnalysisMetric label={t('analysis.battleline')} value={analysis.control.battlelineUnits} />
              <AnalysisMetric label={t('analysis.resolvedProfiles')} value={analysis.resilience.resolvedModels} />
            </dl>
          </article>
        </section>

        <section className="analysis-section">
          <h3>{t('analysis.tactical')}</h3>
          {utilityMetrics.length > 0 ? (
            <div className="analysis-utility-list">{utilityMetrics.map(({ label, count }) => <span key={label}>{label} <strong>{count}</strong></span>)}</div>
          ) : <p className="muted">{t('analysis.noTactical')}</p>}
          {analysis.resilience.unresolvedUnits > 0 && <p className="analysis-warning">{t('analysis.fallbackProfiles', { count: analysis.resilience.unresolvedUnits })}</p>}
        </section>

        <details className="analysis-assumptions">
          <summary>{t('analysis.assumptions')}</summary>
          <ul>{analysis.assumptions.map((assumption) => <li key={assumption}>{t(`analysis.assumption.${assumption}`)}</li>)}</ul>
        </details>
      </div>
    </details>
  );
}

function WargearEditor({
  unit,
  item,
  detachmentNames,
  display,
  onChange
}: {
  unit: NormalizedUnit;
  item: RosterItem;
  detachmentNames: string[];
  display: CatalogLocalization;
  onChange: (item: RosterItem) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const wargear = resolveWargear(unit, item, detachmentNames);
  const sourceProfiles = weaponProfiles(unit);
  if (wargear.byComposition.length === 0 && sourceProfiles.length === 0) return null;
  const detachmentAvailable = (name: string | undefined) => !name || detachmentNames.some((candidate) => candidate.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const allMatchedProfiles = wargear.byComposition.some((model) => model.profiles.length > 0);

  return (
    <section className="wargear-editor">
      <div className="wargear-heading"><h4>{t('wargear.title')}</h4><span>{t('app.model', { count: wargear.totalModels })}</span></div>
      {wargear.byComposition.map(({ composition, rules, equipment, profiles, nonProfileEquipment }) => (
        <details className="model-wargear model-wargear-dropdown" key={composition.id}>
          <summary><span>{composition.label}</span><span>×{composition.count}</span></summary>
          <div className="model-wargear-content">
            {composition.editable && (
              <label className="model-count-select">
                {t('wargear.size', { name: composition.label })} <small>{composition.min}–{composition.max}</small>
                <input
                  type="number"
                  min={composition.min}
                  max={composition.max}
                  value={composition.count}
                  onChange={(event) => onChange(updateModelCount(unit, item, composition.id, Number(event.target.value)))}
                />
              </label>
            )}
            {equipment.length > 0 && (
              <section className="model-equipment">
                <h5>{t('wargear.selected')}</h5>
                <div className="tag-row">
                  {equipment.map((entry) => <span className={entry.hasProfile ? '' : 'non-profile'} key={entry.name}>×{entry.count} {display.term(entry.name)}</span>)}
                </div>
                {nonProfileEquipment.length > 0 && <p className="muted">{t('wargear.withoutProfile', { equipment: nonProfileEquipment.map((entry) => display.term(entry.name)).join(', ') })}</p>}
              </section>
            )}
            {rules.length === 0 && <p className="muted">{t('wargear.none')}</p>}
            {rules.map((rule) => {
              const selected = wargear.selections[rule.id] ?? {};
              const selectedTotal = Object.values(selected).reduce((sum, count) => sum + count, 0);
              const maximum = ruleLimit(rule, composition.count, wargear.totalModels);
              const required = detachmentAvailable(rule.requiredDetachment);
              return (
                <section className="wargear-rule" key={rule.id}>
                  <div className="wargear-rule-heading">
                    <span>{rule.replaces.length > 0 ? t('wargear.replaces', { equipment: rule.replaces.map(display.term).join(' + ') }) : t('wargear.additional')}</span>
                    <small>{t('wargear.selectedCount', { count: maximum, selected: selectedTotal, maximum })}{rule.perXModels ? ` · 1/${rule.perXModels}` : ''}</small>
                  </div>
                  {rule.requiredDetachment && <p className={required ? 'wargear-requirement' : 'wargear-requirement warning'}>{t('wargear.requires', { detachment: rule.requiredDetachment })}</p>}
                  <div className="wargear-options">
                    {rule.options.map((option) => {
                      const quantity = selectionQuantity(item, rule.id, option);
                      const quantityLimit = optionQuantityLimit(item, rule, composition.count, wargear.totalModels, option);
                      return (
                        <label className="wargear-option" key={option}>
                          <span>{display.term(option)}</span>
                          <select
                            aria-label={t('wargear.quantity', { option: display.term(option) })}
                            disabled={!required}
                            value={quantity}
                            onChange={(event) => onChange(updateWargearQuantity(item, rule.id, option, Number(event.target.value)))}
                          >
                            {Array.from({ length: quantityLimit + 1 }, (_, value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {profiles.length > 0 && (
              <section className="model-weapon-profiles">
                <h5>{t('wargear.selectedProfiles')}</h5>
                <WeaponTable profiles={profiles} display={display} compact />
              </section>
            )}
          </div>
        </details>
      ))}
      {!allMatchedProfiles && sourceProfiles.length > 0 && (
        <details className="model-wargear model-wargear-dropdown unit-weapon-profiles">
          <summary><span>{t('weapons.unitProfiles')}</span></summary>
          <div className="model-wargear-content"><WeaponTable profiles={sourceProfiles} display={display} compact /></div>
        </details>
      )}
    </section>
  );
}

function CompactRule({ detachment, display }: { detachment: NormalizedDetachment; display: CatalogLocalization }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <details className="rule-details">
      <summary>{t('command.ruleOptions')}</summary>
      {detachment.Rule?.Title && <strong>{detachment.Rule.Title}</strong>}
      {detachment.Rule?.Text && <p>{detachment.Rule.Text}</p>}
      {detachment.Rule?.Restrictions && <p className="notice-text">{t('command.restriction', { text: detachment.Rule.Restrictions })}</p>}
      {(detachment.Stratagems?.length ?? 0) > 0 && (
        <div className="mini-list">
          <strong>{t('command.stratagems')}</strong>
          {detachment.Stratagems?.map((stratagem, index) => (
            <span key={`${detachment.id}-stratagem-${index}`}>{display.term(stratagem.Name)} ({stratagem.CPCost ?? '?'} PC)</span>
          ))}
        </div>
      )}
      {(detachment.Enhancements?.length ?? 0) > 0 && (
        <div className="mini-list">
          <strong>{t('command.enhancements')}</strong>
          {detachment.Enhancements?.map((enhancement, index) => (
            <span key={`${detachment.id}-enhancement-${index}`}>{display.term(enhancement.Name)} ({enhancement.Cost ?? 0} pts)</span>
          ))}
        </div>
      )}
    </details>
  );
}

interface RosterCardProps {
  database: NormalizedDatabase;
  item: RosterItem;
  draft: RosterDraft;
  inventoryReservation?: InventoryReservation;
  display: CatalogLocalization;
  onChange: (item: RosterItem) => void;
  onRemove: () => void;
}

function RosterCard({ database, item, draft, inventoryReservation, display, onChange, onRemove }: RosterCardProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const unit = database.units.find((candidate) => candidate.id === item.unitId);
  if (!unit) return null;
  const occurrence = occurrenceForItem(draft.items, item);
  const breakdown = calculateItemCost(database, item, draft.items, draft.detachmentIds);
  const selectedDetachments = database.detachments.filter((detachment) => draft.detachmentIds.includes(detachment.id));
  const enhancementOptions = selectedDetachments.flatMap((detachment) =>
    (detachment.Enhancements ?? []).map((enhancement, enhancementIndex) => ({ detachment, enhancement, enhancementIndex }))
  ).filter(({ enhancement }) => enhancementIsEligible(unit, enhancement));
  const enhancementValue = item.enhancement ? `${item.enhancement.detachmentId}::${item.enhancement.enhancementIndex}` : '';

  return (
    <article className="roster-card">
      <button className="icon-button danger" aria-label={t('roster.removeUnit', { name: display.unitName(unit) })} onClick={onRemove}>×</button>
      <h3>{display.unitName(unit)}</h3>
      <p className="muted">{display.factionName(unit.factionName)} · {pointLabel(unit, item.pointIndex, occurrence, t('feedback.profileWithoutCost'))} · {t('roster.occurrence', { count: occurrence })}</p>
      <label>
        {t('roster.baseSize')}
        <select value={item.pointIndex} onChange={(event) => onChange({ ...item, pointIndex: Number(event.target.value) })}>
          {getPointSizes(unit).map((_, index) => <option key={index} value={index}>{pointLabel(unit, index, occurrence, t('feedback.profileWithoutCost'))}</option>)}
        </select>
      </label>
      <WargearEditor unit={unit} item={item} detachmentNames={selectedDetachments.map((detachment) => detachment.displayName)} display={display} onChange={onChange} />
      {enhancementOptions.length > 0 && (
        <label>
          {t('roster.enhancement')}
          <select
            value={enhancementValue}
            onChange={(event) => {
              if (!event.target.value) {
                onChange({ ...item, enhancement: undefined });
                return;
              }
              const separator = event.target.value.lastIndexOf('::');
              onChange({
                ...item,
                enhancement: {
                  detachmentId: event.target.value.slice(0, separator),
                  enhancementIndex: Number(event.target.value.slice(separator + 2))
                }
              });
            }}
          >
            <option value="">{t('roster.noEnhancement')}</option>
            {enhancementOptions.map(({ detachment, enhancement, enhancementIndex }) => (
              <option key={`${detachment.id}-${enhancementIndex}`} value={`${detachment.id}::${enhancementIndex}`}>
                {enhancement.Name} — {enhancement.Cost ?? 0} pts ({display.detachmentName(detachment)})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="cost-line">
        <span>{t('roster.baseCost', { cost: breakdown.base })} {breakdown.pointOverride !== undefined ? t('roster.surcharge', { cost: breakdown.pointOverride }) : ''}</span>
        <strong>{breakdown.total} pts</strong>
      </div>
      {(breakdown.wargear > 0 || breakdown.enhancement > 0) && (
        <p className="muted">{t('roster.equipment', { cost: breakdown.wargear, enhancement: breakdown.enhancement })}</p>
      )}
      {inventoryReservation?.hasCatalogEntry && (
        <p className="inventory-reservation">
          {t('roster.reserved', { real: inventoryReservation.realFigureIds.length, proxy: inventoryReservation.proxyFigureIds.length })}
          {inventoryReservation.missing > 0 && <strong className="inventory-warning"> · {t('roster.missing', { count: inventoryReservation.missing })}</strong>}
        </p>
      )}
    </article>
  );
}

export default function App(): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const locale = supportedLocale(i18n.resolvedLanguage ?? i18n.language);
  const [database, setDatabase] = useState<NormalizedDatabase | null>(null);
  const [draft, setDraft] = useState<RosterDraft | null>(null);
  const [inventory, setInventory] = useState<InventoryDataset | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState('Inventaire en attente de la base.');
  const [status, setStatus] = useState(() => t('feedback.loading'));
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [detachmentCatalogExpanded, setDetachmentCatalogExpanded] = useState(false);
  const [unitCatalogExpanded, setUnitCatalogExpanded] = useState(false);
  const [advancedCatalogFilters, setAdvancedCatalogFilters] = useState<AdvancedCatalogFilters>({ ...EMPTY_ADVANCED_CATALOG_FILTERS });
  const [customTarget, setCustomTarget] = useState<CustomTargetForm>(DEFAULT_CUSTOM_TARGET);
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites());
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>(() => readSavedDrafts().flatMap((saved) => {
    if (!Array.isArray(saved.draft?.items)) return [];
    return [{ ...saved, draft: { ...saved.draft, items: saved.draft.items.map(normalizeRosterItemWargear) } }];
  }));
  const savedDraftsRef = useRef(savedDrafts);
  const startupDraftsRef = useRef(savedDrafts);
  const startupActiveDraftIdRef = useRef(readActiveDraftId());
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [visibleUnits, setVisibleUnits] = useState(60);
  const [notice, setNotice] = useState<string | null>(null);
  const [catalogOverlay, setCatalogOverlay] = useState<CatalogLocaleOverlay | null>(null);
  const [catalogLocaleStatus, setCatalogLocaleStatus] = useState<CatalogLocaleStatus>(locale === 'fr' ? 'unavailable' : 'not-needed');
  const [unitImages, setUnitImages] = useState<ReadonlyMap<string, UnitImageEntry>>(() => new Map());
  const [unitImageStatus, setUnitImageStatus] = useState<UnitImageStatus>('unavailable');
  const [view, setView] = useState<AppView>(viewFromHash);
  const databaseInputRef = useRef<HTMLInputElement>(null);
  const inventoryInputRef = useRef<HTMLInputElement>(null);
  const listInputRef = useRef<HTMLInputElement>(null);

  const display = useMemo(
    () => createCatalogLocalization(locale, catalogOverlay, catalogLocaleStatus),
    [locale, catalogOverlay, catalogLocaleStatus]
  );
  const scenarioTitle = (id: string): string => t(`scenarios.${id}.label`);
  const scenarioGuide = (id: string): string => t(`scenarios.${id}.guide`);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const onHashChange = (): void => setView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!database) return;
    let active = true;
    void loadCatalogLocaleOverlay(locale, database, DATA_BASE_URL).then((result) => {
      if (!active) return;
      setCatalogOverlay(result.overlay);
      setCatalogLocaleStatus(result.status);
    });
    return () => { active = false; };
  }, [database, locale]);

  useEffect(() => {
    if (!database) {
      setUnitImages(new Map());
      setUnitImageStatus('unavailable');
      return;
    }
    let active = true;
    void loadUnitImageManifest(database, DATA_BASE_URL).then((result) => {
      if (!active) return;
      setUnitImages(unitImageMap(result.manifest));
      setUnitImageStatus(result.status);
    });
    return () => { active = false; };
  }, [database]);

  const changeLocale = (value: string): void => {
    const nextLocale = supportedLocale(value);
    writeLocale(nextLocale);
    void i18n.changeLanguage(nextLocale);
  };

  const installDatabase = async (nextDatabase: NormalizedDatabase, source: string): Promise<void> => {
    setDatabase(nextDatabase);
    setDraft((current) => {
      if (current) return current;
      const preferredId = startupActiveDraftIdRef.current;
      const candidates = [...startupDraftsRef.current].sort((left, right) => Number(right.id === preferredId) - Number(left.id === preferredId));
      return candidates.map((saved) => restoreSavedDraft(saved, nextDatabase)).find((saved): saved is RosterDraft => saved !== null) ?? newDraft(nextDatabase);
    });
    setStatus(`${source} · ${nextDatabase.units.length.toLocaleString(localeTag(locale))} ${t('app.units', { count: nextDatabase.units.length })}, ${nextDatabase.detachments.length} ${t('roster.selectedDetachments').toLocaleLowerCase()}`);
    setError(null);
    try {
      await cacheDatabase(nextDatabase);
    } catch {
      setNotice(t('feedback.cacheDatabase'));
    }
  };

  const installInventory = async (nextInventory: InventoryDataset): Promise<void> => {
    setInventory(nextInventory);
    setInventoryStatus(t('status.associations', { source: nextInventory.sourceLabel, count: nextInventory.entries.length }));
    try {
      await cacheInventory(nextInventory);
    } catch {
      setNotice(t('feedback.cacheInventory'));
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`${DATA_BASE_URL}catalog.json`);
        if (!response.ok) throw new Error(t('feedback.databaseUnavailable'));
        await installDatabase(await normalizeWithWorker(await response.text(), t('feedback.normalizationFailed')), t('status.integrated'));
      } catch (loadError) {
        try {
          const cached = await getCachedDatabase();
          if (!cached) throw loadError;
          await installDatabase(cached, t('status.cache'));
        } catch {
          setError(loadError instanceof Error ? loadError.message : t('feedback.databaseLoadFailed'));
          setStatus(t('feedback.loadingFailed'));
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (!database) return;
    let active = true;

    void (async () => {
      let cached: InventoryDataset | null = null;
      try {
        cached = await getCachedInventory();
      } catch {
        // A missing IndexedDB cache must not prevent loading the bundled CSV.
      }
      if (!active) return;
      if (cached?.sourceKind === 'local' && cached.databaseFingerprint === database.fingerprint) {
        setInventory(cached);
        setInventoryStatus(t('status.associations', { source: cached.sourceLabel, count: cached.entries.length }));
        return;
      }

      try {
        const response = await fetch(`${DATA_BASE_URL}datasheet_x_figs.csv`);
        if (!response.ok) throw new Error(t('feedback.inventoryUnavailable'));
        const parsed = parseInventoryCsv(await response.text(), database, t('status.inventoryIntegrated'), 'bundled');
        if (!active) return;
        await installInventory(parsed);
      } catch (inventoryError) {
        if (!active) return;
        if (cached?.databaseFingerprint === database.fingerprint) {
          setInventory(cached);
          setInventoryStatus(`${t('status.associations', { source: cached.sourceLabel, count: cached.entries.length })} · ${t('status.cache')}`);
          return;
        }
        setInventory(null);
        setInventoryStatus(inventoryError instanceof Error ? `${t('feedback.inventoryUnavailableShort')} ${inventoryError.message}` : t('feedback.inventoryUnavailableShort'));
      }
    })();

    return () => {
      active = false;
    };
  }, [database]);

  useEffect(() => {
    if (!inventory) setInStockOnly(false);
  }, [inventory]);

  useEffect(() => {
    savedDraftsRef.current = savedDrafts;
  }, [savedDrafts]);

  const persistDraft = useCallback((nextDraft: RosterDraft, announce = false): void => {
    if (!database) return;
    const saved: SavedDraft = {
      id: nextDraft.id,
      name: nextDraft.name.trim() || 'Liste sans nom',
      updatedAt: new Date().toISOString(),
      databaseFingerprint: database.fingerprint,
      draft: nextDraft
    };
    const next = [saved, ...savedDraftsRef.current.filter((candidate) => candidate.id !== saved.id)].slice(0, 50);
    savedDraftsRef.current = next;
    setSavedDrafts(next);
    const draftsSaved = writeSavedDrafts(next);
    const activeSaved = writeActiveDraftId(nextDraft.id);
    if (!draftsSaved || !activeSaved) {
      setError(t('feedback.saveUnavailable'));
      return;
    }
    if (announce) setNotice(t('feedback.saved'));
  }, [database]);

  useEffect(() => {
    if (!database || !draft) return;
    const timer = window.setTimeout(() => persistDraft(draft), 450);
    return () => window.clearTimeout(timer);
  }, [database, draft, persistDraft]);

  const selectedUnit = database?.units.find((unit) => unit.id === selectedUnitId) ?? null;
  const inventoryAllocation = useMemo(
    () => database && draft ? allocateInventory(database, draft.items, inventory) : { reservationsByItemId: new Map(), reservedFigureIds: new Set<number>() },
    [database, draft, inventory]
  );
  const inventoryIssues = useMemo(() => {
    if (!database || !draft || !inventory) return [];
    return draft.items.flatMap((item) => {
      const reservation = inventoryAllocation.reservationsByItemId.get(item.id);
      if (!reservation?.hasCatalogEntry || reservation.missing === 0) return [];
      const unit = database.units.find((candidate) => candidate.id === item.unitId);
      return [{
        id: `inventory-${item.id}`,
        level: 'warning' as const,
        message: t('feedback.inventoryMissing', { name: unit ? display.unitName(unit) : t('app.unit'), count: reservation.missing })
      }];
    });
  }, [database, draft, inventory, inventoryAllocation, display, t]);
  const issues = useMemo(
    () => database && draft ? [...validateDraft(database, draft), ...inventoryIssues] : [],
    [database, draft, inventoryIssues]
  );
  const hasBlockingIssue = issues.some((issue) => issue.level === 'error');
  const battleSize = database && draft ? database.battleSizes.find((size) => size.PointsTotal === draft.battleSizePoints) : undefined;
  const selectedDetachments = useMemo(
    () => database && draft ? getSelectedDetachments(database, draft.detachmentIds) : [],
    [database, draft]
  );
  const detachmentPoints = selectedDetachments.reduce((total, detachment) => total + getDetachmentCost(detachment), 0);
  const rosterTotal = database && draft ? calculateRosterTotal(database, draft.items, draft.detachmentIds) : 0;
  const customAnalysisTarget = useMemo<AnalysisTarget | undefined>(() => {
    if (!customTarget.enabled) return undefined;
    const toughness = Number(customTarget.toughness);
    const save = Number(customTarget.save);
    if (!Number.isFinite(toughness) || toughness < 1 || toughness > 99 || ![2, 3, 4, 5, 6].includes(save)) return undefined;
    return {
      id: 'custom-target',
      label: customTarget.label.trim() || t('analysis.customTarget'),
      toughness,
      save,
      vehicle: customTarget.vehicle,
      monster: customTarget.monster
    };
  }, [customTarget, t]);
  const listAnalysis = useMemo(
    () => database && draft ? analyzeRoster(database, draft, customAnalysisTarget) : null,
    [database, draft, customAnalysisTarget]
  );

  const factionUnits = useMemo(() => {
    if (!database || !draft) return [];
    const searchText = search.trim().toLocaleLowerCase();
    const ceiling = maxCost ? Number(maxCost) : undefined;
    return database.units.filter((unit) => {
      if (!isUnitAvailableToFaction(database, draft.primaryFaction, unit)) return false;
      if (favouritesOnly && !favorites.includes(unit.id)) return false;
      if (inStockOnly && inventory && !getInventoryAvailability(inventory, inventoryAllocation, unit.id)?.hasCatalogEntry) return false;
      if (!matchesAdvancedCatalogFilters(unit, advancedCatalogFilters)) return false;
      if (roleFilter && !(unit.Keywords ?? []).some((keyword) => keyword.toLocaleLowerCase().includes(roleFilter.toLocaleLowerCase()))) return false;
      if (searchText) {
        const corpus = display.searchTerms(unit).join(' ').toLocaleLowerCase();
        if (!corpus.includes(searchText)) return false;
      }
      const nextOccurrence = draft.items.filter((item) => item.unitId === unit.id).length + 1;
      const minimumCost = minimumPointCost(unit, nextOccurrence);
      if (ceiling !== undefined && minimumCost !== null && minimumCost > ceiling) return false;
      return true;
    });
  }, [database, draft, search, maxCost, roleFilter, favouritesOnly, favorites, inStockOnly, inventory, inventoryAllocation, advancedCatalogFilters, display]);

  const roles = useMemo(() => {
    if (!database || !draft) return [];
    return [...new Set(database.units.filter((unit) => isUnitAvailableToFaction(database, draft.primaryFaction, unit)).flatMap((unit) => unit.Keywords ?? []))]
      .sort((left, right) => display.term(left).localeCompare(display.term(right), localeTag(locale)));
  }, [database, draft, display, locale]);

  const factionDetachments = useMemo(() => {
    if (!database || !draft) return [];
    const faction = database.factions.find((candidate) => candidate.id === draft.primaryFaction);
    return faction ? database.detachments.filter((detachment) => detachment.sourceKey === faction.sourceKey) : [];
  }, [database, draft]);

  const availableScenarios = useMemo(
    () => selectableScenarios(selectedDetachments),
    [selectedDetachments]
  );
  const compatibleSavedDrafts = useMemo(
    () => database ? savedDrafts.filter((saved) => restoreSavedDraft(saved, database) !== null) : [],
    [database, savedDrafts]
  );
  const activeAdvancedCatalogFilterCount = advancedCatalogFilterCount(advancedCatalogFilters);

  const updateDraft = (updater: (current: RosterDraft) => RosterDraft): void => {
    setDraft((current) => current ? updater(current) : current);
  };

  const updateAdvancedCatalogFilter = (field: AdvancedCatalogFilterKey, value: string): void => {
    setAdvancedCatalogFilters((current) => ({ ...current, [field]: value }));
    setVisibleUnits(60);
  };

  const resetAdvancedCatalogFilters = (): void => {
    setAdvancedCatalogFilters({ ...EMPTY_ADVANCED_CATALOG_FILTERS });
    setVisibleUnits(60);
  };

  const activateSavedDraft = (saved: SavedDraft): void => {
    if (!database) return;
    const restored = restoreSavedDraft(saved, database);
    if (!restored) {
      setError(t('feedback.incompatibleList'));
      return;
    }
    setDraft(restored);
    writeActiveDraftId(restored.id);
    setSelectedUnitId(null);
    setVisibleUnits(60);
    setNotice(t('feedback.opened', { name: saved.name }));
  };

  const createDraft = (): void => {
    if (!database) return;
    const next = newDraft(database);
    setDraft(next);
    writeActiveDraftId(next.id);
    setSelectedUnitId(null);
    setVisibleUnits(60);
    persistDraft(next);
    setNotice(t('feedback.newList'));
  };

  const deleteSavedDraft = (saved: SavedDraft): void => {
    if (!database || !window.confirm(t('feedback.deleteConfirm', { name: saved.name }))) return;
    const next = savedDraftsRef.current.filter((candidate) => candidate.id !== saved.id);
    savedDraftsRef.current = next;
    setSavedDrafts(next);
    if (!writeSavedDrafts(next)) {
      setError(t('feedback.deleteFailed'));
      return;
    }
    if (draft?.id === saved.id) {
      const replacement = newDraft(database);
      setDraft(replacement);
      writeActiveDraftId(replacement.id);
      persistDraft(replacement);
    }
    setNotice(t('feedback.deleted', { name: saved.name }));
  };

  const toggleDetachment = (detachmentId: string): void => {
    if (!database) return;
    updateDraft((current) => {
      const selected = current.detachmentIds.includes(detachmentId);
      const detachmentIds = selected
        ? current.detachmentIds.filter((id) => id !== detachmentId)
        : [...current.detachmentIds, detachmentId];
      const nextDetachments = database.detachments.filter((candidate) => detachmentIds.includes(candidate.id));
      return {
        ...current,
        detachmentIds,
        scenario: keepSelectableScenario(nextDetachments, current.scenario)
      };
    });
  };

  const changeFaction = (nextFaction: string): void => {
    if (!draft) return;
    if ((draft.items.length > 0 || draft.detachmentIds.length > 0) && !window.confirm(t('feedback.factionConfirm'))) return;
    updateDraft((current) => ({ ...current, primaryFaction: nextFaction, items: [], detachmentIds: [] }));
    setSelectedUnitId(null);
    setVisibleUnits(60);
  };

  const loadExternalDatabase = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setStatus(t('feedback.normalizing', { name: file.name }));
      await installDatabase(await normalizeWithWorker(await file.text(), t('feedback.normalizationFailed')), t('status.imported', { name: file.name }));
      setNotice(t('feedback.importedDatabaseSession'));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t('feedback.invalidDatabase'));
    } finally {
      event.target.value = '';
    }
  };

  const loadExternalInventory = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file || !database) return;
    try {
      const parsed = parseInventoryCsv(await file.text(), database, t('status.imported', { name: file.name }), 'local');
      await installInventory(parsed);
      setNotice(t('feedback.inventoryReplaced'));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t('feedback.invalidInventory'));
    } finally {
      event.target.value = '';
    }
  };

  const saveDraft = (): void => {
    if (!draft) return;
    persistDraft(draft, true);
  };

  const exportDraft = (): void => {
    if (!database || !draft || hasBlockingIssue) return;
    const payload: ExportedList = { schemaVersion: NEW_SCHEMA, databaseFingerprint: database.fingerprint, exportedAt: new Date().toISOString(), draft };
    downloadJson(`${draft.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'liste-warforge'}.json`, payload);
  };

  const importDraft = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file || !database) return;
    try {
      const payload = JSON.parse(await file.text()) as Partial<ExportedList>;
      if (payload.schemaVersion !== NEW_SCHEMA || !payload.draft) throw new Error(t('feedback.invalidExport'));
      if (payload.databaseFingerprint !== database.fingerprint) throw new Error(t('feedback.incompatibleExport'));
      const validDetachments = payload.draft.detachmentIds.filter((id) => database.detachments.some((detachment) => detachment.id === id));
      const validItems = payload.draft.items.filter((item) => database.units.some((unit) => unit.id === item.unitId));
      if (validDetachments.length !== payload.draft.detachmentIds.length || validItems.length !== payload.draft.items.length) throw new Error(t('feedback.incompleteExport'));
      const importedDetachments = database.detachments.filter((detachment) => validDetachments.includes(detachment.id));
      const scenario = keepSelectableScenario(importedDetachments, payload.draft.scenario);
      const wasScenarioAdjusted = scenario !== payload.draft.scenario;
      setDraft({ ...payload.draft, scenario, detachmentIds: validDetachments, items: validItems.map(normalizeRosterItemWargear), id: crypto.randomUUID() });
      setNotice(wasScenarioAdjusted ? t('feedback.importAdjusted') : t('feedback.importedList'));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t('feedback.importFailed'));
    } finally {
      event.target.value = '';
    }
  };

  const toggleFavorite = (unitId: string): void => {
    const next = favorites.includes(unitId) ? favorites.filter((id) => id !== unitId) : [...favorites, unitId];
    setFavorites(next);
    writeFavorites(next);
  };

  const openRules = (): void => {
    window.location.hash = 'rules';
  };

  const openWeapons = (): void => {
    window.location.hash = 'weapons';
  };

  const openBuilder = (): void => {
    window.location.hash = 'builder';
  };

  if (view === 'rules') return <RulesPage locale={locale} onOpenBuilder={openBuilder} onOpenWeapons={openWeapons} />;

  if (view === 'weapons' && database) return <WeaponsPage database={database} display={display} locale={locale} onOpenBuilder={openBuilder} onOpenRules={openRules} />;

  if (!database || !draft) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <span className="eyebrow">WARFORGE 40K</span>
          <h1>{t('app.loading')}</h1>
          <p>{status}</p>
          {error && <p className="error-text">{error}</p>}
          <button onClick={() => databaseInputRef.current?.click()}>{t('action.importDatabase')}</button>
          <button className="secondary" onClick={openRules}>{t('rules.open')}</button>
          <button className="secondary" onClick={openWeapons}>{locale === 'fr' ? 'Arsenal' : 'Armoury'}</button>
          <input ref={databaseInputRef} type="file" accept="application/json,.json" hidden onChange={loadExternalDatabase} />
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div>}
      {error && <div className="toast error-toast" role="alert">{error}<button onClick={() => setError(null)}>×</button></div>}

      <section className="workspace">
        <div className="library-panel">
          <div className="section-heading">
            <div><span className="eyebrow">{t('library.eyebrow')}</span><h2>{t('library.title')}</h2></div>
            <div className="library-heading-actions">
              <p>{t('library.results', { count: factionUnits.length })}</p>
              <button
                className="secondary"
                aria-controls="unit-catalog"
                aria-expanded={unitCatalogExpanded}
                onClick={() => setUnitCatalogExpanded((expanded) => !expanded)}
              >
                {unitCatalogExpanded ? t('action.collapseCatalog') : t('action.showCatalog')}
              </button>
            </div>
          </div>
          <div id="unit-catalog" hidden={!unitCatalogExpanded}>
            <div className="filters">
              <input placeholder={t('library.search')} value={search} onChange={(event) => { setSearch(event.target.value); setVisibleUnits(60); }} />
              <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setVisibleUnits(60); }}>
                <option value="">{t('library.allRoles')}</option>
                {roles.map((role) => <option key={role} value={role}>{display.term(role)}</option>)}
              </select>
              <input type="number" min="0" placeholder={t('library.maximumCost')} value={maxCost} onChange={(event) => { setMaxCost(event.target.value); setVisibleUnits(60); }} />
              <label className="checkbox-label"><input type="checkbox" checked={favouritesOnly} onChange={(event) => setFavouritesOnly(event.target.checked)} /> {t('library.favorites')}</label>
              <label className="checkbox-label" title={inventory ? undefined : t('library.stockHint')}>
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  disabled={!inventory}
                  onChange={(event) => { setInStockOnly(event.target.checked); setVisibleUnits(60); }}
                /> {t('library.inStock')}
              </label>
            </div>
            <AdvancedCatalogFilterMenu
              filters={advancedCatalogFilters}
              activeCount={activeAdvancedCatalogFilterCount}
              onChange={updateAdvancedCatalogFilter}
              onReset={resetAdvancedCatalogFilters}
            />
            <div className="unit-grid">
            {factionUnits.slice(0, visibleUnits).map((unit) => {
              const availability = getInventoryAvailability(inventory, inventoryAllocation, unit.id);
              const image = unitImages.get(unit.id);
              return (
              <article className={`unit-card ${isAlliedUnit(database, draft.primaryFaction, unit) ? 'allied-unit' : ''}`} key={unit.id}>
                <button className={`favorite ${favorites.includes(unit.id) ? 'active' : ''}`} onClick={() => toggleFavorite(unit.id)} aria-label={t('library.favorite', { name: display.unitName(unit) })}>★</button>
                <div className="unit-card-layout">
                  <UnitThumbnail key={image?.asset ?? `unavailable-${unitImageStatus}`} unit={unit} image={image} display={display} dataBaseUrl={DATA_BASE_URL} />
                  <div className="unit-card-content">
                    <h3>{display.unitName(unit)}</h3>
                    <p className="muted">{display.factionName(unit.Faction || unit.factionName)}{isAlliedUnit(database, draft.primaryFaction, unit) && <span className="ally-label">{t('library.allied', { source: display.factionName(sourceLabel(database, unit.sourceKey)) })}</span>}</p>
                    <div className="tag-row">{(unit.Keywords ?? []).slice(0, 4).map((keyword) => <span key={keyword}>{display.term(keyword)}</span>)}</div>
                    {(unit.StatLines ?? []).map((line, index) => <UnitProfile key={index} line={line} />)}
                    {(unit.UnitComposition?.ModelCompositions?.length ?? 0) > 0 && (
                      <section className="unit-composition">
                        <h4>{t('library.composition')}</h4>
                        <ul>{unit.UnitComposition?.ModelCompositions?.map((model, index) => <li key={`${model.ModelName ?? 'figurine'}-${index}`}>{compositionLabel(model, t('profile.model'))}</li>)}</ul>
                      </section>
                    )}
                    <strong className="unit-card-price">{minimumPointCost(unit, draft.items.filter((item) => item.unitId === unit.id).length + 1) ?? '?'} pts <small>{t('library.from')}</small></strong>
                    {availability && (
                      <p className={`inventory-stock ${availability.hasCatalogEntry ? (availability.used === availability.total ? 'depleted' : '') : 'unlisted'}`}>
                        {availability.hasCatalogEntry
                          ? t('library.inventoryUsage', { used: availability.used, total: availability.total })
                          : t('library.inventoryUnlisted')}
                      </p>
                    )}
                    <div className="card-actions">
                      <button className="secondary" onClick={() => setSelectedUnitId(unit.id)}>{t('action.details')}</button>
                      <button onClick={() => updateDraft((current) => ({ ...current, items: [...current.items, makeRosterItem(unit.id)] }))}>{t('action.add')}</button>
                    </div>
                  </div>
                </div>
              </article>
              );
            })}
            </div>
            {factionUnits.length > visibleUnits && <button className="load-more" onClick={() => setVisibleUnits((current) => current + 60)}>{t('action.loadMore')}</button>}
          </div>
        </div>

        <aside className="roster-panel">
          <div className="section-heading">
            <div><span className="eyebrow">{t('roster.eyebrow')}</span><h2>{draft.name || t('roster.unnamed')}</h2></div>
            <strong className={rosterTotal > (battleSize?.PointsTotal ?? Infinity) ? 'bad-total' : ''}>{rosterTotal}/{battleSize?.PointsTotal ?? '?'} pts</strong>
          </div>
          {listAnalysis && <ListAnalysisPanel analysis={listAnalysis} customTarget={customTarget} database={database} display={display} onCustomTargetChange={setCustomTarget} />}
          {selectedDetachments.length > 0 && (
            <section className="selected-detachments" aria-label={t('roster.selectedDetachments')}>
              <h3>{t('roster.selectedDetachments')}</h3>
              {selectedDetachments.map((detachment) => (
                <article className="roster-card detachment-roster-card" key={detachment.id}>
                  <button
                    className="icon-button danger"
                    aria-label={t('roster.removeDetachment', { name: display.detachmentName(detachment) })}
                    onClick={() => toggleDetachment(detachment.id)}
                  >
                    ×
                  </button>
                  <div className="card-title-row"><h3>{display.detachmentName(detachment)}</h3><strong>{getDetachmentCost(detachment)} DP</strong></div>
                  <p className="detachment-scenario">
                    {t('roster.scenario', { scenario: (detachment.ForceDispositions ?? []).map(scenarioTitle).join(' · ') || t('app.unknown') })}
                  </p>
                </article>
              ))}
            </section>
          )}
          {draft.items.length === 0 ? <p className="empty-state">{t('analysis.empty')}</p> : draft.items.map((item) => (
            <RosterCard
              key={item.id}
              database={database}
              item={item}
              draft={draft}
              inventoryReservation={inventoryAllocation.reservationsByItemId.get(item.id)}
              display={display}
              onChange={(nextItem) => updateDraft((current) => ({ ...current, items: current.items.map((candidate) => candidate.id === nextItem.id ? nextItem : candidate) }))}
              onRemove={() => updateDraft((current) => ({ ...current, items: current.items.filter((candidate) => candidate.id !== item.id) }))}
            />
          ))}
          <div className="validation-panel">
            <div className="section-heading"><h2>{t('roster.validation')}</h2><span>{t('roster.errors', { count: issues.filter((issue) => issue.level === 'error').length })}</span></div>
            {issues.length === 0 ? <p className="valid-state">{t('roster.valid')}</p> : (
              <ul>
                {issues.map((issue) => <li className={issue.level} key={issue.id}>{issue.message}</li>)}
              </ul>
            )}
          </div>
          {compatibleSavedDrafts.length > 0 && (
            <div className="saved-panel">
              <div className="section-heading"><h3>{t('roster.savedLists')}</h3><span>{compatibleSavedDrafts.length}</span></div>
              <p className="muted">{t('roster.autosave')}</p>
              <div className="saved-list-stack">
                {compatibleSavedDrafts.map((saved) => (
                  <div className={`saved-list-row ${saved.id === draft.id ? 'active' : ''}`} key={saved.id}>
                    <button className="saved-list" onClick={() => activateSavedDraft(saved)} aria-current={saved.id === draft.id ? 'page' : undefined}>
                      <span>{saved.name}</span><small>{new Date(saved.updatedAt).toLocaleString(localeTag(locale))}</small>
                    </button>
                    <button className="saved-delete" onClick={() => deleteSavedDraft(saved)} aria-label={t('roster.delete', { name: saved.name })}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>

      <section className="command-center" aria-label={t('command.eyebrow')}>
        <div className="command-center-heading">
          <span className="eyebrow">{t('command.eyebrow')}</span>
          <h2>{t('command.title')}</h2>
          <p>{t('command.intro')}</p>
        </div>
        <section className="configuration" aria-label={t('command.title')}>
          <label>
            {t('command.faction')}
            <select value={draft.primaryFaction} onChange={(event) => changeFaction(event.target.value)}>
              {database.factions.map((faction) => <option key={faction.id} value={faction.id}>{display.factionName(faction.name)} · {t('app.units', { count: faction.unitCount })}</option>)}
            </select>
          </label>
          <label>
            {t('command.name')}
            <input value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            {t('command.active')}
            <select aria-label={t('command.active')} value={draft.id} onChange={(event) => {
              const saved = compatibleSavedDrafts.find((candidate) => candidate.id === event.target.value);
              if (saved) activateSavedDraft(saved);
            }}>
              {!compatibleSavedDrafts.some((saved) => saved.id === draft.id) && <option value={draft.id}>{draft.name.trim() || t('roster.unnamed')}</option>}
              {compatibleSavedDrafts.map((saved) => <option key={saved.id} value={saved.id}>{saved.name}</option>)}
            </select>
          </label>
          <label>
            {t('command.format')}
            <select value={draft.battleSizePoints} onChange={(event) => updateDraft((current) => ({ ...current, battleSizePoints: Number(event.target.value) }))}>
              {database.battleSizes.map((size) => <option key={size.PointsTotal} value={size.PointsTotal}>{size.PointsTotal.toLocaleString(localeTag(locale))} pts · {size.DetachmentPoints} DP</option>)}
            </select>
          </label>
          <label>
            {locale === 'fr' ? 'Disposition des Forces' : 'Force disposition'}
            <select value={draft.scenario} onChange={(event) => updateDraft((current) => ({ ...current, scenario: event.target.value }))}>
              {availableScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenarioTitle(scenario.id)}</option>)}
            </select>
          </label>
          <div className="configuration-actions">
            <button onClick={createDraft}>{t('action.newList')}</button>
            <button className="secondary" onClick={saveDraft}>{t('action.save')}</button>
            <button className="secondary" disabled={hasBlockingIssue} onClick={exportDraft}>{t('action.export')}</button>
          </div>
        </section>

        <details className="scenario-guide">
          <summary>
            <span className="eyebrow">{locale === 'fr' ? 'GUIDE DE DISPOSITION' : 'FORCE DISPOSITION GUIDE'}</span>
            <h2>{scenarioTitle(draft.scenario)}</h2>
          </summary>
          <div className="scenario-guide-content">
            <p>{scenarioGuide(draft.scenario)}</p>
            <dl>
              <div><dt>{locale === 'fr' ? 'Dispositions autorisées' : 'Allowed dispositions'}</dt><dd>{availableScenarios.length}</dd></div>
              <div><dt>{t('command.detachmentBudget')}</dt><dd>{detachmentPoints}/{battleSize?.DetachmentPoints ?? '?'} DP</dd></div>
              <div><dt>{t('command.enhancementLimit')}</dt><dd>{battleSize?.EnhancementLimit ?? '?'}</dd></div>
            </dl>
          </div>
        </details>
      </section>

      <section className="detachment-section">
        <div className="section-heading">
          <div><span className="eyebrow">{t('command.detachmentEyebrow')}</span><h2>{t('command.detachmentTitle')}</h2></div>
          <div className="detachment-heading-actions">
            <p>{t('command.selectedInfo', { count: selectedDetachments.length })}</p>
            <button
              className="secondary"
              aria-controls="detachment-catalog"
              aria-expanded={detachmentCatalogExpanded}
              onClick={() => setDetachmentCatalogExpanded((expanded) => !expanded)}
            >
              {detachmentCatalogExpanded ? t('action.collapseCatalog') : t('action.showCatalog')}
            </button>
          </div>
        </div>
        <div id="detachment-catalog" hidden={!detachmentCatalogExpanded}>
          <div className="detachment-grid">
            {factionDetachments.map((detachment) => {
              const selected = draft.detachmentIds.includes(detachment.id);
              return (
                <article className={`detachment-card ${selected ? 'selected' : ''}`} key={detachment.id}>
                  <div className="card-title-row"><h3>{display.detachmentName(detachment)}</h3><strong>{getDetachmentCost(detachment)} DP</strong></div>
                  <p>{detachment.Rule?.Title || t('command.detachmentRule')}</p>
                  <p className="detachment-scenario">
                    {t('roster.scenario', { scenario: (detachment.ForceDispositions ?? []).map(scenarioTitle).join(' · ') || t('app.unknown') })}
                  </p>
                  <div className="tag-row">{(detachment.Tags ?? []).map((tag) => <span key={tag}>{display.term(tag)}</span>)}</div>
                  <button className={selected ? 'secondary' : ''} onClick={() => toggleDetachment(detachment.id)}>
                    {selected ? t('action.remove') : t('action.add')}
                  </button>
                  <CompactRule detachment={detachment} display={display} />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <header className="topbar">
        <div>
          <span className="eyebrow">WARFORGE 40K · PWA LOCALE</span>
          <h1>Warforge 40K</h1>
          <p>{status} · Empreinte {database.fingerprint}</p>
          <p className="inventory-status">{inventoryStatus}</p>
        </div>
        <div className="topbar-actions">
          <button className="secondary" onClick={() => databaseInputRef.current?.click()}>{t('action.updateDatabase')}</button>
          <button className="secondary" onClick={openRules}>{t('rules.open')}</button>
          <button className="secondary" onClick={openWeapons}>{locale === 'fr' ? 'Arsenal' : 'Armoury'}</button>
          <button className="secondary" onClick={() => listInputRef.current?.click()}>{t('action.importList')}</button>
          <button className="secondary" onClick={() => inventoryInputRef.current?.click()}>{t('action.importInventory')}</button>
          <button className="secondary" onClick={() => window.print()}>{t('action.print')}</button>
          <label className="language-selector">
            <span>{t('navigation.language')}</span>
            <select value={locale} onChange={(event) => changeLocale(event.target.value)} aria-label={t('navigation.language')}>
              <option value="fr">{t('navigation.french')}</option>
              <option value="en">{t('navigation.english')}</option>
            </select>
          </label>
          <input ref={databaseInputRef} type="file" accept="application/json,.json" hidden onChange={loadExternalDatabase} />
          <input ref={inventoryInputRef} type="file" accept="text/csv,.csv" hidden onChange={loadExternalInventory} />
          <input ref={listInputRef} type="file" accept="application/json,.json" hidden onChange={importDraft} />
        </div>
      </header>

      {selectedUnit && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedUnitId(null)}>
          <section className="unit-modal" role="dialog" aria-modal="true" aria-label={`${t('action.details')} ${display.unitName(selectedUnit)}`} onMouseDown={(event) => event.stopPropagation()}>
            <button className="icon-button" onClick={() => setSelectedUnitId(null)} aria-label={t('action.close')}>×</button>
            <span className="eyebrow">{display.factionName(selectedUnit.factionName)}</span>
            <h2>{display.unitName(selectedUnit)}</h2>
            <div className="tag-row">{[...(selectedUnit.Keywords ?? []), ...(selectedUnit.FactionKeywords ?? [])].map((keyword) => <span key={keyword}>{display.term(keyword)}</span>)}</div>
            {(selectedUnit.StatLines ?? []).map((line, index) => (
              <dl className="stat-grid" key={index}>
                {['Movement', 'Toughness', 'Save', 'Wounds', 'Leadership', 'OC'].map((key) => <div key={key}><dt>{key}</dt><dd>{String(line[key] ?? '—')}</dd></div>)}
              </dl>
            ))}
            {(selectedUnit.Weapons?.length ?? 0) > 0 && (
              <details className="weapon-details">
                <summary>{t('weapons.weapons')}</summary>
                <WeaponTable profiles={weaponProfiles(selectedUnit)} display={display} />
              </details>
            )}
            {(selectedUnit.UnitAbilities?.length ?? 0) > 0 && <h3>{t('weapons.abilities')}</h3>}
            {selectedUnit.UnitAbilities?.map((ability, index) => <p key={index}><strong>{ability.Title}</strong> {ability.Text}</p>)}
            {locale === 'fr' && <p className="notice-text">{t('app.sourceUnavailable')}</p>}
            <button onClick={() => { updateDraft((current) => ({ ...current, items: [...current.items, makeRosterItem(selectedUnit.id)] })); setSelectedUnitId(null); }}>{t('action.addToList')}</button>
          </section>
        </div>
      )}
    </main>
  );
}
