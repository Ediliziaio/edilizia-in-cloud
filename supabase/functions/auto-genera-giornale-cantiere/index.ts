/**
 * MP-OPS-03 — Auto Genera Giornale di Cantiere (cron 18:00 daily)
 *
 * Per ogni company con `giornale_auto_enabled=true`, itera cantieri attivi e
 * crea il giornale del giorno aggregando rapportini, foto, segnalazioni dal
 * campo e meteo. Persona pm_cantiere compone testo formale. Solo le commesse
 * che oggi hanno lavoro registrato: le altre non costano niente.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";

interface CantiereLite {
  id: string;
  order_code: string | null;
  company_id: string;
  indirizzo_lavori: string | null;
  work_description: string | null;
}

// Un giro passa su tutte le aziende con il giornale automatico acceso, cantiere
// per cantiere, e per ognuno chiama l'AI: 66 secondi al giorno oltre i 5 s nella
// misura del 20/09/2026, e cresce con le aziende. pg_net ha un solo worker e
// finché questa non risponde la coda di TUTTI i cron resta ferma (il job 49
// aspetta 120 secondi). Con la risposta rapida pg_net riceve 202 entro 5 secondi
// e il lavoro finisce sotto EdgeRuntime.waitUntil; chi la chiama col service role
// continua a ricevere il riepilogo completo. Vedi _shared/rispostaRapidaCron.ts.
serveConMetricheRapida("auto-genera-giornale-cantiere", async (req) => {
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
      .select("id, name, status")
      .eq("giornale_auto_enabled", true);

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk({ ...summary, note: "Nessuna company con giornale_auto_enabled=true" });
    }

    summary.companies_processed = companies.length;
    // Il giorno in Italia: il cron gira nel pomeriggio, ma resta giusto se cambia l'orario.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
    const inizio = inizioGiornoRoma(today);
    const fine = new Date(new Date(inizio).getTime() + 24 * 3600 * 1000 - 1000).toISOString();

    // Il giornale lo firma il titolare. In due passi: user_roles punta ad
    // auth.users, non a profiles, e una lettura unita delle due tabelle
    // risponde sempre con un errore. Gli amministratori sono poche decine.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: amministratori, error: errAdmin } = await (supabase as any).from("user_roles").select("user_id").eq("role", "company_admin");
    if (errAdmin) throw new Error(`amministratori non leggibili: ${errAdmin.message}`);
    const idAmministratori = ((amministratori ?? []) as Array<{ user_id: string }>).map((x) => x.user_id);

    for (const c of companies) {
      // Azienda sospesa, scaduta o cessata: nessuno lo legge e l'AI costa.
      if (["suspended", "cancelled", "canceled", "expired"].includes(String(c.status ?? ""))) { summary.skipped++; continue; }

      // 1. Il lavoro registrato oggi, tre letture per azienda (non per commessa).
      //    Senza rapportini, foto né segnalazioni non c'è niente da scrivere.
      let giornata: Map<string, AggregatedDay>;
      try {
        giornata = await giornataAzienda(supabase, c.id, today, inizio, fine);
      } catch (e) {
        summary.errors++;
        summary.errors_detail.push({ cantiere_id: `azienda:${c.id}`, message: e instanceof Error ? e.message : String(e) });
        continue;
      }
      if (giornata.size === 0) { summary.skipped++; continue; }

      let autore: string | undefined;
      if (idAmministratori.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: titolari } = await (supabase as any).from("profiles").select("id")
          .eq("company_id", c.id).in("id", idAmministratori).limit(1);
        autore = (titolari ?? [])[0]?.id as string | undefined;
      }
      if (!autore) { summary.skipped++; continue; }

      // Solo le commesse aperte, col giornale automatico, che oggi hanno dati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cantieri } = await (supabase as any)
        .from("orders")
        .select("id, order_code, company_id, indirizzo_lavori, work_description")
        .eq("company_id", c.id)
        .in("id", [...giornata.keys()])
        .eq("giornale_auto_enabled", true)
        .in("status", ["in_corso", "confermato", "active"])
        .is("deleted_at", null);
      const list = (cantieri ?? []) as CantiereLite[];
      summary.cantieri_processed += list.length;
      if (list.length === 0) { summary.skipped++; continue; }

      // Già scritti oggi: non si rifanno e non si paga l'AI.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: esistenti } = await (supabase as any).from("giornale_lavori").select("order_id")
        .eq("company_id", c.id).eq("data_lavori", today).in("order_id", list.map((x) => x.id));
      const giaFatti = new Set(((esistenti ?? []) as Array<{ order_id: string }>).map((x) => x.order_id));

      for (const cant of list) {
        if (giaFatti.has(cant.id)) { summary.skipped++; continue; }
        try {
          const aggregated = giornata.get(cant.id)!;

          // 2. Prima il testo: se l'AI non risponde (credito finito) non resta
          //    un giornale vuoto che blocca il giro successivo.
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
                content: JSON.stringify({ commessa: cant.order_code, indirizzo: cant.indirizzo_lavori, lavori: cant.work_description, ...aggregated }),
              },
            ],
            params: { temperature: 0.3, max_tokens: 1500 },
            companyId: c.id,
            estimatedCostEur: 0.05,
            idempotencyKey: `giornale-${cant.id}-${today}`,
          });

          // 3. Poi la riga del giornale (idempotente sulla coppia commessa+giorno).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: createRes, error: createErr } = await (supabase as any).rpc("silvio_tool_genera_giornale", {
            p_company_id: c.id,
            p_user_id: autore,
            p_cantiere_id: cant.id,
            p_data: today,
            p_force_regenerate: false,
          });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = createRes as any;
          if (r?.already_exists) { summary.skipped++; continue; }
          if (createErr || r?.error || !r?.giornale_id) {
            summary.errors++;
            summary.errors_detail.push({ cantiere_id: cant.id, message: createErr?.message ?? r?.error ?? "giornale non creato" });
            continue;
          }

          // 4. Il testo e le fonti sulla riga.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updErr } = await (supabase as any)
            .from("giornale_lavori")
            .update({
              lavorazioni_eseguite: aiResult.content,
              materiali_utilizzati: JSON.stringify(aggregated.materiali_consegnati),
              personale_presente: aggregated.personale_count,
              condizioni_meteo: aggregated.meteo_descrizione,
              ai_cost_billed_eur: aiResult.costBilledEur ?? 0,
              ai_confidence: aggregated.confidence,
              source_rapportini_ids: aggregated.rapportini_ids,
              source_foto_ids: aggregated.foto_ids,
              source_ddt_ids: [],
              source_segnalazioni_ids: aggregated.segnalazioni_ids,
            })
            .eq("id", r.giornale_id).eq("company_id", c.id);
          if (updErr) throw new Error(updErr.message);

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
  rapportini_ids: string[];
  foto_ids: string[];
  segnalazioni_ids: string[];
  materiali_consegnati: Array<{ descrizione: string; quantita: number; unita?: string }>;
  lavori: Array<{ ore: number; descrizione: string | null }>;
  confidence: number;
}

/**
 * Il lavoro registrato oggi da un'azienda, per commessa: rapportini inviati o
 * approvati, foto e segnalazioni dal campo. Le fonti vere (18/10/2026): prima
 * leggeva «rapportini» e «cantiere_photos», che non esistono più.
 */
