import { describe, expect, it } from 'vitest';
import { createMissionQuizQuestion, matchingLayouts, missionQuizFilters, nextMissionQuizRetryRound } from './mission-quiz';
import type { MissionCards, PrimaryMissionCard } from '../domain/mission-packs';

function primary(name: string, deck: string, vs: string): PrimaryMissionCard {
  return {
    name,
    deck,
    vs,
    sections: [{ when: 'End of turn', tiers: [{ text: `${name} scores.`, vp: 5 }] }],
    sourcePath: `/primary/${deck}/${name}`,
    asset: null,
  };
}

const cards: MissionCards = {
  primary: [
    primary('Alpha', 'take-and-hold', 'disruption'),
    primary('Bravo', 'take-and-hold', 'reconnaissance'),
    primary('Charlie', 'take-and-hold', 'priority-assets'),
    primary('Delta', 'take-and-hold', 'purge-the-foe'),
    primary('Echo', 'take-and-hold', 'take-and-hold'),
    primary('Foxtrot', 'disruption', 'take-and-hold'),
  ],
  secondary: [{
    name: 'Cleanse',
    sections: [{ when: 'End of turn', trigger: 'Control an objective.', rows: [{ text: 'Score.', vp: 5 }] }],
    sourcePath: '/secondary/cleanse',
    asset: null,
  }],
  layouts: [{
    sourcePath: '/11th/layouts/take-and-hold/disruption',
    layouts: [{ number: 1, name: 'Layout 1', image: '/assets/11th/layout.png', measurementsImage: '/assets/11th/layout-measured.png' }],
  }],
  forceDispositions: [],
  matrix: null,
};

describe('mission quiz', () => {
  it('limits a disposition filter to its primary-mission deck', () => {
    const question = createMissionQuizQuestion(cards, 'take-and-hold', () => 0);

    expect(question).toMatchObject({ format: 'primary-composition', target: { deck: 'take-and-hold' } });
    expect(question?.options).toHaveLength(4);
  });

  it('keeps the answer and its distractors in the same primary deck', () => {
    const question = createMissionQuizQuestion(cards, 'take-and-hold', () => 0.34);

    expect(question?.format).toBe('primary-rules');
    if (!question || question.format !== 'primary-rules') return;
    expect(question.options.every((option) => option.deck === question.target.deck)).toBe(true);
    expect(question.options.some((option) => option.sourcePath === question.correctOptionId)).toBe(true);
  });

  it('uses the dedicated secondary recognition format', () => {
    const question = createMissionQuizQuestion(cards, 'secondary', () => 0);

    expect(question).toMatchObject({ format: 'secondary-recognition', correctOptionId: '/secondary/cleanse' });
  });

  it('restores the matching layouts for a primary matchup', () => {
    expect(matchingLayouts(cards, cards.primary[0])).toHaveLength(1);
    expect(missionQuizFilters(cards)).toEqual([
      { value: 'disruption', label: 'Disruption' },
      { value: 'take-and-hold', label: 'Take And Hold' },
    ]);
  });

  it('schedules missed cards five rounds later', () => {
    expect(nextMissionQuizRetryRound(7)).toBe(12);
  });
});
