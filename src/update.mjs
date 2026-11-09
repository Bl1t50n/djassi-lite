import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BRAND } from "./brand.mjs";

const DAY = 24 * 60 * 60 * 1000;
const configDir = () => process.env.DJASSI_CONFIG_DIR || join(homedir(), ".djassi");
const cacheFile = () => join(configDir(), "update.json");

// "0.10.0" é mais novo que "0.9.0". Ignora sufixos como -rc.2.
export function isNewer(latest, current) {
  const parts = (v) => String(v).split("-")[0].split(".").map((n) => Number.parseInt(n, 10) || 0);
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Consulta a versão publicada no máximo uma vez por dia. Sem rede devolve null e nunca falha.
export async function latestVersion({ force = false } = {}) {
  if (!force && process.env.DJASSI_SKIP_UPDATE === "1") return null;
  try {
    const cached = JSON.parse(readFileSync(cacheFile(), "utf8"));
    if (!force && Date.now() - cached.checkedAt < DAY) return cached.version;
  } catch {
    // sem cache: consulta a rede
  }
  try {
    const url = `https://raw.githubusercontent.com/${BRAND.repo}/main/package.json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const { version } = await res.json();
    mkdirSync(configDir(), { recursive: true });
    writeFileSync(cacheFile(), JSON.stringify({ checkedAt: Date.now(), version }));
    return version;
  } catch {
    return null;
  }
}
