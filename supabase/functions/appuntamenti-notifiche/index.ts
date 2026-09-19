/**
 * appuntamenti-notifiche — le email degli appuntamenti fissati dall'azienda
 * (calendario, scheda contatto, opportunità), per le aziende che le hanno
 * accese con `companies.appuntamenti_notifiche_dal`.
 *
 * Al cliente: la conferma quando si fissa, i dettagli nuovi se cambiano
 * giorno, ora, luogo o consulente, un avviso se viene annullato, un promemoria
 * il giorno prima. Mai le note: sono del consulente. Le risposte vanno al
 * consulente (reply-to).
 * Al consulente: un avviso quando un altro fissa, sposta o annulla un
 * appuntamento suo. Chi lo fa da sé, o una sincronizzazione, non avvisa.
 *
 * Nasce dalla richiesta di Il Bagno Group (18/09/2026): con GoHighLevel le
 * notifiche partivano in inglese; qui partiva solo quella della prenotazione
 * dalla pagina pubblica, che resta fuori (ha le sue: public-booking-crea e
 * appuntamenti-promemoria).
 *
 * Chi la chiama:
 *   - il trigger `trg_appuntamento_notifiche` (pg_net), un appuntamento alla
 *     volta: { appointment_id, evento, autore, cambi, prima };
 *   - il cron `appuntamenti-notifiche-giro` ogni 15 minuti: { modo: "giro" }
 *     (promemoria e conferme rimaste indietro);
 *   - { modo: "anteprima", appointment_id } compone tutte le email di un
 *     appuntamento senza mandarle né registrarle.
 *
 * Ogni invio è registrato in `appuntamenti_notifiche` con la chiave di ciò
 * che è stato detto (giorno|ora|consulente|luogo): la stessa email non parte
 * due volte, nemmeno con due chiamate nello stesso istante.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { serveConMetriche } from "../_shared/withMetrics.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { allegatoIcs } from "../_shared/appuntamentiPubblici.ts";
import {
  type AppuntamentoDaNotificare, type EmailComposta, type Luogo, type TipoNotifica,
  STATI_ANNULLATI, STATI_ATTIVI, baseDellaChiave, chiaveAppuntamento, emailAnnullamento, emailConferma,
  emailConsulente, emailPromemoria, emailSpostamento, icsCliente, luogoAppuntamento, quandoDallaChiave,
} from "../_shared/notificheAppuntamento.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINK_CALENDARIO = "https://app.ediliziaincloud.com/azienda/marketing/calendario";

interface Contesto {
  evento: "insert" | "update" | "giro";
  /** Chi ha fatto il cambio: NULL per sincronizzazioni, automazioni, il giro. */
  autore: string | null;
  cambi: string[];
  prima: { data: string | null; ora: string | null; stato: string | null } | null;
}

interface Registrata { tipo: TipoNotifica; chiave: string; esito: string; creato_il: string }

