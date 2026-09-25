/**
 * outreach-riepilogo — il riepilogo di ieri del cold outreach, via email (cron).
 *
 * «Ogni giorno mandami una mail di riepilogo delle email mandate, risposte
 * ricevute, follow-up, tasso di invio, tasso di apertura se ci sono.»
 * (18/09/2026). Una giornata storta — caselle in pausa, coda ferma, zero
 * risposte — si vedeva solo entrando nel pannello: adesso arriva scritta.
 *
 * Per ogni brand: email partite (primo contatto / follow-up), non partite,
 * risposte e di che tipo, indirizzi inesistenti, aperture (se il flusso le
 * traccia), coda di oggi. Più chi ha risposto, nome per nome, e le caselle
 * che non spediscono.
 *
 * Conta con COUNT sul database, non scaricando le righe: PostgREST taglia a
 * mille e un giorno buono di invii è già oltre.
 *
 * Auth: solo cron interno (service role bearer o x-cron-secret).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { avvisaSuperAdmin } from "../_shared/avvisaSuperAdmin.ts";
import { logRun } from "../_shared/outreachAlert.ts";
import { componiRiepilogo, finestraGiorno } from "../_shared/outreachRiepilogo.ts";
import { raccogliRiepilogoOutreach } from "../_shared/outreachRiepilogoDati.ts";
import { serveConMetriche } from "../_shared/withMetrics.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";

serveConMetriche("outreach-riepilogo", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized = (!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) return json({ error: "unauthorized" }, 401, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const avvio = new Date();
  const { etichetta } = finestraGiorno(avvio);

  try {
    const r = await raccogliRiepilogoOutreach(admin, avvio);
    const { titolo, righe, testo } = componiRiepilogo(r.dati);

    // Niente vibrazione: è un rapporto da leggere, non un allarme.
    const esito = await avvisaSuperAdmin(admin, {
      tipo: "outreach_riepilogo_giornaliero",
      titolo,
      testo,
      url: "/admin/marketing?tab=posta",
      tag: `outreach-riepilogo-${r.da.slice(0, 10)}`,
      push: false,
      email: { testo, righe },
    });

    const risultato = {
      giorno: r.etichetta, da: r.da, a: r.a, brand: r.dati.brand.length, risposte: r.risposte,
      da_chiamare: r.dati.daChiamare?.length ?? 0, urgenze: r.dati.urgenze?.length ?? 0, ...esito,
    };
    await logRun(admin, "outreach-riepilogo", avvio, risultato);
    return json(risultato, 200, cors);
  } catch (e) {
    await logRun(admin, "outreach-riepilogo", avvio, { giorno: etichetta }, e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
