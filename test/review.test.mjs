import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { kindOf } from "../src/system.mjs";
import { latestVersion } from "../src/update.mjs";
import { djassi, tempDir } from "./support.mjs";

test("offline: the failed check is cached, so the next command does not wait again", async () => {
  const realFetch = globalThis.fetch;
  const skip = process.env.DJASSI_SKIP_UPDATE;
  delete process.env.DJASSI_SKIP_UPDATE;
  process.env.DJASSI_CONFIG_DIR = tempDir("djassi-upd-");
  try {
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    assert.equal(await latestVersion(), null);
    assert.ok(existsSync(join(process.env.DJASSI_CONFIG_DIR, "update.json")));
    globalThis.fetch = async () => assert.fail("must not hit the network again within 24h");
    assert.equal(await latestVersion(), null);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.DJASSI_CONFIG_DIR;
    if (skip !== undefined) process.env.DJASSI_SKIP_UPDATE = skip;
  }
});

test("a version that is not x.y.z is ignored", async () => {
  const realFetch = globalThis.fetch;
  process.env.DJASSI_CONFIG_DIR = tempDir("djassi-upd-");
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ version: "\u001b[31m9.9.9" }) });
    assert.equal(await latestVersion({ force: true }), null);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.DJASSI_CONFIG_DIR;
  }
});

test("kindOf follows SystemRoot, not a fixed C: drive", () => {
  const proc = { path: "D:\\Windows\\explorer.exe", granted: true, admin: false };
  assert.equal(kindOf(proc, "D:\\Windows"), "system");
  assert.equal(kindOf(proc, "C:\\Windows"), "app");
});

test("dev --all uses djassi.json and reports a broken djassi.json as left out", () => {
  const root = tempDir("djassi-allcfg-");
  mkdirSync(join(root, "api"));
  writeFileSync(join(root, "api", "package.json"), "{}");
  writeFileSync(join(root, "api", "djassi.json"), JSON.stringify({ tasks: { dev: ["node", "-e", "console.log('custom')"] } }));
  mkdirSync(join(root, "broken"));
  writeFileSync(join(root, "broken", "package.json"), "{}");
  writeFileSync(join(root, "broken", "djassi.json"), "{ not json");
  const result = djassi(["dev", "--all", "--project", root], { cwd: tempDir() });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[api\] custom/);
  assert.match(result.stdout, /⊘ broken: djassi\.json inválido/);
});

test("commit catches a .env inside a folder with accents (staged via the folder)", () => {
  const repo = tempDir("djassi-z-");
  const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.name", "Teste");
  git("config", "user.email", "teste@example.com");
  mkdirSync(join(repo, "configuração"));
  writeFileSync(join(repo, "configuração", ".env"), "X=1\n");
  assert.equal(djassi(["stage", "configuração"], { cwd: repo }).status, 0);
  const commit = djassi(["commit", "-m", "Teste"], { cwd: repo });
  assert.equal(commit.status, 1);
  assert.match(commit.stderr, /\.env/);
});
