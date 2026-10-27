import { access, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, join } from "node:path";
import { run } from "./native-utils.mjs";

const directory = resolve("private-signing");
await mkdir(directory, { recursive: true });
const key = join(directory, "warforge-layouts.jks"),
  properties = join(directory, "release.properties");
for (const file of [key, properties]) {
  if (
    await access(file).then(
      () => true,
      () => false,
    )
  )
    throw new Error(
      "Signature déjà présente : la conserver pour les mises à jour.",
    );
}
const password = randomBytes(32).toString("hex");
const keytool = process.env.JAVA_HOME
  ? join(
      process.env.JAVA_HOME,
      "bin",
      process.platform === "win32" ? "keytool.exe" : "keytool",
    )
  : "keytool";
await run(
  keytool,
  [
    "-genkeypair",
    "-keystore",
    key,
    "-storetype",
    "PKCS12",
    "-alias",
    "warforge-layouts",
    "-storepass:env",
    "WARFORGE_LAYOUTS_KEY_PASSWORD",
    "-keypass:env",
    "WARFORGE_LAYOUTS_KEY_PASSWORD",
    "-keyalg",
    "RSA",
    "-keysize",
    "3072",
    "-validity",
    "10000",
    "-dname",
    "CN=Warforge Layouts, O=Warforge, C=FR",
  ],
  { env: { ...process.env, WARFORGE_LAYOUTS_KEY_PASSWORD: password } },
);
await writeFile(
  properties,
  `storePassword=${password}\nkeyPassword=${password}\nkeyAlias=warforge-layouts\n`,
  { mode: 0o600 },
);
console.log(
  "Clé créée dans private-signing/. Conserver ce dossier local pour signer les mises à jour.",
);
