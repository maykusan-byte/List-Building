import { useEffect, useMemo, useState } from 'react';
import { sanitizeStratagemCategoryForQuiz, sanitizeStratagemTextForQuiz, generateStatOptions, getExpectedStatValue, shuffleArray, unitHasKeyword, isForbiddenKeyword, getUnitAbilityTitles, getAbilityDescription } from "./learning-utils";
import { StatsQuiz } from "./components/StatsQuiz";
import { KeywordsQuiz } from "./components/KeywordsQuiz";
import { StratagemsQuiz } from "./components/StratagemsQuiz";
import { MissionsQuiz } from "./components/MissionsQuiz";
import { WeaponsQuiz } from "./components/WeaponsQuiz";
import { CompareQuiz } from "./components/CompareQuiz";
import "./learning.css";
import { useTranslation } from 'react-i18next';
import { BrandMark } from '../components/BrandMark';
import { formatSaveDisplay, isUnitAvailableToFaction, parseInvulSave, primaryRosterSourceKeysForFaction, sourceKeysForFaction } from '../domain/catalog';
import { getDetachmentCost } from '../domain/calculations';
import { getInventoryAvailability, getProxySourceUnits } from '../domain/inventory';
import { unitImageUrl } from '../domain/unit-images';
import type { CatalogLocalization } from '../domain/catalog-localization';
import type { InventoryAllocation, InventoryDataset } from '../domain/inventory';
import type { NormalizedDatabase, NormalizedUnit, RosterDraft } from '../domain/types';
import type { UnitImageEntry } from '../domain/unit-images';

