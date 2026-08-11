import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogLocalization } from '../domain/catalog-localization';
import {
  DEFAULT_STATISTICS_CONTEXT, DEFENSIVE_THREATS, STATISTICS_TARGETS,
  STATISTICS_ENGINE_VERSION, attachBenchmarks,
  type DefensiveThreat, type StatisticsSortKey, type StatisticsTarget, type TacticalRole,
  type UnitAnalysisContext, type UnitConfiguration, type UnitStatisticalProfile
} from '../domain/statistics';
import type { NormalizedDatabase } from '../domain/types';
import { cacheStatisticsProfiles, getCachedStatisticsProfiles } from '../domain/storage';
import { MetricHelp, StatisticsGuide } from './StatisticsGuide';
import './statistics.css';

const DEFAULT_PLAYGROUP = ['Space Marines', 'Ultramarines', 'Salamanders', 'Dark Angels', 'Blood Angels', 'Astra Militarum', "T'au Empire", 'Orks', 'Thousand Sons'];
const ROLE_LABELS: Record<TacticalRole, string> = {
  screen: 'Écran', 'objective-holder': "Tenue d’objectif", scorer: 'Scoring', 'fast-projection': 'Projection rapide',
  'ranged-damage': 'Dégâts tir', 'melee-damage': 'Dégâts mêlée', 'anti-horde': 'Anti-horde', 'anti-elite': 'Anti-élite',
  'anti-vehicle': 'Anti-véhicule', anvil: 'Enclume', support: 'Soutien', transport: 'Transport',
  'reserve-pressure': 'Pression de réserve', 'indirect-fire': 'Tir indirect'
};
const SORT_OPTIONS: ReadonlyArray<{ value: StatisticsSortKey; label: string }> = [
  { value: 'damageEfficiency', label: 'Dégâts / 100 pts' }, { value: 'durabilityEfficiency', label: 'PV effectifs / 100 pts' },
  { value: 'damage', label: 'Dégâts moyens' }, { value: 'p10', label: 'P10' }, { value: 'p90', label: 'P90' },
  { value: 'destroyProbability', label: 'Destruction' }, { value: 'survivalProbability', label: 'Survie' }, { value: 'points', label: 'Points' },
  { value: 'movement', label: 'Mouvement' }, { value: 'toughness', label: 'Endurance' }, { value: 'wounds', label: 'PV' },
  { value: 'objectiveControl', label: 'OC' }, { value: 'reliability', label: 'Fiabilité' }, { value: 'threatRange', label: 'Projection' }, { value: 'name', label: 'Nom' }
];
type StatisticsColumnId = 'points' | 'stats' | 'wounds' | 'damage' | 'quantiles' | 'destroy' | 'durability' | 'oc' | 'projection' | 'benchmark';
const STATISTICS_COLUMNS: ReadonlyArray<{ id: StatisticsColumnId; label: string; width: string }> = [
  { id: 'points', label: 'Points', width: '90px' }, { id: 'stats', label: 'M/E/Sv', width: '76px' }, { id: 'wounds', label: 'PV/OC', width: '70px' },
  { id: 'damage', label: 'Dégâts', width: '110px' }, { id: 'quantiles', label: 'P10–P90', width: '78px' }, { id: 'destroy', label: 'P. destruction', width: '86px' },
  { id: 'durability', label: 'PV eff./100', width: '88px' }, { id: 'oc', label: 'OC/100', width: '70px' }, { id: 'projection', label: 'Projection', width: '70px' }, { id: 'benchmark', label: 'Percentile', width: '100px' }
];

function initialColumns(): StatisticsColumnId[] {
  try {
    const stored = JSON.parse(localStorage.getItem('warforge.statistics.columns.v1') ?? 'null') as unknown;
    return Array.isArray(stored) ? stored.filter((value): value is StatisticsColumnId => STATISTICS_COLUMNS.some((column) => column.id === value)) : STATISTICS_COLUMNS.map((column) => column.id);
  } catch { return STATISTICS_COLUMNS.map((column) => column.id); }
}

type SortDirection = 'asc' | 'desc';

interface StatisticsPageProps {
  database: NormalizedDatabase;
  display: CatalogLocalization;
  locale: 'fr' | 'en';
  onAddConfiguration?: (unitId: string, configuration: UnitConfiguration) => void;
}

function number(value: number, locale: string, digits = 1): string {
  return value.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: digits });
}

function percentage(value: number, locale: string): string {
  return `${number(value * 100, locale, 0)} %`;
}

function profilePoints(profile: UnitStatisticalProfile, locale: string): string {
  const summary = profile.configurationSummary?.points;
  return summary ? `${number(summary.median, locale, 0)} (${summary.minimum}–${summary.maximum})` : String(profile.configuration.points);
}

function profileDamage(profile: UnitStatisticalProfile, locale: string): string {
  const summary = profile.configurationSummary?.usefulDamage;
  return summary ? `${number(summary.median, locale)} (${number(summary.minimum, locale)}–${number(summary.maximum, locale)})` : number(profile.offense.usefulDamage.mean, locale);
}

