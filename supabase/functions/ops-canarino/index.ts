/**
 * ops-canarino — il rapporto mattutino sui segnali vitali della piattaforma.
 *
 * Il nome interno resta "canarino" (canary in the coal mine); quello che legge
 * il super-admin si chiama "Stato piattaforma".
 *
 * Esiste perche' qui i guasti muoiono in silenzio: il dunning non e' mai
 * partito per quattro mesi, la CI e' rimasta in 401 per giorni, un cron
 * rispondeva 500 mentre il registro diceva "succeeded". Nessuno di questi
 * ha mai avvisato nessuno.
 *
 * Ogni mattina: una chiamata a canarino_vitali() (tutta la logica sta nel
 * database) e UNA email al super-admin. Si invia SEMPRE, anche quando e'
 * tutto regolare: un canarino che tace solo quando va tutto bene e' un
 * canarino di cui non ti accorgi quando muore. L'oggetto dice subito se
 * c'e' da aprirla.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { oraDiRoma, rapportoClientiMarketing } from "./clienti-marketing.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Etichette in italiano per le sezioni del rapporto, nell'ordine di gravita'.
const SEZIONI: Array<{ key: string; titolo: string }> = [
  { key: "snapshot_vecchio", titolo: "Il controllo stesso: raccolta dati ferma" },
  { key: "dunning_fermo", titolo: "Aziende in mancato pagamento SENZA solleciti" },
  { key: "cron_silenti", titolo: "Cron giornalieri che non girano da 26 ore" },
  { key: "http_errori_24h", titolo: "Errori HTTP dei cron (ultime 24h)" },
  { key: "whatsapp_numeri_bannati", titolo: "Numeri WhatsApp BANNATI (campagne in pausa)" },
  { key: "oauth_provider_giu", titolo: "Credenziali OAuth di piattaforma da controllare" },
  { key: "integrazioni_scadute", titolo: "Credenziali integrazioni scadute" },
  { key: "ricariche_esaurite", titolo: "Ricariche automatiche esaurite (serve il cliente)" },
  { key: "richiamo_caldo_bloccato", titolo: "Lead che hanno detto sì e nessuno li richiama" },
];

function rigaHtml(item: Record<string, unknown>): string {
  const testo = Object.entries(item)
    .map(([k, v]) => `${k}: <strong>${String(v ?? "—")}</strong>`)
    .join(" · ");
  return `<li style="margin:4px 0;font-family:sans-serif;font-size:13px;color:#374151;">${testo}</li>`;
}

serveConMetriche("ops-canarino", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsH });
  }

  // Destinatari: i super-admin della piattaforma.
  const destinatariSuperAdmin = async (): Promise<string[]> => {
    const { data: admins } = await supabase
      .from("user_roles").select("user_id").eq("role", "super_admin").limit(5);
    const { data: profiles } = await supabase
      .from("profiles").select("email").in("id", (admins ?? []).map((a: { user_id: string }) => a.user_id));
    return (profiles ?? []).map((p: { email: string | null }) => p.email).filter(Boolean) as string[];
  };

  // Stessa funzione, secondo rapporto: alle 08:00 il cron clienti-marketing-mattino
  // chiede il riepilogo dei clienti seguiti nel marketing (lead di ieri, fermi,
  // spesa, CPL, cose da fare). Una funzione in più non si può pubblicare (tetto
  // delle edge function), e il canarino ha già destinatari e mittente.
  let modo = "";
  let oraRoma: number | null = null;
  try {
    const corpo = await req.json();
    modo = String(corpo?.modo ?? "");
    oraRoma = corpo?.ora_roma == null ? null : Number(corpo.ora_roma);
  } catch {
    // corpo vuoto: rapporto di piattaforma
  }
  if (modo === "clienti-marketing") {
    // Due cron in UTC (04:00 e 05:00) coprono ora legale e solare: parte solo
    // quello che cade davvero all'ora di Roma chiesta (06:00).
    if (oraRoma != null && oraDiRoma() !== oraRoma) {
      return new Response(JSON.stringify({ ok: true, saltato: true, motivo: `ora di Roma ${oraDiRoma()}, atteso ${oraRoma}` }), { headers: corsH });
    }
    try {
      // Ai super admin si aggiungono gli indirizzi scritti in platform_settings
      // (chiave clienti_marketing_rapporto_destinatari: lista JSON o testo con
      // virgole): il titolare lo vuole sulla sua casella personale.
      const { data: impostazione } = await supabase
        .from("platform_settings").select("value").eq("key", "clienti_marketing_rapporto_destinatari").maybeSingle();
      const grezzo = impostazione?.value;
      const extra: string[] = Array.isArray(grezzo)
        ? grezzo.map(String)
        : typeof grezzo === "string"
          ? grezzo.split(/[,;\s]+/)
          : Array.isArray((grezzo as { emails?: unknown })?.emails)
            ? ((grezzo as { emails: unknown[] }).emails).map(String)
            : [];
      const destinatari = [...new Set([...(await destinatariSuperAdmin()), ...extra.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"))])];
      if (!destinatari.length) {
        return new Response(JSON.stringify({ ok: false, reason: "nessun super_admin con email" }), { headers: corsH });
      }
      const urlConsole = `${Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com"}/admin/marketing/clienti-servizio`;
      const r = await rapportoClientiMarketing(supabase, urlConsole);
      const sendResult = await sendEmailUnified({
        companyId: null,
        stream: "transactional",
        to: destinatari,
        subject: r.subject,
        html: r.html,
        templateName: "clienti_marketing_mattino",
        skipCredits: true,
        adminClient: supabase,
        metadata: { cose: r.cose, clienti: r.clienti },
      });
      if (!sendResult.ok) {
        throw new Error(String((sendResult.body as { error?: unknown })?.error ?? `status ${sendResult.status}`));
      }
      return new Response(JSON.stringify({ ok: true, cose: r.cose, clienti: r.clienti, destinatari: destinatari.length }), { headers: corsH });
    } catch (err) {
      console.error("[ops-canarino clienti-marketing]", err);
      return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: corsH });
    }
  }

  try {
    // I vitali li raccoglie il cron SQL delle 04:50 (ops-canarino-snapshot):
    // via PostgREST la RPC sfora gli 8s di statement_timeout per colpa dello
    // storico pg_cron, su cui non possiamo mettere indici. Qui si legge la
    // riga pronta — e uno snapshot vecchio e' esso stesso un guasto da dire.
    const { data: snap, error } = await supabase
      .from("ops_canarino_snapshot")
      .select("vitali, generato_alle")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(`snapshot: ${error.message}`);
    if (!snap) throw new Error("snapshot assente: il cron ops-canarino-snapshot non e' mai girato");
    const vitali = snap.vitali as Record<string, unknown>;

    const etaMinuti = Math.round((Date.now() - new Date(snap.generato_alle).getTime()) / 60000);
    if (etaMinuti > 120) {
      (vitali as Record<string, unknown>)["snapshot_vecchio"] = [
        { problema: `la raccolta dati non gira da ${Math.round(etaMinuti / 60)} ore`, cron: "ops-canarino-snapshot" },
      ];
    }

    const problemi = SEZIONI
      .map((s) => ({ ...s, items: (vitali?.[s.key] ?? []) as Array<Record<string, unknown>> }))
      .filter((s) => s.items.length > 0);
    const totale = problemi.reduce((n, s) => n + s.items.length, 0);

    const destinatari = await destinatariSuperAdmin();
    if (!destinatari.length) {
      return new Response(JSON.stringify({ ok: false, reason: "nessun super_admin con email" }), { headers: corsH });
    }

    const subject = totale === 0
      ? "Stato piattaforma — tutto regolare"
      : `Stato piattaforma — ${totale} segnali da guardare`;

    const corpo = totale === 0
      ? `<p style="font-family:sans-serif;font-size:14px;color:#374151;">Nessun segnale nelle ultime 24 ore: cron eseguiti, nessun errore HTTP rilevante, caselle e integrazioni attive, solleciti in corso dove servono.</p>`
      : problemi.map((s) => `
          <h3 style="font-family:sans-serif;font-size:14px;color:#111827;margin:16px 0 4px;">${s.titolo} (${s.items.length})</h3>
          <ul style="margin:0;padding-left:18px;">${s.items.map(rigaHtml).join("")}</ul>`).join("");

    const html = `<div style="max-width:640px;margin:0 auto;padding:24px;">
      <h2 style="font-family:sans-serif;font-size:18px;color:#111827;">${subject}</h2>
      ${corpo}
      ${(() => {
        const rotte = Number(vitali?.["caselle_scollegate_totale"] ?? 0);
        const tot = Number(vitali?.["caselle_collegate_totale"] ?? 0);
        if (!tot) return "";
        // Conteggio, non elenco: le singole caselle le riconnettono le aziende
        // (avvisate da system-emails-tick), il super-admin non puo' farlo.
        return `<p style="font-family:sans-serif;font-size:13px;color:#6b7280;margin-top:16px;">
          Caselle email collegate: <strong>${tot - rotte}/${tot}</strong> attive${rotte > 0 ? ` — ${rotte} scollegate, le aziende sono state avvisate` : ""}.
        </p>`;
      })()}
      <p style="font-family:sans-serif;font-size:11px;color:#9ca3af;margin-top:24px;">
        Rapporto generato alle ${String(vitali?.generato_alle ?? "")} — ogni mattina alle 05:00 UTC.
        Arriva anche quando e' tutto regolare: se smette di arrivare, il problema e' il controllo stesso.
      </p>
    </div>`;

    const sendResult = await sendEmailUnified({
      companyId: null,
      stream: "transactional",
      to: destinatari,
      subject,
      html,
      templateName: "ops_canarino_daily",
      skipCredits: true,
      adminClient: supabase,
      metadata: { totale_segnali: totale },
    });
    if (!sendResult.ok) {
      throw new Error(String((sendResult.body as { error?: unknown })?.error ?? `status ${sendResult.status}`));
    }

    return new Response(JSON.stringify({ ok: true, segnali: totale, destinatari: destinatari.length }), { headers: corsH });
  } catch (err) {
    console.error("[ops-canarino]", err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: corsH });
  }
});
