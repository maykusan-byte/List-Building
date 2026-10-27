import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../warforge-pwa/dist",
);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/List-Building/")) {
      res.writeHead(404);
      res.end();
      return;
    }
    let target = resolve(
      root,
      decodeURIComponent(url.pathname.slice("/List-Building/".length)),
    );
    if (relative(root, target).startsWith(".." + sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    if ((await stat(target)).isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        res.writeHead(301, { location: url.pathname + "/" });
        res.end();
        return;
      }
      target = resolve(target, "index.html");
    }
    res.writeHead(200, {
      "content-type": types[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(await readFile(target));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/List-Building/`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const worker = await page.evaluate(
    () => navigator.serviceWorker.controller.scriptURL,
  );
  assert(worker.endsWith("/List-Building/sw.js"));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    base +
      "layouts/#layout=disruption-mirror-1&rotation=90&corner=br&terrain=large-rectangle-01",
    { waitUntil: "networkidle" },
  );
  await page
    .getByRole("heading", { name: "Perturbation × Perturbation", exact: true })
    .waitFor();
  assert.equal(await page.locator(".terrain").count(), 16);
  await page.getByRole("complementary", { name: "Fiche du décor 1" }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Perturbation × Perturbation", exact: true })
    .waitFor();
  assert.equal(await page.locator(".terrain").count(), 16);
  await page.goto(base + "layouts", { waitUntil: "networkidle" });
  assert(new URL(page.url()).pathname.endsWith("/layouts/"));
  await page.locator(".board").waitFor();
  const fresh = await browser.newContext();
  const direct = await fresh.newPage();
  await direct.goto(base + "layouts/", { waitUntil: "networkidle" });
  await direct.locator(".board").waitFor();
  assert.equal(await direct.locator(".terrain").count(), 16);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: direct Pages URL, trailing-slash redirect, shared view, reload, and navigation under the installed PWA service worker.",
  );
  await context.close();
  await fresh.close();
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