function metric(profile: UnitStatisticalProfile, key: StatisticsSortKey): string | number {
  if (key === 'name') return profile.unitName;
  if (key === 'faction') return profile.faction;
  if (key === 'points') return profile.configuration.points;
  if (key === 'movement') return profile.characteristics.movement;
  if (key === 'toughness') return profile.characteristics.toughness;
  if (key === 'wounds') return profile.characteristics.totalWounds;
  if (key === 'objectiveControl') return profile.characteristics.totalObjectiveControl;
  if (key === 'damage') return profile.offense.usefulDamage.mean;
  if (key === 'p10') return profile.offense.usefulDamage.p10;
  if (key === 'p90') return profile.offense.usefulDamage.p90;
  if (key === 'destroyProbability') return profile.offense.destroyProbability;
  if (key === 'survivalProbability') return profile.defense.survivalProbability;
  if (key === 'damageEfficiency') return profile.efficiency.damagePerHundred;
  if (key === 'durabilityEfficiency') return profile.efficiency.effectiveWoundsPerHundred;
  if (key === 'reliability') return profile.reliability.coefficientOfVariation ?? Number.POSITIVE_INFINITY;
  return profile.mobility.threatRange;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function comparable(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function initialPlaygroup(database: NormalizedDatabase): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem('warforge.statistics.playgroup.v2') ?? 'null') as unknown;
    const requested = Array.isArray(stored) && stored.every((value) => typeof value === 'string') ? stored : DEFAULT_PLAYGROUP;
    return [...new Set(requested.flatMap((value) => database.factions.filter((faction) => faction.id === value || comparable(faction.name) === comparable(value) || comparable(faction.sourceKey) === comparable(value)).map((faction) => faction.id)))];
  } catch { return []; }
}

function Histogram({ values }: { values: number[] }): React.JSX.Element {
  const maximum = Math.max(1, ...values);
  const bins = Array.from({ length: 10 }, () => 0);
  values.forEach((value) => { bins[Math.min(9, Math.floor((value / maximum) * 10))] += 1; });
  const peak = Math.max(1, ...bins);
  return <div className="statistics-histogram" aria-label="Histogramme des dégâts utiles">{bins.map((count, index) => <div key={index} style={{ height: `${Math.max(4, (count / peak) * 100)}%` }} title={`${count} configuration(s)`} />)}</div>;
}

function ScatterPlot({ profiles }: { profiles: UnitStatisticalProfile[] }): React.JSX.Element {
  const values = profiles.slice(0, 350);
  const maxX = Math.max(1, ...values.map((profile) => profile.efficiency.damagePerHundred));
  const maxY = Math.max(1, ...values.map((profile) => profile.efficiency.effectiveWoundsPerHundred));
  return <svg className="statistics-scatter" viewBox="0 0 600 260" role="img" aria-label="Dégâts contre durabilité par 100 points">
    <line x1="36" y1="10" x2="36" y2="230" /><line x1="36" y1="230" x2="590" y2="230" />
    {values.map((profile) => <circle key={profile.id} cx={36 + (profile.efficiency.damagePerHundred / maxX) * 544} cy={230 - (profile.efficiency.effectiveWoundsPerHundred / maxY) * 210} r={Math.max(2.5, Math.min(8, profile.configuration.points / 40))}><title>{profile.unitName} · Dégâts {profile.efficiency.damagePerHundred.toFixed(1)} · PV eff. {profile.efficiency.effectiveWoundsPerHundred.toFixed(1)}</title></circle>)}
    <text x="300" y="255">Dégâts utiles / 100 pts</text><text transform="rotate(-90)" x="-165" y="14">PV effectifs / 100 pts</text>
  </svg>;
}

function quantileValue(values: number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * probability)))] ?? 0;
}

function FactionBoxPlots({ profiles }: { profiles: UnitStatisticalProfile[] }): React.JSX.Element {
  const groups = [...new Set(profiles.map((profile) => profile.faction))].map((faction) => ({ faction, values: profiles.filter((profile) => profile.faction === faction).map((profile) => profile.efficiency.damagePerHundred) })).filter((group) => group.values.length >= 2).sort((left, right) => right.values.length - left.values.length).slice(0, 8);
  const maximum = Math.max(1, ...groups.flatMap((group) => group.values));
  return <svg className="statistics-boxplots" viewBox={`0 0 600 ${Math.max(80, groups.length * 34 + 24)}`} role="img" aria-label="Boîtes à moustaches des dégâts par faction">
    {groups.map((group, index) => { const minimum = Math.min(...group.values); const maximumValue = Math.max(...group.values); const q1 = quantileValue(group.values, 0.25); const medianValue = quantileValue(group.values, 0.5); const q3 = quantileValue(group.values, 0.75); const scale = (value: number) => 145 + value / maximum * 440; const y = 20 + index * 34; return <g key={group.faction}><text x="4" y={y + 5}>{group.faction.slice(0, 20)}</text><line x1={scale(minimum)} y1={y} x2={scale(maximumValue)} y2={y} /><rect x={scale(q1)} y={y - 8} width={Math.max(1, scale(q3) - scale(q1))} height="16" /><line x1={scale(medianValue)} y1={y - 8} x2={scale(medianValue)} y2={y + 8} /></g>; })}
  </svg>;
}

function RadarComparison({ profiles }: { profiles: UnitStatisticalProfile[] }): React.JSX.Element {
  const axes = [
    { label: 'Dégâts', value: (profile: UnitStatisticalProfile) => profile.efficiency.damagePerHundred },
    { label: 'Durabilité', value: (profile: UnitStatisticalProfile) => profile.efficiency.effectiveWoundsPerHundred },
    { label: 'OC', value: (profile: UnitStatisticalProfile) => profile.efficiency.objectiveControlPerHundred },
    { label: 'Projection', value: (profile: UnitStatisticalProfile) => profile.mobility.threatRange },
    { label: 'Fiabilité', value: (profile: UnitStatisticalProfile) => 1 / Math.max(0.05, profile.reliability.coefficientOfVariation ?? 10) }
  ];
  const center = 130; const radius = 100;
  const point = (axis: number, ratio: number) => { const angle = -Math.PI / 2 + axis * Math.PI * 2 / axes.length; return `${center + Math.cos(angle) * radius * ratio},${center + Math.sin(angle) * radius * ratio}`; };
  const maxima = axes.map((axis) => Math.max(1e-9, ...profiles.map(axis.value)));
  return <svg className="statistics-radar" viewBox="0 0 360 270" role="img" aria-label="Radar comparatif normalisé">
    <polygon points={axes.map((_, index) => point(index, 1)).join(' ')} className="radar-grid" />
    {axes.map((axis, index) => <text key={axis.label} x={Number(point(index, 1.15).split(',')[0])} y={Number(point(index, 1.15).split(',')[1])}>{axis.label}</text>)}
    {profiles.map((profile, profileIndex) => <polygon key={profile.id} points={axes.map((axis, index) => point(index, axis.value(profile) / maxima[index])).join(' ')} className={`radar-series radar-series-${profileIndex}`}><title>{profile.unitName}</title></polygon>)}
  </svg>;
}

