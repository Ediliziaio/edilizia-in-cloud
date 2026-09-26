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
import { oraDiRoma, rapportoClientiMarketing, ricordaPriorita } from "./clienti-marketing.ts";
import { statoPiattaforma } from "./stato.ts";
import { appuntamentiDiOggi, giornoLungo } from "./appuntamenti.ts";
import { componiMattino, rigaSegnale } from "../_shared/mattino.ts";
import { componiRiepilogo } from "../_shared/outreachRiepilogo.ts";
import { raccogliRiepilogoOutreach } from "../_shared/outreachRiepilogoDati.ts";
import { logRun } from "../_shared/outreachAlert.ts";

// Risposta rapida ai cron (25/09/2026): l'email unica del mattino legge tre
// aree insieme e può superare i pochi secondi; pg_net non deve restare fermo.
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

serveConMetricheRapida("ops-canarino", async (req) => {
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

  // Ai super admin si aggiungono gli indirizzi scritti in platform_settings
  // (chiave clienti_marketing_rapporto_destinatari: lista JSON o testo con
  // virgole): il titolare lo vuole sulla sua casella personale.
  const destinatariRapporto = async (): Promise<string[]> => {
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
    return [...new Set([...(await destinatariSuperAdmin()), ...extra.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"))])];
  };

  // Stessa funzione, secondo rapporto: alle 08:00 il cron clienti-marketing-mattino
  // chiede il riepilogo dei clienti seguiti nel marketing (lead di ieri, fermi,
  // spesa, CPL, cose da fare). Una funzione in più non si può pubblicare (tetto
  // delle edge function), e il canarino ha già destinatari e mittente.
  let modo = "";
  let oraRoma: number | null = null;
  // Anteprima: il rapporto vero, restituito invece che spedito, senza
  // ricordare le priorità. Serve a vederlo prima di cambiarne la forma.
  let anteprima = false;
  // Prova: l'email vera, con «[Prova]» nell'oggetto, senza ricordare le
  // priorità né segnare il giro (regola del founder: prima di attivare un
  // invio automatico, un test vero).
  let prova = false;
  try {
    const corpo = await req.json();
    modo = String(corpo?.modo ?? "");
    oraRoma = corpo?.ora_roma == null ? null : Number(corpo.ora_roma);
    anteprima = corpo?.anteprima === true;
    prova = corpo?.prova === true;
  } catch {
    // corpo vuoto: rapporto di piattaforma
  }
  // L'email unica del mattino (25/09/2026): rapporto marketing, outreach di
  // ieri e stato piattaforma in una sola email alle 06:00, con in cima cosa
  // fare oggi. Le tre aree si leggono insieme; una che non risponde lascia il
  // motivo al suo posto e l'email parte lo stesso.
  if (modo === "mattino") {
    if (!anteprima && !prova && oraRoma != null && oraDiRoma() !== oraRoma) {
      return new Response(JSON.stringify({ ok: true, saltato: true, motivo: `ora di Roma ${oraDiRoma()}, atteso ${oraRoma}` }), { headers: corsH });
    }
    const avvio = new Date();
    const base = Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com";
    const urlMarketing = `${base}/admin/marketing/clienti-servizio`;
    const urlOutreach = `${base}/admin/marketing?tab=posta`;
    const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));
    try {
      const [mk, out, st, app] = await Promise.allSettled([
        rapportoClientiMarketing(supabase, urlMarketing),
        raccogliRiepilogoOutreach(supabase, avvio),
        statoPiattaforma(supabase),
        appuntamentiDiOggi(supabase, avvio),
      ]);
      const mkOk = mk.status === "fulfilled" ? mk.value : null;
      const outOk = out.status === "fulfilled" ? out.value : null;
      const stOk = st.status === "fulfilled" ? st.value : null;
      const daSistemare = [
        ...(outOk?.dati.urgenze ?? []),
        ...(stOk ? stOk.problemi.map((p) => rigaSegnale(p.titolo, p.items.length)) : [`Stato piattaforma non leggibile: ${motivo((st as PromiseRejectedResult).reason)}`]),
      ];
      const { subject, html } = componiMattino({
        giorno: giornoLungo(avvio),
        chiamate: outOk?.dati.daChiamare ?? [],
        appuntamenti: app.status === "fulfilled" ? app.value : [],
        erroreAppuntamenti: app.status === "rejected" ? motivo(app.reason) : null,
        priorita: (mkOk?.priorita ?? []).map((p) => ({
          cliente_nome: p.cliente_nome, titolo: p.titolo, azione: p.azione, responsabile: p.responsabile, scadenza: p.scadenza,
        })),
        daSistemare,
        marketing: mkOk ? { html: mkOk.corpo } : { html: null, errore: motivo((mk as PromiseRejectedResult).reason) },
        outreachRighe: outOk ? componiRiepilogo(outOk.dati).righe : null,
        outreachChiHaRisposto: outOk?.dati.chiHaRisposto ?? [],
        outreachErrore: outOk ? null : motivo((out as PromiseRejectedResult).reason),
        piattaforma: stOk
          ? { html: stOk.corpoHtml + stOk.piedeHtml }
          : { html: null, errore: motivo((st as PromiseRejectedResult).reason) },
        urlMarketing,
        urlOutreach,
        prova,
      });
      if (anteprima) {
        return new Response(JSON.stringify({ ok: true, anteprima: true, subject, html }), { headers: corsH });
      }

      const destinatari = await destinatariRapporto();
      if (!destinatari.length) {
        return new Response(JSON.stringify({ ok: false, reason: "nessun super_admin con email" }), { headers: corsH });
      }
      const sendResult = await sendEmailUnified({
        companyId: null,
        stream: "transactional",
        to: destinatari,
        subject,
        html,
        templateName: prova ? "mattino_prova" : "mattino",
        skipCredits: true,
        adminClient: supabase,
        metadata: {
          chiamate: outOk?.dati.daChiamare?.length ?? null,
          appuntamenti: app.status === "fulfilled" ? app.value.length : null,
          priorita: mkOk?.priorita.length ?? null,
          da_sistemare: daSistemare.length,
          aree_mancanti: [mkOk ? "" : "marketing", outOk ? "" : "outreach", stOk ? "" : "piattaforma"].filter(Boolean),
        },
      });
      if (!sendResult.ok) {
        throw new Error(String((sendResult.body as { error?: unknown })?.error ?? `status ${sendResult.status}`));
      }
      // Dopo l'invio vero, come facevano le due email di prima: le priorità
      // mostrate (domani il rapporto dice com'è andata) e il giro
      // dell'outreach nel suo registro. La prova non lascia tracce.
      if (!prova) {
        if (mkOk) {
          try {
            await ricordaPriorita(supabase, mkOk.giorno, mkOk.priorita);
          } catch (e) {
            console.error("[ops-canarino mattino] priorità non salvate:", e);
          }
        }
        if (outOk) {
          await logRun(supabase, "outreach-riepilogo", avvio, {
            giorno: outOk.etichetta, da: outOk.da, a: outOk.a, via: "email del mattino",
            risposte: outOk.risposte, da_chiamare: outOk.dati.daChiamare?.length ?? 0,
          });
        }
      }
      return new Response(JSON.stringify({ ok: true, subject, destinatari: destinatari.length, prova, da_sistemare: daSistemare.length }), { headers: corsH });
    } catch (err) {
      console.error("[ops-canarino mattino]", err);
      return new Response(JSON.stringify({ ok: false, error: motivo(err) }), { status: 500, headers: corsH });
    }
  }

  if (modo === "clienti-marketing") {
    // Due cron in UTC (04:00 e 05:00) coprono ora legale e solare: parte solo
    // quello che cade davvero all'ora di Roma chiesta (06:00).
    if (anteprima) {
      try {
        const urlAnteprima = `${Deno.env.get("APP_URL") ?? "https://app.ediliziaincloud.com"}/admin/marketing/clienti-servizio`;
        const r = await rapportoClientiMarketing(supabase, urlAnteprima);
        return new Response(JSON.stringify({ ok: true, anteprima: true, subject: r.subject, html: r.html, priorita: r.priorita }), { headers: corsH });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: corsH });
      }
    }
    if (oraRoma != null && oraDiRoma() !== oraRoma) {
      return new Response(JSON.stringify({ ok: true, saltato: true, motivo: `ora di Roma ${oraDiRoma()}, atteso ${oraRoma}` }), { headers: corsH });
    }
    try {
      const destinatari = await destinatariRapporto();
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
      // Le priorità di stamattina, per dire domani com'è andata. Se non si
      // riesce l'email è comunque partita: domani manca solo quella riga.
      let prioritaRicordate = true;
      try {
        await ricordaPriorita(supabase, r.giorno, r.priorita);
      } catch (e) {
        prioritaRicordate = false;
        console.error("[ops-canarino clienti-marketing] priorità non salvate:", e);
      }
      return new Response(JSON.stringify({ ok: true, cose: r.cose, clienti: r.clienti, destinatari: destinatari.length, priorita_ricordate: prioritaRicordate }), { headers: corsH });
    } catch (err) {
      console.error("[ops-canarino clienti-marketing]", err);
      return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: corsH });
    }
  }

  try {
    const stato = await statoPiattaforma(supabase);

    const destinatari = await destinatariSuperAdmin();
    if (!destinatari.length) {
      return new Response(JSON.stringify({ ok: false, reason: "nessun super_admin con email" }), { headers: corsH });
    }
    const { subject, totale } = stato;

    const html = `<div style="max-width:640px;margin:0 auto;padding:24px;">
      <h2 style="font-family:sans-serif;font-size:18px;color:#111827;">${subject}</h2>
      ${stato.corpoHtml}
      ${stato.piedeHtml}
      <p style="font-family:sans-serif;font-size:11px;color:#9ca3af;margin-top:24px;">
        Rapporto generato alle ${stato.generatoAlle} — ogni mattina alle 06:02, ora di Roma.
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
