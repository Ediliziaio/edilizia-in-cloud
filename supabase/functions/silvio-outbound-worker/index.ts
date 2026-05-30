/**
 * silvio-outbound-worker — MP-SILVIO-ACTIONS-EXTERNAL-01 (FIX CRITICO audit 2026-05-30)
 *
 * Consegna i messaggi outbound di Silvio (silvio_outbound_messages) creati DOPO
 * l'approvazione umana del tool yellow (componi_e_invia_messaggio / TWINS). Prima
 * d'ora nessun processo consumava la coda → le email non partivano mai.
 *
 * SICUREZZA DESTINATARIO (regola ferrea): l'indirizzo email NON viene mai indovinato.
 * Si risolve SOLO tramite la RPC verificata `silvio_outbound_resolve_recipient`
 * (cliente/fornitore/dipendente/lead, scoped per company). Se non risolvibile →
 * status='failed' con motivo chiaro, MAI un invio a indirizzo arbitrario.
 *
 * Canali: solo 'email' (riusa sendEmailUnified, sistema esistente). whatsapp/sms →
 * falliti con motivo (worker dedicato in step successivo). Le risposte a thread
 * (thread_id senza dest_id) non sono ancora consegnabili in sicurezza → failed.
 *
 * Claim atomico: UPDATE condizionale su (status='queued' AND claimed_at IS NULL).
 * Reconciler: claim più vecchi di 10 min rilasciati (retry) o falliti (cap tentativi).
 * Errore provider → failed (no retry-loop). Solo chiamata interna (cron secret) o
 * super_admin per debug.
 *
 * Trigger: cron (silvio_invoke_edge). Manuale: super_admin POST.
 */

import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { isInternalRequest, requireInternalSecret, requireAuth } from "../_shared/auth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_PER_RUN = 10;
const MAX_ATTEMPTS = 3;
const STALE_MINUTES = 10;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function bodyToHtml(body: string): string {
  const safe = escapeHtml(body ?? "").replace(/\r?\n/g, "<br>");
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1f2937">${safe}</div>`;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    if (isInternalRequest(req)) {
      requireInternalSecret(req, cors);
    } else {
      const auth = await requireAuth(req, cors); // path debug
      if (!auth.isSuperAdmin) return errorResponse("Solo super_admin", 403, cors);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin: any = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // ── Reconciler (idempotente) ──────────────────────────────────────────────
    const staleCutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
    // a) claim orfani (worker morto prima di finalizzare) con tentativi residui → rilascia
    const { data: released } = await admin
      .from("silvio_outbound_messages")
      .update({ claimed_at: null })
      .eq("status", "queued").lt("claimed_at", staleCutoff).lt("attempts", MAX_ATTEMPTS)
      .select("id");
    // b) tentativi esauriti dopo timeout → fallisci (no loop infinito)
    const { data: exhausted } = await admin
      .from("silvio_outbound_messages")
      .update({ status: "failed", error: "consegna non riuscita: tentativi esauriti dopo timeout" })
      .eq("status", "queued").lt("claimed_at", staleCutoff).gte("attempts", MAX_ATTEMPTS)
      .select("id");

    // ── Candidati: in coda e liberi ───────────────────────────────────────────
    const { data: candidates } = await admin
      .from("silvio_outbound_messages")
      .select("id, company_id, dest_tipo, dest_id, canale, oggetto, corpo, scopo, thread_id, attempts")
      .eq("status", "queued").is("claimed_at", null)
      .order("created_at", { ascending: true })
      .limit(MAX_PER_RUN);

    let sent = 0, failed = 0, skipped = 0;

    const failRow = async (id: string, reason: string) => {
      await admin.from("silvio_outbound_messages")
        .update({ status: "failed", error: reason.slice(0, 500) })
        .eq("id", id);
    };

    for (const m of (candidates ?? [])) {
      // claim atomico: vince solo chi porta claimed_at da NULL → now
      const { data: claimed } = await admin
        .from("silvio_outbound_messages")
        .update({ claimed_at: new Date().toISOString(), attempts: (m.attempts ?? 0) + 1 })
        .eq("id", m.id).eq("status", "queued").is("claimed_at", null)
        .select("id").maybeSingle();
      if (!claimed) { skipped++; continue; }

      // canale: solo email
      if ((m.canale ?? "email") !== "email") {
        await failRow(m.id, `canale '${m.canale}' non supportato dal worker (solo email)`);
        failed++; continue;
      }

      // risoluzione destinatario SOLO verificata (mai indovinata)
      let recipient: { email?: string; nome?: string } | null = null;
      if (m.dest_id && m.dest_tipo) {
        const { data: r } = await admin.rpc("silvio_outbound_resolve_recipient", {
          p_company_id: m.company_id, p_dest_tipo: m.dest_tipo, p_dest_id: m.dest_id,
        });
        recipient = (r && typeof r === "object") ? r : null;
      }
      if (!recipient?.email) {
        await failRow(
          m.id,
          m.thread_id
            ? "risposta a thread email non ancora consegnabile in sicurezza (destinatario non risolvibile)"
            : "destinatario non risolvibile: email mancante o contatto inesistente (nessun invio a indirizzo indovinato)",
        );
        failed++; continue;
      }

      // invio reale via pipeline esistente (transactional)
      try {
        const res = await sendEmailUnified({
          companyId: m.company_id,
          stream: "transactional",
          to: recipient.email,
          subject: (m.oggetto && m.oggetto.trim()) ? m.oggetto.trim() : "Comunicazione",
          html: bodyToHtml(m.corpo ?? ""),
          text: m.corpo ?? "",
          templateName: "silvio_outbound",
          adminClient: admin,
          metadata: {
            silvio_outbound_id: m.id,
            scopo: m.scopo ?? null,
            dest_tipo: m.dest_tipo ?? null,
            recipient_nome: recipient.nome ?? null,
          },
        });
        if (res.ok) {
          await admin.from("silvio_outbound_messages").update({
            status: "sent",
            provider_message_id: res.providerMessageId ?? null,
            sent_at: new Date().toISOString(),
            error: null,
          }).eq("id", m.id);
          sent++;
        } else {
          const reason = typeof res.body === "object" ? JSON.stringify(res.body) : String(res.body ?? `HTTP ${res.status}`);
          await failRow(m.id, reason);
          failed++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await failRow(m.id, msg);
        failed++;
        console.error(`[outbound-worker] ${m.id} fail:`, msg);
      }
    }

    return jsonResponse({
      ok: true, sent, failed, skipped,
      released: (released ?? []).length,
      exhausted: (exhausted ?? []).length,
      candidates: (candidates ?? []).length,
    }, 200, cors);
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[outbound-worker] fatal", msg);
    return errorResponse(`Fatal: ${msg}`, 500, cors);
  }
});
