import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { isNewer } from "../src/update.mjs";
import { secretFileProblem } from "../src/secrets.mjs";
import { djassi, tempDir } from "./support.mjs";

function gitRepo() {
  const repo = tempDir("djassi-secret-");
  const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.name", "Teste");
  git("config", "user.email", "teste@example.com");
  writeFileSync(join(repo, "a.txt"), "olá\n");
  return repo;
}

test("isNewer compares numbers, not text", () => {
  assert.equal(isNewer("0.10.0", "0.9.0"), true);
  assert.equal(isNewer("0.1.0", "0.1.0"), false);
  assert.equal(isNewer("0.1.0", "0.2.0"), false);
});

test("secret file names are blocked, examples are allowed", () => {
  assert.equal(secretFileProblem(".env"), ".env");
  assert.equal(secretFileProblem("config/.env.production"), ".env.production");
  assert.equal(secretFileProblem("certs/server.pem"), "server.pem");
  assert.equal(secretFileProblem(".env.example"), null);
  assert.equal(secretFileProblem("README.md"), null);
});

test("stage refuses .env and commit refuses a token in the diff", () => {
  const repo = gitRepo();
  writeFileSync(join(repo, ".env"), "X=1\n");
  const refused = djassi(["stage", ".env"], { cwd: repo });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /segredos/);
  writeFileSync(join(repo, "a.txt"), `token = ghp_${"a".repeat(36)}\n`);
  assert.equal(djassi(["stage", "a.txt"], { cwd: repo }).status, 0);
  const commit = djassi(["commit", "-m", "Teste"], { cwd: repo });
  assert.equal(commit.status, 1);
  assert.match(commit.stderr, /segredos/);
});

test("djassi.json adds a project task and forwards extra arguments", () => {
  const root = tempDir("djassi-json-");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "x", private: true }));
  writeFileSync(
    join(root, "djassi.json"),
    JSON.stringify({ tasks: { hello: ["node", "-e", "require('fs').writeFileSync('ran.json', JSON.stringify(process.argv.slice(1)))"] } })
  );
  const result = djassi(["run", "hello", "--", "extra"], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(root, "ran.json"), "utf8")), ["extra"]);
});

test("an invalid djassi.json is refused with a clear message", () => {
  const root = tempDir("djassi-bad-");
  writeFileSync(join(root, "package.json"), "{}");
  writeFileSync(join(root, "djassi.json"), JSON.stringify({ tasks: { x: "npm run" } }));
  const result = djassi(["run", "x"], { cwd: root });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /djassi\.json/);
});

test("dev --all runs every project folder with a name prefix", () => {
  const root = tempDir("djassi-all-");
  for (const name of ["api", "web"]) {
    mkdirSync(join(root, name));
    writeFileSync(
      join(root, name, "package.json"),
      JSON.stringify({ name, private: true, scripts: { dev: "echo pronto" } })
    );
  }
  const result = djassi(["dev", "--all"], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[api\] pronto/);
  assert.match(result.stdout, /\[web\] pronto/);
});

test("dev --all says which folders are left out and why", () => {
  const root = tempDir("djassi-skip-");
  mkdirSync(join(root, "api"));
  writeFileSync(join(root, "api", "package.json"), JSON.stringify({ name: "api", private: true, scripts: { dev: "echo pronto" } }));
  mkdirSync(join(root, "docs"));
  mkdirSync(join(root, "semdev"));
  writeFileSync(join(root, "semdev", "package.json"), JSON.stringify({ name: "semdev", private: true, scripts: {} }));
  const result = djassi(["dev", "--all"], { cwd: root });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /⊘ docs: sem projeto reconhecido/);
  assert.match(result.stdout, /⊘ semdev: sem tarefa .dev./);
  assert.match(result.stdout, /\[api\] pronto/);
});
