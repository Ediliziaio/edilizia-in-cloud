import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { chiamataInternaValida } from "../_shared/chiamataInterna.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gateAiPayment } from "../_shared/requirePaymentMethod.ts";
import { getSystemPromptForVertical } from "../_shared/ai-prompts/index.ts";
import { extractJsonFromLLM } from "../_shared/extractJson.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { chargeAndLogDirect, estimateEmbeddingUsage } from "../_shared/ai-provider/directApi.ts";
import { buildStableAiIdempotencyKey } from "../_shared/directAiLedger.ts";
import { type CellaGrigliaAi, type CondizioneAsseAi, type PrezziFamigliaAi, prezzoFamigliaAi } from "../_shared/prezzoFamigliaAi.ts";

// ── Shape dei record DB usati dall'edge function ───────────────────────────
// Tipi minimali per sostituire `any` senza legarsi alle generated types (che
// questa edge fn non importa per non incollarsi allo schema client).

type ArticleTemplateRow = {
  id: string;
  name: string;
  sku?: string | null;
  modalita_prezzo?: string | null;
  prezzo_vendita?: number | string | null;
  prezzo_acquisto_netto?: number | string | null;
  unit_of_measure?: string | null;
  ha_montaggio?: boolean | null;
  montaggio_tipo?: string | null;
  categoria_id?: string | null;
};

type FamigliaMatch = {
  id: string;
  nome: string;
  modalita_prezzo_base: string;
  prezzo_base_vendita: number | string;
  unit_of_measure?: string | null;
  [key: string]: unknown;
};

type TariffaRow = {
  id: string;
  nome: string;
  tipo: string;
  prezzo_vendita: number | string;
  prezzo_costo?: number | string | null;
  costo_interno?: number | string | null;
  unita?: string | null;
  unita_fatturazione?: string | null;
  vertical_associato?: string | null;
  piano_base?: number | null;
  prezzo_piano_aggiuntivo?: number | string | null;
  [key: string]: unknown;
};

/** listino_griglia di un prodotto singolo: la colonna è prodotto_id, le misure valore_x/valore_y. */
type ListinoGrigliaProdottoRow = {
  prodotto_id: string;
  valore_x: number;
  valore_y: number;
  prezzo_vendita: number | string;
  prezzo_acquisto: number | string | null;
};

type ArticleFamilyAxisRow = {
  id: string;
  family_id: string;
  codice: string;
  nome: string;
  sort_order: number;
  obbligatorio: boolean;
  visibile_se?: unknown;
};

type ArticleFamilyAxisValueRow = {
  id: string;
  axis_id: string;
  valore: string;
  label: string;
  maggiorazione_tipo: string;
  maggiorazione_valore: number | string;
  maggiorazione_acquisto: number | string;
  prezzo_vendita: number | string | null;
  attivo: boolean;
};

type ListinoGrigliaFamigliaRow = {
  family_id: string;
  valore_x: number;
  valore_y: number;
  prezzo_vendita: number | string;
  prezzo_acquisto: number | string | null;
};

/** JSON che Claude deve restituire. Validato loose: i campi obbligatori sono
 * `sezioni: RigaAIResp[]`; tutto il resto è tollerato per compat forward. */
type RigaAIResp = {
  item_category?: string;
  nome?: string;
  descrizione?: string;
  quantita?: number;
  unita_misura?: string;
  article_template_id?: string | null;
  family_id?: string | null;
  axis_selections?: Record<string, string> | null;
  tariffa_id?: string | null;
  misure_x_mm?: number | null;
  misure_y_mm?: number | null;
  is_posa_di?: string | null;
  unit_price?: number | null;
};

type SezioneAIResp = {
  nome?: string;
  righe?: RigaAIResp[];
};

type ClaudeJsonResponse = {
  sezioni?: SezioneAIResp[];
  note?: string;
  avvertenze?: string[];
};

/** Parole di una richiesta che non distinguono un prodotto da un altro. */
const PAROLE_VUOTE = new Set([
  "della", "delle", "dello", "degli", "dalla", "dalle", "nella", "nelle", "sulla", "sulle",
  "come", "anche", "sono", "circa", "metri", "metro", "misura", "misure", "lavoro", "lavori",
  "preventivo", "fare", "deve", "devono", "vuole", "cliente", "casa", "generico", "tipo",
  "questo", "questa", "quello", "quella", "tutto", "tutti", "tutte", "nuovo", "nuova",
  "nuovi", "nuove", "altezza", "larghezza", "pezzi", "pezzo", "totale", "dove",
]);