type ScopeFilter = 'all' | 'stock' | 'favorites' | 'roster';
type QuizType = 'all' | 'stats' | 'keywords' | 'stratagems' | 'weapons' | 'compare' | 'missions';

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

  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(null);
  const [hasInitializedFactions, setHasInitializedFactions] = useState(false);
  const [scope, setScope] = useState<ScopeFilter>(() => {
    if (inventory && inventory.entries.length > 0) return 'stock';
    if (activeDraft && activeDraft.items.length > 0) return 'roster';
    if (favorites.length > 0) return 'favorites';
    return 'all';
  });
  const [quizType, setQuizType] = useState<QuizType>('all');
  const [allQuizSubtype, setAllQuizSubtype] = useState<'stats' | 'keywords' | 'stratagems' | 'weapons' | 'compare' | 'missions'>('stats');


  const [missionsScore, setMissionsScore] = useState<{ correct: number; total: number; streak: number }>({ correct: 0, total: 0, streak: 0 });
  const [stratScore, setStratScore] = useState<{ correct: number; total: number; streak: number }>({ correct: 0, total: 0, streak: 0 });
  const [stratSeedIndex, setStratSeedIndex] = useState<number>(0);

  const handleSelectPreset = (preset: 'all' | 'favorites' | 'stock' | 'roster') => {
    setScope(preset);
  };

  const toggleFaction = (factionId: string) => {
    setSelectedFactionId(factionId);
  };

  const eligibleUnits = useMemo(() => {
    let units = database.units;
    if (scope !== 'all') {
      const favSet = new Set(favorites);
      units = units.filter((u) => {
        if (scope === 'favorites') return favSet.has(u.id);
        if (scope === 'roster') return activeDraft?.items.some((i) => i.unitId === u.id) ?? false;
        if (scope === 'stock') {
          if (!inventory) return false;
          return inventory.entries.some((e) => e.unitId === u.id);
        }
        return false;
      });
    }
    if (!selectedFactionId) return [];
    return units.filter((u) => {
      if (u.factionName === selectedFactionId || isUnitAvailableToFaction(database, selectedFactionId, u)) {
        return true;
      }
      return false;
    });
  }, [database, scope, favorites, activeDraft, inventory, selectedFactionId]);

  const eligibleDetachments = useMemo(() => {
    const detachmentsWithStrats = database.detachments.filter((d) => (d.Stratagems ?? []).length > 0);
    if (!selectedFactionId) return [];

    const validSourceKeys = new Set<string>();
    const primaryKeys = primaryRosterSourceKeysForFaction(database, selectedFactionId);
    primaryKeys.forEach((k) => validSourceKeys.add(k));
    const allKeys = sourceKeysForFaction(database, selectedFactionId);
    allKeys.forEach((k) => validSourceKeys.add(k));

    const factionFiltered = detachmentsWithStrats.filter((d) => validSourceKeys.has(d.sourceKey) || selectedFactionId === d.factionName);

    if (scope === 'all') return factionFiltered;

    const factionNamesFromUnits = new Set(eligibleUnits.map((u) => u.factionName));
    const sourceKeysFromUnits = new Set(eligibleUnits.map((u) => u.sourceKey));
    return factionFiltered.filter((d) => sourceKeysFromUnits.has(d.sourceKey) || factionNamesFromUnits.has(d.factionName));
  }, [database, selectedFactionId, scope, eligibleUnits]);

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

  // Default to Space Marines on initial load
  useEffect(() => {
    if (!hasInitializedFactions && database.factions.length > 0) {
      const defaultFaction = database.factions.find(f => DEFAULT_FACTION_NAMES.has(f.name.toLowerCase().trim()) || DEFAULT_FACTION_NAMES.has(f.id.toLowerCase().trim()));
      const initialId = defaultFaction ? defaultFaction.id : database.factions[0].id;
      setSelectedFactionId(initialId);
      setHasInitializedFactions(true);
    }
  }, [database, hasInitializedFactions, DEFAULT_FACTION_NAMES]);

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
    const options: ('stats' | 'keywords' | 'stratagems' | 'weapons' | 'compare' | 'missions')[] = [];
    if (eligibleUnits.length > 0) {
      options.push('stats', 'keywords', 'weapons', 'compare');
    }
    if (eligibleDetachments.length > 0) {
      options.push('stratagems');
    }
    options.push('missions');
    if (options.length === 0) return;
    const next = options[Math.floor(Math.random() * options.length)];
    setAllQuizSubtype(next);
  };

  const effectiveQuizType: 'stats' | 'keywords' | 'stratagems' | 'weapons' | 'compare' | 'missions' = useMemo(() => {
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
          <div className="learning-select-wrapper" style={{ flex: '1 1 200px' }}>
            <select
              value={quizType}
              onChange={(e) => setQuizType(e.target.value as any)}
              className="learning-select"
            >
              <option value="all">🎲 {isFrench ? 'Tous les tests' : 'All Quizzes'}</option>
              <option value="stats">🎴 {isFrench ? 'Profils & Caractéristiques' : 'Unit Stats Datacard'}</option>
              <option value="weapons">⚔️ {isFrench ? 'Profils d\'Armes' : 'Weapon Profiles'}</option>
              <option value="compare">⚖️ {isFrench ? 'Comparer' : 'Compare'}</option>
              <option value="keywords">🏷️ {isFrench ? 'Test de Mots-Clés' : 'Keywords Quiz'}</option>
              <option value="stratagems">⚡ {isFrench ? 'Tests stratagèmes' : 'Stratagems Quiz'}</option>
              <option value="missions">📜 {isFrench ? 'Missions' : 'Missions'}</option>
            </select>
            <div className="learning-select-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          </div>


          <div className="learning-scores score-display">
            {quizType === 'all' ? (
              (() => {
                const totalCorr = statsScore.correct + weaponsScore.correct + kwScore.correct + stratScore.correct + compareScore.correct + missionsScore.correct;
                const totalTot = statsScore.total + weaponsScore.total + kwScore.total + stratScore.total + compareScore.total + missionsScore.total;
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
            <label htmlFor="scope-select" style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--ink-soft)' }}>
              🎯 {isFrench ? 'Périmètre d’apprentissage :' : 'Learning Scope:'}
            </label>
            <div className="learning-select-wrapper">
              <select
                id="scope-select"
                value={scope}
                onChange={(e) => handleSelectPreset(e.target.value as any)}
                className="learning-select"
              >
                <option value="stock" disabled={!inventory}>📦 {isFrench ? 'Mon Inventaire' : 'My Collection'}</option>
                <option value="favorites">⭐ {isFrench ? 'Mes Favoris' : 'My Favorites'}</option>
                <option value="roster" disabled={!activeDraft}>📋 {isFrench ? 'Liste Active' : 'Active Roster'}</option>
                <option value="all">🌍 {isFrench ? 'Toutes les Unités' : 'All Units'}</option>
              </select>
              <div className="learning-select-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>

          {/* Faction Select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
            <label htmlFor="faction-select" style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--ink-soft)' }}>
              {isFrench ? `Choix de la faction :` : `Selected Faction:`}
            </label>
            <div className="learning-select-wrapper">
              <select
                id="faction-select"
                value={selectedFactionId || ''}
                onChange={(e) => toggleFaction(e.target.value)}
                className="learning-select"
              >
                {database.factions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {display.factionName(f.name)}
                  </option>
                ))}
              </select>
              <div className="learning-select-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content Area */}
      {eligibleUnits.length === 0 && (effectiveQuizType !== 'stratagems' || eligibleDetachments.length === 0) && effectiveQuizType !== 'missions' ? (
        <section className="library-panel" style={{ marginTop: '0.85rem', padding: '2.5rem 1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
          <h3 style={{ fontSize: '1.15rem', margin: '0 0 0.5rem 0' }}>
            {isFrench ? 'Aucune unité ou détachement disponible pour ce filtre' : 'No units or detachments available for this filter'}
          </h3>
          <p className="muted" style={{ margin: '0 auto 1.25rem auto', maxWidth: '500px', fontSize: '0.9rem' }}>
            {isFrench
              ? 'Essayez de choisir le périmètre "Toutes les Unités" ou de choisir une autre faction.'
              : 'Try selecting the "All Units" scope or choosing another faction.'}
          </p>
          <button
            type="button"
            className="action-with-icon"
            onClick={() => {
              setScope('all');
            }}
            style={{ margin: '0 auto', padding: '0.5rem 1rem' }}
          >
            🌍 {isFrench ? 'Réinitialiser : Toutes les Factions & Unités' : 'Reset: All Factions & Units'}
          </button>
        </section>
      ) : (
        <>
          <div style={{ display: effectiveQuizType === 'stats' ? 'block' : 'none' }}>
            <StatsQuiz
              database={database}
              display={display}
              isFrench={isFrench}
              shuffledUnits={shuffledUnits}
              onAdvance={pickNextAllSubtype}
              onScoreUpdate={(isCorrect: boolean) => {
                setStatsScore((prev) => ({
                  correct: prev.correct + (isCorrect ? 1 : 0),
                  total: prev.total + 1,
                  streak: isCorrect ? prev.streak + 1 : 0
                }));
              }}
              inventory={inventory}
              getUnitImgUrl={getUnitImgUrl}
            />
          </div>
          <div style={{ display: effectiveQuizType === 'keywords' ? 'block' : 'none' }}>
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
          </div>
          <div style={{ display: effectiveQuizType === 'compare' ? 'block' : 'none' }}>
            <CompareQuiz
              database={database}
              display={display}
              isFrench={isFrench}
              eligibleUnits={shuffledUnits}
              onAdvance={pickNextAllSubtype}
              onScoreUpdate={(isCorrect: boolean) => {
                setCompareScore((prev) => ({
                  correct: prev.correct + (isCorrect ? 1 : 0),
                  total: prev.total + 1,
                  streak: isCorrect ? prev.streak + 1 : 0
                }));
              }}
              getUnitImgUrl={getUnitImgUrl}
            />
          </div>
          <div style={{ display: effectiveQuizType === 'weapons' ? 'block' : 'none' }}>
            <WeaponsQuiz
              database={database}
              display={display}
              isFrench={isFrench}
              eligibleUnits={shuffledUnits}
              onAdvance={pickNextAllSubtype}
              onScoreUpdate={(isCorrect: boolean) => {
                setWeaponsScore((prev) => ({
                  correct: prev.correct + (isCorrect ? 1 : 0),
                  total: prev.total + 1,
                  streak: isCorrect ? prev.streak + 1 : 0
                }));
              }}
              getUnitImgUrl={getUnitImgUrl}
            />
          </div>
          <div style={{ display: effectiveQuizType === 'missions' ? 'block' : 'none' }}>
            <MissionsQuiz
              isFrench={isFrench}
              onAdvance={pickNextAllSubtype}
              onScoreUpdate={(isCorrect: boolean) => {
                setMissionsScore((prev) => ({
                  correct: prev.correct + (isCorrect ? 1 : 0),
                  total: prev.total + 1,
                  streak: isCorrect ? prev.streak + 1 : 0
                }));
              }}
            />
          </div>
          <div style={{ display: effectiveQuizType === 'stratagems' ? 'block' : 'none' }}>
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
          </div>
        </>
      )}
    </main>
  );
}