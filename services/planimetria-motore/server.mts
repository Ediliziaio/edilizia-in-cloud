/**
 * Motore planimetrie online (23/11/2026): render fotorealistico con Blender
 * Cycles e lettura DWG con LibreDWG, gli stessi script della prova locale di
 * `dev/planimetria-editor`, dietro un biglietto firmato da `planimetria-motore`.
 *
 *   POST /render        GLB → PNG              (biglietto «render», 1 credito)
 *   POST /dwg           DWG → PNG + riferimento (biglietto «dwg», gratis)
 *   POST /dwg/modello   DWG → modello JSON      (biglietto «dwg-modello», gratis)
 *   GET  /health
 *
 * Il biglietto arriva in `Authorization: Bearer …`, vale una volta sola e per
 * una sola operazione. Il container non ha chiavi del database: se il render
 * fallisce manda alla funzione l'esito firmato e la funzione rimborsa.
 *
 * Variabili: PLANIMETRIE_MOTORE_SEGRETO, PLANIMETRIE_MOTORE_ESITO_URL
 * (…/functions/v1/planimetria-motore), PLANIMETRIE_APP_ORIGINS (origini
 * ammesse, separate da virgola), BLENDER_BIN, PLANIMETRIE_DWG_PYTHON.
 */
import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { firma, leggiBiglietto, testoEsito, type OperazioneMotore } from "../../shared/planimetrie/bigliettoMotore.ts";
import { glbAutonomo, leggiParametri, MAX_GLB, tempoMassimoMs } from "../../dev/planimetria-editor/renderParametri.mts";
import { convertiTavolaDwg, ricostruisciDwg } from "../../dev/planimetria-editor/cadPreviewPlugin.mts";
import { CAD_MAX_BYTES } from "../../src/lib/preventivi/quoteCad.ts";
import { validaRichiestaModelloDwg } from "../../src/lib/planimetrie/coordinateDwg.ts";