function senzaAccenti(testo: string): string {
  return testo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Famiglie del listino scelte per parole della richiesta, quando il retrieval
 * semantico non ne trova (famiglie senza embedding). Cerca la radice di ogni
 * parola (finestr- per finestra e finestre) nel nome e nella descrizione; vale
 * di più nel nome. Nessuna parola utile, o nessuna famiglia trovata: le prime in
 * ordine di nome, come i prodotti senza retrieval. Stessi campi di
 * match_families_semantic.
 */
async function famiglieDalTesto(
  supabaseAdmin: ReturnType<typeof createClient>,
  companyId: string,
  testo: string,
  quante: number,
): Promise<FamigliaMatch[]> {
  const campi = "id,nome,descrizione,categoria_id,modalita_prezzo_base,unit_of_measure,prezzo_base_vendita,posa_tariffa_default_id";
  const radici = [...new Set(
    senzaAccenti(testo)
      .split(/[^a-z]+/)
      .filter((p) => p.length >= 4 && !PAROLE_VUOTE.has(p))
      .map((p) => (p.length >= 5 ? p.slice(0, -1) : p)),
  )].slice(0, 12);

  if (radici.length > 0) {
    const filtro = radici.flatMap((r) => [`nome.ilike.*${r}*`, `descrizione.ilike.*${r}*`]).join(",");
    const { data, error } = await supabaseAdmin
      .from("article_families")
      .select(campi)
      .eq("company_id", companyId)
      .eq("attivo", true)
      .is("deleted_at", null)
      .or(filtro)
      .order("nome")
      .limit(200);
    if (error) console.error("Famiglie per parole:", error.message);
    const trovate = (data ?? []) as FamigliaMatch[];
    if (trovate.length > 0) {
      const punteggio = (f: FamigliaMatch) => {
        const nome = senzaAccenti(String(f.nome ?? ""));
        const descrizione = senzaAccenti(String(f.descrizione ?? ""));
        return radici.reduce((s, r) => s + (nome.includes(r) ? 2 : descrizione.includes(r) ? 1 : 0), 0);
      };
      return trovate
        .map((f) => ({ f, punti: punteggio(f) }))
        .sort((a, b) => b.punti - a.punti)
        .slice(0, quante)
        .map((x) => x.f);
    }
  }

  const { data } = await supabaseAdmin
    .from("article_families")
    .select(campi)
    .eq("company_id", companyId)
    .eq("attivo", true)
    .is("deleted_at", null)
    .order("nome")
    .limit(quante);
  return (data ?? []) as FamigliaMatch[];
}

/**
 * Tutte le righe di una lettura, a pagine di mille: PostgREST si ferma a mille
 * righe, e con venti prodotti varianti e griglie arrivavano tagliate (una
 * griglia da 125 celle × 20 prodotti sono 2.500 righe). Un errore ferma la
 * lettura e finisce nel log: si usa quello che c'è, come prima.
 */
async function tutteLeRighe<T>(
  pagina: (da: number, a: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const PASSO = 1000;
  const righe: T[] = [];
  for (let da = 0; da < 50_000; da += PASSO) {
    const { data, error } = await pagina(da, da + PASSO - 1);
    if (error) {
      console.error("Lettura a pagine interrotta:", error.message);
      break;
    }
    const blocco = (data ?? []) as T[];
    righe.push(...blocco);
    if (blocco.length < PASSO) break;
  }
  return righe;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const body = await req.json();
    // Ingresso interno del bot operativo (28/09/2026): chiave di servizio +
    // l'utente per cui si genera. L'accesso all'azienda si ricontrolla sotto.
    const interna = chiamataInternaValida(req) && typeof body?.per_utente === "string";
    const { userId, supabaseAdmin } = interna
      ? {
        userId: body.per_utente as string,
        supabaseAdmin: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
      }
      : await requireAuth(req, corsH);

    const {
      company_id,
      descrizione,
      tipo_lavoro,
      piano_installazione,
      misure,
      input_mode,
      foto,
    }: {
      company_id: string;
      descrizione: string;
      tipo_lavoro?: string;
      piano_installazione?: number;
      misure?: { label: string; valore: number; unita: string }[];
      input_mode?: "testo" | "voce" | "foto";
      foto?: Array<{ name: string; mime: string; data_base64: string }>;
    } = body;

    if (!company_id) return errorResponse("company_id obbligatorio", 400, corsH);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, corsH);

    // Gate carta (audit AI 2026-06): strumento a costo senza controllo pagamento.
    // Dal bot (interna) l'azienda è un tenant già verificato dal numero: salto il gate.
    if (!interna) {
      const paymentBlock = await gateAiPayment(supabaseAdmin, company_id, corsH);
      if (paymentBlock) return paymentBlock;
    }

    // FASE 8.5: leggi vertical della company per scegliere il system prompt.
    const { data: company } = await supabaseAdmin
      .from("companies")
      .select("vertical")
      .eq("id", company_id)
      .maybeSingle();
    const vertical: string | null = (company?.vertical as string | null) ?? null;

    // FASE 8.3 + 8.bis: Retrieval semantico pgvector su prodotti, famiglie e tariffe.
    const PRODUCT_LIMIT = 60; // fallback legacy
    const MATCH_COUNT = 40;   // top-K retrieval prodotti
    const MATCH_COUNT_FAMILIES = 20;
    const MATCH_COUNT_TARIFFE = 20;
    const MATCH_THRESHOLD = 0.25;
    const MATCH_THRESHOLD_TARIFFE = 0.20;

    let prodotti: ArticleTemplateRow[] | null = null;
    let famiglieMatched: FamigliaMatch[] = [];
    let tariffeMatched: TariffaRow[] = [];
    let retrievalMode: "semantic" | "fallback" = "fallback";
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (openaiKey) {
      try {
        const embeddingInput = `${descrizione ?? ""} | tipo lavoro: ${tipo_lavoro ?? "generico"}`.slice(0, 8000);
        const embedRes = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: embeddingInput,
            dimensions: 1536,
          }),
          timeoutMs: 60_000,
        });
        if (embedRes.ok) {
          const embedData = await embedRes.json();
          const queryEmbedding = embedData?.data?.[0]?.embedding;
          if (Array.isArray(queryEmbedding) && queryEmbedding.length === 1536) {
            const embeddingUsage = estimateEmbeddingUsage(embeddingInput);
            const providerTokens = Number(embedData?.usage?.total_tokens ?? 0);
            const tokensIn = providerTokens || embeddingUsage.tokens;
            const costUsd = providerTokens
              ? Math.max(0.000001, (tokensIn / 1_000_000) * Number(Deno.env.get("AI_EMBEDDING_3_SMALL_USD_PER_1M_TOKENS") ?? "0.02"))
              : embeddingUsage.costUsd;
            await chargeAndLogDirect({
              supabase: supabaseAdmin,
              company_id,
              task_kind: "vision_quote",
              model_used: "openai/text-embedding-3-small",
              cost_usd_real: costUsd,
              cost_is_estimated: !providerTokens,
              tokens_prompt: tokensIn,
              metadata: {
                user_id: userId,
                input_mode: input_mode ?? "testo",
                tipo_lavoro: tipo_lavoro ?? null,
                retrieval: "listino_semantic",
                stage: "preventivo_genera_embedding",
              },
            });
            const embeddingStr = JSON.stringify(queryEmbedding);

            // 1. match_articles (prodotti) — comportamento storico FASE 8.3
            const { data: matches, error: rpcErr } = await supabaseAdmin.rpc("match_articles", {
              p_query_embedding: embeddingStr,
              p_company_id: company_id,
              p_match_threshold: MATCH_THRESHOLD,
              p_match_count: MATCH_COUNT,
            });
            if (!rpcErr && Array.isArray(matches) && matches.length > 0) {
              prodotti = matches as ArticleTemplateRow[];
              retrievalMode = "semantic";
            }

            // 2. match_families_semantic (FASE 8.bis). Senza filtro di settore
            // (05/10/2026): companies.vertical («serramentista», «generico»)
            // non ha le stesse parole di article_families.vertical («serramenti»,
            // «bagno»…), e il filtro scartava 3.177 famiglie attive su 3.185.
            // Il listino dell'azienda è tutto suo: va tutto tra i candidati.
            const { data: famMatches, error: famErr } = await supabaseAdmin.rpc(
              "match_families_semantic",
              {
                p_query_embedding: embeddingStr,
                p_company_id: company_id,
                p_vertical: null,
                p_match_threshold: MATCH_THRESHOLD,
                p_match_count: MATCH_COUNT_FAMILIES,
              },
            );
            if (!famErr && Array.isArray(famMatches)) {
              famiglieMatched = famMatches as FamigliaMatch[];
            }

            // 3. match_tariffe_semantic (FASE 8.bis)
            const { data: tarMatches, error: tarErr } = await supabaseAdmin.rpc(
              "match_tariffe_semantic",
              {
                p_query_embedding: embeddingStr,
                p_company_id: company_id,
                p_vertical: vertical,
                p_match_threshold: MATCH_THRESHOLD_TARIFFE,
                p_match_count: MATCH_COUNT_TARIFFE,
              },
            );
            if (!tarErr && Array.isArray(tarMatches)) {
              tariffeMatched = tarMatches as TariffaRow[];
            }
          }
        }
      } catch (e) {
        console.error("Retrieval semantico fallito, fallback:", e);
      }
    }

    if (famiglieMatched.length === 0) {
      // Famiglie senza embedding (05/10/2026: nessuna delle 3.185 attive ne
      // aveva uno, e la generazione non proponeva mai un prodotto del listino a
      // famiglie). Si cercano per parole della richiesta nel nome; se nessuna
      // parola trova niente, le prime in ordine di nome, come per i prodotti.
      famiglieMatched = await famiglieDalTesto(
        supabaseAdmin,
        company_id,
        `${descrizione ?? ""} ${tipo_lavoro ?? ""}`,
        MATCH_COUNT_FAMILIES,
      );
    }

    if (!prodotti) {
      // Fallback legacy: ORDER BY name LIMIT 60
      const { data, error: prodottiErr } = await supabaseAdmin
        .from("article_templates")
        .select(
          "id,name,sku,modalita_prezzo,prezzo_vendita,prezzo_acquisto_netto,unit_of_measure,ha_montaggio,montaggio_tipo,categoria_id"
        )
        .eq("company_id", company_id)
        .order("name")
        .limit(PRODUCT_LIMIT);
      if (prodottiErr) throw new Error(`Prodotti query error: ${prodottiErr.message}`);
      prodotti = data ?? [];
    }

    // FASE 7.1: batch-fetch griglia listini per tutti i prodotti con modalita='griglia'
    const prodottiGrigliaIds = (prodotti ?? [])
      .filter((p) => p.modalita_prezzo === "griglia")
      .map((p) => p.id);
    const griglieMap = new Map<string, Array<{ x_mm: number; y_mm: number; prezzo_vendita: number; prezzo_acquisto: number | null }>>();
    if (prodottiGrigliaIds.length > 0) {
      // Colonne vere di listino_griglia (05/10/2026): prima article_template_id,
      // x_mm e y_mm, che non esistono — la query falliva e con lei tutta la
      // generazione, appena un prodotto a griglia entrava tra i candidati.
      const { data: listini, error: listErr } = await supabaseAdmin
        .from("listino_griglia")
        .select("prodotto_id,valore_x,valore_y,prezzo_vendita,prezzo_acquisto")
        .in("prodotto_id", prodottiGrigliaIds);
      if (listErr) throw new Error(`Listino griglia query error: ${listErr.message}`);
      for (const punto of (listini ?? []) as ListinoGrigliaProdottoRow[]) {
        const arr = griglieMap.get(punto.prodotto_id) ?? [];
        arr.push({
          x_mm: Number(punto.valore_x),
          y_mm: Number(punto.valore_y),
          prezzo_vendita: Number(punto.prezzo_vendita) || 0,
          prezzo_acquisto: punto.prezzo_acquisto != null ? Number(punto.prezzo_acquisto) : null,
        });
        griglieMap.set(punto.prodotto_id, arr);
      }
    }

    // FASE 8.6: per ogni famiglia matchata, carica assi+valori e griglia (se applicabile).
    type AxisValue = {
      id: string;
      valore: string;
      label: string;
      maggiorazione_tipo: string;
      maggiorazione_valore: number;
      maggiorazione_acquisto: number;
      /** Prezzo proprio della variante: sostituisce il prezzo base (non per la griglia). */
      prezzo_vendita: number | null;
    };
    /**
     * Come si fa il prezzo della famiglia (05/10/2026): match_families_semantic
     * dà solo il prezzo di vendita salvato, che per una famiglia «acquisto +
     * ricarico» può essere vecchio. Il prezzo si rifà dal costo, come nel
     * preventivo (calcolaPrezzoFamiglia), così l'anteprima dice lo stesso numero.
     */
    const prezziFamigliaMap = new Map<string, Omit<PrezziFamigliaAi, "modalita_prezzo_base">>();
    type Axis = {
      id: string;
      codice: string;
      nome: string;
      sort_order: number;
      obbligatorio: boolean;
      values: AxisValue[];
      /** Compare solo se un'altra variante ha certi valori (monoblocco, 20281005100000). */
      visibile_se: CondizioneAsseAi | null;
    };
    const familyAxesMap = new Map<string, Axis[]>();
    // NB: la tabella listino_griglia usa colonna `prezzo_acquisto` (NON `_netto` come
    // article_templates). Addendum P1-01: allineamento naming DB↔code.
    const familyGridsMap = new Map<
      string,
      Array<{ valore_x: number; valore_y: number; prezzo_vendita: number; prezzo_acquisto: number | null }>
    >();
    if (famiglieMatched.length > 0) {
      // Prezzi delle famiglie, e via quelle nel cestino (05/10/2026): il
      // retrieval semantico guarda solo «attivo», e in produzione 465 prodotti
      // nel cestino risultano ancora attivi.
      const { data: prezziRows } = await supabaseAdmin
        .from("article_families")
        .select("id,deleted_at,prezzo_base_mode,prezzo_base_vendita,prezzo_base_acquisto,sconto_fornitore_1,sconto_fornitore_2,markup_tipo,markup_valore")
        .in("id", famiglieMatched.map((f) => f.id))
        .eq("company_id", company_id);
      const nelCestino = new Set<string>();
      for (const r of (prezziRows ?? []) as Array<Record<string, unknown>>) {
        if (r.deleted_at) {
          nelCestino.add(String(r.id));
          continue;
        }
        prezziFamigliaMap.set(String(r.id), {
          prezzo_base_mode: (r.prezzo_base_mode as string | null) ?? null,
          prezzo_base_vendita: Number(r.prezzo_base_vendita) || 0,
          prezzo_base_acquisto: Number(r.prezzo_base_acquisto) || 0,
          sconto_fornitore_1: Number(r.sconto_fornitore_1) || 0,
          sconto_fornitore_2: Number(r.sconto_fornitore_2) || 0,
          markup_tipo: (r.markup_tipo as string | null) ?? null,
          markup_valore: Number(r.markup_valore) || 0,
        });
      }
      if (nelCestino.size > 0) famiglieMatched = famiglieMatched.filter((f) => !nelCestino.has(f.id));
    }
    const famiglieIds = famiglieMatched.map((f) => f.id);
    if (famiglieIds.length > 0) {
      const axesTyped = await tutteLeRighe<ArticleFamilyAxisRow>((da, a) =>
        supabaseAdmin
          .from("article_family_axes")
          .select("id,family_id,codice,nome,sort_order,obbligatorio,visibile_se")
          .in("family_id", famiglieIds)
          .order("id")
          .range(da, a)
      );
      const axisIds = axesTyped.map((a) => a.id);
      const valuesByAxis = new Map<string, AxisValue[]>();
      if (axisIds.length > 0) {
        const valRows = await tutteLeRighe<ArticleFamilyAxisValueRow>((da, a) =>
          supabaseAdmin
            .from("article_family_axis_values")
            .select("id,axis_id,valore,label,maggiorazione_tipo,maggiorazione_valore,maggiorazione_acquisto,prezzo_vendita,attivo")
            .in("axis_id", axisIds)
            .eq("attivo", true)
            .order("id")
            .range(da, a)
        );
        for (const v of valRows) {
          const arr = valuesByAxis.get(v.axis_id) ?? [];
          arr.push({
            id: v.id,
            valore: v.valore,
            label: v.label,
            maggiorazione_tipo: v.maggiorazione_tipo,
            maggiorazione_valore: Number(v.maggiorazione_valore) || 0,
            maggiorazione_acquisto: Number(v.maggiorazione_acquisto) || 0,
            prezzo_vendita: v.prezzo_vendita != null ? Number(v.prezzo_vendita) : null,
          });
          valuesByAxis.set(v.axis_id, arr);
        }
      }
      for (const a of axesTyped) {
        const arr = familyAxesMap.get(a.family_id) ?? [];
        const condizione = a.visibile_se as CondizioneAsseAi | null | undefined;
        arr.push({
          id: a.id,
          codice: a.codice,
          nome: a.nome,
          sort_order: Number(a.sort_order) || 0,
          obbligatorio: !!a.obbligatorio,
          values: valuesByAxis.get(a.id) ?? [],
          visibile_se: condizione && typeof condizione.asse === "string" && Array.isArray(condizione.valori)
            ? condizione
            : null,
        });
        familyAxesMap.set(a.family_id, arr);
      }
      // Griglia per famiglie con modalita_prezzo_base='griglia'
      const gridFamilyIds = famiglieMatched
        .filter((f) => f.modalita_prezzo_base === "griglia")
        .map((f) => f.id);
      if (gridFamilyIds.length > 0) {
        const famGridRows = await tutteLeRighe<ListinoGrigliaFamigliaRow>((da, a) =>
          supabaseAdmin
            .from("listino_griglia")
            .select("family_id,valore_x,valore_y,prezzo_vendita,prezzo_acquisto")
            .in("family_id", gridFamilyIds)
            .order("id")
            .range(da, a)
        );
        for (const g of famGridRows) {
          const arr = familyGridsMap.get(g.family_id) ?? [];
          arr.push({
            valore_x: Number(g.valore_x),
            valore_y: Number(g.valore_y),
            prezzo_vendita: Number(g.prezzo_vendita) || 0,
            prezzo_acquisto: g.prezzo_acquisto != null ? Number(g.prezzo_acquisto) : null,
          });
          familyGridsMap.set(g.family_id, arr);
        }
      }
    }

    // Tariffe: usa quelle matchate semanticamente, fallback a TUTTE le tariffe della company.
    let tariffe: TariffaRow[] = tariffeMatched;
    if (tariffe.length === 0) {
      const { data: tariffeData, error: tariffeErr } = await supabaseAdmin
        .from("tariffe_aziendali")
        .select(
          "id,nome,tipo,prezzo_vendita,prezzo_costo,costo_interno,unita,unita_fatturazione,vertical_associato,piano_base,prezzo_piano_aggiuntivo"
        )
        .eq("company_id", company_id);
      if (tariffeErr) throw new Error(`Tariffe query error: ${tariffeErr.message}`);
      tariffe = (tariffeData ?? []) as TariffaRow[];
    }

    // Query impostazioni
    const { data: _impostazioni } = await supabaseAdmin
      .from("preventivo_impostazioni")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    // Build context strings
    const prodottiCtx = (prodotti ?? [])
      .map(
        (p) =>
          `[${p.categoria_id}] ${p.name} | ID:${p.id} | Modalità:${p.modalita_prezzo} | €${p.prezzo_vendita}/${p.unit_of_measure} | Montaggio:${p.montaggio_tipo}`
      )
      .join("\n");

    const tariffeCtx = (tariffe ?? [])
      .map((t) => `ID:${t.id} | ${t.tipo}: ${t.nome} | €${t.prezzo_vendita}/${t.unita}`)
      .join("\n");

    // FASE 8.6: contesto LISTINO FAMIGLIE con assi e valori per axis_selections.
    const famiglieCtx = famiglieMatched
      .map((f) => {
        const axes = familyAxesMap.get(f.id) ?? [];
        const axesDesc = axes
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((a) => {
            const vals = a.values
              .map((v) => `${v.label} (id=${v.id})`)
              .join(", ");
            return `  - asse "${a.codice}" (${a.nome}${a.obbligatorio ? ", OBBL" : ""}): ${vals || "—"}`;
          })
          .join("\n");
        return `FAMILY_ID:${f.id} | ${f.nome} | base:${f.modalita_prezzo_base} | €${f.prezzo_base_vendita}/${f.unit_of_measure}${
          axesDesc ? `\n${axesDesc}` : ""
        }`;
      })
      .join("\n");

    const misureCtx = JSON.stringify(misure ?? []);

    // FASE 8.5: system prompt scelto in base al vertical della company.
    const systemPromptBase = getSystemPromptForVertical(vertical);
    const isFotoMode = input_mode === "foto" && Array.isArray(foto) && foto.length > 0;

    // MP-preventivi-v2: prompt potenziato per modalità foto.
    // Quando arrivano immagini (schizzo/preventivo cartaceo/foto luogo),
    // l'AI deve: (1) leggere ogni info visibile, (2) convertire unità
    // (cm/mm/m), (3) matchare SEMPRE col listino fornito, (4) marcare
    // incertezze in `avvertenze`.
    const fotoGuide = isFotoMode ? `

═══════════════════════════════════════════════════════════════
MODALITA' FOTO/PDF — LETTURA DOCUMENTO VISIVO
═══════════════════════════════════════════════════════════════
Le immagini allegate possono essere:
  • Schizzo a mano libera con misure
  • Preventivo cartaceo (stampato o scritto a mano)
  • Foto di un luogo (stanza, facciata, bagno da ristrutturare)
  • Scheda tecnica prodotto
  • Screenshot di messaggi/chat con cliente

PROCEDURA OBBLIGATORIA:
1. LEGGI ogni numero, quantità, misura, nome prodotto visibile.
2. Se trovi misure in cm o m, converti in mm per il campo misure_x/y_mm.
3. Se riconosci un prodotto (es. "finestra 120×140") cerca PRIMA nel listino
   fornito e usa il suo article_template_id / family_id. MAI inventare ID.
4. Se non trovi matching esatto nel listino → crea riga con article_template_id=null
   e nome descrittivo chiaro. Il commerciale potrà mapparla manualmente.
5. Se il documento mostra prezzi ma NON combaciano col listino → scegli il
   prezzo del listino (fonte autoritativa) e annota la discrepanza in "avvertenze".
6. Se l'immagine è sfocata/parziale/incomprensibile → dichiaralo esplicitamente
   in "avvertenze" con la riga [FOTO X].
7. Se riconosci dalla foto del luogo dei lavori NECESSARI (es. smaltimento
   vecchi serramenti, piano alto → piattaforma) aggiungi relative righe posa/accessorie.
8. Se trovi un totale scritto nel documento e differisce da quello calcolato col
   listino, aggiungi nota "Totale documento: X, totale listino: Y".

Priorità matching:
  (a) article_template_id puntuale > (b) family_id con axis_selections >
  (c) nessun ID + nome testuale.
` : "";

    const outputSchema = `

OUTPUT JSON (schema obbligatorio):
{
  "sezioni": [{
    "nome": string,
    "righe": [{
      "item_category": "prodotto"|"posa"|"trasporto"|"smaltimento"|"nolo"|"nota",
      "nome": string,
      "descrizione": string,
      "quantita": number,
      "unita_misura": string,
      "article_template_id": string|null,
      "family_id": string|null,
      "axis_selections": { [axis_codice: string]: string }|null,
      "tariffa_id": string|null,
      "misure_x_mm": number|null,
      "misure_y_mm": number|null,
      "is_posa_di": string|null
    }]
  }],
  "note": string,
  "avvertenze": string[]
}

REGOLE OUTPUT:
- Rispondi SOLO con JSON valido, senza markdown wrapper.
- Raggruppa le righe in sezioni logiche (es. "Serramenti", "Posa", "Accessori", "Smaltimento").
- Per ogni riga: article_template_id oppure family_id (mai entrambi valorizzati insieme).
- misure_x_mm = larghezza in millimetri (int). misure_y_mm = altezza. Se non noto → null.
- item_category: "prodotto" per articoli fisici, "posa" per manodopera, "trasporto"/"nolo"/"smaltimento" per servizi accessori, "nota" per note informative senza prezzo.
- Se un prodotto ha posa automatica definita nel listino → aggiungi una riga "posa" collegata con is_posa_di = client_temp_id della riga prodotto padre (puoi usare il nome univoco).
- quantita deve essere un numero positivo. Se non noto → 1.
- In "avvertenze" elenca incertezze, match dubbi, prodotti non trovati nel listino.`;
    const systemPrompt = `${systemPromptBase}${fotoGuide}${outputSchema}`;

    // Build user message: include LISTINO FAMIGLIE solo se ci sono famiglie matchate.
    const userMessageParts = [
      isFotoMode
        ? `INPUT: ${foto!.length} foto/immagini allegate (analizza TUTTE prima di generare).`
        : `LAVORI: ${descrizione}`,
      `TIPO: ${tipo_lavoro ?? "generico"}`,
      `PIANO: ${piano_installazione ?? 0}`,
      `MISURE: ${misureCtx}`,
    ];
    if (isFotoMode && descrizione) {
      userMessageParts.push("", `NOTA AGGIUNTIVA DAL COMMERCIALE: ${descrizione}`);
    }
    userMessageParts.push(
      "",
      "LISTINO PRODOTTI (matching prioritario):",
      prodottiCtx || "(nessun prodotto rilevante)",
      "",
      "TARIFFE DISPONIBILI:",
      tariffeCtx || "(nessuna tariffa)",
    );
    if (famiglieCtx) {
      userMessageParts.push("", "LISTINO FAMIGLIE:", famiglieCtx);
    }
    const userMessage = userMessageParts.join("\n");

    // MP-preventivi-v2: costruzione content multipart per foto mode.
    const userContent: unknown = isFotoMode
      ? [
          ...foto!.map((f) => ({
            type: "image",
            source: {
              type: "base64",
              media_type: f.mime === "image/png" ? "image/png"
                : f.mime === "image/webp" ? "image/webp"
                : "image/jpeg",
              data: f.data_base64,
            },
          })),
          { type: "text", text: userMessage },
        ]
      : userMessage;
    const aiIdempotencyKey = await buildStableAiIdempotencyKey("preventivo_genera", [
      company_id,
      userId,
      input_mode ?? "testo",
      tipo_lavoro ?? null,
      piano_installazione ?? null,
      misure ?? [],
      descrizione ?? "",
      prodottiCtx,
      tariffeCtx,
      famiglieCtx,
      isFotoMode
        ? foto!.map((f) => ({
            name: f.name,
            mime: f.mime,
            bytes: f.data_base64.length,
            head: f.data_base64.slice(0, 80),
            tail: f.data_base64.slice(-80),
          }))
        : [],
    ]);

    // Migrato ad aiRouter — task `preventivo_genera` (claude-haiku-4.5 primary, ~93% saving vs opus)
    // Per modalità foto: serve vision capability → uso `vision_cantiere` task (gpt-4o-mini)
    let rawText = "";
    try {
      const result = await aiRouterComplete({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: supabaseAdmin as any,
        taskKey: isFotoMode ? "vision_cantiere" : "preventivo_genera",

        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent as any },
        ],
        // Un preventivo dettagliato (es. un bagno con demolizioni, idraulica,
        // rivestimenti, forniture) supera facilmente 2000 token in JSON: con il
        // vecchio tetto la risposta si troncava a metà e il JSON non era più
        // parsabile → l'utente vedeva «motore preventivi non disponibile».
        params: { temperature: 0.3, max_tokens: 8000 },
        responseFormat: { type: "json_object" },
        companyId: company_id,
        userId,
        idempotencyKey: aiIdempotencyKey,
      });
      rawText = result.content;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("aborted")) {
        return errorResponse(
          "Timeout: il servizio AI non ha risposto in tempo, riprova tra poco",
          504,
        );
      }
      throw new Error(`AI Router error: ${msg}`);
    }

    if (!rawText) {
      throw new Error("AI ha restituito una risposta vuota");
    }

    // P2-4: parser robusto via helper condiviso extractJsonFromLLM.
    // Prima il regex `^```json\s*` + `\s*```$` falliva se Claude variava
    // leggermente il formato (niente lingua dopo la fence, testo prima/
    // dopo, newline extra): JSON.parse lanciava e l'utente vedeva errore.
    let parsedData: ClaudeJsonResponse;
    try {
      parsedData = extractJsonFromLLM<ClaudeJsonResponse>(rawText);
    } catch (err) {
      throw new Error(
        `Claude ha restituito un JSON non valido: ${(err as Error).message}`,
      );
    }

    // Enrich righe with unit_price (FASE 7.1: corretto per modalità mq / griglia)
    const prodottiMap = new Map<string, ArticleTemplateRow>(
      (prodotti ?? []).map((p) => [p.id, p]),
    );
    const tariffeMap = new Map<string, TariffaRow>(
      (tariffe ?? []).map((t) => [t.id, t]),
    );
    const famigliaMap = new Map<string, FamigliaMatch>(
      famiglieMatched.map((f) => [f.id, f]),
    );

    /** Nearest-neighbor (Manhattan) per listino_griglia. */
    function nearestInGriglia(
      punti: Array<{ x_mm: number; y_mm: number; prezzo_vendita: number }>,
      x: number,
      y: number,
    ): number | null {
      if (!punti || punti.length === 0) return null;
      for (const p of punti) {
        if (p.x_mm === x && p.y_mm === y) return p.prezzo_vendita;
      }
      let best = punti[0];
      let bestDist = Math.abs(best.x_mm - x) + Math.abs(best.y_mm - y);
      for (let i = 1; i < punti.length; i++) {
        const d = Math.abs(punti[i].x_mm - x) + Math.abs(punti[i].y_mm - y);
        if (d < bestDist) {
          best = punti[i];
          bestDist = d;
        }
      }
      return best.prezzo_vendita;
    }

    /**
     * FASE 8.6 — Prezzo della famiglia con la regola del preventivo
     * (_shared/prezzoFamigliaAi.ts, 05/10/2026): vendita unitaria arrotondata,
     * o null se non calcolabile, col motivo negli avvisi.
     */
    function calcolaPrezzoFamigliaServer(
      family: FamigliaMatch,
      axes: Axis[],
      selections: Record<string, string>,
      xMm: number | null,
      yMm: number | null,
      mlValue: number | null,
      grid: CellaGrigliaAi[] | undefined,
      warnings: string[],
    ): number | null {
      const prezzi = prezziFamigliaMap.get(family.id);
      return prezzoFamigliaAi(
        {
          nome: family.nome,
          prezzi: {
            modalita_prezzo_base: family.modalita_prezzo_base,
            prezzo_base_mode: prezzi?.prezzo_base_mode ?? null,
            prezzo_base_vendita: prezzi?.prezzo_base_vendita ?? (Number(family.prezzo_base_vendita) || 0),
            prezzo_base_acquisto: prezzi?.prezzo_base_acquisto ?? 0,
            sconto_fornitore_1: prezzi?.sconto_fornitore_1 ?? 0,
            sconto_fornitore_2: prezzi?.sconto_fornitore_2 ?? 0,
            markup_tipo: prezzi?.markup_tipo ?? null,
            markup_valore: prezzi?.markup_valore ?? 0,
          },
          assi: axes,
          scelte: selections,
          xMm,
          yMm,
          ml: mlValue,
          griglia: grid,
        },
        warnings,
      );
    }

    const enrichmentWarnings: string[] = [];

    for (const sezione of parsedData.sezioni ?? []) {
      for (const riga of sezione.righe ?? []) {
        // Normalizza nuovi campi a null se mancanti (compat tolerance).
        if (riga.family_id === undefined) riga.family_id = null;
        if (riga.axis_selections === undefined) riga.axis_selections = null;

        const xMm = typeof riga.misure_x_mm === "number" ? riga.misure_x_mm : null;
        const yMm = typeof riga.misure_y_mm === "number" ? riga.misure_y_mm : null;

        // FASE 8.6: family_id ha precedenza su article_template_id.
        if (riga.family_id) {
          const fam = famigliaMap.get(riga.family_id);
          if (!fam) {
            riga.unit_price = null;
            enrichmentWarnings.push(
              `family_id ${riga.family_id} non trovato tra le famiglie matchate — riga ignorata in pricing.`,
            );
            continue;
          }
          const axes = familyAxesMap.get(riga.family_id) ?? [];
          const grid = familyGridsMap.get(riga.family_id);
          const selections: Record<string, string> =
            (riga.axis_selections && typeof riga.axis_selections === "object")
              ? riga.axis_selections
              : {};
          riga.unit_price = calcolaPrezzoFamigliaServer(
            fam,
            axes,
            selections,
            xMm,
            yMm,
            null,
            grid,
            enrichmentWarnings,
          );
        } else if (riga.article_template_id) {
          const prod = prodottiMap.get(riga.article_template_id);
          if (!prod) {
            // P2 FIX: quando l'AI suggerisce un ID non più presente
            // (prodotto cancellato), avvertiamo esplicitamente l'utente
            // invece di mettere silenziosamente unit_price=null
            // (prima: riga visualizzata "gratis" senza spiegazione).
            riga.unit_price = null;
            enrichmentWarnings.push(
              `Prodotto '${riga.nome ?? riga.article_template_id}' non trovato nel catalogo — inseriscilo manualmente o rigenera.`,
            );
            continue;
          }
          const modalita = prod.modalita_prezzo ?? "pz";

          if (modalita === "mq") {
            if (xMm != null && yMm != null && xMm > 0 && yMm > 0) {
              const mq = (xMm / 1000) * (yMm / 1000);
              const pv = Number(prod.prezzo_vendita) || 0;
              riga.unit_price = Math.round(pv * mq * 100) / 100;
            } else {
              riga.unit_price = Number(prod.prezzo_vendita) || null;
              enrichmentWarnings.push(
                `Prodotto '${prod.name}' è modalità mq ma mancano misure x/y — prezzo mostrato è €/mq.`,
              );
            }
          } else if (modalita === "griglia") {
            const punti = griglieMap.get(prod.id) ?? [];
            if (punti.length === 0) {
              riga.unit_price = Number(prod.prezzo_vendita) || null;
              enrichmentWarnings.push(
                `Prodotto '${prod.name}' è modalità griglia ma il listino è vuoto — prezzo di fallback.`,
              );
            } else if (xMm != null && yMm != null && xMm > 0 && yMm > 0) {
              const pv = nearestInGriglia(punti, xMm, yMm);
              riga.unit_price = pv;
              const exact = punti.some((p) => p.x_mm === xMm && p.y_mm === yMm);
              if (!exact) {
                enrichmentWarnings.push(
                  `Prodotto '${prod.name}': misura ${xMm}×${yMm}mm non in griglia, usato nearest-neighbor.`,
                );
              }
            } else {
              riga.unit_price = null;
              enrichmentWarnings.push(
                `Prodotto '${prod.name}' è modalità griglia ma mancano misure x/y — prezzo non calcolabile.`,
              );
            }
          } else {
            riga.unit_price = Number(prod.prezzo_vendita) || null;
          }
        } else if (riga.tariffa_id) {
          const tar = tariffeMap.get(riga.tariffa_id);
          if (tar) {
            if (tar.tipo === "tiro_piano") {
              riga.unit_price =
                Number(tar.prezzo_vendita) +
                Math.max(0, (piano_installazione ?? 0) - (tar.piano_base ?? 1)) *
                  (Number(tar.prezzo_piano_aggiuntivo) || 0);
            } else {
              riga.unit_price = Number(tar.prezzo_vendita);
            }
          } else {
            // P2 FIX: tariffa suggerita non più presente → warning esplicito.
            riga.unit_price = null;
            enrichmentWarnings.push(
              `Tariffa '${riga.nome ?? riga.tariffa_id}' non trovata nel listino manodopera — inseriscila manualmente o rigenera.`,
            );
          }
        } else {
          riga.unit_price = null;
        }
      }
    }

    // Warn if catalog was truncated
    const avvertenze: string[] = parsedData.avvertenze ?? [];
    if (retrievalMode === "fallback" && (prodotti ?? []).length >= PRODUCT_LIMIT) {
      avvertenze.push(
        `Catalogo limitato ai primi ${PRODUCT_LIMIT} prodotti (retrieval semantico non disponibile). Per risultati migliori, genera gli embedding dal catalogo: sezione Impostazioni → Prodotti.`
      );
    } else if (retrievalMode === "semantic") {
      avvertenze.push(
        `Retrieval semantico: ${(prodotti ?? []).length} prodotti, ${famiglieMatched.length} famiglie, ${tariffeMatched.length} tariffe selezionati su pgvector (soglia ${MATCH_THRESHOLD}).`
      );
    }
    if (enrichmentWarnings.length > 0) {
      avvertenze.push(...enrichmentWarnings);
    }

    return jsonResponse({
      sezioni: parsedData.sezioni,
      note: parsedData.note,
      avvertenze,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : String(err));
  }
});
