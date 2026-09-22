// openwa-classifica-risposte — qualifica con l'AI le risposte di una campagna.
//
// Le risposte non qualificate (stato 'risposto', esito NULL) vengono lette e
// classificate negli stessi esiti della pipeline: appuntamento /
// da_ricontattare / non_interessato. Cosi' il funnel si riempie senza
// trascinare a mano — ma resta correggibile: l'esito AI si sposta in pipeline
// come qualunque altro.
//
// Si lancia A RICHIESTA dal pulsante nel report risposte, non a cron: e' una
// valutazione che chi gestisce la campagna vuole vedere accadere, non
// scoprire dopo. "cliente" NON e' fra gli esiti che l'AI puo' assegnare:
// dichiarare vinto un contratto e' una decisione umana.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { classificaUnaRisposta } from "../_shared/openwa-classifica-una-risposta.ts";

const PER_CHIAMATA = 25; // tetto per invocazione: l'utente ripreme se ce ne sono altre

Deno.serve(async (req) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });
  const jsonH = { ...corsH, "Content-Type": "application/json" };

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);
    const admin = supabaseAdmin ?? createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { campagna_id: campagnaId } = await req.json().catch(() => ({}));
    if (!campagnaId) {
      return new Response(JSON.stringify({ error: "campagna_id mancante" }), { status: 400, headers: jsonH });
    }

    const { data: daFare } = await admin
      .from("openwa_campagna_destinatari")
      .select("id, contact_id, primo_inviato_at")
      .eq("campagna_id", campagnaId)
      .eq("stato", "risposto")
      .is("esito", null)
      .limit(PER_CHIAMATA);

    const risultato = { classificati: 0, senza_testo: 0, incerti: 0, restanti: 0 };

    for (const d of daFare ?? []) {
      const esito = await classificaUnaRisposta(admin, d);
      if (esito === "senza_testo") { risultato.senza_testo++; continue; }
      if (esito === "incerto") { risultato.incerti++; continue; }
      risultato.classificati++;
    }

    const { count } = await admin
      .from("openwa_campagna_destinatari")
      .select("id", { count: "exact", head: true })
      .eq("campagna_id", campagnaId)
      .eq("stato", "risposto")
      .is("esito", null);
    risultato.restanti = count ?? 0;

    return new Response(JSON.stringify({ ok: true, ...risultato }), { headers: jsonH });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[openwa-classifica-risposte]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: jsonH });
  }
});
