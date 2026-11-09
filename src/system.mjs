import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { CliError } from "./errors.mjs";

// Processos do sistema: PID 0 (Idle) e 4 (System) nunca são mexidos.
const PROTECTED_PIDS = new Set([0, 4]);

// Um processo fica:
//   system    → caminho dentro de C:\Windows
//   app       → caminho noutra pasta
//   admin     → o Windows nega o acesso a esta sessão; precisa de terminal como administrador
//   protected → nem como administrador se consegue abrir (processo protegido do Windows)
//   unknown   → acesso permitido mas sem caminho (raro)
export function kindOf({ path, granted, admin }) {
  if (path) return /^C:\\Windows\\/i.test(path) ? "system" : "app";
  if (granted) return "unknown";
  return admin ? "protected" : "admin";
}

function requireWindows() {
  if (process.platform !== "win32")
    throw new CliError("Estes comandos só existem no Windows por agora.");
}

// Lê o estado de cada processo. OpenProcess (com PROCESS_QUERY_LIMITED_INFORMATION) diz de facto
// se o acesso é permitido: o caminho vem vazio quando o acesso é negado, por isso não chega para decidir.
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -Namespace W -Name K -MemberDefinition '[DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool b, uint pid); [DllImport("kernel32.dll", SetLastError=true)] public static extern bool CloseHandle(IntPtr h);'
$admin = (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$procs = foreach ($p in Get-Process) {
  $h = [W.K]::OpenProcess(0x1000, $false, [uint32]$p.Id)
  $granted = $h -ne [IntPtr]::Zero
  if ($granted) { [void][W.K]::CloseHandle($h) }
  [pscustomobject]@{ Id = $p.Id; ProcessName = $p.ProcessName; WorkingSet64 = $p.WorkingSet64; Path = $p.Path; Granted = $granted }
}
[pscustomobject]@{ Admin = $admin; Procs = @($procs) } | ConvertTo-Json -Compress -Depth 3
`;

function readState() {
  requireWindows();
  const encoded = Buffer.from(SCRIPT, "utf16le").toString("base64");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.error || result.status !== 0 || !result.stdout.trim())
    throw new CliError("Não consegui ler os processos do Windows.", "Tenta outra vez.");
  return JSON.parse(result.stdout);
}

export function processes() {
  const state = readState();
  const admin = Boolean(state.Admin);
  return {
    admin,
    list: state.Procs.map((p) => ({
      pid: p.Id,
      name: p.ProcessName,
      bytes: p.WorkingSet64 ?? 0,
      kind: kindOf({ path: p.Path, granted: p.Granted, admin })
    }))
  };
}

export function listeners(table) {
  const rows = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object LocalPort,OwningProcess | ConvertTo-Json -Compress"
    ],
    { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 }
  );
  const text = rows.stdout?.trim();
  if (!text) return [];
  const data = JSON.parse(text);
  const seen = new Set();
  return (Array.isArray(data) ? data : [data])
    .map((r) => ({ port: r.LocalPort, pid: r.OwningProcess }))
    .filter((r) => {
      const key = `${r.port}:${r.pid}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.port - b.port)
    .map((r) => ({ ...r, name: table.get(r.pid)?.name ?? "?", kind: table.get(r.pid)?.kind ?? "unknown" }));
}

const mb = (bytes) => `${Math.round(bytes / 1048576)} MB`;
const hint = (admin) =>
  admin
    ? "Terminal como administrador: sim. Processos 'protected' são do Windows e não se abrem."
    : "Terminal como administrador: não. Processos 'admin' precisam de terminal como administrador.";

// Lista as portas em escuta, com o processo dono de cada uma.
export function portsReport() {
  const { admin, list } = processes();
  const rows = listeners(new Map(list.map((p) => [p.pid, p])));
  if (!rows.length) return ["Nenhuma porta em escuta.", hint(admin)];
  return [
    "PORT    PID     KIND       PROCESS",
    ...rows.map((r) => `${String(r.port).padEnd(8)}${String(r.pid).padEnd(8)}${r.kind.padEnd(11)}${r.name}`),
    "",
    hint(admin)
  ];
}

// Top de memória e total por tipo.
export function ramReport(top = 15) {
  const { admin, list } = processes();
  const all = list.sort((a, b) => b.bytes - a.bytes);
  const totals = {};
  for (const p of all) totals[p.kind] = (totals[p.kind] ?? 0) + p.bytes;
  return [
    "MEMORY   PID     KIND       PROCESS",
    ...all.slice(0, top).map((p) => `${mb(p.bytes).padEnd(9)}${String(p.pid).padEnd(8)}${p.kind.padEnd(11)}${p.name}`),
    "",
    `Total por tipo: ${Object.entries(totals).map(([k, v]) => `${k} ${mb(v)}`).join(" · ")}`,
    "system = pasta do Windows · app = outro programa · admin = precisa de administrador · protected = do Windows",
    hint(admin)
  ];
}

// Para um processo por PID ou pela porta. Pede confirmação, salvo --yes.
// Sem --force usa taskkill normal (pede ao programa para fechar). Com --force termina à força.
export async function killCommand({ pid, port, yes = false, force = false }) {
  requireWindows();
  const { admin, list } = processes();
  const table = new Map(list.map((p) => [p.pid, p]));
  let targets;
  if (port !== undefined) {
    if (!/^\d+$/.test(String(port))) throw new CliError(`Porta inválida: '${port}'.`);
    targets = [...new Set(listeners(table).filter((r) => r.port === Number(port)).map((r) => r.pid))];
    if (!targets.length) throw new CliError(`Nada está a ouvir na porta ${port}.`, "Vê as portas com: djassi ports");
  } else {
    if (!/^\d+$/.test(pid ?? ""))
      throw new CliError("Indica o PID (um número) ou --port.", "Exemplo: djassi kill 1234  ou  djassi kill --port 3000");
    targets = [Number(pid)];
  }
  for (const target of targets) {
    if (PROTECTED_PIDS.has(target)) throw new CliError(`PID ${target} é do sistema. Não mexo nele.`);
    const proc = table.get(target);
    if (!proc) throw new CliError(`Não existe nenhum processo com PID ${target}.`, "Vê os PIDs com: djassi ports ou djassi ram");
    if (proc.kind === "system") throw new CliError(`${proc.name} (PID ${target}) é do Windows. Não o paro.`);
    if (proc.kind === "admin")
      throw new CliError(
        `${proc.name} (PID ${target}) precisa de terminal como administrador.`,
        "Abre o terminal como administrador e tenta outra vez."
      );
    if (proc.kind === "protected")
      throw new CliError(`${proc.name} (PID ${target}) é protegido pelo Windows. Não consigo pará-lo.`);
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
