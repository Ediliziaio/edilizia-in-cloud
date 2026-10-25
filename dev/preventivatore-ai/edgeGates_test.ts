// Run without --allow-net: no listener, provider call or database access allowed.
Deno.test("chat OpenRouter: disabilitata per default, metodo e autenticazione verificati prima del provider", async () => {
  let handler: ((req: Request) => Promise<Response>) | undefined;
  const originalServe = Deno.serve;
  const originalFlag = Deno.env.get("QUOTE_CHAT_DEMO_ENABLED");
  Deno.serve = ((candidate: unknown) => { handler = candidate as typeof handler; return {} as ReturnType<typeof Deno.serve>; }) as typeof Deno.serve;
  try {
    Deno.env.delete("QUOTE_CHAT_DEMO_ENABLED");
    await import("../../supabase/functions/ai-preventivo-conversazione/index.ts");
    if (!handler) throw new Error("Handler non registrato");
    const request = (method = "POST") => new Request("http://localhost/functions/v1/ai-preventivo-conversazione", { method });
    if ((await handler(request())).status !== 503) throw new Error("Flag disabilitato non rispettato");
    if ((await handler(request("GET"))).status !== 405) throw new Error("Metodo non verificato");
    Deno.env.set("QUOTE_CHAT_DEMO_ENABLED", "true");
    if ((await handler(request())).status !== 401) throw new Error("JWT mancante non rifiutato");
  } finally {
    Deno.serve = originalServe;
    if (originalFlag == null) Deno.env.delete("QUOTE_CHAT_DEMO_ENABLED"); else Deno.env.set("QUOTE_CHAT_DEMO_ENABLED", originalFlag);
  }
});
