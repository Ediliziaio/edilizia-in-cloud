/**
 * ragInjector — MP-01 Pre-RAG automatico
 *
 * Per ogni messaggio utente, prima ancora che il modello risponda,
 * carichiamo automaticamente:
 *   - Top-K chunk dalla KB universale (Cervello Supremo) filtrati per
 *     kb_areas_filter della persona corrente
 *   - Top-K chunk dal Company Brain (commesse, clienti, fatture, note)
 *
 * Questi chunk vengono iniettati nel system prompt come blocco "# CONTEXT RAG"
 * con citation marker [S1], [S2], ... in modo che il modello sia GROUNDED
 * fin dal primo turno, senza dover decidere se chiamare search_brain.
 *
 * Il tool search_brain resta disponibile per query di approfondimento mid-chat.
 *
 * Costo: ~€0.00002 per chiamata (1 embedding + 2 RPC). Trascurabile.
 *
 * Feature flag: PRE_RAG_DISABLED=1 per disattivare e tornare a comportamento
 * legacy (utile per rollback).
 */
import { generateEmbedding } from "./brainEmbed.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface RagSource {
  id: string;            // "S1", "S2"...
  scope: "universal" | "company";
  area?: string;         // solo per universal
  source_type?: string;  // solo per company
  title: string;
  similarity: number;
  snippet: string;
  doc_id?: string;       // ai_brain_documents.id (per audit/trace)
  /** Chunk ID univoco breve — l'LLM lo cita come [chunk:abc12345] */
  chunk_id?: string;
  /** Last verified date — l'LLM avvisa se obsoleto */
  last_verified_at?: string;
  /** Validity end — l'LLM avvisa se scaduto */
  valid_until?: string;
  /** Anti-pattern rules che l'LLM deve rispettare */
  anti_patterns?: Array<{ if_query_contains?: string[]; do_not_say?: string[]; reason?: string }>;
}

export interface RagInjectionResult {
  contextBlock: string;       // pronto da concatenare al system prompt
  sources: RagSource[];
  embeddingTokens: number;
  minSimilarity: number;      // per confidence calibration
  totalChunks: number;
  durationMs: number;
}

export interface BuildPreRagOptions {
  supabase: SupabaseClient;
  query: string;
  companyId: string | null;
  kbAreasFilter: string[] | null;
  topKUniversal?: number;     // default 3
  topKCompany?: number;       // default 3
  minSimilarity?: number;     // default 0.30
  /** Skip totale (es. quando query è solo saluto, < 5 char). */
  skipIfShort?: boolean;
}

const EMPTY_RESULT: RagInjectionResult = {
  contextBlock: "",
  sources: [],
  embeddingTokens: 0,
  minSimilarity: 0,
  totalChunks: 0,
  durationMs: 0,
};

/**
 * Costruisce il blocco CONTEXT RAG da iniettare nel system prompt.
 *
 * Restituisce SEMPRE un risultato (mai throw). In caso di errore
 * (embed fallito, RPC fuori), logga warning e ritorna EMPTY_RESULT
 * — così la conversazione prosegue degradata ma non si blocca.
 */
