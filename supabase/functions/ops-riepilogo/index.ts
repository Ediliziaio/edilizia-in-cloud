/**
 * ops-riepilogo — come sta andando la piattaforma, ogni settimana e ogni mese.
 *
 * Fratello dello "Stato piattaforma", che dice cosa si e' rotto. Questo dice
 * come va: incassi, clienti, chi rischia di andarsene, segni di vita.
 *
 * Arriva SEMPRE, anche in un periodo piatto. Un rapporto che compare solo
 * quando ci sono buone notizie non e' un rapporto: e' una pacca sulla spalla,
 * e la sua assenza diventa ambigua (e' andata male o si e' rotto l'invio?).
 *
 * Il periodo si passa in `periodo`: "settimana" (7 giorni fino a stanotte) o
 * "mese" (mese di calendario appena chiuso). Il conto lo fa il database, qui
 * si formatta e si spedisce.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const eur = (n: unknown) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" })
    .format(Number(n ?? 0));

/** "+12%" / "−8%" / "—" quando il confronto non ha senso (prima era zero). */
function variazione(ora: unknown, prima: unknown): string {
  const a = Number(ora ?? 0);
  const b = Number(prima ?? 0);
  if (!b) return a > 0 ? "nuovo" : "—";
  const pct = Math.round(((a - b) / b) * 100);
  if (pct === 0) return "stabile";
  // Il segno meno tipografico (−) sparisce in alcuni client: si usa il trattino.
  return pct > 0 ? `+${pct}%` : `-${Math.abs(pct)}%`;
}

function riga(etichetta: string, valore: string, nota?: string): string {
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-family:sans-serif;font-size:14px;color:#6b7280;">${etichetta}</td>
    <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-family:sans-serif;font-size:14px;color:#111827;text-align:right;">
      <strong>${valore}</strong>${nota ? ` <span style="color:#9ca3af;font-size:12px;">${nota}</span>` : ""}
    </td>
  </tr>`;
}

function elenco(titolo: string, items: Array<Record<string, unknown>>, formato: (i: Record<string, unknown>) => string): string {
  if (!items?.length) return "";
  return `<h3 style="font-family:sans-serif;font-size:14px;color:#111827;margin:20px 0 6px;">${titolo}</h3>
    <ul style="margin:0;padding-left:18px;">
      ${items.map((i) => `<li style="font-family:sans-serif;font-size:13px;color:#374151;margin:3px 0;">${formato(i)}</li>`).join("")}
    </ul>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret") ?? req.headers.get("x-internal-cron-secret");
  if (!cronSecret || reqSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsH });
  }

  try {
    let periodo = "settimana";
    try {
      const body = await req.json();
      if (body?.periodo === "mese") periodo = "mese";
    } catch { /* nessun body: settimanale */ }

    // Finestre: la settimana sono i 7 giorni chiusi a mezzanotte di oggi; il
    // mese e' quello di CALENDARIO appena concluso — cosi' il rapporto del 1°
    // settembre parla di agosto intero, non degli ultimi 30 giorni a cavallo.
    const oggi = new Date();
    const fine = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate()));
    let inizio: Date;
    let etichetta: string;
    if (periodo === "mese") {
      inizio = new Date(Date.UTC(fine.getUTCFullYear(), fine.getUTCMonth() - 1, 1));
      const finemese = new Date(Date.UTC(fine.getUTCFullYear(), fine.getUTCMonth(), 1));
      etichetta = inizio.toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
      const { data: r, error } = await supabase.rpc("riepilogo_piattaforma", {
        p_da: inizio.toISOString(), p_a: finemese.toISOString(),
      });
      if (error) throw new Error(error.message);
      return await spedisci(r, `Riepilogo di ${etichetta}`, corsH);
    }
    inizio = new Date(fine.getTime() - 7 * 86400000);
    etichetta = `${inizio.toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(fine.getTime() - 86400000).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "UTC" })}`;
    const { data: r, error } = await supabase.rpc("riepilogo_piattaforma", {
      p_da: inizio.toISOString(), p_a: fine.toISOString(),
    });
    if (error) throw new Error(error.message);
    return await spedisci(r, `Riepilogo settimana ${etichetta}`, corsH);
  } catch (e) {
    console.error("[ops-riepilogo]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: corsH,
    });
  }
});

