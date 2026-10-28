import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { renderOriginalHtml } from "./render.mjs";

const token = process.env.PREVENTIVI_PDF_TOKEN ?? "";
if (token.length < 32) throw new Error("Configura PREVENTIVI_PDF_TOKEN (almeno 32 caratteri).");
const assetBaseUrl = new URL(process.env.PREVENTIVI_PDF_ASSET_BASE_URL ?? "http://127.0.0.1:8080");
if (!["https:", "http:"].includes(assetBaseUrl.protocol) || assetBaseUrl.username || assetBaseUrl.password) throw new Error("Origine risorse non valida");
const allowedOrigins = [assetBaseUrl.origin, "https://fonts.googleapis.com", "https://fonts.gstatic.com",
  ...(process.env.PREVENTIVI_PDF_ASSET_ORIGINS ?? "").split(",").filter(Boolean).map(url => new URL(url).origin)];
let busy = false;
const maxBytes = 25 * 1024 * 1024;
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const error = (status, message) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: message })); };
  if (req.url !== "/render" || req.method !== "POST") return error(404, "Non disponibile");
  const received = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return error(401, "Non autorizzato");
  if (busy) return error(429, "Generazione in corso. Riprova tra qualche istante.");
  busy = true;
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes) return error(413, "Documento troppo grande");
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof body.html !== "string" || !body.html.trimStart().startsWith("<")) return error(400, "Documento HTML mancante");
    const bytes = await renderOriginalHtml(body.html, { assetBaseUrl: assetBaseUrl.href, allowedOrigins, schede: body.schede });
    if (bytes.length > maxBytes) return error(413, "PDF troppo grande");
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": bytes.length });
    res.end(bytes);
  } catch {
    error(422, "PDF non generato: controlla immagini, caratteri e impaginazione del preventivo.");
  } finally {
    busy = false;
  }
});
server.requestTimeout = 50_000;
server.headersTimeout = 10_000;
server.maxConnections = 4;
server.listen(Number(process.env.PREVENTIVI_PDF_PORT ?? 8096), "127.0.0.1", () => console.log("Renderer PDF locale pronto"));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
