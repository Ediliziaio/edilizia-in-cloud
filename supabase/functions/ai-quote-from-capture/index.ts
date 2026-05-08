/**
 * ai-quote-from-capture — orchestratore unificato
 *
 * Input (POST JSON):
 *   {
 *     run_id?: uuid,           // se omesso, crea nuovo run
 *     capture_mode: 'foto'|'audio'|'testo'|'mixed',
 *     image_paths?: string[],  // path bucket documenti-smart
 *     audio_path?: string,     // path bucket documenti-smart (audio)
 *     description?: string,    // testo libero (anche transcript pre-fatto)
 *     vertical_key?: string,   // serramentisti, edili_generaliste, ...
 *   }
 *
 * Flow:
 *   STEP 1 — Audio: silvio-transcribe-audio se audio_path presente
 *   STEP 2 — Vision/text: OpenAI gpt-4o-mini con prompt strutturato
 *            estrae { customer, products, note, avvertenze }
 *   STEP 3 — Match prodotti: pgvector (match_articles + match_families_semantic)
 *            + product_aliases (silvio_tool_match_product_alias)
 *   STEP 4 — Pricing iniziale: listino_griglia + maggiorazioni assi
 *   STEP 5 — Output strutturato per UI review (NO insert quote — review-then-save)
 *
 * UI poi chiama silvio_tool_apply_capture_review per persistenza finale.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { generateEmbedding } from "../_shared/brainEmbed.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

interface CaptureRequest {
  run_id?: string;
  company_id?: string;
  capture_mode: "foto" | "audio" | "testo" | "mixed";
  image_paths?: string[];
  audio_path?: string;
  description?: string;
  vertical_key?: string;
}

interface ExtractedCustomer {
  nome?: string;
  cognome?: string;
  azienda?: string;
  telefono?: string;
  email?: string;
  indirizzo?: string;
  citta?: string;
  provincia?: string;
  cap?: string;
  paese?: string;
  cf?: string;
  piva?: string;
  confidence: number;
}

interface ExtractedProductRaw {
  descrizione_grezza: string;
  quantita?: number;
  unita_misura?: string;
  misure?: { x?: number; y?: number; unit?: string };
  attributi?: string[];
  note?: string;
}

interface MatchedProduct extends ExtractedProductRaw {
  matched_template_id?: string;
  matched_family_id?: string;
  matched_tariffa_id?: string;
  matched_name?: string;
  match_type?: "alias" | "vector" | "manual" | "none";
  match_confidence?: number;
  unit_price?: number;
  unit_price_source?: "griglia" | "template" | "tariffa" | "fallback";
  axis_selections?: Record<string, string>;
}

interface ExtractionResult {
  customer: ExtractedCustomer | null;
  products: MatchedProduct[];
  note?: string;
  avvertenze: string[];
  cantiere?: { indirizzo?: string; descrizione?: string };
  global_confidence: number;
}

const SYSTEM_PROMPT = `Sei l'assistente AI di Edilizia in Cloud, esperto edilizia/serramenti italiani. Estrai informazioni strutturate da foto di fogli scritti a mano, scontrini, schizzi tecnici, oppure da trascrizioni vocali di un commerciale che dopo una visita cliente racconta cosa gli ha chiesto.

OUTPUT: solo JSON valido, niente markdown, niente testo extra. Schema:
{
  "customer": {
    "nome": "...",          // nome di battesimo o nome completo se non separabile
    "cognome": "...",
    "azienda": "...",       // ragione sociale se cliente B2B
    "telefono": "...",      // formato libero, l'app normalizza
    "email": "...",
    "indirizzo": "...",     // via + civico
    "citta": "...",
    "provincia": "...",     // sigla 2 lettere se evidente
    "cap": "...",           // 5 cifre
    "cf": "...",            // 16 caratteri
    "piva": "...",          // 11 cifre
    "confidence": 0.0-1.0   // tua confidence sulla qualità estratta
  },
  "cantiere": {
    "indirizzo": "...",     // se diverso da indirizzo cliente
    "descrizione": "..."    // tipo lavoro generale
  },
  "products": [
    {
      "descrizione_grezza": "infisso PVC bianco 1200x1400 a battente",
      "quantita": 2,
      "unita_misura": "pz",
      "misure": { "x": 1200, "y": 1400, "unit": "mm" },
      "attributi": ["PVC", "bianco", "battente"],
      "note": "..."
    }
  ],
  "note": "Note libere dal foglio/audio (es. 'posa inclusa', 'urgente')",
  "avvertenze": ["..."]    // dubbi o ambiguità che richiedono review umano
}

REGOLE:
1. Se non trovi un campo, ometti la chiave (NON usare null o stringa vuota).
2. Misure: converti sempre a millimetri. "1.2m" → 1200, "120cm" → 1200, "12 dm" → 1200.
3. Quantità: estrai solo numero. "due pezzi" → 2. Se non chiaro, NON inventare → segnala in avvertenze.
4. Telefono: lascia formato originale, solo trim spazi. Italiani → l'app normalizza dopo.
5. Email: lowercase.
6. Province italiane: sigla 2 lettere se città chiara (Milano→MI, Bergamo→BG).
7. Confidence: 1.0 se foglio chiaro/voce nitida, scendi a 0.5 se molti ambiguità, 0.2 se "credo che dica X ma forse Y".
8. avvertenze: lista cose da verificare ("misura altezza non chiara", "due nomi possibili: Rossi o Russo").
9. NON inventare prezzi. Il pricing avviene dopo nel sistema.
10. attributi: tag corti utili per matching (materiale, colore, tipo apertura, ecc.).`;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return jsonOk({ error: "method_not_allowed" }, 405, cors);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonOk({ error: "unauthorized" }, 401, cors);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const supaWithAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  /**
   * Helper UPDATE su preventivo_da_foto_runs con error logging esplicito.
   *
   * Risolve P0: il client supabase NON solleva eccezione né ritorna errore al
   * caller se l'UPDATE è rifiutato silenziosamente (check constraint, RLS,
   * network). Questo ha già causato un incidente (status='processing' rifiutato
   * dal check constraint, run resta orfano in 'pending', UI vede 0 voci).
   *
   * Ora ogni UPDATE è seguito da .select().single() che forza la lettura del
   * record aggiornato: se la condizione WHERE non matcha o la modifica è
   * rifiutata, error viene popolato e loggato nei console.error dell'edge.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function updateRun(runId: string, patch: Record<string, any>): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("preventivo_da_foto_runs")
      .update(patch)
      .eq("id", runId)
      .select("id")
      .single();
    if (error) {
      console.error(
        `[ai-quote-from-capture] updateRun(${runId}) failed:`,
        error.message,
        "patch keys:",
        Object.keys(patch),
      );
      return false;
    }
    return true;
  }

  // Resolve user / company
  const { data: { user } } = await supaWithAuth.auth.getUser();
  if (!user) return jsonOk({ error: "unauthorized" }, 401, cors);

  let body: CaptureRequest;
  try {
    body = await req.json();
  } catch {
    return jsonOk({ error: "invalid_json" }, 400, cors);
  }

  // Resolve company_id
  let companyId = body.company_id;
  if (!companyId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: prof } = await (supabase as any)
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    companyId = prof?.company_id;
  }
  if (!companyId) return jsonOk({ error: "company_id_required" }, 400, cors);

  try {
    await requireCompanyAccess(supabase, user.id, companyId, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    return jsonOk({ error: "tenant_access_check_failed" }, 403, cors);
  }

  const t0 = Date.now();
  const summary: {
    run_id?: string;
    audio_transcript?: string;
    extraction?: ExtractionResult;
    duration_ms?: number;
    errors: string[];
  } = { errors: [] };

  try {
    // ─── STEP 0: Crea o riusa run ──────────────────────────────────────────
    let runId = body.run_id;
    if (!runId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: createRes } = await (supabase as any).rpc("silvio_tool_create_capture_run", {
        p_company_id: companyId,
        p_capture_mode: body.capture_mode,
        p_image_paths: body.image_paths ?? null,
        p_audio_path: body.audio_path ?? null,
        p_description: body.description ?? null,
        p_vertical_key: body.vertical_key ?? null,
      });
      runId = (createRes as { run_id?: string } | null)?.run_id;
      if (!runId) {
        return jsonOk({ error: "run_creation_failed", detail: createRes }, 500, cors);
      }
    }
    summary.run_id = runId;

    await updateRun(runId, { status: "analyzing_images", updated_at: new Date().toISOString() });

    // ─── STEP 1: Audio transcription ────────────────────────────────────────
    let transcript = body.description ?? "";
    if (body.audio_path) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: audioBlob, error: dlErr } = await (supabase as any).storage
          .from("documenti-smart")
          .download(body.audio_path);
        if (dlErr) throw new Error(`audio_download: ${dlErr.message}`);

        // Chiamata edge silvio-transcribe-audio
        const formData = new FormData();
        formData.append("audio", audioBlob, "audio.webm");
        const transcribeRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/silvio-transcribe-audio`,
          {
            method: "POST",
            headers: { Authorization: authHeader },
            body: formData,
          },
        );
        if (transcribeRes.ok) {
          const transcribeData = await transcribeRes.json();
          const newTranscript = transcribeData?.text ?? transcribeData?.testo ?? "";
          transcript = transcript ? `${transcript}\n\n${newTranscript}` : newTranscript;
          summary.audio_transcript = newTranscript;
        } else {
          summary.errors.push(`audio_transcribe_failed: ${transcribeRes.status}`);
        }
      } catch (e) {
        summary.errors.push(`audio: ${(e as Error).message}`);
      }
    }

    // Salva trascrizione
    if (transcript) {
      await updateRun(runId, { audio_transcript: transcript, updated_at: new Date().toISOString() });
    }

    // ─── STEP 2: Estrazione strutturata via AI ──────────────────────────────
    const userMessage = await buildUserMessage(supabase, body.image_paths, transcript, body.vertical_key);

    let extraction: ExtractionResult;
    try {
      const aiRes = await aiRouterComplete({
        supabase,
        taskKey: body.image_paths && body.image_paths.length > 0 ? "vision_cantiere" : "preventivo_genera",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        params: { temperature: 0.1, max_tokens: 3000 },
        responseFormat: { type: "json_object" },
        companyId,
        userId: user.id,
        personaKey: "sales",
        estimatedCostEur: body.image_paths && body.image_paths.length > 0 ? 0.05 : 0.02,
      });

      const parsed = parseExtractionJson(aiRes.content);
      const parsedProducts = Array.isArray(parsed.products) ? parsed.products : [];
      const parsedWarnings = Array.isArray(parsed.avvertenze) ? parsed.avvertenze : [];
      if (parsedProducts.length === 0) {
        parsedWarnings.push("Nessuna voce preventivo riconosciuta: aggiungi o correggi manualmente in review.");
      }
      extraction = {
        customer: parsed.customer ?? null,
        products: parsedProducts as MatchedProduct[],
        note: parsed.note,
        avvertenze: parsedWarnings,
        cantiere: parsed.cantiere,
        global_confidence: computeGlobalConfidence(parsed),
      };
    } catch (e) {
      await updateRun(runId, {
        status: "failed",
        error_step: "extraction",
        error_message: (e as Error).message,
      });
      return jsonOk({ run_id: runId, error: "extraction_failed", message: (e as Error).message }, 500, cors);
    }

    // ─── STEP 3: Match prodotti listino (parallelo: max 5 concurrent) ─────────
    const MATCH_CONCURRENCY = 5;

    // Funzione per matchare un singolo prodotto (alias → vector → pricing)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchSingleProduct = async (p: any) => {
      try {
        // 3a. Prima cerco alias rapido
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: aliasMatch } = await (supabase as any).rpc(
          "silvio_tool_match_product_alias",
          { p_company_id: companyId, p_alias_text: p.descrizione_grezza },
        );

        if ((aliasMatch as { match?: boolean } | null)?.match) {
          const m = aliasMatch as {
            article_template_id?: string;
            family_id?: string;
            tariffa_id?: string;
            confidence: number;
          };
          p.matched_template_id = m.article_template_id;
          p.matched_family_id = m.family_id;
          p.matched_tariffa_id = m.tariffa_id;
          p.match_type = "alias";
          p.match_confidence = m.confidence;
        } else {
          // 3b. Fallback su pgvector match_articles
          await matchViaVector(supabase, companyId, p);
        }

        // 3c. Pricing iniziale (best-effort)
        await fillInitialPrice(supabase, companyId, p);
      } catch (e) {
        // Non fatale — l'utente correggerà in review
        extraction.avvertenze.push(`Match prodotto fallito: ${p.descrizione_grezza}`);
        console.error("match_failed", p.descrizione_grezza, e);
      }
    };

    // Processa in batch da MATCH_CONCURRENCY per evitare sovraccarico DB
    for (let i = 0; i < extraction.products.length; i += MATCH_CONCURRENCY) {
      await Promise.allSettled(
        extraction.products.slice(i, i + MATCH_CONCURRENCY).map(matchSingleProduct),
      );
    }

    summary.extraction = extraction;

    // ─── STEP 4: Salva estratto sul run (UI review legge da qui) ────────────
    // CRITICAL: se questo UPDATE fallisce, l'utente vede review panel vuoto.
    // updateRun logga errore + ritorna false → segnaliamo error al client.
    const persistOk = await updateRun(runId, {
      status: "draft_ready",
      extracted_customer_data: extraction.customer,
      extracted_products: extraction.products,
      extraction_confidence: extraction.global_confidence,
      vision_results: { extraction, raw_transcript: transcript },
      updated_at: new Date().toISOString(),
    });
    if (!persistOk) {
      summary.errors.push("persist_extraction_failed");
      return jsonOk(
        { ...summary, error: "persist_failed", run_id: runId },
        500,
        cors,
      );
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary, 200, cors);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    summary.errors.push(`fatal: ${(e as Error).message}`);
    return jsonOk(summary, 500, cors);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function buildUserMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  imagePaths: string[] | undefined,
  transcript: string,
  verticalKey: string | undefined,
): Promise<string | Array<{ type: string; text?: string; image_url?: { url: string } }>> {
  const verticalNote = verticalKey
    ? `\n\nVERTICAL DOMINIO: ${verticalKey} — usa terminologia specifica del settore.`
    : "";
  const textPart = transcript
    ? `${transcript.trim()}${verticalNote}`
    : `Estrai i dati dalla foto allegata.${verticalNote}`;

  if (!imagePaths || imagePaths.length === 0) {
    return textPart;
  }

  // Multimodal: testo + immagini
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text: textPart },
  ];

  for (const path of imagePaths) {
    try {
      const { data: signed } = await supabase.storage
        .from("documenti-smart")
        .createSignedUrl(path, 3600);
      if (signed?.signedUrl) {
        content.push({ type: "image_url", image_url: { url: signed.signedUrl } });
      }
    } catch (e) {
      console.error("signed_url_failed", path, e);
    }
  }
  return content;
}

function parseExtractionJson(rawContent: string): {
  customer?: ExtractedCustomer;
  products?: ExtractedProductRaw[];
  note?: string;
  avvertenze?: string[];
  cantiere?: { indirizzo?: string; descrizione?: string };
} {
  // Strippa markdown fence (anche multipli — Mistral Medium li annida)
  let text = rawContent.trim();
  text = text.replace(/```(?:json|markdown)?\s*\n?/gi, "").replace(/\n?```\s*/g, "").trim();
  // Trova il primo { e l'ultimo }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text);
  } catch (parseErr) {
    // Fallback: tenta a recuperare il `products` array con regex tollerante.
    // Tipico problema: AI ritorna JSON con newline non escapati nelle stringhe
    // descrizione/note → JSON.parse fallisce ma noi possiamo comunque estrarre
    // i dati strutturati. Meglio mostrare voci recuperate che 'extraction_failed'.
    console.warn("[ai-quote-from-capture] parseExtractionJson primary failed:", (parseErr as Error).message);
    return recoverFromMalformedExtractJson(text);
  }
}

