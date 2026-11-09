/**
 * MP-OPS-03 — Bozza serale del giornale di cantiere.
 *
 * Per ogni azienda con `giornale_auto_enabled` e ogni commessa col suo interruttore
 * acceso, compone la bozza del giorno da rapportini, bolle, segnalazioni e foto
 * (`_shared/bozzaGiornale.ts`). Niente AI: riporta quel che è registrato. Scrive solo
 * bozze nuove, non tocca mai una pagina esistente; la firma resta a una persona.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import {
  COLONNE_DDT_BOZZA, STATI_DDT_NON_ARRIVATO, STATI_RAPPORTINO_BOZZA, commessaDelDdt, componiBozzaGiornale,
  intervalloGiornoRoma, type DdtPerBozza, type GiornataPerBozza, type RapportinoPerBozza, type SegnalazionePerBozza,
} from "../_shared/bozzaGiornale.ts";
import { righeEventiProposti } from "../_shared/eventiGiornale.ts";

interface CantiereLite {
  id: string;
}

// Un giro passa su tutte le aziende con la bozza serale accesa e il lavoro cresce
// con le aziende. pg_net ha un solo worker e
// finché questa non risponde la coda di TUTTI i cron resta ferma. Con la risposta rapida pg_net riceve 202 entro 5 secondi
// e il lavoro finisce sotto EdgeRuntime.waitUntil; chi la chiama col service role
// continua a ricevere il riepilogo completo. Vedi _shared/rispostaRapidaCron.ts.
serveConMetricheRapida("auto-genera-giornale-cantiere", async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Gira in service_role su tutte le aziende: la protegge il segreto del cron,
  // non il verify_jwt del gateway, che fa passare qualunque utente autenticato.
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
    const { inizio, fine } = intervalloGiornoRoma(today);

    // La bozza nasce a nome del titolare (la firma resta da fare). In due passi: user_roles punta ad
    // auth.users, non a profiles, e una lettura unita delle due tabelle
    // risponde sempre con un errore. Gli amministratori sono poche decine.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: amministratori, error: errAdmin } = await (supabase as any).from("user_roles").select("user_id").eq("role", "company_admin");
    if (errAdmin) throw new Error(`amministratori non leggibili: ${errAdmin.message}`);
    const idAmministratori = ((amministratori ?? []) as Array<{ user_id: string }>).map((x) => x.user_id);

    for (const c of companies) {
      // Azienda sospesa, scaduta o cessata: nessuno lo legge.
      if (["suspended", "cancelled", "canceled", "expired"].includes(String(c.status ?? ""))) { summary.skipped++; continue; }

      // 1. Il lavoro registrato oggi: le letture sono per azienda, non per commessa.
      let giornata: Map<string, GiornataPerBozza>;
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

      // Solo le commesse aperte, col loro interruttore acceso (di base lo è), che oggi hanno dati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cantieri } = await (supabase as any)
        .from("orders")
        .select("id")
        .eq("company_id", c.id)
        .in("id", [...giornata.keys()])
        .eq("giornale_auto_enabled", true)
        .in("status", ["in_corso", "confermato", "active"])
        .is("deleted_at", null);
      const list = (cantieri ?? []) as CantiereLite[];
      summary.cantieri_processed += list.length;
      if (list.length === 0) { summary.skipped++; continue; }

      // Una pagina c'è già, bozza o firmata: non si tocca.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: esistenti } = await (supabase as any).from("giornale_lavori").select("order_id")
        .eq("company_id", c.id).eq("data_lavori", today).in("order_id", list.map((x) => x.id));
      const giaFatti = new Set(((esistenti ?? []) as Array<{ order_id: string }>).map((x) => x.order_id));

      for (const cant of list) {
        if (giaFatti.has(cant.id)) { summary.skipped++; continue; }
        try {
          const bozza = componiBozzaGiornale(giornata.get(cant.id)!);
          // Niente da scrivere: niente pagina vuota.
          if (bozza.vuota) { summary.skipped++; continue; }

          // ignoreDuplicates: se nel frattempo qualcuno ha scritto la pagina, resta la sua.
          // `imported` = composta dai dati del giorno: il controllo sulla colonna ammette solo manual, auto_ai, imported.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: scritte, error: insErr } = await (supabase as any)
            .from("giornale_lavori")
            .upsert({
              company_id: c.id,
              order_id: cant.id,
              data_lavori: today,
              stato: "bozza",
              generation_method: "imported",
              created_by: autore,
              visibile_cliente: false,
              ...bozza.campi,
              ...bozza.fonti,
            }, { onConflict: "order_id,data_lavori", ignoreDuplicates: true })
            .select("id");
          if (insErr) throw new Error(insErr.message);
          if (!scritte || scritte.length === 0) { summary.skipped++; continue; }

          summary.giornali_generated++;

          // Solo sulla pagina nata da questo giro: su una pagina altrui `scritte` è vuoto e si esce sopra.
          if (bozza.eventi.length) {
            const { conDdt, conTicket } = righeEventiProposti(bozza.eventi, c.id, scritte[0].id as string);
            for (const [righe, chiave] of [[conDdt, "giornale_id,ddt_id"], [conTicket, "giornale_id,ticket_id"]] as const) {
              if (!righe.length) continue;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error: errEventi } = await (supabase as any).from("giornale_eventi")
                .upsert(righe, { onConflict: chiave, ignoreDuplicates: true });
              if (errEventi) throw new Error(`eventi non scritti: ${errEventi.message}`);
            }
          }
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

type ClientDb = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Il lavoro registrato oggi da un'azienda, per commessa: rapportini inviati o
 * approvati, bolle arrivate, segnalazioni dal campo e foto.
 */
