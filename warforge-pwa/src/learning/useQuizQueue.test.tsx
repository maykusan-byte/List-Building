import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quizOutcome, shouldScheduleRetry, useQuizQueue, type QuizOutcome } from './useQuizQueue';

function QueueHarness({ pool }: { pool: string[] }): React.JSX.Element {
  const [selectionCount, setSelectionCount] = useState(0);
  const { currentItem, advance } = useQuizQueue(pool, (item) => item);

  const next = (outcome: QuizOutcome) => advance(outcome);

  return <>
    <output data-current>{currentItem ?? 'none'}</output>
    <output data-selection>{selectionCount}</output>
    <button data-action="select" onClick={() => setSelectionCount((count) => count + 1)}>Select</button>
    <button data-action="correct" onClick={() => next('correct')}>Correct</button>
    <button data-action="incorrect" onClick={() => next('incorrect')}>Incorrect</button>
    <button data-action="skipped" onClick={() => next('skipped')}>Skip</button>
  </>;
}

describe('quiz queue', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const render = (pool = ['a', 'b', 'c', 'd', 'e', 'f']) => act(() => root.render(<QueueHarness pool={pool} />));
  const current = () => container.querySelector('[data-current]')?.textContent;
  const click = (action: string) => act(() => {
    (container.querySelector(`[data-action="${action}"]`) as HTMLButtonElement).click();
  });

  it('keeps the first question stable while an answer changes local UI state', () => {
    render();
    expect(current()).toBe('f');

    click('select');

    expect(current()).toBe('f');
    expect(container.querySelector('[data-selection]')?.textContent).toBe('1');
  });

  it.each(['correct', 'skipped'] as const)('does not schedule a %s question for retry', (outcome) => {
    render();
    click(outcome);
    click('skipped');
    click('skipped');
    click('skipped');
    click('skipped');

    expect(current()).toBe('e');
  });

  it('replays an incorrect question five turns later', () => {
    render();
    click('incorrect');
    click('skipped');
    click('skipped');
    click('skipped');
    click('skipped');

    expect(current()).toBe('f');
  });

  it('selects a valid replacement when the current pool changes', () => {
    render();
    expect(current()).toBe('f');

    render(['a', 'b']);

    expect(current()).toBe('b');
  });

  it('maps validation results and retries only failures', () => {
    expect(quizOutcome(true)).toBe('correct');
    expect(quizOutcome(false)).toBe('incorrect');
    expect(shouldScheduleRetry('correct')).toBe(false);
    expect(shouldScheduleRetry('skipped')).toBe(false);
    expect(shouldScheduleRetry('incorrect')).toBe(true);
  });
});
