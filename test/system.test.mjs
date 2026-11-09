import assert from "node:assert/strict";
import test from "node:test";
import { kindOf } from "../src/system.mjs";
import { djassi } from "./support.mjs";

const WIN = process.platform === "win32";

test("kindOf: Windows folder is system, other paths are app, no path is protected", () => {
  assert.equal(kindOf("C:\\Windows\\System32\\svchost.exe"), "system");
  assert.equal(kindOf("C:\\Program Files\\Git\\git.exe"), "app");
  assert.equal(kindOf(null), "protected");
});

test("ports, ram and kill refuse bad input before stopping anything", { skip: !WIN }, () => {
  const ram = djassi(["ram"]);
  assert.equal(ram.status, 0, ram.stderr);
  assert.match(ram.stdout, /Total por tipo: system/);
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
