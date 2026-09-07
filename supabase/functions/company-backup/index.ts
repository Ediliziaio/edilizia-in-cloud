// company-backup — Export periodico dei dati di un'azienda (F4-07).
//
// PROBLEMA
// Non esiste alcuna funzione di backup, snapshot o restore nel prodotto:
// l'unica rete è il point-in-time recovery gestito da Supabase, che vive fuori
// dal SuperAdmin e richiede competenze da DBA. Un backup mai testato non è un
// backup; uno che non si sa come ripristinare nemmeno.
//
// COSA FA
// Scrive su storage un export JSON per azienda, con le entità che contano
// davvero in un ripristino. Gira settimanalmente su tutte le aziende vive,
// oppure su una sola quando gli si passa un companyId.
//
// COSA NON FA
// Non sostituisce il PITR per un ripristino completo del database: serve a
// rimettere in piedi UNA azienda, che è lo scenario realistico (cancellazione
// per errore, cliente che chiede i propri dati, contestazione su cosa c'era).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireInternalSecret } from "../_shared/auth.ts";
import { conMetriche } from "../_shared/withMetrics.ts";

const BUCKET = "company-exports";

// L'elenco delle tabelle lo decide il catalogo (admin_tabelle_da_esportare):
// tutto ciò che ha una company_id, meno telemetria e log. Le otto tabelle
// scelte a mano il 4 settembre lasciavano fuori i listini, le famiglie di
// articoli, le tariffe, i fornitori e i ticket — cioè il lavoro dell'azienda.
// Se il catalogo non risponde si torna a quelle otto, dichiarandolo nel file.
const TABELLE_DI_RISERVA = [
  "profiles", "customers", "orders", "quotes", "invoices",
  "subscription_invoices", "company_feature_overrides", "company_status_events",
] as const;

// PostgREST restituisce al massimo 1.000 righe per chiamata. Il backup
// precedente non se ne curava: una tabella da 13.963 righe finiva nel file
// con le prime mille, senza alcun segno del taglio.
const PAGINA = 1000;

async function leggiTutte(
  admin: ReturnType<typeof createClient>, tabella: string, companyId: string,
): Promise<{ righe: unknown[]; errore?: string }> {
  const righe: unknown[] = [];
  for (let da = 0; ; da += PAGINA) {
    const { data, error } = await admin
      .from(tabella).select("*").eq("company_id", companyId).range(da, da + PAGINA - 1);
    if (error) return { righe, errore: error.message };
    righe.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return { righe };
}

Deno.serve(conMetriche("company-backup", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    requireInternalSecret(req, cors);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const body = await req.json().catch(() => ({}));
    const soloUna: string | null = body?.companyId ?? null;

    let query = admin
      .from("companies")
      .select("*")
      .is("deleted_at", null)
      .eq("is_platform_admin_company", false);
    if (soloUna) query = query.eq("id", soloUna);

    const { data: aziende, error: errAziende } = await query;
    if (errAziende) throw new Error(errAziende.message);

    const esiti: Array<{ azienda: string; percorso?: string; record?: number; errore?: string }> = [];

    const { data: catalogo, error: errCatalogo } = await admin.rpc("admin_tabelle_da_esportare");
    const tabelle: string[] = errCatalogo || !catalogo?.length
      ? [...TABELLE_DI_RISERVA]
      : (catalogo as Array<{ tabella: string }>).map((t) => t.tabella);

    for (const azienda of aziende ?? []) {
      try {
        const dump: Record<string, unknown> = {
          esportato_il: new Date().toISOString(),
          tabelle_incluse: tabelle.length,
          elenco_da_catalogo: !errCatalogo,
          azienda,
        };
        let record = 0;

        for (const tabella of tabelle) {
          const { righe, errore } = await leggiTutte(admin, tabella, azienda.id);
          // Una tabella che non si legge non deve far saltare l'intero export:
          // meglio un backup parziale, dichiarato, che nessun backup.
          if (errore) {
            dump[`${tabella}__errore`] = errore;
            continue;
          }
          // Le tabelle vuote non entrano: un file con trecento chiavi vuote è
          // illeggibile e non dice niente in più.
          if (righe.length === 0) continue;
          dump[tabella] = righe;
          record += righe.length;
        }

        const percorso = `${azienda.id}/${new Date().toISOString().slice(0, 10)}-backup.json`;
        const { error: errUp } = await admin.storage
          .from(BUCKET)
          .upload(percorso, new Blob([JSON.stringify(dump)], { type: "application/json" }), {
            upsert: true,
            contentType: "application/json",
          });
        if (errUp) throw new Error(errUp.message);

        esiti.push({ azienda: azienda.name, percorso, record });
      } catch (e) {
        esiti.push({ azienda: azienda.name, errore: (e as Error)?.message ?? "errore sconosciuto" });
      }
    }

    const falliti = esiti.filter((e) => e.errore).length;

    return new Response(
      JSON.stringify({
        aziende: esiti.length,
        riusciti: esiti.length - falliti,
        falliti,
        esiti,
      }),
      {
        // Se falliscono tutte è un guasto vero e deve risultare tale nelle
        // metriche; se ne fallisce qualcuna il backup è parziale ma avvenuto.
        status: falliti > 0 && falliti === esiti.length ? 500 : 200,
        headers: { ...cors, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[company-backup]", err);
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? "Errore interno" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
}));
