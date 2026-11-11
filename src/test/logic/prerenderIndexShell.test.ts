import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, it } from "vitest";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
const html = (content: string, rendered = true) => `<!doctype html><html><head>
<title>Gestionale Edilizia con AI | Verifica del sito</title>
<meta name="description" content="${"Informazioni complete sul gestionale per imprese e cantieri. ".repeat(2)}">
<link rel="canonical" href="https://www.ediliziaincloud.com/">
${rendered ? '<meta name="x-prerendered" content="test">' : ""}
<script type="module" src="/assets-cb3/index.js"></script>
</head><body>${content}<!--${"x".repeat(31000)}--></body></html>`;

function verify(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "eic-prerender-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return spawnSync(
    process.execPath,
    [resolve("scripts/prerender-verify.mjs")],
    {
      env: { ...process.env, PRERENDER_VERIFY_DIST: dir },
      encoding: "utf8",
    },
  );
}
it("verifica la Home pubblica in _home e accetta il guscio dell’app senza H1", () => {
  const r = verify({
    "index.html": html('<div id="root"></div>', false),
    "_home/index.html": html("<h1>Gestisci cantieri e ordini</h1>"),
  });
  expect(r.status, r.stdout + r.stderr).toBe(0);
  expect(r.stdout).not.toContain("canonical non coerente");
  expect(r.stdout).toContain("/ (app)");
});
it("non accetta il solo guscio se manca la Home pubblica", () => {
  const r = verify({ "index.html": html('<div id="root"></div>', false) });
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("h1 mancante");
});
it("non nasconde una Home pubblica rimasta vuota", () => {
  const r = verify({
    "index.html": html('<div id="root"></div>', false),
    "_home/index.html": html("<div>Caricamento</div>"),
  });
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("h1 mancante");
});
it("mantiene il controllo H1 su tutte le altre pagine pubbliche", () => {
  const r = verify({
    "index.html": html('<div id="root"></div>', false),
    "_home/index.html": html("<h1>Home</h1>"),
    "prezzi/index.html": html("<p>Contenuto privo di intestazione</p>"),
  });
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("h1 mancante");
});
it("non accetta un guscio applicativo privo del punto di montaggio", () => {
  const r = verify({
    "index.html": html('<div id="altro"></div>', false),
    "_home/index.html": html("<h1>Home</h1>"),
  });
  expect(r.status).toBe(1);
  expect(r.stdout).toContain("guscio applicativo privo");
});