async function giornataAzienda(
  supabase: ClientDb,
  companyId: string,
  data: string,
  inizio: string,
  fine: string,
): Promise<Map<string, GiornataPerBozza>> {
  const [raps, fotos, segs, bolle] = await Promise.all([
    supabase.from("campo_rapportini")
      .select("id, order_id, user_id, stato, ore_lavorate, ore_straordinario, descrizione_lavori, materiali_usati, mezzi_usati, meteo, presenze, percentuale_avanzamento")
      .eq("company_id", companyId).eq("data_lavoro", data).in("stato", [...STATI_RAPPORTINO_BOZZA]).not("order_id", "is", null),
    supabase.from("foto_cantiere").select("id, order_id")
      .eq("company_id", companyId).gte("taken_at", inizio).lte("taken_at", fine).not("order_id", "is", null),
    supabase.from("tickets").select("id, order_id, titolo, subject, descrizione")
      .eq("company_id", companyId).eq("fonte", "campo").gte("created_at", inizio).lte("created_at", fine).not("order_id", "is", null),
    supabase.from("ddt_ricezione").select(COLONNE_DDT_BOZZA)
      .eq("company_id", companyId).eq("data_ricezione", data).not("stato", "in", `(${STATI_DDT_NON_ARRIVATO.join(",")})`),
  ]);
  for (const r of [raps, fotos, segs, bolle]) if (r.error) throw new Error(`giornata non leggibile: ${r.error.message}`);

  const rapportini = (raps.data ?? []) as Array<RapportinoPerBozza & { order_id: string }>;
  const idAutori = [...new Set(rapportini.map((r) => r.user_id).filter((x): x is string => !!x))];
  const nomiAutori: Record<string, string> = {};
  if (idAutori.length) {
    const { data: profili, error } = await supabase.from("profiles").select("id, first_name, last_name").in("id", idAutori);
    if (error) throw new Error(`autori non leggibili: ${error.message}`);
    for (const p of (profili ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      const nome = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (nome) nomiAutori[p.id] = nome;
    }
  }

  const out = new Map<string, GiornataPerBozza>();
  const giorno = (orderId: string): GiornataPerBozza => {
    let g = out.get(orderId);
    if (!g) {
      g = { rapportini: [], ddt: [], segnalazioni: [], fotoIds: [], nomiAutori };
      out.set(orderId, g);
    }
    return g;
  };
  for (const r of rapportini) giorno(r.order_id).rapportini.push(r);
  for (const d of (bolle.data ?? []) as DdtPerBozza[]) {
    const orderId = commessaDelDdt(d);
    if (orderId) giorno(orderId).ddt!.push(d);
  }
  for (const s of (segs.data ?? []) as Array<SegnalazionePerBozza & { order_id: string }>) giorno(s.order_id).segnalazioni!.push(s);
  for (const f of (fotos.data ?? []) as Array<{ id: string; order_id: string }>) giorno(f.order_id).fotoIds!.push(f.id);
  return out;
}
