import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '../components/BrandMark';
import { buildWeaponCatalog, filterWeaponCatalog, sortWeaponCatalog, WEAPON_DAMAGE_TARGETS, WEAPON_TARGET_IDS, weaponFactions, weaponKeywords } from '../domain/weapon-catalog';
import type { SortDirection, WeaponCatalogEntry, WeaponCatalogSortColumn } from '../domain/weapon-catalog';
import type { CatalogLocalization } from '../domain/catalog-localization';
import type { NormalizedDatabase } from '../domain/types';

const NUMERIC_COLUMNS: ReadonlySet<WeaponCatalogSortColumn> = new Set(['range', 'attacks', 'skill', 'strength', 'ap', 'damage', ...WEAPON_TARGET_IDS]);

interface Column {
  key: WeaponCatalogSortColumn;
  label: string;
  detail?: string;
}

function stat(value: string | undefined): string {
  return value?.trim() || '—';
}

function damage(value: number, locale: string): string {
  return value.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 1 });
}

function CarrierList({ entry, display, locale }: { entry: WeaponCatalogEntry; display: CatalogLocalization; locale: string }): React.JSX.Element {
  const shown = entry.carriers.slice(0, 3);
  const remaining = entry.carriers.slice(3);
  const unitLabel = locale === 'fr' ? 'unités' : 'units';
  return (
    <div className="weapon-carriers">
      <div className="weapon-carrier-pills">
        {shown.map((unit) => <span key={unit.id} title={display.factionName(unit.factionName)}>{display.unitName(unit)}</span>)}
      </div>
      {remaining.length > 0 && (
        <details className="weapon-carrier-more">
          <summary>+ {remaining.length} {unitLabel}</summary>
          <div className="weapon-carrier-pills">
            {remaining.map((unit) => <span key={unit.id} title={display.factionName(unit.factionName)}>{display.unitName(unit)}</span>)}
          </div>
        </details>
      )}
    </div>
  );
}

