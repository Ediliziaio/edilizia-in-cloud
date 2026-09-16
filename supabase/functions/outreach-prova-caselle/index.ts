import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { isNativeProvider, sendViaNativeSender } from "../_shared/outreachMailboxSend.ts";
import { componiCorpo } from "../_shared/outreach-uscita.ts";
import { htmlToPlainText } from "../_shared/outreach-template.ts";

/**
 * outreach-prova-caselle — spedisce le prove di invio in coda in
 * `outreach_prove_caselle`: un'email vera da una casella precisa, anche in
 * pausa, a un indirizzo del titolare.
 *
 * Serve prima di accendere un pool nuovo: il bottone «Testa» del pannello
 * controlla solo che la password entri, e il dispatcher spedisce solo da
 * caselle attive su domini attivi. Così il titolare vede arrivare davvero
 * un'email da ogni casella, con la sua firma, e dove finisce (posta o spam).
 *
 * Il cron la chiama ogni 5 minuti e ogni giro ne spedisce UNA: le prove non
 * partono a raffica. Non tocca contatori, coda cold, iscrizioni né lo stato
 * di caselle e domini: l'esito resta sulla riga della prova.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const T = "outreach_prove_caselle";

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const autorizzato = (!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET);
  if (!autorizzato) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // Una prova per giro: la più vecchia già dovuta.
    const { data: dovute, error: dErr } = await admin.from(T)
      .select("id").eq("status", "queued").lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true }).limit(1);
    if (dErr) throw dErr;
    if (!dovute?.length) return json({ ok: true, inviate: 0 });

    // Presa atomica: se due giri si sovrappongono, uno solo la spedisce.
    const { data: presa, error: pErr } = await admin.from(T)
      .update({ status: "sending" }).eq("id", dovute[0].id).eq("status", "queued")
      .select("id,sender_account_id,to_email,subject,body").maybeSingle();
    if (pErr) throw pErr;
    if (!presa) return json({ ok: true, inviate: 0, nota: "presa da un altro giro" });

    const fallita = async (errore: string) => {
      await admin.from(T).update({ status: "failed", errore: errore.slice(0, 500) }).eq("id", presa.id);
      return json({ ok: false, errore });
    };

    const { data: casella, error: cErr } = await admin.from("outreach_sender_accounts")
      .select("id,email,display_name,signature,provider,smtp_host,smtp_port,smtp_secure,smtp_username,secret_ref,oauth_connection_id")
      .eq("id", presa.sender_account_id).maybeSingle();
    if (cErr) throw cErr;
    if (!casella) return await fallita("casella non trovata");
    if (!isNativeProvider(casella.provider)) return await fallita(`provider ${casella.provider} non gestito dalle prove`);

    // Stessa composizione delle email vere: testo + firma della casella.
    const { html } = componiCorpo({ corpo: presa.body, aggiungiUscita: false, firma: casella.signature });
    const r = await sendViaNativeSender(admin, casella, {
      companyId: PLATFORM_COMPANY,
      to: presa.to_email,
      subject: presa.subject,
      html,
      text: htmlToPlainText(html),
      fromName: casella.display_name ?? null,
      replyTo: casella.email,
      metadata: { outreach_prova_casella: true, sender_account_id: casella.id },
    });
    if (!r.ok) return await fallita(String(r.error ?? "invio non riuscito"));

    await admin.from(T)
      .update({ status: "sent", sent_at: new Date().toISOString(), message_id: r.messageId ?? null, errore: null })
      .eq("id", presa.id);
    return json({ ok: true, inviate: 1, casella: casella.email });
  } catch (e) {
    console.error("outreach-prova-caselle error:", e);
    return json({ error: e instanceof Error ? e.message : "errore" }, 500);
  }
});
