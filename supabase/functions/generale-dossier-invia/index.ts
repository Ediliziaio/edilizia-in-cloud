/**
 * Edge Function: generale-dossier-invia
 *
 * Manda per email il dossier di rendicontazione di una commessa generale (banca, soci,
 * commercialista) a uno o più destinatari e lo mette nello storico (generale_dossier).
 *
 * Il PDF (e l'Excel, se richiesto) lo compone il browser: quello che l'utente ha visto
 * nell'anteprima è quello che parte. Qui:
 *   1. il livello del dossier (base | importi | margini) si ricalcola dalle sezioni, e
 *      generale_dossier_puo_inviare, chiamata COL TOKEN DI CHI CHIAMA, dice se può;
 *   2. si apre la riga dello storico (in_invio) e si salvano i file nel bucket privato
 *      generale-dossier (<azienda>/<generale>/<dossier>.pdf|.xlsx);
 *   3. un'email per destinatario (nessuno vede gli indirizzi degli altri), con gli
 *      allegati; la riga passa a inviato, parziale o fallito, con l'esito di ognuno.
 *
 * Body:
 *   {
 *     generale_id: string,
 *     destinatari: string[],     // 1–10 indirizzi
 *     subject: string,
 *     message?: string,          // testo semplice, va nel corpo dell'email
 *     modello: "banca" | "soci" | "completo" | "personalizzato",
 *     titolo: string,
 *     sezioni: string[],
 *     periodo_dal?: string | null, periodo_al?: string | null,
 *     filename: string, pdf_base64: string,          // base64 puro, senza prefisso data:
 *     xlsx_filename?: string, xlsx_base64?: string,  // facoltativi
 *     numeri?: object            // i numeri del dossier, per lo storico
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { requireAuth } from "../_shared/auth.ts";
import { errorResponse, getCorsHeaders, jsonResponse } from "../_shared/headers.ts";

const BUCKET = "generale-dossier";
const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// Limite difensivo sugli allegati insieme: ~10 MB di base64 (~7,5 MB di file).
const MAX_B64 = 10_000_000;
const MAX_DESTINATARI = 10;
const SEZIONI = new Set(["sintesi", "avanzamento", "foto", "piano", "andamento", "cassa", "fonti", "investitori", "unita", "contratto", "documenti", "note"]);
const SEZIONI_MARGINI = new Set(["piano", "andamento", "cassa", "fonti", "investitori"]);
const MODELLI = new Set(["banca", "soci", "completo", "personalizzato"]);

const isEmail = (v: unknown): v is string => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) && v.length <= 254;
const isGiorno = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Il livello lo decidono le sezioni, non il browser: è quello che regola chi riapre il dossier. */
function livelloDa(sezioni: string[], importi: boolean): "base" | "importi" | "margini" {
  if (sezioni.some((s) => SEZIONI_MARGINI.has(s))) return "margini";
  return importi && sezioni.some((s) => s === "sintesi" || s === "avanzamento" || s === "unita" || s === "contratto") ? "importi" : "base";
}

