import type { DdtLetto } from "../_shared/ddtLetto.ts";
import {
  cercaDestinazione, conParole, datiBolla, descriviCommessa, idWhatsAppValido, IN_LAVORAZIONE,
  leggiDestinazioneBolla, magazziniPerBolla, type Bolla, type DomandaDestinazioneBolla, type SceltaDestinazioneBolla,
} from "./bolleInConversazione.ts";
import { messaggiInAttesa, primoMessaggioInAttesa, type MessaggioInAttesa } from "./codaConversazione.ts";
import { avviaLetturaBolla } from "./letturaBollaInCoda.ts";
import { leggiDocumentoOperativo, leggiFotoOperativa, scaricaMediaDelMessaggio } from "./media.ts";
import { paginaDiBolla } from "./pagineBolla.ts";
import { commesseAperte, oggiARoma } from "./tools/shared/cantieriAperti.ts";
import { resolveCantiere } from "./tools/shared/resolve_cantiere.ts";
import { requireSiteAccess } from "./tools/shared/siteAccess.ts";
import type { ToolCtx } from "./tools/shared/types.ts";

const LIMITE_INVIO = 40;
const DISTANZA_ALLEGATI_MS = 12_000;
const ATTESA_ALLEGATI_MS = 1_500;
const TEMPO_SCELTA_MS = 2 * 60 * 60_000;
const ANTEPRIMA = "prelettura_per_invio_bolle";
const ACQUISITO = "bolla_per_invio";

type Arrivo = Pick<MessaggioInAttesa, "id" | "wa_message_id" | "content_text" | "created_at" | "ai_extracted_data" | "metadata">;
type Allegato = { id: string; provider: string | null; speditaIl?: string };
type Origine = Allegato & { duplicata: boolean };
type Assegnazione = { scelta: SceltaDestinazioneBolla; vocaleId?: string; entro?: string };
export type InvioBolle = {
  id: string;
  origini: Origine[];
  didascalia: string;
  ultimaRicezione: string;
  daRimandare?: Allegato[];
  assegnazione?: Assegnazione;
  pdf?: true;
  singola?: true;
};
type DestinazioneDetta = NonNullable<ReturnType<typeof leggiDestinazioneBolla>>;
type BollaAperta = Pick<Bolla, "id" | "result">;
export type EsitoInvioBolle = string | DomandaDestinazioneBolla | { messaggio: string; bollaId: string };

function conversazione(ctx: ToolCtx) {
  return { company_id: ctx.company_id, wa_number_id: ctx.waNumberId, from_phone: ctx.phone };
}

function messaggi(ctx: ToolCtx) {
  return ctx.supabase.from("whatsapp_messages").select("id, ai_extracted_data, created_at")
    .eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone).eq("direction", "inbound");
}

function aggiornaMessaggi(ctx: ToolCtx, valori: Record<string, unknown>) {
  return ctx.supabase.from("whatsapp_messages").update(valori)
    .eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone).eq("direction", "inbound");
}

