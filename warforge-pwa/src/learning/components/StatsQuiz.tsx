import { useMemo, useState } from 'react';
import type { NormalizedDatabase, NormalizedUnit } from '../../domain/types';
import type { CatalogLocalization } from '../../domain/catalog-localization';
import {
  STAT_KEYS,
  generateStatOptions,
  getExpectedStatValue,
  getUnitAbilityTitles,
  shuffleArray,
  getAbilityDescription
} from '../learning-utils';
import { parseInvulSave } from "../../domain/catalog";
import { unitImageUrl } from '../../domain/unit-images';

import type { InventoryDataset } from "../../domain/inventory";
import { getProxySourceUnits } from "../../domain/inventory";

export interface StatsQuizProps {
  inventory: InventoryDataset | null;
  database: NormalizedDatabase;
  display: CatalogLocalization;
  isFrench: boolean;
  shuffledUnits: NormalizedUnit[];
  onAdvance: () => void;
  onScoreUpdate: (isCorrect: boolean) => void;
  getUnitImgUrl: (unitId: string) => string | null;
}

export function StatsQuiz({
  database,
  display,
  isFrench,
  shuffledUnits,
  onAdvance,
  onScoreUpdate,
  inventory,
  getUnitImgUrl
}: StatsQuizProps) {
  const [unitSeedIndex, setUnitSeedIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [selectedStatsAbilities, setSelectedStatsAbilities] = useState<Set<string>>(new Set());
  const [inspectedAbilityTitle, setInspectedAbilityTitle] = useState<string | null>(null);
  const [statsChecked, setStatsChecked] = useState<boolean>(false);

  // Current Unit for Stats Quiz
  const currentUnit = useMemo(() => {
    if (shuffledUnits.length === 0) return null;
    const index = Math.abs(unitSeedIndex) % shuffledUnits.length;
    return shuffledUnits[index] ?? null;
  }, [shuffledUnits, unitSeedIndex]);

  // Stat options generated for the current unit
  const statOptionsMap = useMemo(() => {
    if (!currentUnit || !currentUnit.StatLines?.[0]) return {};
    const line = currentUnit.StatLines[0];
    const res: Record<string, string[]> = {};
    for (const { key } of STAT_KEYS) {
      const val = getExpectedStatValue(line, key);
      res[key] = generateStatOptions(key, val);
    }
    return res;
  }, [currentUnit]);

  // Ability options generated for the current unit
  const unitAbilityOptions = useMemo(() => {
    if (!currentUnit) return [];
    const correct = getUnitAbilityTitles(currentUnit);
    const correctSet = new Set(correct.map((a) => a.toUpperCase()));

    const distractors: string[] = [];
    const otherUnits = shuffleArray(database.units.filter((u) => u.id !== currentUnit.id));

    for (const u of otherUnits) {
      const abList = getUnitAbilityTitles(u);
      for (const ab of abList) {
        if (!correctSet.has(ab.toUpperCase()) && !distractors.includes(ab)) {
          distractors.push(ab);
        }
        if (distractors.length >= 10) break;
      }
      if (distractors.length >= 10) break;
    }

    const numDistractors = Math.max(3, 6 - correct.length);
    const chosenDistractors = shuffleArray(distractors).slice(0, numDistractors);

    return shuffleArray([...correct, ...chosenDistractors]);
  }, [currentUnit, database.units]);

  // Handle Next Unit for Stats Quiz
  const handleNextUnit = () => {
    setSelectedAnswers({});
    setSelectedStatsAbilities(new Set());
    setInspectedAbilityTitle(null);
    setStatsChecked(false);
    setUnitSeedIndex((prev) => prev + 1);
    onAdvance();
  };

  // Check Stats Answers
  const handleVerifyStats = () => {
    if (!currentUnit || !currentUnit.StatLines?.[0]) return;
    const line = currentUnit.StatLines[0];

    let numCorrect = 0;
    let numTotal = STAT_KEYS.length;

    for (const { key } of STAT_KEYS) {
      const expected = getExpectedStatValue(line, key);
      const actual = (selectedAnswers[key] ?? '').trim();
      if (actual === expected) {
        numCorrect++;
      }
    }

    let abilitiesCorrect = true;
    if (unitAbilityOptions.length > 0) {
      const actualAbilities = getUnitAbilityTitles(currentUnit);
      const actualSet = new Set(actualAbilities.map((a) => a.toUpperCase()));
      for (const opt of unitAbilityOptions) {
        const isActual = actualSet.has(opt.toUpperCase());
        const isSelected = selectedStatsAbilities.has(opt);
        if (isActual !== isSelected) {
          abilitiesCorrect = false;
        }
      }
    }

    const allStatsCorrect = numCorrect === numTotal;
    const isFullyCorrect = allStatsCorrect && abilitiesCorrect;

    setStatsChecked(true);
    onScoreUpdate(isFullyCorrect);
  };

  if (!currentUnit || !currentUnit.StatLines?.[0]) return null;
  return (
          <section className="library-panel" style={{ marginTop: '0.85rem', padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div>
                <span className="eyebrow" style={{ fontSize: '0.72rem' }}>{display.factionName(currentUnit.factionName)}</span>
                <h2 style={{ fontSize: '1.35rem', margin: 0 }}>{display.unitName(currentUnit)}</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {!statsChecked ? (
                  <button
                    onClick={handleVerifyStats}
                    disabled={Object.keys(selectedAnswers).length < STAT_KEYS.length}
                    style={{ padding: '0.45rem 0.9rem', fontSize: '0.9rem' }}
                  >
                    ✓ {isFrench ? 'Vérifier' : 'Check'}
                  </button>
                ) : null}
                <button onClick={handleNextUnit} className={statsChecked ? '' : 'secondary'} style={{ padding: '0.45rem 0.9rem', fontSize: '0.9rem' }}>
                  ➔ {isFrench ? 'Suivant' : 'Next'}
                </button>
              </div>
            </div>

            {/* Unit Image & Datacard Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: getUnitImgUrl(currentUnit.id) ? '140px 1fr' : '1fr', gap: '1rem', alignItems: 'center' }}>
              {getUnitImgUrl(currentUnit.id) && (
                <div style={{ textAlign: 'center', background: '#f8f4eb', border: '1px solid #e2d8c9', borderRadius: '0.65rem', padding: '0.35rem' }}>
                  <img
                    src={getUnitImgUrl(currentUnit.id)!}
                    alt={display.unitName(currentUnit)}
                    style={{ maxWidth: '100%', maxHeight: '110px', objectFit: 'contain', borderRadius: '0.4rem' }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.6rem' }}>
                {STAT_KEYS.map(({ key, label, nameFr, nameEn }) => {
                  const correctVal = getExpectedStatValue(currentUnit.StatLines![0], key);
                  const options = statOptionsMap[key] ?? [correctVal];
                  const userChoice = selectedAnswers[key] ?? '';
                  const isRight = userChoice === correctVal;
                  const hasLongOptions = options.some((o) => o.length > 4);

                  return (
                    <div
                      key={key}
                      style={{
                        background: statsChecked
                          ? isRight
                            ? '#eef8f2'
                            : '#fdf2f0'
                          : '#fffefa',
                        border: statsChecked
                          ? isRight
                            ? '2px solid #296345'
                            : '2px solid #b83228'
                          : '1px solid #d4c8b7',
                        borderRadius: '0.65rem',
                        padding: '0.55rem 0.45rem',
                        textAlign: 'center',
                        minWidth: 0,
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{ fontWeight: 800, color: 'var(--gold-dark)', fontSize: '0.8rem', marginBottom: '0.4rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {label} · {isFrench ? nameFr : nameEn}
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: hasLongOptions ? 'repeat(2, 1fr)' : `repeat(${Math.min(options.length, 4)}, 1fr)`,
                          gap: '0.25rem'
                        }}
                      >
                        {options.map((opt) => {
                          const isSelected = userChoice === opt;
                          let pillBg = isSelected ? 'var(--gold, #dcb15b)' : '#fcf9f2';
                          let pillBorder = isSelected ? '2px solid var(--gold-dark, #8b6b23)' : '1px solid #d0c4b4';
                          let pillColor = isSelected ? '#171108' : '#393126';
                          let badge = '';

                          if (statsChecked) {
                            if (opt === correctVal) {
                              pillBg = '#d1e7dd';
                              pillBorder = '2px solid #296345';
                              pillColor = '#0f5132';
                              badge = ' ✓';
                            } else if (isSelected && !isRight) {
                              pillBg = '#f8d7da';
                              pillBorder = '2px solid #b83228';
                              pillColor = '#842029';
                              badge = ' ✗';
                            } else {
                              pillBg = '#f3efea';
                              pillBorder = '1px solid #e2d8c9';
                              pillColor = '#8a8073';
                            }
                          }

                          return (
                            <button
                            className="pill-button"
                              key={opt}
                              type="button"
                              disabled={statsChecked}
                              onClick={() => setSelectedAnswers((prev) => ({ ...prev, [key]: opt }))}
                              style={{
                                padding: hasLongOptions ? '0.3rem 0.15rem' : '0.35rem 0.1rem',
                                fontSize: hasLongOptions ? '0.74rem' : '0.82rem',
                                fontWeight: isSelected || (statsChecked && opt === correctVal) ? 800 : 700,
                                borderRadius: '0.4rem',
                                border: pillBorder,
                                background: pillBg,
                                color: pillColor,
                                cursor: statsChecked ? 'default' : 'pointer',
                                textAlign: 'center',
                                minWidth: 0,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                boxShadow: isSelected && !statsChecked ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                                transition: 'all 0.1s ease'
                              }}
                              title={`${opt}${badge}`}
                            >
                              {opt}{badge}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Unit Abilities Multiple Choice */}
            {unitAbilityOptions.length > 0 && (
              <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid #e1d8ca' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--gold-dark)' }}>
                    ✨ {isFrench ? 'Aptitudes de l’unité (cocher toutes les aptitudes valides) :' : 'Unit Abilities (select all that apply):'}
                  </div>
                  {!statsChecked && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                      {isFrench ? 'Cliquez pour sélectionner / désélectionner' : 'Click to select / deselect'}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {unitAbilityOptions.map((abilityTitle) => {
                    const isSelected = selectedStatsAbilities.has(abilityTitle);
                    const correctSet = new Set(getUnitAbilityTitles(currentUnit!).map((a) => a.toUpperCase()));
                    const isActualAbility = correctSet.has(abilityTitle.toUpperCase());
                    const isInspected = inspectedAbilityTitle === abilityTitle;

                    let bg = isSelected ? 'var(--gold, #dcb15b)' : '#fcf9f2';
                    let border = isSelected ? '2px solid var(--gold-dark, #8b6b23)' : '1px solid #d0c4b4';
                    let color = isSelected ? '#171108' : '#393126';
                    let badge = isSelected ? ' ☑️' : ' ⬜';

                    if (statsChecked) {
                      if (isActualAbility) {
                        bg = isSelected ? '#d1e7dd' : '#eef8f2';
                        border = '2px solid #296345';
                        color = '#0f5132';
                        badge = isSelected ? ' ✅ VRAI' : ' ⚠️ Oublié';
                      } else {
                        bg = isSelected ? '#f8d7da' : '#f3efea';
                        border = isSelected ? '2px solid #b83228' : '1px solid #e2d8c9';
                        color = isSelected ? '#842029' : '#8a8073';
                        badge = isSelected ? ' ❌ Faux' : '';
                      }
                    }

                    return (
                      <button
                        key={abilityTitle}
                        type="button"
                        onClick={() => {
                          if (!statsChecked) {
                            setSelectedStatsAbilities((prev) => {
                              const next = new Set(prev);
                              if (next.has(abilityTitle)) next.delete(abilityTitle);
                              else next.add(abilityTitle);
                              return next;
                            });
                          }
                          setInspectedAbilityTitle((prev) => (prev === abilityTitle ? null : abilityTitle));
                        }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          borderRadius: '999px',
                          border,
                          background: bg,
                          color,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          boxShadow: isInspected ? '0 0 0 2px var(--gold-dark, #8b6b23)' : 'none',
                          transition: 'all 0.1s ease'
                        }}
                      >
                        <span>{display.term(abilityTitle)}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{badge}</span>
                      </button>
                    );
                  })}
                </div>

                {inspectedAbilityTitle && (() => {
                  const desc = getAbilityDescription(inspectedAbilityTitle, currentUnit, database, isFrench);
                  return (
                    <div
                      style={{
                        marginTop: '0.65rem',
                        padding: '0.65rem 0.85rem',
                        background: '#f8f4ec',
                        border: '1px solid #dcd1be',
                        borderRadius: '0.6rem',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.84rem', color: 'var(--gold-dark, #8b6b23)' }}>
                          📜 {display.term(inspectedAbilityTitle)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setInspectedAbilityTitle(null)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--ink-soft)',
                            cursor: 'pointer',
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            padding: '0 0.2rem'
                          }}
                          title={isFrench ? 'Fermer la description' : 'Close description'}
                        >
                          ✕
                        </button>
                      </div>
                      {desc ? (
                        <div style={{ fontSize: '0.81rem', lineHeight: 1.5, color: '#32291e', whiteSpace: 'pre-line' }}>
                          {desc}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                          {isFrench ? 'Aucune description disponible pour cette aptitude.' : 'No description available for this ability.'}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {(() => {
              const invul = parseInvulSave(currentUnit.StatLines![0]);
              if (!invul?.description) return null;
              return (
                <p style={{ fontSize: '0.78rem', fontStyle: 'italic', color: 'var(--ink-soft)', marginTop: '0.4rem', marginBottom: 0 }}>
                  * {invul.formatted} : {invul.description}
                </p>
              );
            })()}

            {/* Unit Keywords Footer */}
            <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #e1d8ca' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--ink-soft)', marginBottom: '0.25rem' }}>
                {isFrench ? 'Mots-clés de l’unité :' : 'Unit Keywords:'}
              </div>
              <div className="tag-row" style={{ margin: 0 }}>
                {[...(currentUnit.Keywords ?? []), ...(currentUnit.FactionKeywords ?? [])].map((kw) => (
                  <span key={kw} style={{ fontSize: '0.68rem', padding: '0.15rem 0.4rem' }}>{display.term(kw)}</span>
                ))}
              </div>

              {/* Discrete Stock Status */}
              {(() => {
                if (!inventory || inventory.databaseFingerprint !== database.fingerprint) return null;
                const realStockCount = inventory.entries.filter((e) => e.unitId === currentUnit.id && e.type === 'real').length;
                const proxySources = getProxySourceUnits(inventory, database, currentUnit.id);
                if (realStockCount === 0 && proxySources.length === 0) return null;

                const proxyNames = proxySources.map((u) => display.unitName(u)).join(', ');

                let text = '';
                if (realStockCount > 0 && proxySources.length > 0) {
                  text = isFrench ? `en stock réel et proxy de ${proxyNames}` : `in real stock and proxy for ${proxyNames}`;
                } else if (realStockCount > 0) {
                  text = isFrench ? 'en stock' : 'in stock';
                } else {
                  text = isFrench ? `en stock proxy de ${proxyNames}` : `in proxy stock for ${proxyNames}`;
                }

                return (
                  <div style={{ marginTop: '0.55rem', fontSize: '0.74rem', color: 'var(--ink-soft)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>📦</span>
                    <span>{text}</span>
                  </div>
                );
              })()}
            </div>
          </section>
  );
}
