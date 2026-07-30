import { normalizeDatabase } from './domain/normalize';

self.onmessage = (event: MessageEvent<{ raw: string }>) => {
  try {
    self.postMessage({ ok: true, database: normalizeDatabase(event.data.raw) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Erreur de lecture inconnue.' });
  }
};
