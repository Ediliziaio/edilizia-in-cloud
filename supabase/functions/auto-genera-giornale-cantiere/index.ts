/**
 * MP-OPS-03 — Auto Genera Giornale di Cantiere (cron 18:00 daily)
 *
 * Per ogni company con `giornale_auto_enabled=true`, itera cantieri attivi e
 * crea il giornale del giorno aggregando rapportini, foto, DDT, segnalazioni,
 * meteo. Persona pm_cantiere compone testo formale.
 *
 * Defensive: rapportini/cantiere_photos non sempre esistono → graceful skip.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";

interface CantiereLite {
  id: string;
  order_code: string | null;
  company_id: string;
  indirizzo_lavori: string | null;
  work_description: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Gira in service_role su tutte le aziende e chiama l'AI (che si paga a
  // consumo). Non aveva nessun controllo: la proteggeva solo il verify_jwt del
  // gateway, che fa passare qualunque utente autenticato — quindi chiunque
  // avesse un account poteva far partire il batch, e la spesa.
  {
    const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!cronSecretValido(req) && !(chiave && bearer === chiave)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  const summary = {
    companies_processed: 0,
    cantieri_processed: 0,
    giornali_generated: 0,
    skipped: 0,
    errors: 0,
    duration_ms: 0,
    errors_detail: [] as Array<{ cantiere_id: string; message: string }>,
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id, name")
      .eq("giornale_auto_enabled", true);

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk({ ...summary, note: "Nessuna company con giornale_auto_enabled=true" });
    }

    summary.companies_processed = companies.length;
    const today = new Date().toISOString().substring(0, 10);

    for (const c of companies) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cantieri } = await (supabase as any)
        .from("orders")
        .select("id, order_code, company_id, indirizzo_lavori, work_description")
        .eq("company_id", c.id)
        .eq("giornale_auto_enabled", true)
        .in("status", ["in_corso", "programmato"]);

      const list = (cantieri ?? []) as CantiereLite[];
      summary.cantieri_processed += list.length;

      for (const cant of list) {
        try {
          // 1. RPC placeholder (idempotenza)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: createRes } = await (supabase as any).rpc("silvio_tool_genera_giornale", {
            p_company_id: c.id,
            p_user_id: "00000000-0000-0000-0000-000000000000",
            p_cantiere_id: cant.id,
            p_data: today,
            p_force_regenerate: false,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = createRes as any;
          if (r?.error) {
            summary.errors++;
            summary.errors_detail.push({ cantiere_id: cant.id, message: r.error });
            continue;
          }
          if (r?.already_exists) {
            summary.skipped++;
            continue;
          }

          // 2. Aggrega dati giornata (best-effort)
          const aggregated = await aggregateData(supabase, cant, today);

          // 3. AI compose testo formale
          const aiResult = await aiRouterComplete({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            supabase: supabase as any,
            taskKey: "email_compose",
            messages: [
              {
                role: "system",
                content: `Sei il PM Cantiere. Compose il giornale di cantiere formale per la giornata in italiano professionale.
Struttura conforme prassi tecnica:
1. CONDIZIONI METEO
2. PERSONALE PRESENTE (con totale ore)
3. LAVORAZIONI ESEGUITE (mattina + pomeriggio)
4. MATERIALI CONSEGNATI
5. OSSERVAZIONI

NON inventare dati: se mancano, scrivi "Dati non disponibili" per quella sezione.`,
              },
              {
                role: "user",
                content: JSON.stringify(aggregated),
              },
            ],
            params: { temperature: 0.3, max_tokens: 1500 },
            companyId: c.id,
            estimatedCostEur: 0.05,
            idempotencyKey: `giornale-${cant.id}-${today}`,
          });

          // 4. Update giornale_lavori con testo + audit AI
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("giornale_lavori")
            .update({
              lavorazioni_eseguite: aiResult.content,
              materiali_utilizzati: JSON.stringify(aggregated.materiali_consegnati ?? []),
              personale_presente: aggregated.personale_count ?? 0,
              condizioni_meteo: aggregated.meteo_descrizione ?? null,
              ai_cost_billed_eur: aiResult.costBilledEur ?? 0,
              ai_confidence: aggregated.confidence ?? 0.7,
              source_rapportini_ids: aggregated.rapportini_ids ?? [],
              source_foto_ids: aggregated.foto_ids ?? [],
              source_ddt_ids: aggregated.ddt_ids ?? [],
              source_segnalazioni_ids: aggregated.segnalazioni_ids ?? [],
            })
            .eq("id", r?.giornale_id);

          summary.giornali_generated++;
        } catch (e) {
          summary.errors++;
          summary.errors_detail.push({
            cantiere_id: cant.id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    return new Response(
      JSON.stringify({ ...summary, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

interface AggregatedDay {
  meteo_descrizione: string | null;
  personale_count: number;
  personale_lista: string[];
  rapportini_ids: string[];
  foto_ids: string[];
  ddt_ids: string[];
  segnalazioni_ids: string[];
  materiali_consegnati: Array<{ descrizione: string; quantita: number; unita?: string }>;
  confidence: number;
}

async function aggregateData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  cantiere: CantiereLite,
  data: string,
): Promise<AggregatedDay> {
  const result: AggregatedDay = {
    meteo_descrizione: null,
    personale_count: 0,
    personale_lista: [],
    rapportini_ids: [],
    foto_ids: [],
    ddt_ids: [],
    segnalazioni_ids: [],
    materiali_consegnati: [],
    confidence: 0.5,
  };

  // Segnalazioni (tabella esiste)
  try {
    const { data: segs } = await supabase
      .from("cantiere_segnalazioni")
      .select("id, descrizione")
      .eq("cantiere_id", cantiere.id)
      .gte("created_at", `${data}T00:00:00`)
      .lt("created_at", `${data}T23:59:59`);
    if (Array.isArray(segs)) {
      result.segnalazioni_ids = (segs as Array<{ id: string }>).map((s) => s.id);
    }
  } catch { /* skip */ }

  // Rapportini (defensive)
  try {
    const { data: raps } = await supabase
      .from("rapportini")
      .select("id, ore_lavorate, user_id")
      .eq("cantiere_id", cantiere.id)
      .eq("data_rapportino", data);
    if (Array.isArray(raps)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result.rapportini_ids = (raps as any[]).map((r) => r.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result.personale_count = (raps as any[]).length;
      result.confidence = 0.85;
    }
  } catch { /* skip se rapportini non esiste */ }

  // Foto (defensive)
  try {
    const { data: fotos } = await supabase
      .from("cantiere_photos")
      .select("id")
      .eq("cantiere_id", cantiere.id)
      .gte("taken_at", `${data}T00:00:00`)
      .lt("taken_at", `${data}T23:59:59`);
    if (Array.isArray(fotos)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result.foto_ids = (fotos as any[]).map((f) => f.id);
    }
  } catch { /* skip se cantiere_photos non esiste */ }

  return result;
}
