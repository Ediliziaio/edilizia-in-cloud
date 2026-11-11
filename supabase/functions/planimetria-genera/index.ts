/**
 * planimetria-genera — la pianta generata da ciò che l'impresa ha già.
 *
 * Ingressi (piano «Planimetrie», scelta 3):
 *   documento   PDF o immagine di una pianta (catastale, geometra)      → AI, 1 credito
 *   schizzo     foto di uno schizzo a mano con le misure               → AI, 1 credito
 *   descrizione «trilocale 75 mq, bagno 2×2,5…», tutto stimato        → AI, 1 credito
 *   sopralluogo stanze del sopralluogo (mq, altezza) a riquadri        → senza AI, gratis
 *   dxf         il DXF del tecnico come sfondo da ricalcare            → senza AI, gratis
 *
 * Input JSON:
 *   { company_id, ingresso,
 *     file_path?   (bucket «planimetrie», sotto company_id/) | file_base64? + mime?,
 *     larghezza?, altezza?  (pixel dell'immagine o punti del PDF: senza, la pianta si deforma),
 *     testo?, nota?, survey_id?, dxf_testo? (bastano le prime centinaia di kB) }
 *
 * Output: { success, planimetria (modello della fase 1), generazione (scala,
 *           avvisi, sfondo DXF), origine_versione, tentativi } oppure
 *         { success:false, codice, messaggio } con una frase per l'utente.
 *
 * La pianta NON si salva qui: la salva il browser con planimetria_crea /
 * planimetria_salva_versione (security invoker, coi permessi dell'utente).
 * Quello che esce da qui è già passato dal controllo geometrico della fase 1
 * (controlloAI.ts → shared/planimetrie/controllo.ts): una pianta con errori non
 * arriva al browser. Fanno eccezione il DXF (pianta vuota, da ricalcare) e il
 * sopralluogo, che passano comunque dal controllo nei test.
 *
 * Crediti: come i render (deductRenderCreditSafe), rimborsati se la pianta non
 * viene. Le chiamate al modello non si addebitano una seconda volta
 * (skipCharge). Gli errori del provider (credito finito, chiave) li segnala il
 * router con segnalaErroreAI, nel catch di ogni tentativo.
 */

