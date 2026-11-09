import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { explain } from "../src/explain.mjs";
import { djassi, nodeProject, tempDir } from "./support.mjs";

const title = (text) => explain(text)?.title ?? null;

test("ports: the number comes from the end of the address, not from the IP", () => {
  assert.equal(title("Error: listen EADDRINUSE: address already in use :::3000"), "Porta 3000 ocupada");
  assert.equal(title("Error: listen EADDRINUSE: address already in use 127.0.0.1:5432"), "Porta 5432 ocupada");
  assert.equal(title("Error: That port is already in use."), "Porta ocupada");
  assert.equal(title("Something is already running on port 3000."), "Porta 3000 ocupada");
});

test("missing programs in Windows (EN and PT), bash and Node spawn", () => {
  assert.match(title("'npm' is not recognized as an internal or external command,"), /'npm'/);
  assert.match(title("'python' não é reconhecido como um comando interno"), /'python'/);
  assert.match(title("bash: mvn: command not found"), /'mvn'/);
  assert.match(title("Error: spawn pnpm ENOENT"), /'pnpm'/);
});

test("Node modules: a package to install vs a wrong local path", () => {
  assert.match(title("Error: Cannot find module 'express'"), /'express' não está instalada/);
  assert.equal(title("Error: Cannot find module './utils/helper'"), "O ficheiro importado não existe");
  assert.match(title("ModuleNotFoundError: No module named 'flask.app'"), /'flask'/);
});

test("git: who are you, no upstream, rejected push, diverged pull, conflicts", () => {
  assert.equal(title("*** Please tell me who you are."), "O git não sabe quem és");
  const upstream = explain("fatal: The current branch feat/x has no upstream branch.");
  assert.ok(upstream.steps.some((s) => s.includes("push -u origin feat/x")));
  assert.match(title(" ! [rejected]        main -> main (fetch first)"), /commits que tu não tens/);
  assert.match(title("fatal: Not possible to fast-forward, aborting."), /caminhos diferentes/);
  assert.equal(title("CONFLICT (content): Merge conflict in a.txt"), "Conflito de merge");
});

test("the most specific rule wins over warnings and generic errors", () => {
  const log = "warning: in the working copy of 'a.txt', LF will be replaced by CRLF\nError: listen EADDRINUSE :::8080";
  assert.equal(title(log), "Porta 8080 ocupada");
  assert.equal(title("npm ERR! enoent Could not read package.json"), "Não há package.json nesta pasta");
  assert.equal(title("SyntaxError: Cannot use import statement outside a module"), "import num ficheiro que o Node trata como CommonJS");
  assert.equal(title("everything is fine"), null);
});

test("djassi explain works with an argument and with a pipe", () => {
  const arg = djassi(["explain", "Error: listen EADDRINUSE: address already in use :::3000"]);
  assert.equal(arg.status, 0, arg.stderr);
  assert.match(arg.stdout, /Porta 3000 ocupada/);
  const piped = djassi(["explain"], { input: "npm error Missing script: \"start\"\n" });
  assert.equal(piped.status, 0, piped.stderr);
  assert.match(piped.stdout, /não tem o script 'start'/);
  assert.equal(djassi(["explain", "nada de especial"]).status, 1);
});

test("a failing task is explained automatically, and an unknown failure gets the general tip", () => {
  const root = nodeProject();
  writeFileSync(join(root, "busy.mjs"), "console.error('Error: listen EADDRINUSE: address already in use :::4321'); process.exit(1);\n");
  writeFileSync(join(root, "plain.mjs"), "console.error('boom'); process.exit(2);\n");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", private: true, scripts: { busy: "node busy.mjs", plain: "node plain.mjs" } })
  );
  const busy = djassi(["run", "busy"], { cwd: root });
  assert.notEqual(busy.status, 0);
  assert.match(busy.stderr, /EADDRINUSE/, "the original error is still shown");
  assert.match(busy.stderr, /ℹ Porta 4321 ocupada/);
  const plain = djassi(["run", "plain"], { cwd: root });
  assert.notEqual(plain.status, 0);
  assert.match(plain.stderr, /Procura acima a primeira linha/);
});

test("djassi with no arguments says where you are and what to try", () => {
  const inProject = djassi([], { cwd: nodeProject() });
  assert.equal(inProject.status, 0);
  assert.match(inProject.stdout, /Experimenta:/);
  assert.match(inProject.stdout, /dev\s+arranca o projeto/);
  assert.doesNotMatch(inProject.stdout, /sound set/, "the full help is only in --help");

  const parent = tempDir("djassi-welcome-");
  for (const name of ["api", "web"]) {
    mkdirSync(join(parent, name));
    writeFileSync(join(parent, name, "package.json"), JSON.stringify({ scripts: { dev: "echo ok" } }));
  }
  assert.match(djassi([], { cwd: parent }).stdout, /dev --all/);
  assert.match(djassi([], { cwd: tempDir() }).stdout, /Não estás dentro de um projeto/);
});

test("doctor warns when .env is not ignored, and when it was already committed", () => {
  const root = nodeProject();
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  writeFileSync(join(root, ".env"), "SECRET=1\n");
  assert.match(djassi(["doctor"], { cwd: root }).stdout, /✖ \.env: não está no \.gitignore/);
  writeFileSync(join(root, ".gitignore"), ".env\n");
  assert.match(djassi(["doctor"], { cwd: root }).stdout, /✔ \.env: protegido pelo \.gitignore/);
  git("add", "-f", ".env");
  assert.match(djassi(["doctor"], { cwd: root }).stdout, /✖ \.env: já está no git/);
});