/**
 * Best-effort recovery quando JSON.parse fallisce su risposte AI malformate.
 * Estrae products via regex su pattern `{ "descrizione_grezza": "...", ... }`
 * e customer via regex sui campi atomici.
 *
 * Filosofia: meglio voci parziali da correggere in review che 'extraction_failed'
 * che costringe l'utente a riuploadare tutto.
 */
function recoverFromMalformedExtractJson(text: string): {
  customer?: ExtractedCustomer;
  products?: ExtractedProductRaw[];
  note?: string;
  avvertenze?: string[];
  cantiere?: { indirizzo?: string; descrizione?: string };
} {
  const products: ExtractedProductRaw[] = [];
  // Match ogni oggetto product: cerca "descrizione_grezza":"<text>" + opzionali quantita/misure
  const productPattern = /"descrizione_grezza"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?(?="descrizione_grezza"|$)/gs;
  let m: RegExpExecArray | null;
  while ((m = productPattern.exec(text)) !== null) {
    const block = m[0];
    const desc = m[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
    const qty = /"quantita"\s*:\s*([\d.]+)/.exec(block)?.[1];
    const um = /"unita_misura"\s*:\s*"([^"]+)"/.exec(block)?.[1];
    const x = /"x"\s*:\s*([\d.]+)/.exec(block)?.[1];
    const y = /"y"\s*:\s*([\d.]+)/.exec(block)?.[1];
    products.push({
      descrizione_grezza: desc,
      quantita: qty ? parseFloat(qty) : 1,
      unita_misura: um ?? "pz",
      misure: (x || y) ? { x: x ? parseInt(x) : undefined, y: y ? parseInt(y) : undefined, unit: "mm" } : undefined,
    });
  }

  // Customer atomic fields
  const grab = (key: string) => new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`).exec(text)?.[1];
  const customer: ExtractedCustomer | undefined = grab("nome") || grab("cognome") || grab("telefono") || grab("email")
    ? {
        nome: grab("nome"),
        cognome: grab("cognome"),
        azienda: grab("azienda"),
        telefono: grab("telefono"),
        email: grab("email"),
        indirizzo: grab("indirizzo"),
        citta: grab("citta"),
        provincia: grab("provincia"),
        cap: grab("cap"),
        cf: grab("cf"),
        piva: grab("piva"),
        confidence: 0.4, // recovery → confidence ridotta
      }
    : undefined;

  return {
    customer,
    products,
    note: grab("note"),
    avvertenze: ["Estrazione in modalità recovery: alcuni dati possono essere incompleti."],
    cantiere: grab("indirizzo") ? { indirizzo: grab("indirizzo") } : undefined,
  };
}

function computeGlobalConfidence(parsed: {
  customer?: ExtractedCustomer;
  products?: ExtractedProductRaw[];
  avvertenze?: string[];
}): number {
  const customerConf = parsed.customer?.confidence ?? 0.5;
  const hasProducts = (parsed.products?.length ?? 0) > 0 ? 0.3 : 0;
  const avvertenzePenalty = Math.min(0.3, (parsed.avvertenze?.length ?? 0) * 0.05);
  return Math.max(0, Math.min(1, 0.4 + customerConf * 0.3 + hasProducts - avvertenzePenalty));
}

async function matchViaVector(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  product: MatchedProduct,
): Promise<void> {
  try {
    const queryText = [
      product.descrizione_grezza,
      ...(product.attributi ?? []),
    ].filter(Boolean).join(" ");

    const embedding = await generateEmbedding(queryText);
    const embeddingLiteral = `[${embedding.join(",")}]`;

    // Provo prima famiglie (più probabile per serramenti)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: familyMatches, error: familyMatchError } = await (supabase as any).rpc("match_families_semantic", {
      p_query_embedding: embeddingLiteral,
      p_match_threshold: 0.5,
      p_match_count: 3,
      p_company_id: companyId,
    });
    if (familyMatchError) {
      console.warn("family_vector_match_failed", familyMatchError.message);
    }

    const topFamily = (familyMatches as Array<{
      id: string;
      nome?: string;
      name?: string;
      similarity: number;
    }> | null)?.[0];

    if (topFamily && topFamily.similarity > 0.55) {
      product.matched_family_id = topFamily.id;
      product.matched_name = topFamily.nome ?? topFamily.name;
      product.match_type = "vector";
      product.match_confidence = topFamily.similarity;
      return;
    }

    // Fallback su articoli singoli
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: articleMatches, error: articleMatchError } = await (supabase as any).rpc("match_articles", {
      p_query_embedding: embeddingLiteral,
      p_match_threshold: 0.5,
      p_match_count: 3,
      p_company_id: companyId,
    });
    if (articleMatchError) {
      console.warn("article_vector_match_failed", articleMatchError.message);
    }
    const topArticle = (articleMatches as Array<{
      id: string;
      name?: string;
      similarity: number;
    }> | null)?.[0];

    if (topArticle && topArticle.similarity > 0.5) {
      product.matched_template_id = topArticle.id;
      product.matched_name = topArticle.name;
      product.match_type = "vector";
      product.match_confidence = topArticle.similarity;
      return;
    }

    product.match_type = "none";
  } catch (e) {
    console.error("vector_match_failed", e);
    product.match_type = "none";
  }
}

async function fillInitialPrice(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  product: MatchedProduct,
): Promise<void> {
  // Caso 1: family_id con griglia → cerca cella W×H
  if (product.matched_family_id && product.misure?.x && product.misure?.y) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cells } = await (supabase as any)
        .from("listino_griglia")
        .select("valore_x, valore_y, prezzo_vendita")
        .eq("company_id", companyId)
        .eq("family_id", product.matched_family_id);

      if (cells && cells.length > 0) {
        const w = product.misure.x;
        const h = product.misure.y;
        // Esatto
        let cell = (cells as Array<{ valore_x: number; valore_y: number; prezzo_vendita: number }>).find(
          (c) => c.valore_x === w && c.valore_y === h,
        );
        // Round-up
        if (!cell) {
          const containing = (cells as Array<{ valore_x: number; valore_y: number; prezzo_vendita: number }>)
            .filter((c) => c.valore_x >= w && c.valore_y >= h);
          if (containing.length > 0) {
            cell = containing.reduce((min, c) =>
              c.valore_x * c.valore_y < min.valore_x * min.valore_y ? c : min, containing[0]);
          }
        }
        if (cell) {
          product.unit_price = Number(cell.prezzo_vendita);
          product.unit_price_source = "griglia";
          return;
        }
      }
    } catch (e) {
      console.error("griglia_lookup_failed", e);
    }
  }

  // Caso 2: article_template_id → prendi prezzo da template
  if (product.matched_template_id) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: tmpl } = await (supabase as any)
        .from("article_templates")
        .select("price, sale_price, default_price")
        .eq("id", product.matched_template_id)
        .single();
      const tmplPrice = tmpl?.sale_price ?? tmpl?.price ?? tmpl?.default_price;
      if (tmplPrice && Number(tmplPrice) > 0) {
        product.unit_price = Number(tmplPrice);
        product.unit_price_source = "template";
        return;
      }
    } catch (e) {
      console.error("template_price_failed", e);
    }
  }

  // Fallback: lascio undefined → l'utente metterà in review
  product.unit_price_source = "fallback";
}

function jsonOk(body: unknown, status = 200, corsHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(corsHeaders ?? {}),
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": corsHeaders?.["Access-Control-Allow-Origin"] ?? "*",
      "Access-Control-Allow-Headers": corsHeaders?.["Access-Control-Allow-Headers"] ?? "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": corsHeaders?.["Access-Control-Allow-Methods"] ?? "POST, OPTIONS",
    },
  });
}
