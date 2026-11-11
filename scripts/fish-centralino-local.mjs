import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { FishAudioClient, buildFishSipPlan } from "../supabase/functions/_shared/fishAudio.ts";
import { scenarios, simulateScenario } from "./fish-centralino/scenarios.mjs";

const htmlPath = new URL("./fish-centralino/index.html", import.meta.url);
const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};
async function bodyJson(req) {
  const chunks = []; let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 16_384) throw new Error("Richiesta troppo grande.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("JSON non valido."); }
}

export function createLocalFishServer(env = process.env, fetcher = fetch) {
  const token = randomBytes(32).toString("hex");
  let voiceBusy = false;
  const voiceAttempts = [];
  const client = () => new FishAudioClient(env.FISH_API_KEY ?? "", fetcher);
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'nonce-" + token + "'; style-src 'nonce-" + token + "'; connect-src 'self'; media-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const port = server.address()?.port;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return json(res, 403, { error: "Host locale non valido." });
    const origin = `http://${req.headers.host}`;
    if ((req.headers.origin && req.headers.origin !== origin) || req.headers["sec-fetch-site"] === "cross-site") return json(res, 403, { error: "Origine non consentita." });
    const path = new URL(req.url, origin).pathname;
    try {
      if (req.method === "GET" && path === "/") {
        const html = (await readFile(htmlPath, "utf8")).replaceAll("__LOCAL_TOKEN__", token);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(html);
      }
      if (!path.startsWith("/api/")) return json(res, 404, { error: "Pagina non trovata." });
      const supplied = Buffer.from(String(req.headers["x-local-token"] ?? ""));
      const expected = Buffer.from(token);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(res, 403, { error: "Apri il laboratorio dalla pagina locale." });
      if (req.method === "GET" && path === "/api/status") return json(res, 200, {
        keyConfigured: !!env.FISH_API_KEY?.trim(), voiceConfigured: !!env.FISH_VOICE_ID?.trim(),
        model: env.FISH_TTS_MODEL || "s2.1-pro-free", scenarios,
        mode: "local", productionConnected: false,
      });
      if (req.method !== "POST") return json(res, 405, { error: "Metodo non consentito." });
      if (!req.headers["content-type"]?.startsWith("application/json")) return json(res, 415, { error: "Serve application/json." });
      const body = await bodyJson(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json(res, 400, { error: "Serve un oggetto JSON." });
      if (path === "/api/inspect") {
        const fish = client();
        const [agents, numbers] = await Promise.all([fish.listAgents(), fish.listPhoneNumbers()]);
        // Return only fields useful for diagnostics; never trunk credentials.
        return json(res, 200, {
          checkedAt: new Date().toISOString(),
          agents: agents.map(a => ({ id: a.agent_id, name: a.name, publicationState: a.publication_state })),
          numbers: numbers.map(n => ({ id: n.phone_number_id, number: n.phone_number, provider: n.provider, agentId: n.agent_id, status: n.status, outbound: n.supports_outbound === true })),
        });
      }
      if (path === "/api/simulate") {
        if (typeof body.scenario !== "string" || typeof body.operatorAvailable !== "boolean") return json(res, 400, { error: "Scenario e disponibilità non validi." });
        return json(res, 200, simulateScenario(body.scenario, body.operatorAvailable));
      }
      if (path === "/api/plan") {
        if (typeof body.number !== "string" || (body.outboundHost !== undefined && typeof body.outboundHost !== "string")) return json(res, 400, { error: "Numero o host non validi." });
        return json(res, 200, buildFishSipPlan(body.number, undefined, body.outboundHost || undefined));
      }
      if (path === "/api/tts") {
        const now = Date.now();
        while (voiceAttempts.length && voiceAttempts[0] < now - 60_000) voiceAttempts.shift();
        if (voiceBusy || voiceAttempts.length >= 5) return json(res, 429, { error: "Attendi prima di un’altra prova voce (massimo 5 al minuto)." });
        if (typeof body.text !== "string") return json(res, 400, { error: "Testo non valido." });
        voiceBusy = true; voiceAttempts.push(now);
        try {
          const audio = await client().previewSpeech(body.text, env.FISH_VOICE_ID || undefined, env.FISH_TTS_MODEL || "s2.1-pro-free");
          res.writeHead(200, { "Content-Type": "audio/mpeg" });
          return res.end(Buffer.from(audio));
        } finally { voiceBusy = false; }
      }
      return json(res, 404, { error: "Operazione non disponibile nel laboratorio locale." });
    } catch (error) {
      const status = error.name === "FishAudioError" ? error.status : 400;
      return json(res, status, { error: error.message || "Operazione non riuscita." });
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FISH_LOCAL_PORT || 8797);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("FISH_LOCAL_PORT deve essere tra 1024 e 65535.");
  const server = createLocalFishServer();
  server.on("error", err => { console.error(err.code === "EADDRINUSE" ? "Porta occupata: cambia FISH_LOCAL_PORT." : "Avvio locale non riuscito."); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Centralino locale: http://127.0.0.1:${port}`);
    console.log("Scenari dimostrativi locali. Verifica Fish e prova voce richiedono la chiave sul server.");
  });
}
