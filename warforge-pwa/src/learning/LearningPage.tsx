import { useEffect, useMemo, useState } from 'react';
import { sanitizeStratagemCategoryForQuiz, sanitizeStratagemTextForQuiz, generateStatOptions, getExpectedStatValue, shuffleArray, unitHasKeyword, isForbiddenKeyword, getUnitAbilityTitles, getAbilityDescription } from "./learning-utils";
import { StatsQuiz } from "./components/StatsQuiz";
import { KeywordsQuiz } from "./components/KeywordsQuiz";
import { StratagemsQuiz } from "./components/StratagemsQuiz";
import { WeaponsQuiz } from "./components/WeaponsQuiz";
import { CompareQuiz } from "./components/CompareQuiz";
import "./learning.css";
import { useTranslation } from 'react-i18next';
import { BrandMark } from '../components/BrandMark';
import { formatSaveDisplay, isUnitAvailableToFaction, parseInvulSave } from '../domain/catalog';
import { getDetachmentCost } from '../domain/calculations';
import { getInventoryAvailability, getProxySourceUnits } from '../domain/inventory';
import { unitImageUrl } from '../domain/unit-images';
import type { CatalogLocalization } from '../domain/catalog-localization';
import type { InventoryAllocation, InventoryDataset } from '../domain/inventory';
import type { NormalizedDatabase, NormalizedUnit, RosterDraft } from '../domain/types';
import type { UnitImageEntry } from '../domain/unit-images';

type ScopeFilter = 'all' | 'stock' | 'favorites' | 'roster';
type QuizType = 'all' | 'stats' | 'keywords' | 'stratagems' | 'weapons' | 'compare';

const DATA_BASE_URL = `${import.meta.env.BASE_URL}data/`;

const STAT_KEYS = [
  { key: 'Movement', label: 'M', nameFr: 'Mouvement', nameEn: 'Movement' },
  { key: 'Toughness', label: 'E', nameFr: 'Endurance', nameEn: 'Toughness' },
  { key: 'Save', label: 'Svg', nameFr: 'Sauvegarde', nameEn: 'Save' },
  { key: 'Wounds', label: 'PV', nameFr: 'Points de vie', nameEn: 'Wounds' },
  { key: 'Leadership', label: 'Cd', nameFr: 'Commandement', nameEn: 'Leadership' },
  { key: 'OC', label: 'OC', nameFr: 'Contrôle d’objectif', nameEn: 'Objective Control' }
] as const;

const SCENARIO_OPTIONS = [
  { id: 'TAKE AND HOLD', fr: 'Prise de position', en: 'Take and Hold' },
  { id: 'PRIORITY ASSETS', fr: 'Objectifs prioritaires', en: 'Priority Assets' },
  { id: 'DISRUPTION', fr: 'Perturbation', en: 'Disruption' },
  { id: 'RECONNAISSANCE', fr: 'Reconnaissance', en: 'Reconnaissance' },
  { id: 'PURGE THE FOE', fr: 'Purger l’ennemi', en: 'Purge the Foe' },
  { id: 'ALL', fr: 'Aucune restriction / Tous les scénarios', en: 'No restriction / All scenarios' }
] as const;

