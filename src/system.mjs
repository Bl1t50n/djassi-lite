import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { CliError } from "./errors.mjs";

// Processos do sistema: PID 0 (Idle) e 4 (System) nunca são mexidos.
const PROTECTED_PIDS = new Set([0, 4]);

// "system" = instalado na pasta do Windows; "app" = outro programa; "protected" = sem acesso ao caminho.
export function kindOf(path) {
  if (!path) return "protected";
  return /^C:\\Windows\\/i.test(path) ? "system" : "app";
}

function requireWindows() {
  if (process.platform !== "win32")
    throw new CliError("Estes comandos só existem no Windows por agora.");
}

function powershellJson(script) {
  requireWindows();
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error || result.status !== 0)
    throw new CliError("Não consegui ler os processos do Windows.", "Tenta outra vez; se persistir, corre o terminal como administrador.");
  const text = result.stdout.trim();
  if (!text) return [];
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [data];
}

export function processes() {
  return powershellJson(
    "Get-Process | Select-Object Id,ProcessName,WorkingSet64,Path | ConvertTo-Json -Compress"
  ).map((p) => ({
    pid: p.Id,
    name: p.ProcessName,
    bytes: p.WorkingSet64 ?? 0,
    kind: kindOf(p.Path)
  }));
}

export function listeners() {
  const rows = powershellJson(
    "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess | ConvertTo-Json -Compress"
  );
  const table = new Map(processes().map((p) => [p.pid, p]));
  const seen = new Set();
  return rows
    .map((r) => ({ port: r.LocalPort, pid: r.OwningProcess }))
    .filter((r) => {
      const key = `${r.port}:${r.pid}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.port - b.port)
    .map((r) => ({ ...r, name: table.get(r.pid)?.name ?? "?", kind: table.get(r.pid)?.kind ?? "protected" }));
}

const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;

// Lista as portas em escuta, com o processo dono de cada uma.
export function portsReport() {
  const rows = listeners();
  if (!rows.length) return ["Nenhuma porta em escuta."];
  return [
    "PORT    PID     KIND       PROCESS",
    ...rows.map((r) => `${String(r.port).padEnd(8)}${String(r.pid).padEnd(8)}${r.kind.padEnd(11)}${r.name}`)
  ];
}

// Top de memória e total por tipo: mostra o que é do Windows e o que é de programas instalados.
export function ramReport(top = 15) {
  const all = processes().sort((a, b) => b.bytes - a.bytes);
  const totals = { system: 0, app: 0, protected: 0 };
  for (const p of all) totals[p.kind] += p.bytes;
  const lines = [
    "MEMORY   PID     KIND       PROCESS",
    ...all.slice(0, top).map((p) => `${mb(p.bytes).padEnd(9)}${String(p.pid).padEnd(8)}${p.kind.padEnd(11)}${p.name}`),
    "",
    `Total por tipo: system ${mb(totals.system)} · app ${mb(totals.app)} · protected ${mb(totals.protected)}`,
    "system = pasta do Windows · app = outro programa · protected = sem acesso ao caminho"
  ];
  return lines;
}

// Para um processo por PID ou pela porta. Pede confirmação, salvo --yes.
// Sem --force usa taskkill normal (pede ao programa para fechar). Com --force termina à força.
export async function killCommand({ pid, port, yes = false, force = false }) {
  requireWindows();
  let targets;
  if (port !== undefined) {
    if (!/^\d+$/.test(String(port))) throw new CliError(`Porta inválida: '${port}'.`);
    targets = [...new Set(listeners().filter((r) => r.port === Number(port)).map((r) => r.pid))];
    if (!targets.length) throw new CliError(`Nada está a ouvir na porta ${port}.`, "Vê as portas com: djassi ports");
  } else {
    if (!/^\d+$/.test(pid ?? ""))
      throw new CliError("Indica o PID (um número) ou --port.", "Exemplo: djassi kill 1234  ou  djassi kill --port 3000");
    targets = [Number(pid)];
  }
  const table = new Map(processes().map((p) => [p.pid, p]));
  for (const target of targets) {
    if (PROTECTED_PIDS.has(target)) throw new CliError(`PID ${target} é do sistema. Não mexo nele.`);
    const proc = table.get(target);
    if (!proc) throw new CliError(`Não existe nenhum processo com PID ${target}.`, "Vê os PIDs com: djassi ports ou djassi ram");
    if (proc.kind === "system")
      throw new CliError(`${proc.name} (PID ${target}) é do Windows. Não o paro.`);
    if (!yes) {
      if (!process.stdin.isTTY)
        throw new CliError("Sem terminal para confirmar.", "Usa --yes para parar sem perguntar.");
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`Parar ${proc.name} (PID ${target})? [y/N] `);
      rl.close();
      if (!/^y(es)?$/i.test(answer.trim())) {
        console.log("Cancelado.");
        continue;
      }
    }
    const args = ["/PID", String(target), ...(force ? ["/F"] : [])];
    const result = spawnSync("taskkill", args, { encoding: "utf8", windowsHide: true });
    if (result.status === 0) console.log(`Parado: ${proc.name} (PID ${target}).`);
    else
      console.log(
        `Não consegui parar ${proc.name} (PID ${target}). ${result.stderr?.trim() ?? ""}` +
          (force ? "" : " Tenta com --force.")
      );
  }
  return 0;
}
