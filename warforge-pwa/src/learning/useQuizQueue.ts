import { useState, useMemo, useRef, useEffect } from 'react';

export function useQuizQueue<T>(
  pool: T[],
  getId: (item: T) => string
) {
  const [turn, setTurn] = useState(0);
  const [failedSchedule, setFailedSchedule] = useState<{turn: number, id: string}[]>([]);
  
  // To avoid useMemo running and picking a new random item on every render when other state changes,
  // we must store the current random pick in state.
  const [randomId, setRandomId] = useState<string | null>(null);

  // We only want to pick a new random ID when the turn changes or the pool changes significantly.
  // We can use a ref to track the last values that we generated a random ID for.
  const lastPoolRef = useRef<T[]>(pool);
  const lastTurnRef = useRef<number>(turn);

  // Synchronously compute the new random ID during render if inputs changed, 
  // to avoid flicker/useEffect delays. This is a common pattern for derived state.
  let currentRandomId = randomId;
  if (pool !== lastPoolRef.current || turn !== lastTurnRef.current) {
    if (pool.length > 0) {
      currentRandomId = getId(pool[Math.floor(Math.random() * pool.length)]);
    } else {
      currentRandomId = null;
    }
    setRandomId(currentRandomId); // will schedule a re-render, but React handles it in the same pass
    lastPoolRef.current = pool;
    lastTurnRef.current = turn;
  }

  const currentItem = useMemo(() => {
    if (pool.length === 0) return null;
    
    // Check if there's a scheduled item for this turn that still exists in the pool
    const scheduled = failedSchedule.find(s => s.turn === turn);
    if (scheduled) {
      const found = pool.find(i => getId(i) === scheduled.id);
      if (found) return found;
    }
    
    // Otherwise use the randomId
    if (currentRandomId) {
       const found = pool.find(i => getId(i) === currentRandomId);
       if (found) return found;
    }
    
    return pool[Math.floor(Math.random() * pool.length)];
  }, [pool, turn, failedSchedule, currentRandomId, getId]);

  const advance = (isCorrect: boolean) => {
    if (!isCorrect && currentItem) {
      // Schedule this item to appear 5 turns from now
      setFailedSchedule(prev => {
        // Remove any existing schedules for this id to avoid duplicates
        const filtered = prev.filter(s => s.id !== getId(currentItem));
        return [...filtered, { turn: turn + 5, id: getId(currentItem) }];
      });
    }
    setTurn(prev => prev + 1);
  };

  return { currentItem, advance };
}
