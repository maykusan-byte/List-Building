import { useMemo, useRef, useState } from 'react';
import {
  addOwnedFigures,
  addProxyAssociation,
  getInventoryAvailability,
  inventoryFigures,
  inventoryToCsv,
  removeInventoryAssociation
} from '../domain/inventory';
import type { CatalogLocalization } from '../domain/catalog-localization';
import type { InventoryAllocation, InventoryDataset } from '../domain/inventory';
import type { NormalizedDatabase, NormalizedUnit } from '../domain/types';

type StockFilter = 'all' | 'available' | 'reserved' | 'proxy';

interface InventoryPageProps {
  database: NormalizedDatabase;
  display: CatalogLocalization;
  locale: 'fr' | 'en';
  inventory: InventoryDataset | null;
  inventoryAllocation: InventoryAllocation;
  onSave: (inventory: InventoryDataset) => Promise<void>;
  onImport: (file: File) => Promise<void>;
}

function downloadInventory(filename: string, inventory: InventoryDataset): void {
  const blob = new Blob([inventoryToCsv(inventory)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function InventoryPage({ database, display, locale, inventory, inventoryAllocation, onSave, onImport }: InventoryPageProps): React.JSX.Element {
  const isFrench = locale === 'fr';
  const copy = isFrench ? {
    eyebrow: 'COLLECTION LOCALE',
    title: 'Inventaire de figurines',
    lede: 'Vos figurines, leurs associations et leurs indisponibilités de liste restent sur cet appareil.',
    bundled: 'Inventaire inclus',
    local: 'Inventaire personnel',
    add: 'Ajouter des figurines',
    import: 'Importer un CSV',
    export: 'Exporter le CSV',
    physical: 'Figurines physiques',
    free: 'Disponibles',
    reserved: 'Réservées par la liste',
    proxies: 'Associations proxy',
    explanation: 'Une figurine possède un identifiant unique. Elle peut être associée à plusieurs unités, mais ne sera jamais réservée deux fois par le constructeur de liste.',
    search: 'Rechercher une unité suivie',
    faction: 'Faction',
    allFactions: 'Toutes les factions',
    status: 'État',
    all: 'Tous',
    available: 'Disponible',
    onlyReserved: 'Réservé',
    onlyProxy: 'Avec proxy',
    tracked: 'Unités suivies',
    noTracked: 'Aucune unité ne correspond. Ajoutez vos premières figurines ou élargissez les filtres.',
    real: 'Réel',
    proxy: 'Proxy',
    used: 'Réservé',
    details: 'Gérer',
    associations: 'Associations',
    noAssociations: 'Aucune association pour cette unité.',
    addProxy: 'Associer un proxy',
    remove: 'Retirer',
    source: 'Origine',
    sourceFigures: 'Figurine source',
    sourceNone: 'Aucune figurine réelle disponible : ajoutez d’abord une figurine possédée.',
    save: 'Enregistrer',
    cancel: 'Annuler',
    addTitle: 'Ajouter des figurines possédées',
    addLede: 'Chaque ajout reçoit un nouvel identifiant physique. Les changements sont enregistrés localement et inclus dans l’export de profil.',
    unit: 'Unité',
    count: 'Nombre',
    proxyTitle: 'Associer une figurine comme proxy',
    proxyLede: 'Cette association permet de proposer la figurine pour cette unité, sans pouvoir l’utiliser deux fois dans une même liste.',
    deleteConfirm: 'Retirer cette association de l’inventaire personnel ?',
    cannotEmpty: 'Conservez au moins une association ou importez un autre inventaire avant de retirer la dernière.',
    saved: 'Inventaire personnel enregistré.',
    imported: 'Inventaire CSV importé.',
    importFailed: 'Impossible d’importer cet inventaire.',
    invalidCount: 'Saisissez un nombre entier entre 1 et 99.',
    csvHint: 'Le CSV utilise les colonnes compatibles DatabaseFingerprint, UnitId, ID_figurine et Type.',
    figure: 'Figurine',
    noRealSource: 'Source réelle inconnue'
  } : {
    eyebrow: 'LOCAL COLLECTION',
    title: 'Miniature inventory',
    lede: 'Your miniatures, their mappings and their roster reservations stay on this device.',
    bundled: 'Included inventory',
    local: 'Personal inventory',
    add: 'Add miniatures',
    import: 'Import CSV',
    export: 'Export CSV',
    physical: 'Physical miniatures',
    free: 'Available',
    reserved: 'Reserved by roster',
    proxies: 'Proxy mappings',
    explanation: 'A miniature has one unique identifier. It can be mapped to several units, but the list builder will never reserve it twice.',
    search: 'Search tracked units',
    faction: 'Faction',
    allFactions: 'All factions',
    status: 'Status',
    all: 'All',
    available: 'Available',
    onlyReserved: 'Reserved',
    onlyProxy: 'With proxy',
    tracked: 'Tracked units',
    noTracked: 'No unit matches. Add your first miniatures or widen the filters.',
    real: 'Real',
    proxy: 'Proxy',
    used: 'Reserved',
    details: 'Manage',
    associations: 'Mappings',
    noAssociations: 'No mapping for this unit.',
    addProxy: 'Map a proxy',
    remove: 'Remove',
    source: 'Source',
    sourceFigures: 'Source miniature',
    sourceNone: 'No owned miniature is available: add an owned miniature first.',
    save: 'Save',
    cancel: 'Cancel',
    addTitle: 'Add owned miniatures',
    addLede: 'Each addition receives a new physical identifier. Changes are saved locally and included in your profile export.',
    unit: 'Unit',
    count: 'Count',
    proxyTitle: 'Map a miniature as a proxy',
    proxyLede: 'This mapping makes the miniature available for this unit without allowing it to be used twice in one roster.',
    deleteConfirm: 'Remove this mapping from your personal inventory?',
    cannotEmpty: 'Keep at least one mapping or import another inventory before removing the last one.',
    saved: 'Personal inventory saved.',
    imported: 'CSV inventory imported.',
    importFailed: 'Unable to import this inventory.',
    invalidCount: 'Enter a whole number between 1 and 99.',
    csvHint: 'The CSV uses the compatible DatabaseFingerprint, UnitId, ID_figurine and Type columns.',
    figure: 'Miniature',
    noRealSource: 'Unknown owned source'
  };
  const importInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [faction, setFaction] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [modal, setModal] = useState<'add' | 'proxy' | null>(null);
  const [addFaction, setAddFaction] = useState(() => database.units[0]?.factionName ?? '');
  const [addUnitId, setAddUnitId] = useState(() => database.units[0]?.id ?? '');
  const [addCount, setAddCount] = useState('1');
  const [proxyFigureId, setProxyFigureId] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeInventory = inventory ?? {
    databaseFingerprint: database.fingerprint,
    entries: [],
    sourceLabel: copy.local,
    sourceKind: 'local' as const
  };
  const figures = useMemo(() => inventoryFigures(activeInventory), [activeInventory]);
  const figuresById = useMemo(() => new Map(figures.map((figure) => [figure.figureId, figure])), [figures]);
  const unitsById = useMemo(() => new Map(database.units.map((unit) => [unit.id, unit])), [database]);
  const factions = useMemo(
    () => [...new Set(database.units.map((unit) => unit.factionName))].sort((left, right) => display.factionName(left).localeCompare(display.factionName(right))),
    [database, display]
  );
  const formUnits = useMemo(
    () => database.units
      .filter((unit) => !addFaction || unit.factionName === addFaction)
      .sort((left, right) => display.unitName(left).localeCompare(display.unitName(right))),
    [addFaction, database, display]
  );
  const trackedUnits = useMemo(() => {
    const tracked = new Set(activeInventory.entries.map((entry) => entry.unitId));
    const query = search.trim().toLocaleLowerCase(locale);
    return database.units
      .filter((unit) => tracked.has(unit.id))
      .filter((unit) => !faction || unit.factionName === faction)
      .filter((unit) => !query || display.searchTerms(unit).some((term) => term.toLocaleLowerCase(locale).includes(query)))
      .filter((unit) => {
        const availability = getInventoryAvailability(activeInventory, inventoryAllocation, unit.id);
        const entries = activeInventory.entries.filter((entry) => entry.unitId === unit.id);
        if (stockFilter === 'available') return (availability?.real ?? 0) + (availability?.proxy ?? 0) > 0;
        if (stockFilter === 'reserved') return (availability?.used ?? 0) > 0;
        if (stockFilter === 'proxy') return entries.some((entry) => entry.type === 'proxy');
        return true;
      })
      .sort((left, right) => display.unitName(left).localeCompare(display.unitName(right)));
  }, [activeInventory, database, display, faction, inventoryAllocation, locale, search, stockFilter]);
  const selectedUnit = selectedUnitId ? unitsById.get(selectedUnitId) ?? null : null;
  const selectedEntries = selectedUnit
    ? activeInventory.entries.filter((entry) => entry.unitId === selectedUnit.id).sort((left, right) => left.figureId - right.figureId)
    : [];
  const selectableProxyFigures = figures.filter((figure) => figure.realUnitIds.length > 0
    && (!selectedUnit || (!figure.realUnitIds.includes(selectedUnit.id) && !figure.proxyUnitIds.includes(selectedUnit.id))));
  const physicalCount = figures.length;
  const freeCount = figures.filter((figure) => !inventoryAllocation.reservedFigureIds.has(figure.figureId)).length;
  const reservedCount = figures.filter((figure) => inventoryAllocation.reservedFigureIds.has(figure.figureId)).length;
  const proxyCount = activeInventory.entries.filter((entry) => entry.type === 'proxy').length;

  const makeLocal = (next: InventoryDataset): InventoryDataset => ({
    ...next,
    sourceKind: 'local',
    sourceLabel: copy.local
  });

  const persist = async (next: InventoryDataset, message = copy.saved): Promise<void> => {
    setSaving(true);
    try {
      await onSave(makeLocal(next));
      setFeedback(message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : copy.importFailed);
    } finally {
      setSaving(false);
    }
  };

  const chooseFaction = (nextFaction: string): void => {
    setAddFaction(nextFaction);
    const firstUnit = database.units.find((unit) => unit.factionName === nextFaction);
    setAddUnitId(firstUnit?.id ?? '');
  };

  const openAddModal = (): void => {
    const firstFaction = addFaction || database.units[0]?.factionName || '';
    const firstUnit = database.units.find((unit) => unit.factionName === firstFaction) ?? database.units[0];
    setAddFaction(firstFaction);
    setAddUnitId(firstUnit?.id ?? '');
    setAddCount('1');
    setModal('add');
  };

  const submitAdd = async (): Promise<void> => {
    const count = Number(addCount);
    if (!addUnitId || !Number.isSafeInteger(count) || count < 1 || count > 99) {
      setFeedback(copy.invalidCount);
      return;
    }
    await persist(addOwnedFigures(activeInventory, addUnitId, count));
    setSelectedUnitId(addUnitId);
    setModal(null);
  };

  const openProxyModal = (): void => {
    setProxyFigureId(selectableProxyFigures[0] ? String(selectableProxyFigures[0].figureId) : '');
    setModal('proxy');
  };

  const submitProxy = async (): Promise<void> => {
    if (!selectedUnit || !proxyFigureId) return;
    await persist(addProxyAssociation(activeInventory, Number(proxyFigureId), selectedUnit.id));
    setModal(null);
  };

  const removeAssociation = async (figureId: number, unitId: string): Promise<void> => {
    if (activeInventory.entries.length <= 1) {
      setFeedback(copy.cannotEmpty);
      return;
    }
    if (!window.confirm(copy.deleteConfirm)) return;
    await persist(removeInventoryAssociation(activeInventory, figureId, unitId));
  };

  const importFile = async (file: File): Promise<void> => {
    setSaving(true);
    try {
      await onImport(file);
      setFeedback(copy.imported);
      setSelectedUnitId(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : copy.importFailed);
    } finally {
      setSaving(false);
    }
  };

  const sourceNames = (figureId: number): string => {
    const source = figuresById.get(figureId);
    const names = source?.realUnitIds
      .map((unitId) => unitsById.get(unitId))
      .filter((unit): unit is NormalizedUnit => Boolean(unit))
      .map((unit) => display.unitName(unit));
    return names?.join(', ') || copy.noRealSource;
  };

  return (
    <main className="inventory-shell">
      <header className="inventory-hero">
        <div>
          <span className="eyebrow">WARFORGE 40K · {copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.lede}</p>
          <span className={inventory?.sourceKind === 'local' ? 'inventory-source local' : 'inventory-source'}>
            {copy.source}: {inventory?.sourceKind === 'local' ? copy.local : copy.bundled}
          </span>
        </div>
        <div className="inventory-hero-actions">
          <button type="button" className="secondary" onClick={() => importInputRef.current?.click()} disabled={saving}>{copy.import}</button>
          <button type="button" className="secondary" onClick={() => downloadInventory('inventaire-warforge.csv', activeInventory)} disabled={activeInventory.entries.length === 0}>{copy.export}</button>
          <button type="button" onClick={openAddModal} disabled={saving}>{copy.add}</button>
          <input ref={importInputRef} type="file" accept="text/csv,.csv" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }} />
        </div>
      </header>

      <section className="inventory-summary" aria-label={copy.title}>
        <article><span>{copy.physical}</span><strong>{physicalCount}</strong></article>
        <article className="available"><span>{copy.free}</span><strong>{freeCount}</strong></article>
        <article className="reserved"><span>{copy.reserved}</span><strong>{reservedCount}</strong></article>
        <article><span>{copy.proxies}</span><strong>{proxyCount}</strong></article>
      </section>

      <section className="inventory-guidance">
        <span aria-hidden="true">i</span>
        <p>{copy.explanation}</p>
      </section>

      {feedback && <p className="inventory-feedback" role="status">{feedback}</p>}

      <section className="inventory-workspace">
        <div className="inventory-list-panel">
          <div className="inventory-section-heading">
            <div>
              <span className="eyebrow">{copy.tracked}</span>
              <h2>{trackedUnits.length}</h2>
            </div>
            <span className="muted">{copy.csvHint}</span>
          </div>
          <div className="inventory-filters">
            <label>
              <span>{copy.search}</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} />
            </label>
            <label>
              <span>{copy.faction}</span>
              <select value={faction} onChange={(event) => setFaction(event.target.value)}>
                <option value="">{copy.allFactions}</option>
                {factions.map((factionName) => <option key={factionName} value={factionName}>{display.factionName(factionName)}</option>)}
              </select>
            </label>
            <label>
              <span>{copy.status}</span>
              <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as StockFilter)}>
                <option value="all">{copy.all}</option>
                <option value="available">{copy.available}</option>
                <option value="reserved">{copy.onlyReserved}</option>
                <option value="proxy">{copy.onlyProxy}</option>
              </select>
            </label>
          </div>
          <div className="inventory-unit-list">
            {trackedUnits.map((unit) => {
              const availability = getInventoryAvailability(activeInventory, inventoryAllocation, unit.id);
              const hasProxy = activeInventory.entries.some((entry) => entry.unitId === unit.id && entry.type === 'proxy');
              return (
                <button key={unit.id} type="button" className={selectedUnit?.id === unit.id ? 'inventory-unit-row selected' : 'inventory-unit-row'} onClick={() => setSelectedUnitId(unit.id)}>
                  <span className="inventory-unit-name"><strong>{display.unitName(unit)}</strong><small>{display.factionName(unit.factionName)}</small></span>
                  <span className="inventory-unit-counts">
                    <small>{copy.real} {availability?.total ? activeInventory.entries.filter((entry) => entry.unitId === unit.id && entry.type === 'real').length : 0}</small>
                    {hasProxy && <small>{copy.proxy} {activeInventory.entries.filter((entry) => entry.unitId === unit.id && entry.type === 'proxy').length}</small>}
                    {(availability?.used ?? 0) > 0 && <small className="reserved">{copy.used} {availability?.used}</small>}
                  </span>
                </button>
              );
            })}
            {trackedUnits.length === 0 && <div className="inventory-empty"><p>{copy.noTracked}</p><button type="button" onClick={openAddModal}>{copy.add}</button></div>}
          </div>
        </div>

        <aside className="inventory-detail-panel">
          {selectedUnit ? (
            <>
              <div className="inventory-detail-heading">
                <div><span className="eyebrow">{display.factionName(selectedUnit.factionName)}</span><h2>{display.unitName(selectedUnit)}</h2></div>
                <button type="button" className="secondary" onClick={openProxyModal} disabled={saving}>{copy.addProxy}</button>
              </div>
              <p className="muted">{copy.associations}</p>
              <div className="inventory-association-list">
                {selectedEntries.map((entry) => {
                  const figure = figuresById.get(entry.figureId);
                  const isReserved = inventoryAllocation.reservedFigureIds.has(entry.figureId);
                  return (
                    <article key={`${entry.figureId}-${entry.unitId}`} className="inventory-association">
                      <div>
                        <span className={entry.type === 'real' ? 'inventory-kind real' : 'inventory-kind proxy'}>{entry.type === 'real' ? copy.real : copy.proxy}</span>
                        <strong>#{entry.figureId}</strong>
                        {isReserved && <small className="inventory-reserved-badge">{copy.used}</small>}
                        {entry.type === 'proxy' && <small>{copy.source}: {sourceNames(entry.figureId)}</small>}
                        {entry.type === 'real' && (figure?.proxyUnitIds.length ?? 0) > 0 && <small>{copy.proxy}: {figure?.proxyUnitIds.map((unitId) => unitsById.get(unitId)).filter((unit): unit is NormalizedUnit => Boolean(unit)).map((unit) => display.unitName(unit)).join(', ')}</small>}
                      </div>
                      <button type="button" className="inventory-remove" onClick={() => void removeAssociation(entry.figureId, entry.unitId)} disabled={saving}>{copy.remove}</button>
                    </article>
                  );
                })}
                {selectedEntries.length === 0 && <p className="muted">{copy.noAssociations}</p>}
              </div>
            </>
          ) : (
            <div className="inventory-detail-empty"><span aria-hidden="true">▦</span><h2>{copy.tracked}</h2><p>{copy.explanation}</p></div>
          )}
        </aside>
      </section>

      {modal === 'add' && (
        <div className="inventory-modal-backdrop" role="presentation">
          <section className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-add-title">
            <button type="button" className="inventory-modal-close" onClick={() => setModal(null)} aria-label={copy.cancel}>×</button>
            <span className="eyebrow">{copy.local}</span>
            <h2 id="inventory-add-title">{copy.addTitle}</h2>
            <p>{copy.addLede}</p>
            <div className="inventory-form-grid">
              <label><span>{copy.faction}</span><select value={addFaction} onChange={(event) => chooseFaction(event.target.value)}>{factions.map((factionName) => <option key={factionName} value={factionName}>{display.factionName(factionName)}</option>)}</select></label>
              <label><span>{copy.unit}</span><select value={addUnitId} onChange={(event) => setAddUnitId(event.target.value)}>{formUnits.map((unit) => <option key={unit.id} value={unit.id}>{display.unitName(unit)}</option>)}</select></label>
              <label><span>{copy.count}</span><input type="number" min="1" max="99" value={addCount} onChange={(event) => setAddCount(event.target.value)} /></label>
            </div>
            <div className="inventory-modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>{copy.cancel}</button><button type="button" onClick={() => void submitAdd()} disabled={saving}>{copy.add}</button></div>
          </section>
        </div>
      )}

      {modal === 'proxy' && selectedUnit && (
        <div className="inventory-modal-backdrop" role="presentation">
          <section className="inventory-modal" role="dialog" aria-modal="true" aria-labelledby="inventory-proxy-title">
            <button type="button" className="inventory-modal-close" onClick={() => setModal(null)} aria-label={copy.cancel}>×</button>
            <span className="eyebrow">{copy.proxy}</span>
            <h2 id="inventory-proxy-title">{copy.proxyTitle}</h2>
            <p>{copy.proxyLede}</p>
            {selectableProxyFigures.length > 0 ? (
              <label className="inventory-modal-field"><span>{copy.sourceFigures}</span><select value={proxyFigureId} onChange={(event) => setProxyFigureId(event.target.value)}>{selectableProxyFigures.map((figure) => <option key={figure.figureId} value={figure.figureId}>#{figure.figureId} · {sourceNames(figure.figureId)}</option>)}</select></label>
            ) : <p className="inventory-empty-inline">{copy.sourceNone}</p>}
            <div className="inventory-modal-actions"><button type="button" className="secondary" onClick={() => setModal(null)}>{copy.cancel}</button><button type="button" onClick={() => void submitProxy()} disabled={saving || selectableProxyFigures.length === 0}>{copy.save}</button></div>
          </section>
        </div>
      )}
    </main>
  );
}
