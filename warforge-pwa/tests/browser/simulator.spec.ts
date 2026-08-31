import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });

async function dismissProjectStatus(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await dialog.getByRole('button').click();
}

test('real M4 pilot binds the authoritative runtime, moves, shoots, saves and resumes', async ({ page }) => {
  await page.goto('/#simulator');
  await dismissProjectStatus(page);
  await page.getByRole('button', { name: 'Duel réel M4' }).click();
  await expect(page.getByRole('heading', { name: /Duel réel Salamanders/ })).toBeVisible();
  await expect(page.getByTestId('m4-compatibility')).toContainText('Session compatible');
  await expect(page.getByTestId('m4-phase')).toHaveText('command');
  const targets = page.locator('.m4-targets');
  await expect(targets.getByRole('button', { name: /Blood Angels · Assault Intercessors · Heavy bolt pistol/ })).toBeVisible();
  await expect(targets.getByRole('button', { name: /Blood Angels · Captain · Heavy bolt pistol/ })).toBeVisible();
  await expect(page.getByTestId('m4-enter-movement')).toBeDisabled();

  await page.getByTestId('m4-set-oath').click();
  await expect(page.getByTestId('m4-notice')).toContainText('Oath of Moment');
  await expect(page.getByTestId('m4-enter-movement')).toBeEnabled();
  await page.getByTestId('m4-enter-movement').click();
  await expect(page.getByTestId('m4-phase')).toHaveText('movement');
  const beforeIllegal = await page.getByTestId('m4-event-count').innerText();
  await page.getByTestId('m4-illegal-move').click();
  await expect(page.getByTestId('m4-notice')).toContainText('movement-too-far');
  await expect(page.getByTestId('m4-event-count')).toHaveText(beforeIllegal);
  await page.getByTestId('m4-advance').click();
  await expect(page.getByTestId('m4-notice')).toContainText('Mouvement normal M4 accepté');
  await expect(page.locator('.m4-model.active')).toContainText('mouvement effectué');
  await expect(page.getByTestId('m4-advance')).toBeDisabled();
  await page.getByTestId('m4-enter-shooting').click();
  await page.getByTestId('m4-next-round').click();
  await expect(page.getByTestId('m4-phase')).toHaveText('command');
  await page.getByTestId('m4-set-oath').click();
  await page.getByTestId('m4-enter-movement').click();
  await page.getByTestId('m4-advance').click();
  await page.getByTestId('m4-enter-shooting').click();
  await page.getByTestId('m4-resolve-shooting').click();
  await expect(page.getByTestId('m4-notice')).toContainText('Tir M4 résolu');
  await expect(page.getByTestId('m4-resolution')).toContainText(/Portée et LoS/);
  await expect(page.getByTestId('m4-resolve-shooting')).toBeDisabled();

  const expectedEvents = await page.getByTestId('m4-event-count').innerText();
  const expectedPrng = await page.getByTestId('m4-prng').innerText();
  await page.getByRole('button', { name: 'Sauvegarder / exporter V2' }).click();
  const exported = JSON.parse(await page.getByTestId('m4-export-json').inputValue());
  expect(exported.schemaVersion).toBe('warforge-simulation-save/v2');
  expect(exported.environment.scenarioId).toBe('real-roster-shooting-duel-v1');
  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await page.getByRole('button', { name: 'Reprendre IndexedDB' }).click();
  await expect(page.getByTestId('m4-notice')).toContainText('Reprise IndexedDB exacte');
  await expect(page.getByTestId('m4-event-count')).toHaveText(expectedEvents);
  await expect(page.getByTestId('m4-prng')).toHaveText(expectedPrng);
  await page.getByRole('button', { name: 'Rejouer le journal' }).click();
  await expect(page.getByTestId('m4-notice')).toContainText('Replay exact');
});

test('economic M9 technical POC completes five rounds and restores its V6 journal', async ({ page }) => {
  await page.goto('/#simulator');
  await dismissProjectStatus(page);
  await expect(page.getByRole('heading', { name: 'POC technique — cinq rounds' })).toBeVisible();
  await expect(page.getByTestId('poc-compatibility')).toContainText('fixture-only');
  await expect(page.getByTestId('poc-limitations')).toContainText('core-stratagem.command-reroll');
  await expect(page.getByTestId('poc-limitations')).toContainText('core-stratagem.heroic-intervention');
  await expect(page.getByTestId('poc-phase')).toContainText('Déploiement');

  const initialEvents = await page.getByTestId('poc-event-count').innerText();
  await page.getByTestId('poc-step').click();
  await expect(page.getByTestId('poc-event-count')).not.toHaveText(initialEvents);
  await expect(page.getByTestId('poc-notice')).toContainText('unit-deployed');

  await page.getByTestId('poc-finish').click();
  await expect(page.getByTestId('poc-phase')).toHaveText('Terminée');
  await expect(page.getByTestId('poc-final-result')).toBeVisible();
  const expectedEvents = await page.getByTestId('poc-event-count').innerText();
  const expectedPrng = await page.getByTestId('poc-prng').innerText();

  await page.getByRole('button', { name: 'Sauvegarder / exporter V6' }).click();
  await expect(page.getByTestId('poc-notice')).toContainText('Sauvegarde V6');
  const exported = JSON.parse(await page.getByTestId('poc-export-json').inputValue());
  expect(exported.schemaVersion).toBe('warforge-simulation-save/v6');
  expect(exported.environment.scenarioId).toBe('closed-complete-game-disruption-v1');

  await page.getByRole('button', { name: 'Réinitialiser' }).click();
  await page.getByRole('button', { name: 'Reprendre IndexedDB' }).click();
  await expect(page.getByTestId('poc-notice')).toContainText('Reprise IndexedDB exacte');
  await expect(page.getByTestId('poc-event-count')).toHaveText(expectedEvents);
  await expect(page.getByTestId('poc-prng')).toHaveText(expectedPrng);
  await page.getByRole('button', { name: 'Rejouer le journal V6' }).click();
  await expect(page.getByTestId('poc-notice')).toContainText('Replay exact');
});

test('closed M3 duel rejects, shoots, exports, imports, replays and resumes IndexedDB exactly', async ({ page }) => {
  await page.goto('/#simulator');
  await dismissProjectStatus(page);
  await page.getByRole('button', { name: 'Duel fermé M3' }).click();
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
