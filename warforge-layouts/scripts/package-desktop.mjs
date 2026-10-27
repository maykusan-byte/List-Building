import {
  cp,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { run, checksum } from "./native-utils.mjs";
import { smokeDesktop } from "./smoke-desktop.mjs";

const root = process.cwd(),
  output = resolve("release");
const staging = await mkdtemp(join(tmpdir(), "warforge-layouts-desktop-"));
try {
  const project = join(staging, "project"),
    built = join(staging, "output");
  await mkdir(project);
  for (const directory of ["dist", "electron", "build"])
    await cp(resolve(root, directory), join(project, directory), {
      recursive: true,
    });
  const { dependencies, devDependencies, scripts, ...packaged } = JSON.parse(
    await readFile("package.json", "utf8"),
  );
  // Vite already bundles the runtime dependencies; ship only the public snapshot.
  await writeFile(join(project, "package.json"), JSON.stringify(packaged));
  await run(
    process.execPath,
    [
      resolve("node_modules/electron-builder/cli.js"),
      "--projectDir",
      project,
      "--win",
      "nsis",
      `--config.electronVersion=${devDependencies.electron}`,
      `--config.directories.output=${built}`,
    ],
  );
  await smokeDesktop(join(built, "win-unpacked", "Warforge Layouts.exe"));
  const name = (await readdir(built)).find(
    (name) =>
      name.startsWith("Warforge Layouts Setup ") && name.endsWith(".exe"),
  );
  if (!name) throw new Error("Installeur Windows absent.");
  await mkdir(output, { recursive: true });
  await copyFile(join(built, name), join(output, name));
  await checksum(join(output, name));
} finally {
  const child = relative(resolve(tmpdir()), resolve(staging));
  if (
    child.startsWith("warforge-layouts-desktop-") &&
    !child.startsWith("..") &&
    !isAbsolute(child)
  )
    await rm(staging, { recursive: true, force: true });
}
