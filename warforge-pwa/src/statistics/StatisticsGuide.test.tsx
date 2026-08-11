import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { STATISTICS_GUIDE_ENTRIES, StatisticsGuide } from './StatisticsGuide';
import { STATISTICS_METRIC_DEFINITIONS } from '../domain/statistics';

describe('statistics guide', () => {
  it('documents every public statistical concept with calculation and limitations', () => {
    expect(STATISTICS_GUIDE_ENTRIES.length).toBeGreaterThanOrEqual(10);
    STATISTICS_GUIDE_ENTRIES.forEach((entry) => {
      expect(entry.short).toBeTruthy();
      expect(entry.question).toBeTruthy();
      expect(entry.formula).toBeTruthy();
      expect(entry.example).toBeTruthy();
      expect(entry.warning).toBeTruthy();
    });
    const documented = new Set(STATISTICS_GUIDE_ENTRIES.map((entry) => entry.id));
    Object.keys(STATISTICS_METRIC_DEFINITIONS).forEach((metric) => expect(documented.has(metric)).toBe(true));
  });

  it('renders methodology, live example and explicit limitations', () => {
    window.location.hash = '#statistics/guide/quick-read';
    const html = renderToStaticMarkup(<StatisticsGuide />);
    expect(html).toContain('Lire une fiche en deux minutes');
    expect(html).toContain('D6 a une moyenne de');
    expect(html).toContain('Ce que Warforge ne sait pas');
    expect(html).toContain('n’est ni une promesse');
  });
});
