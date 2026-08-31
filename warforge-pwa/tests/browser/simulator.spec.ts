import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });

async function dismissProjectStatus(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) await dialog.getByRole('button').click();
}

test('interactive M10 board previews, rejects and confirms an authoritative deployment', async ({ page }) => {
  await page.goto('/#simulator');
  await dismissProjectStatus(page);
  await expect(page.getByRole('heading', { name: 'Déploiement tactique fixture-only' })).toBeVisible();
  await expect(page.getByTestId('interactive-poc-board').locator('canvas')).toBeVisible();
  await expect(page.getByTestId('interactive-deployed-count')).toHaveText('0/6');
  await expect(page.getByTestId('interactive-limitations')).toContainText('core-stratagem.overwatch');

  await page.getByLabel('Objectif').selectOption('objective-centre-1');
  await expect(page.getByTestId('interactive-selection')).toContainText('objective-centre-1');
  await page.getByLabel('Terrain').selectOption('terrain-centre-large');
  await expect(page.getByTestId('interactive-selection')).toContainText('terrain-centre-large');

  const firstDeployment = page.locator('[data-testid^="interactive-deploy-"]').first();
  const deployedBefore = await page.getByTestId('interactive-deployed-count').innerText();
  await firstDeployment.click();
  await expect(page.getByTestId('interactive-preview')).toContainText('autorisée');
  await page.getByTestId('interactive-preview-outside').click();
  await expect(page.getByTestId('interactive-preview')).toContainText(/deployment-outside-(board|zone)/);
  await page.getByTestId('interactive-confirm-deployment').click();
  await expect(page.getByTestId('interactive-notice')).toContainText('Refus explicite');
  await expect(page.getByTestId('interactive-deployed-count')).toHaveText(deployedBefore);

  await firstDeployment.click();
  await expect(page.getByTestId('interactive-preview')).toContainText('autorisée');
  await page.getByTestId('interactive-confirm-deployment').click();
  await expect(page.getByTestId('interactive-notice')).toContainText('unit-deployed');
  await expect(page.getByTestId('interactive-deployed-count')).toHaveText('1/6');
});

test('interactive M10 reaches Movement normally then previews and confirms a replayable unit movement', async ({ page }) => {
  await page.goto('/#simulator');
  await dismissProjectStatus(page);

  for (let index = 0; index < 6; index += 1) {
    await page.locator('[data-testid^="interactive-deploy-"]').first().click();
    await expect(page.getByTestId('interactive-preview')).toContainText('autorisée');
    await page.getByTestId('interactive-confirm-deployment').click();
    await expect(page.getByTestId('interactive-notice')).toContainText('unit-deployed');
  }
  await expect(page.getByTestId('interactive-deployed-count')).toHaveText('6/6');
  await page.getByTestId('interactive-determine-first-player').click();
  await page.getByTestId('interactive-start-battle').click();
  await expect(page.getByTestId('interactive-phase')).toContainText('command');
  for (let index = 0; index < 6; index += 1) {
    const commandStage = page.getByTestId('interactive-resolve-command-stage');
    if (await commandStage.count() === 0) break;
    await commandStage.click();
  }
  await page.getByTestId('interactive-resolve-mission-scoring').click();
  await page.getByTestId('interactive-advance-battle-phase').click();
  await expect(page.getByTestId('interactive-phase')).toContainText('movement');

  const eventsBeforeReject = await page.getByTestId('interactive-event-count').innerText();
  const movement = page.locator('[data-testid^="interactive-move-"]').first();
  const selectedMovementTestId = await movement.getAttribute('data-testid');
  await movement.click();
  await expect(page.getByTestId('interactive-movement-type')).toHaveValue('normal');
  await page.getByTestId('interactive-preview-outside').click();
  await expect(page.getByTestId('interactive-preview')).toContainText('movement-too-far');
  await page.getByTestId('interactive-confirm-deployment').click();
  await expect(page.getByTestId('interactive-notice')).toContainText('movement-too-far');
  await expect(page.getByTestId('interactive-event-count')).toHaveText(eventsBeforeReject);

  await movement.click();
  await page.getByRole('button', { name: '→ 1″' }).click();
  await expect(page.getByTestId('interactive-preview')).toContainText('maximum');
  await page.getByTestId('interactive-confirm-deployment').click();
  await expect(page.getByTestId('interactive-notice')).toContainText('unit-movement-resolved');
  await expect(page.getByTestId(selectedMovementTestId!)).toHaveCount(0);
});

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
  await page.getByRole('button', { name: 'POC technique M9' }).click();
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
