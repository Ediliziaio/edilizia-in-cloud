import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { verifySignedRequest } from "./signature.ts";
import { startCallbacks } from "./callbacks.ts";
import { callSmts, unsignedRequest, readiness, parseResult, type Archive } from "./smts.ts";
import { validateMassiveInput, vatNumber, type MassiveInput } from "../../supabase/functions/_shared/billingMassive.ts";

process.umask(0o077);
const secret = process.env.SMTS_GATEWAY_SECRET ?? "";
if (secret.length < 32) throw new Error("SMTS_GATEWAY_SECRET deve contenere almeno 32 caratteri casuali.");
const dir = resolve(process.env.SMTS_DATA_DIR ?? "data"); mkdirSync(dir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(join(dir, "requests.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, company TEXT NOT NULL, vat TEXT NOT NULL, fingerprint TEXT NOT NULL, data TEXT NOT NULL, created TEXT NOT NULL, day TEXT NOT NULL, UNIQUE(company,fingerprint));");
startCallbacks(db);
interface Job extends MassiveInput { id: string; stato: string; filename: string; file_richiesta: string; ade_id?: string; polls: number; polled_at?: number; archives: Archive[]; errors: string[]; expires?: string; submitted_day?: string }
const day = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const save = (job: Job) => db.prepare("UPDATE requests SET data=? WHERE id=?").run(JSON.stringify(job), job.id);
function load(id: unknown, company: string, vat: string): Job {
  const row = db.prepare("SELECT data FROM requests WHERE id=? AND company=? AND vat=?").get(String(id), company, vat) as { data: string } | undefined;
  if (!row) throw new Error("Richiesta non appartenente a questa azienda.");
  return JSON.parse(row.data) as Job;
}
const locks = new Set<string>();
export async function act(body: Record<string, unknown>) {
  const company = String(body.company_id ?? "");
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(company)) throw new Error("Azienda non valida.");
  const vat = vatNumber(body.partita_iva);
  const action = String(body.action);
  const missing = readiness();
  const enabled = (process.env.SMTS_PROVIDER_ENABLED_VATS ?? "").split(",").map(s => s.trim()).includes(vat);
  if (!enabled) missing.push("Abilitazione del provider per questa partita IVA");
  if (action === "list") {
    const rows = db.prepare("SELECT data FROM requests WHERE company=? AND vat=? ORDER BY created DESC LIMIT 100").all(company, vat) as { data: string }[];
    return { requests: rows.map(r => JSON.parse(r.data)), configured: missing.length === 0, missing };
  }
  if (action === "create") {
    const input = validateMassiveInput({ ...(body.input as Record<string, unknown>), partita_iva: vat });
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const old = db.prepare("SELECT data FROM requests WHERE company=? AND fingerprint=?").get(company, fingerprint) as { data: string } | undefined;
    if (old) return JSON.parse(old.data);
    const id = randomUUID(), filename = `SMTS_${id.replaceAll("-", "")}.xml`;
    const job: Job = { ...input, id, stato: "CREATO", filename, file_richiesta: unsignedRequest(input, filename), polls: 0, archives: [], errors: [] };
    db.prepare("INSERT INTO requests VALUES (?,?,?,?,?,?,?)").run(id, company, vat, fingerprint, JSON.stringify(job), new Date().toISOString(), day());
    return job;
  }
  const job = load(body.id, company, vat);
  if (action === "unsigned") return job;
  if (missing.length) throw new Error(`Canale diretto non pronto: ${missing.join(", ")}.`);
  if (locks.has(job.id)) throw new Error("Operazione già in corso per questa richiesta.");
  locks.add(job.id);
  try {
    if (action === "sign") {
      if (job.stato !== "CREATO") throw new Error("Richiesta già inoltrata o con esito incerto: non ripetere l'invio.");
      const signed = String(body.signed_base64 ?? "");
      await verifySignedRequest(signed, job.file_richiesta);
      const daily = db.prepare("SELECT data FROM requests WHERE vat=?").all(vat) as { data: string }[];
      if (daily.filter(r => (JSON.parse(r.data) as Job).submitted_day === day()).length >= 10) throw new Error("Raggiunto il limite di 10 richieste giornaliere per partita IVA.");
      // Persist before network I/O. An ambiguous timeout must never trigger automatic resubmission.
      job.stato = "INOLTRO_IN_CORSO"; job.submitted_day = day(); save(job);
      try {
        const result = await callSmts("inoltroRichiesta", { filename: job.filename + ".p7m", base64: signed.replace(/\s/g, "") });
        if (!result.id) throw new Error("AdE non ha restituito l'identificativo.");
        job.ade_id = result.id; job.stato = "ELABORAZIONE"; save(job);
      } catch (e) { job.stato = "ESITO_INCERTO"; save(job); throw e; }
    } else if (action === "status") {
      if (!job.ade_id || ["PRONTO", "ERRORE"].includes(job.stato)) return job;
      // AdE permits only TEN esitoRichiesta calls per request, not ten per hour.
      if (job.polled_at && Date.now() - job.polled_at < 3_600_000) return job;
      if (job.polls >= 10) throw new Error("Esaurite le 10 verifiche di esito ammesse da AdE. Contatta l'assistenza prima di riprovare.");
      job.polls++; job.polled_at = Date.now(); save(job);
      const result = await callSmts("esitoRichiesta", { id: job.ade_id });
      if (["ST02", "ST03"].includes(result.state) && !result.base64) throw new Error("AdE non ha allegato il file di esito: nessun archivio è stato dichiarato disponibile.");
      if (result.base64) {
        const parsed = parseResult(result.base64, vat, job.ade_id);
        job.archives = parsed.archives; job.errors = parsed.errors; job.expires = parsed.expires;
      }
      job.stato = result.state === "ST02" ? "ERRORE" : result.state === "ST03" ? "PRONTO" : "ELABORAZIONE"; save(job);
    } else if (action === "download") {
      const archive = job.archives.find(a => a.id === body.file_id);
      if (!archive || !job.ade_id || job.stato !== "PRONTO") throw new Error("Archivio non disponibile per questa richiesta.");
      if (job.expires && Date.parse(job.expires) < Date.now()) throw new Error("L'archivio AdE è scaduto.");
      // Serialize downloads and keep well below the ten-archives/two-minutes ceiling.
      const recent = db.prepare("SELECT data FROM requests WHERE vat=?").all(vat) as { data: string }[];
      if (recent.some(r => Date.now() - Number(JSON.parse(r.data).downloaded_at ?? 0) < 15_000)) throw new Error("Attendi 15 secondi prima di scaricare il prossimo archivio.");
      const downloading = { ...job, downloaded_at: Date.now() }; save(downloading);
      const result = await callSmts("scaricoFile", { id: job.ade_id, fileId: archive.id });
      if (!result.base64) throw new Error("AdE non ha restituito l'archivio.");
      return { filename: archive.filename, base64: result.base64 };
    } else throw new Error("Operazione SMTS non supportata.");
    return job;
  } finally { locks.delete(job.id); }
}

const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
  if (req.url === "/health" && req.method === "GET") { res.end('{"service":"smts","ok":true}'); return; }
  const supplied = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const a = Buffer.from(supplied), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) { res.writeHead(401); res.end('{"error":"Non autorizzato"}'); return; }
  if (req.method !== "POST" || req.url !== "/actions") { res.writeHead(404); res.end('{}'); return; }
  try {
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length; if (size > 3_000_000) throw new Error("Richiesta troppo grande."); chunks.push(chunk);
    }
    res.end(JSON.stringify(await act(JSON.parse(Buffer.concat(chunks).toString("utf8")))));
  } catch (e) {
    res.writeHead(400); res.end(JSON.stringify({ error: e instanceof Error ? e.message : "Operazione non riuscita." }));
  }
});
server.requestTimeout = 60_000;
server.listen(Number(process.env.PORT ?? 3098), process.env.HOST ?? "127.0.0.1", () => {
  const address = server.address();
  console.info(JSON.stringify({ service: "smts", port: typeof address === "object" ? address?.port : null }));
});
