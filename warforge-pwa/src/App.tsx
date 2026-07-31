import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateItemCost, calculateRosterTotal, enhancementIsEligible, getDetachmentCost, getPointSizes, getSelectedDetachments, occurrenceForItem, resolvePointOption } from './domain/calculations';
import { isAlliedUnit, isUnitAvailableToFaction, sourceLabel } from './domain/catalog';
import { EMPTY_ADVANCED_CATALOG_FILTERS, advancedCatalogFilterCount, matchesAdvancedCatalogFilters } from './domain/advanced-filters';
import { analyzeRoster } from './domain/analysis';
import { allocateInventory, getInventoryAvailability, hasFreeInventory, parseInventoryCsv } from './domain/inventory';
import { normalizeDatabase } from './domain/normalize';
import { keepSelectableScenario, SCENARIOS, scenarioLabel, selectableScenarios } from './domain/scenarios';
import { cacheDatabase, cacheInventory, getCachedDatabase, getCachedInventory, readActiveDraftId, readFavorites, readSavedDrafts, writeActiveDraftId, writeFavorites, writeSavedDrafts } from './domain/storage';
import type { InventoryDataset, InventoryReservation } from './domain/inventory';
import type { AdvancedCatalogFilters } from './domain/advanced-filters';
import type { CoverageBand, ListAnalysis } from './domain/analysis';
import type { ExportedList, NormalizedDatabase, NormalizedDetachment, NormalizedUnit, RosterDraft, RosterItem, SavedDraft } from './domain/types';
import { validateDraft } from './domain/validation';
import { normalizeRosterItemWargear, optionQuantityLimit, resolveWargear, ruleLimit, selectionQuantity, updateModelCount, updateWargearQuantity, weaponProfiles } from './domain/wargear';
import type { SelectedWeaponProfile } from './domain/wargear';
import './styles.css';

const NEW_SCHEMA = 'warforge-list/v1';
const DATA_BASE_URL = `${import.meta.env.BASE_URL}data/`;

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

function normalizeWithWorker(raw: string): Promise<NormalizedDatabase> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ ok: boolean; database?: NormalizedDatabase; error?: string }>) => {
      worker.terminate();
      if (event.data.ok && event.data.database) resolve(event.data.database);
      else reject(new Error(event.data.error ?? 'Erreur de normalisation de la base.'));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error('Le worker de normalisation a échoué.'));
    };
    worker.postMessage({ raw });
  });
}