async function spedisci(r: Record<string, unknown>, titolo: string, corsH: HeadersInit): Promise<Response> {
  const { data: admins } = await supabase
    .from("user_roles").select("user_id").eq("role", "super_admin").limit(5);
  const { data: profiles } = await supabase
    .from("profiles").select("email").in("id", (admins ?? []).map((a: { user_id: string }) => a.user_id));
  const destinatari = (profiles ?? []).map((p: { email: string | null }) => p.email).filter(Boolean) as string[];
  if (!destinatari.length) {
    return new Response(JSON.stringify({ ok: false, reason: "nessun super_admin con email" }), { headers: corsH });
  }

  const incassiDa = (r?.incassi_da ?? []) as Array<Record<string, unknown>>;
  const difficolta = (r?.in_difficolta ?? []) as Array<Record<string, unknown>>;
  const scadenza = (r?.trial_in_scadenza ?? []) as Array<Record<string, unknown>>;

  const html = `<div style="max-width:640px;margin:0 auto;padding:24px;">
    <h2 style="font-family:sans-serif;font-size:18px;color:#111827;margin:0 0 4px;">${titolo}</h2>
    <p style="font-family:sans-serif;font-size:13px;color:#6b7280;margin:0 0 20px;">
      Come sta andando la piattaforma. Per i guasti c'è lo Stato piattaforma, ogni mattina.
    </p>

    <table style="width:100%;border-collapse:collapse;">
      ${riga("Incassato nel periodo", eur(r?.incassi_eur),
             `${r?.incassi_n ?? 0} ${Number(r?.incassi_n ?? 0) === 1 ? "fattura" : "fatture"} · ${variazione(r?.incassi_eur, r?.incassi_eur_prec)} sul periodo precedente`)}
      ${incassiDa.length
        ? `<tr><td colspan="2" style="padding:2px 0 10px;font-family:sans-serif;font-size:12px;color:#9ca3af;border-bottom:1px solid #e5e7eb;">
             da ${incassiDa.map((i) => `${i.azienda} ${eur(i.eur)}`).join(" · ")}
           </td></tr>`
        : ""}
      ${riga("MRR fatturato", eur(r?.mrr_eur),
             `${r?.aziende_paganti ?? 0} ${Number(r?.aziende_paganti ?? 0) === 1 ? "azienda pagante" : "aziende paganti"}${r?.mrr_eur_prec ? ` · ${variazione(r?.mrr_eur, r?.mrr_eur_prec)}` : ""}`)}
      ${Number(r?.mrr_regalato_eur ?? 0) > 0
        ? riga("Di cui regalato", eur(r?.mrr_regalato_eur),
               `${r?.aziende_regalate ?? 0} accessi omaggio · fuori dal MRR`)
        : ""}
      ${riga("Aziende attive", String(r?.aziende_attive ?? 0), `${r?.nuove_aziende ?? 0} nuove nel periodo`)}
      ${riga("Prove in corso", String(r?.trial_attivi ?? 0))}
      ${riga("Commesse create", String(r?.commesse_create ?? 0), "dai clienti")}
      ${riga("Preventivi creati", String(r?.preventivi_creati ?? 0), "dai clienti")}
      ${riga("AI — costo / fatturato", `${eur(r?.ai_costo_eur)} / ${eur(r?.ai_fatturato_eur)}`,
             Number(r?.ai_costo_eur ?? 0) > Number(r?.ai_fatturato_eur ?? 0) ? "in perdita" : "")}
      ${Number(r?.wa_inviati ?? 0) > 0
        ? riga("WhatsApp a freddo", `${r?.wa_inviati} inviati · ${r?.wa_risposte} risposte`,
               Number(r?.wa_inviati) > 0 ? `${Math.round((Number(r?.wa_risposte) / Number(r?.wa_inviati)) * 100)}% di risposta` : "")
        : ""}
    </table>

    ${Number(r?.incassi_eur ?? 0) > 0 && Number(r?.incassi_eur ?? 0) !== Number(r?.mrr_eur ?? 0)
      ? `<p style="font-family:sans-serif;font-size:12px;color:#6b7280;margin:14px 0 0;">
           L'incassato è la cassa del periodo, il MRR è quanto rientra ogni mese <em>oggi</em>:
           se il primo è più alto, qualcuno che ha pagato nel periodo adesso non paga più.
         </p>`
      : ""}

    ${r?.mrr_affidabile === false
      ? `<p style="font-family:sans-serif;font-size:12px;color:#92400e;background:#fef3c7;padding:10px 12px;border-radius:6px;margin:16px 0 0;">
           Il MRR di questo riepilogo viene dall'ultima fotografia disponibile, calcolata prima
           della correzione che esclude gli accessi regalati: leggilo come indicativo. Dal
           prossimo giro notturno il numero è quello fatturato davvero.
         </p>`
      : ""}

    ${elenco("Aziende che non stanno pagando", difficolta,
      (i) => `<strong>${i.azienda}</strong> — da ${i.da_giorni} giorni`)}
    ${elenco("Prove che scadono a breve", scadenza,
      (i) => `<strong>${i.azienda}</strong> — fra ${i.fra_giorni} giorni`)}

    <p style="font-family:sans-serif;font-size:11px;color:#9ca3af;margin-top:24px;">
      Questo riepilogo arriva sempre, anche quando non è successo niente: se smette di arrivare,
      il problema è il rapporto, non il mese.
    </p>
  </div>`;

  const sendResult = await sendEmailUnified({
    companyId: null,
    stream: "transactional",
    to: destinatari,
    subject: titolo,
    html,
    templateName: "ops_riepilogo",
    skipCredits: true,
    adminClient: supabase,
    metadata: { periodo: titolo },
  });
  if (!sendResult.ok) {
    throw new Error(String((sendResult.body as { error?: unknown })?.error ?? `status ${sendResult.status}`));
  }

  return new Response(JSON.stringify({ ok: true, titolo, destinatari: destinatari.length }), { headers: corsH });
}
