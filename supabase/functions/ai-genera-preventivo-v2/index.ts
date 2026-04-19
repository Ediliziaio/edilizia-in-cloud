import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getSystemPromptForVertical } from "../_shared/ai-prompts/index.ts";

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

type ListinoGrigliaProdottoRow = {
  article_template_id: string;
  x_mm: number;
  y_mm: number;
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
};

type ArticleFamilyAxisValueRow = {
  id: string;
  axis_id: string;
  valore: string;
  label: string;
  maggiorazione_tipo: string;
  maggiorazione_valore: number | string;
  maggiorazione_acquisto: number | string;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const {
      company_id,
      descrizione,
      tipo_lavoro,
      piano_installazione,
      misure,
    }: {
      company_id: string;
      descrizione: string;
      tipo_lavoro?: string;
      piano_installazione?: number;
      misure?: { label: string; valore: number; unita: string }[];
    } = body;

    if (!company_id) return errorResponse("company_id obbligatorio", 400);

    // Validate the caller has access to this company
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .single();
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    const isSuperAdmin = roleRow?.role === "super_admin";
    if (!isSuperAdmin && profile?.company_id !== company_id) {
      return errorResponse("Accesso negato a questa azienda", 403);
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
        const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: `${descrizione ?? ""} | tipo lavoro: ${tipo_lavoro ?? "generico"}`.slice(0, 8000),
            dimensions: 1536,
          }),
        });
        if (embedRes.ok) {
          const embedData = await embedRes.json();
          const queryEmbedding = embedData?.data?.[0]?.embedding;
          if (Array.isArray(queryEmbedding) && queryEmbedding.length === 1536) {
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

            // 2. match_families_semantic (FASE 8.bis)
            const { data: famMatches, error: famErr } = await supabaseAdmin.rpc(
              "match_families_semantic",
              {
                p_query_embedding: embeddingStr,
                p_company_id: company_id,
                p_vertical: vertical,
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
      const { data: listini, error: listErr } = await supabaseAdmin
        .from("listino_griglia")
        .select("article_template_id,x_mm,y_mm,prezzo_vendita,prezzo_acquisto")
        .in("article_template_id", prodottiGrigliaIds);
      if (listErr) throw new Error(`Listino griglia query error: ${listErr.message}`);
      for (const punto of (listini ?? []) as ListinoGrigliaProdottoRow[]) {
        const arr = griglieMap.get(punto.article_template_id) ?? [];
        arr.push({
          x_mm: punto.x_mm,
          y_mm: punto.y_mm,
          prezzo_vendita: Number(punto.prezzo_vendita) || 0,
          prezzo_acquisto: punto.prezzo_acquisto != null ? Number(punto.prezzo_acquisto) : null,
        });
        griglieMap.set(punto.article_template_id, arr);
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
    };
    type Axis = {
      id: string;
      codice: string;
      nome: string;
      sort_order: number;
      obbligatorio: boolean;
      values: AxisValue[];
    };
    const familyAxesMap = new Map<string, Axis[]>();
    // NB: la tabella listino_griglia usa colonna `prezzo_acquisto` (NON `_netto` come
    // article_templates). Addendum P1-01: allineamento naming DB↔code.
    const familyGridsMap = new Map<
      string,
      Array<{ valore_x: number; valore_y: number; prezzo_vendita: number; prezzo_acquisto: number | null }>
    >();
    const famiglieIds = famiglieMatched.map((f) => f.id);
    if (famiglieIds.length > 0) {
      const { data: axesRows } = await supabaseAdmin
        .from("article_family_axes")
        .select("id,family_id,codice,nome,sort_order,obbligatorio")
        .in("family_id", famiglieIds);
      const axesTyped = (axesRows ?? []) as ArticleFamilyAxisRow[];
      const axisIds = axesTyped.map((a) => a.id);
      const valuesByAxis = new Map<string, AxisValue[]>();
      if (axisIds.length > 0) {
        const { data: valRows } = await supabaseAdmin
          .from("article_family_axis_values")
          .select("id,axis_id,valore,label,maggiorazione_tipo,maggiorazione_valore,maggiorazione_acquisto,attivo")
          .in("axis_id", axisIds)
          .eq("attivo", true);
        for (const v of (valRows ?? []) as ArticleFamilyAxisValueRow[]) {
          const arr = valuesByAxis.get(v.axis_id) ?? [];
          arr.push({
            id: v.id,
            valore: v.valore,
            label: v.label,
            maggiorazione_tipo: v.maggiorazione_tipo,
            maggiorazione_valore: Number(v.maggiorazione_valore) || 0,
            maggiorazione_acquisto: Number(v.maggiorazione_acquisto) || 0,
          });
          valuesByAxis.set(v.axis_id, arr);
        }
      }
      for (const a of axesTyped) {
        const arr = familyAxesMap.get(a.family_id) ?? [];
        arr.push({
          id: a.id,
          codice: a.codice,
          nome: a.nome,
          sort_order: Number(a.sort_order) || 0,
          obbligatorio: !!a.obbligatorio,
          values: valuesByAxis.get(a.id) ?? [],
        });
        familyAxesMap.set(a.family_id, arr);
      }
      // Griglia per famiglie con modalita_prezzo_base='griglia'
      const gridFamilyIds = famiglieMatched
        .filter((f) => f.modalita_prezzo_base === "griglia")
        .map((f) => f.id);
      if (gridFamilyIds.length > 0) {
        const { data: famGridRows } = await supabaseAdmin
          .from("listino_griglia")
          .select("family_id,valore_x,valore_y,prezzo_vendita,prezzo_acquisto")
          .in("family_id", gridFamilyIds);
        for (const g of (famGridRows ?? []) as ListinoGrigliaFamigliaRow[]) {
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
}`;
    const systemPrompt = `${systemPromptBase}${outputSchema}`;

    // Build user message: include LISTINO FAMIGLIE solo se ci sono famiglie matchate.
    const userMessageParts = [
      `LAVORI: ${descrizione}`,
      `TIPO: ${tipo_lavoro ?? "generico"}`,
      `PIANO: ${piano_installazione ?? 0}`,
      `MISURE: ${misureCtx}`,
      "",
      "LISTINO PRODOTTI:",
      prodottiCtx || "(nessun prodotto rilevante)",
      "",
      "TARIFFE DISPONIBILI:",
      tariffeCtx || "(nessuna tariffa)",
    ];
    if (famiglieCtx) {
      userMessageParts.push("", "LISTINO FAMIGLIE:", famiglieCtx);
    }
    const userMessage = userMessageParts.join("\n");

    // Call Claude API
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") ?? "",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error: ${claudeRes.status} ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const rawText: string | undefined = claudeData?.content?.[0]?.text;
    if (!rawText) {
      throw new Error("Claude ha restituito una risposta vuota o malformata");
    }

    // Strip ```json ... ``` wrappers if present
    const text = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();

    let parsedData: ClaudeJsonResponse;
    try {
      parsedData = JSON.parse(text) as ClaudeJsonResponse;
    } catch {
      throw new Error(`Claude ha restituito un JSON non valido: ${text.slice(0, 200)}`);
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
     * FASE 8.6 — Calcolo prezzo famiglia (port server-side di calcolaPrezzoFamiglia).
     * Pure function: base + percentuali (in sort_order) + fissi (sort_order).
     * Restituisce unit_price_vendita (rounded 2dp) o null se non calcolabile.
     */
    function calcolaPrezzoFamigliaServer(
      family: FamigliaMatch,
      axes: Axis[],
      selections: Record<string, string>,
      xMm: number | null,
      yMm: number | null,
      mlValue: number | null,
      grid: Array<{ valore_x: number; valore_y: number; prezzo_vendita: number }> | undefined,
      warnings: string[],
    ): number | null {
      const mq = xMm != null && yMm != null ? (xMm / 1000) * (yMm / 1000) : null;
      let pv = 0;
      const baseMode = family.modalita_prezzo_base;
      const baseV = Number(family.prezzo_base_vendita) || 0;
      switch (baseMode) {
        case "pz":
        case "misura_libera":
          pv = baseV;
          break;
        case "mq":
          if (mq == null) {
            warnings.push(`Famiglia '${family.nome}' mq: misure L×H mancanti.`);
            return null;
          }
          pv = baseV * mq;
          break;
        case "griglia": {
          if (xMm == null || yMm == null) {
            warnings.push(`Famiglia '${family.nome}' griglia: misure L×H mancanti.`);
            return null;
          }
          if (!grid || grid.length === 0) {
            warnings.push(`Famiglia '${family.nome}' griglia: listino vuoto.`);
            return null;
          }
          // exact then nearest
          const exact = grid.find((g) => g.valore_x === xMm && g.valore_y === yMm);
          if (exact) {
            pv = exact.prezzo_vendita;
          } else {
            let best = grid[0];
            let bestDist = Math.abs(best.valore_x - xMm) + Math.abs(best.valore_y - yMm);
            for (let i = 1; i < grid.length; i++) {
              const d = Math.abs(grid[i].valore_x - xMm) + Math.abs(grid[i].valore_y - yMm);
              if (d < bestDist) {
                best = grid[i];
                bestDist = d;
              }
            }
            pv = best.prezzo_vendita;
            warnings.push(
              `Famiglia '${family.nome}': misura ${xMm}×${yMm} non in griglia, usato nearest-neighbor.`,
            );
          }
          break;
        }
        default:
          pv = baseV;
      }

      const axesSorted = [...axes].sort((a, b) => a.sort_order - b.sort_order);
      // 1. percentuali
      for (const axis of axesSorted) {
        const selValueId = selections[axis.codice];
        if (!selValueId) {
          if (axis.obbligatorio) {
            warnings.push(`Famiglia '${family.nome}': asse "${axis.codice}" obbligatorio non selezionato.`);
          }
          continue;
        }
        const val = axis.values.find((v) => v.id === selValueId);
        if (!val || val.maggiorazione_tipo !== "percentuale") continue;
        pv = pv * (1 + val.maggiorazione_valore / 100);
      }
      // 2. fissi
      for (const axis of axesSorted) {
        const selValueId = selections[axis.codice];
        if (!selValueId) continue;
        const val = axis.values.find((v) => v.id === selValueId);
        if (!val) continue;
        switch (val.maggiorazione_tipo) {
          case "fisso_pz":
            pv += val.maggiorazione_valore;
            break;
          case "fisso_mq":
            if (mq != null) pv += val.maggiorazione_valore * mq;
            break;
          case "fisso_ml":
            if (mlValue != null) pv += val.maggiorazione_valore * mlValue;
            break;
          // fisso_mc / none / percentuale: no-op qui
        }
      }
      return Math.round(pv * 100) / 100;
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
            riga.unit_price = null;
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
            riga.unit_price = null;
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
