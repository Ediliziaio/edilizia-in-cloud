import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createAssistanceLab } from "./runtime.mjs";
import { createAssistanceHttpServer } from "./server.mjs";
test("local HTTP exposes only the fixture flow: loopback, origin, nonce, method and body guards", async () => {
  const lab = await createAssistanceLab();
  const server = createAssistanceHttpServer(lab);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base =
    "http://127.0.0.1:" + server.address().port + "/__local-assistance";
  try {
    const denied = await fetch(base + "/bootstrap", {
      headers: { Origin: "https://example.com" },
    });
    assert.equal(denied.status, 403);
    assert.equal(
      (
        await fetch(base + "/bootstrap", {
          headers: { Authorization: "Bearer not-a-production-token" },
        })
      ).status,
      403,
    );
    const response = await fetch(base + "/bootstrap");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    const boot = await response.json();
    assert.equal(boot.productionConnected, false);
    const body = {
      requestId: randomUUID(),
      customerId: boot.customers[0].id,
      calendarId: boot.defaultCalendarId,
      scenario: "new",
    };
    assert.equal(
      (
        await fetch(base + "/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
      403,
    );
    const headers = {
      "Content-Type": "application/json",
      "X-Local-Assistance-Token": boot.token,
    };
    assert.equal(
      (
        await fetch(base + "/sessions", {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...body,
            company_id: "foreign",
            tool: "crea_ticket",
          }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/sessions", {
          method: "POST",
          headers: { ...headers, "Sec-Fetch-Site": "cross-site" },
          body: JSON.stringify(body),
        })
      ).status,
      403,
    );
    const first = await (
      await fetch(base + "/sessions", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
    ).json();
    const second = await (
      await fetch(base + "/sessions", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
    ).json();
    assert.equal(first.session.id, second.session.id);
    assert.equal(
      (await fetch(base + "/rpc", { method: "POST", headers, body: "{}" }))
        .status,
      404,
    );
    assert.equal(
      (await fetch(base + "/sessions/" + first.session.id, { headers })).status,
      200,
    );
    assert.equal(
      (await lab.db.query("SELECT count(*)::int n FROM local_lab_sessions"))
        .rows[0].n,
      1,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await lab.close();
  }
});

test("a second CLI startup fails before touching a database when its loopback port is occupied", async () => {
  const { createServer } = await import("node:net");
  const { spawn } = await import("node:child_process");
  const { mkdtemp, access, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = await mkdtemp(join(tmpdir(), "eic-local-startup-"));
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  try {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./server.mjs", import.meta.url))],
      {
        cwd: dir,
        env: {
          PATH: process.env.PATH,
          ASSISTANCE_LOCAL_PORT: String(blocker.address().port),
        },
      },
    );
    let error = "";
    child.stderr.on("data", (data) => {
      error += data.toString();
    });
    const code = await new Promise((resolve) => child.on("exit", resolve));
    assert.equal(code, 1);
    assert.match(error, /porta.*occupata/);
    await assert.rejects(access(join(dir, ".tmp")));
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
