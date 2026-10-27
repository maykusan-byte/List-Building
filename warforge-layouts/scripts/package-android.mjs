import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { run, checksum } from "./native-utils.mjs";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
await access("private-signing/release.properties").catch(() => {
  throw new Error(
    "Signature absente : exécuter pnpm android:signing une seule fois.",
  );
});
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (process.env.LOCALAPPDATA &&
    join(process.env.LOCALAPPDATA, "Android", "Sdk"));
if (!sdk) throw new Error("Définir ANDROID_HOME vers le SDK Android.");
await access(sdk);
await writeFile(
  "android/local.properties",
  `sdk.dir=${sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:")}\n`,
);
if (process.platform === "win32")
  await run("cmd.exe", [
    "/d",
    "/c",
    "android\\gradlew.bat",
    "-p",
    "android",
    "assembleRelease",
  ]);
else await run("./android/gradlew", ["-p", "android", "assembleRelease"]);
const output = resolve("release"),
  name = `Warforge Layouts ${version}.apk`;
await mkdir(output, { recursive: true });
await copyFile(
  "android/app/build/outputs/apk/release/app-release.apk",
  join(output, name),
);
await checksum(join(output, name));