export async function buildPreRagContext(opts: BuildPreRagOptions): Promise<RagInjectionResult> {
  // Feature flag rollback
  if (Deno.env.get("PRE_RAG_DISABLED") === "1") {
    return EMPTY_RESULT;
  }

  const query = (opts.query ?? "").trim();
  if (!query) return EMPTY_RESULT;
  if ((opts.skipIfShort ?? true) && query.length < 5) return EMPTY_RESULT;

  const tkU = opts.topKUniversal ?? 3;
  const tkC = opts.topKCompany ?? 3;
  const minSim = opts.minSimilarity ?? 0.30;
  const t0 = Date.now();

  // 1. Embed query
  let embedding: number[];
  let embeddingTokens = 0;
  try {
    embedding = await generateEmbedding(query);
    // brainEmbed non ritorna usage; usage approssimato 1 token ≈ 4 char ASCII
    embeddingTokens = Math.ceil(query.length / 4);
  } catch (e) {
    console.warn("[ragInjector] embed failed:", e instanceof Error ? e.message : String(e));
    return { ...EMPTY_RESULT, durationMs: Date.now() - t0 };
  }

  // 2. Parallel: universal + company
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [universalRes, companyRes] = await Promise.all([
    // Universal: usa pgvector embedding directly
    opts.supabase.rpc("match_brain_universal", {
      p_query_embedding: embedding,
      p_match_count: tkU,
      p_min_similarity: minSim,
      p_kb_areas: opts.kbAreasFilter,
    }) as Promise<{ data: any[] | null; error: any }>,

    // Company: solo se abbiamo company_id
    opts.companyId
      ? (opts.supabase.rpc("match_brain", {
          p_company_id: opts.companyId,
          p_query_embedding: embedding,
          p_match_count: tkC,
          p_min_similarity: minSim,
        }) as Promise<{ data: any[] | null; error: any }>)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (universalRes.error) {
    console.warn("[ragInjector] match_brain_universal error:", universalRes.error.message);
  }
  if (companyRes.error) {
    console.warn("[ragInjector] match_brain (company) error:", companyRes.error.message);
  }

  // 3. Normalize sources
  const sources: RagSource[] = [];
  let counter = 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const u of (universalRes.data ?? []) as any[]) {
    sources.push({
      id: `S${counter++}`,
      scope: "universal",
      area: u.area ?? undefined,
      title: String(u.title ?? "Documento KB"),
      similarity: Number(u.similarity ?? 0),
      snippet: String(u.content ?? "").slice(0, 500),
      doc_id: u.id,
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of (companyRes.data ?? []) as any[]) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    sources.push({
      id: `S${counter++}`,
      scope: "company",
      source_type: c.source_type ?? undefined,
      title: String(meta.title ?? meta.titolo ?? meta.order_code ?? c.source_type ?? "Documento azienda"),
      similarity: Number(c.similarity ?? 0),
      snippet: String(c.content ?? "").slice(0, 500),
      doc_id: c.id,
    });
  }

  // 4. Build context block
  const durationMs = Date.now() - t0;
  if (sources.length === 0) {
    return {
      contextBlock: [
        "",
        "# CONTEXT RAG",
        "Nessun chunk pertinente trovato in KB per questa query.",
        "Rispondi senza grounding documentale; usa il tool `search_brain` se l'utente vuole approfondire.",
        "Premetti `[no-rag]` come prima riga della risposta se la domanda è puramente conversazionale.",
        "",
      ].join("\n"),
      sources: [],
      embeddingTokens,
      minSimilarity: 0,
      totalChunks: 0,
      durationMs,
    };
  }

  const minSimFound = Math.min(...sources.map((s) => s.similarity));
  const lowConfidence = minSimFound < 0.45;

  const lines: string[] = [
    "",
    "# CONTEXT RAG (chunk top per la query corrente)",
  ];
  if (lowConfidence) {
    lines.push("⚠️ Similarity media bassa: dichiara incertezza nella risposta e suggerisci verifica con la fonte primaria.");
  }
  for (const s of sources) {
    const tag = s.scope === "universal"
      ? `KB · ${s.area ?? "?"}`
      : `Company · ${s.source_type ?? "?"}`;
    lines.push(
      `\n[${s.id}] ${tag} · "${s.title}" · sim ${s.similarity.toFixed(2)}\n${s.snippet}\n---`,
    );
  }
  lines.push("");
  lines.push("REGOLE PER L'USO DI QUESTO BLOCCO:");
  lines.push("1. Quando usi un'informazione di questo blocco, cita inline con [S1], [S2], ecc.");
  lines.push("2. Non inventare contenuto che non è in questo blocco o che non puoi recuperare via tool.");
  lines.push("3. Se la risposta NON usa il blocco perché la domanda è conversazionale, scrivi `[no-rag]` all'inizio della risposta.");
  lines.push("4. Se nessuno dei chunks è realmente pertinente, dichiaralo: 'Non ho dati specifici su questo, posso provare a cercare altrove'.");
  lines.push("5. Se chiamerai `search_brain` per approfondimento, numera le nuove fonti come [S1+], [S2+], ... per non confliggere con questi.");
  lines.push("");

  return {
    contextBlock: lines.join("\n"),
    sources,
    embeddingTokens,
    minSimilarity: minSimFound,
    totalChunks: sources.length,
    durationMs,
  };
}