function DistributionBars({ profile }: { profile: UnitStatisticalProfile }): React.JSX.Element {
  const mass = profile.offense.total.mass;
  const peak = Math.max(...mass.map(([, probability]) => probability), 1);
  return <div className="statistics-distribution" aria-label={`Distribution de dégâts de ${profile.unitName}`}>
    {mass.map(([value, probability]) => <div key={value} style={{ height: `${Math.max(2, probability / peak * 100)}%` }} title={`${value} dégâts : ${(probability * 100).toFixed(1)} %`}><span>{value}</span></div>)}
  </div>;
}

function StatisticsDetail({ detail, locale, display, benchmark, onClose, onAddConfiguration }: { detail: UnitStatisticalProfile; locale: 'fr' | 'en'; display: CatalogLocalization; benchmark: 'faction' | 'role' | 'playgroup'; onClose: () => void; onAddConfiguration?: (unitId: string, configuration: UnitConfiguration) => void }): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKeyDown); return () => window.removeEventListener('keydown', onKeyDown); }, [onClose]);
  const profileBenchmark = detail.benchmarks.find((entry) => entry.cohort === benchmark && entry.metric === 'damageEfficiency');
  return <div className="statistics-detail-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="statistics-detail" aria-modal="true" role="dialog" aria-labelledby="statistics-detail-title"><header><div><span className="eyebrow">FICHE STATISTIQUE</span><h2 id="statistics-detail-title">{detail.unitName}</h2><p>{display.factionName(detail.faction)} · {detail.configuration.label}</p></div><button ref={closeRef} onClick={onClose} aria-label="Fermer">×</button></header>
    <section className="statistics-detail-kpis"><div><span>Dégâts utiles</span><strong>{profileDamage(detail, locale)}</strong></div><div><span>P10–P90</span><strong>{detail.offense.usefulDamage.p10}–{detail.offense.usefulDamage.p90}</strong></div><div><span>Destruction</span><strong>{percentage(detail.offense.destroyProbability, locale)}</strong></div><div><span>Survie</span><strong>{percentage(detail.defense.survivalProbability, locale)}</strong></div></section>
    <DistributionBars profile={detail} /><h3>Caractéristiques par profil</h3><dl className="statistics-detail-list">{detail.characteristics.profiles.map((profile) => <div key={profile.compositionId}><dt>{profile.count}× {profile.label}</dt><dd>M{profile.movement} · E{profile.toughness} · Sv{profile.save}+ · {profile.wounds} PV · OC{profile.objectiveControl}</dd></div>)}</dl>
    <h3>Offense, risque et efficience</h3><dl className="statistics-detail-list"><div><dt>PV / OC totaux</dt><dd>{detail.characteristics.totalWounds} / {detail.characteristics.totalObjectiveControl}</dd></div><div><dt>Battle-shock réussi</dt><dd>{percentage(detail.characteristics.battleShockPassProbability, locale)}</dd></div><div><dt>Dégâts / 100 pts</dt><dd>{number(detail.efficiency.damagePerHundred, locale)}</dd></div><div><dt>PV effectifs / 100 pts</dt><dd>{number(detail.efficiency.effectiveWoundsPerHundred, locale)}</dd></div><div><dt>Risque de zéro dégât</dt><dd>{percentage(detail.reliability.zeroDamageProbability, locale)}</dd></div><div><dt>One Shot séparé</dt><dd>{number(detail.offense.oneShotDamage.mean, locale)} dégâts moyens</dd></div><div><dt>Hazardous</dt><dd>{number(detail.offense.hazardousFailures.mean, locale)} échec(s) · {number(detail.offense.hazardousSelfDamage.mean, locale)} dégâts propres</dd></div><div><dt>Percentile {benchmark}</dt><dd>{profileBenchmark ? `${number(profileBenchmark.percentile, locale, 0)}e · n=${profileBenchmark.sampleSize} · ${profileBenchmark.cohortId}` : '—'}</dd></div></dl>
    <h3>Rôles calculés</h3><div className="statistics-role-list">{detail.roles.map((role) => <span key={role.role} title={`${role.rationale} · ${role.criteriaVersion}`}>{ROLE_LABELS[role.role]} · {number(role.score * 100, locale, 0)} % · confiance {role.confidence}</span>)}</div>
    {detail.unsupportedEffects.length > 0 && <details className="statistics-unsupported"><summary>{detail.unsupportedEffects.length} effet(s) non modélisé(s)</summary><ul>{detail.unsupportedEffects.map((effect) => <li key={effect}>{effect}</li>)}</ul></details>}
    <div className="statistics-detail-actions"><a className="button-link" href="#statistics/guide/quick-read">Comment lire cette fiche ?</a>{onAddConfiguration && !detail.configuration.aggregate && <button onClick={() => onAddConfiguration(detail.unitId, detail.configuration)}>Ajouter cette configuration à la liste</button>}</div>
  </aside></div>;
}

