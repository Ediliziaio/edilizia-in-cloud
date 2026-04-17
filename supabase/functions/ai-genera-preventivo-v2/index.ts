import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

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

    // Query prodotti (limit 60 — ordiniamo per nome per avere consistenza)
    const PRODUCT_LIMIT = 60;
    const { data: prodotti, error: prodottiErr } = await supabaseAdmin
      .from("article_templates")
      .select(
        "id,name,sku,modalita_prezzo,prezzo_vendita,prezzo_acquisto_netto,unit_of_measure,ha_montaggio,montaggio_tipo,categoria_id"
      )
      .eq("company_id", company_id)
      .order("name")
      .limit(PRODUCT_LIMIT);

    if (prodottiErr) throw new Error(`Prodotti query error: ${prodottiErr.message}`);

    // FASE 7.1: batch-fetch griglia listini per tutti i prodotti con modalita='griglia'
    const prodottiGrigliaIds = (prodotti ?? [])
      .filter((p: any) => p.modalita_prezzo === "griglia")
      .map((p: any) => p.id);
    let griglieMap = new Map<string, Array<{ x_mm: number; y_mm: number; prezzo_vendita: number; prezzo_acquisto: number | null }>>();
    if (prodottiGrigliaIds.length > 0) {
      const { data: listini, error: listErr } = await supabaseAdmin
        .from("listino_griglia")
        .select("article_template_id,x_mm,y_mm,prezzo_vendita,prezzo_acquisto")
        .in("article_template_id", prodottiGrigliaIds);
      if (listErr) throw new Error(`Listino griglia query error: ${listErr.message}`);
      for (const punto of (listini ?? []) as any[]) {
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

    // Query tariffe (FASE 6: include costo_interno, unita_fatturazione, vertical_associato)
    const { data: tariffe, error: tariffeErr } = await supabaseAdmin
      .from("tariffe_aziendali")
      .select(
        "id,nome,tipo,prezzo_vendita,prezzo_costo,costo_interno,unita,unita_fatturazione,vertical_associato,piano_base,prezzo_piano_aggiuntivo"
      )
      .eq("company_id", company_id);

    if (tariffeErr) throw new Error(`Tariffe query error: ${tariffeErr.message}`);

    // Query impostazioni
    const { data: impostazioni } = await supabaseAdmin
      .from("preventivo_impostazioni")
      .select("*")
      .eq("company_id", company_id)
      .maybeSingle();

    // Build context strings
    const prodottiCtx = (prodotti ?? [])
      .map(
        (p: any) =>
          `[${p.categoria_id}] ${p.name} | ID:${p.id} | Modalità:${p.modalita_prezzo} | €${p.prezzo_vendita}/${p.unit_of_measure} | Montaggio:${p.montaggio_tipo}`
      )
      .join("\n");

    const tariffeCtx = (tariffe ?? [])
      .map((t: any) => `ID:${t.id} | ${t.tipo}: ${t.nome} | €${t.prezzo_vendita}/${t.unita}`)
      .join("\n");

    const misureCtx = JSON.stringify(misure ?? []);

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
        system: `Sei un preventivista esperto per imprese edili italiane con 20 anni di esperienza. Conosci perfettamente serramenti, ristrutturazioni, bagni, pavimenti, tetti, impianti, cappotti, fotovoltaico.

REGOLE:
1. Usa i prodotti del listino quando possibile — includi SEMPRE l'ID esatto del prodotto
2. Se modalita='griglia': indica misure_x e misure_y in mm
3. Se modalita='mq': calcola mq dalle misure fornite
4. Aggiungi righe tariffa (posa, trasporto, smaltimento) usando gli ID delle tariffe
5. Calcola quantità realistiche dalle misure fornite
6. Output SOLO JSON valido, niente testo fuori dal JSON

OUTPUT JSON:
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
      "tariffa_id": string|null,
      "misure_x_mm": number|null,
      "misure_y_mm": number|null,
      "is_posa_di": string|null
    }]
  }],
  "note": string,
  "avvertenze": string[]
}`,
        messages: [
          {
            role: "user",
            content: `LAVORI: ${descrizione}\nTIPO: ${tipo_lavoro ?? "generico"}\nPIANO: ${piano_installazione ?? 0}\nMISURE: ${misureCtx}\n\nLISTINO PRODOTTI:\n${prodottiCtx}\n\nTARIFFE DISPONIBILI:\n${tariffeCtx}`,
          },
        ],
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

    let parsedData: any;
    try {
      parsedData = JSON.parse(text);
    } catch (_e) {
      throw new Error(`Claude ha restituito un JSON non valido: ${text.slice(0, 200)}`);
    }

    // Enrich righe with unit_price (FASE 7.1: corretto per modalità mq / griglia)
    const prodottiMap = new Map((prodotti ?? []).map((p: any) => [p.id, p]));
    const tariffeMap = new Map((tariffe ?? []).map((t: any) => [t.id, t]));

    /** Nearest-neighbor (Manhattan) per listino_griglia. */
    function nearestInGriglia(
      punti: Array<{ x_mm: number; y_mm: number; prezzo_vendita: number }>,
      x: number,
      y: number,
    ): number | null {
      if (!punti || punti.length === 0) return null;
      // exact match short-circuit
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

    const enrichmentWarnings: string[] = [];

    for (const sezione of parsedData.sezioni ?? []) {
      for (const riga of sezione.righe ?? []) {
        if (riga.article_template_id) {
          const prod = prodottiMap.get(riga.article_template_id) as any;
          if (!prod) {
            riga.unit_price = null;
            continue;
          }
          const modalita = prod.modalita_prezzo ?? "pz";
          const xMm = typeof riga.misure_x_mm === "number" ? riga.misure_x_mm : null;
          const yMm = typeof riga.misure_y_mm === "number" ? riga.misure_y_mm : null;

          if (modalita === "mq") {
            // prezzo_vendita è €/mq → unit_price = prezzo × (x*y / 1_000_000)
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
              // Nota: il matching è nearest-neighbor — non per forza esatto
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
            // pz | misura_libera | altro → prezzo flat
            riga.unit_price = Number(prod.prezzo_vendita) || null;
          }
        } else if (riga.tariffa_id) {
          const tar = tariffeMap.get(riga.tariffa_id) as any;
          if (tar) {
            if (tar.tipo === "tiro_piano") {
              riga.unit_price =
                tar.prezzo_vendita +
                Math.max(0, (piano_installazione ?? 0) - (tar.piano_base ?? 1)) *
                  (tar.prezzo_piano_aggiuntivo ?? 0);
            } else {
              riga.unit_price = tar.prezzo_vendita;
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
    if ((prodotti ?? []).length >= PRODUCT_LIMIT) {
      avvertenze.push(
        `Il catalogo è stato limitato ai primi ${PRODUCT_LIMIT} prodotti. Se un articolo non è stato trovato, aggiungilo manualmente al preventivo.`
      );
    }
    // Append enrichment warnings (FASE 7.1)
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
