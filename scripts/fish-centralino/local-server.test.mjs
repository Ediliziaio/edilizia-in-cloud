import test from "node:test";
import assert from "node:assert/strict";
import { createLocalFishServer } from "../fish-centralino-local.mjs";

async function withServer(env, fetcher, run) {
  const server = createLocalFishServer(env, fetcher);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base);
    assert.equal(page.status, 200);
    const html = await page.text();
    const token = html.match(/const token = '([a-f0-9]+)'/)[1];
    const headers = { "X-Local-Token": token, "Content-Type": "application/json", Origin: base };
    await run({ base, headers, html, post: (path, body) => fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) }) });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test("local sandbox works without keys, declines live inspection and does not call a provider", async () => {
  let externalRequests = 0;
  await withServer({}, async () => { externalRequests++; throw new Error("must not call"); }, async ({ base, headers, post }) => {
    const state = await (await fetch(base + "/api/status", { headers })).json();
    assert.equal(state.keyConfigured, false);
    assert.equal(state.productionConnected, false);
    const simulation = await (await post("/api/simulate", { scenario: "handoff", operatorAvailable: false })).json();
    assert.equal(simulation.simulation, true);
    assert.equal(simulation.outcome, "Proposta di richiamo");
    assert.equal(simulation.actions[0].tool, "richiesta_richiamo");
    assert.equal((await post("/api/inspect", {})).status, 400);
    assert.equal(externalRequests, 0);
  });
});

test("browser API blocks cross-origin access, missing tokens and any live-call route", async () => {
  await withServer({}, fetch, async ({ base, headers, post }) => {
    assert.equal((await fetch(base + "/api/status")).status, 403);
    assert.equal((await fetch(base + "/api/status", { headers: { ...headers, Origin: "https://other.example" } })).status, 403);
    assert.equal((await post("/api/phone-calls", {})).status, 404);
    assert.equal((await post("/api/simulate", { scenario: "handoff", operatorAvailable: "false" })).status, 400);
  });
});

test("real inspection uses API replies, strips trunk secrets and does not expose the API key", async () => {
  const paths = [];
  const external = async url => {
    paths.push(url);
    const data = url.endsWith("/agents") ? { agents: [{ agent_id: "a", name: "Assistente", publication_state: "live" }], has_more: false }
      : { phone_numbers: [{ phone_number_id: "n", phone_number: "+390212345678", provider: "sip", agent_id: "a", status: "active", supports_outbound: true, termination_auth_password: "trunk-secret" }], has_more: false };
    return new Response(JSON.stringify(data));
  };
  await withServer({ FISH_API_KEY: "api-secret" }, external, async ({ base, headers, html, post }) => {
    const response = await post("/api/inspect", {});
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(JSON.parse(text).numbers[0].outbound, true);
    const status = await (await fetch(base + "/api/status", { headers })).text();
    for (const value of [html, text, status]) { assert.ok(!value.includes("api-secret")); assert.ok(!value.includes("trunk-secret")); }
    assert.equal(paths.length, 2);
  });
});
