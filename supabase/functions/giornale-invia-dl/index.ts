// 10/11/2026: ripubblicata perché importa _shared/documentoGiornale.ts, cambiato (veste propria, niente emoji, ruolo di chi firma).
/**
 * «Invia alla direzione lavori»: spedisce il link a una pagina firmata del giornale.
 * Parte solo dal clic di chi può modificare il giornale, con la conferma dell'indirizzo:
 * nessun invio automatico. Il permesso lo decide la stessa funzione del database
 * (puo_modificare_giornale), chiamata con il token di chi preme.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { leggiAziendaDocumento } from "../_shared/aziendaDocumento.ts";
import { escHtml, fmtData, fmtDataOra } from "../_shared/documentoGiornale.ts";
import { GIORNI_VALIDITA_LINK_DL, emailDlValida, improntaTokenDl, nuovoTokenDl, ruoloInvioValido, scadenzaLinkDl } from "../_shared/linkGiornaleDl.ts";

/** Il doppio clic non spedisce due volte. */
const PAUSA_TRA_INVII_MS = 2 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  try {
    if (req.method !== "POST") return json({ error: "Metodo non permesso" }, 405);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Non autorizzato" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Non autorizzato" }, 401);

    const body = await req.json().catch(() => ({}));
    const giornaleId = body?.giornale_id;
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    if (!giornaleId || typeof giornaleId !== "string") return json({ error: "giornale_id obbligatorio" }, 400);
    // Chi non lo manda (app non ancora aggiornata) sta inviando alla direzione lavori, come prima.
    const ruolo = body?.ruolo ?? "direzione_lavori";
    if (!ruoloInvioValido(ruolo)) return json({ error: "Destinatario non valido" }, 400);

    const { data: pagina, error: errPagina } = await supabase.from("giornale_lavori")
      .select("id, company_id, order_id, data_lavori, stato, pm_signed_at, pm_signature_hash")
      .eq("id", giornaleId).maybeSingle();
    if (errPagina) return json({ error: "Errore nel caricamento della pagina" }, 500);
    if (!pagina) return json({ error: "Pagina del giornale non trovata" }, 404);

    // Stessa regola delle policy: azienda dell'utente, non cliente, non bloccato, col permesso.
    const comeUtente = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: puo, error: errPermesso } = await comeUtente.rpc("puo_modificare_giornale", { p_company_id: pagina.company_id });
    if (errPermesso) return json({ error: "Non riesco a verificare il permesso" }, 500);
    if (puo !== true) return json({ error: "Non hai il permesso di inviare il giornale dei lavori" }, 403);

    if (pagina.stato !== "firmata") return json({ error: "Si possono inviare solo le pagine firmate" }, 409);
    if (body?.conferma !== true) return json({ error: "Serve la conferma dell'indirizzo prima dell'invio" }, 400);
    if (!emailDlValida(email)) return json({ error: "Indirizzo email non valido" }, 400);

    const soglia = new Date(Date.now() - PAUSA_TRA_INVII_MS).toISOString();
    const { data: recenti } = await supabase.from("giornale_invii_dl").select("id")
      .eq("giornale_id", pagina.id).eq("email", email).gte("created_at", soglia).limit(1);
    if ((recenti ?? []).length > 0) return json({ error: "Questa pagina è appena stata inviata a questo indirizzo" }, 429);

    const [{ data: commessa }, azienda, branding] = await Promise.all([
      supabase.from("orders").select("description, order_code").eq("id", pagina.order_id).maybeSingle(),
      leggiAziendaDocumento(supabase, pagina.company_id),
      getBrandingForCompany(supabase, pagina.company_id),
    ]);

    const token = nuovoTokenDl();
    const { data: invio, error: errInvio } = await supabase.from("giornale_invii_dl").insert({
      company_id: pagina.company_id,
      giornale_id: pagina.id,
      email,
      ruolo,
      token_hash: await improntaTokenDl(token),
      scade_il: scadenzaLinkDl(),
      inviato_da: user.id,
    }).select("id").single();
    if (errInvio || !invio) return json({ error: "Non riesco a preparare il link" }, 500);

    const link = `${branding.siteUrl}/giornale-dl/${token}`;
    const nomeAzienda = azienda?.ragione_sociale || "L'impresa";
    const cantiere = commessa ? `${commessa.order_code ? `#${commessa.order_code} ` : ""}${commessa.description ?? ""}`.trim() : "";
    const oggetto = `Giornale dei lavori del ${fmtData(pagina.data_lavori)}${cantiere ? ` — ${cantiere}` : ""}`;
    const html = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#1e293b;">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
  <p style="font-size:15px;margin:0 0 12px;">${escHtml(nomeAzienda)} le trasmette la pagina firmata del giornale dei lavori del <strong>${escHtml(fmtData(pagina.data_lavori))}</strong>${cantiere ? ` per il cantiere <strong>${escHtml(cantiere)}</strong>` : ""}.</p>
  <p style="font-size:13px;color:#475569;margin:0 0 20px;">Firmata il ${escHtml(fmtDataOra(pagina.pm_signed_at))} · impronta ${escHtml(String(pagina.pm_signature_hash ?? "").slice(0, 12))}</p>
  <p style="margin:0 0 20px;"><a href="${escHtml(link)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;">Apri il documento</a></p>
  <p style="font-size:12px;color:#64748b;margin:0;">Il link non richiede accesso e vale ${GIORNI_VALIDITA_LINK_DL} giorni.</p>
</div></body></html>`;

    const invia = (stream: "transactional" | "marketing", extra: Record<string, unknown> = {}) => sendEmailUnified({
      companyId: pagina.company_id,
      stream,
      to: [email],
      subject: oggetto,
      html,
      templateName: "giornale_direzione_lavori",
      adminClient: supabase,
      metadata: { giornale_id: pagina.id, ruolo, ...extra },
    });
    let esito = await invia("transactional");
    if (!esito.ok && String((esito.body as { error?: unknown })?.error ?? "").toLowerCase().includes("no provider configured")) {
      esito = await invia("marketing", { fallback_stream: true });
    }
    if (!esito.ok) {
      console.error("giornale-invia-dl: invio fallito", esito.status);
      // Il link di un'email mai partita non deve restare valido.
      await supabase.from("giornale_invii_dl").delete().eq("id", invio.id);
      const crediti = esito.status === 402;
      return json({ error: crediti ? "Crediti email insufficienti: ricarica per continuare." : `Invio email fallito (status ${esito.status})` }, crediti ? 402 : 500);
    }

    const adesso = new Date().toISOString();
    // «Notificato alla DL» resta vero solo per la direzione lavori: lo dice il registro legale della pagina.
    if (ruolo === "direzione_lavori") {
      const { error: errRegistra } = await supabase.from("giornale_lavori")
        .update({ dl_notified_at: adesso, dl_notification_method: "email" }).eq("id", pagina.id);
      if (errRegistra) console.error("giornale-invia-dl: invio non registrato sulla pagina", errRegistra.message);
    }

    return json({ success: true, dl_notified_at: adesso, email });
  } catch (e) {
    console.error("giornale-invia-dl error:", e);
    return json({ error: "Errore interno" }, 500);
  }
});