function corpoEmail(azienda: string, operazione: string, messaggio: string, conExcel: boolean): string {
  const paragrafi = messaggio
    .split(/\n{2,}/)
    .filter((p) => p.trim())
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
  ${paragrafi}
  <p style="margin:0 0 14px;font-size:15px;color:#1f2937;">In allegato trova il rendiconto in PDF${conExcel ? " e i dati in Excel" : ""}.</p>
</td></tr>
<tr><td style="padding:8px 32px 28px;font-size:12px;color:#6b7280;">${esc(azienda)}</td></tr>
</table></td></tr></table></body></html>`;
}

function decodifica(b64: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsH);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const body = await req.json().catch(() => ({}));
    const generaleId = String(body?.generale_id ?? "");
    const destinatari = Array.isArray(body?.destinatari)
      ? [...new Set((body.destinatari as unknown[]).map((x) => String(x ?? "").trim().toLowerCase()).filter(Boolean))]
      : [];
    const subject = String(body?.subject ?? "").trim();
    const message = String(body?.message ?? "").trim().slice(0, 4000);
    const modello = MODELLI.has(String(body?.modello)) ? String(body.modello) : "personalizzato";
    const titolo = String(body?.titolo ?? "Rendiconto dell'operazione").trim().slice(0, 200) || "Rendiconto dell'operazione";
    const sezioni = Array.isArray(body?.sezioni) ? (body.sezioni as unknown[]).map(String).filter((s) => SEZIONI.has(s)) : [];
    const pulisci = (v: unknown, ripiego: string) => (String(v ?? ripiego).replace(/[\\/:*?"<>|]+/g, " ").trim() || ripiego).slice(0, 180);
    const filename = pulisci(body?.filename, "Rendiconto.pdf");
    const pdf = String(body?.pdf_base64 ?? "");
    const xlsx = body?.xlsx_base64 ? String(body.xlsx_base64) : "";
    const xlsxName = pulisci(body?.xlsx_filename, "Rendiconto.xlsx");
    const numeri = body?.numeri && typeof body.numeri === "object" ? body.numeri : {};

    if (!/^[0-9a-f-]{36}$/i.test(generaleId)) return errorResponse("Commessa generale non indicata.", 400, corsH);
    if (destinatari.length === 0) return errorResponse("Scrivi almeno un destinatario.", 400, corsH);
    if (destinatari.length > MAX_DESTINATARI) return errorResponse(`Al massimo ${MAX_DESTINATARI} destinatari per invio.`, 400, corsH);
    const sbagliato = destinatari.find((d) => !isEmail(d));
    if (sbagliato) return errorResponse(`L'indirizzo «${sbagliato}» non è valido.`, 400, corsH);
    if (!subject || subject.length > 200) return errorResponse("Scrivi un oggetto (al massimo 200 caratteri).", 400, corsH);
    if (sezioni.length === 0) return errorResponse("Il dossier non contiene sezioni.", 400, corsH);
    if (!pdf) return errorResponse("Manca il PDF del rendiconto.", 400, corsH);
    if (pdf.length + xlsx.length > MAX_B64) return errorResponse("Il dossier è troppo grande per l'email: togli qualche foto.", 413, corsH);

    // 1. Permessi, col token di chi chiama.
    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization")! } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: generale, error: gErr } = await supabaseAdmin
      .from("commesse_generali")
      .select("order_id, company_id")
      .eq("order_id", generaleId)
      .maybeSingle();
    if (gErr) throw gErr;
    if (!generale) return errorResponse("Commessa generale non trovata.", 404, corsH);
    const importi = await supabaseUser.rpc("has_permission_for_company", {
      _user_id: userId, _permission: "can_view_order_amounts", _company_id: generale.company_id,
    });
    // Se non si sa, il livello più alto: meglio un dossier che meno persone possono riaprire.
    const livello = livelloDa(sezioni, importi.error ? true : importi.data === true);
    const { data: puo, error: puoErr } = await supabaseUser.rpc("generale_dossier_puo_inviare", { p_generale_id: generaleId, p_livello: livello });
    if (puoErr) throw puoErr;
    if (puo !== true) return errorResponse("Non hai il permesso di mandare questo rendiconto: servono i permessi sui dati che contiene e quello di modificare la commessa.", 403, corsH);

    const [{ data: azienda }, { data: ordine }] = await Promise.all([
      supabaseAdmin.from("companies").select("name").eq("id", generale.company_id).maybeSingle(),
      supabaseAdmin.from("orders").select("description, order_code").eq("id", generaleId).maybeSingle(),
    ]);
    const nomeAzienda = azienda?.name ?? "La tua impresa";
    const nomeOperazione = ordine?.description ?? ordine?.order_code ?? "Operazione";

    // 2. Storico e file.
    const { data: riga, error: rigaErr } = await supabaseAdmin
      .from("generale_dossier")
      .insert({
        company_id: generale.company_id,
        generale_id: generaleId,
        modello,
        titolo,
        sezioni,
        livello,
        periodo_dal: isGiorno(body?.periodo_dal) ? body.periodo_dal : null,
        periodo_al: isGiorno(body?.periodo_al) ? body.periodo_al : null,
        destinatari,
        oggetto: subject,
        messaggio: message || null,
        numeri,
        inviato_da: userId,
      })
      .select("id")
      .single();
    if (rigaErr) throw rigaErr;

    const fallito = async (errore: string, status: number) => {
      await supabaseAdmin.from("generale_dossier").update({ stato: "fallito", errore: errore.slice(0, 500) }).eq("id", riga.id);
      return errorResponse(errore, status, corsH);
    };

    const base = `${generale.company_id}/${generaleId}/${riga.id}`;
    const bytesPdf = decodifica(pdf);
    if (!bytesPdf) return await fallito("Il PDF non è leggibile.", 400);
    if (bytesPdf.length < 5 || String.fromCharCode(...bytesPdf.slice(0, 5)) !== "%PDF-") return await fallito("Il file allegato non è un PDF.", 400);
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(`${base}.pdf`, bytesPdf, { contentType: "application/pdf", upsert: true });
    if (upErr) return await fallito(`PDF non salvato: ${upErr.message}`, 500);
    const percorsi: Record<string, string> = { pdf_path: `${base}.pdf` };
    if (xlsx) {
      const bytesXlsx = decodifica(xlsx);
      // Un .xlsx è uno zip: comincia con «PK».
      if (!bytesXlsx || bytesXlsx.length < 2 || bytesXlsx[0] !== 0x50 || bytesXlsx[1] !== 0x4b) return await fallito("Il file Excel non è leggibile.", 400);
      const { error: xErr } = await supabaseAdmin.storage.from(BUCKET).upload(`${base}.xlsx`, bytesXlsx, { contentType: TIPO_XLSX, upsert: true });
      if (xErr) return await fallito(`Excel non salvato: ${xErr.message}`, 500);
      percorsi.xlsx_path = `${base}.xlsx`;
    }
    await supabaseAdmin.from("generale_dossier").update(percorsi).eq("id", riga.id);

    // 3. Un'email per destinatario.
    const allegati = [{ filename, content: pdf, type: "application/pdf" }];
    if (xlsx) allegati.push({ filename: xlsxName, content: xlsx, type: TIPO_XLSX });
    const esiti: { a: string; ok: boolean; errore: string | null }[] = [];
    for (const a of destinatari) {
      const result = await sendEmailUnified({
        companyId: generale.company_id,
        stream: "transactional",
        to: [a],
        subject,
        html: corpoEmail(nomeAzienda, nomeOperazione, message, !!xlsx),
        text: `${message}\n\nIn allegato trova il rendiconto in PDF${xlsx ? " e i dati in Excel" : ""}.\n\n${nomeAzienda}`,
        attachments: allegati,
        templateName: "generale_dossier",
        adminClient: supabaseAdmin,
        metadata: { source: "generale_dossier", generale_id: generaleId, dossier_id: riga.id, sender_user_id: userId },
      });
      const b = result.body as { error?: string } | null;
      esiti.push({ a, ok: result.ok, errore: result.ok ? null : (b?.error ? String(b.error) : `codice ${result.status}`).slice(0, 300) });
    }

    const riusciti = esiti.filter((e) => e.ok).length;
    const stato = riusciti === esiti.length ? "inviato" : riusciti > 0 ? "parziale" : "fallito";
    await supabaseAdmin
      .from("generale_dossier")
      .update({
        stato,
        esiti,
        inviato_at: riusciti > 0 ? new Date().toISOString() : null,
        errore: riusciti === esiti.length ? null : esiti.filter((e) => !e.ok).map((e) => `${e.a}: ${e.errore}`).join("; ").slice(0, 500),
      })
      .eq("id", riga.id);

    if (riusciti === 0) return errorResponse(`Invio non riuscito: ${esiti[0]?.errore ?? "errore sconosciuto"}.`, 502, corsH);
    return jsonResponse({ success: true, id: riga.id, stato, esiti }, 200, corsH);
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generale-dossier-invia:", msg);
    return errorResponse("Invio non riuscito. Riprova tra poco.", 500, corsH);
  }
});