import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/headers.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { isProviderCreditError } from "../_shared/aiRequestGuard.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { erroreAiPerUtente } from "../_shared/erroriAi.ts";
import { deductRenderCreditSafe, refundRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import { generaPlanimetria, MASSIMO_FOTO_RILIEVO, type ChiamaModello, type Messaggio, type RichiestaGenerazione } from "./genera.ts";
import { planimetriaDaSopralluogo, stanzeDaAreeSopralluogo } from "./daSopralluogo.ts";
import { planimetriaConSfondoDxf } from "./sfondoDxf.ts";
import { dimensioniPdf } from "./dimensioniPdf.ts";
import { VERSIONE_PROMPT } from "./prompt.ts";
import { origineVersione, type PiantaGenerata } from "./generazione.ts";

const NOME = "planimetria-genera";
// Seconda lettura di aperture e superfici discordanti; prompt p3 distingue arredi e serramenti.
const BUCKET = "planimetrie";
/** Scelti col banco di prova (docs/planimetrie/fase3-esito.md). */
// Claude per primo: Gemini 2.5 Pro non finiva mai nei 30 s del router (02/11/2026, prova su 15 piante reali)
// e bruciava mezzo minuto prima del ripiego. Ora ogni chiamata ha 100 s (`timeoutMs`).
const MODELLI = (Deno.env.get("PLANIMETRIA_MODELLI") ?? "anthropic/claude-sonnet-4.5,google/gemini-2.5-pro")
  .split(",").map((m) => m.trim()).filter(Boolean);
// Gli schizzi quotati richiedono lettura delle note e ragionamento geometrico.
// Catena separata: i documenti ordinari mantengono la configurazione esistente.
const MODELLI_SCHIZZO = (Deno.env.get("PLANIMETRIA_MODELLI_SCHIZZO") ?? "anthropic/claude-opus-5.5,anthropic/claude-sonnet-4.5")
  .split(",").map((m) => m.trim()).filter(Boolean);
/** Il gateway chiude a 150 s: 140 s per leggere la pianta, di cui al massimo 110 s per un modello solo. */
const TEMPO_TOTALE_MS = 140_000;
const TEMPO_PER_MODELLO_MS = 110_000;
const MAX_BYTES = 15 * 1024 * 1024;
const MIME_AMMESSI = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const INGRESSI = ["documento", "schizzo", "descrizione", "sopralluogo", "dxf", "rilievo"] as const;
/** «rilievo»: ogni foto di stanza al massimo 3 MB (il browser le riduce prima). */
const MAX_BYTES_FOTO = 3 * 1024 * 1024;
type Ingresso = typeof INGRESSI[number];

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function risposta(g: PiantaGenerata, tentativi: unknown[], mime: string | null, cors: Record<string, string>) {
  return jsonResponse({
    success: true,
    versione_prompt: VERSIONE_PROMPT,
    planimetria: g.planimetria,
    generazione: g.generazione,
    // da passare a planimetria_crea / planimetria_salva_versione
    origine_versione: origineVersione(g.generazione.ingresso, mime),
    tentativi,
  }, 200, cors);
}

function rifiuto(codice: string, messaggio: string, status: number, cors: Record<string, string>) {
  return jsonResponse({ success: false, codice, messaggio }, status, cors);
}

serveConMetricheRapida(NOME, async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return rifiuto("metodo", "Metodo non consentito", 405, cors);

  let addebito: { companyId: string; sessionId: string; userId: string } | null = null;
  // deno-lint-ignore no-explicit-any
  let supabase: any = null;
  try {
    const auth = await requireAuth(req, cors);
    const userId = auth.userId;
    supabase = auth.supabaseAdmin;
    // deno-lint-ignore no-explicit-any
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const companyId = typeof body.company_id === "string" ? body.company_id : "";
    const ingresso = body.ingresso as Ingresso;
    if (!companyId) return rifiuto("richiesta", "Manca l'azienda.", 400, cors);
    if (!INGRESSI.includes(ingresso)) return rifiuto("richiesta", "Ingresso non valido.", 400, cors);
    if (!(await canAccessCompany(supabase, userId, companyId))) {
      return rifiuto("accesso", "Non hai accesso a questa azienda.", 403, cors);
    }

    // ── Senza AI ──────────────────────────────────────────────────────────
    if (ingresso === "sopralluogo") {
      const surveyId = String(body.survey_id ?? "");
      const { data: survey } = await supabase.from("surveys").select("id").eq("id", surveyId).eq("company_id", companyId).maybeSingle();
      if (!survey) return rifiuto("sopralluogo", "Sopralluogo non trovato.", 404, cors);
      const { data: aree, error } = await supabase.from("survey_areas").select("name, area_data, position").eq("survey_id", surveyId).order("position");
      if (error) throw error;
      try {
        const g = planimetriaDaSopralluogo(stanzeDaAreeSopralluogo(aree ?? []), `sopralluogo:${surveyId}`);
        return risposta(g, [], null, cors);
      } catch (e) {
        return rifiuto("sopralluogo_vuoto", (e as Error).message, 422, cors);
      }
    }
    if (ingresso === "dxf") {
      const path = String(body.file_path ?? "");
      if (!path.startsWith(`${companyId}/`) || path.includes("..")) return rifiuto("richiesta", "File non valido.", 400, cors);
      try {
        return risposta(planimetriaConSfondoDxf(String(body.dxf_testo ?? ""), path), [], null, cors);
      } catch (e) {
        return rifiuto("dxf", (e as Error).message, 422, cors);
      }
    }

    // ── Con AI ────────────────────────────────────────────────────────────
    const richiesta: RichiestaGenerazione = {
      ingresso,
      testo: typeof body.testo === "string" ? body.testo : undefined,
      nota: typeof body.nota === "string" ? body.nota : undefined,
      sorgentePath: typeof body.file_path === "string" ? body.file_path : null,
    };
    let impronta = String(body.testo ?? "");
    if (ingresso === "rilievo") {
      if (!richiesta.testo?.trim()) return rifiuto("ingresso_mancante", "Scrivi o detta le misure delle stanze.", 400, cors);
      const foto = Array.isArray(body.foto_base64) ? body.foto_base64 : [];
      if (foto.length > MASSIMO_FOTO_RILIEVO) return rifiuto("file", `Al massimo ${MASSIMO_FOTO_RILIEVO} foto.`, 413, cors);
      richiesta.foto = [];
      for (const f of foto) {
        if (typeof f !== "string" || !/^[A-Za-z0-9+/=]+$/.test(f.slice(0, 200))) return rifiuto("file", "Una foto non è valida.", 400, cors);
        if (f.length * 0.75 > MAX_BYTES_FOTO) return rifiuto("file", "Una foto è troppo grande: riprova.", 413, cors);
        richiesta.foto.push(`data:image/jpeg;base64,${f}`);
        impronta += f.slice(0, 500) + f.length;
      }
    }
    // lo schizzo del rilievo è facoltativo; per documento e schizzo il file serve
    const conFile = ingresso === "documento" || ingresso === "schizzo" || (ingresso === "rilievo" && (body.file_path || body.file_base64));
    if (conFile) {
      let bytes: Uint8Array;
      let mime = String(body.mime ?? "");
      if (typeof body.file_path === "string" && body.file_path) {
        const path = body.file_path;
        if (!path.startsWith(`${companyId}/`) || path.includes("..")) return rifiuto("richiesta", "File non valido.", 400, cors);
        const { data, error } = await supabase.storage.from(BUCKET).download(path);
        if (error || !data) return rifiuto("file", "Il file caricato non si trova più: ricaricalo.", 404, cors);
        bytes = new Uint8Array(await data.arrayBuffer());
        mime = mime || data.type;
      } else if (typeof body.file_base64 === "string" && body.file_base64) {
        bytes = Uint8Array.from(atob(body.file_base64), (c) => c.charCodeAt(0));
      } else {
        return rifiuto("ingresso_mancante", "Manca il file da cui partire.", 400, cors);
      }
      if (!MIME_AMMESSI.includes(mime)) return rifiuto("file", "Carica un PDF o un'immagine (JPG, PNG).", 415, cors);
      if (bytes.length > MAX_BYTES) return rifiuto("file", "Il file è troppo grande (massimo 15 MB).", 413, cors);
      let larghezza = Number(body.larghezza) || null;
      let altezza = Number(body.altezza) || null;
      if (mime === "application/pdf" && !(larghezza && altezza)) {
        const d = dimensioniPdf(bytes);
        larghezza = d?.larghezza ?? null;
        altezza = d?.altezza ?? null;
      }
      const b64 = base64(bytes);
      impronta += b64.slice(0, 4000) + b64.length;
      richiesta.file = { dataUrl: `data:${mime};base64,${b64}`, mime, nome: richiesta.sorgentePath?.split("/").pop() ?? "pianta", larghezza, altezza };
    }

    const sessionId = crypto.randomUUID();
    const credito = await deductRenderCreditSafe(supabase, {
      companyId, sessionId, userId,
      reasonMeta: { vertical: "planimetria", edge_fn: NOME, ingresso },
      logTag: NOME,
    });
    if (credito.status === "insufficient") {
      return rifiuto("crediti", "Crediti AI esauriti: ricaricali per generare la pianta.", 402, cors);
    }
    addebito = { companyId, sessionId, userId };

    const chiaveBase = await buildStableAiIdempotencyKey("planimetria_genera", [companyId, userId, ingresso, impronta, VERSIONE_PROMPT]);
    const inizioChiamate = Date.now();
    const chiama: ChiamaModello = async (messaggi: Messaggio[], tentativo: number) => {
      // Il primo modello; se il provider non risponde, il secondo con il tempo che resta (il gateway chiude
      // a 150 s). Nessun ripiego automatico del router: la catena di default ha modelli che non vedono immagini.
      let ultimoErrore: unknown = null;
      for (const modello of ingresso === "schizzo" ? MODELLI_SCHIZZO : MODELLI) {
        const resto = TEMPO_TOTALE_MS - (Date.now() - inizioChiamate);
        if (resto < 20_000) break;
        try {
          const r = await aiRouterComplete({
            supabase,
            taskKey: "planimetria_genera",
            forceModel: modello,
            disableModelFallback: true,
            skipCharge: true,
            messages: messaggi,
            params: { temperature: 0.1, max_tokens: tentativo === 3 ? 4000 : 12000, timeoutMs: tentativo === 3 ? Math.min(25_000, resto) : Math.min(TEMPO_PER_MODELLO_MS, Math.max(1_000, resto - 25_000)) },
            responseFormat: { type: "json_object" },
            companyId,
            userId,
            sessionId,
            idempotencyKey: `${chiaveBase}:${tentativo}:${modello}`,
          });
          return { testo: r.content, modello: r.modelUsed, costoUsd: r.costUsd };
        } catch (e) {
          // I modelli condividono il conto OpenRouter: dopo un 402 si rimborsa subito.
          if (isProviderCreditError(e)) throw e;
          ultimoErrore = e;
          console.warn(`[${NOME}] ${modello} non ha risposto:`, e instanceof Error ? e.message : e);
        }
      }
      throw ultimoErrore ?? new Error("Nessun modello disponibile");
    };

    const esito = await generaPlanimetria(richiesta, chiama, { tempoMassimoMs: TEMPO_TOTALE_MS });
    const tentativi = esito.tentativi.map((t) => ({ modello: t.modello, durata_ms: t.durataMs, problemi: t.errori }));
    if (!esito.ok) {
      await refundRenderCreditSafe(supabase, { ...addebito, reasonMeta: { motivo: esito.codice, edge_fn: NOME }, logTag: NOME });
      addebito = null;
      return jsonResponse({ success: false, codice: esito.codice, messaggio: esito.messaggio, tentativi }, 422, cors);
    }
    return risposta(esito.pianta, tentativi, richiesta.file?.mime ?? null, cors);
  } catch (err) {
    if (err instanceof Response) return err;
    if (addebito && supabase) {
      await refundRenderCreditSafe(supabase, { ...addebito, reasonMeta: { motivo: "errore", edge_fn: NOME }, logTag: NOME });
    }
    const noto = erroreAiPerUtente(err);
    if (noto) return jsonResponse(noto.body, noto.status, cors);
    console.error(`[${NOME}]`, err);
    return rifiuto("errore", "Qualcosa non ha funzionato: riprova fra poco.", 500, cors);
  }
});

// 11/11/2026: ripubblicata per _shared/erroriAi.ts — anche «Abbonamento sospeso o scaduto» risponde 402 payment_method_required col testo vero.