export function StatisticsPage({ database, display, locale, onAddConfiguration }: StatisticsPageProps): React.JSX.Element {
  const [routeHash, setRouteHash] = useState(window.location.hash);
  const guide = routeHash.startsWith('#statistics/guide');
  const initialParams = useMemo(() => new URLSearchParams(window.location.hash.split('?')[1] ?? ''), []);
  const [granularity, setGranularity] = useState<'units' | 'configurations'>((initialParams.get('view') as 'units' | 'configurations') || 'units');
  const [targetId, setTargetId] = useState(initialParams.get('target') || DEFAULT_STATISTICS_CONTEXT.target.id);
  const [threatId, setThreatId] = useState(initialParams.get('threat') || DEFAULT_STATISTICS_CONTEXT.threat.id);
  const [benchmark, setBenchmark] = useState<'faction' | 'role' | 'playgroup'>((initialParams.get('benchmark') as 'faction' | 'role' | 'playgroup') || 'playgroup');
  const [customTarget, setCustomTarget] = useState<StatisticsTarget>({ id: 'custom', label: 'Cible libre', toughness: 8, save: 3, woundsPerModel: 10, models: 1, keywords: ['vehicle'] });
  const [customThreat, setCustomThreat] = useState<DefensiveThreat>({ id: 'custom', label: 'Menace libre', attacks: '6', skill: '3+', strength: '8', ap: '-2', damage: '3' });
  const [profiles, setProfiles] = useState<UnitStatisticalProfile[]>([]);
  const [progress, setProgress] = useState({ completed: 0, total: database.units.length, profiles: 0 });
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialParams.get('search') || '');
  const [factions, setFactions] = useState<string[]>(initialParams.getAll('faction'));
  const [roles, setRoles] = useState<TacticalRole[]>(initialParams.getAll('role') as TacticalRole[]);
  const [minimumPoints, setMinimumPoints] = useState(initialParams.get('minPoints') ?? '');
  const [maximumPoints, setMaximumPoints] = useState(initialParams.get('maxPoints') ?? '');
  const [minimumDamage, setMinimumDamage] = useState(initialParams.get('minDamage') ?? '');
  const [minimumToughness, setMinimumToughness] = useState(initialParams.get('minT') ?? '');
  const [minimumWounds, setMinimumWounds] = useState(initialParams.get('minW') ?? '');
  const [minimumObjectiveControl, setMinimumObjectiveControl] = useState(initialParams.get('minOC') ?? '');
  const [minimumDestroyProbability, setMinimumDestroyProbability] = useState(initialParams.get('minDestroy') ?? '');
  const [maximumVariation, setMaximumVariation] = useState(initialParams.get('maxCv') ?? '');
  const [keyword, setKeyword] = useState(initialParams.get('keyword') ?? '');
  const [source, setSource] = useState(initialParams.get('source') ?? '');
  const [coverage, setCoverage] = useState(initialParams.get('coverage') ?? '');
  const [sortKey, setSortKey] = useState<StatisticsSortKey>((initialParams.get('sort') as StatisticsSortKey) || 'damageEfficiency');
  const [sortDirection, setSortDirection] = useState<SortDirection>((initialParams.get('direction') as SortDirection) || 'desc');
  const [secondarySortKey, setSecondarySortKey] = useState<StatisticsSortKey | ''>((initialParams.get('sort2') as StatisticsSortKey) || '');
  const [secondarySortDirection, setSecondarySortDirection] = useState<SortDirection>((initialParams.get('direction2') as SortDirection) || 'desc');
  const [tertiarySortKey, setTertiarySortKey] = useState<StatisticsSortKey | ''>((initialParams.get('sort3') as StatisticsSortKey) || '');
  const [tertiarySortDirection, setTertiarySortDirection] = useState<SortDirection>((initialParams.get('direction3') as SortDirection) || 'desc');
  const [selected, setSelected] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [playgroup, setPlaygroup] = useState<string[]>(() => initialPlaygroup(database));
  const [scrollTop, setScrollTop] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<StatisticsColumnId[]>(initialColumns);
  const workerRef = useRef<Worker | null>(null);
  const rawProfilesRef = useRef<UnitStatisticalProfile[]>([]);
  const allFactions = useMemo(() => [...new Set(database.units.map((unit) => unit.factionName))].sort(), [database]);
  const rosterFactions = useMemo(() => [...database.factions].sort((left, right) => left.name.localeCompare(right.name)), [database]);
  const sources = useMemo(() => [...new Set(database.units.map((unit) => unit.sourceKey))].sort(), [database]);
  const context: UnitAnalysisContext = useMemo(() => ({
    target: targetId === 'custom' ? customTarget : STATISTICS_TARGETS.find((target) => target.id === targetId) ?? STATISTICS_TARGETS[1],
    threat: threatId === 'custom' ? customThreat : DEFENSIVE_THREATS.find((threat) => threat.id === threatId) ?? DEFENSIVE_THREATS[2],
    baseline: 'neutral'
  }), [targetId, customTarget, threatId, customThreat]);

  useEffect(() => {
    const onHashChange = (): void => setRouteHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    workerRef.current?.terminate();
    rawProfilesRef.current = []; setProfiles([]); setSelected([]); setDetailId(null); setError(null); setProgress({ completed: 0, total: database.units.length, profiles: 0 });
    let active = true;
    const cacheKey = `${database.fingerprint}:${STATISTICS_ENGINE_VERSION}:${granularity}:${JSON.stringify(context)}`;
    const run = async (): Promise<void> => {
      try {
        const cached = await getCachedStatisticsProfiles(cacheKey);
        if (!active) return;
        if (cached) { rawProfilesRef.current = cached.map((profile) => ({ ...profile, benchmarks: [] })); setProfiles(attachBenchmarks(rawProfilesRef.current, new Set(playgroup), database)); setProgress({ completed: database.units.length, total: database.units.length, profiles: cached.length }); return; }
      } catch { /* A disabled IndexedDB cache must not block analysis. */ }
      const worker = new Worker(new URL('../statistics.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ type: string; completed?: number; total?: number; profiles?: UnitStatisticalProfile[] | number; error?: string }>) => {
        if (!active) return;
        if (event.data.type === 'batch' && Array.isArray(event.data.profiles)) {
          setProfiles((current) => [...current, ...event.data.profiles as UnitStatisticalProfile[]]);
          setProgress((current) => ({ completed: event.data.completed ?? current.completed, total: event.data.total ?? database.units.length, profiles: current.profiles + (event.data.profiles as UnitStatisticalProfile[]).length }));
        }
        if (event.data.type === 'complete' && Array.isArray(event.data.profiles)) {
          rawProfilesRef.current = event.data.profiles.map((profile) => ({ ...profile, benchmarks: [] }));
          setProfiles(event.data.profiles); setProgress({ completed: database.units.length, total: database.units.length, profiles: event.data.profiles.length });
          void cacheStatisticsProfiles(cacheKey, event.data.profiles).catch(() => undefined);
        }
        if (event.data.type === 'error') setError(event.data.error ?? 'Calcul impossible.');
      };
      worker.postMessage({ database, context, granularity, playgroupFactions: playgroup });
    };
    void run();
    return () => { active = false; workerRef.current?.terminate(); };
  }, [database, context, granularity]);

  useEffect(() => {
    if (rawProfilesRef.current.length > 0) setProfiles(attachBenchmarks(rawProfilesRef.current, new Set(playgroup), database));
  }, [database, playgroup]);

  useEffect(() => {
    localStorage.setItem('warforge.statistics.playgroup.v2', JSON.stringify(playgroup));
  }, [playgroup]);

  useEffect(() => { localStorage.setItem('warforge.statistics.columns.v1', JSON.stringify(visibleColumns)); }, [visibleColumns]);

  useEffect(() => {
    if (guide) return;
    const params = new URLSearchParams();
    params.set('view', granularity); params.set('target', targetId); params.set('threat', threatId); params.set('benchmark', benchmark); params.set('sort', sortKey); params.set('direction', sortDirection);
    if (secondarySortKey) { params.set('sort2', secondarySortKey); params.set('direction2', secondarySortDirection); }
    if (tertiarySortKey) { params.set('sort3', tertiarySortKey); params.set('direction3', tertiarySortDirection); }
    if (search) params.set('search', search); factions.forEach((faction) => params.append('faction', faction)); roles.forEach((role) => params.append('role', role));
    if (minimumPoints) params.set('minPoints', minimumPoints); if (maximumPoints) params.set('maxPoints', maximumPoints); if (minimumDamage) params.set('minDamage', minimumDamage); if (minimumToughness) params.set('minT', minimumToughness); if (minimumWounds) params.set('minW', minimumWounds); if (minimumObjectiveControl) params.set('minOC', minimumObjectiveControl); if (minimumDestroyProbability) params.set('minDestroy', minimumDestroyProbability); if (maximumVariation) params.set('maxCv', maximumVariation); if (keyword) params.set('keyword', keyword); if (source) params.set('source', source); if (coverage) params.set('coverage', coverage);
    window.history.replaceState(null, '', `#statistics?${params.toString()}`);
  }, [guide, granularity, targetId, threatId, benchmark, sortKey, sortDirection, secondarySortKey, secondarySortDirection, tertiarySortKey, tertiarySortDirection, search, factions, roles, minimumPoints, maximumPoints, minimumDamage, minimumToughness, minimumWounds, minimumObjectiveControl, minimumDestroyProbability, maximumVariation, keyword, source, coverage]);

  const filtered = useMemo(() => profiles.filter((profile) => {
    if (search && !`${profile.unitName} ${profile.faction} ${profile.roles.map((role) => role.role).join(' ')}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (factions.length > 0 && !factions.includes(profile.faction)) return false;
    if (roles.length > 0 && !roles.some((role) => profile.roles.some((candidate) => candidate.role === role))) return false;
    if (minimumPoints && profile.configuration.points < Number(minimumPoints)) return false;
    if (maximumPoints && profile.configuration.points > Number(maximumPoints)) return false;
    if (minimumDamage && profile.offense.usefulDamage.mean < Number(minimumDamage)) return false;
    if (minimumToughness && profile.characteristics.toughness < Number(minimumToughness)) return false;
    if (minimumWounds && profile.characteristics.totalWounds < Number(minimumWounds)) return false;
    if (minimumObjectiveControl && profile.characteristics.totalObjectiveControl < Number(minimumObjectiveControl)) return false;
    if (minimumDestroyProbability && profile.offense.destroyProbability < Number(minimumDestroyProbability) / 100) return false;
    if (maximumVariation && (profile.reliability.coefficientOfVariation ?? Number.POSITIVE_INFINITY) > Number(maximumVariation)) return false;
    if (keyword && ![...profile.keywords, ...profile.structuredAbilities].some((value) => comparable(value).includes(comparable(keyword)))) return false;
    if (source && profile.sourceKey !== source) return false;
    if (coverage && profile.coverage !== coverage) return false;
    return true;
  }).sort((left, right) => {
    for (const [key, direction] of [[sortKey, sortDirection], [secondarySortKey, secondarySortDirection], [tertiarySortKey, tertiarySortDirection]] as const) {
      if (!key) continue;
      const a = metric(left, key); const b = metric(right, key);
      const missingA = typeof a === 'number' && !Number.isFinite(a); const missingB = typeof b === 'number' && !Number.isFinite(b);
      if (missingA !== missingB) return missingA ? 1 : -1;
      const comparison = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b);
      if (comparison !== 0) return direction === 'asc' ? comparison : -comparison;
    }
    return left.unitName.localeCompare(right.unitName) || left.id.localeCompare(right.id);
  }), [profiles, search, factions, roles, minimumPoints, maximumPoints, minimumDamage, minimumToughness, minimumWounds, minimumObjectiveControl, minimumDestroyProbability, maximumVariation, keyword, source, coverage, sortKey, sortDirection, secondarySortKey, secondarySortDirection, tertiarySortKey, tertiarySortDirection]);

  const selectedProfiles = selected.map((id) => profiles.find((profile) => profile.id === id)).filter((profile): profile is UnitStatisticalProfile => Boolean(profile));
  const detail = profiles.find((profile) => profile.id === detailId) ?? null;
  const rowHeight = 54; const viewportRows = 14; const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 3); const visible = filtered.slice(start, start + viewportRows + 6);
  const gridTemplateColumns = `32px minmax(180px,1.5fr) ${STATISTICS_COLUMNS.filter((column) => visibleColumns.includes(column.id)).map((column) => column.width).join(' ')}`;

  if (guide) return <StatisticsGuide onBack={() => { window.location.hash = 'statistics'; }} />;

  const reset = () => { setSearch(''); setFactions([]); setRoles([]); setMinimumPoints(''); setMaximumPoints(''); setMinimumDamage(''); setMinimumToughness(''); setMinimumWounds(''); setMinimumObjectiveControl(''); setMinimumDestroyProbability(''); setMaximumVariation(''); setKeyword(''); setSource(''); setCoverage(''); };
  const exportCsv = () => download('warforge-statistiques.csv', ['Unité;Faction;Configuration;Points;Dégâts utiles;P10;P90;Destruction;PV effectifs/100;OC/100', ...filtered.map((profile) => [profile.unitName, profile.faction, profile.configuration.label, profile.configuration.points, profile.offense.usefulDamage.mean, profile.offense.usefulDamage.p10, profile.offense.usefulDamage.p90, profile.offense.destroyProbability, profile.efficiency.effectiveWoundsPerHundred, profile.efficiency.objectiveControlPerHundred].join(';'))].join('\n'), 'text/csv;charset=utf-8');

  return <main className="statistics-page">
    <header className="statistics-hero"><div><span className="eyebrow">ANALYSE THÉORIQUE · {database.dataInfo?.Version}</span><h1>Statistiques des unités</h1><p>Distributions exactes, efficience et contexte comparatif. Aucun résultat de tournoi.</p></div><div className="statistics-hero-actions"><a className="button-link" href="#statistics/guide">Guide des statistiques</a><button onClick={exportCsv} disabled={filtered.length === 0}>Exporter CSV</button><button onClick={() => download('warforge-statistiques.json', JSON.stringify({ engineVersion: profiles[0]?.engineVersion, catalogFingerprint: database.fingerprint, context, profiles: filtered }, null, 2), 'application/json')}>Exporter JSON</button></div></header>

    <section className="statistics-context" aria-label="Contexte de calcul">
      <label>Granularité<select value={granularity} onChange={(event) => setGranularity(event.target.value as typeof granularity)}><option value="units">Unités · médiane et min–max</option><option value="configurations">Toutes les configurations légales</option></select></label>
      <label>Cible<select value={targetId} onChange={(event) => setTargetId(event.target.value)}>{STATISTICS_TARGETS.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}<option value="custom">Cible libre</option></select></label>
      <label>Menace défensive<select value={threatId} onChange={(event) => setThreatId(event.target.value)}>{DEFENSIVE_THREATS.map((threat) => <option key={threat.id} value={threat.id}>{threat.label}</option>)}<option value="custom">Menace libre</option></select></label>
      <label>Benchmark<select value={benchmark} onChange={(event) => setBenchmark(event.target.value as typeof benchmark)}><option value="faction">Faction</option><option value="role">Rôle tactique</option><option value="playgroup">Groupe d’amis</option></select></label>
      {targetId === 'custom' && <div className="statistics-custom-target"><label>E<input type="number" min="1" value={customTarget.toughness} onChange={(event) => setCustomTarget((current) => ({ ...current, toughness: Number(event.target.value) }))} /></label><label>Sv<input type="number" min="2" max="7" value={customTarget.save} onChange={(event) => setCustomTarget((current) => ({ ...current, save: Number(event.target.value) }))} /></label><label>Inv.<input type="number" min="2" max="7" value={customTarget.invulnerableSave ?? 7} onChange={(event) => setCustomTarget((current) => ({ ...current, invulnerableSave: Number(event.target.value) >= 7 ? undefined : Number(event.target.value) }))} /></label><label>PV/fig.<input type="number" min="1" value={customTarget.woundsPerModel} onChange={(event) => setCustomTarget((current) => ({ ...current, woundsPerModel: Number(event.target.value) }))} /></label><label>Fig.<input type="number" min="1" value={customTarget.models} onChange={(event) => setCustomTarget((current) => ({ ...current, models: Number(event.target.value) }))} /></label><label>Type<select value={customTarget.keywords[0] ?? 'infantry'} onChange={(event) => setCustomTarget((current) => ({ ...current, keywords: [event.target.value as StatisticsTarget['keywords'][number]] }))}><option value="infantry">Infantry</option><option value="monster">Monster</option><option value="vehicle">Vehicle</option></select></label></div>}
      {threatId === 'custom' && <div className="statistics-custom-target"><label>Attaques<input value={customThreat.attacks} onChange={(event) => setCustomThreat((current) => ({ ...current, attacks: event.target.value }))} /></label><label>CT/CC<input value={customThreat.skill} onChange={(event) => setCustomThreat((current) => ({ ...current, skill: event.target.value }))} /></label><label>F<input value={customThreat.strength} onChange={(event) => setCustomThreat((current) => ({ ...current, strength: event.target.value }))} /></label><label>PA<input value={customThreat.ap} onChange={(event) => setCustomThreat((current) => ({ ...current, ap: event.target.value }))} /></label><label>D<input value={customThreat.damage} onChange={(event) => setCustomThreat((current) => ({ ...current, damage: event.target.value }))} /></label></div>}
      <p className="statistics-assumptions">Visible et à portée · hors demi-portée · sans couvert, buff, détachement ni stratagème. <MetricHelp metric="pmf" /></p>
    </section>

    {progress.completed < progress.total && <div className="statistics-progress" role="status"><span style={{ width: `${(progress.completed / Math.max(1, progress.total)) * 100}%` }} />Calcul : {progress.completed}/{progress.total} unités · {progress.profiles} profils <button onClick={() => workerRef.current?.terminate()}>Annuler</button></div>}
    {error && <p className="statistics-error" role="alert">{error}</p>}

    <section className="statistics-kpis">
      <article><span>Profils visibles</span><strong>{filtered.length}</strong></article><article><span>Coût médian</span><strong>{number(median(filtered.map((profile) => profile.configuration.points)), locale, 0)} pts</strong></article><article><span>Dégâts médians <MetricHelp metric="median" /></span><strong>{number(median(filtered.map((profile) => profile.offense.usefulDamage.mean)), locale)}</strong></article><article><span>PV effectifs/100 <MetricHelp metric="effective-wounds" /></span><strong>{number(median(filtered.map((profile) => profile.efficiency.effectiveWoundsPerHundred)), locale)}</strong></article><article><span>Couverture complète</span><strong>{filtered.length ? number(filtered.filter((profile) => profile.coverage === 'complete').length / filtered.length * 100, locale, 0) : 0} %</strong></article>
    </section>

    <section className="statistics-visuals"><article><header><h2>Distribution des dégâts moyens</h2><MetricHelp metric="mean" /></header><Histogram values={filtered.map((profile) => profile.offense.usefulDamage.mean)} /></article><article><header><h2>Rendement offensif / défensif</h2><MetricHelp metric="efficiency" /></header><ScatterPlot profiles={filtered} /></article><article><header><h2>Dispersion par faction</h2><MetricHelp metric="quantiles" /></header><FactionBoxPlots profiles={filtered} /></article></section>

    <section className="statistics-explorer">
      <aside className="statistics-filters"><h2>Filtres</h2>
        <label>Rechercher<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Unité, faction, rôle…" /></label>
        <label>Source<select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Toutes</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Mot-clé ou aptitude<input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Vehicle, Deep Strike…" /></label>
        <details><summary>Factions {factions.length ? `(${factions.length})` : ''}</summary>{allFactions.map((faction) => <label className="statistics-check" key={faction}><input type="checkbox" checked={factions.includes(faction)} onChange={() => setFactions((current) => current.includes(faction) ? current.filter((value) => value !== faction) : [...current, faction])} />{display.factionName(faction)}</label>)}</details>
        <details><summary>Rôles {roles.length ? `(${roles.length})` : ''}</summary>{Object.entries(ROLE_LABELS).map(([role, label]) => <label className="statistics-check" key={role}><input type="checkbox" checked={roles.includes(role as TacticalRole)} onChange={() => setRoles((current) => current.includes(role as TacticalRole) ? current.filter((value) => value !== role) : [...current, role as TacticalRole])} />{label}</label>)}</details>
        <div className="statistics-range"><label>Points min.<input type="number" value={minimumPoints} onChange={(event) => setMinimumPoints(event.target.value)} /></label><label>Points max.<input type="number" value={maximumPoints} onChange={(event) => setMaximumPoints(event.target.value)} /></label></div>
        <div className="statistics-range"><label>E min.<input type="number" value={minimumToughness} onChange={(event) => setMinimumToughness(event.target.value)} /></label><label>PV min.<input type="number" value={minimumWounds} onChange={(event) => setMinimumWounds(event.target.value)} /></label></div>
        <label>OC total min.<input type="number" value={minimumObjectiveControl} onChange={(event) => setMinimumObjectiveControl(event.target.value)} /></label>
        <label>Dégâts moyens min.<input type="number" step="0.5" value={minimumDamage} onChange={(event) => setMinimumDamage(event.target.value)} /></label>
        <label>Destruction min. (%)<input type="number" min="0" max="100" value={minimumDestroyProbability} onChange={(event) => setMinimumDestroyProbability(event.target.value)} /></label>
        <label>CV maximum<input type="number" min="0" step="0.1" value={maximumVariation} onChange={(event) => setMaximumVariation(event.target.value)} /></label>
        <label>Couverture<select value={coverage} onChange={(event) => setCoverage(event.target.value)}><option value="">Toutes</option><option value="complete">Complète</option><option value="partial">Partielle</option></select></label>
        <button onClick={reset}>Réinitialiser</button>
        <details><summary>Cohorte du groupe ({playgroup.length})</summary>{rosterFactions.map((faction) => <label className="statistics-check" key={faction.id}><input type="checkbox" checked={playgroup.includes(faction.id)} onChange={() => setPlaygroup((current) => current.includes(faction.id) ? current.filter((value) => value !== faction.id) : [...current, faction.id])} />{display.factionName(faction.name)}</label>)}</details>
      </aside>
      <div className="statistics-table-panel"><div className="statistics-table-controls">
        <label>Tri 1<select value={sortKey} onChange={(event) => setSortKey(event.target.value as StatisticsSortKey)}>{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}>{sortDirection === 'asc' ? '↑' : '↓'}</button>
        <label>Tri 2<select value={secondarySortKey} onChange={(event) => setSecondarySortKey(event.target.value as StatisticsSortKey | '')}><option value="">Aucun</option>{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button disabled={!secondarySortKey} onClick={() => setSecondarySortDirection((current) => current === 'asc' ? 'desc' : 'asc')}>{secondarySortDirection === 'asc' ? '↑' : '↓'}</button>
        <label>Tri 3<select value={tertiarySortKey} onChange={(event) => setTertiarySortKey(event.target.value as StatisticsSortKey | '')}><option value="">Aucun</option>{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button disabled={!tertiarySortKey} onClick={() => setTertiarySortDirection((current) => current === 'asc' ? 'desc' : 'asc')}>{tertiarySortDirection === 'asc' ? '↑' : '↓'}</button>
        <details className="statistics-columns"><summary>Colonnes ({visibleColumns.length})</summary>{STATISTICS_COLUMNS.map((column) => <label key={column.id}><input type="checkbox" checked={visibleColumns.includes(column.id)} onChange={() => setVisibleColumns((current) => current.includes(column.id) ? current.filter((id) => id !== column.id) : [...current, column.id])} />{column.label}</label>)}<button onClick={() => setVisibleColumns(STATISTICS_COLUMNS.map((column) => column.id))}>Restaurer</button></details>
        <span>{filtered.length} résultat(s)</span>
      </div>
        <div className="statistics-data-grid-header" style={{ gridTemplateColumns }}><span></span><span>Unité</span>{visibleColumns.includes('points') && <span>Pts</span>}{visibleColumns.includes('stats') && <span>M/E/Sv</span>}{visibleColumns.includes('wounds') && <span>PV/OC</span>}{visibleColumns.includes('damage') && <span>Dégâts <MetricHelp metric="mean" /></span>}{visibleColumns.includes('quantiles') && <span>P10–P90 <MetricHelp metric="quantiles" /></span>}{visibleColumns.includes('destroy') && <span>Destruction <MetricHelp metric="destroy" /></span>}{visibleColumns.includes('durability') && <span>PV eff./100</span>}{visibleColumns.includes('oc') && <span>OC/100</span>}{visibleColumns.includes('projection') && <span>Projection</span>}{visibleColumns.includes('benchmark') && <span>Percentile <MetricHelp metric="percentile" /></span>}</div>
        <div className="statistics-data-grid" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}><div style={{ height: filtered.length * rowHeight, position: 'relative' }}>{visible.map((profile, index) => {
          const profileBenchmark = profile.benchmarks.find((entry) => entry.cohort === benchmark && entry.metric === 'damageEfficiency');
          return <div className="statistics-data-row" key={profile.id} style={{ top: (start + index) * rowHeight, gridTemplateColumns }}>
            <span><input type="checkbox" aria-label={`Comparer ${profile.unitName}`} checked={selected.includes(profile.id)} disabled={!selected.includes(profile.id) && selected.length >= 5} onChange={() => setSelected((current) => current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id])} /></span>
            <button className="statistics-unit-link" onClick={() => setDetailId(profile.id)}><strong>{profile.unitName}</strong><small>{display.factionName(profile.faction)}</small></button>
            {visibleColumns.includes('points') && <span>{profilePoints(profile, locale)}</span>}{visibleColumns.includes('stats') && <span>{profile.characteristics.movement}/{profile.characteristics.toughness}/{profile.characteristics.save}+</span>}{visibleColumns.includes('wounds') && <span>{profile.characteristics.totalWounds}/{profile.characteristics.totalObjectiveControl}</span>}{visibleColumns.includes('damage') && <span><strong>{profileDamage(profile, locale)}</strong></span>}
            {visibleColumns.includes('quantiles') && <span>{number(profile.offense.usefulDamage.p10, locale, 0)}–{number(profile.offense.usefulDamage.p90, locale, 0)}</span>}{visibleColumns.includes('destroy') && <span>{percentage(profile.offense.destroyProbability, locale)}</span>}{visibleColumns.includes('durability') && <span>{number(profile.efficiency.effectiveWoundsPerHundred, locale)}</span>}{visibleColumns.includes('oc') && <span>{number(profile.efficiency.objectiveControlPerHundred, locale)}</span>}{visibleColumns.includes('projection') && <span>{number(profile.mobility.threatRange, locale, 0)}″</span>}
            {visibleColumns.includes('benchmark') && <span className={`coverage-${profile.coverage}`}>{profileBenchmark ? `P${number(profileBenchmark.percentile, locale, 0)} · n=${profileBenchmark.sampleSize}` : '—'}<small>{profile.coverage === 'complete' ? ' · complet' : ' · partiel'}</small></span>}
          </div>;
        })}</div></div>
      </div>
    </section>

    {selectedProfiles.length >= 2 && <section className="statistics-comparison"><header><h2>Comparaison ({selectedProfiles.length}/5)</h2><button onClick={() => setSelected([])}>Fermer</button></header><RadarComparison profiles={selectedProfiles} /><div>{selectedProfiles.map((profile, index) => {
      const baseline = selectedProfiles[0]; const delta = profile.offense.usefulDamage.mean - baseline.offense.usefulDamage.mean; const relative = baseline.offense.usefulDamage.mean > 0 ? delta / baseline.offense.usefulDamage.mean : null;
      return <article key={profile.id}><h3>{profile.unitName}</h3><p>{profile.configuration.label}</p><dl><div><dt>Points</dt><dd>{profilePoints(profile, locale)}</dd></div><div><dt>Dégâts utiles</dt><dd>{profileDamage(profile, locale)}</dd></div>{index > 0 && <div><dt>Écart au profil 1</dt><dd>{delta >= 0 ? '+' : ''}{number(delta, locale)} · {relative === null ? '—' : `${relative >= 0 ? '+' : ''}${percentage(relative, locale)}`}</dd></div>}<div><dt>P10–P90</dt><dd>{profile.offense.usefulDamage.p10}–{profile.offense.usefulDamage.p90}</dd></div><div><dt>Destruction</dt><dd>{percentage(profile.offense.destroyProbability, locale)}</dd></div><div><dt>PV eff./100</dt><dd>{number(profile.efficiency.effectiveWoundsPerHundred, locale)}</dd></div></dl><DistributionBars profile={profile} /></article>;
    })}</div></section>}

    {detail && <StatisticsDetail detail={detail} locale={locale} display={display} benchmark={benchmark} onClose={() => setDetailId(null)} onAddConfiguration={onAddConfiguration} />}
  </main>;
}
