import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CliError } from "./errors.mjs";

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

function defaultProfiles() {
  const shell = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetFolderPath('MyDocuments')"], {
    encoding: "utf8",
    windowsHide: true
  });
  const documents = result.stdout?.trim() || join(homedir(), "Documents");
  return [join(documents, "PowerShell", "profile.ps1"), join(documents, "WindowsPowerShell", "profile.ps1")];
}

// Liga os sons aos comandos `git` do PowerShell. Só acrescenta uma linha ao perfil.
export function installPowerShell({ profile, dryRun = false } = {}) {
  if (process.platform !== "win32")
    throw new CliError(
      "A integração com PowerShell só existe no Windows.",
      "Em macOS/Linux usa 'djassi sound' diretamente."
    );
  const settings = process.env.DJASSI_CONFIG_DIR || join(homedir(), ".djassi");
  const modulePath = join(settings, "git-sounds.psm1");
  const scriptPath = join(settings, "git-sounds.ps1");
  const configFile = join(settings, "sounds.json");
  const statePath = join(settings, "powershell-integration.json");
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { profiles: [] };
  const profiles = profile ? [resolve(profile)] : defaultProfiles();
  const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "djassi.mjs");
  const script = [
    "# Djassi command sounds: encaminha a saída, o código de saída e o sucesso do git.",
    "$djassiArguments = @($args)",
    "$djassiExecutable = (Get-Command git.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source",
    "& $djassiExecutable @djassiArguments",
    "$djassiExitCode = $LASTEXITCODE",
    "$djassiVerb = $null",
    "for ($djassiIndex = 0; $djassiIndex -lt $djassiArguments.Count; $djassiIndex++) {",
    "  $djassiArgument = [string]$djassiArguments[$djassiIndex]",
    "  if ($djassiArgument -in @('-C', '-c', '--git-dir', '--work-tree')) { $djassiIndex++; continue }",
    "  if ($djassiArgument.StartsWith('-')) { continue }",
    "  $djassiVerb = $djassiArgument; break",
    "}",
    "if ($djassiVerb -and $env:DJASSI_NO_SOUND -ne '1') {",
    "  try {",
    `    $djassiSettings = Get-Content -LiteralPath ${quote(configFile)} -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop`,
    "    $djassiEvent = if ($djassiExitCode -eq 0) { 'success' } else { 'error' }",
    "    if ($djassiSettings.enabled -ne $false -and $djassiSettings.commands.$djassiVerb.$djassiEvent) {",
    `      & ${quote(process.execPath)} ${quote(cli)} sound notify $djassiVerb --event $djassiEvent > $null 2> $null`,
    "    }",
    "  } catch { }",
    "}",
    "exit $djassiExitCode",
    ""
  ].join("\n");
  const module = [
    "# O alias deixa o PowerShell chamar o script como se fosse o git.",
    `Set-Alias -Name git -Value ${quote(scriptPath)}`,
    "Export-ModuleMember -Alias git",
    ""
  ].join("\n");
  const result = {
    success: true,
    dryRun,
    modulePath,
    scriptPath,
    profiles,
    summary: dryRun
      ? "Integração preparada (simulação: nada foi escrito)."
      : "Integração instalada. Abre uma nova janela do PowerShell."
  };
  if (dryRun) return result;
  mkdirSync(settings, { recursive: true });
  writeFileSync(scriptPath, `\uFEFF${script}`, "utf8");
  writeFileSync(modulePath, `\uFEFF${module}`, "utf8");
  for (const path of profiles) {
    if (state.profiles.some((entry) => entry.path === path)) continue;
    const originalBytes = existsSync(path) ? statSync(path).size : 0;
    mkdirSync(dirname(path), { recursive: true });
    // Só lê a marca de codificação; nunca lê nem substitui os comandos do perfil.
    let encoding = "utf8";
    if (originalBytes >= 2) {
      const marker = Buffer.alloc(2);
      const descriptor = openSync(path, "r");
      try {
        readSync(descriptor, marker, 0, 2, 0);
      } finally {
        closeSync(descriptor);
      }
      if (marker[0] === 0xff && marker[1] === 0xfe) encoding = "utf16le";
    }
    appendFileSync(
      path,
      `${originalBytes ? "" : "\uFEFF"}\n# Djassi Git command sounds\nImport-Module ${quote(modulePath)} -Force\n`,
      encoding
    );
    state.profiles.push({ path, originalBytes });
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }
  return result;
}
