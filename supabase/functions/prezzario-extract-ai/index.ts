import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";

/**
 * prezzario-extract-ai — estrazione AI di un PREZZARIO regionale da testo
 * (incollato da PDF/DOC/HTML), per le regioni che NON pubblicano un Excel/CSV
 * importabile direttamente.
 *
 * MODELLO: replica del pattern di `computo-ai-extract` / `ai-listino-extract`
 * (testo → AI router → JSON strutturato), ma produce il CONTRATTO voci/capitoli
 * di `src/lib/prezzario/import.ts` (lo stesso che consuma `prezzario-import`),
 * così l'output confluisce nella STESSA anteprima Excel della UI.
 *
 * GATE super_admin (fail-closed): requireRole(... ["super_admin"]) interroga
 * `user_roles` E applica l'allowlist email (difesa in profondità, vedi
 * _shared/auth.ts) — identico a `prezzario-import`.
 *
 * AI: aiRouterComplete con taskKey "listino_extract" (già seedato, routed a
 * google/gemini-2.5-flash, text-capable) e `skipCharge: true` — i tool AI
 * super-admin interni girano sul Platform Admin CRM che ha
 * payment_method='none': senza skipCharge il gate carta darebbe 500 (MEMORIA).
 *
 * Body: { testo: string, regione?: string }
 * Risposta: { voci: ParsedVoceImport[], capitoli: ParsedCapitoloImport[],
 *             troncato: boolean, voci_totali: number }
 */

// ── Limite input: tronca testi enormi per stare nel budget token del modello.
// ~30k caratteri ≈ 7-8k token in italiano, abbondante per un singolo prezzario
// (o una sua sezione). Oltre questa soglia segnaliamo `troncato: true` alla UI.
const MAX_TESTO_CHARS = 30_000;

// ── Tipi del contratto di output (mirror di src/lib/prezzario/import.ts) ──────
interface ParsedCapitoloImport {
  codice: string | null;
  titolo: string;
  livello: number;
  ordine: number;
  parentCodice: string | null;
}

interface ParsedVoceImport {
  codice: string | null;
  descrizione: string;
  unita_misura: string | null;
  prezzo: number;
  /** Incidenza manodopera 0..1 (frazione). */
  incidenza_manodopera_pct: number | null;
  /** Incidenza oneri sicurezza 0..1 (frazione). */
  incidenza_sicurezza_pct: number | null;
  capitoloCodice: string | null;
  ordine: number;
  errors: string[];
  warnings: string[];
}

// Forma "grezza" attesa dal modello (prima di normalizzazione/validazione).
interface RawVoce {
  codice?: unknown;
  descrizione?: unknown;
  unita_misura?: unknown;
  prezzo?: unknown;
  incidenza_manodopera_pct?: unknown;
  incidenza_sicurezza_pct?: unknown;
  capitoloCodice?: unknown;
}

interface RawCapitolo {
  codice?: unknown;
  titolo?: unknown;
  livello?: unknown;
  parentCodice?: unknown;
}

// ── Prompt AI ─────────────────────────────────────────────────────────────────
const PREZZARIO_EXTRACTION_PROMPT = `Sei un esperto di prezzari regionali italiani per i lavori pubblici (edilizia/OO.PP.).
Ricevi il TESTO grezzo di un prezzario regionale (estratto da PDF/DOC/HTML, spesso con
impaginazione persa) e devi restituire un JSON strutturato delle VOCI di prezzo.

OBIETTIVO: trasformare il testo in un elenco di voci di prezzario riutilizzabili.
NON è un computo metrico: NON ci sono quantità di progetto, solo PREZZI UNITARI di listino.

REGOLE NUMERI (italiano):
1. Punto = migliaia, virgola = decimali. "1.234,56" -> 1234.56. "234,50" -> 234.50.
2. Apostrofo/spazio come separatore migliaia: "1'234.56" o "1 234,56" -> 1234.56.
3. Solo decimali (",56") -> 0.56. Il prezzo DEVE essere un numero (no simboli/€).

REGOLE VOCI:
4. codice = codice di prezzario (es. "01.A.05.001", "E.01.001", "NP.01.A", "PR.CM"); null se assente.
5. descrizione = descrizione della lavorazione, multi-riga concatenata con spazio singolo (OBBLIGATORIA).
6. unita_misura = U.M. normalizzata: m² -> mq, m³ -> mc, ml, m, kg, cad, nr, a corpo, lt, q, t, h, gg, km; null se assente.
7. prezzo = prezzo unitario numerico (> 0). Se una riga ha più prezzi (es. manodopera/noli/totale),
   usa il PREZZO UNITARIO COMPLESSIVO della voce. Se non c'è un prezzo valido, scarta la riga.
8. incidenza_manodopera_pct = incidenza manodopera come FRAZIONE 0..1 (es. 35% -> 0.35); null se assente.
9. incidenza_sicurezza_pct = incidenza oneri sicurezza come FRAZIONE 0..1; null se assente.
10. capitoloCodice = codice del capitolo/categoria a cui la voce appartiene (es. "01.A"); null se non deducibile.

REGOLE CAPITOLI:
11. Riconosci le righe-intestazione di capitolo/categoria/sezione (titolo senza prezzo, es.
    "01 - OPERE EDILI", "CAP. 2 MURATURE") e mettile in "capitoli" con codice + titolo.
12. livello = profondità gerarchica (0 = top-level). parentCodice = codice del capitolo padre, se gerarchico; altrimenti null.
13. Se non ci sono capitoli espliciti, "capitoli" può essere [].

REGOLE GENERALI:
14. NON inventare codici, prezzi o U.M.: se un dato non è presente nel testo, usa null (o scarta la riga se manca il prezzo).
15. Mantieni l'ordine originale delle voci nel documento.
16. Restituisci SOLO JSON valido (nessun markdown, nessun commento).

STRUTTURA OUTPUT (esatta):
{
  "capitoli": [
    { "codice": "01.A", "titolo": "Opere edili", "livello": 0, "parentCodice": null }
  ],
  "voci": [
    {
      "codice": "01.A.05.001",
      "descrizione": "Muratura in mattoni pieni ...",
      "unita_misura": "mc",
      "prezzo": 345.50,
      "incidenza_manodopera_pct": 0.42,
      "incidenza_sicurezza_pct": null,
      "capitoloCodice": "01.A"
    }
  ]
}`;

