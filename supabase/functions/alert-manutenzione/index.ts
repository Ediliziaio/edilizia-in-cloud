/**
 * alert-manutenzione — Cron job giornaliero (08:00)
 * Trova piani_manutenzione in scadenza entro 14 giorni,
 * crea ticket intervento e invia notifica admin.
 *
 * Da schedulare in Supabase Dashboard:
 *   Cron: 0 8 * * *
 */
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const oggi = new Date();
    const fra14 = new Date(oggi);
    fra14.setDate(fra14.getDate() + 14);
    const fra14Str = fra14.toISOString().split("T")[0];
    const oggiStr = oggi.toISOString().split("T")[0];

    // Trova piani in scadenza nei prossimi 14 giorni
    const { data: piani, error } = await supabaseAdmin
      .from("piani_manutenzione")
      .select(`
        id, titolo, prossima_scadenza, tecnico_preferito, company_id,
        contratto:contratti_manutenzione(customer_id, nome_contratto)
      `)
      .eq("attivo", true)
      .lte("prossima_scadenza", fra14Str)
      .order("prossima_scadenza", { ascending: true });

    if (error) throw error;

    let ticketsCreati = 0;

    for (const piano of piani ?? []) {
      const scadenza = piano.prossima_scadenza ?? "";
      const scaduto = scadenza < oggiStr;
      const customerId = (piano.contratto as any)?.customer_id;
      if (!customerId) continue;

      // Crea ticket intervento
      const { error: ticketErr } = await supabaseAdmin.from("tickets").insert({
        company_id: piano.company_id,
        customer_id: customerId,
        subject: `Manutenzione programmata: ${piano.titolo}`,
        tipo: "intervento",
        status: "aperto",
        priority: scaduto ? "urgente" : "normale",
        assigned_to: piano.tecnico_preferito || null,
      });

      if (!ticketErr) {
        ticketsCreati++;
      } else {
        console.error(`[alert-manutenzione] Errore ticket per piano ${piano.id}:`, ticketErr.message);
      }
    }

    return jsonResponse({
      processed: (piani ?? []).length,
      tickets_creati: ticketsCreati,
      data_controllo: oggi.toISOString(),
    });
  } catch (err: any) {
    console.error("[alert-manutenzione]", err);
    return errorResponse(err.message || "Errore interno", 500);
  }
});
