/**
 * Edge Function: generale-rendiconto-invia
 *
 * Manda per email a un investitore il rendiconto PDF della sua commessa generale
 * (modulo «Fonti e investitori», tappa 5) e lo mette nello storico.
 *
 * Il PDF lo compone il browser (stessa carta dell'anteprima: quello che l'utente ha
 * visto è quello che parte). Qui:
 *   1. la fonte si legge COL TOKEN DI CHI CHIAMA: le policy di generale_fonti
 *      (can_view_margins sull'azienda) decidono se può; poi puo_modificare_commessa;
 *   2. si apre la riga in generale_rendiconti (stato in_invio), si salva il PDF nel
 *      bucket privato generale-rendiconti (<azienda>/<generale>/<rendiconto>.pdf);
 *   3. sendEmailUnified con il PDF in allegato; la riga passa a inviato o fallito.
 *
 * Body:
 *   {
 *     fonte_id: string,
 *     to: string,               // email del destinatario (di solito quella della fonte)
 *     subject: string,
 *     message?: string,         // testo semplice, va nel corpo dell'email
 *     filename: string,
 *     pdf_base64: string,       // base64 puro, senza prefisso data:
 *     numeri?: object           // i numeri del rendiconto, per lo storico
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { requireAuth } from "../_shared/auth.ts";
import { errorResponse, getCorsHeaders, jsonResponse } from "../_shared/headers.ts";

const BUCKET = "generale-rendiconti";
// Limite difensivo: ~7 MB di base64 (~5 MB di PDF).
const MAX_PDF_B64 = 7_000_000;

const isEmail = (v: unknown): v is string => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length <= 254;

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function corpoEmail(azienda: string, investitore: string, operazione: string, messaggio: string): string {
  const paragrafi = messaggio
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937;">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#1E3A5F;padding:22px 32px;">
  <span style="color:#ffffff;font-size:18px;font-weight:700;">${esc(azienda)}</span><br>
  <span style="color:#cbd5e1;font-size:13px;">Rendiconto · ${esc(operazione)}</span>
</td></tr>
<tr><td style="padding:28px 32px 8px;">
  <p style="margin:0 0 14px;font-size:15px;color:#1f2937;">Gentile ${esc(investitore)},</p>
  ${paragrafi}
  <p style="margin:0 0 14px;font-size:15px;color:#1f2937;">In allegato trova il rendiconto in PDF.</p>
</td></tr>
<tr><td style="padding:8px 32px 28px;font-size:12px;color:#6b7280;">${esc(azienda)}</td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsH);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json().catch(() => ({}));
    const fonteId = String(body?.fonte_id ?? "");
    const to = String(body?.to ?? "").trim().toLowerCase();
    const subject = String(body?.subject ?? "").trim();
    const message = String(body?.message ?? "").trim().slice(0, 4000);
    const filename = (String(body?.filename ?? "Rendiconto.pdf").replace(/[\\/:*?"<>|]+/g, " ").trim() || "Rendiconto.pdf").slice(0, 180);
    const pdf = String(body?.pdf_base64 ?? "");
    const numeri = body?.numeri && typeof body.numeri === "object" ? body.numeri : {};

    if (!/^[0-9a-f-]{36}$/i.test(fonteId)) return errorResponse("Fonte non indicata.", 400, corsH);
    if (!isEmail(to)) return errorResponse("L'indirizzo email del destinatario non è valido.", 400, corsH);
    if (!subject || subject.length > 200) return errorResponse("Scrivi un oggetto (al massimo 200 caratteri).", 400, corsH);
    if (!pdf) return errorResponse("Manca il PDF del rendiconto.", 400, corsH);
    if (pdf.length > MAX_PDF_B64) return errorResponse("Il PDF è troppo grande per l'email.", 413, corsH);

    // 1. Permessi: la fonte si legge col token di chi chiama (RLS: can_view_margins).
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: fonte, error: fonteErr } = await supabaseUser
      .from("generale_fonti")
      .select("id, company_id, generale_id, nome")
      .eq("id", fonteId)
      .maybeSingle();
    if (fonteErr) throw fonteErr;
    if (!fonte) return errorResponse("Fonte non trovata, o non hai il permesso di vedere gli investitori.", 403, corsH);
    const { data: puo, error: puoErr } = await supabaseUser.rpc("puo_modificare_commessa", { p_order_id: fonte.generale_id });
    if (puoErr) throw puoErr;
    if (puo !== true) return errorResponse("Non hai il permesso di modificare questa commessa generale.", 403, corsH);

    const [{ data: azienda }, { data: generale }] = await Promise.all([
      supabaseAdmin.from("companies").select("name").eq("id", fonte.company_id).maybeSingle(),
      supabaseAdmin.from("orders").select("description, order_code").eq("id", fonte.generale_id).maybeSingle(),
    ]);
    const nomeAzienda = azienda?.name ?? "La tua impresa";
    const nomeOperazione = generale?.description ?? generale?.order_code ?? "Operazione";

    // 2. Storico e PDF.
    const { data: riga, error: rigaErr } = await supabaseAdmin
      .from("generale_rendiconti")
      .insert({
        company_id: fonte.company_id,
        generale_id: fonte.generale_id,
        fonte_id: fonte.id,
        fonte_nome: fonte.nome,
        destinatario: to,
        oggetto: subject,
        messaggio: message || null,
        numeri,
        inviato_da: userId,
      })
      .select("id")
      .single();
    if (rigaErr) throw rigaErr;

    const fallito = async (errore: string, status: number) => {
      await supabaseAdmin.from("generale_rendiconti").update({ stato: "fallito", errore: errore.slice(0, 500) }).eq("id", riga.id);
      return errorResponse(errore, status, corsH);
    };

    const path = `${fonte.company_id}/${fonte.generale_id}/${riga.id}.pdf`;
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
    } catch {
      return await fallito("Il PDF non è leggibile.", 400);
    }
    if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return await fallito("Il file allegato non è un PDF.", 400);
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return await fallito(`PDF non salvato: ${upErr.message}`, 500);
    await supabaseAdmin.from("generale_rendiconti").update({ pdf_path: path }).eq("id", riga.id);

    // 3. Invio.
    const result = await sendEmailUnified({
      companyId: fonte.company_id,
      stream: "transactional",
      to: [to],
      subject,
      html: corpoEmail(nomeAzienda, fonte.nome, nomeOperazione, message),
      text: `Gentile ${fonte.nome},\n\n${message}\n\nIn allegato trova il rendiconto in PDF.\n\n${nomeAzienda}`,
      attachments: [{ filename, content: pdf, type: "application/pdf" }],
      templateName: "generale_rendiconto_investitore",
      adminClient: supabaseAdmin,
      metadata: { source: "generale_investitori", generale_id: fonte.generale_id, fonte_id: fonte.id, rendiconto_id: riga.id, sender_user_id: userId },
    });

    if (!result.ok) {
      const b = result.body as { error?: string } | null;
      return await fallito(b?.error ? String(b.error) : `Invio non riuscito (codice ${result.status}).`, 502);
    }

    await supabaseAdmin
      .from("generale_rendiconti")
      .update({ stato: "inviato", inviato_at: new Date().toISOString(), delivery_log_id: /^[0-9a-f-]{36}$/i.test(String(result.deliveryLogId ?? "")) ? result.deliveryLogId : null })
      .eq("id", riga.id);

    return jsonResponse({ success: true, id: riga.id }, 200, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generale-rendiconto-invia:", msg);
    return errorResponse("Invio non riuscito. Riprova tra poco.", 500, corsH);
  }
});
