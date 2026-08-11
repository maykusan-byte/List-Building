import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import sourcePayload from '../../../data/strategy/knowledge-base.json';
import { strategyKnowledge } from '../../domain/strategy-knowledge';
import { SecondaryStrategyLibrary, SecondaryStrategyPanel } from './MissionLibrary';

describe('secondary mission strategy projections', () => {
  it('renders a reviewed guide and the French canonical fallback in English', () => {
    const knowledge = strategyKnowledge(sourcePayload);
    expect(knowledge).not.toBeNull();
    const html = renderToStaticMarkup(<SecondaryStrategyPanel scenarioId="gdm-2026-secondary-cleanse" knowledge={knowledge!} locale="en" />);

    expect(html).toContain('Detailed tactical analysis (FR)');
    expect(html).toContain('Contenu canonique français');
    expect(html).toContain('action-capacity');
    expect(html).toContain('Exemple décisionnel');
  });

  it('hides a draft guide', () => {
    const draftPayload = JSON.parse(JSON.stringify(sourcePayload));
    draftPayload.secondaryMissionGuides.find((guide: { scenarioId: string }) => guide.scenarioId === 'gdm-2026-secondary-cleanse').status = 'draft';
    const knowledge = strategyKnowledge(draftPayload);
    expect(knowledge).not.toBeNull();

    expect(renderToStaticMarkup(<SecondaryStrategyPanel scenarioId="gdm-2026-secondary-cleanse" knowledge={knowledge!} locale="fr" />)).toBe('');
  });

  it('groups the reviewed knowledge by the four canonical families', () => {
    const knowledge = strategyKnowledge(sourcePayload);
    const html = renderToStaticMarkup(<SecondaryStrategyLibrary strategy={knowledge} locale="fr" />);

    expect(html).toContain('Destruction ciblée');
    expect(html).toContain('Contrôle d’objectifs');
    expect(html).toContain('Projection territoriale');
    expect(html).toContain('Actions et opérations');
    expect(html).toContain('Gestion du portefeuille actif');
  });
});
