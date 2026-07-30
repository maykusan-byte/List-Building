import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { calculateItemCost, calculateRosterTotal, enhancementIsEligible, getDetachmentCost, getEnhancement, getPointOption, getSelectedDetachments, getWargearChoiceGroups } from './domain/calculations';
import { allocateInventory, getInventoryAvailability, hasFreeInventory, parseInventoryCsv } from './domain/inventory';
import { normalizeDatabase } from './domain/normalize';
import { keepSelectableScenario, SCENARIOS, scenarioLabel, selectableScenarios } from './domain/scenarios';
import { cacheDatabase, cacheInventory, getCachedDatabase, getCachedInventory, readFavorites, readSavedDrafts, writeFavorites, writeSavedDrafts } from './domain/storage';
import type { InventoryDataset, InventoryReservation } from './domain/inventory';
import type { ExportedList, NormalizedDatabase, NormalizedDetachment, NormalizedUnit, RosterDraft, RosterItem, SavedDraft } from './domain/types';
import { validateDraft } from './domain/validation';
import './styles.css';

const NEW_SCHEMA = 'warforge-list/v1';
const DATA_BASE_URL = `${import.meta.env.BASE_URL}data/`;

function newDraft(database: NormalizedDatabase): RosterDraft {
  const format = database.battleSizes.find((size) => size.PointsTotal === 2000) ?? database.battleSizes[0];
  return {
    id: crypto.randomUUID(),
    name: 'Nouvelle liste',
    primaryFaction: database.factions[0]?.name ?? '',
    battleSizePoints: format?.PointsTotal ?? 2000,
    scenario: 'TAKE AND HOLD',
    detachmentIds: [],
    items: []
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

function pointLabel(unit: NormalizedUnit, index: number): string {
  const option = getPointOption(unit, index);
  if (!option) return 'Profil sans coût';
  const quantity = [option.UnitCount ? `${option.UnitCount} unité(s)` : '', option.ModelCount ? `${option.ModelCount} fig.` : '']
    .filter(Boolean)
    .join(' · ');
  return `${quantity || 'Format standard'} — ${option.Cost ?? '?'} pts`;
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
  const breakdown = calculateItemCost(database, item, draft.detachmentIds);
  const groups = getWargearChoiceGroups(unit);
  const selectedDetachments = database.detachments.filter((detachment) => draft.detachmentIds.includes(detachment.id));
  const enhancementOptions = selectedDetachments.flatMap((detachment) =>
    (detachment.Enhancements ?? []).map((enhancement, enhancementIndex) => ({ detachment, enhancement, enhancementIndex }))
  ).filter(({ enhancement }) => enhancementIsEligible(unit, enhancement));
  const enhancementValue = item.enhancement ? `${item.enhancement.detachmentId}::${item.enhancement.enhancementIndex}` : '';

  return (
    <article className="roster-card">
      <button className="icon-button danger" aria-label={`Retirer ${unit.displayName}`} onClick={onRemove}>×</button>
      <h3>{unit.displayName}</h3>
      <p className="muted">{unit.factionName} · {pointLabel(unit, item.pointIndex)}</p>
      <label>
        Taille / coût de base
        <select value={item.pointIndex} onChange={(event) => onChange({ ...item, pointIndex: Number(event.target.value) })}>
          {(unit.Points ?? []).map((_, index) => <option key={index} value={index}>{pointLabel(unit, index)}</option>)}
        </select>
      </label>
      {groups.map((group) => (
        <label key={group.id}>
          {group.label}
          <select
            value={item.wargearSelections[group.id] ?? ''}
            onChange={(event) => onChange({
              ...item,
              wargearSelections: { ...item.wargearSelections, [group.id]: event.target.value }
            })}
          >
            <option value="">Conserver l’équipement de base</option>
            {group.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      ))}
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
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites());
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>(() => readSavedDrafts());
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [visibleUnits, setVisibleUnits] = useState(60);
  const [notice, setNotice] = useState<string | null>(null);
  const databaseInputRef = useRef<HTMLInputElement>(null);
  const inventoryInputRef = useRef<HTMLInputElement>(null);
  const listInputRef = useRef<HTMLInputElement>(null);

  const installDatabase = async (nextDatabase: NormalizedDatabase, source: string): Promise<void> => {
    setDatabase(nextDatabase);
    setDraft((current) => current ?? newDraft(nextDatabase));
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
        const response = await fetch(`${DATA_BASE_URL}master_warorgan.json`);
        if (!response.ok) throw new Error('La base intégrée est indisponible.');
        await installDatabase(await normalizeWithWorker(await response.text()), 'Base intégrée');
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

  const factionUnits = useMemo(() => {
    if (!database || !draft) return [];
    const searchText = search.trim().toLocaleLowerCase();
    const ceiling = maxCost ? Number(maxCost) : undefined;
    return database.units.filter((unit) => {
      if (unit.factionName !== draft.primaryFaction) return false;
      if (favouritesOnly && !favorites.includes(unit.id)) return false;
      if (inStockOnly && !hasFreeInventory(inventory, inventoryAllocation, unit.id)) return false;
      if (roleFilter && !(unit.Keywords ?? []).some((keyword) => keyword.toLocaleLowerCase().includes(roleFilter.toLocaleLowerCase()))) return false;
      if (searchText) {
        const corpus = [unit.displayName, ...(unit.Keywords ?? []), ...(unit.FactionKeywords ?? [])].join(' ').toLocaleLowerCase();
        if (!corpus.includes(searchText)) return false;
      }
      if (ceiling !== undefined && (unit.Points?.[0]?.Cost ?? 0) > ceiling) return false;
      return true;
    });
  }, [database, draft, search, maxCost, roleFilter, favouritesOnly, favorites, inStockOnly, inventory, inventoryAllocation]);

  const roles = useMemo(() => {
    if (!database || !draft) return [];
    return [...new Set(database.units.filter((unit) => unit.factionName === draft.primaryFaction).flatMap((unit) => unit.Keywords ?? []))]
      .sort((left, right) => left.localeCompare(right, 'fr'));
  }, [database, draft]);

  const factionDetachments = useMemo(() => {
    if (!database || !draft) return [];
    return database.detachments.filter((detachment) => detachment.factionName === draft.primaryFaction);
  }, [database, draft]);

  const availableScenarios = useMemo(
    () => selectableScenarios(selectedDetachments),
    [selectedDetachments]
  );

  const updateDraft = (updater: (current: RosterDraft) => RosterDraft): void => {
    setDraft((current) => current ? updater(current) : current);
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
    const saved: SavedDraft = { id: draft.id, name: draft.name.trim() || 'Liste sans nom', updatedAt: new Date().toISOString(), draft };
    const next = [saved, ...savedDrafts.filter((candidate) => candidate.id !== saved.id)].slice(0, 20);
    setSavedDrafts(next);
    writeSavedDrafts(next);
    setNotice('Brouillon enregistré localement.');
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
      const validDetachments = payload.draft.detachmentIds.filter((id) => database.detachments.some((detachment) => detachment.id === id));
      const validItems = payload.draft.items.filter((item) => database.units.some((unit) => unit.id === item.unitId));
      const wasTrimmed = validDetachments.length !== payload.draft.detachmentIds.length || validItems.length !== payload.draft.items.length;
      const importedDetachments = database.detachments.filter((detachment) => validDetachments.includes(detachment.id));
      const scenario = keepSelectableScenario(importedDetachments, payload.draft.scenario);
      const wasScenarioAdjusted = scenario !== payload.draft.scenario;
      setDraft({ ...payload.draft, scenario, detachmentIds: validDetachments, items: validItems, id: crypto.randomUUID() });
      setNotice(wasTrimmed || wasScenarioAdjusted || payload.databaseFingerprint !== database.fingerprint
        ? 'Liste importée avec rapprochement : vérifiez les avertissements avant de la valider.'
        : 'Liste importée.');
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
      <header className="topbar">
        <div>
          <span className="eyebrow">WARFORGE 40K · PWA LOCALE</span>
          <h1>Commandement de liste</h1>
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

      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div>}
      {error && <div className="toast error-toast" role="alert">{error}<button onClick={() => setError(null)}>×</button></div>}

      <section className="configuration" aria-label="Configuration de la liste">
        <label>
          Nom de la liste
          <input value={draft.name} onChange={(event) => updateDraft((current) => ({ ...current, name: event.target.value }))} />
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
            {database.factions.map((faction) => <option key={faction.name} value={faction.name}>{faction.name} · {faction.unitCount} unités</option>)}
          </select>
        </label>
        <label>
          Scénario
          <select value={draft.scenario} onChange={(event) => updateDraft((current) => ({ ...current, scenario: event.target.value }))}>
            {availableScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.label}</option>)}
          </select>
        </label>
        <div className="configuration-actions">
          <button onClick={saveDraft}>Sauvegarder</button>
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

      <section className="workspace">
        <div className="library-panel">
          <div className="section-heading">
            <div><span className="eyebrow">BIBLIOTHÈQUE</span><h2>Unités disponibles</h2></div>
            <p>{factionUnits.length} résultat(s)</p>
          </div>
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
          <div className="unit-grid">
            {factionUnits.slice(0, visibleUnits).map((unit) => {
              const availability = getInventoryAvailability(inventory, inventoryAllocation, unit.id);
              return (
              <article className="unit-card" key={unit.id}>
                <button className={`favorite ${favorites.includes(unit.id) ? 'active' : ''}`} onClick={() => toggleFavorite(unit.id)} aria-label={`Favori ${unit.displayName}`}>★</button>
                <h3>{unit.displayName}</h3>
                <p className="muted">{unit.Faction || unit.factionName}</p>
                <div className="tag-row">{(unit.Keywords ?? []).slice(0, 4).map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
                <strong>{unit.Points?.[0]?.Cost ?? '?'} pts <small>à partir de</small></strong>
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
              </article>
              );
            })}
          </div>
          {factionUnits.length > visibleUnits && <button className="load-more" onClick={() => setVisibleUnits((current) => current + 60)}>Afficher 60 unités de plus</button>}
        </div>

        <aside className="roster-panel">
          <div className="section-heading">
            <div><span className="eyebrow">LISTE</span><h2>{draft.name || 'Liste sans nom'}</h2></div>
            <strong className={rosterTotal > (battleSize?.PointsTotal ?? Infinity) ? 'bad-total' : ''}>{rosterTotal}/{battleSize?.PointsTotal ?? '?'} pts</strong>
          </div>
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
          {savedDrafts.length > 0 && (
            <div className="saved-panel">
              <h3>Listes sauvegardées</h3>
              {savedDrafts.slice(0, 4).map((saved) => (
                <button className="saved-list" key={saved.id} onClick={() => setDraft({ ...saved.draft, id: crypto.randomUUID() })}>{saved.name}<small>{new Date(saved.updatedAt).toLocaleString('fr-FR')}</small></button>
              ))}
            </div>
          )}
        </aside>
      </section>

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
            {(selectedUnit.UnitAbilities?.length ?? 0) > 0 && <h3>Aptitudes</h3>}
            {selectedUnit.UnitAbilities?.map((ability, index) => <p key={index}><strong>{ability.Title}</strong> {ability.Text}</p>)}
            <button onClick={() => { updateDraft((current) => ({ ...current, items: [...current.items, makeRosterItem(selectedUnit.id)] })); setSelectedUnitId(null); }}>Ajouter à la liste</button>
          </section>
        </div>
      )}
    </main>
  );
}