const exec = promisify(execFile);
const SEGRETO = process.env.PLANIMETRIE_MOTORE_SEGRETO ?? "";
const ESITO_URL = process.env.PLANIMETRIE_MOTORE_ESITO_URL ?? "";
const BLENDER = process.env.BLENDER_BIN ?? "blender";
const ORIGINI = (process.env.PLANIMETRIE_APP_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
const SCRIPT_RENDER = fileURLToPath(new URL("../../dev/planimetria-editor/renderFotorealistico.py", import.meta.url));
const PORTA = Number(process.env.PORT ?? 8080);

if (SEGRETO.length < 32) throw new Error("PLANIMETRIE_MOTORE_SEGRETO mancante o troppo corto.");

/** Biglietti già usati: uno per richiesta. Basta in memoria, il container è uno. */
const usati = new Map<string, number>();
let occupato = false;

function intestazioniCors(req: IncomingMessage): Record<string, string> {
  const origine = String(req.headers.origin ?? "");
  return {
    ...(ORIGINI.includes(origine) ? { "Access-Control-Allow-Origin": origine, Vary: "Origin" } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-planimetria-render, x-planimetria-cad",
    "Access-Control-Expose-Headers": "X-Planimetria-Dwg, X-Render-Immagine",
    "Access-Control-Max-Age": "600",
  };
}

function rispondi(req: IncomingMessage, res: ServerResponse, stato: number, corpo: Buffer | Record<string, unknown>, tipo?: string, extra: Record<string, string> = {}) {
  if (res.destroyed || res.writableEnded) return;
  const json = !Buffer.isBuffer(corpo);
  res.writeHead(stato, {
    ...intestazioniCors(req), ...extra,
    "Content-Type": json ? "application/json" : tipo ?? "application/octet-stream",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  });
  res.end(json ? JSON.stringify(corpo) : corpo);
}

async function leggiCorpo(req: IncomingMessage, massimo: number): Promise<Buffer | null> {
  const pezzi: Buffer[] = [];
  let totale = 0;
  for await (const pezzo of req) {
    const b = Buffer.isBuffer(pezzo) ? pezzo : Buffer.from(pezzo);
    totale += b.length;
    if (totale > massimo) return null;
    pezzi.push(b);
  }
  return Buffer.concat(pezzi);
}

async function* comeFlusso(b: Buffer) { yield new Uint8Array(b); }

/** Restituisce il credito di un render non riuscito: senza attendere l'utente. */
async function segnalaFallito(token: string) {
  if (!ESITO_URL) return;
  try {
    await fetch(ESITO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ azione: "esito", biglietto: token, esito: "fallito", firma: await firma(SEGRETO, testoEsito(token, "fallito")) }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.error("[motore] rimborso non inviato:", e instanceof Error ? e.message : e);
  }
}

async function render(req: IncomingMessage, res: ServerResponse, token: string) {
  if (req.headers["content-type"] !== "model/gltf-binary") return rispondi(req, res, 415, { error: "Il motore si aspetta un modello GLB." });
  let parametri;
  try { parametri = leggiParametri(req.headers["x-planimetria-render"]); } catch { parametri = null; }
  if (!parametri) return rispondi(req, res, 400, { error: "Inquadratura non valida." });
  const glb = await leggiCorpo(req, MAX_GLB);
  if (!glb) return rispondi(req, res, 413, { error: "La scena supera 24 MB." });
  if (!glbAutonomo(glb)) return rispondi(req, res, 400, { error: "La scena GLB deve contenere tutta la geometria." });
  const cartella = await mkdtemp(join(tmpdir(), "render-"));
  const inizio = Date.now();
  try {
    const modello = join(cartella, "modello.glb"), camera = join(cartella, "camera.json"), uscita = join(cartella, "render.png");
    await Promise.all([writeFile(modello, glb), writeFile(camera, JSON.stringify(parametri))]);
    await exec(BLENDER, ["--background", "--factory-startup", "--disable-autoexec", "--threads", process.env.PLANIMETRIE_CYCLES_THREADS ?? "0",
      "--python-exit-code", "2", "--python", SCRIPT_RENDER, "--", modello, camera, uscita],
    { cwd: cartella, env: { PATH: process.env.PATH, HOME: cartella, LANG: "C.UTF-8", PLANIMETRIE_CYCLES_DEVICE: "CPU" },
      timeout: tempoMassimoMs(parametri), maxBuffer: 1024 * 1024 });
    const png = await readFile(uscita);
    console.log(`[motore] render ${parametri.qualita} ${parametri.larghezza}×${parametri.altezza} in ${Math.round((Date.now() - inizio) / 1000)} s`);
    return rispondi(req, res, 200, png, "image/png");
  } catch (error) {
    const e = error as { signal?: string; stderr?: string; message?: string };
    console.error("[motore] render fallito:", e.stderr?.split("\n").slice(-6).join(" | ") || e.message);
    void segnalaFallito(token);
    return rispondi(req, res, 500, { error: e.signal
      ? "Il calcolo ha superato il tempo a disposizione. Prova una vista alla volta. Il credito è stato restituito."
      : "Blender non è riuscito a calcolare questa vista. Il credito è stato restituito." });
  } finally {
    await rm(cartella, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function dwg(req: IncomingMessage, res: ServerResponse, modello: boolean) {
  if (req.headers["content-type"] !== "application/octet-stream") return rispondi(req, res, 415, { error: "Carica un file DWG." });
  let richiesta;
  if (modello) {
    try {
      const input = String(req.headers["x-planimetria-cad"] ?? "");
      if (input.length > 8000) throw new Error();
      richiesta = validaRichiestaModelloDwg(JSON.parse(decodeURIComponent(input)));
    } catch (error) {
      return rispondi(req, res, 400, { error: error instanceof Error && !(error instanceof SyntaxError) && error.message ? error.message : "Imposta le quote e scegli i ritagli da ricostruire." });
    }
  }
  const file = await leggiCorpo(req, CAD_MAX_BYTES);
  if (!file) return rispondi(req, res, 413, { error: "Il DWG supera 64 MB." });
  const controller = new AbortController();
  const scadenza = setTimeout(() => controller.abort(), 145_000);
  try {
    if (richiesta) {
      const esito = await ricostruisciDwg(comeFlusso(file), richiesta, controller.signal);
      if (esito.errore) return rispondi(req, res, 422, { error: esito.errore });
      return rispondi(req, res, 200, esito as Record<string, unknown>);
    }
    const { png, riferimento } = await convertiTavolaDwg(comeFlusso(file), controller.signal);
    return rispondi(req, res, 200, png, "image/png", riferimento ? { "X-Planimetria-Dwg": JSON.stringify(riferimento) } : {});
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "";
    const leggibile = /^(DWG oltre|Il (contenuto|file DWG|disegno)|La tavola|L’anteprima)/.test(motivo);
    return rispondi(req, res, 422, { error: leggibile ? motivo : modello
      ? "La ricostruzione del disegno non è riuscita. Puoi aprire l’anteprima da ricalcare."
      : "Non riesco a leggere la tavola da questo DWG. Puoi esportare la singola pianta dal CAD in PDF." });
  } finally {
    clearTimeout(scadenza);
  }
}


const OPERAZIONE_PER_PERCORSO: Record<string, OperazioneMotore> = { "/render": "render", "/dwg": "dwg", "/dwg/modello": "dwg-modello" };

createServer(async (req, res) => {
  const percorso = (req.url ?? "/").split("?", 1)[0];
  if (req.method === "GET" && percorso === "/health") return rispondi(req, res, 200, { ok: true, occupato });
  if (req.method === "OPTIONS") return rispondi(req, res, 204, Buffer.alloc(0));
  const operazione = OPERAZIONE_PER_PERCORSO[percorso];
  if (!operazione) return rispondi(req, res, 404, { error: "Operazione non disponibile." });
  if (req.method !== "POST") return rispondi(req, res, 405, { error: "Usa POST." });

  const token = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const letto = await leggiBiglietto(SEGRETO, token, { adesso: Date.now(), operazione });
  if (!letto.ok) return rispondi(req, res, 401, { error: letto.motivo === "scaduto" ? "Il biglietto è scaduto: riprova." : "Biglietto non valido." });
  for (const [id, scade] of usati) if (scade < Date.now()) usati.delete(id);
  if (usati.has(letto.biglietto.id)) return rispondi(req, res, 409, { error: "Questo biglietto è già stato usato." });
  if (occupato) {
    // Non bruciare il biglietto: il client ne chiede uno nuovo e riprova.
    if (letto.biglietto.addebitato) void segnalaFallito(token);
    return rispondi(req, res, 429, { error: "Il motore sta finendo un altro lavoro. Riprova tra poco." });
  }
  usati.set(letto.biglietto.id, letto.biglietto.scade);
  occupato = true;
  try {
    if (operazione === "render") await render(req, res, token);
    else await dwg(req, res, operazione === "dwg-modello");
  } catch (e) {
    console.error("[motore]", e instanceof Error ? e.message : e);
    if (letto.biglietto.addebitato) void segnalaFallito(token);
    rispondi(req, res, 500, { error: "Il motore non è riuscito a completare il lavoro." });
  } finally {
    occupato = false;
  }
}).listen(PORTA, "0.0.0.0", () => console.log(`[motore] in ascolto sulla porta ${PORTA}`));