const emailValida = (e: unknown): string | null => {
  const s = String(e ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};

serveConMetriche("appuntamenti-notifiche", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!cronSecretValido(req) && !(token && token === SERVICE_ROLE)) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any = {};
  try { body = await req.json(); } catch { /* corpo vuoto */ }

  try {
    if (body?.modo === "giro") return json(await giro(admin));
    if (body?.modo === "anteprima") {
      if (!body.appointment_id) return json({ error: "appointment_id mancante" }, 400);
      return json(await anteprima(admin, String(body.appointment_id)));
    }
    if (!body?.appointment_id) return json({ error: "appointment_id mancante" }, 400);
    const ctx: Contesto = {
      evento: body.evento === "insert" ? "insert" : "update",
      autore: typeof body.autore === "string" && body.autore ? body.autore : null,
      cambi: Array.isArray(body.cambi) ? body.cambi.map(String) : [],
      prima: body.prima && typeof body.prima === "object" ? body.prima : null,
    };
    return json(await gestisci(admin, String(body.appointment_id), ctx));
  } catch (e) {
    console.error("[appuntamenti-notifiche]", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function carica(admin: any, id: string): Promise<AppuntamentoDaNotificare | null> {
  const { data, error } = await admin.rpc("appuntamento_da_notificare", { p_id: id });
  if (error) throw new Error(`appuntamento_da_notificare: ${error.message}`);
  return (data as AppuntamentoDaNotificare | null) ?? null;
}

async function storico(admin: any, id: string): Promise<Registrata[]> {
  const { data, error } = await admin
    .from("appuntamenti_notifiche")
    .select("tipo, chiave, esito, creato_il")
    .eq("appointment_id", id)
    .order("creato_il", { ascending: true });
  if (error) throw new Error(`appuntamenti_notifiche: ${error.message}`);
  return (data ?? []) as Registrata[];
}

/**
 * Le email al cliente partite o in partenza, promemoria esclusi, in ordine.
 * Quella «in corso» conta: se due salvataggi arrivano insieme, il secondo
 * manda i dettagli aggiornati invece di una seconda conferma.
 */
function comunicazioniAlCliente(righe: Registrata[]): Registrata[] {
  return righe.filter((r) => (r.esito === "inviata" || r.esito === "in_corso")
    && r.tipo.startsWith("cliente_") && r.tipo !== "cliente_promemoria");
}

function accese(a: AppuntamentoDaNotificare): boolean {
  const dal = a.azienda?.notifiche_dal;
  return Boolean(dal) && new Date(a.creato_il).getTime() >= new Date(dal!).getTime();
}

async function nomeDi(admin: any, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await admin.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle();
  const nome = [data?.first_name, data?.last_name].map((x: unknown) => String(x ?? "").trim()).filter(Boolean).join(" ");
  return nome || null;
}

/**
 * Prenota l'invio nel registro, manda l'email, segna com'è andata. Se la
 * riga c'è già (inviata, in corso o fallita tre volte) non manda niente.
 */
async function invia(
  admin: any,
  a: AppuntamentoDaNotificare,
  tipo: TipoNotifica,
  chiave: string,
  a_chi: string,
  email: EmailComposta,
  opz: { replyTo?: string | null; ics?: string | null } = {},
): Promise<{ tipo: TipoNotifica; esito: string }> {
  const { data: prenotata, error } = await admin.rpc("appuntamento_notifica_prenota", {
    p_appointment: a.id, p_company: a.company_id, p_tipo: tipo, p_chiave: chiave, p_destinatario: a_chi,
  });
  if (error) throw new Error(`appuntamento_notifica_prenota: ${error.message}`);
  if (!prenotata) return { tipo, esito: "già fatta" };

  let ok = false;
  let dettaglio: string | null = null;
  try {
    const r = await sendEmailUnified({
      companyId: a.company_id,
      stream: "transactional",
      to: a_chi,
      subject: email.oggetto,
      html: email.html,
      text: email.testo,
      replyTo: opz.replyTo ?? undefined,
      templateName: `appuntamento_${tipo}`,
      attachments: opz.ics ? [allegatoIcs(opz.ics)] : undefined,
      adminClient: admin,
      metadata: { appointment_id: a.id, notifica: tipo },
    });
    ok = !(r && r.ok === false);
    if (!ok) dettaglio = JSON.stringify(r?.body ?? { status: r?.status }).slice(0, 500);
  } catch (e) {
    dettaglio = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  }
  await admin
    .from("appuntamenti_notifiche")
    .update({ esito: ok ? "inviata" : "errore", dettaglio, aggiornato_il: new Date().toISOString() })
    .eq("id", prenotata);
  return { tipo, esito: ok ? "inviata" : "errore" };
}

/** Le risposte del cliente arrivano al consulente, o all'azienda. */
function rispondiA(a: AppuntamentoDaNotificare): string | null {
  return emailValida(a.consulente?.email) ?? emailValida(a.azienda?.email);
}

async function gestisci(admin: any, id: string, ctx: Contesto) {
  const a = await carica(admin, id);
  if (!a) return { id, esito: "appuntamento non trovato" };
  if (!accese(a)) return { id, esito: "notifiche spente per questo appuntamento" };
  if (a.bloccato || a.pubblico) return { id, esito: "fuori da queste notifiche" };

  const luogo = luogoAppuntamento(a);
  const base = chiaveAppuntamento(a, luogo);
  const futuro = new Date(a.inizio).getTime() > Date.now();
  const righe = await storico(admin, id);
  const alCliente = comunicazioniAlCliente(righe);
  const ultima = alCliente[alCliente.length - 1] ?? null;
  const annullamenti = alCliente.filter((r) => r.tipo === "cliente_annullamento").length;
  const esiti: { tipo: TipoNotifica; esito: string }[] = [];

  // ── Al cliente ────────────────────────────────────────────────────────
  const emailCliente = emailValida(a.cliente?.email);
  // La sequenza del file .ics cresce a ogni email: un calendario applica un
  // aggiornamento o una disdetta solo se il numero è più alto dell'ultimo.
  const inviate = alCliente.length;
  if (emailCliente && futuro) {
    if (a.stato === "confermato") {
      if (!ultima || ultima.tipo === "cliente_annullamento") {
        esiti.push(await invia(admin, a, "cliente_conferma", `${base}#${annullamenti}`, emailCliente,
          emailConferma(a, luogo),
          { replyTo: rispondiA(a), ics: icsCliente(a, luogo, { sequenza: inviate }) }));
      } else if (baseDellaChiave(ultima.chiave) !== base) {
        esiti.push(await invia(admin, a, "cliente_spostamento", `${base}#${annullamenti}`, emailCliente,
          emailSpostamento(a, luogo, quandoDallaChiave(ultima.chiave)),
          { replyTo: rispondiA(a), ics: icsCliente(a, luogo, { sequenza: inviate }) }));
      }
    } else if (STATI_ANNULLATI.has(a.stato) && ultima && ultima.tipo !== "cliente_annullamento") {
      esiti.push(await invia(admin, a, "cliente_annullamento", `#${annullamenti}`, emailCliente,
        emailAnnullamento(a, luogo),
        { replyTo: rispondiA(a), ics: icsCliente(a, luogo, { annullato: true, sequenza: inviate }) }));
    }
  }
  // Per l'avviso al consulente: true = il cliente ha l'email con i dettagli di
  // adesso, false = non ha un indirizzo (o non c'è un cliente), null = meglio
  // non dire niente (invio fallito, appuntamento ancora in attesa).
  const inviataOra = esiti.some((e) => e.tipo.startsWith("cliente_") && e.esito === "inviata");
  const giaAvvisato = Boolean(ultima && ultima.tipo !== "cliente_annullamento" && baseDellaChiave(ultima.chiave) === base);
  const clienteAvvisato: boolean | null = !a.cliente || !emailCliente ? false : (inviataOra || giaAvvisato ? true : null);

  // ── Al consulente ─────────────────────────────────────────────────────
  // Solo se il cambio l'ha fatto un'altra persona: chi fissa da sé lo sa già,
  // e le sincronizzazioni (autore NULL) riportano cambi fatti dal consulente
  // stesso sul suo Google Calendar.
  const consulente = a.consulente;
  const emailConsulenteA = emailValida(consulente?.email);
  if (ctx.autore && consulente?.id && ctx.autore !== consulente.id && emailConsulenteA && futuro) {
    const attivo = STATI_ATTIVI.has(a.stato);
    let tipo: "consulente_nuovo" | "consulente_spostamento" | "consulente_annullamento" | null = null;
    let chiave = base;
    if (ctx.evento === "insert" && attivo) {
      tipo = "consulente_nuovo";
      chiave = consulente.id;
    } else if (ctx.evento === "update") {
      if (ctx.cambi.includes("stato") && STATI_ANNULLATI.has(a.stato)) {
        tipo = "consulente_annullamento";
      } else if (ctx.cambi.includes("consulente") && attivo) {
        tipo = "consulente_nuovo";   // l'appuntamento adesso è suo
        chiave = consulente.id;
      } else if ((ctx.cambi.includes("quando") || ctx.cambi.includes("luogo")) && attivo) {
        tipo = "consulente_spostamento";
      }
    }
    if (tipo) {
      const prima = ctx.prima?.data ? { data: String(ctx.prima.data), ora: ctx.prima.ora ?? null } : null;
      const email = emailConsulente(tipo, a, luogo, {
        autore: await nomeDi(admin, ctx.autore),
        prima: tipo === "consulente_spostamento" ? prima : null,
        clienteAvvisato,
        linkCalendario: LINK_CALENDARIO,
      });
      esiti.push(await invia(admin, a, tipo, chiave, emailConsulenteA, email));
    }
  }

  return { id, esiti };
}

/**
 * Il promemoria del giorno prima. Solo se il cliente ha la conferma con i
 * dettagli di adesso, e se l'ha ricevuta con almeno mezza giornata d'anticipo
 * sul promemoria: chi fissa oggi per domani ha appena avuto la conferma.
 */
async function promemoria(admin: any, id: string) {
  const a = await carica(admin, id);
  if (!a || !accese(a) || a.bloccato || a.pubblico || a.stato !== "confermato") return { id, esito: "niente" };
  const emailCliente = emailValida(a.cliente?.email);
  if (!emailCliente) return { id, esito: "cliente senza email" };

  const luogo = luogoAppuntamento(a);
  const base = chiaveAppuntamento(a, luogo);
  const righe = await storico(admin, id);
  const alCliente = comunicazioniAlCliente(righe);
  const ultima = alCliente[alCliente.length - 1] ?? null;
  if (!ultima || ultima.tipo === "cliente_annullamento") return { id, esito: "nessuna conferma" };
  if (baseDellaChiave(ultima.chiave) !== base) {
    // È cambiato qualcosa e il cliente non lo sa ancora: prima i dettagli nuovi.
    return gestisci(admin, id, { evento: "giro", autore: null, cambi: [], prima: null });
  }
  const inizio = new Date(a.inizio).getTime();
  if (new Date(ultima.creato_il).getTime() > inizio - 36 * 3_600_000) return { id, esito: "conferma recente" };

  const annullamenti = alCliente.filter((r) => r.tipo === "cliente_annullamento").length;
  const esito = await invia(admin, a, "cliente_promemoria", `${base}#${annullamenti}`, emailCliente,
    emailPromemoria(a, luogo, new Date()), { replyTo: rispondiA(a) });
  return { id, esiti: [esito] };
}

async function giro(admin: any) {
  const { data, error } = await admin.rpc("appuntamenti_notifiche_giro");
  if (error) throw new Error(`appuntamenti_notifiche_giro: ${error.message}`);
  const lista = (data ?? []) as { appointment_id: string; motivo: string }[];
  const risultati: unknown[] = [];
  for (const r of lista) {
    try {
      risultati.push(r.motivo === "promemoria"
        ? await promemoria(admin, r.appointment_id)
        : await gestisci(admin, r.appointment_id, { evento: "giro", autore: null, cambi: [], prima: null }));
    } catch (e) {
      risultati.push({ id: r.appointment_id, errore: e instanceof Error ? e.message : String(e) });
    }
  }
  return { esaminati: lista.length, risultati };
}

/** Tutte le email di un appuntamento, composte e non mandate. */
async function anteprima(admin: any, id: string) {
  const a = await carica(admin, id);
  if (!a) return { error: "appuntamento non trovato" };
  const luogo: Luogo | null = luogoAppuntamento(a);
  const ctx = { autore: a.creato_da, prima: null, clienteAvvisato: Boolean(emailValida(a.cliente?.email)), linkCalendario: LINK_CALENDARIO };
  return {
    chiave: chiaveAppuntamento(a, luogo),
    luogo,
    rispondi_a: rispondiA(a),
    cliente: emailValida(a.cliente?.email),
    consulente: emailValida(a.consulente?.email),
    email: {
      cliente_conferma: emailConferma(a, luogo),
      cliente_spostamento: emailSpostamento(a, luogo, { data: a.data, ora: "09:00" }),
      cliente_annullamento: emailAnnullamento(a, luogo),
      cliente_promemoria: emailPromemoria(a, luogo, new Date(new Date(a.inizio).getTime() - 24 * 3_600_000)),
      consulente_nuovo: emailConsulente("consulente_nuovo", a, luogo, ctx),
      consulente_spostamento: emailConsulente("consulente_spostamento", a, luogo, { ...ctx, prima: { data: a.data, ora: "09:00" } }),
      consulente_annullamento: emailConsulente("consulente_annullamento", a, luogo, ctx),
    },
    ics: icsCliente(a, luogo, { sequenza: 0 }),
  };
}