export function WeaponsPage({
  database,
  display,
  locale
}: {
  database: NormalizedDatabase;
  display: CatalogLocalization;
  locale: 'fr' | 'en';
}): React.JSX.Element {
  const { t } = useTranslation();
  const [faction, setFaction] = useState('');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ column: WeaponCatalogSortColumn; direction: SortDirection }>({ column: 'name', direction: 'asc' });
  const catalog = useMemo(() => buildWeaponCatalog(database), [database]);
  const factions = useMemo(() => weaponFactions(catalog), [catalog]);
  const keywords = useMemo(() => weaponKeywords(catalog), [catalog]);
  const filtered = useMemo(
    () => filterWeaponCatalog(catalog, { faction, keyword, query }),
    [catalog, faction, keyword, query]
  );
  const entries = useMemo(
    () => sortWeaponCatalog(filtered, sort.column, sort.direction, locale),
    [filtered, sort, locale]
  );
  const carrierCount = entries.reduce((total, entry) => total + entry.carriers.length, 0);

  const columns: Column[] = [
    { key: 'type', label: locale === 'fr' ? 'Type' : 'Type' },
    { key: 'name', label: t('weapons.weapon') },
    { key: 'range', label: t('weapons.range') },
    { key: 'attacks', label: 'A' },
    { key: 'skill', label: locale === 'fr' ? 'CC / CT' : 'WS / BS' },
    { key: 'strength', label: 'F' },
    { key: 'ap', label: 'PA' },
    { key: 'damage', label: 'D' },
    ...WEAPON_DAMAGE_TARGETS.map(({ id, target }) => ({
      key: id,
      label: t(`analysis.target.${id}`),
      detail: `E ${target.toughness} · Svg ${target.save}+`
    })),
    { key: 'keywords', label: t('weapons.abilities') },
    { key: 'factions', label: locale === 'fr' ? 'Factions' : 'Factions' },
    { key: 'units', label: locale === 'fr' ? 'Unités équipables' : 'Equippable units' }
  ];

  const changeSort = (column: WeaponCatalogSortColumn): void => {
    setSort((current) => current.column === column
      ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: NUMERIC_COLUMNS.has(column) ? 'desc' : 'asc' });
  };

  const sortLabel = (column: WeaponCatalogSortColumn): string => {
    if (sort.column !== column) return locale === 'fr' ? 'Trier par ordre croissant' : 'Sort ascending';
    return sort.direction === 'asc'
      ? (locale === 'fr' ? 'Tri croissant, activer pour inverser' : 'Sorted ascending, activate to reverse')
      : (locale === 'fr' ? 'Tri décroissant, activer pour inverser' : 'Sorted descending, activate to reverse');
  };

  return (
    <main className="weapons-shell">
      <header className="weapons-topbar">
        <div className="brand-lockup">
          <BrandMark />
          <div>
          <span className="eyebrow">WARFORGE 40K · {locale === 'fr' ? 'ARSENAL' : 'ARMOURY'}</span>
          <h1>{locale === 'fr' ? 'Profils d’armes' : 'Weapon profiles'}</h1>
          <p>{locale === 'fr' ? 'Catalogue local · profils regroupés par ligne de caractéristiques' : 'Local catalog · profiles grouped by stat line'}</p>
          </div>
        </div>
      </header>

      <section className="weapons-introduction">
        <div>
          <span className="eyebrow">{locale === 'fr' ? 'TABLEAU DES PUISSANCES D’ATTAQUE' : 'ATTACK PROFILE TABLE'}</span>
          <h2>{catalog.length.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} {locale === 'fr' ? 'profils distincts' : 'distinct profiles'}</h2>
          <p>{locale === 'fr'
            ? 'Chaque ligne réunit les fiches dont le profil est identique. La colonne des unités révèle d’abord les trois premières, puis le reste à la demande.'
            : 'Each row combines datasheets with an identical profile. The units column shows the first three, then reveals the remainder on demand.'}</p>
        </div>
        <p className="weapons-caveat">{locale === 'fr'
          ? 'Les colonnes de cibles indiquent les dégâts moyens non sauvegardés d’un exemplaire de l’arme, avec les mêmes hypothèses que l’analyse de liste. Les porteurs sont issus des fiches du catalogue ; vérifiez les restrictions et remplacements d’équipement dans la fiche de l’unité.'
          : 'Target columns show average unsaved damage from one instance of the weapon, using the same assumptions as list analysis. Carriers come from catalog datasheets; check each unit datasheet for wargear restrictions and replacements.'}</p>
      </section>

      <section className="weapons-filters" aria-label={locale === 'fr' ? 'Filtres des profils d’armes' : 'Weapon profile filters'}>
        <label>
          <span>{locale === 'fr' ? 'Rechercher' : 'Search'}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={locale === 'fr' ? 'Arme, unité, faction…' : 'Weapon, unit, faction…'} />
        </label>
        <label>
          <span>{locale === 'fr' ? 'Faction' : 'Faction'}</span>
          <select value={faction} onChange={(event) => setFaction(event.target.value)}>
            <option value="">{locale === 'fr' ? 'Toutes les factions' : 'All factions'}</option>
            {factions.map((value) => <option key={value} value={value}>{display.factionName(value)}</option>)}
          </select>
        </label>
        <label>
          <span>{locale === 'fr' ? 'Mot-clé de l’arme' : 'Weapon keyword'}</span>
          <select value={keyword} onChange={(event) => setKeyword(event.target.value)}>
            <option value="">{locale === 'fr' ? 'Tous les mots-clés' : 'All keywords'}</option>
            {keywords.map((value) => <option key={value} value={value}>{display.term(value)}</option>)}
          </select>
        </label>
        {(faction || keyword || query) && <button className="secondary weapons-reset" onClick={() => { setFaction(''); setKeyword(''); setQuery(''); }}>{t('action.reset')}</button>}
      </section>

      <section className="weapons-table-panel" aria-live="polite">
        <div className="weapons-results-heading">
          <div><span className="eyebrow">{locale === 'fr' ? 'RÉSULTATS' : 'RESULTS'}</span><h2>{entries.length.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} {locale === 'fr' ? 'profils ·' : 'profiles ·'} {carrierCount.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US')} {locale === 'fr' ? 'fiches porteuses' : 'carrier datasheets'}</h2></div>
          <p>{locale === 'fr' ? 'Cliquez sur un en-tête pour trier.' : 'Click a column heading to sort.'}</p>
        </div>
        <div className="weapons-table-scroll">
          <table>
            <thead>
              <tr>{columns.map((column) => (
                <th key={column.key} aria-sort={sort.column === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button className="weapons-sort" onClick={() => changeSort(column.key)} aria-label={`${column.label}. ${sortLabel(column.key)}`}>
                    <span>{column.label}{sort.column === column.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</span>{column.detail && <small>{column.detail}</small>}
                  </button>
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.melee ? t('weapons.melee') : t('weapons.ranged')}</td>
                  <th scope="row">{entry.profile.Name ? display.term(entry.profile.Name.trim()) : (locale === 'fr' ? 'Arme sans nom' : 'Unnamed weapon')}</th>
                  <td>{stat(entry.profile.Range)}</td><td>{stat(entry.profile.Attacks)}</td><td>{stat(entry.profile.ToHit)}</td>
                  <td>{stat(entry.profile.Strength)}</td><td>{stat(entry.profile.AP)}</td><td>{stat(entry.profile.Damage)}</td>
                  {WEAPON_TARGET_IDS.map((id) => <td className="weapon-target-damage" key={id}><strong>{damage(entry.targetDamages[id], locale)}</strong></td>)}
                  <td><div className="weapon-keywords">{entry.keywords.length > 0 ? entry.keywords.map((value) => <span key={value}>{display.term(value)}</span>) : '—'}</div></td>
                  <td><div className="weapon-factions">{entry.factionNames.map((value) => <span key={value}>{display.factionName(value)}</span>)}</div></td>
                  <td><CarrierList entry={entry} display={display} locale={locale} /></td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td className="weapons-empty" colSpan={columns.length}>{locale === 'fr' ? 'Aucun profil ne correspond aux filtres sélectionnés.' : 'No profile matches the selected filters.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
