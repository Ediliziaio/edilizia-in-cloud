/**
 * email-ai-ddt-carico — MP-EMAIL-AI-07 · DDT estratto → proposta di carico
 *
 * Riusa la bozza estratta da MP-06 (campi.righe del DDT). NON ri-legge il PDF.
 *   1) Match ODA: per riferimento_ordine (oda_number/supplier_reference) o, in
 *      fallback, ultimo ordine aperto del fornitore (per nome → suppliers).
 *   2) Confronto righe: articolo per articolo, qta in bolla vs qta ordinata
 *      (sku esatto, poi descrizione). Scostamenti EVIDENZIATI, mai nascosti.
 *   3) Salva una BOZZA di carico (stato 'bozza'). La giacenza NON si tocca:
 *      l'aggiornamento è azione umana successiva (mai movimento cieco).
 *
 * Endpoint POST: { documento_estratto_id: uuid }  · Auth: Bearer (staff interno).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { buildDdtCarico } from "../_shared/ddtCarico.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Auth required" }, 401, cors);
    const { data: u } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!u.user) return json({ error: "Invalid token" }, 401, cors);
    // Client user-scoped: la RLS verifica l'accesso alla bozza (anti cross-tenant).
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json().catch(() => ({}));
    const docId: string = (body.documento_estratto_id || "").toString();
    if (!docId) return json({ error: "documento_estratto_id required" }, 400, cors);

    // ── Carica la bozza estratta (MP-06) — via userClient (RLS staff/company) ─
    const { data: doc, error: docErr } = await userClient
      .from("email_documento_estratto")
      .select("id, company_id, email_id, tipo, campi, fornitore_match_id")
      .eq("id", docId)
      .maybeSingle();
    if (docErr || !doc) return json({ error: "documento_non_trovato" }, 404, cors);

    // ── Logica match ODA + confronto righe + salvataggio bozza (condivisa) ───
    // Vedi _shared/ddtCarico.ts (riusata anche da whatsapp-ai-processor/carica_ddt).
    const res = await buildDdtCarico(
      supabase,
      {
        id: doc.id,
        company_id: doc.company_id,
        email_id: doc.email_id,
        campi: (doc.campi || {}) as Record<string, any>,
        fornitore_match_id: doc.fornitore_match_id,
      },
      u.user.id,
    );
    if (!res.ok) {
      return json(
        res.reason ? { error: res.error, reason: res.reason } : { error: res.error },
        res.status,
        cors,
      );
    }

    return json(
      { ok: true, carico: res.carico, ordine_collegato: res.ordine_collegato, scostamenti: res.scostamenti },
      200,
      cors,
    );
  } catch (e) {
    console.error("[email-ai-ddt-carico] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, cors);
  }
});

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
