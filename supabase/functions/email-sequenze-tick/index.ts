/**
 * email-sequenze-tick — MP-EMAIL-AI-13 · motore sequenze in uscita (cron)
 *
 * Processa le esecuzioni DOVUTE. Per ognuna, nell'ordine:
 *   STOP-checks (difesa in profondità oltre al trigger DB):
 *     - risposta del destinatario  → fermata_risposta
 *     - hard bounce / spam (email_suppressions globale) → bounce
 *     - disiscrizione (email_suppressions per-azienda) → opt_out
 *     - obiettivo raggiunto (es. scadenza pagata) → completata
 *   Limite invii/giorno per azienda (protezione reputazione, MP-15).
 *   Poi:
 *     modalita 'conferma'   → prepara BOZZA in outbox + alert, NON invia (l'azienda approva)
 *     modalita 'automatico' → crea outbox e invia subito via `email-send` (internal)
 *
 * Niente invio nei test (questa fn non è importata dai test; la logica pura è in
 * _shared/sequenze-logic.ts, testata da vitest). Auth: service role o x-cron-secret.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import {
  sostituisciVariabili, valutaStop, entroLimiteInvii,
  buildOptOutFooter, avanzaEsecuzione, normalizzaEmail, type SequenzaStep,
} from "../_shared/sequenze-logic.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const BATCH = 100;

serveConMetriche("email-sequenze-tick", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // Auth: solo cron interno (service role bearer o x-cron-secret). Mai pubblico.
  // 2026-08-05: aggiunto cronSecretValido (tutti i nomi noti del secret).
  // Leggere SOLO PROACTIVE_CRON_SECRET era fail-closed su una variabile che in
  // produzione non e' valorizzata: 401 a ogni giro del cron da sempre, con
  // pg_cron che segnava "succeeded". Le sequenze email non sono mai partite
  // da schedulazione.
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized = (!!token && token === SERVICE_ROLE)
    || (!!CRON_SECRET && cronHeader === CRON_SECRET)
    || cronSecretValido(req);
  if (!authorized) return json({ error: "unauthorized" }, 401, cors);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const ora = new Date();
  const oggi = ora.toISOString().slice(0, 10);
  const result = { processate: 0, inviate: 0, in_attesa: 0, fermate: 0, errori: 0 };

  try {
    const { data: dovute } = await supabase
      .from("sequenze_esecuzioni").select("*")
      .eq("stato", "attiva")
      .lte("prossimo_invio_at", ora.toISOString())
      .order("prossimo_invio_at", { ascending: true })
      .limit(BATCH);

    const seqCache = new Map<string, any>();
    const connCache = new Map<string, any>();
    const inviatiOggi = new Map<string, number>();

    for (const e of (dovute as any[]) || []) {
      result.processate++;
      try {
        // ── sequenza (deve essere ancora attiva) ──────────────────────────
        let s = seqCache.get(e.sequenza_id);
        if (s === undefined) {
          const { data } = await supabase.from("sequenze").select("*").eq("id", e.sequenza_id).maybeSingle();
          s = data ?? null; seqCache.set(e.sequenza_id, s);
        }
        if (!s || !s.attiva) continue; // sequenza messa in pausa globale → non inviare
        const steps = (Array.isArray(s.step) ? s.step : []) as SequenzaStep[];
        const idx = e.step_corrente as number;
        if (idx < 0 || idx >= steps.length) {
          await supabase.from("sequenze_esecuzioni").update({ stato: "completata" }).eq("id", e.id);
          continue;
        }
        const step = steps[idx];

        // ── STOP 1: risposta del destinatario (qualsiasi email in arrivo) ──
        const { data: rep } = await supabase
          .from("email_inbox").select("id")
          .eq("company_id", e.company_id)
          .ilike("from_email", e.destinatario)          // exact case-insensitive (no wildcard)
          .neq("mailbox_folder", "sent")
          .gte("received_at", e.ancora_at)
          .limit(1).maybeSingle();
        if (rep) {
          await supabase.from("sequenze_esecuzioni")
            .update({ stato: "fermata_risposta", fermata_motivo: "Risposta del destinatario ricevuta" }).eq("id", e.id);
          result.fermate++; continue;
        }

        // ── STOP 2: bounce/spam (globale) o unsubscribe (per-azienda) ──────
        const emailNorm = normalizzaEmail(e.destinatario);
        const { data: supGlobal } = await supabase
          .from("email_suppressions").select("reason")
          .eq("email_normalized", emailNorm).is("company_id", null)
          .in("reason", ["hard_bounce", "spam_complaint"]).limit(1).maybeSingle();
        const { data: supCompany } = await supabase
          .from("email_suppressions").select("reason")
          .eq("email_normalized", emailNorm).eq("company_id", e.company_id)
          .eq("reason", "unsubscribe").limit(1).maybeSingle();
        const supReason = supGlobal ? "hard_bounce" : (supCompany ? "unsubscribe" : null);
        const stop = valutaStop({ suppression: supReason as any });
        if (stop === "bounce" || stop === "opt_out") {
          await supabase.from("sequenze_esecuzioni").update({
            stato: stop, fermata_motivo: stop === "bounce" ? "Indirizzo non valido (bounce/spam)" : "Disiscrizione",
          }).eq("id", e.id);
          result.fermate++; continue;
        }

        // ── STOP 3: obiettivo raggiunto (sollecito pagamento → scadenza pagata) ──
        if (e.entita_tipo === "scadenza" && e.entita_id) {
          const { data: sc } = await supabase.from("scadenze").select("status").eq("id", e.entita_id).maybeSingle();
          if (sc && sc.status === "pagata") {
            await supabase.from("sequenze_esecuzioni").update({ stato: "completata", fermata_motivo: "Pagamento ricevuto" }).eq("id", e.id);
            continue;
          }
        }

        // ── Limite invii/giorno (azienda) ──────────────────────────────────
        let usati = inviatiOggi.get(e.company_id);
        if (usati === undefined) {
          const { count } = await supabase
            .from("sequenze_invii").select("id", { count: "exact", head: true })
            .eq("company_id", e.company_id).eq("stato", "inviato")
            .gte("inviato_at", oggi + "T00:00:00Z");
          usati = count || 0; inviatiOggi.set(e.company_id, usati);
        }
        if (!entroLimiteInvii(usati, s.limite_invii_giorno || 50)) {
          await supabase.from("sequenze_esecuzioni")
            .update({ prossimo_invio_at: new Date(ora.getTime() + 86_400_000).toISOString() }).eq("id", e.id);
          continue; // riproveremo domani
        }

        // ── Casella mittente ───────────────────────────────────────────────
        const connId = e.oauth_connection_id || s.oauth_connection_id;
        let conn = connId ? connCache.get(connId) : undefined;
        if (connId && conn === undefined) {
          const { data } = await supabase.from("email_oauth_connections")
            .select("id, user_id, email_address, company_id").eq("id", connId).maybeSingle();
          conn = data ?? null; connCache.set(connId, conn);
        }
        if (!conn) {
          const { data } = await supabase.from("email_oauth_connections")
            .select("id, user_id, email_address, company_id").eq("company_id", e.company_id).limit(1).maybeSingle();
          conn = data ?? null;
        }
        if (!conn || conn.company_id !== e.company_id) {
          await supabase.from("sequenze_invii").insert({
            esecuzione_id: e.id, sequenza_id: s.id, company_id: e.company_id, step_index: idx,
            oggetto: step.oggetto || "", stato: "errore", errore: "nessuna_casella_mittente",
          });
          result.errori++; continue;
        }

        // ── Costruzione email ──────────────────────────────────────────────
        const vars = { ...(e.variabili || {}), nome: e.destinatario_nome || (e.variabili?.nome ?? "") };
        const oggetto = sostituisciVariabili(step.oggetto || "", vars).slice(0, 250);
        const optoutLink = `${SUPABASE_URL}/functions/v1/email-sequenze-optout?t=${e.optout_token}`;
        const corpo = sostituisciVariabili(step.corpo_template || "", vars) + buildOptOutFooter(s.tipo, optoutLink);

        // ── Modalità CONFERMA: bozza pronta + alert, nessun invio ──────────
        if (s.modalita_invio === "conferma") {
          const { data: ob } = await supabase.from("email_outbox").insert({
            company_id: e.company_id, user_id: conn.user_id, oauth_connection_id: conn.id,
            to_emails: [e.destinatario], subject: oggetto, body_text: corpo, thread_id: e.thread_id, status: "draft",
          }).select("id").maybeSingle();
          const { data: inv } = await supabase.from("sequenze_invii").insert({
            esecuzione_id: e.id, sequenza_id: s.id, company_id: e.company_id, step_index: idx,
            outbox_id: ob?.id ?? null, oggetto, corpo_anteprima: corpo.slice(0, 500), stato: "in_attesa_conferma",
          }).select("id").maybeSingle();
          await supabase.from("sequenze_esecuzioni").update({ stato: "in_attesa_conferma" }).eq("id", e.id);
          // alert in-app (best-effort)
          await supabase.from("notifications").insert({
            company_id: e.company_id, user_id: conn.user_id, type: "email_sequenza",
            title: "Sollecito pronto da approvare",
            body: `${s.nome}: messaggio pronto per ${e.destinatario}. Rivedi e invia.`,
            entity_type: "sequenza_invio", entity_id: inv?.id ?? null, action_url: "/azienda/email/ai",
          }).then(() => {}, () => {});
          result.in_attesa++; continue;
        }

        // ── Modalità AUTOMATICO: crea outbox e invia subito ────────────────
        const { data: ob } = await supabase.from("email_outbox").insert({
          company_id: e.company_id, user_id: conn.user_id, oauth_connection_id: conn.id,
          to_emails: [e.destinatario], subject: oggetto, body_text: corpo, thread_id: e.thread_id, status: "draft",
        }).select("id").maybeSingle();
        if (!ob?.id) { result.errori++; continue; }
        const { data: inv } = await supabase.from("sequenze_invii").insert({
          esecuzione_id: e.id, sequenza_id: s.id, company_id: e.company_id, step_index: idx,
          outbox_id: ob.id, oggetto, corpo_anteprima: corpo.slice(0, 500), stato: "in_attesa_conferma",
        }).select("id").maybeSingle();

        const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/email-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
          body: JSON.stringify({ outbox_id: ob.id }),
        });
        const sendJson = await sendRes.json().catch(() => ({} as any));
        if (sendRes.ok && sendJson.ok) {
          await supabase.from("sequenze_invii").update({ stato: "inviato", inviato_at: new Date().toISOString() }).eq("id", inv?.id);
          const av = avanzaEsecuzione(e.ancora_at, steps, idx);
          await supabase.from("sequenze_esecuzioni").update({
            step_corrente: av.stepCorrente, stato: av.stato,
            prossimo_invio_at: av.prossimoInvioAt ? av.prossimoInvioAt.toISOString() : null,
            ultimo_invio_at: new Date().toISOString(),
          }).eq("id", e.id);
          inviatiOggi.set(e.company_id, (usati || 0) + 1);
          result.inviate++;
        } else {
          await supabase.from("sequenze_invii").update({
            stato: "errore", errore: (sendJson.error || "invio_fallito").toString().slice(0, 500),
          }).eq("id", inv?.id);
          await supabase.from("sequenze_esecuzioni")
            .update({ prossimo_invio_at: new Date(ora.getTime() + 3_600_000).toISOString() }).eq("id", e.id);
          result.errori++;
        }
      } catch (inner) {
        result.errori++;
        console.error("[email-sequenze-tick] esecuzione error", e?.id, inner);
      }
    }
    return json({ ok: true, ...result }, 200, cors);
  } catch (err) {
    console.error("[email-sequenze-tick] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500, cors);
  }
});

function json(payload: any, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
