import type { MissionCards, MissionLayout, PrimaryMissionCard, SecondaryMissionCard } from '../domain/mission-packs';

export type MissionQuizFilter = 'all' | 'primary' | 'secondary' | string;

export const MISSION_QUIZ_RETRY_DELAY = 5;

export function nextMissionQuizRetryRound(currentRound: number): number {
  return currentRound + MISSION_QUIZ_RETRY_DELAY;
}

export interface PrimaryCompositionQuestion {
  format: 'primary-composition';
  target: PrimaryMissionCard;
  options: PrimaryMissionCard[];
  correctOptionId: string;
}

export interface PrimaryOpponentQuestion {
  format: 'primary-opponent';
  target: PrimaryMissionCard;
  options: string[];
  correctOptionId: string;
}

export interface PrimaryRulesQuestion {
  format: 'primary-rules';
  target: PrimaryMissionCard;
  options: PrimaryMissionCard[];
  correctOptionId: string;
}

export interface SecondaryRecognitionQuestion {
  format: 'secondary-recognition';
  target: SecondaryMissionCard;
  options: SecondaryMissionCard[];
  correctOptionId: string;
}

export type MissionQuizQuestion = PrimaryCompositionQuestion | PrimaryOpponentQuestion | PrimaryRulesQuestion | SecondaryRecognitionQuestion;

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function pick<T>(items: readonly T[], random: () => number): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(random() * items.length)] ?? null;
}

function answerOptions<T extends { sourcePath: string }>(target: T, candidates: readonly T[], random: () => number): T[] {
  const distractors = shuffled(candidates.filter((candidate) => candidate.sourcePath !== target.sourcePath), random).slice(0, 3);
  return shuffled([target, ...distractors], random);
}

export function missionDispositionLabel(disposition: string): string {
  return disposition.split('-').map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ');
}

export function missionQuizFilters(cards: MissionCards): Array<{ value: MissionQuizFilter; label: string }> {
  const decks = [...new Set(cards.primary.map((card) => card.deck))].sort((left, right) => left.localeCompare(right));
  return decks.map((deck) => ({ value: deck, label: missionDispositionLabel(deck) }));
}

function primaryForFilter(cards: MissionCards, filter: MissionQuizFilter): PrimaryMissionCard[] {
  if (filter === 'secondary') return [];
  if (filter === 'all' || filter === 'primary') return cards.primary;
  return cards.primary.filter((card) => card.deck === filter);
}

function secondaryForFilter(cards: MissionCards, filter: MissionQuizFilter): SecondaryMissionCard[] {
  return filter === 'all' || filter === 'secondary' ? cards.secondary : [];
}

export function createMissionQuizQuestion(cards: MissionCards, filter: MissionQuizFilter, random: () => number = Math.random): MissionQuizQuestion | null {
  const primary = primaryForFilter(cards, filter);
  const secondary = secondaryForFilter(cards, filter);
  const target = pick([...primary, ...secondary], random);
  if (!target) return null;

  if ('deck' in target) {
    const sameDeck = cards.primary.filter((card) => card.deck === target.deck);
    const dispositions = [...new Set(cards.primary.map((card) => card.deck))];
    const formats: Array<PrimaryCompositionQuestion['format'] | PrimaryRulesQuestion['format'] | PrimaryOpponentQuestion['format']> = [
      'primary-composition',
      'primary-rules',
    ];
    if (target.vs && dispositions.length > 1) formats.push('primary-opponent');
    const format = pick(formats, random) ?? 'primary-composition';

    if (format === 'primary-opponent') {
      return {
        format,
        target,
        options: shuffled(dispositions, random),
        correctOptionId: target.vs ?? '',
      };
    }

    return {
      format,
      target,
      options: answerOptions(target, sameDeck, random),
      correctOptionId: target.sourcePath,
    };
  }

  return {
    format: 'secondary-recognition',
    target,
    options: answerOptions(target, cards.secondary, random),
    correctOptionId: target.sourcePath,
  };
}

export function matchingLayouts(cards: MissionCards, card: PrimaryMissionCard): MissionLayout[] {
  if (!card.vs) return [];
  const directPath = `/11th/layouts/${card.deck}/${card.vs}`;
  const reversePath = `/11th/layouts/${card.vs}/${card.deck}`;
  return cards.layouts.find((matchup) => matchup.sourcePath === directPath || matchup.sourcePath === reversePath)?.layouts ?? [];
}
