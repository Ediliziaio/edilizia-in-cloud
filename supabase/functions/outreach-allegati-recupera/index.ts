/**
 * outreach-allegati-recupera — rilegge dalla casella le risposte GIÀ arrivate e
 * ne salva gli allegati (prima venivano scartati). Si abbina per Message-ID a
 * outreach_replies e scrive raw.attachments. Idempotente: salta le risposte che
 * hanno già gli allegati. Chiamata a mano (cron secret o service role).
 * Body: { giorni?: 90, casella?: "info@…" }.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { imapFetchUnreadSince, type ImapConfig } from "../_shared/imapSmtpClient.ts";
import { salvaAllegatiRisposta } from "../_shared/outreachAllegati.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const TEMPO_MASSIMO_MS = 120_000;
const MAX_MESSAGGI = 60; // ignorato nella ricerca per Message-ID
/** Poche caselle per chiamata: leggere i corpi con gli allegati pesa, e oltre il limite il worker muore. */
const MAX_CASELLE = 10;

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (!((!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET))) {
    return risposta({ error: "unauthorized" }, 401, cors);
  }
  const avvio = Date.now();
  const body = await req.json().catch(() => ({}));
  const giorni = Math.min(Math.max(Number(body?.giorni) || 90, 1), 365);
  const solaCasella = typeof body?.casella === "string" ? body.casella.toLowerCase() : null;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const esito = { caselle: 0, messaggi: 0, aggiornate: 0, allegati: 0, errori: [] as string[] };

  try {
    const since = new Date(Date.now() - giorni * 86_400_000);
    // Le risposte del periodo che non hanno ancora allegati, per casella.
    const { data: righe, error } = await admin.from("outreach_replies")
      .select("id, message_id, sender_account_id, received_at, raw")
      .gte("received_at", since.toISOString())
      .not("message_id", "is", null).not("sender_account_id", "is", null)
      .limit(5000);
    if (error) throw error;
    const daFare = new Map<string, any>();
    const perCasella = new Map<string, number>();
    for (const r of (righe ?? []) as any[]) {
      if (r.raw?.attachments?.length || r.raw?.allegati_letti) continue;
      daFare.set(String(r.message_id), r);
      perCasella.set(r.sender_account_id, (perCasella.get(r.sender_account_id) ?? 0) + 1);
    }
    if (!daFare.size) return risposta({ ...esito, nota: "niente da recuperare" }, 200, cors);

    const { data: caselle } = await admin.from("outreach_sender_accounts")
      .select("id, email, imap_host, imap_port, imap_secure, smtp_username, secret_ref")
      .in("id", [...perCasella.keys()]).not("imap_host", "is", null).not("secret_ref", "is", null);

    let fatte = 0;
    for (const mb of (caselle ?? []) as any[]) {
      if (fatte >= MAX_CASELLE) { esito.errori.push("altre caselle da fare: rilancia"); break; }
      if (Date.now() - avvio > TEMPO_MASSIMO_MS) { esito.errori.push("tempo finito: rilancia per le altre caselle"); break; }
      if (solaCasella && String(mb.email).toLowerCase() !== solaCasella) continue;
      try {
        const { data: password } = await admin.rpc("outreach_mailbox_secret", { p_ref: mb.secret_ref });
        if (!password) { esito.errori.push(`${mb.email}: segreto non risolto`); continue; }
        const cfg: ImapConfig = { host: mb.imap_host, port: mb.imap_port, secure: mb.imap_secure, username: mb.smtp_username ?? mb.email, password };
        // Si cercano per Message-ID solo le risposte di questa casella ancora da controllare.
        const sue = [...daFare.values()].filter((r) => r.sender_account_id === mb.id);
        const messaggi = await imapFetchUnreadSince(cfg, since, MAX_MESSAGGI, null, true, sue.map((r) => String(r.message_id)));
        esito.caselle++; fatte++;
        const trovati = new Set<string>();
        for (const m of messaggi) {
          esito.messaggi++;
          const riga = daFare.get(m.messageId);
          if (!riga) continue;
          trovati.add(m.messageId);
          const salvati = m.attachments?.length ? await salvaAllegatiRisposta(admin, m.messageId, m.attachments) : [];
          await admin.from("outreach_replies")
            .update({ raw: { ...(riga.raw ?? {}), allegati_letti: true, ...(salvati.length ? { attachments: salvati } : {}) } })
            .eq("id", riga.id);
          daFare.delete(m.messageId);
          if (salvati.length) { esito.aggiornate++; esito.allegati += salvati.length; }
        }
        // Lettura completa della finestra: i messaggi non trovati non sono più in casella, non si cercano più.
        {
          for (const r of sue) {
            if (trovati.has(String(r.message_id))) continue;
            await admin.from("outreach_replies")
              .update({ raw: { ...(r.raw ?? {}), allegati_letti: true } }).eq("id", r.id);
            daFare.delete(String(r.message_id));
          }
        }
      } catch (e) {
        esito.errori.push(`${mb.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return risposta(esito, 200, cors);
  } catch (e) {
    return risposta({ error: e instanceof Error ? e.message : String(e), ...esito }, 500, cors);
  }
});

function risposta(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
