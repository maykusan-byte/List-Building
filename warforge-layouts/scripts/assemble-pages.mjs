import { cpSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const pwa = resolve(repo, "warforge-pwa/dist");
const layouts = resolve(repo, "warforge-layouts/dist");
if (
  !existsSync(resolve(pwa, "index.html")) ||
  !existsSync(resolve(layouts, "index.html"))
)
  throw new Error("Build both applications before assembling Pages.");
if (
  !readFileSync(resolve(layouts, "index.html"), "utf8").includes(
    "/List-Building/layouts/assets/",
  )
)
  throw new Error("Layouts must be built with build:pages.");
if (existsSync(resolve(pwa, "layouts")))
  throw new Error(
    "Rebuild the PWA to get a fresh Pages artifact before assembling.",
  );
cpSync(layouts, resolve(pwa, "layouts"), { recursive: true });
console.log(
  "Pages artifact: PWA at /List-Building/; layouts at /List-Building/layouts/.",
);