// ── Helpers di parsing/normalizzazione (robusti a JSON sporco) ────────────────

/**
 * Parse tollerante dell'output del modello: tenta JSON puro, poi fence
 * ```json ... ```, poi il primo blocco {…} / […] bilanciato (string-aware).
 * Ritorna l'oggetto/array parsato oppure null. Specchio della logica di
 * `extractJson` dell'aiRouter, qui locale per non esportarla.
 */
function safeJsonParse(text: string): unknown {
  if (!text) return null;
  const raw = text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    /* continua */
  }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continua */
    }
  }
  const start = raw.search(/[[{]/);
  if (start >= 0) {
    const open = raw[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(raw.slice(start, i + 1));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

/** Numero da valore eterogeneo, tollerante a virgola IT / € / spazi. null se non interpretabile o ≤ 0 va gestito dal chiamante. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || !/\d/.test(s)) return null;
  // Rimuovi simboli valuta/spazi, gestisci separatori IT: punto migliaia, virgola decimali.
  let cleaned = s.replace(/[€$£\s']/g, "");
  if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  cleaned = cleaned.replace(/[^\d.-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Percentuale → frazione 0..1. "35%"/"35"/35 -> 0.35; "0,35"/0.35 -> 0.35. null se non valida. Clamp 0..1. */
function toFraction(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const raw = typeof v === "string" ? v.replace(/%/g, "") : v;
  const n = toNumber(raw);
  if (n === null || n < 0) return null;
  const frac = n > 1 ? n / 100 : n;
  return frac > 1 ? 1 : frac;
}

/** Stringa trimmata non vuota, oppure null. */
function toStr(v: unknown): string | null {
  if (typeof v !== "string") return v === null || v === undefined ? null : String(v).trim() || null;
  const t = v.trim();
  return t === "" ? null : t;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    // ── 1. Auth + GATE super_admin (fail-closed) ──────────────────────────────
    const { userId, supabaseAdmin } = await requireAuth(req, corsHeaders);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsHeaders);

    // ── 2. Parse + validazione input ─────────────────────────────────────────
    const body = (await req.json().catch(() => null)) as
      | { testo?: unknown; regione?: unknown }
      | null;
    if (!body || typeof body !== "object") {
      return errorResponse("Body JSON mancante o non valido", 400, corsHeaders);
    }
    const testoRaw = typeof body.testo === "string" ? body.testo : "";
    const regione = typeof body.regione === "string" ? body.regione.trim() : "";
    if (!testoRaw.trim()) {
      return errorResponse("Campo 'testo' obbligatorio (incolla il testo del prezzario).", 400, corsHeaders);
    }

    // Tronca input enorme: lo segnaliamo alla UI così l'utente sa che mancano voci.
    const troncato = testoRaw.length > MAX_TESTO_CHARS;
    const testo = troncato ? testoRaw.slice(0, MAX_TESTO_CHARS) : testoRaw;

    // ── 3. Chiamata AI router (skipCharge: true per tool super-admin interno) ──
    const idempotencyKey = await buildStableAiIdempotencyKey("prezzario_extract_ai", [
      userId,
      regione || null,
      testo,
    ]);

    const userPrompt = regione
      ? `Regione: ${regione}.\n\nTesto del prezzario:\n${testo}`
      : `Testo del prezzario:\n${testo}`;

    let aiContent: string;
    try {
      const result = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        // Riusa il task "listino_extract" (già configurato e routed su un
        // modello text-capable). Stessa famiglia "estrazione listino → JSON".
        taskKey: "listino_extract",
        messages: [
          { role: "system", content: PREZZARIO_EXTRACTION_PROMPT },
          { role: "user", content: userPrompt },
        ],
        params: { temperature: 0.1, max_tokens: 8000 },
        responseFormat: { type: "json_object" },
        // Tool super-admin interno: nessun tenant a cui addebitare → skipCharge.
        companyId: null,
        userId,
        skipCharge: true,
        idempotencyKey,
      });
      aiContent = result.content || "";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[prezzario-extract-ai] AI router error:", msg);
      return errorResponse(`Estrazione AI fallita: ${msg}`, 502, corsHeaders);
    }

    // ── 4. Parse + validazione output (robusto a JSON sporco) ─────────────────
    const parsed = safeJsonParse(aiContent);
    if (!parsed || typeof parsed !== "object") {
      return errorResponse(
        "L'AI non ha restituito un JSON interpretabile. Riprova o incolla meno testo.",
        422,
        corsHeaders,
      );
    }
    const root = parsed as { voci?: unknown; capitoli?: unknown };
    const rawVoci = Array.isArray(root.voci) ? (root.voci as RawVoce[]) : [];
    const rawCapitoli = Array.isArray(root.capitoli) ? (root.capitoli as RawCapitolo[]) : [];

    // Capitoli normalizzati (titolo obbligatorio; ordine progressivo dall'output).
    const capitoli: ParsedCapitoloImport[] = [];
    let capOrdine = 0;
    for (const c of rawCapitoli) {
      const titolo = toStr(c?.titolo);
      const codice = toStr(c?.codice);
      // Un capitolo senza titolo né codice è inutile: scartalo.
      if (!titolo && !codice) continue;
      const livelloNum = toNumber(c?.livello);
      capitoli.push({
        codice,
        titolo: titolo ?? codice ?? `Capitolo ${capOrdine + 1}`,
        livello: livelloNum != null && livelloNum >= 0 ? Math.floor(livelloNum) : 0,
        ordine: capOrdine++,
        parentCodice: toStr(c?.parentCodice),
      });
    }

    // Voci normalizzate: ogni voce nel contratto, con errors/warnings per la
    // STESSA anteprima dell'Excel. Le righe senza descrizione o senza prezzo>0
    // ricevono `errors` (l'anteprima le mostra ma l'import le scarta), così il
    // comportamento è identico al flusso Excel.
    const voci: ParsedVoceImport[] = [];
    let voceOrdine = 0;
    for (const v of rawVoci) {
      const errors: string[] = [];
      const warnings: string[] = [];

      const descrizione = toStr(v?.descrizione) ?? "";
      if (!descrizione) errors.push("Descrizione mancante.");

      const prezzoNum = toNumber(v?.prezzo);
      let prezzo = 0;
      if (prezzoNum === null) {
        errors.push("Prezzo non valido o assente.");
      } else if (prezzoNum <= 0) {
        errors.push("Prezzo deve essere maggiore di zero.");
      } else {
        prezzo = prezzoNum;
      }

      // Incidenze: se presenti ma non interpretabili → warning (non bloccante).
      let incMo: number | null = null;
      if (v?.incidenza_manodopera_pct != null && v.incidenza_manodopera_pct !== "") {
        incMo = toFraction(v.incidenza_manodopera_pct);
        if (incMo === null) warnings.push("Incidenza manodopera non valida, ignorata.");
      }
      let incSic: number | null = null;
      if (v?.incidenza_sicurezza_pct != null && v.incidenza_sicurezza_pct !== "") {
        incSic = toFraction(v.incidenza_sicurezza_pct);
        if (incSic === null) warnings.push("Incidenza sicurezza non valida, ignorata.");
      }

      voci.push({
        codice: toStr(v?.codice),
        descrizione,
        unita_misura: toStr(v?.unita_misura),
        prezzo,
        incidenza_manodopera_pct: incMo,
        incidenza_sicurezza_pct: incSic,
        capitoloCodice: toStr(v?.capitoloCodice),
        ordine: voceOrdine++,
        errors,
        warnings,
      });
    }

    if (voci.length === 0) {
      return errorResponse(
        "Nessuna voce estratta dal testo. Verifica che il testo contenga voci di prezzario (descrizione + prezzo).",
        422,
        corsHeaders,
      );
    }

    return jsonResponse(
      {
        voci,
        capitoli,
        troncato,
        voci_totali: voci.length,
      },
      200,
      corsHeaders,
    );
  } catch (err) {
    // Response lanciate dagli helper (401/403) passano inalterate.
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[prezzario-extract-ai] ERROR:", msg);
    return errorResponse("Errore interno del server durante l'estrazione AI del prezzario", 500, corsHeaders);
  }
});
