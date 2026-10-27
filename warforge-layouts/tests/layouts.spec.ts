import { expect, test } from "@playwright/test";
test("selects terrain, changes all corners, rotates and restores a shared view", async ({
  page,
}) => {
  await page.goto("/#rotation=0");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Prendre et tenir",
  );
  await page
    .getByRole("button", { name: "Décor 1 : Grande empreinte", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("complementary", { name: "Fiche du décor 1" }),
  ).toBeVisible();
  await expect(page.locator(".coordinates tbody tr")).toHaveCount(4);
  for (const corner of [
    "haut gauche",
    "haut droit",
    "bas gauche",
    "bas droit",
  ]) {
    await page
      .getByRole("button", { name: `Coin ${corner}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Coin ${corner}`, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  }
  await page
    .getByRole("button", { name: "Tourner la table de 90 degrés" })
    .click();
  await expect(page).toHaveURL(/rotation=90/);
  await page.getByRole("button", { name: "Toutes", exact: true }).click();
  await expect(page.locator(".all-measures tbody tr")).toHaveCount(16);
  const url = page.url();
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Fiche du décor 1" }),
  ).toBeVisible();
  expect(page.url()).toBe(url);
  await page.getByRole("button", { name: "Partager" }).click();
  await expect(
    page.getByRole("textbox", { name: "Lien de partage" }),
  ).toHaveValue(
    `https://maykusan-byte.github.io/List-Building/layouts/${new URL(url).hash}`,
  );
  await page.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.getByRole("button", { name: "Sans", exact: true }).click();
  await expect(page.locator(".dimension")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Grille 1″" }).uncheck();
  await expect(page.locator(".major-grid")).toHaveCount(0);
});
test("gallery filters, opens all variants and shows the original measured card", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Les 45 layouts/ }).click();
  await expect(page.locator(".layout-card")).toHaveCount(45);
  await page
    .getByRole("textbox", { name: "Rechercher un layout" })
    .fill("disruption-mirror");
  await expect(page.locator(".layout-card")).toHaveCount(3);
  await page.locator(".layout-card").nth(2).click();
  await expect(page).toHaveURL(/disruption-mirror-3-portrait/);
  await expect(page.locator(".board .terrain")).toHaveCount(16);
  await page.getByRole("button", { name: "Carte cotée ↗" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".source-scroll img")).toBeVisible();
  expect(
    await page
      .locator(".source-scroll img")
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(1000);
  await page.getByRole("button", { name: "Agrandir les cotes" }).click();
  await expect(page.locator(".source-scroll")).toHaveClass(/zoomed/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("reports load failure and retries without showing stale terrain", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/data/layouts/*.json", (route) =>
    fail ? route.abort() : route.continue(),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".board")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.locator(".board .terrain")).toHaveCount(16);
});
test("selects by pointer, pans and zooms without moving a physical anchor", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".terrain")).toHaveCount(16);
  await page.locator(".terrain").first().locator(".terrain-number").click();
  await expect(page.locator(".details-heading")).toContainText("Décor 01");
  const before = await page.locator(".coordinates").innerText();
  const view = await page.locator(".board").getAttribute("viewBox");
  await page.getByRole("button", { name: "Zoom avant" }).click();
  expect(await page.locator(".board").getAttribute("viewBox")).not.toBe(view);
  expect(await page.locator(".coordinates").innerText()).toBe(before);
  await page.getByRole("button", { name: "Recentrer la table" }).click();
  await expect(page.locator(".board")).toHaveAttribute("viewBox", view!);
  const box = await page.locator(".board").boundingBox();
  await page.mouse.move(box!.x + box!.width * 0.5, box!.y + 15);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width * 0.5 + 50, box!.y + 45, {
    steps: 8,
  });
  await page.mouse.up();
  expect(await page.locator(".board").getAttribute("viewBox")).not.toBe(view);
  expect(await page.locator(".coordinates").innerText()).toBe(before);
});
test("mobile supports two-finger zoom and the full measurements list", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4182/");
  await expect(page.locator(".terrain")).toHaveCount(16);
  const before = await page.locator(".board").getAttribute("viewBox");
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: 130, y: 500, id: 0 },
      { x: 240, y: 500, id: 1 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { x: 90, y: 500, id: 0 },
      { x: 280, y: 500, id: 1 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () =>
      Number(
        (await page.locator(".board").getAttribute("viewBox"))!.split(" ")[2],
      ),
    )
    .toBeLessThan(Number(before!.split(" ")[2]));
  await page.getByRole("button", { name: "Toutes", exact: true }).click();
  await expect(page.locator(".all-measures tbody tr")).toHaveCount(16);
  await expect(page.locator(".all-measures")).toBeVisible();
  await context.close();
});
for (const [width, height] of [
  [390, 844],
  [844, 390],
  [1024, 768],
  [1440, 1000],
])
  test(`usable viewport ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".terrain")).toHaveCount(16);
    await page.locator(".terrain").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".coordinates")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/layout-${width}x${height}.png`,
      fullPage: true,
    });
  });
