import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

test("HTTP: autenticazione, persistenza delle bozze, deduplica, isolamento aziende e accreditamento", async () => {
  const dir = mkdtempSync(join(tmpdir(), "smts-test-"));
  const secret = "synthetic-local-test-secret-with-more-than-32-chars";
  const child = spawn(process.execPath, ["--experimental-transform-types", "server.ts"], {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    env: { ...process.env, PORT: "0", SMTS_ACCREDITED: "false", SMTS_GATEWAY_SECRET: secret, SMTS_DATA_DIR: dir, SMTS_SERVER_CERT: "", SMTS_SERVER_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let timer;
  try {
    const [chunk] = await Promise.race([once(child.stdout, "data"), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Startup timeout")), 10_000); })]);
    const { port } = JSON.parse(String(chunk));
    const call = async (body, auth = secret) => {
      const r = await fetch(`http://127.0.0.1:${port}/actions`, { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { status: r.status, body: await r.json() };
    };
    const scope = { company_id: "company-A", partita_iva: "02010390439" };
    assert.equal((await call({ ...scope, action: "list" }, "wrong")).status, 401);
    const draft = await call({ ...scope, action: "create", input: { data_da: "2026-01-01", data_a: "2026-03-31", tipo_richiesta: "RICEVUTE" } });
    assert.match(draft.body.file_richiesta, /FileRichiesta/);
    const duplicate = await call({ ...scope, action: "create", input: { data_da: "2026-01-01", data_a: "2026-03-31", tipo_richiesta: "RICEVUTE" } });
    assert.equal(draft.body.id, duplicate.body.id);
    assert.equal((await call({ ...scope, company_id: "company-B", action: "unsigned", id: draft.body.id })).status, 400);
    const listing = await call({ ...scope, action: "list" });
    assert.equal(listing.body.configured, false);
    assert.equal(listing.body.requests.length, 1);
    const signed = await call({ ...scope, action: "sign", id: draft.body.id, signed_base64: "YQ==" });
    assert.equal(signed.status, 400);
    assert.match(signed.body.error, /non pronto/);
  } finally {
    clearTimeout(timer); child.kill();
    if (child.exitCode === null) await once(child, "exit");
    rmSync(dir, { recursive: true, force: true });
  }
});
