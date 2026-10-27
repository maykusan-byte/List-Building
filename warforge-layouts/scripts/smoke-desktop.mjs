import { _electron, expect } from "@playwright/test";

export async function smokeDesktop(executablePath) {
  const app = await _electron.launch({
    executablePath,
    env: { ...process.env, WARFORGE_LAYOUTS_SMOKE: "1" },
  });
  const errors = [];
  try {
    const page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(
      page.getByRole("button", { name: "Les 45 layouts" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Les 45 layouts" }).click();
    await expect(page.locator(".layout-card")).toHaveCount(45);
    await page.locator(".layout-card").last().click();
    await expect(page.locator(".board .terrain")).toHaveCount(16);
    await page.getByRole("button", { name: "Partager" }).click();
    await expect(
      page.getByRole("textbox", { name: "Lien de partage" }),
    ).toHaveValue(
      /^https:\/\/maykusan-byte\.github\.io\/List-Building\/layouts\/#/,
    );
    await page.getByRole("button", { name: "Fermer", exact: true }).click();
    await page.reload();
    await expect(page.locator(".board .terrain")).toHaveCount(16);
    // Read every embedded layout, including the integrity manifest, from the packaged protocol.
    const count = await page.evaluate(async () => {
      const manifest = await fetch("/data/manifest.json").then((response) =>
        response.json(),
      );
      for (const layout of manifest.layouts) {
        const response = await fetch(`/${layout.data}`);
        if (!response.ok || (await response.json()).terrain.length !== 16)
          throw new Error(layout.id);
      }
      return manifest.layouts.length;
    });
    expect(count).toBe(45);
    expect(errors).toEqual([]);
    console.log(
      "Windows empaqueté : 45 layouts hors connexion, galerie, partage et rechargement validés.",
    );
  } finally {
    await app.close();
  }
}
