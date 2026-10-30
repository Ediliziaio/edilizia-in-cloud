/**
 * generali-avvisi — gli avvisi delle commesse generali fuori dalla pagina.
 *
 * Garanzie del contratto in scadenza (30 giorni, 7, scaduta) e da svincolare, fine lavori e
 * penali, documenti richiesti in scadenza, scaduti o mancanti da oltre 30 giorni, unità con
 * acconti senza fideiussione 122/2005, commesse dentro oltre il valore o in perdita.
 * Prima si vedevano solo aprendo la scheda della generale.
 *
 * UN GIRO (cron `generali-avvisi`, migrazione 20281105111000):
 *   1. fino a 20 generali non ancora guardate oggi, le meno recenti prima
 *      (generali_avvisi_da_controllare): il lavoro cresce coi dati, quindi va a rotazione;
 *   2. per ciascuna, i dati (generali_avvisi_contesto) → gli eventi di oggi, calcolati con
 *      lo stesso codice della pagina (src/lib/orders/generali/avvisi.ts) → generali_avvisi_registra,
 *      che apre i nuovi (una volta sola per chiave), chiude quelli finiti e suona la campanella
 *      (e le push, via trg_notifica_push) a chi gestisce la generale e agli amministratori,
 *      coi permessi e le preferenze di ciascuno;
 *   3. dalle 7 (ora di Roma), le email: una per persona, il lunedì con tutto quello che si è
 *      accumulato, gli altri giorni solo se c'è qualcosa di urgente. Ogni avviso entra in una
 *      sola email (commesse_generali_avvisi_invii.email_il).
 *
 * A pg_net risponde entro 5 secondi (serveConMetricheRapida) e finisce sotto waitUntil.
 *
 * PROVE SENZA EFFETTI: {"anteprima": true} calcola gli avvisi (al massimo 5 generali, o quella
 * di "generale_id") e le email che partirebbero, senza scrivere né spedire niente.
 *
 * ATTENZIONE alla pubblicazione: il calcolo sta in src/lib/orders/generali/ (avvisi.ts,
 * documenti.ts, contratto.ts, commesseGenerali.ts). Il CI ripubblica questa funzione solo se
 * cambia un file sotto supabase/functions/: chi cambia quei file tocchi anche questo.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
import {
  adessoARoma,
  avvisiDaMandare,
  contestoDaRisposta,
  destinatariDaRisposta,
  emailAvvisi,
  emailDaMandareOggi,
  type AvvisoInEmail,
} from "../../../src/lib/orders/generali/avvisi.ts";

const GENERALI_PER_GIRO = 20;
const EMAIL_PER_GIRO = 25;
const ORA_DELLE_EMAIL = 7;

interface PersonaDaAvvisare {
  user_id: string;
  company_id: string;
  email: string;
  nome: string | null;
  avvisi: AvvisoInEmail[];
}

serveConMetricheRapida("generali-avvisi", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!cronSecretValido(req) && !(token && token === serviceRole)) {
    return json({ error: "Serve il secret del cron." }, 401);
  }

  let corpo: Record<string, unknown> = {};
  try { corpo = req.method === "POST" ? await req.json() : {}; } catch { /* corpo vuoto: giro normale */ }
  const anteprima = corpo.anteprima === true;
  const soloGenerale = typeof corpo.generale_id === "string" ? corpo.generale_id : null;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
  const roma = adessoARoma();
  const esito = {
    anteprima,
    generali: 0, avvisi_nuovi: 0, avvisi_chiusi: 0, notifiche: 0,
    email_inviate: 0, email_rimandate: 0,
    errori: [] as string[],
    dettaglio: [] as Array<Record<string, unknown>>,
  };

  // ── 1-2. Le generali di questo giro ─────────────────────────────────────
  const daGuardare: string[] = [];
  if (soloGenerale) {
    daGuardare.push(soloGenerale);
  } else {
    const { data, error } = await admin.rpc("generali_avvisi_da_controllare", { p_limite: anteprima ? 5 : GENERALI_PER_GIRO });
    if (error) return json({ error: `Generali da controllare: ${error.message}` }, 500);
    for (const r of (data ?? []) as Array<{ generale_id: string }>) daGuardare.push(r.generale_id);
  }

  for (const generaleId of daGuardare) {
    esito.generali++;
    try {
      const { data: contesto, error } = await admin.rpc("generali_avvisi_contesto", { p_generale_id: generaleId });
      if (error) throw new Error(error.message);
      if (!contesto) continue;
      const destinatari = destinatariDaRisposta(contesto);
      const letto = contestoDaRisposta(contesto, roma.oggi);
      // Senza un amministratore che veda tutto non si calcola: si registra il giro vuoto,
      // così la generale non resta in testa alla fila ogni ora. Niente si chiude per questo.
      const avvisi = letto ? avvisiDaMandare(letto) : null;
      if (anteprima) {
        esito.dettaglio.push({ generale_id: generaleId, destinatari: destinatari.length, avvisi });
        continue;
      }
      if (!avvisi) {
        await admin.from("commesse_generali_avvisi_controlli")
          .upsert({ generale_id: generaleId, company_id: (contesto as { company_id: string }).company_id, controllata_il: new Date().toISOString() });
        continue;
      }
      const { data: reg, error: errReg } = await admin.rpc("generali_avvisi_registra", {
        p_generale_id: generaleId, p_avvisi: avvisi, p_destinatari: destinatari,
      });
      if (errReg) throw new Error(errReg.message);
      const r = (reg ?? {}) as { nuovi?: number; chiusi?: number; notifiche?: number };
      esito.avvisi_nuovi += r.nuovi ?? 0;
      esito.avvisi_chiusi += r.chiusi ?? 0;
      esito.notifiche += r.notifiche ?? 0;
    } catch (e) {
      esito.errori.push(`${generaleId}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 240));
    }
  }

  // ── 3. Le email ─────────────────────────────────────────────────────────
  if (anteprima || roma.ora >= ORA_DELLE_EMAIL) {
    try {
      await mandaEmail(admin, roma.giornoSettimana, anteprima, esito);
    } catch (e) {
      esito.errori.push(`email: ${e instanceof Error ? e.message : String(e)}`.slice(0, 240));
    }
  }

  if (esito.errori.length) console.error("generali-avvisi:", esito.errori);
  return json({ success: esito.errori.length === 0, ...esito });
});

async function mandaEmail(
  admin: SupabaseClient,
  giornoSettimana: number,
  anteprima: boolean,
  esito: { email_inviate: number; email_rimandate: number; errori: string[]; dettaglio: Array<Record<string, unknown>> },
) {
  const { data, error } = await admin.rpc("generali_avvisi_email_da_mandare", { p_limite: EMAIL_PER_GIRO });
  if (error) throw new Error(error.message);
  const persone = (Array.isArray(data) ? data : []) as PersonaDaAvvisare[];
  const branding = new Map<string, Awaited<ReturnType<typeof getBrandingForCompany>>>();

  for (const p of persone) {
    const avvisi = Array.isArray(p.avvisi) ? p.avvisi : [];
    if (!emailDaMandareOggi(avvisi, giornoSettimana)) { esito.email_rimandate++; continue; }
    if (!branding.has(p.company_id)) branding.set(p.company_id, await getBrandingForCompany(admin, p.company_id));
    const appUrl = branding.get(p.company_id)?.siteUrl || Deno.env.get("SITE_URL") || "";
    const email = emailAvvisi({ nome: p.nome, avvisi, appUrl });
    if (anteprima) {
      esito.dettaglio.push({ email_a: p.email, oggetto: email.oggetto, avvisi: avvisi.length });
      continue;
    }
    const invio = await sendEmailUnified({
      companyId: p.company_id,
      stream: "transactional",
      to: [p.email],
      subject: email.oggetto,
      html: email.html,
      text: email.testo,
      templateName: "commesse_generali_avvisi",
      skipCredits: false,
      adminClient: admin,
      metadata: { avvisi: avvisi.length, urgenti: avvisi.filter((a) => a.urgente).length },
    });
    if (!invio.ok) {
      esito.errori.push(`${p.email}: ${JSON.stringify(invio.body).slice(0, 160)}`);
      continue;
    }
    const { error: errSegna } = await admin.rpc("generali_avvisi_email_segna", { p_user_id: p.user_id, p_avvisi: avvisi.map((a) => a.id) });
    if (errSegna) esito.errori.push(`${p.email}: email partita ma non segnata (${errSegna.message})`);
    esito.email_inviate++;
  }
}