function pointLabel(unit: NormalizedUnit, index: number, occurrence = 1): string {
  const option = resolvePointOption(unit, index, occurrence);
  if (!option) return 'Profil sans coût';
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

function compositionLabel(model: { ModelName?: string; Limit?: { Min?: number; Max?: number } }): string {
  const name = model.ModelName?.trim() || 'Figurine';
  const min = model.Limit?.Min;
  const max = model.Limit?.Max;
  if (typeof min === 'number' && typeof max === 'number') return min === max ? `x${min} ${name}` : `${min}–${max} ${name}`;
  if (typeof min === 'number') return `min. ${min} ${name}`;
  if (typeof max === 'number') return `max. ${max} ${name}`;
  return name;
}

function UnitProfile({ line }: { line: Record<string, unknown> }): React.JSX.Element {
  const profileName = typeof line.StatName === 'string' ? line.StatName.trim() : '';
  return (
    <section className="unit-profile">
      {profileName && <h4>{profileName}</h4>}
      <dl className="unit-stat-grid">
        {PROFILE_STATS.map(({ key, label, description }) => (
          <div key={key}>
            <dt aria-label={description}>{label}</dt>
            <dd>{String(line[key] ?? '—')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function WeaponTable({ profiles, compact = false }: { profiles: SelectedWeaponProfile[]; compact?: boolean }): React.JSX.Element | null {
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
          <h4>{group}</h4>
          <div className="weapon-table-scroll">
            <table>
              <thead><tr><th>Arme</th><th>Portée</th><th>A</th><th>{entries[0].melee ? 'CC' : 'CT'}</th><th>F</th><th>PA</th><th>D</th><th>Aptitudes</th></tr></thead>
              <tbody>
                {entries.map(({ profile }, index) => (
                  <tr key={`${profile.Name ?? 'arme'}-${index}`}>
                    <th scope="row">{profile.Name || 'Arme'}</th>
                    <td>{profile.Range || '—'}</td><td>{profile.Attacks || '—'}</td><td>{profile.ToHit || '—'}</td>
                    <td>{profile.Strength || '—'}</td><td>{profile.AP || '—'}</td><td>{profile.Damage || '—'}</td><td>{profile.Keywords || '—'}</td>
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
  return (
    <details className="advanced-filters">
      <summary>Filtres avancés{activeCount > 0 ? ` · ${activeCount} actif${activeCount > 1 ? 's' : ''}` : ''}</summary>
      <div className="advanced-filter-content">
        <section className="advanced-filter-group" aria-labelledby="unit-stat-filter-title">
          <div>
            <h3 id="unit-stat-filter-title">Caractéristiques de l’unité</h3>
            <p>Au moins un profil doit remplir toutes les conditions choisies.</p>
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
            <h3 id="weapon-stat-filter-title">Caractéristiques d’une arme</h3>
            <p>Une même arme doit remplir toutes les conditions choisies.</p>
          </div>
          <div className="advanced-filter-grid">
            <AdvancedCatalogFilterInput field="minimumWeaponRange" label="Portée ≥" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="minimumWeaponAttacks" label="A ≥" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="maximumWeaponSkill" label="CC / CT ≤" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="minimumWeaponStrength" label="F ≥" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="maximumWeaponAP" label="PA ≤" filters={filters} onChange={onChange} />
            <AdvancedCatalogFilterInput field="minimumWeaponDamage" label="D ≥" filters={filters} onChange={onChange} />
          </div>
        </section>
        <div className="advanced-filter-footer">
          <p className="muted">Les valeurs aléatoires (D6, 2D6…) sont comparées avec leur maximum possible.</p>
          <button className="secondary" type="button" disabled={activeCount === 0} onClick={onReset}>Réinitialiser</button>
        </div>
      </div>
    </details>
  );
}

const COVERAGE_LABELS: Record<CoverageBand, string> = {
  absent: 'Absent',
  fragile: 'Fragile',
  couvert: 'Couvert',
  redondant: 'Redondant'
};

function formatAnalysisValue(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
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

function ListAnalysisPanel({ analysis }: { analysis: ListAnalysis }): React.JSX.Element {
  const utilityMetrics = [
    { label: 'Vol', count: analysis.mobility.flyUnits },
    { label: 'Frappe en profondeur', count: analysis.mobility.deepStrikeUnits },
    { label: 'Éclaireurs', count: analysis.mobility.scoutUnits },
    { label: 'Infiltrateurs', count: analysis.mobility.infiltratorUnits },
    { label: 'Furtivité', count: analysis.utility.stealthUnits },
    { label: 'Opérateur Solitaire', count: analysis.utility.loneOperativeUnits },
    { label: 'Insensible à la douleur', count: analysis.utility.feelNoPainUnits },
    { label: 'Tir indirect', count: analysis.utility.indirectFireUnits },
    { label: 'Torrent', count: analysis.utility.torrentUnits }
  ].filter(({ count }) => count > 0);

  return (
    <details className="list-analysis" open>
      <summary>
        <span>Analyse de liste</span>
        <small>Dégâts, mobilité, résistance et contrôle</small>
      </summary>
      <div className="list-analysis-content">
        <section className="analysis-section">
          <div className="analysis-heading">
            <div><h3>Puissance offensive</h3><p>Dégâts moyens non sauvegardés par phase, à portée.</p></div>
          </div>
          <div className="analysis-damage-table-scroll">
            <table className="analysis-damage-table">
              <thead>
                <tr>
                  <th scope="col">Unité</th>
                  {analysis.targets.map((target) => <th key={target.id} scope="col">{target.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {analysis.unitDamages.map((unit) => (
                  <tr key={unit.itemId}>
                    <th scope="row"><span>{unit.unitName}</span><small>{unit.modelCount} figurine(s)</small></th>
                    {unit.targets.map((target) => (
                      <td key={target.targetId}>
                        <strong>{formatAnalysisValue(target.totalDamage)}</strong>
                        <small>Tir {formatAnalysisValue(target.rangedDamage)} · CàC {formatAnalysisValue(target.meleeDamage)}</small>
                      </td>
                    ))}
                  </tr>
                ))}
                {analysis.unitDamages.length === 0 && <tr><td className="analysis-empty" colSpan={analysis.targets.length + 1}>Ajoutez des unités depuis la bibliothèque.</td></tr>}
              </tbody>
              {analysis.unitDamages.length > 0 && (
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {analysis.targets.map((target) => (
                      <td key={target.id}>
                        <strong>{formatAnalysisValue(target.totalDamage)}</strong>
                        <small><span className={`coverage-badge ${target.coverage}`}>{COVERAGE_LABELS[target.coverage]}</span> {target.sourceUnits} source(s)</small>
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
            <h3>Mobilité</h3>
            <dl className="analysis-metrics-grid">
              <AnalysisMetric label="Meilleur M" value={analysis.mobility.maximumMove === null ? '—' : `${formatAnalysisValue(analysis.mobility.maximumMove)}″`} />
              <AnalysisMetric label="Portée max." value={analysis.mobility.longestRange === null ? '—' : `${formatAnalysisValue(analysis.mobility.longestRange)}″`} />
              <AnalysisMetric label="Unités rapides" value={analysis.mobility.fastUnits} detail="M ≥ 10″" />
              <AnalysisMetric label="Déploiement rapide" value={analysis.mobility.deepStrikeUnits + analysis.mobility.scoutUnits + analysis.mobility.infiltratorUnits} detail="FEP, Éclaireurs ou Infiltrateurs" />
            </dl>
          </article>
          <article>
            <h3>Résistance</h3>
            <dl className="analysis-metrics-grid">
              <AnalysisMetric label="PV totaux" value={formatAnalysisValue(analysis.resilience.totalWounds)} />
              <AnalysisMetric label="Noyau E ≥ 10" value={formatAnalysisValue(analysis.resilience.toughWounds)} detail="PV lourds" />
              <AnalysisMetric label="Svg 2+" value={formatAnalysisValue(analysis.resilience.saveTwoWounds)} detail="PV protégés" />
              <AnalysisMetric label="Svg 3+" value={formatAnalysisValue(analysis.resilience.saveThreeWounds)} detail="PV protégés" />
            </dl>
          </article>
          <article>
            <h3>Contrôle</h3>
            <dl className="analysis-metrics-grid">
              <AnalysisMetric label="OC de base" value={formatAnalysisValue(analysis.control.totalObjectiveControl)} />
              <AnalysisMetric label="Figurines" value={analysis.control.modelCount} />
              <AnalysisMetric label="Battleline" value={analysis.control.battlelineUnits} detail="unité(s)" />
              <AnalysisMetric label="Profils résolus" value={analysis.resilience.resolvedModels} detail="figurines avec stats exploitables" />
            </dl>
          </article>
        </section>

        <section className="analysis-section">
          <h3>Outils tactiques structurés</h3>
          {utilityMetrics.length > 0 ? (
            <div className="analysis-utility-list">{utilityMetrics.map(({ label, count }) => <span key={label}>{label} <strong>{count}</strong></span>)}</div>
          ) : <p className="muted">Aucun outil structuré détecté dans les profils sélectionnés.</p>}
          {analysis.resilience.unresolvedUnits > 0 && <p className="analysis-warning">{analysis.resilience.unresolvedUnits} unité(s) à profils multiples utilisent un profil de secours pour les PV et l’OC.</p>}
        </section>

        <details className="analysis-assumptions">
          <summary>Hypothèses de calcul</summary>
          <ul>{analysis.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
        </details>
      </div>
    </details>
  );
}

function WargearEditor({
  unit,
  item,
  detachmentNames,
  onChange
}: {
  unit: NormalizedUnit;
  item: RosterItem;
  detachmentNames: string[];
  onChange: (item: RosterItem) => void;
}): React.JSX.Element | null {
  const wargear = resolveWargear(unit, item, detachmentNames);
  const sourceProfiles = weaponProfiles(unit);
  if (wargear.byComposition.length === 0 && sourceProfiles.length === 0) return null;
  const detachmentAvailable = (name: string | undefined) => !name || detachmentNames.some((candidate) => candidate.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase());
  const allMatchedProfiles = wargear.byComposition.some((model) => model.profiles.length > 0);

  return (
    <section className="wargear-editor">
      <div className="wargear-heading"><h4>Armement et équipement</h4><span>{wargear.totalModels} figurine(s)</span></div>
      {wargear.byComposition.map(({ composition, rules, equipment, profiles, nonProfileEquipment }) => (
        <details className="model-wargear model-wargear-dropdown" key={composition.id}>
          <summary><span>{composition.label}</span><span>×{composition.count}</span></summary>
          <div className="model-wargear-content">
            {composition.editable && (
              <label className="model-count-select">
                Effectif de {composition.label} <small>{composition.min}–{composition.max}</small>
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
                <h5>Équipement retenu</h5>
                <div className="tag-row">
                  {equipment.map((entry) => <span className={entry.hasProfile ? '' : 'non-profile'} key={entry.name}>×{entry.count} {entry.name}</span>)}
                </div>
                {nonProfileEquipment.length > 0 && <p className="muted">Équipement sans profil : {nonProfileEquipment.map((entry) => entry.name).join(', ')}.</p>}
              </section>
            )}
            {rules.length === 0 && <p className="muted">Aucun choix d’équipement pour ce type de figurine.</p>}
            {rules.map((rule) => {
              const selected = wargear.selections[rule.id] ?? {};
              const selectedTotal = Object.values(selected).reduce((sum, count) => sum + count, 0);
              const maximum = ruleLimit(rule, composition.count, wargear.totalModels);
              const required = detachmentAvailable(rule.requiredDetachment);
              return (
                <section className="wargear-rule" key={rule.id}>
                  <div className="wargear-rule-heading">
                    <span>{rule.replaces.length > 0 ? `Remplace ${rule.replaces.join(' + ')}` : 'Équipement additionnel'}</span>
                    <small>{selectedTotal}/{maximum} choisi{maximum > 1 ? 's' : ''}{rule.perXModels ? ` · 1 par ${rule.perXModels} fig.` : ''}</small>
                  </div>
                  {rule.requiredDetachment && <p className={required ? 'wargear-requirement' : 'wargear-requirement warning'}>Requiert : {rule.requiredDetachment}</p>}
                  <div className="wargear-options">
                    {rule.options.map((option) => {
                      const quantity = selectionQuantity(item, rule.id, option);
                      const quantityLimit = optionQuantityLimit(item, rule, composition.count, wargear.totalModels, option);
                      return (
                        <label className="wargear-option" key={option}>
                          <span>{option}</span>
                          <select
                            aria-label={`Quantité de ${option}`}
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
                <h5>Profils des armes retenues</h5>
                <WeaponTable profiles={profiles} compact />
              </section>
            )}
          </div>
        </details>
      ))}
      {!allMatchedProfiles && sourceProfiles.length > 0 && (
        <details className="model-wargear model-wargear-dropdown unit-weapon-profiles">
          <summary><span>Profils d’armes de l’unité</span></summary>
          <div className="model-wargear-content"><WeaponTable profiles={sourceProfiles} compact /></div>
        </details>
      )}
    </section>
  );
}

function CompactRule({ detachment }: { detachment: NormalizedDetachment }): React.JSX.Element {
  return (
    <details className="rule-details">
      <summary>Règle et options</summary>
      {detachment.Rule?.Title && <strong>{detachment.Rule.Title}</strong>}
      {detachment.Rule?.Text && <p>{detachment.Rule.Text}</p>}
      {detachment.Rule?.Restrictions && <p className="notice-text">Restriction : {detachment.Rule.Restrictions}</p>}
      {(detachment.Stratagems?.length ?? 0) > 0 && (
        <div className="mini-list">
          <strong>Stratagèmes</strong>
          {detachment.Stratagems?.map((stratagem, index) => (
            <span key={`${detachment.id}-stratagem-${index}`}>{stratagem.Name} ({stratagem.CPCost ?? '?'} PC)</span>
          ))}
        </div>
      )}
      {(detachment.Enhancements?.length ?? 0) > 0 && (
        <div className="mini-list">
          <strong>Améliorations</strong>
          {detachment.Enhancements?.map((enhancement, index) => (
            <span key={`${detachment.id}-enhancement-${index}`}>{enhancement.Name} ({enhancement.Cost ?? 0} pts)</span>
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
  onChange: (item: RosterItem) => void;
  onRemove: () => void;
}

function RosterCard({ database, item, draft, inventoryReservation, onChange, onRemove }: RosterCardProps): React.JSX.Element | null {
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
      <button className="icon-button danger" aria-label={`Retirer ${unit.displayName}`} onClick={onRemove}>×</button>
      <h3>{unit.displayName}</h3>
      <p className="muted">{unit.factionName} · {pointLabel(unit, item.pointIndex, occurrence)} · occurrence {occurrence}</p>
      <label>
        Taille / coût de base
        <select value={item.pointIndex} onChange={(event) => onChange({ ...item, pointIndex: Number(event.target.value) })}>
          {getPointSizes(unit).map((_, index) => <option key={index} value={index}>{pointLabel(unit, index, occurrence)}</option>)}
        </select>
      </label>
      <WargearEditor unit={unit} item={item} detachmentNames={selectedDetachments.map((detachment) => detachment.displayName)} onChange={onChange} />
      {enhancementOptions.length > 0 && (
        <label>
          Amélioration
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
            <option value="">Aucune amélioration</option>
            {enhancementOptions.map(({ detachment, enhancement, enhancementIndex }) => (
              <option key={`${detachment.id}-${enhancementIndex}`} value={`${detachment.id}::${enhancementIndex}`}>
                {enhancement.Name} — {enhancement.Cost ?? 0} pts ({detachment.displayName})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="cost-line">
        <span>Base {breakdown.base} {breakdown.pointOverride !== undefined ? `→ surcharge ${breakdown.pointOverride}` : ''}</span>
        <strong>{breakdown.total} pts</strong>
      </div>
      {(breakdown.wargear > 0 || breakdown.enhancement > 0) && (
        <p className="muted">Équipement {breakdown.wargear} · Amélioration {breakdown.enhancement}</p>
      )}
      {inventoryReservation?.hasCatalogEntry && (
        <p className="inventory-reservation">
          Réservées : {inventoryReservation.realFigureIds.length} réelle(s) · {inventoryReservation.proxyFigureIds.length} proxy
          {inventoryReservation.missing > 0 && <strong className="inventory-warning"> · Manque {inventoryReservation.missing} fig.</strong>}
        </p>
      )}
    </article>
  );
}

export default function App(): React.JSX.Element {
  const [database, setDatabase] = useState<NormalizedDatabase | null>(null);
  const [draft, setDraft] = useState<RosterDraft | null>(null);
  const [inventory, setInventory] = useState<InventoryDataset | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState('Inventaire en attente de la base.');
  const [status, setStatus] = useState('Chargement de la base intégrée…');
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [maxCost, setMaxCost] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [detachmentCatalogExpanded, setDetachmentCatalogExpanded] = useState(true);
  const [unitCatalogExpanded, setUnitCatalogExpanded] = useState(true);
  const [advancedCatalogFilters, setAdvancedCatalogFilters] = useState<AdvancedCatalogFilters>({ ...EMPTY_ADVANCED_CATALOG_FILTERS });
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
  const databaseInputRef = useRef<HTMLInputElement>(null);
  const inventoryInputRef = useRef<HTMLInputElement>(null);
  const listInputRef = useRef<HTMLInputElement>(null);

  const installDatabase = async (nextDatabase: NormalizedDatabase, source: string): Promise<void> => {
    setDatabase(nextDatabase);
    setDraft((current) => {
      if (current) return current;
      const preferredId = startupActiveDraftIdRef.current;
      const candidates = [...startupDraftsRef.current].sort((left, right) => Number(right.id === preferredId) - Number(left.id === preferredId));
      return candidates.map((saved) => restoreSavedDraft(saved, nextDatabase)).find((saved): saved is RosterDraft => saved !== null) ?? newDraft(nextDatabase);
    });
    setStatus(`${source} · ${nextDatabase.units.length.toLocaleString('fr-FR')} unités, ${nextDatabase.detachments.length} détachements`);
    setError(null);
    try {
      await cacheDatabase(nextDatabase);
    } catch {
      setNotice('La base est chargée, mais le cache local n’a pas pu être mis à jour.');
    }
  };

  const installInventory = async (nextInventory: InventoryDataset): Promise<void> => {
    setInventory(nextInventory);
    setInventoryStatus(`${nextInventory.sourceLabel} · ${nextInventory.entries.length.toLocaleString('fr-FR')} association(s)`);
    try {
      await cacheInventory(nextInventory);
    } catch {
      setNotice('Inventaire chargé, mais le cache local n’a pas pu être mis à jour.');
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`${DATA_BASE_URL}catalog.json`);
        if (!response.ok) throw new Error('La base intégrée est indisponible.');
        await installDatabase(await normalizeWithWorker(await response.text()), 'Catalogue V11 intégré');
      } catch (loadError) {
        try {
          const cached = await getCachedDatabase();
          if (!cached) throw loadError;
          await installDatabase(cached, 'Base en cache local');
        } catch {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger la base.');
          setStatus('Chargement impossible');
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
        setInventoryStatus(`${cached.sourceLabel} · ${cached.entries.length.toLocaleString('fr-FR')} association(s)`);
        return;
      }

      try {
        const response = await fetch(`${DATA_BASE_URL}datasheet_x_figs.csv`);
        if (!response.ok) throw new Error('Le CSV d’inventaire intégré est indisponible.');
        const parsed = parseInventoryCsv(await response.text(), database, 'Inventaire intégré', 'bundled');
        if (!active) return;
        await installInventory(parsed);
      } catch (inventoryError) {
        if (!active) return;
        if (cached?.databaseFingerprint === database.fingerprint) {
          setInventory(cached);
          setInventoryStatus(`${cached.sourceLabel} · ${cached.entries.length.toLocaleString('fr-FR')} association(s), depuis le cache local`);
          return;
        }
        setInventory(null);
        setInventoryStatus(inventoryError instanceof Error ? `Inventaire indisponible : ${inventoryError.message}` : 'Inventaire indisponible.');
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
      setError('La sauvegarde locale est indisponible dans ce navigateur. Vérifiez que le stockage du site n’est pas bloqué.');
      return;
    }
    if (announce) setNotice('Liste enregistrée localement. Les modifications suivantes sont sauvegardées automatiquement.');
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
        message: `${unit?.displayName ?? 'Unité'} : il manque ${reservation.missing} figurine(s) dans l’inventaire.`
      }];
    });
  }, [database, draft, inventory, inventoryAllocation]);
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
  const listAnalysis = useMemo(
    () => database && draft ? analyzeRoster(database, draft) : null,
    [database, draft]
  );

  const factionUnits = useMemo(() => {
    if (!database || !draft) return [];
    const searchText = search.trim().toLocaleLowerCase();
    const ceiling = maxCost ? Number(maxCost) : undefined;
    return database.units.filter((unit) => {
      if (!isUnitAvailableToFaction(database, draft.primaryFaction, unit)) return false;
      if (favouritesOnly && !favorites.includes(unit.id)) return false;
      if (inStockOnly && !hasFreeInventory(inventory, inventoryAllocation, unit.id)) return false;
      if (!matchesAdvancedCatalogFilters(unit, advancedCatalogFilters)) return false;
      if (roleFilter && !(unit.Keywords ?? []).some((keyword) => keyword.toLocaleLowerCase().includes(roleFilter.toLocaleLowerCase()))) return false;
      if (searchText) {
        const corpus = [unit.displayName, ...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])].join(' ').toLocaleLowerCase();
        if (!corpus.includes(searchText)) return false;
      }
      const nextOccurrence = draft.items.filter((item) => item.unitId === unit.id).length + 1;
      const minimumCost = minimumPointCost(unit, nextOccurrence);
      if (ceiling !== undefined && minimumCost !== null && minimumCost > ceiling) return false;
      return true;
    });
  }, [database, draft, search, maxCost, roleFilter, favouritesOnly, favorites, inStockOnly, inventory, inventoryAllocation, advancedCatalogFilters]);

  const roles = useMemo(() => {
    if (!database || !draft) return [];
    return [...new Set(database.units.filter((unit) => isUnitAvailableToFaction(database, draft.primaryFaction, unit)).flatMap((unit) => unit.Keywords ?? []))]
      .sort((left, right) => left.localeCompare(right, 'fr'));
  }, [database, draft]);

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
      setError('Cette liste est incompatible avec la base chargée.');
      return;
    }
    setDraft(restored);
    writeActiveDraftId(restored.id);
    setSelectedUnitId(null);
    setVisibleUnits(60);
    setNotice(`Liste « ${saved.name} » ouverte.`);
  };

  const createDraft = (): void => {
    if (!database) return;
    const next = newDraft(database);
    setDraft(next);
    writeActiveDraftId(next.id);
    setSelectedUnitId(null);
    setVisibleUnits(60);
    persistDraft(next);
    setNotice('Nouvelle liste créée. Elle est sauvegardée automatiquement.');
  };

  const deleteSavedDraft = (saved: SavedDraft): void => {
    if (!database || !window.confirm(`Supprimer définitivement la liste « ${saved.name} » ?`)) return;
    const next = savedDraftsRef.current.filter((candidate) => candidate.id !== saved.id);
    savedDraftsRef.current = next;
    setSavedDrafts(next);
    if (!writeSavedDrafts(next)) {
      setError('La suppression n’a pas pu être enregistrée localement.');
      return;
    }
    if (draft?.id === saved.id) {
      const replacement = newDraft(database);
      setDraft(replacement);
      writeActiveDraftId(replacement.id);
      persistDraft(replacement);
    }
    setNotice(`Liste « ${saved.name} » supprimée.`);
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
    if ((draft.items.length > 0 || draft.detachmentIds.length > 0) && !window.confirm('Changer de faction retire les unités et détachements actuels. Continuer ?')) return;
    updateDraft((current) => ({ ...current, primaryFaction: nextFaction, items: [], detachmentIds: [] }));
    setSelectedUnitId(null);
    setVisibleUnits(60);
  };

  const loadExternalDatabase = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setStatus(`Lecture de ${file.name}…`);
      await installDatabase(await normalizeWithWorker(await file.text()), `Base importée : ${file.name}`);
      setNotice('La base importée est maintenant celle utilisée par la session.');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Ce fichier ne peut pas être lu comme base Warforge.');
    } finally {
      event.target.value = '';
    }
  };

  const loadExternalInventory = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file || !database) return;
    try {
      const parsed = parseInventoryCsv(await file.text(), database, `Inventaire importé : ${file.name}`, 'local');
      await installInventory(parsed);
      setNotice('Inventaire local remplacé pour cette base.');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Ce fichier ne peut pas être lu comme inventaire Warforge.');
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
      if (payload.schemaVersion !== NEW_SCHEMA || !payload.draft) throw new Error('Ce fichier ne correspond pas au format Warforge v1.');
      if (payload.databaseFingerprint !== database.fingerprint) throw new Error('Cette liste a été exportée avec une base incompatible et ne peut pas être rapprochée automatiquement.');
      const validDetachments = payload.draft.detachmentIds.filter((id) => database.detachments.some((detachment) => detachment.id === id));
      const validItems = payload.draft.items.filter((item) => database.units.some((unit) => unit.id === item.unitId));
      if (validDetachments.length !== payload.draft.detachmentIds.length || validItems.length !== payload.draft.items.length) throw new Error('Cette liste est incomplète pour la base chargée.');
      const importedDetachments = database.detachments.filter((detachment) => validDetachments.includes(detachment.id));
      const scenario = keepSelectableScenario(importedDetachments, payload.draft.scenario);
      const wasScenarioAdjusted = scenario !== payload.draft.scenario;
      setDraft({ ...payload.draft, scenario, detachmentIds: validDetachments, items: validItems.map(normalizeRosterItemWargear), id: crypto.randomUUID() });
      setNotice(wasScenarioAdjusted ? 'Liste importée ; le scénario a été ajusté aux détachements.' : 'Liste importée.');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import impossible.');
    } finally {
      event.target.value = '';
    }
  };

  const toggleFavorite = (unitId: string): void => {
    const next = favorites.includes(unitId) ? favorites.filter((id) => id !== unitId) : [...favorites, unitId];
    setFavorites(next);
    writeFavorites(next);
  };

  if (!database || !draft) {
    return (
      <main className="loading-shell">
        <div className="loading-card">
          <span className="eyebrow">WARFORGE 40K</span>
          <h1>Préparation de l’arsenal</h1>
          <p>{status}</p>
          {error && <p className="error-text">{error}</p>}
          <button onClick={() => databaseInputRef.current?.click()}>Importer une base JSON</button>
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
            <div><span className="eyebrow">BIBLIOTHÈQUE</span><h2>Unités disponibles</h2></div>
            <div className="library-heading-actions">
              <p>{factionUnits.length} résultat(s)</p>
              <button
                className="secondary"
                aria-controls="unit-catalog"
                aria-expanded={unitCatalogExpanded}
                onClick={() => setUnitCatalogExpanded((expanded) => !expanded)}
              >
                {unitCatalogExpanded ? 'Réduire le catalogue' : 'Afficher le catalogue'}
              </button>
            </div>
          </div>
          <div id="unit-catalog" hidden={!unitCatalogExpanded}>
            <div className="filters">
              <input placeholder="Rechercher une unité, un mot-clé…" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleUnits(60); }} />
              <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setVisibleUnits(60); }}>
                <option value="">Tous les rôles</option>
                {roles.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
              <input type="number" min="0" placeholder="Coût max" value={maxCost} onChange={(event) => { setMaxCost(event.target.value); setVisibleUnits(60); }} />
              <label className="checkbox-label"><input type="checkbox" checked={favouritesOnly} onChange={(event) => setFavouritesOnly(event.target.checked)} /> Favoris</label>
              <label className="checkbox-label" title={inventory ? undefined : 'Chargez un inventaire compatible pour filtrer le stock.'}>
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  disabled={!inventory}
                  onChange={(event) => { setInStockOnly(event.target.checked); setVisibleUnits(60); }}
                /> En stock
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
              return (
              <article className={`unit-card ${isAlliedUnit(database, draft.primaryFaction, unit) ? 'allied-unit' : ''}`} key={unit.id}>
                <button className={`favorite ${favorites.includes(unit.id) ? 'active' : ''}`} onClick={() => toggleFavorite(unit.id)} aria-label={`Favori ${unit.displayName}`}>★</button>
                <div className="unit-card-layout">
                  <div className="unit-thumbnail" aria-hidden="true" />
                  <div className="unit-card-content">
                    <h3>{unit.displayName}</h3>
                    <p className="muted">{unit.Faction || unit.factionName}{isAlliedUnit(database, draft.primaryFaction, unit) && <span className="ally-label">Allié · {sourceLabel(database, unit.sourceKey)}</span>}</p>
                    <div className="tag-row">{(unit.Keywords ?? []).slice(0, 4).map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
                    {(unit.StatLines ?? []).map((line, index) => <UnitProfile key={index} line={line} />)}
                    {(unit.UnitComposition?.ModelCompositions?.length ?? 0) > 0 && (
                      <section className="unit-composition">
                        <h4>Composition</h4>
                        <ul>{unit.UnitComposition?.ModelCompositions?.map((model, index) => <li key={`${model.ModelName ?? 'figurine'}-${index}`}>{compositionLabel(model)}</li>)}</ul>
                      </section>
                    )}
                    <strong className="unit-card-price">{minimumPointCost(unit, draft.items.filter((item) => item.unitId === unit.id).length + 1) ?? '?'} pts <small>à partir de</small></strong>
                    {availability && (
                      <p className={`inventory-stock ${availability.hasCatalogEntry ? '' : 'unlisted'}`}>
                        {availability.hasCatalogEntry
                          ? <>Stock libre : {availability.real} réel · {availability.proxy} proxy</>
                          : 'Inventaire non renseigné'}
                      </p>
                    )}
                    <div className="card-actions">
                      <button className="secondary" onClick={() => setSelectedUnitId(unit.id)}>Détails</button>
                      <button onClick={() => updateDraft((current) => ({ ...current, items: [...current.items, makeRosterItem(unit.id)] }))}>Ajouter</button>
                    </div>
                  </div>
                </div>
              </article>
              );
            })}
            </div>
            {factionUnits.length > visibleUnits && <button className="load-more" onClick={() => setVisibleUnits((current) => current + 60)}>Afficher 60 unités de plus</button>}
          </div>
        </div>

        <aside className="roster-panel">
          <div className="section-heading">
            <div><span className="eyebrow">LISTE</span><h2>{draft.name || 'Liste sans nom'}</h2></div>
            <strong className={rosterTotal > (battleSize?.PointsTotal ?? Infinity) ? 'bad-total' : ''}>{rosterTotal}/{battleSize?.PointsTotal ?? '?'} pts</strong>
          </div>
          {listAnalysis && <ListAnalysisPanel analysis={listAnalysis} />}
          {selectedDetachments.length > 0 && (
            <section className="selected-detachments" aria-label="Détachements sélectionnés">
              <h3>Détachements</h3>
              {selectedDetachments.map((detachment) => (
                <article className="roster-card detachment-roster-card" key={detachment.id}>
                  <button
                    className="icon-button danger"
                    aria-label={`Retirer le détachement ${detachment.displayName}`}
                    onClick={() => toggleDetachment(detachment.id)}
                  >
                    ×
                  </button>
                  <div className="card-title-row"><h3>{detachment.displayName}</h3><strong>{getDetachmentCost(detachment)} DP</strong></div>
                  <p className="detachment-scenario">
                    Scénario : <strong>{(detachment.ForceDispositions ?? []).map(scenarioLabel).join(' · ') || 'Non renseigné'}</strong>
                  </p>
                </article>
              ))}
            </section>
          )}
          {draft.items.length === 0 ? <p className="empty-state">Ajoutez des unités depuis la bibliothèque.</p> : draft.items.map((item) => (
            <RosterCard
              key={item.id}
              database={database}
              item={item}
              draft={draft}
              inventoryReservation={inventoryAllocation.reservationsByItemId.get(item.id)}
              onChange={(nextItem) => updateDraft((current) => ({ ...current, items: current.items.map((candidate) => candidate.id === nextItem.id ? nextItem : candidate) }))}
              onRemove={() => updateDraft((current) => ({ ...current, items: current.items.filter((candidate) => candidate.id !== item.id) }))}
            />
          ))}
          <div className="validation-panel">
            <div className="section-heading"><h2>Validation</h2><span>{issues.filter((issue) => issue.level === 'error').length} erreur(s)</span></div>
            {issues.length === 0 ? <p className="valid-state">Liste prête à exporter.</p> : (
              <ul>
                {issues.map((issue) => <li className={issue.level} key={issue.id}>{issue.message}</li>)}
              </ul>
            )}
          </div>
          {compatibleSavedDrafts.length > 0 && (
            <div className="saved-panel">
              <div className="section-heading"><h3>Listes sauvegardées</h3><span>{compatibleSavedDrafts.length}</span></div>
              <p className="muted">La liste active et chaque modification sont enregistrées automatiquement sur cet appareil.</p>
              <div className="saved-list-stack">
                {compatibleSavedDrafts.map((saved) => (
                  <div className={`saved-list-row ${saved.id === draft.id ? 'active' : ''}`} key={saved.id}>
                    <button className="saved-list" onClick={() => activateSavedDraft(saved)} aria-current={saved.id === draft.id ? 'page' : undefined}>
                      <span>{saved.name}</span><small>{new Date(saved.updatedAt).toLocaleString('fr-FR')}</small>
                    </button>
                    <button className="saved-delete" onClick={() => deleteSavedDraft(saved)} aria-label={`Supprimer ${saved.name}`}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </section>

      <section className="command-center" aria-label="Commandement de liste">
        <div className="command-center-heading">
          <span className="eyebrow">COMMANDEMENT DE LISTE</span>
          <h2>Préparer la force</h2>
          <p>Choisissez le format, la faction et le scénario, puis enregistrez ou exportez la liste.</p>
        </div>
        <section className="configuration" aria-label="Configuration de la liste">
          <label>
            Nom de la liste
            <input value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Liste active
            <select aria-label="Liste active" value={draft.id} onChange={(event) => {
              const saved = compatibleSavedDrafts.find((candidate) => candidate.id === event.target.value);
              if (saved) activateSavedDraft(saved);
            }}>
              {!compatibleSavedDrafts.some((saved) => saved.id === draft.id) && <option value={draft.id}>{draft.name.trim() || 'Liste sans nom'}</option>}
              {compatibleSavedDrafts.map((saved) => <option key={saved.id} value={saved.id}>{saved.name}</option>)}
            </select>
          </label>
          <label>
            Format
            <select value={draft.battleSizePoints} onChange={(event) => updateDraft((current) => ({ ...current, battleSizePoints: Number(event.target.value) }))}>
              {database.battleSizes.map((size) => <option key={size.PointsTotal} value={size.PointsTotal}>{size.PointsTotal.toLocaleString('fr-FR')} pts · {size.DetachmentPoints} DP</option>)}
            </select>
          </label>
          <label>
            Faction
            <select value={draft.primaryFaction} onChange={(event) => changeFaction(event.target.value)}>
              {database.factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name} · {faction.unitCount} unités</option>)}
            </select>
          </label>
          <label>
            Scénario
            <select value={draft.scenario} onChange={(event) => updateDraft((current) => ({ ...current, scenario: event.target.value }))}>
              {availableScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
            </select>
          </label>
          <div className="configuration-actions">
            <button onClick={createDraft}>Nouvelle liste</button>
            <button className="secondary" onClick={saveDraft}>Enregistrer</button>
            <button className="secondary" disabled={hasBlockingIssue} onClick={exportDraft}>Exporter v1</button>
          </div>
        </section>

        <section className="scenario-guide">
          <div>
            <span className="eyebrow">GUIDE DE SCÉNARIO</span>
            <h2>{scenarioLabel(draft.scenario)}</h2>
            <p>{SCENARIOS.find((scenario) => scenario.id === draft.scenario)?.guide}</p>
          </div>
          <dl>
            <div><dt>Scénarios autorisés</dt><dd>{availableScenarios.length}</dd></div>
            <div><dt>Budget de détachements</dt><dd>{detachmentPoints}/{battleSize?.DetachmentPoints ?? '?'} DP</dd></div>
            <div><dt>Limite d’améliorations</dt><dd>{battleSize?.EnhancementLimit ?? '?'}</dd></div>
          </dl>
        </section>
      </section>

      <section className="detachment-section">
        <div className="section-heading">
          <div><span className="eyebrow">DÉTACHEMENTS</span><h2>Forces de la faction</h2></div>
          <div className="detachment-heading-actions">
            <p>{selectedDetachments.length} sélectionné(s) · ils déterminent les scénarios autorisés.</p>
            <button
              className="secondary"
              aria-controls="detachment-catalog"
              aria-expanded={detachmentCatalogExpanded}
              onClick={() => setDetachmentCatalogExpanded((expanded) => !expanded)}
            >
              {detachmentCatalogExpanded ? 'Réduire le catalogue' : 'Afficher le catalogue'}
            </button>
          </div>
        </div>
        <div id="detachment-catalog" hidden={!detachmentCatalogExpanded}>
          <div className="detachment-grid">
            {factionDetachments.map((detachment) => {
              const selected = draft.detachmentIds.includes(detachment.id);
              return (
                <article className={`detachment-card ${selected ? 'selected' : ''}`} key={detachment.id}>
                  <div className="card-title-row"><h3>{detachment.displayName}</h3><strong>{getDetachmentCost(detachment)} DP</strong></div>
                  <p>{detachment.Rule?.Title || 'Règle de détachement'}</p>
                  <p className="detachment-scenario">
                    Scénario : <strong>{(detachment.ForceDispositions ?? []).map(scenarioLabel).join(' · ') || 'Non renseigné'}</strong>
                  </p>
                  <div className="tag-row">{(detachment.Tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}</div>
                  <button className={selected ? 'secondary' : ''} onClick={() => toggleDetachment(detachment.id)}>
                    {selected ? 'Retirer' : 'Ajouter'}
                  </button>
                  <CompactRule detachment={detachment} />
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
          <button className="secondary" onClick={() => databaseInputRef.current?.click()}>Mettre à jour la base</button>
          <button className="secondary" onClick={() => listInputRef.current?.click()}>Importer une liste v1</button>
          <button className="secondary" onClick={() => inventoryInputRef.current?.click()}>Importer un inventaire CSV</button>
          <button className="secondary" onClick={() => window.print()}>Imprimer</button>
          <input ref={databaseInputRef} type="file" accept="application/json,.json" hidden onChange={loadExternalDatabase} />
          <input ref={inventoryInputRef} type="file" accept="text/csv,.csv" hidden onChange={loadExternalInventory} />
          <input ref={listInputRef} type="file" accept="application/json,.json" hidden onChange={importDraft} />
        </div>
      </header>

      {selectedUnit && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedUnitId(null)}>
          <section className="unit-modal" role="dialog" aria-modal="true" aria-label={`Détails de ${selectedUnit.displayName}`} onMouseDown={(event) => event.stopPropagation()}>
            <button className="icon-button" onClick={() => setSelectedUnitId(null)} aria-label="Fermer">×</button>
            <span className="eyebrow">{selectedUnit.factionName}</span>
            <h2>{selectedUnit.displayName}</h2>
            <div className="tag-row">{[...(selectedUnit.Keywords ?? []), ...(selectedUnit.FactionKeywords ?? [])].map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
            {(selectedUnit.StatLines ?? []).map((line, index) => (
              <dl className="stat-grid" key={index}>
                {['Movement', 'Toughness', 'Save', 'Wounds', 'Leadership', 'OC'].map((key) => <div key={key}><dt>{key}</dt><dd>{String(line[key] ?? '—')}</dd></div>)}
              </dl>
            ))}
            {(selectedUnit.Weapons?.length ?? 0) > 0 && (
              <details className="weapon-details">
                <summary>Armes</summary>
                <WeaponTable profiles={weaponProfiles(selectedUnit)} />
              </details>
            )}
            {(selectedUnit.UnitAbilities?.length ?? 0) > 0 && <h3>Aptitudes</h3>}
            {selectedUnit.UnitAbilities?.map((ability, index) => <p key={index}><strong>{ability.Title}</strong> {ability.Text}</p>)}
            <button onClick={() => { updateDraft((current) => ({ ...current, items: [...current.items, makeRosterItem(selectedUnit.id)] })); setSelectedUnitId(null); }}>Ajouter à la liste</button>
          </section>
        </div>
      )}
    </main>
  );
}
