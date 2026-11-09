import assert from "node:assert/strict";
import test from "node:test";
import { kindOf } from "../src/system.mjs";
import { djassi } from "./support.mjs";

const WIN = process.platform === "win32";

test("kindOf: path decides first; without path, denied access means admin (or protected if already admin)", () => {
  assert.equal(kindOf({ path: "C:\\Windows\\System32\\svchost.exe", granted: true, admin: false }), "system");
  assert.equal(kindOf({ path: "C:\\Program Files\\Git\\git.exe", granted: true, admin: false }), "app");
  assert.equal(kindOf({ path: null, granted: false, admin: false }), "admin");
  assert.equal(kindOf({ path: null, granted: false, admin: true }), "protected");
  assert.equal(kindOf({ path: null, granted: true, admin: false }), "unknown");
});

test("ports, ram and kill refuse bad input before stopping anything", { skip: !WIN }, () => {
  const ram = djassi(["ram"]);
  assert.equal(ram.status, 0, ram.stderr);
  assert.match(ram.stdout, /Total por tipo:/);
  assert.equal(djassi(["ports"]).status, 0);
  assert.equal(djassi(["kill", "abc"]).status, 1);
  assert.match(djassi(["kill", "0"]).stderr, /é do sistema/);
  assert.match(djassi(["kill", "999999"]).stderr, /Não existe nenhum processo/);
});

test("kill without a terminal asks for --yes instead of guessing", { skip: !WIN }, () => {
  const result = djassi(["kill", "--port", "1"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Nada está a ouvir|--yes/);
});
