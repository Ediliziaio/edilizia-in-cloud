/**
 * silvio-trigger-tick — MP-SILVIO-03 · Silvio proattivo (cron)
 *
 * Osserva eventi DETERMINISTICI e PROPONE (mai esegue da solo): chiama
 * l'orchestratore con origine='trigger' → tutto finisce in coda conferme.
 * Idempotente via silvio_trigger_log (un evento → una sola proposta).
 *
 * Trigger v1: email importanti FERME (da_rivedere, non lette, >24h) → propone
 * una bozza di risposta. Framework estendibile (scadenze, preventivi fermi, DDT).
 * Auth: service role o x-cron-secret. Niente AI qui: la condizione è deterministica.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const BATCH = 100;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (!((token && token === SERVICE_ROLE) || (CRON_SECRET && cronHeader === CRON_SECRET))) {
    return json({ error: "unauthorized" }, 401, cors);
  }

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);
  const result = { email_ferme: 0, proposte: 0, gia_proposte: 0, errori: 0 };

  try {
    // ── Trigger: email importanti ferme (>24h) ────────────────────────────────
    const soglia = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: ferme } = await supa
      .from("email_inbox")
      .select("id, company_id, subject")
      .eq("da_rivedere", true).eq("is_read", false).eq("is_trashed", false)
      .lt("received_at", soglia)
      .order("received_at", { ascending: true })
      .limit(BATCH);

    for (const e of (ferme as any[]) || []) {
      result.email_ferme++;
      try {
        // idempotenza: prova a loggare l'evento; se esiste già → salta
        const { data: logged } = await supa.from("silvio_trigger_log")
          .upsert({ company_id: e.company_id, tipo: "email_ferma", chiave_evento: e.id },
                  { onConflict: "company_id,tipo,chiave_evento", ignoreDuplicates: true })
          .select("id");
        if (!logged || (logged as any[]).length === 0) { result.gia_proposte++; continue; }

        // proponi (via orchestratore, origine trigger → coda)
        const res = await fetch(`${SUPABASE_URL}/functions/v1/silvio-orchestratore`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({
            origine: "trigger", company_id: e.company_id, origine_id: e.id,
            piano: { intento: "proponi_risposta_email_ferma",
              passi: [{ azione: "genera_bozza_risposta", parametri: { email_id: e.id } }], confidenza: 1 },
          }),
        });
        if (res.ok) result.proposte++; else result.errori++;
      } catch (inner) {
        result.errori++;
        console.error("[silvio-trigger-tick] evento error", e?.id, inner);
      }
    }

    return json({ ok: true, ...result }, 200, cors);
  } catch (err) {
    console.error("[silvio-trigger-tick] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
  }
});

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
