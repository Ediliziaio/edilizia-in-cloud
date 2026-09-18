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
import { componiRiepilogo, finestraGiorno, type ContiBrand } from "../_shared/outreachRiepilogo.ts";
import { serveConMetriche } from "../_shared/withMetrics.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

const INTENTO_IN_CHIARO: Record<string, string> = {
  interested: "interessato",
  question: "fa una domanda",
  not_interested: "non interessato",
  unsubscribe: "chiede di non essere più contattato",
  referral: "indica un'altra persona",
  other: "da leggere",
  auto_reply: "risposta automatica",
};

/** Il numero di righe che soddisfano la query, senza scaricarle. */
async function conta(q: any): Promise<number> {
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

serveConMetriche("outreach-riepilogo", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized = (!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) return json({ error: "unauthorized" }, 401, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const avvio = new Date();
  const { da, a, etichetta } = finestraGiorno(avvio);
  const fineOggi = new Date(new Date(a).getTime() + 86_400_000).toISOString();

  try {
    // Brand e flussi: servono per raggruppare e per sapere se le aperture
    // sono tracciate (oggi: su nessun flusso).
    const { data: brands } = await admin.from("outreach_brands").select("id, name").order("name");
    const { data: seqs } = await admin.from("outreach_sequences").select("id, brand_id, track_opens");
    const sequenze = (seqs ?? []) as Array<{ id: string; brand_id: string | null; track_opens: boolean | null }>;

    // Le risposte del giorno: poche righe, si leggono tutte.
    const { data: risposteRaw } = await admin.from("outreach_replies").select("*")
      .eq("company_id", PLATFORM_COMPANY).gte("received_at", da).lt("received_at", a)
      .order("received_at").limit(500);
    const risposte = (risposteRaw ?? []) as Array<Record<string, any>>;

    // Il brand di una risposta: quello scritto sulla riga (dal 18/09), oppure
    // ricostruito dall'iscrizione → flusso → brand.
    const enrIds = [...new Set(risposte.map((r) => r.enrollment_id).filter(Boolean))] as string[];
    const brandDiIscrizione = new Map<string, string | null>();
    if (enrIds.length) {
      const { data: enrs } = await admin.from("outreach_enrollments").select("id, sequence_id").in("id", enrIds);
      const brandDiSequenza = new Map(sequenze.map((s) => [s.id, s.brand_id] as const));
      for (const e of (enrs ?? []) as Array<{ id: string; sequence_id: string | null }>) {
        brandDiIscrizione.set(e.id, e.sequence_id ? brandDiSequenza.get(e.sequence_id) ?? null : null);
      }
    }
    const brandDiRisposta = (r: Record<string, any>): string | null =>
      (r.brand_id as string | null) ?? (r.enrollment_id ? brandDiIscrizione.get(r.enrollment_id) ?? null : null);

    // Chi ha risposto, con nome e azienda (le autorisposte non contano).
    const vere = risposte.filter((r) => r.intent !== "auto_reply");
    const contattoIds = [...new Set(vere.map((r) => r.contact_id).filter(Boolean))] as string[];
    const nomi = new Map<string, string>();
    if (contattoIds.length) {
      const { data: cs } = await admin.from("marketing_contacts")
        .select("id, first_name, last_name, company_name").in("id", contattoIds);
      for (const c of (cs ?? []) as Array<any>) {
        nomi.set(c.id, c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "");
      }
    }
    const chiHaRisposto = vere.map((r) => {
      const chi = (r.contact_id ? nomi.get(r.contact_id) : "") || r.from_email || "sconosciuto";
      const intento = r.intent ? (INTENTO_IN_CHIARO[r.intent] ?? r.intent) : "da leggere";
      return `${chi} — ${intento}`;
    });

    // Un secchio per brand, più uno per le righe senza brand.
    const secchi: Array<{ id: string | null; nome: string }> = [
      ...((brands ?? []) as Array<{ id: string; name: string }>).map((b) => ({ id: b.id, nome: b.name })),
      { id: null, nome: "Senza brand" },
    ];

    const conti: ContiBrand[] = [];
    for (const s of secchi) {
      const coda = () => {
        const q = admin.from("outreach_send_queue").select("id", { count: "exact", head: true })
          .eq("company_id", PLATFORM_COMPANY);
        return s.id ? q.eq("brand_id", s.id) : q.is("brand_id", null);
      };
      const inviate = await conta(coda().eq("status", "sent").gte("sent_at", da).lt("sent_at", a));
      const primoContatto = await conta(
        coda().eq("status", "sent").eq("primo_contatto", true).gte("sent_at", da).lt("sent_at", a),
      );
      const aperte = await conta(
        coda().eq("status", "sent").not("opened_at", "is", null).gte("sent_at", da).lt("sent_at", a),
      );
      const fallite = await conta(coda().eq("status", "failed").gte("updated_at", da).lt("updated_at", a));
      const inPartenza = await conta(coda().eq("status", "queued").lt("scheduled_for", fineOggi));
      const inCoda = await conta(coda().eq("status", "queued"));

      // Indirizzi inesistenti: iscrizioni finite a 'bounced' nella giornata.
      const seqDelBrand = sequenze.filter((x) => (s.id ? x.brand_id === s.id : !x.brand_id)).map((x) => x.id);
      let rimbalzi = 0;
      if (seqDelBrand.length) {
        rimbalzi = await conta(
          admin.from("outreach_enrollments").select("id", { count: "exact", head: true })
            .eq("company_id", PLATFORM_COMPANY).in("sequence_id", seqDelBrand)
            .eq("status", "bounced").gte("updated_at", da).lt("updated_at", a),
        );
      }

      const mie = vere.filter((r) => brandDiRisposta(r) === s.id);
      const conti1: ContiBrand = {
        brand: s.nome,
        inviate,
        primoContatto,
        fallite,
        risposte: mie.length,
        interessati: mie.filter((r) => r.intent === "interested" || r.intent === "question").length,
        negative: mie.filter((r) => r.intent === "not_interested").length,
        optout: mie.filter((r) => r.intent === "unsubscribe").length,
        rimbalzi,
        aperte,
        tracciaAperture: sequenze.some((x) => (s.id ? x.brand_id === s.id : !x.brand_id) && x.track_opens === true),
        inPartenza,
        inCoda,
      };
      // Il secchio «Senza brand» compare solo se ha davvero qualcosa dentro.
      if (s.id || inviate || fallite || mie.length || inCoda) conti.push(conti1);
    }

    // Caselle che non spediscono: in pausa, o con la connessione rotta.
    const { data: caselle } = await admin.from("outreach_sender_accounts")
      .select("email, status, connection_status");
    const tutte = (caselle ?? []) as Array<{ email: string; status: string | null; connection_status: string | null }>;
    const ferme = tutte.filter((c) => !["active", "warming"].includes(String(c.status)) || (c.connection_status && c.connection_status !== "ok"));

    const { titolo, righe, testo } = componiRiepilogo({
      giorno: etichetta,
      brand: conti,
      chiHaRisposto,
      caselleFerme: ferme.slice(0, 6).map((c) => `${c.email} (${c.status === "paused" ? "in pausa" : c.connection_status ?? "?"})`),
      caselleAttive: tutte.length - ferme.length,
    });

    // Niente vibrazione: è un rapporto da leggere, non un allarme.
    const esito = await avvisaSuperAdmin(admin, {
      tipo: "outreach_riepilogo_giornaliero",
      titolo,
      testo,
      url: "/admin/marketing?tab=posta",
      tag: `outreach-riepilogo-${da.slice(0, 10)}`,
      push: false,
      email: { testo, righe },
    });

    const risultato = { giorno: etichetta, da, a, brand: conti.length, risposte: vere.length, ...esito };
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
