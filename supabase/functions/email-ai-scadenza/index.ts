/**
 * email-ai-scadenza — MP-EMAIL-AI-09 · Documento estratto → scadenza previsionale
 *
 * Riusa la bozza MP-06 (campi.scadenza + campi.totale). Direzione:
 *   fornitore → uscita (pagamento), cliente → entrata (incasso).
 * Crea una BOZZA di scadenza (previsionale). La voce reale nel Cashflow nasce
 * SOLO alla conferma umana (RPC email_scadenza_conferma). Dedup per documento.
 *
 * Endpoint POST: { documento_estratto_id: uuid }  · Auth: Bearer (staff interno).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { parseImporto } from "../_shared/doc-validation.ts";

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

    const { data: doc, error: docErr } = await userClient
      .from("email_documento_estratto")
      .select("id, company_id, email_id, campi, fornitore_match_id, fornitore_match_tipo")
      .eq("id", docId).maybeSingle();
    if (docErr || !doc) return json({ error: "documento_non_trovato" }, 404, cors);

    const campi = (doc.campi || {}) as Record<string, any>;
    const scadenzaRaw: string | null = campi.scadenza?.valore ?? null;
    const totale = parseImporto(campi.totale?.valore);
    if (!scadenzaRaw || !/^\d{4}-\d{2}-\d{2}$/.test(String(scadenzaRaw))) {
      return json({ skipped: "no_scadenza", reason: "Nessuna data di scadenza valida nel documento." }, 200, cors);
    }
    if (totale == null || totale <= 0) {
      return json({ skipped: "no_importo", reason: "Nessun importo valido nel documento." }, 200, cors);
    }

    // Direzione: fornitore → uscita, cliente → entrata (default uscita: fatture passive)
    const direzione = doc.fornitore_match_tipo === "cliente" ? "entrata" : "uscita";
    const descr = `${campi.fornitore_ragione_sociale?.valore || "Documento"} — ${campi.numero?.valore || ""}`.trim();

    // Dedup: scadenza già creata per questo documento (in scadenze.email_documento_estratto_id)
    const { data: existing } = await supabase
      .from("scadenze").select("id").eq("company_id", doc.company_id).eq("email_documento_estratto_id", docId).limit(1).maybeSingle();
    const dedupId = existing?.id ?? null;

    await supabase.from("email_scadenza_bozza").delete().eq("documento_estratto_id", docId).eq("stato", "bozza");
    const { data: bozza, error: insErr } = await supabase
      .from("email_scadenza_bozza")
      .insert({
        company_id: doc.company_id,
        email_id: doc.email_id,
        documento_estratto_id: docId,
        direzione,
        amount: totale,
        due_date: scadenzaRaw,
        descrizione: descr,
        controparte_id: doc.fornitore_match_id,
        controparte_tipo: doc.fornitore_match_tipo,
        dedup_scadenza_id: dedupId,
        created_by: u.user.id,
      })
      .select("*").single();
    if (insErr) return json({ error: "save_failed", detail: insErr.message }, 500, cors);

    return json({ ok: true, bozza, gia_presente: !!dedupId }, 200, cors);
  } catch (e) {
    console.error("[email-ai-scadenza] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500, cors);
  }
});

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
