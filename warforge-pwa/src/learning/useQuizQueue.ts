import { useEffect, useRef, useState } from 'react';

export type QuizOutcome = 'correct' | 'incorrect' | 'skipped';

export function quizOutcome(isCorrect: boolean): QuizOutcome {
  return isCorrect ? 'correct' : 'incorrect';
}

export function shouldScheduleRetry(outcome: QuizOutcome): boolean {
  return outcome === 'incorrect';
}

interface ScheduledRetry {
  turn: number;
  id: string;
}

interface QuizQueueState {
  turn: number;
  currentId: string | null;
  failedSchedule: ScheduledRetry[];
}

function randomItemId<T>(pool: T[], getId: (item: T) => string, excludedId?: string | null): string | null {
  if (pool.length === 0) return null;
  const filtered = excludedId && pool.length > 1
    ? pool.filter((item) => getId(item) !== excludedId)
    : pool;
  const candidates = filtered.length > 0 ? filtered : pool;
  return getId(candidates[Math.floor(Math.random() * candidates.length)]);
}

export function useQuizQueue<T>(
  pool: T[],
  getId: (item: T) => string
) {
  const getIdRef = useRef(getId);
  getIdRef.current = getId;

  const [state, setState] = useState<QuizQueueState>(() => ({
    turn: 0,
    currentId: randomItemId(pool, getId),
    failedSchedule: []
  }));

  const currentItem = state.currentId
    ? pool.find((item) => getIdRef.current(item) === state.currentId) ?? null
    : null;

  useEffect(() => {
    const availableIds = new Set(pool.map((item) => getIdRef.current(item)));
    setState((current) => {
      const failedSchedule = current.failedSchedule.filter((entry) => availableIds.has(entry.id));
      const currentStillExists = current.currentId !== null && availableIds.has(current.currentId);
      const currentId = currentStillExists
        ? current.currentId
        : randomItemId(pool, getIdRef.current);

      if (currentId === current.currentId && failedSchedule.length === current.failedSchedule.length) return current;
      return { ...current, currentId, failedSchedule };
    });
  }, [pool]);

  const advance = (outcome: QuizOutcome) => {
    setState((current) => {
      const availableIds = new Set(pool.map((item) => getIdRef.current(item)));
      const activeId = current.currentId && availableIds.has(current.currentId)
        ? current.currentId
        : null;
      let failedSchedule = current.failedSchedule.filter((entry) => availableIds.has(entry.id));

      if (shouldScheduleRetry(outcome) && activeId) {
        failedSchedule = [
          ...failedSchedule.filter((entry) => entry.id !== activeId),
          { turn: current.turn + 5, id: activeId }
        ];
      }

      const turn = current.turn + 1;
      const scheduled = failedSchedule.find((entry) => entry.turn === turn);
      if (scheduled) failedSchedule = failedSchedule.filter((entry) => entry !== scheduled);

      return {
        turn,
        currentId: scheduled?.id ?? randomItemId(pool, getIdRef.current, activeId),
        failedSchedule
      };
    });
  };

  return { currentItem, advance };
}
