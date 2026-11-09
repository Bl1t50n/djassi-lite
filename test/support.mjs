import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "djassi.mjs");

export function tempDir(prefix = "djassi-test-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

// Sem som e sem perfil real: cada chamada usa a sua pasta de configuração.
export function djassi(args, { cwd, env = {}, input } = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: cwd ?? tempDir(),
    encoding: "utf8",
    input,
    timeout: 90000,
    env: { ...process.env, DJASSI_NO_SOUND: "1", DJASSI_CONFIG_DIR: tempDir("djassi-cfg-"), ...env }
  });
}

// Projeto Node mínimo. Os scripts escrevem ran.json para provarmos que correram.
export function nodeProject({ lock } = {}) {
  const root = tempDir("djassi-node-");
  const scripts = { dev: "node marker.mjs", test: "node marker.mjs" };
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", private: true, scripts }));
  if (lock) writeFileSync(join(root, lock), "");
  writeFileSync(
    join(root, "marker.mjs"),
    "import { writeFileSync } from 'node:fs';\nwriteFileSync('ran.json', JSON.stringify(process.argv.slice(2)));\n"
  );
  return root;
}
