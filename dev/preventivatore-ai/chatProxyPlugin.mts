import type { Plugin } from "vite";
import { localPlanRequestAllowed } from "./planOcrPlugin.mts";
const route = "/functions/v1/ai-preventivo-conversazione";
const demoEndpoint = `https://rsbrguhkodgnqfomrevo.supabase.co${route}`;
/** Remote opt-in is deliberately one fixed project/function, never an open proxy.
 * The browser still uses loopback; provider keys remain on the Edge Function. */
export function quoteChatUpstream(value: string | undefined, allowDemoRemote = false): URL | null {
  if (!value && allowDemoRemote) return new URL(demoEndpoint);
  if (!value) return null;
  const u = new URL(value);
  if (allowDemoRemote && u.href === demoEndpoint) return u;
  if (u.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) || u.pathname !== route || u.username || u.password || u.search || u.hash) throw new Error("Upstream chat riservato alla funzione locale dedicata.");
  return u;
}
export function quoteChatDemoBodyAllowed(body: Buffer): boolean {
  try { return JSON.parse(body.toString("utf8"))?.companyId === "d2000000-0000-4000-a000-000000000002"; }
  catch { return false; }
}
export function localQuoteChatProxy(options: { allowDemoRemote?: boolean } = {}): Plugin {
  return { name: "local-quote-chat-proxy", apply: "serve", configureServer(server) {
    server.middlewares.use(route, async (req, res) => {
      const reply = (status: number, error: string) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify({ error })); };
      if (!localPlanRequestAllowed(req)) return reply(403, "Chat disponibile solo dalla pagina locale.");
      if (req.method !== "POST") return reply(405, "Usa POST.");
      const suffix = (req.url ?? '/').split('?')[0];
      const audioMode = suffix === '/audio';
      const memoryMode = suffix === '/memory';
      if (!audioMode && !memoryMode && suffix !== '/' && suffix !== '') return reply(404, 'Percorso non disponibile.');
      if (!req.headers.authorization?.startsWith("Bearer ")) return reply(401, "Accesso richiesto.");
      let target: URL | null;
      try { target = quoteChatUpstream(process.env.QUOTE_CHAT_LOCAL_UPSTREAM, options.allowDemoRemote === true); } catch { return reply(503, "Configurazione del backend locale non valida."); }
      if (!target) return reply(503, "OpenRouter è configurato sul server, ma il servizio di chat per questa prova locale non è ancora disponibile. Nessuna chiamata AI eseguita; la tua bozza è intatta.");
      if (target.origin === `http://${req.headers.host}`) return reply(503, "L’upstream non può puntare a questo stesso server.");
      if (audioMode) target.pathname += '/audio';
      if (memoryMode) target.pathname += '/memory';
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 85_000);
      const closed = () => { if (!res.writableEnded) ctrl.abort(); }; res.on("close", closed);
      try {
        let size = 0; const chunks: Buffer[] = [];
        for await (const chunk of req) { const b = Buffer.from(chunk); size += b.length; if (size > (audioMode ? 2_850_000 : 650_000)) return reply(413, "Contesto troppo grande."); chunks.push(b); }
        const body = Buffer.concat(chunks);
        if (!quoteChatDemoBodyAllowed(body)) return reply(403, "Prova disponibile solo in Demo Azienda 2.");
        // Native adapters are not deployed: never send their new contract to
        // the earlier remote demo endpoint or silently use its legacy response.
        if (!['127.0.0.1','localhost','[::1]'].includes(target.hostname) && JSON.parse(body.toString('utf8')).nativeContext)
          return reply(503, 'Adattatore conversazionale disponibile solo con il backend locale aggiornato. Nessuna chiamata remota eseguita.');
        const upstream = await fetch(target, { method: "POST", redirect: "error", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", Accept: req.headers.accept === 'text/event-stream' ? 'text/event-stream' : 'application/json', Authorization: req.headers.authorization, apikey: typeof req.headers.apikey === "string" ? req.headers.apikey : "" }, body });
        if (upstream.ok && upstream.headers.get('content-type')?.includes('text/event-stream') && upstream.body) {
          res.statusCode = upstream.status; res.setHeader('Content-Type', 'text/event-stream; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.flushHeaders();
          const stream = upstream.body.getReader(); let bytes = 0;
          try { while (true) { const { done, value } = await stream.read(); if (done) break; bytes += value.byteLength; if (bytes > 700_000) throw new Error('too large'); if (!res.write(value)) await new Promise<void>((resolve, reject) => { const clean = () => { res.off('drain', drain); res.off('close', close); }; const drain = () => { clean(); resolve(); }; const close = () => { clean(); reject(new Error('closed')); }; res.once('drain', drain); res.once('close', close); }); } res.end(); }
          finally { await stream.cancel().catch(() => {}); stream.releaseLock(); }
          return;
        }
        const reader = upstream.body?.getReader(); let text = ""; let bytes = 0; const decoder = new TextDecoder();
        if (!reader) throw new Error("empty");
        try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > (memoryMode ? 650_000 : 400_000)) { await reader.cancel(); throw new Error("too large"); } text += decoder.decode(value, { stream: true }); } text += decoder.decode(); } finally { reader.releaseLock(); }
        if (!ctrl.signal.aborted) { res.statusCode = upstream.status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(text); }
      } catch { if (!res.destroyed) { if (res.headersSent) res.destroy(); else reply(502, "Backend conversazionale locale non raggiungibile o interrotto. La bozza resta invariata."); } }
      finally { clearTimeout(timer); res.off("close", closed); }
    });
  } };
}
