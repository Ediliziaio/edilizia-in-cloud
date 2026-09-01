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
import { aiRouterPrompt } from "../_shared/aiRouter.ts";

const PLATFORM_COMPANY_ID = "00000000-0000-0000-0000-000000000001";
const PER_CHIAMATA = 25; // tetto per invocazione: l'utente ripreme se ce ne sono altre

const ESITI_AI = new Set(["appuntamento", "da_ricontattare", "non_interessato"]);

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

    const esito = { classificati: 0, senza_testo: 0, incerti: 0, restanti: 0 };

    for (const d of daFare ?? []) {
      // Fino a 3 messaggi della persona: il primo "Ciao?" da solo dice poco.
      const { data: msgs } = await admin
        .from("openwa_messages")
        .select("body")
        .eq("contact_id", d.contact_id)
        .eq("direction", "inbound")
        .gte("created_at", d.primo_inviato_at ?? "1970-01-01")
        .order("created_at", { ascending: true })
        .limit(3);
      const testi = (msgs ?? []).map((m: { body: string | null }) => m.body).filter(Boolean);
      if (!testi.length) { esito.senza_testo++; continue; }

      try {
        const r = await aiRouterPrompt({
          supabase: admin,
          taskKey: "openwa_classifica_risposta",
          companyId: PLATFORM_COMPANY_ID,
          systemPrompt: [
            "Classifichi la risposta di un'azienda a un primo contatto WhatsApp B2B.",
            "Rispondi SOLO con una di queste parole:",
            "- appuntamento: vuole parlare, chiede una chiamata/incontro, chiede quando",
            "- da_ricontattare: interessato ma non ora, chiede materiale, risposta interlocutoria",
            "- non_interessato: rifiuta, dice di no, chiede di non essere contattato",
            "- incerto: non si capisce (un solo 'Ciao?', emoji, fuori tema)",
            "Nessun'altra parola, nessuna spiegazione.",
          ].join("\n"),
          userPrompt: `Risposta del contatto:\n${testi.join("\n---\n")}`,
        });
        const parola = (r.content ?? "").trim().toLowerCase().replace(/[^a-z_]/g, "");
        if (ESITI_AI.has(parola)) {
          await admin.from("openwa_campagna_destinatari")
            .update({ esito: parola, esito_at: new Date().toISOString() })
            .eq("id", d.id)
            .is("esito", null); // non sovrascrive una scelta umana nel frattempo
          esito.classificati++;
        } else {
          esito.incerti++;
        }
      } catch (e) {
        console.warn("[openwa-classifica] AI:", (e as Error)?.message);
        esito.incerti++;
      }
    }

    const { count } = await admin
      .from("openwa_campagna_destinatari")
      .select("id", { count: "exact", head: true })
      .eq("campagna_id", campagnaId)
      .eq("stato", "risposto")
      .is("esito", null);
    esito.restanti = count ?? 0;

    return new Response(JSON.stringify({ ok: true, ...esito }), { headers: jsonH });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[openwa-classifica-risposte]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: jsonH });
  }
});
