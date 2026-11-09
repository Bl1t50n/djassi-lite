import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { CliError } from "./errors.mjs";

const AUDIO = [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".aiff"];
const EVENTS = ["success", "error"];
const COMMAND = /^[a-z][a-z0-9-]*$/;

export function configPath() {
  return join(process.env.DJASSI_CONFIG_DIR || join(homedir(), ".djassi"), "sounds.json");
}

function loadConfig() {
  const path = configPath();
  let stored = {};
  if (existsSync(path)) {
    try {
      stored = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      throw new CliError(`Ficheiro de sons corrompido: ${path}`, "Apaga-o e configura os sons de novo.");
    }
  }
  if (!stored || typeof stored !== "object" || Array.isArray(stored))
    throw new CliError(`Configuração de sons inválida: ${path}`, "Apaga-o e configura os sons de novo.");
  return { enabled: true, volume: 75, commands: {}, ...stored };
}

function audioFile(value) {
  const file = typeof value === "string" ? resolve(value) : "";
  if (!file || !AUDIO.includes(extname(file).toLowerCase()) || !existsSync(file) || !statSync(file).isFile())
    throw new CliError(
      "Escolhe um ficheiro de áudio que exista (por exemplo, siuu.mp3).",
      `Formatos aceites: ${AUDIO.join(" ")}`
    );
  return file;
}

export function soundForCommand(command, event = "success") {
  const config = loadConfig();
  const file = config.commands?.[command]?.[event];
  return config.enabled && file ? { file: audioFile(file), volume: config.volume } : null;
}

// Limite: leitores nativos cobrem os clips locais; outro backend só para uma plataforma
// que não consiga tocar o formato escolhido.
export function playSound({ file, volume = 75, wait = false }) {
  const clip = audioFile(file);
  const level = Math.max(0, Math.min(100, Number(volume) || 0));
  let executable;
  let args;
  let environment = process.env;
  if (process.platform === "win32") {
    executable = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const script =
      "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Add-Type -AssemblyName System.Windows.Forms; $player=New-Object -ComObject WMPlayer.OCX; try { $player.settings.volume=[int]$env:DJASSI_SOUND_VOLUME; $player.URL=$env:DJASSI_SOUND_FILE; $player.controls.play(); $deadline=[DateTime]::UtcNow.AddSeconds(45); $opening=[DateTime]::UtcNow.AddSeconds(10); $started=$false; do { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 100; if ($player.playState -eq 3) { $started=$true }; if ($player.playState -eq 8 -or ($started -and $player.playState -eq 1) -or (!$started -and [DateTime]::UtcNow -gt $opening)) { break } } while ([DateTime]::UtcNow -lt $deadline); @{ played=$started; errors=$player.error.errorCount } | ConvertTo-Json -Compress } finally { $player.close() }";
    args = ["-NoProfile", "-NonInteractive", "-Sta", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")];
    environment = { ...process.env, DJASSI_SOUND_FILE: clip, DJASSI_SOUND_VOLUME: String(level) };
  } else if (process.platform === "darwin") {
    executable = "afplay";
    args = ["-v", String(level / 100), clip];
  } else {
    executable = "ffplay";
    args = ["-nodisp", "-autoexit", "-loglevel", "quiet", "-volume", String(level), clip];
  }
  if (wait) {
    const result = spawnSync(executable, args, { env: environment, encoding: "utf8", windowsHide: true, timeout: 50000 });
    let played = result.status === 0;
    if (process.platform === "win32") {
      try {
        played = played && JSON.parse(result.stdout).played === true;
      } catch {
        played = false;
      }
    }
    return { success: played, file: clip, volume: level, played };
  }
  const child = spawn(executable, args, { env: environment, stdio: "ignore", detached: true, windowsHide: true });
  child.on("error", () => {});
  child.unref();
  return { success: Boolean(child.pid), file: clip, volume: level, started: Boolean(child.pid) };
}

export function playCommandSound(command, event = "success") {
  try {
    const sound = soundForCommand(command, event);
    if (sound) playSound(sound);
  } catch {
    // Limite: o som é melhor-esforço; um clip em falta nunca muda o resultado do comando.
  }
}

export function soundCommand(operation = "list", command, file, { event = "success", volume, dryRun = false } = {}) {
  const config = loadConfig();
  if (!EVENTS.includes(event)) throw new CliError("O evento tem de ser success ou error.");
  if (volume !== undefined) {
    const parsed = Number(volume);
    if (String(volume).trim() === "" || !Number.isFinite(parsed) || parsed < 0 || parsed > 100)
      throw new CliError("O volume tem de estar entre 0 e 100.");
    config.volume = parsed;
  }
  if (["set", "remove", "play", "notify"].includes(operation) && !COMMAND.test(command ?? ""))
    throw new CliError(
      "Indica o nome do comando, por exemplo: djassi sound set commit <ficheiro>.",
      "Nomes: letras minúsculas, números e '-'."
    );
  if (operation === "list") return { success: true, ...config, path: configPath() };
  if (operation === "notify") {
    if (!dryRun && process.env.DJASSI_NO_SOUND !== "1") playCommandSound(command, event);
    return { success: true, dryRun };
  }
  if (operation === "play") {
    const selected = config.commands?.[command]?.[event];
    if (!selected)
      throw new CliError(`Não há som '${event}' para '${command}'.`, `Define um com: djassi sound set ${command} <ficheiro>`);
    const clip = audioFile(selected);
    return dryRun
      ? { success: true, dryRun, file: clip, volume: config.volume }
      : playSound({ file: clip, volume: config.volume, wait: true });
  }
  if (operation === "set") {
    config.commands[command] = { ...config.commands[command], [event]: audioFile(file) };
  } else if (operation === "remove") {
    if (config.commands[command]) {
      delete config.commands[command][event];
      if (!Object.keys(config.commands[command]).length) delete config.commands[command];
    }
  } else if (operation === "mute" || operation === "unmute") {
    config.enabled = operation === "unmute";
  } else {
    throw new CliError("Usa: djassi sound list|set|remove|play|mute|unmute.");
  }
  const path = configPath();
  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  }
  return {
    success: true,
    dryRun,
    operation,
    ...config,
    path,
    summary: `Configuração de sons ${dryRun ? "simulada" : "guardada"}.`
  };
}