async function giornataAzienda(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  data: string,
  inizio: string,
  fine: string,
): Promise<Map<string, AggregatedDay>> {
  const out = new Map<string, AggregatedDay>();
  const giorno = (orderId: string): AggregatedDay => {
    let g = out.get(orderId);
    if (!g) {
      g = { meteo_descrizione: null, personale_count: 0, rapportini_ids: [], foto_ids: [], segnalazioni_ids: [], materiali_consegnati: [], lavori: [], confidence: 0.5 };
      out.set(orderId, g);
    }
    return g;
  };

  const [raps, fotos, segs] = await Promise.all([
    supabase.from("campo_rapportini")
      .select("id, order_id, ore_lavorate, ore_straordinario, descrizione_lavori, materiali_usati, meteo, presenze, user_id")
      .eq("company_id", companyId).eq("data_lavoro", data).in("stato", ["inviato", "approvato"]).not("order_id", "is", null),
    supabase.from("foto_cantiere").select("id, order_id")
      .eq("company_id", companyId).gte("taken_at", inizio).lte("taken_at", fine).not("order_id", "is", null),
    supabase.from("tickets").select("id, order_id")
      .eq("company_id", companyId).eq("fonte", "campo").gte("created_at", inizio).lte("created_at", fine).not("order_id", "is", null),
  ]);
  for (const r of [raps, fotos, segs]) if (r.error) throw new Error(`giornata non leggibile: ${r.error.message}`);

  const persone = new Map<string, Set<string>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (raps.data ?? []) as any[]) {
    const g = giorno(r.order_id);
    g.rapportini_ids.push(r.id);
    g.confidence = 0.85;
    const set = persone.get(r.order_id) ?? new Set<string>();
    const presenze = Array.isArray(r.presenze) ? r.presenze : [];
    if (presenze.length) for (const p of presenze) set.add(String(p?.employee_id ?? p?.nome ?? ""));
    else if (r.user_id) set.add(r.user_id);
    persone.set(r.order_id, set);
    if (!g.meteo_descrizione && r.meteo) g.meteo_descrizione = r.meteo;
    for (const m of Array.isArray(r.materiali_usati) ? r.materiali_usati : []) {
      if (m?.descrizione) g.materiali_consegnati.push({ descrizione: String(m.descrizione), quantita: Number(m.quantita ?? 1), unita: m.unita_misura ?? m.unita ?? undefined });
    }
    g.lavori.push({ ore: Number(r.ore_lavorate ?? 0) + Number(r.ore_straordinario ?? 0), descrizione: r.descrizione_lavori ?? null });
  }
  for (const [orderId, set] of persone) giorno(orderId).personale_count = [...set].filter(Boolean).length;
  for (const f of (fotos.data ?? []) as Array<{ id: string; order_id: string }>) giorno(f.order_id).foto_ids.push(f.id);
  for (const t of (segs.data ?? []) as Array<{ id: string; order_id: string }>) giorno(t.order_id).segnalazioni_ids.push(t.id);
  return out;
}

/** L'istante UTC in cui comincia la giornata `data` (AAAA-MM-GG) a Roma. */
function inizioGiornoRoma(data: string): string {
  const mezzanotteUtc = new Date(`${data}T00:00:00Z`);
  const ora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" }).format(mezzanotteUtc));
  return new Date(mezzanotteUtc.getTime() - ora * 3600 * 1000).toISOString();
}
