/** Real request handler, captured without opening a port. Run with --deny-net. */
import { strict as assert } from "node:assert";
let handler: Deno.ServeHandler;
const original = Deno.serve;
// Registration only: no HTTP socket and no alternative auth/provider implementation.
Deno.serve = ((callback: Deno.ServeHandler) => { handler = callback; return {} as Deno.HttpServer; }) as typeof Deno.serve;
try { await import("../../supabase/functions/ai-preventivo-conversazione/index.ts"); }
finally { Deno.serve = original; }
const request = (method: string, authorization?: string) => new Request("http://127.0.0.1:54321/functions/v1/ai-preventivo-conversazione", {
  method, headers: { Origin: "http://127.0.0.1:8081", ...(authorization ? { Authorization: authorization } : {}) },
});
// Sequential in a single test because Deno.env belongs to this isolated test process.
Deno.test("Endpoint disabilitato e senza JWT non può avviare chiamate AI", async () => {
  const before = Deno.env.get("QUOTE_CHAT_DEMO_ENABLED");
  try {
    Deno.env.delete("QUOTE_CHAT_DEMO_ENABLED");
    const off = await handler(request("POST"), {} as Deno.ServeHandlerInfo);
    assert.equal(off.status, 503); assert.match((await off.json()).error, /non attiva/);
    assert.equal((await handler(request("GET"), {} as Deno.ServeHandlerInfo)).status, 405);
    const preflight = await handler(request("OPTIONS"), {} as Deno.ServeHandlerInfo);
    assert.equal(preflight.status, 200); assert.equal(preflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:8081");
    Deno.env.set("QUOTE_CHAT_DEMO_ENABLED", "true");
    const missing = await handler(request("POST"), {} as Deno.ServeHandlerInfo);
    assert.equal(missing.status, 401);
    const invalid = await handler(request("POST", "invalid"), {} as Deno.ServeHandlerInfo);
    assert.equal(invalid.status, 401);
  } finally {
    if (before == null) Deno.env.delete("QUOTE_CHAT_DEMO_ENABLED"); else Deno.env.set("QUOTE_CHAT_DEMO_ENABLED", before);
  }
});
