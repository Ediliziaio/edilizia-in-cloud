import { createServer } from "node:https";
import { X509Certificate, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { TLSSocket } from "node:tls";
import { leggiXml } from "../../supabase/functions/_shared/xmlMinimo.ts";

const operations: Record<string, string> = {
  RicevutaConsegna: "ricevutaConsegna", NotificaMancataConsegna: "notificaMancataConsegna",
  NotificaScarto: "notificaScarto", NotificaEsito: "notificaEsito",
  NotificaDecorrenzaTermini: "notificaDecorrenzaTermini", AttestazioneTrasmissioneFattura: "attestazioneTrasmissioneFattura",
};
export function parseNotification(soap: string, soapAction: string) {
  const action = soapAction.replaceAll('"', "");
  const prefix = "http://www.fatturapa.it/TrasmissioneFatture/";
  const operation = action.startsWith(prefix) ? action.slice(prefix.length) : "";
  const tag = operations[operation];
  const doc = leggiXml(soap);
  const body = doc?.getElementsByTagName("Body")[0];
  const payload = tag && body?.getElementsByTagName(tag)[0];
  if (!payload) throw new Error("Notifica SdICoop non valida.");
  const text = (name: string) => payload.getElementsByTagName(name)[0]?.textContent?.trim() ?? "";
  const id = text("IdentificativoSdI"), filename = text("NomeFile"), file = text("File").replace(/\s/g, "");
  if (!/^\d{1,20}$/.test(id) || !/^[A-Za-z0-9_.]{1,100}$/.test(filename) || !file || !/^[A-Za-z0-9+/=]+$/.test(file)) throw new Error("Dati della notifica SdICoop incompleti.");
  return { operation, id, filename, file };
}
/** Optional inbound endpoint for the TRANSMISSION channel's one-way callbacks.
 * HTTPS and mutual TLS terminate here; untrusted forwarded headers are never used.
 */
export function startCallbacks(db: DatabaseSync) {
  if (!process.env.SMTS_SERVER_CERT && !process.env.SMTS_SERVER_KEY) return null;
  const expected = (process.env.SMTS_SDI_CLIENT_CERTS ?? "").split(",").filter(Boolean).map(path => new X509Certificate(readFileSync(path.trim())).fingerprint256);
  if (!expected.length || !process.env.SMTS_CA) throw new Error("Configura i certificati client pubblici SdI e la CA prima di esporre gli endpoint.");
  db.exec("CREATE TABLE IF NOT EXISTS sdi_notifications (hash TEXT PRIMARY KEY, operation TEXT NOT NULL, sdi_id TEXT NOT NULL, filename TEXT NOT NULL, content TEXT NOT NULL, received_at TEXT NOT NULL)");
  const server = createServer({ cert: readFileSync(process.env.SMTS_SERVER_CERT!), key: readFileSync(process.env.SMTS_SERVER_KEY!),
    passphrase: process.env.SMTS_SERVER_KEY_PASSPHRASE, ca: readFileSync(process.env.SMTS_CA),
    requestCert: true, rejectUnauthorized: true, minVersion: "TLSv1.2",
  }, async (req, res) => {
    const socket = req.socket as TLSSocket;
    if (!socket.authorized || !expected.includes(socket.getPeerCertificate().fingerprint256 ?? "")) { res.writeHead(403); res.end(); return; }
    if (req.method !== "POST" || req.url !== "/sdi/trasmissione") { res.writeHead(404); res.end(); return; }
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 2_000_000) throw new Error("Payload troppo grande"); chunks.push(chunk); }
      const soap = Buffer.concat(chunks).toString("utf8");
      const notification = parseNotification(soap, String(req.headers.soapaction ?? ""));
      const hash = createHash("sha256").update(soap).digest("hex");
      // Only acknowledge AFTER durable storage. A retry is idempotent.
      db.prepare("INSERT OR IGNORE INTO sdi_notifications VALUES (?,?,?,?,?,?)").run(hash, notification.operation, notification.id, notification.filename, notification.file, new Date().toISOString());
      res.writeHead(202); res.end(); // All six operations are one-way in TrasmissioneFatture_v1.1.wsdl.
    } catch { res.writeHead(500); res.end(); }
  });
  server.requestTimeout = 30_000;
  server.listen(Number(process.env.SMTS_CALLBACK_PORT ?? 3100), process.env.SMTS_CALLBACK_HOST ?? "127.0.0.1");
  return server;
}
