import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { djassi, nodeProject, tempDir } from "./support.mjs";

const pkgVersion = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
).version;

test("--version and --help work outside any project", () => {
  const version = djassi(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout.trim(), pkgVersion);
  const help = djassi(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /commit -m "mensagem"/);
});

test("unknown commands fail with a next step", () => {
  const result = djassi(["bogus"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Não conheço o comando 'bogus'/);
});

test("inspect names the lockfile package manager and its tasks", () => {
  const root = nodeProject({ lock: "pnpm-lock.yaml" });
  const result = djassi(["inspect"], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Gestor de pacotes: pnpm/);
  assert.match(result.stdout, /dev\s+→ pnpm run dev/);
});

test("dev --dry-run prints the real command and runs nothing", () => {
  const root = nodeProject();
  const result = djassi(["dev", "--dry-run"], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /→ npm run dev/);
  assert.equal(existsSync(join(root, "ran.json")), false);
});

test("run test executes the script and forwards arguments after --", () => {
  const root = nodeProject();
  const result = djassi(["run", "test", "--", "--watch"], { cwd: root });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(root, "ran.json"), "utf8")), ["--watch"]);
});

test("shell metacharacters are refused before anything runs", () => {
  const root = nodeProject();
  const result = djassi(["run", "test", "--", "a&calc"], { cwd: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /não permitido/);
  assert.equal(existsSync(join(root, "ran.json")), false);
});

function gitRepo() {
  const repo = tempDir("djassi-git-");
  const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.name", "Teste");
  git("config", "user.email", "teste@example.com");
  writeFileSync(join(repo, "a.txt"), "olá\n");
  return repo;
}

test("git stage and commit work; stage . and forced push are refused", () => {
  const repo = gitRepo();
  assert.equal(djassi(["stage", "."], { cwd: repo }).status, 1);
  assert.equal(djassi(["stage", "a.txt"], { cwd: repo }).status, 0);
  assert.equal(djassi(["commit"], { cwd: repo }).status, 1);
  const committed = djassi(["commit", "-m", "Primeiro commit"], { cwd: repo });
  assert.equal(committed.status, 0, committed.stderr);
  const log = spawnSync("git", ["log", "--oneline"], { cwd: repo, encoding: "utf8" });
  assert.match(log.stdout, /Primeiro commit/);
  assert.equal(djassi(["push", "--force"], { cwd: repo }).status, 1);
});

test("branch creates and switches; a path-like name is refused", () => {
  const repo = gitRepo();
  djassi(["stage", "a.txt"], { cwd: repo });
  djassi(["commit", "-m", "Base"], { cwd: repo });
  assert.equal(djassi(["branch", "feat/pagina"], { cwd: repo }).status, 0);
  const current = spawnSync("git", ["branch", "--show-current"], { cwd: repo, encoding: "utf8" });
  assert.equal(current.stdout.trim(), "feat/pagina");
  assert.equal(djassi(["branch", "../fora"], { cwd: repo }).status, 1);
});

test("sound set, list and mute keep settings in the given folder", () => {
  const cfg = tempDir("djassi-cfg-");
  const clip = join(tempDir(), "siuu.mp3");
  writeFileSync(clip, "");
  const env = { DJASSI_CONFIG_DIR: cfg };
  assert.equal(djassi(["sound", "set", "commit", clip], { env }).status, 0);
  assert.match(djassi(["sound", "list"], { env }).stdout, /commit \(success\)/);
  assert.equal(djassi(["sound", "mute"], { env }).status, 0);
  assert.match(djassi(["sound", "list"], { env }).stdout, /desligados/);
});
