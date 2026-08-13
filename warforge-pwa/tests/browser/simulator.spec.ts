import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });

async function dismissProjectStatus(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await dialog.getByRole('button').click();
}

test('closed M3 duel rejects, shoots, exports, imports, replays and resumes IndexedDB exactly', async ({ page }) => {
  await page.goto('/#simulator');
  await dismissProjectStatus(page);
  await expect(page.getByRole('heading', { name: /Duel fermé d’entraînement/ })).toBeVisible();
  await expect(page.getByTestId('duel-placement')).toBeVisible();

  await page.getByTestId('duel-illegal-move').click();
  await expect(page.getByTestId('duel-notice')).toContainText('movement-too-far');
  await expect(page.getByTestId('duel-event-count')).toHaveText('3');
  await page.getByRole('button', { name: /Mouvement légal rouge/ }).click();
  await page.getByRole('button', { name: 'Passer au tir' }).click();
  await page.getByRole('button', { name: 'Cibler bleu' }).click();
  await page.getByRole('button', { name: 'Résoudre le tir' }).click();
  await expect(page.getByTestId('duel-losses')).toContainText('blue-1');

  const expectedEvents = await page.getByTestId('duel-event-count').innerText();
  const expectedPrng = await page.getByTestId('duel-prng').innerText();
  const expectedLosses = await page.getByTestId('duel-losses').innerText();
  await page.getByRole('button', { name: 'Sauvegarder / exporter V2' }).click();
  const exported = JSON.parse(await page.getByTestId('duel-export-json').inputValue());
  expect(exported.schemaVersion).toBe('warforge-simulation-save/v2');
  expect(exported.environment.scenarioId).toBe('closed-core-shooting-duel-v1');
  expect(exported.environment.shootingEnvironmentFingerprint).toMatch(/^shooting-env-fnv1a32:/);
  expect(exported.environment.manifestFingerprint).toContain('closed-core-shooting-duel-v1');

  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(page.getByTestId('duel-event-count')).toHaveText('3');
  await page.getByRole('button', { name: 'Reprendre IndexedDB' }).click();
  await expect(page.getByTestId('duel-notice')).toContainText('Reprise IndexedDB exacte');
  await expect(page.getByTestId('duel-event-count')).toHaveText(expectedEvents);
  await expect(page.getByTestId('duel-prng')).toHaveText(expectedPrng);
  await expect(page.getByTestId('duel-losses')).toHaveText(expectedLosses);

  await page.getByRole('button', { name: 'Rejouer le journal' }).click();
  await expect(page.getByTestId('duel-notice')).toContainText('Replay exact');
  await expect(page.getByTestId('duel-event-count')).toHaveText(expectedEvents);
  await expect(page.getByTestId('duel-prng')).toHaveText(expectedPrng);

  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await page.getByRole('button', { name: 'Importer l’export V2' }).click();
  await expect(page.getByTestId('duel-notice')).toContainText('Export V2 importé');
  await expect(page.getByTestId('duel-event-count')).toHaveText(expectedEvents);
  await expect(page.getByTestId('duel-losses')).toHaveText(expectedLosses);
});

test('keeps the M2 laboratory available as a separate mode', async ({ page }) => {
  await page.goto('/#simulator');
  await dismissProjectStatus(page);
  await page.getByRole('button', { name: 'Laboratoire M2' }).click();
  await expect(page.getByRole('heading', { name: /Laboratoire de géométrie tactique/ })).toBeVisible();
  await expect(page.getByTestId('simulator-board').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('simulator-los-verdict')).toContainText(/Bloquée par/);
});
