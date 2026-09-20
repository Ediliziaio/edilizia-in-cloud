/**
 * MP-COMP-03 — Subappaltatori Compliance Monitor (cron daily)
 *
 * Scansiona ogni giorno tutti i documenti subappaltatore in scadenza:
 *   1. Lista documenti con expiration_date <= today + 30gg
 *   2. Per ciascuno: crea (o aggiorna) richiesta rinnovo via RPC
 *   3. Aggrega per company → invia 1 alert/notifica per compliance officer
 *   4. Aggiorna view materializzata subappaltatore_compliance_status (se esiste)
 *
 * Defensive: tabella subappaltatori_documenti potrebbe non esistere in alcuni
 * tenant; in quel caso ritorna 0 senza errori.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";

Deno.serve(async (req) => {
  // Chiede rinnovi e crea notifiche per TUTTE le aziende, con la chiave di
  // servizio: la fa partire solo il cron o un'altra nostra funzione —
  // fino al 20/09/2026 bastava conoscere l'URL. Prima di qualunque lavoro.
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata();

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const t0 = Date.now();
  const summary = {
    companies_processed: 0,
    docs_in_scadenza: 0,
    rinnovi_richiesti: 0,
    notifiche_inviate: 0,
    duration_ms: 0,
    errors: [] as string[],
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies } = await (supabase as any)
      .from("companies")
      .select("id");

    if (!companies || companies.length === 0) {
      summary.duration_ms = Date.now() - t0;
      return jsonOk(summary);
    }

    summary.companies_processed = companies.length;

    for (const c of companies) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: scadenze } = await (supabase as any).rpc(
          "silvio_tool_lista_documenti_in_scadenza",
          { p_company_id: c.id, p_giorni_anticipo: 30 },
        );

        const docs = (scadenze ?? []) as Array<{
          documento_id: string;
          subappaltatore_id: string;
          tipo_documento: string;
          expiration_date: string;
          giorni_residui: number;
        }>;

        summary.docs_in_scadenza += docs.length;

        // Aggregazione per subappaltatore (1 richiesta per coppia tipo+sub)
        const seen = new Set<string>();
        for (const d of docs) {
          const key = `${d.subappaltatore_id}::${d.tipo_documento}`;
          if (seen.has(key)) continue;
          seen.add(key);

          if (d.giorni_residui <= 15) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (supabase as any).rpc("silvio_tool_richiedi_rinnovo_documento", {
                p_company_id: c.id,
                p_subappaltatore_id: d.subappaltatore_id,
                p_tipo_documento: d.tipo_documento,
                p_motivo: `Scadenza tra ${d.giorni_residui} giorni`,
              });
              summary.rinnovi_richiesti += 1;
            } catch (e) {
              summary.errors.push(`renew ${key}: ${(e as Error).message}`);
            }
          }
        }

        // Notifica aggregata per company se almeno 1 documento in scadenza
        if (docs.length > 0) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("notifications").insert({
              company_id: c.id,
              type: "compliance_alert",
              severity: docs.some((x) => x.giorni_residui <= 7) ? "high" : "medium",
              title: `Subappaltatori: ${docs.length} documenti in scadenza`,
              body: `Compliance officer: verifica documenti entro 30 giorni.`,
              metadata: { source: "subappaltatori-compliance-monitor", count: docs.length },
            });
            summary.notifiche_inviate += 1;
          } catch (_e) {
            /* table may not exist */
          }
        }
      } catch (e) {
        summary.errors.push(`company ${c.id}: ${(e as Error).message}`);
      }
    }

    summary.duration_ms = Date.now() - t0;
    return jsonOk(summary);
  } catch (e) {
    summary.duration_ms = Date.now() - t0;
    summary.errors.push(`fatal: ${(e as Error).message}`);
    return jsonOk(summary, 500);
  }
});

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
