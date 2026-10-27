import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";

export async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      windowsHide: true,
      ...options,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command}: code ${code}`)),
    );
  });
}

export async function checksum(file) {
  const sha256 = createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
  await writeFile(`${file}.sha256`, `${sha256}  ${basename(file)}\n`);
  console.log(`Prêt : ${file}\nSHA-256 : ${sha256}`);
}