export function LearningPage({
  database,
  display,
  locale,
  inventory,
  inventoryAllocation,
  activeDraft,
  favorites,
  unitImages,
  onOpenBuilder,
  onOpenRules,
  onOpenWeapons
}: {
  database: NormalizedDatabase;
  display: CatalogLocalization;
  locale: 'fr' | 'en';
  inventory: InventoryDataset | null;
  inventoryAllocation: InventoryAllocation | null;
  activeDraft: RosterDraft | null;
  favorites: string[];
  unitImages: ReadonlyMap<string, UnitImageEntry>;
  onOpenBuilder: () => void;
  onOpenRules: () => void;
  onOpenWeapons: () => void;
}): React.JSX.Element {



  const { t } = useTranslation();

  const getUnitImgUrl = (unitId: string): string | null => {
    const entry = unitImages.get(unitId);
    if (!entry) return null;
    return unitImageUrl(entry, DATA_BASE_URL);
  };

  const [selectedFactionIds, setSelectedFactionIds] = useState<Set<string>>(new Set());
  const [hasInitializedFactions, setHasInitializedFactions] = useState(false);
  const [scope, setScope] = useState<ScopeFilter>('stock');
  const [quizType, setQuizType] = useState<QuizType>('all');
  const [allQuizSubtype, setAllQuizSubtype] = useState<'stats' | 'keywords' | 'stratagems' | 'weapons' | 'compare'>('stats');


  const [stratScore, setStratScore] = useState<{ correct: number; total: number; streak: number }>({ correct: 0, total: 0, streak: 0 });
  const [stratSeedIndex, setStratSeedIndex] = useState<number>(0);

  const handleSelectPreset = (preset: 'all' | 'favorites' | 'stock' | 'roster') => {
    setScope(preset);
  };

  const handleSelectAllFactions = () => {
    const all = new Set(database.factions.map(f => f.id));
    setSelectedFactionIds(all);
  };

  const handleDeselectAllFactions = () => {
    setSelectedFactionIds(new Set());
  };

  const toggleFaction = (factionId: string) => {
    setSelectedFactionIds(prev => {
      const next = new Set(prev);
      if (next.has(factionId)) next.delete(factionId);
      else next.add(factionId);
      return next;
    });
  };

  const eligibleUnits = useMemo(() => {
    let units = database.units;
    if (scope !== 'all') {
      const favSet = new Set(favorites);
      units = units.filter(u => {
        if (scope === 'favorites') return favSet.has(u.id);
        if (scope === 'roster') return activeDraft?.items.some(i => i.unitId === u.id);
        if (scope === 'stock') {
          if (!inventory || inventory.databaseFingerprint !== database.fingerprint) return false;
          return inventory.entries.some(e => e.unitId === u.id);
        }
        return false;
      });
    }
    return units.filter(u => selectedFactionIds.has(u.factionName));
  }, [database, scope, favorites, activeDraft, inventory, selectedFactionIds]);

  const eligibleDetachments = useMemo(() => {
    const detachmentsWithStrats = database.detachments.filter(d => (d.Stratagems ?? []).length > 0);
    const selectedFactionNames = new Set(database.factions.filter(f => selectedFactionIds.has(f.id)).map(f => f.name));
    const factionFiltered = detachmentsWithStrats.filter(d => selectedFactionNames.has(d.factionName));
    
    if (scope === 'all') return factionFiltered;
    
    const factionNamesFromUnits = new Set(eligibleUnits.map(u => u.factionName));
    return factionFiltered.filter(d => factionNamesFromUnits.has(d.factionName));
  }, [database, selectedFactionIds, scope, eligibleUnits]);

  // Compute available faction sets for quick presets
  const stockFactionIds = useMemo(() => {
    if (!database || !inventory || !inventoryAllocation) return new Set<string>();
    const set = new Set<string>();
    for (const f of database.factions) {
      const hasStockUnit = database.units.some(
        (u) => isUnitAvailableToFaction(database, f.id, u) && (getInventoryAvailability(inventory, inventoryAllocation, u.id)?.total ?? 0) > 0
      );
      if (hasStockUnit) set.add(f.id);
    }
    return set;
  }, [database, inventory, inventoryAllocation]);

  const favoritesFactionIds = useMemo(() => {
    if (!database || favorites.length === 0) return new Set<string>();
    const set = new Set<string>();
    for (const f of database.factions) {
      const hasFavUnit = database.units.some(
        (u) => isUnitAvailableToFaction(database, f.id, u) && favorites.includes(u.id)
      );
      if (hasFavUnit) set.add(f.id);
    }
    return set;
  }, [database, favorites]);

  const rosterFactionIds = useMemo(() => {
    if (!database || !activeDraft || activeDraft.items.length === 0) return new Set<string>();
    const draftUnitIds = new Set(activeDraft.items.map((i) => i.unitId));
    const set = new Set<string>();
    for (const f of database.factions) {
      const hasRosterUnit = database.units.some(
        (u) => isUnitAvailableToFaction(database, f.id, u) && draftUnitIds.has(u.id)
      );
      if (hasRosterUnit) set.add(f.id);
    }
    return set;
  }, [database, activeDraft]);

  const allFactionIds = useMemo(() => {
    if (!database) return new Set<string>();
    return new Set(database.factions.map((f) => f.id));
  }, [database]);

  const DEFAULT_FACTION_NAMES = useMemo(
    () => new Set(['blood angels', 'dark angels', 'ultramarines', 'space marines']),
    []
  );

  // Default to Blood Angels, Dark Angels, Ultramarines, Space Marines on initial load
  useEffect(() => {
    if (!hasInitializedFactions && database.factions.length > 0) {
      const defaultFactionSet = new Set(
        database.factions
          .filter(
            (f) =>
              DEFAULT_FACTION_NAMES.has(f.name.toLowerCase().trim()) ||
              DEFAULT_FACTION_NAMES.has(f.id.toLowerCase().trim())
          )
          .map((f) => f.id)
      );
      const initialIds = defaultFactionSet.size > 0 ? defaultFactionSet : allFactionIds;
      setSelectedFactionIds(new Set(initialIds));
      setHasInitializedFactions(true);
    }
  }, [database, allFactionIds, hasInitializedFactions, DEFAULT_FACTION_NAMES]);

    const [kwScore, setKwScore] = useState<{ correct: number; total: number; streak: number }>({ correct: 0, total: 0, streak: 0 });

  
  const shuffledUnits = useMemo(() => {
    if (eligibleUnits.length === 0) return [];
    return shuffleArray(eligibleUnits);
  }, [eligibleUnits]);

  
  const [statsScore, setStatsScore] = useState<{ correct: number; total: number; streak: number }>({ correct: 0, total: 0, streak: 0 });
  const [weaponsScore, setWeaponsScore] = useState<{ correct: number; total: number; streak: number }>({ correct: 0, total: 0, streak: 0 });
  const [compareScore, setCompareScore] = useState<{ correct: number; total: number; streak: number }>({ correct: 0, total: 0, streak: 0 });

  // Helper to pick next random subtype when advancing in 'all' mode
  const pickNextAllSubtype = () => {
    const options: ('stats' | 'keywords' | 'stratagems')[] = [];
    if (eligibleUnits.length > 0) {
      options.push('stats', 'keywords');
    }
    if (eligibleDetachments.length > 0) {
      options.push('stratagems');
    }
    if (options.length === 0) return;
    const next = options[Math.floor(Math.random() * options.length)];
    setAllQuizSubtype(next);
  };

  const effectiveQuizType: 'stats' | 'keywords' | 'stratagems' | 'weapons' | 'compare' = useMemo(() => {
    if (quizType !== 'all') return quizType;
    if (allQuizSubtype === 'stratagems' && eligibleDetachments.length === 0 && eligibleUnits.length > 0) {
      return 'stats';
    }
    if ((allQuizSubtype === 'stats' || allQuizSubtype === 'keywords') && eligibleUnits.length === 0 && eligibleDetachments.length > 0) {
      return 'stratagems';
    }
    return allQuizSubtype;
  }, [quizType, allQuizSubtype, eligibleDetachments.length, eligibleUnits.length]);


  const handleNextStrat = () => {
    setStratSeedIndex((prev) => prev + 1);
    if (quizType === 'all') {
      pickNextAllSubtype();
    }
  };

  const isFrench = locale === 'fr';

  return (
    <main className="rules-shell app-shell" style={{ maxWidth: '1200px' }}>
      <header className="topbar">
        <div className="brand-lockup">
          <BrandMark />
          <div>
            <span className="eyebrow">WARFORGE 40K · ENTRAÎNEMENT</span>
            <h1>{isFrench ? 'Apprentissage & Flashcards' : 'Learning & Flashcards'}</h1>
            <p>
              {isFrench
                ? 'Révisez les profils d’unités et leurs mots-clés de manière ludique'
                : 'Test and memorize unit stats and keywords'}
            </p>
          </div>
        </div>
        <div className="weapons-topbar-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="secondary action-with-icon" onClick={onOpenBuilder}>
            <span className="button-icon" aria-hidden="true">⌘</span>
            {isFrench ? 'Créateur de liste' : 'Army Builder'}
          </button>
          <button className="secondary action-with-icon" onClick={onOpenRules}>
            <span className="button-icon" aria-hidden="true">§</span>
            {isFrench ? 'Règles' : 'Rules'}
          </button>
          <button className="secondary action-with-icon" onClick={onOpenWeapons}>
            <span className="button-icon" aria-hidden="true">✦</span>
            {isFrench ? 'Arsenal' : 'Armoury'}
          </button>
        </div>
      </header>

      {/* Mode Navigation & Score Header */}
      <section className="command-center learning-command-center">
        <div className="learning-topbar">
          <div className="learning-tabs">
            <button
              className={quizType === 'all' ? '' : 'secondary'}
              onClick={() => setQuizType('all')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem' }}
            >
              🎲 {isFrench ? 'Tous les tests' : 'All Quizzes'}
            </button>
            <button
              className={quizType === 'stats' ? '' : 'secondary'}
              onClick={() => setQuizType('stats')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem' }}
            >
              🎴 {isFrench ? 'Profils & Caractéristiques' : 'Unit Stats Datacard'}
            </button>
            <button
              className={quizType === 'weapons' ? '' : 'secondary'}
              onClick={() => setQuizType('weapons')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem' }}
            >
              ⚔️ {isFrench ? 'Profils d\'Armes' : 'Weapon Profiles'}
            </button>
            <button
              className={quizType === 'compare' ? '' : 'secondary'}
              onClick={() => setQuizType('compare')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem' }}
            >
              ⚖️ {isFrench ? 'Comparer' : 'Compare'}
            </button>
            <button
              className={quizType === 'keywords' ? '' : 'secondary'}
              onClick={() => setQuizType('keywords')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem' }}
            >
              🏷️ {isFrench ? 'Test de Mots-Clés' : 'Keywords Quiz'}
            </button>
            <button
              className={quizType === 'stratagems' ? '' : 'secondary'}
              onClick={() => setQuizType('stratagems')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.85rem' }}
            >
              ⚡ {isFrench ? 'Tests stratagèmes' : 'Stratagems Quiz'}
            </button>
          </div>

          <div className="learning-scores score-display">
            {quizType === 'all' ? (
              (() => {
                const totalCorr = statsScore.correct + weaponsScore.correct + kwScore.correct + stratScore.correct + compareScore.correct;
                const totalTot = statsScore.total + weaponsScore.total + kwScore.total + stratScore.total + compareScore.total;
                return (
                  <>
                    <div className="score-badge">🎯 {isFrench ? 'Score Global' : 'Overall Score'} : {totalCorr}/{totalTot}</div>
                    {totalTot > 0 && <div className="score-badge" style={{ color: 'var(--gold-dark)' }}>{Math.round((totalCorr / totalTot) * 100)}%</div>}
                  </>
                );
              })()
            ) : (
              (() => {
                const s = quizType === 'stats' ? statsScore : quizType === 'weapons' ? weaponsScore : quizType === 'compare' ? compareScore : quizType === 'keywords' ? kwScore : stratScore;
                return (
                  <>
                    <div className="score-badge">🎯 {isFrench ? 'Score' : 'Score'} : {s.correct}/{s.total}</div>
                    {s.total > 0 && <div className="score-badge" style={{ color: 'var(--gold-dark)' }}>{Math.round((s.correct / s.total) * 100)}%</div>}
                    {s.streak > 0 && <div className="score-badge streak">🔥 {isFrench ? 'Série' : 'Streak'} : {s.streak}</div>}
                  </>
                );
              })()
            )}
          </div>
        </div>

        {/* Filters & Faction Multi-Select Section */}
        <div className="learning-filters-section">
          {/* Preset Segmented Control */}
          <div className="learning-filters-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--ink)' }}>
                🎯 {isFrench ? 'Périmètre d’apprentissage :' : 'Learning Scope:'}
              </div>
            </div>
            <div className="segmented-control">
              <button
                type="button"
                className={scope === 'stock' ? 'active' : ''}
                onClick={() => handleSelectPreset('stock')}
                disabled={!inventory}
                title={!inventory ? (isFrench ? 'Inventaire non disponible' : 'Inventory unavailable') : ''}
              >
                📦 {isFrench ? 'Mon Inventaire' : 'My Collection'}
              </button>
              <button
                type="button"
                className={scope === 'favorites' ? 'active' : ''}
                onClick={() => handleSelectPreset('favorites')}
              >
                ⭐ {isFrench ? 'Mes Favoris' : 'My Favorites'}
              </button>
              <button
                type="button"
                className={scope === 'roster' ? 'active' : ''}
                onClick={() => handleSelectPreset('roster')}
                disabled={!activeDraft}
                title={!activeDraft ? (isFrench ? 'Aucune liste active' : 'No active roster') : ''}
              >
                📋 {isFrench ? 'Liste Active' : 'Active Roster'}
              </button>
              <button
                type="button"
                className={scope === 'all' ? 'active' : ''}
                onClick={() => handleSelectPreset('all')}
              >
                🌍 {isFrench ? 'Toutes les Unités' : 'All Units'}
              </button>
            </div>
          </div>

          {/* Faction Checkboxes Header & Select/Deselect All */}
          <div className="learning-checkboxes-header">
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--ink-soft)' }}>
              {isFrench ? `Choix des factions (${selectedFactionIds.size}/${database.factions.length}) :` : `Selected Factions (${selectedFactionIds.size}/${database.factions.length}):`}
            </div>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                className="secondary"
                onClick={handleSelectAllFactions}
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem' }}
              >
                ✓ {isFrench ? 'Tout cocher' : 'Select All'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={handleDeselectAllFactions}
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.72rem' }}
              >
                ✗ {isFrench ? 'Tout décocher' : 'Deselect All'}
              </button>
            </div>
          </div>

          {/* Checkboxes Grid */}
          <div className="learning-checkboxes-grid">
            {database.factions.map((f) => {
              const isChecked = selectedFactionIds.has(f.id);
              return (
                <label
                  key={f.id}
                  className="learning-checkbox-label"
                  style={{
                    color: isChecked ? 'var(--ink)' : 'var(--ink-soft)',
                    fontWeight: isChecked ? 600 : 400
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleFaction(f.id)}
                    className="learning-checkbox-input"
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {display.factionName(f.name)} <span style={{ opacity: 0.6, fontSize: '0.72rem' }}>({f.unitCount})</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </section>

      {/* Content Area */}
      {effectiveQuizType === 'stats' ? (
        <StatsQuiz
          database={database}
          display={display}
          isFrench={isFrench}
          shuffledUnits={shuffledUnits}
          onAdvance={pickNextAllSubtype}
          onScoreUpdate={(isCorrect) => {
            setStatsScore((prev) => ({
              correct: prev.correct + (isCorrect ? 1 : 0),
              total: prev.total + 1,
              streak: isCorrect ? prev.streak + 1 : 0
            }));
          }}
          inventory={inventory}
          getUnitImgUrl={getUnitImgUrl}
        />
      ) : effectiveQuizType === 'keywords' ? (
        <KeywordsQuiz
          database={database}
          display={display}
          isFrench={isFrench}
          eligibleUnits={eligibleUnits}
          onAdvance={pickNextAllSubtype}
          onScoreUpdate={(numCorrect, total, isFullyCorrect) => {
            setKwScore((prev) => ({
              correct: prev.correct + numCorrect,
              total: prev.total + total,
              streak: isFullyCorrect ? prev.streak + 1 : 0
            }));
          }}
          getUnitImgUrl={getUnitImgUrl}
        />
      ) : effectiveQuizType === 'compare' ? (
        <CompareQuiz
          database={database}
          display={display}
          isFrench={isFrench}
          eligibleUnits={shuffledUnits}
          onAdvance={pickNextAllSubtype}
          onScoreUpdate={(isCorrect) => {
            setCompareScore((prev) => ({
              correct: prev.correct + (isCorrect ? 1 : 0),
              total: prev.total + 1,
              streak: isCorrect ? prev.streak + 1 : 0
            }));
          }}
          getUnitImgUrl={getUnitImgUrl}
        />
      ) : effectiveQuizType === 'weapons' ? (
        <WeaponsQuiz
          database={database}
          display={display}
          isFrench={isFrench}
          eligibleUnits={shuffledUnits}
          onAdvance={pickNextAllSubtype}
          onScoreUpdate={(isCorrect) => {
            setWeaponsScore((prev) => ({
              correct: prev.correct + (isCorrect ? 1 : 0),
              total: prev.total + 1,
              streak: isCorrect ? prev.streak + 1 : 0
            }));
          }}
          getUnitImgUrl={getUnitImgUrl}
        />
      ) : (
        <StratagemsQuiz
          database={database}
          display={display}
          isFrench={isFrench}
          eligibleDetachments={eligibleDetachments}
          onAdvance={pickNextAllSubtype}
          onScoreUpdate={(isSuccess) => {
            setStratScore((prev) => ({
              correct: prev.correct + (isSuccess ? 1 : 0),
              total: prev.total + 1,
              streak: isSuccess ? prev.streak + 1 : 0
            }));
          }}
        />
      )}
    </main>
  );
}