function estrazione(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function oraSpedizione(v: unknown): string | undefined {
  return typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : undefined;
}

function allegatoDi(m: Arrivo): Allegato {
  const speditaIl = oraSpedizione(m.metadata?.sent_at);
  return { id: m.id, provider: m.wa_message_id, ...(speditaIl ? { speditaIl } : {}) };
}

async function salvaInvio(ctx: ToolCtx, invio: InvioBolle) {
  const { data, error } = await ctx.supabase.rpc("ddt_whatsapp_memorizza_invio", {
    p_company: ctx.company_id, p_numero: ctx.waNumberId, p_mittente: ctx.phone,
    p_utente: ctx.user_id, p_dipendente: ctx.employee_id ?? null, p_invio: invio,
  });
  if (error || data !== true) throw new Error("invio_bolle_non_salvato");
}

function normalizzaIndicazioneInvio(testo: string): string {
  return testo.trim().replace(/^(confermo\s+)?(?:tutt[ei]\s+)?(?:quest[ei]|le|i)\s+(?:foto|bolle|ddt|documenti)\s+(?:sono|vanno)(?:\s+tutt[ei])?\s+/i, "$1Tutte ");
}

export function messaggioPerTutteLeBolle(testo: string): boolean {
  return /^(?:confermo\s+)?(?:sono\s+)?tutt[ei]\s+(?:(?:sono|vanno|per|al|alla|nel|nella|in|a|sul|sulla)\b|(?:(?:le|i|queste|questi)\s+)?(?:foto|bolle|ddt|documenti)\b)/i.test(normalizzaIndicazioneInvio(testo)) &&
    !/\b(?:ore|rapportin[oi]|scontrin[oi])\b/i.test(testo);
}

export function destinazioneDettaPerInvio(testo: string): DestinazioneDetta | null {
  if (!messaggioPerTutteLeBolle(testo) || /\b(?:tranne|eccetto|esclus[aeio]|invece|divers[ei])\b/i.test(testo)) return null;
  const m = normalizzaIndicazioneInvio(testo).match(/^(confermo\s+)?(?:sono\s+)?tutt[ei](?:\s+(?:(?:le|i|queste|questi)\s+)?(?:foto|bolle|ddt|documenti))?(?:\s+(?:vanno|sono))?\s+(?:(?:per|al|alla|nel|nella|in|a|sul|sulla)\s+)?(.+?)\s*[.!]?$/i);
  return m ? leggiDestinazioneBolla(`${m[1] ?? ""}per ${m[2]}`, false, true) : null;
}

function allegatoVicino(m: MessaggioInAttesa, prima: Arrivo) {
  const distanza = Date.parse(m.created_at) - Date.parse(prima.created_at);
  const mime = m.metadata?.mime_type ?? "";
  return distanza >= 0 && distanza <= DISTANZA_ALLEGATI_MS && !m.metadata?.reply_to &&
    (m.message_type === "image" || (m.message_type === "document" && (!mime || /^(application\/pdf|image\/)/i.test(mime)))) &&
    !paginaDiBolla(m.content_text ?? "") &&
    (!leggiDestinazioneBolla(m.content_text ?? "", true) || messaggioPerTutteLeBolle(m.content_text ?? ""));
}

/** Gli allegati diversi dalle bolle riprendono il loro flusso quando arriva il loro turno. */
export function preletturaInvio(dati: unknown) {
  const lettura = estrazione(dati)[ANTEPRIMA];
  return isPlainRecord(lettura) && typeof lettura.testo === "string" ? lettura as {
    testo: string; scontrino?: DdtLetto;
  } : null;
}

async function acquisisciAllegato(ctx: ToolCtx, m: MessaggioInAttesa): Promise<Origine | "da_rimandare" | null> {
  const dati = estrazione(m.ai_extracted_data);
  const precedente = dati[ACQUISITO];
  if (isPlainRecord(precedente) && typeof precedente.duplicata === "boolean") {
    return { ...allegatoDi(m), duplicata: precedente.duplicata };
  }
  if (preletturaInvio(dati)) return null;
  const originale = await scaricaMediaDelMessaggio(ctx.supabase, { ...m, ...conversazione(ctx) }).catch(() => null);
  if (!originale) return "da_rimandare";
  const letto: { bolla?: { id: string; stato?: string }; duplicata: boolean; scontrino?: DdtLetto } = { duplicata: false };
  const opts: Parameters<typeof leggiFotoOperativa>[1] = {
    companyId: ctx.company_id, userId: ctx.user_id, employeeId: ctx.employee_id, acquisizioneConsentita: true,
    didascalia: m.content_text, storagePath: originale.storagePath, file: originale.file, messageId: m.id,
    ricordaBolla: (id, stato) => { letto.bolla = { id, stato }; },
    ricordaBollaDuplicata: () => { letto.duplicata = true; },
    ricordaScontrino: rilevato => { letto.scontrino = rilevato; },
  };
  const testo = m.message_type === "image" ? await leggiFotoOperativa(ctx.supabase, opts)
    : await leggiDocumentoOperativo(ctx.supabase, { ...opts, mime: m.metadata?.mime_type ?? "application/pdf" });
  const { bolla, duplicata, scontrino } = letto;
  if (bolla?.stato === "queued" && !duplicata) avviaLetturaBolla(bolla.id);
  const riconosciuta = !!bolla || duplicata;
  const nuoviDati = riconosciuta
    ? { [ACQUISITO]: { duplicata }, ...(bolla ? { ddt_job_id: bolla.id } : {}) }
    : { [ANTEPRIMA]: { testo, ...(scontrino ? { scontrino } : {}) } };
  const { error } = await aggiornaMessaggi(ctx, {
    ai_extracted_data: { ...dati, ...nuoviDati, testo_per_assistente: testo },
    ...(riconosciuta ? { ai_intent: "ddt" } : {}),
  }).eq("id", m.id).eq("processing_status", "received");
  if (error) throw new Error("acquisizione_invio_non_confermata");
  return riconosciuta ? { ...allegatoDi(m), duplicata } : null;
}

function leggiInvio(row: { id: string; ai_extracted_data: unknown; created_at: string } | null): InvioBolle | null {
  if (!row || Date.now() - Date.parse(row.created_at) > TEMPO_SCELTA_MS) return null;
  const d = estrazione(row.ai_extracted_data).ddt_invio;
  if (!isPlainRecord(d) || typeof d.didascalia !== "string" || typeof d.ultimaRicezione !== "string" ||
    !Array.isArray(d.origini) || d.origini.length < 1 || d.origini.length > LIMITE_INVIO ||
    d.origini[0]?.id !== row.id || d.origini.some(o => !isPlainRecord(o) || !idWhatsAppValido(o.id) || typeof o.duplicata !== "boolean")) return null;
  const a = d.assegnazione;
  const scelta = isPlainRecord(a) ? a.scelta : null;
  const assegnazione = isPlainRecord(a) && isPlainRecord(scelta) && idWhatsAppValido(scelta.id) &&
    (scelta.tipo === "cantiere" || scelta.tipo === "magazzino")
    ? { scelta: { tipo: scelta.tipo, id: scelta.id } as SceltaDestinazioneBolla,
        ...(idWhatsAppValido(a.vocaleId) ? { vocaleId: a.vocaleId } : {}), entro: oraSpedizione(a.entro) } : undefined;
  const daRimandare = Array.isArray(d.daRimandare) ? d.daRimandare.filter(m => isPlainRecord(m) && idWhatsAppValido(m.id)) as Allegato[] : [];
  return { id: row.id, origini: d.origini as Origine[], didascalia: d.didascalia, ultimaRicezione: d.ultimaRicezione, daRimandare,
    ...(assegnazione ? { assegnazione } : {}), ...(d.pdf === true ? { pdf: true } : {}), ...(d.singola === true ? { singola: true } : {}) };
}

async function chiudiAllegati(ctx: ToolCtx, invio: InvioBolle) {
  if (invio.origini.length < 2) return;
  const { error } = await aggiornaMessaggi(ctx, {
    processing_status: "processed", processing_error: null, processed_at: new Date().toISOString(),
  }).in("id", invio.origini.slice(1).map(o => o.id)).eq("processing_status", "received");
  if (error) throw new Error("coda_invio_non_aggiornata");
}

/** La conversazione è già in carico al chiamante. La composizione salvata precede la chiusura degli allegati. */
export async function raccogliInvioBolle(ctx: ToolCtx, primo: Arrivo, duplicata: boolean, pdf = false): Promise<InvioBolle | null> {
  const esistente = leggiInvio(primo);
  if (esistente) {
    await chiudiAllegati(ctx, esistente);
    return esistente;
  }
  const sceltaSingola = leggiDestinazioneBolla(primo.content_text ?? "", true) && !messaggioPerTutteLeBolle(primo.content_text ?? "");
  if (sceltaSingola && !pdf) return null;
  const c = conversazione(ctx);
  const altri: MessaggioInAttesa[] = [];
  const origini: Origine[] = [{ ...allegatoDi(primo), duplicata }];
  const daRimandare: Allegato[] = [];
  const esaminati = new Set<string>();
  let attesoDopo: string | undefined;
  while (!sceltaSingola && altri.length < LIMITE_INVIO - 1) {
    const inAttesa = (await messaggiInAttesa(ctx.supabase, c, LIMITE_INVIO)).filter(m => !esaminati.has(m.id));
    const ultimo = altri.at(-1) ?? primo;
    if (inAttesa.length === 0) {
      const attesa = Math.min(ATTESA_ALLEGATI_MS, Date.parse(ultimo.created_at) + ATTESA_ALLEGATI_MS - Date.now());
      if (!(attesa > 0) || attesoDopo === ultimo.id) break;
      attesoDopo = ultimo.id;
      await new Promise<void>(resolve => setTimeout(resolve, attesa));
      continue;
    }
    const blocco: MessaggioInAttesa[] = [];
    for (const m of inAttesa.slice(0, Math.min(3, LIMITE_INVIO - 1 - altri.length))) {
      if (!allegatoVicino(m, blocco.at(-1) ?? ultimo)) break;
      blocco.push(m);
    }
    if (!blocco.length) break;
    for (const m of blocco) esaminati.add(m.id);
    altri.push(...blocco);
    // In caso di errore il singolo allegato rimane in coda con il suo originale.
    const risultati = await Promise.allSettled(blocco.map(m => acquisisciAllegato(ctx, m)));
    for (const [i, esito] of risultati.entries()) {
      if (esito.status !== "fulfilled") continue;
      if (esito.value === "da_rimandare") daRimandare.push(allegatoDi(blocco[i]));
      else if (esito.value) origini.push(esito.value);
    }
  }
  const didascalie = [primo, ...altri].filter(m => origini.some(o => o.id === m.id))
    .map(m => m.content_text ?? "").filter(messaggioPerTutteLeBolle);
  const didascalia = sceltaSingola ? primo.content_text ?? "" : new Set(didascalie).size === 1 ? didascalie[0] : "";
  const invio: InvioBolle = { id: primo.id, origini, didascalia, daRimandare, ultimaRicezione: (altri.at(-1) ?? primo).created_at,
    ...(origini.length === 1 ? (pdf ? { pdf: true } : { singola: true }) : {}) };
  await salvaInvio(ctx, invio);
  await chiudiAllegati(ctx, invio);
  return invio;
}

/** Una foto ricevuta dopo il vocale può essere stata spedita prima. Usiamo quella sequenza o il riferimento esplicito. */
export async function recuperaAllegatoInRitardo(ctx: ToolCtx, m: Arrivo, duplicata: boolean): Promise<boolean> {
  const originale = allegatoDi(m);
  const citazione = m.metadata?.reply_to;
  if (leggiDestinazioneBolla(m.content_text ?? "", true) || (!citazione && !originale.speditaIl)) return false;
  const invii = await inviiRecenti(ctx);
  if (invii.some(i => i.id === m.id)) return false;
  const attimo = Date.parse(originale.speditaIl ?? "");
  const candidati = invii.filter(i => {
    if (citazione) return [...i.origini, ...(i.daRimandare ?? [])].some(o => o.provider === citazione);
    const spedizioni = i.origini.map(o => Date.parse(o.speditaIl ?? "")).filter(Number.isFinite);
    if (!spedizioni.length || !Number.isFinite(attimo)) return false;
    const inizio = Math.min(...spedizioni);
    const fine = Math.max(...spedizioni);
    if (i.assegnazione) {
      const entro = Date.parse(i.assegnazione.entro ?? "");
      return attimo >= inizio - DISTANZA_ALLEGATI_MS && attimo <= entro && fine <= entro && entro - fine <= 180_000;
    }
    return attimo >= inizio && attimo <= fine + DISTANZA_ALLEGATI_MS;
  });
  if (candidati.length !== 1) return false;
  const [invio] = candidati;
  if (invio.origini.length >= LIMITE_INVIO && !invio.origini.some(o => o.id === m.id)) return false;
  if (!citazione && !invio.assegnazione) {
    const { data, error } = await ctx.supabase.from("whatsapp_messages").select("id")
      .eq("company_id", ctx.company_id).eq("wa_number_id", ctx.waNumberId).eq("from_phone", ctx.phone).eq("direction", "inbound")
      .in("message_type", ["text", "audio", "interactive"]).gt("created_at", invio.ultimaRicezione).lte("created_at", m.created_at).limit(1);
    if (error || data?.length) return false;
  }
  const aggiornato: InvioBolle = {
    ...invio, singola: undefined,
    origini: invio.origini.some(o => o.id === m.id) ? invio.origini : [...invio.origini, { ...originale, duplicata }],
    ultimaRicezione: m.created_at > invio.ultimaRicezione ? m.created_at : invio.ultimaRicezione,
    daRimandare: invio.daRimandare?.filter(o => o.id !== m.id && (!citazione || o.provider !== citazione)),
  };
  await salvaInvio(ctx, aggiornato);
  if (aggiornato.assegnazione && !duplicata) {
    await destinaInvioBolle(ctx, { ...aggiornato, origini: [{ ...originale, duplicata }] }, { ...aggiornato.assegnazione, ripresa: true });
  }
  return true;
}

export async function posticipaInvioBolle(ctx: ToolCtx, invio: InvioBolle): Promise<boolean> {
  const prossimo = await primoMessaggioInAttesa(ctx.supabase, conversazione(ctx));
  if (!prossimo || (prossimo.message_type !== "audio" &&
    !(prossimo.message_type === "text" && (messaggioPerTutteLeBolle(prossimo.content_text ?? "") ||
      (invio.pdf && leggiDestinazioneBolla(prossimo.content_text ?? "", false, true)))))) return false;
  const citazione = prossimo.metadata?.reply_to;
  if (citazione ? !invio.origini.some(o => o.provider === citazione)
    : Math.abs(Date.parse(prossimo.created_at) - Date.parse(invio.ultimaRicezione)) > 90_000) return false;
  const { data, error } = await aggiornaMessaggi(ctx, {
    ai_extracted_data: { ...estrazione(prossimo.ai_extracted_data), ddt_invio_attesa: invio.id },
  }).eq("id", prossimo.id).eq("processing_status", "received").select("id").maybeSingle();
  if (error) throw new Error("invio_bolle_in_attesa_non_salvato");
  return !!data;
}

async function inviiRecenti(ctx: ToolCtx): Promise<InvioBolle[]> {
  const { data, error } = await messaggi(ctx)
    .gte("created_at", new Date(Date.now() - TEMPO_SCELTA_MS).toISOString())
    .not("ai_extracted_data->>ddt_invio", "is", null).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error("invii_bolle_non_reperibili");
  return (data ?? []).map(leggiInvio).filter((i): i is InvioBolle => i !== null);
}

export async function cercaInvioBolle(ctx: ToolCtx, id?: string, citazione?: string | null): Promise<InvioBolle | "ambiguo" | null> {
  if (id) {
    const { data, error } = await messaggi(ctx).eq("id", id).maybeSingle();
    if (error) throw new Error("invio_bolle_non_reperibile");
    return leggiInvio(data);
  }
  const candidati = (await inviiRecenti(ctx)).filter(i => !citazione || i.origini.some(o => o.provider === citazione));
  if (candidati.length <= 1) return candidati[0] ?? null;
  const aperti = await Promise.all(candidati.map(async i => (await bolleDellInvio(ctx, i)).length > 0 ? i : null));
  const daDestinare = aperti.filter(i => i !== null);
  return daDestinare.length === 1 ? daDestinare[0] : "ambiguo";
}

async function bolleDellInvio(ctx: ToolCtx, invio: InvioBolle): Promise<BollaAperta[]> {
  const fonti = invio.origini.filter(o => !o.duplicata).map(o => o.id);
  if (!fonti.length) return [];
  const q = ctx.supabase.from("ddt_document_jobs").select("id, result")
    .eq("company_id", ctx.company_id).eq("source", "whatsapp").in("status", IN_LAVORAZIONE)
    .in("source_key", fonti)
    .is("order_id", null).is("warehouse_id", null).is("destinazione", null);
  const { data, error } = await (ctx.user_id ? q.eq("created_by", ctx.user_id) : q.is("created_by", null).eq("employee_id", ctx.employee_id!));
  if (error) throw new Error("bolle_invio_non_reperibili");
  return data ?? [];
}

const contaBolle = (n: number) => n === 1 ? "1 bolla" : `${n} bolle`;

export async function destinaInvioBolle(ctx: ToolCtx, invio: InvioBolle, input: {
  scelta?: SceltaDestinazioneBolla; testo?: string; vocale?: boolean; speditoIl?: string;
  vocaleId?: string; ripresa?: boolean; destinazioneContestuale?: DestinazioneDetta;
} = {}): Promise<EsitoInvioBolle> {
  const aperte = await bolleDellInvio(ctx, invio);
  const duplicati = invio.origini.filter(o => o.duplicata).length;
  const nota = duplicati > 0 ? ` ${contaBolle(duplicati)} già in archivio.` : "";
  if (!aperte.length) return `L’invio è già in DDT → Documenti in ingresso.${nota}`;
  const testo = input.testo ?? invio.didascalia;
  const dette = input.scelta ? null : destinazioneDettaPerInvio(testo) ?? input.destinazioneContestuale ??
    (invio.pdf ? leggiDestinazioneBolla(testo, true, true) : null);
  const domanda = (): DomandaDestinazioneBolla => ({
    invio: true, fotoId: invio.id, etichetta: invio.pdf && aperte.length === 1 ? "il PDF" : contaBolle(aperte.length),
    domandaDestinazione: `Ho salvato ${contaBolle(aperte.length)}.${nota} Rispondi «Tutte per» seguito dal cantiere o dal magazzino.`,
  });
  if (!input.scelta && !dette) return domanda();
  const cantieri = await commesseAperte(ctx);
  const oggi = oggiARoma();
  const siti = input.scelta?.tipo === "magazzino" || dette?.tipo === "magazzino" ? []
    : input.scelta ? cantieri.filter(c => c.id === input.scelta!.id && (!c.work_start_date || c.work_start_date <= oggi))
    : (await cercaDestinazione(ctx, dette!.nome)).candidati.filter(c => !c.work_start_date || c.work_start_date <= oggi);
  const magazzini = input.scelta?.tipo === "cantiere" || dette?.tipo === "cantiere" ? []
    : (await magazziniPerBolla(ctx)).filter(m => input.scelta ? m.id === input.scelta.id : !dette!.nome || conParole(dette!.nome, m.name));
  if (siti.length + magazzini.length !== 1) return domanda();
  const [cantiere] = siti;
  const [magazzino] = magazzini;
  if (cantiere) await requireSiteAccess(ctx, cantiere.id);
  const vocaleId = input.vocaleId ?? (input.vocale && idWhatsAppValido(ctx.requestId) ? ctx.requestId : undefined);
  if (!input.ripresa) {
    const tempi = invio.origini.flatMap(o => o.speditaIl ? [o.speditaIl] : []).sort();
    const entro = oraSpedizione(input.speditoIl) ?? tempi.at(-1);
    await salvaInvio(ctx, { ...invio, assegnazione: { scelta: cantiere
      ? { tipo: "cantiere", id: cantiere.id } : { tipo: "magazzino", id: magazzino.id }, vocaleId, entro } });
  }

  const valori = {
    destinazione: cantiere ? "cantiere" : "magazzino", order_id: cantiere?.id ?? null, warehouse_id: magazzino?.id ?? null,
    ...(vocaleId ? { whatsapp_voice_message_id: vocaleId } : {}),
    updated_at: new Date().toISOString(),
  };
  const collega = async (bolle: BollaAperta[]): Promise<string[]> => {
    const ammesse: string[] = [];
    for (const bolla of bolle) {
      const d = datiBolla(bolla);
      const altroIndirizzo = d.indirizzo && /\d/.test(d.indirizzo)
        ? cantieri.find(c => c.id !== cantiere?.id && c.indirizzo_lavori && conParole(d.indirizzo!, c.indirizzo_lavori)) : null;
      const oda = d.riferimento ? await resolveCantiere(ctx, undefined, { riferimento_ordine: d.riferimento }) : null;
      if (!altroIndirizzo && (!oda || oda.source !== "oda" || oda.cantiere_id === cantiere?.id)) ammesse.push(bolla.id);
    }
    if (!ammesse.length) return [];
    let update = ctx.supabase.from("ddt_document_jobs").update(valori)
      .eq("company_id", ctx.company_id).eq("source", "whatsapp").in("status", IN_LAVORAZIONE).in("id", ammesse)
      .is("order_id", null).is("warehouse_id", null).is("destinazione", null);
    update = ctx.user_id ? update.eq("created_by", ctx.user_id) : update.is("created_by", null).eq("employee_id", ctx.employee_id!);
    const { data, error } = await update.select("id");
    if (error) throw new Error("destinazione_invio_non_salvata");
    return (data ?? []).map(bolla => bolla.id);
  };
  const fatte = await collega(aperte);
  let rimanenti = fatte.length < aperte.length ? await bolleDellInvio(ctx, invio) : [];
  // La divisione può aver sostituito il PDF mentre l’utente sceglieva.
  const sostitute = rimanenti.filter(b => !aperte.some(a => a.id === b.id));
  if (sostitute.length) {
    fatte.push(...await collega(sostitute));
    rimanenti = await bolleDellInvio(ctx, invio);
  }
  const [bollaId] = fatte;
  if (!bollaId) return `Le bolle sono in DDT → Documenti in ingresso. L’ufficio verifica la destinazione.${nota}`;
  const luogo = cantiere ? (!invio.singola && cantiere.order_code) || descriviCommessa(cantiere) : magazzino.name;
  const restano = rimanenti.length;
  return { bollaId, messaggio: `${contaBolle(fatte.length)} per ${luogo} in DDT → Documenti in ingresso.${restano ? ` ${contaBolle(restano)} da verificare.` : ""}${nota}` };
}
