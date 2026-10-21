import { aiRequestHash } from "../_shared/aiRequestGuard.ts";
import type { CantiereDaScegliere, ConfermaAttesa } from "../_shared/botOperativoConferme.ts";
import type { ToolCtx } from "./tools/shared/types.ts";
import { sceltaCantiere, cantiereDalTesto } from "./tools/shared/sceltaCantiere.ts";
import { cantieriInOrdine, cercaCommesseUfficio } from "./tools/shared/cantieriAperti.ts";
import { descriviFattura } from "./tools/ufficio/assegna_fattura.ts";
import { requireSiteAccess } from "./tools/shared/siteAccess.ts";
import { buildInteractivePayload } from "./interactive.ts";
import { isEdileDraftModel, validEdileReview } from "../_shared/edileQuoteDraft.ts";

/** Only messages constructed here are safe to expose, never raw DB errors. */
export class ConfirmationReviewError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "ConfirmationReviewError"; }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined || (typeof value === "number" && !Number.isFinite(value))) throw new Error("invalid_confirmation_data");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function confirmationHash(action: string, args: Record<string, unknown>, media: unknown, cantieri?: CantiereDaScegliere[]): Promise<string> {
  // I cantieri fra cui scegliere fanno parte di ciò che si approva: la scelta non può uscire dall'elenco.
  return aiRequestHash(canonicalJson({ action, args, media: media ?? null, ...(cantieri?.length ? { cantieri } : {}) }));
}

const names: Record<string, string> = {
  crea_rapportino: "Registrare il rapportino", aggiungi_attivita_rapportino: "Aggiungere attività al rapportino",
  registra_presenza: "Registrare la presenza", carica_ddt: "Registrare la bolla", carica_scontrino: "Registrare la spesa",
  segna_fase: "Segnare la fase come completata", assegna_fattura: "Assegnare la fattura alla commessa",
  approva_richiesta: "Gestire la richiesta", invia_pdf_preventivo: "Inviare il preventivo", crea_preventivo_ai: "Creare il preventivo",
  salva_preventivo_bozza: "Salvare le voci approvate del preventivo",
  invia_preventivo_bagno: "Creare il progetto bagno dal modello verificato",
  prepara_preventivo_modello: "Salvare la bozza nel preventivatore dedicato (non inviare PDF)",
  genera_pdf_modello_bagno: "Generare il PDF del modello bagno",
  invia_pdf_modello_bagno: "Inviare il PDF verificato al tuo WhatsApp (non al cliente)",
};
const labels: Record<string, string> = {
  artifact_id: "Ricevuta PDF", progetto_id: "Progetto", modello: "Modello",
  revisione_progetto: "Versione del progetto", revisione_modello: "Versione del modello",
  revisione_preventivo: "Versione del preventivo", quote_id: "Preventivo", quote_numero: "Numero preventivo",
  modulo: "Preventivatore", impronta_preventivo: "Verifica delle voci", impronta_modello: "Verifica del modello",
  documento_verificato: "PDF controllato da te", client_name: "Cliente", items: "Voci approvate",
};

const euro = (n: unknown) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n));
const testo = (v: unknown, max = 120) => {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
const dataIt = (v: unknown) => {
  const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : testo(v, 20);
};
const numeroIt = (n: unknown) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(Number(n));

/**
 * Riepilogo leggibile per le azioni dell'operaio (18/10/2026): prima si
 * vedevano i nomi dei campi e le righe della bolla in JSON, e una bolla lunga
 * superava il limite di WhatsApp e non si poteva confermare. Le righe in più
 * si contano («…e altre 6 righe»): sono salvate tutte, l'ufficio le vede.
 */
function riepilogoOperativo(action: string, args: Record<string, unknown>, voci: number): string[] | null {
  const elenco = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : [];
  const righeElenco = (items: Record<string, unknown>[], unita: string) => {
    const out = items.slice(0, voci).map((r) => {
      const q = typeof r.quantita === "number" ? ` — ${numeroIt(r.quantita)}${r.unita_misura ? ` ${testo(r.unita_misura, 12)}` : ""}` : "";
      return `• ${testo(r.descrizione, 70)}${q}`;
    });
    if (items.length > voci) out.push(`…e altre ${items.length - voci} ${unita}`);
    return out;
  };
  if (action === "carica_ddt") {
    const righe = elenco(args.righe);
    const intestazione = [`Bolla n. ${testo(args.numero_ddt, 40)}`, args.data_ddt ? `del ${dataIt(args.data_ddt)}` : ""].filter(Boolean).join(" ");
    return [intestazione, `Fornitore: ${testo(args.fornitore, 80)}`,
      ...(righe.length ? [`Articoli (${righe.length}):`, ...righeElenco(righe, "righe")] : ["Articoli: non letti, li completa l'ufficio"]),
      ...(args.note ? [`Note: ${testo(args.note)}`] : [])];
  }
  if (action === "crea_rapportino") {
    const attivita = Array.isArray(args.attivita) ? args.attivita.map((a) => String(a)) : [];
    const materiali = elenco(args.materiali_usati);
    const ore = typeof args.ore_lavorate === "number" ? `${numeroIt(args.ore_lavorate)} h` : "non indicate";
    const extra = typeof args.ore_straordinario === "number" && args.ore_straordinario > 0 ? ` + ${numeroIt(args.ore_straordinario)} h di straordinario` : "";
    return [`Rapportino del ${dataIt(args.data_lavoro)}`, `Ore: ${ore}${extra}`,
      ...(attivita.length ? ["Lavori:", ...attivita.slice(0, voci).map((a) => `• ${testo(a, 90)}`), ...(attivita.length > voci ? [`…e altri ${attivita.length - voci} lavori`] : [])] : []),
      ...(materiali.length ? ["Materiali usati:", ...righeElenco(materiali, "materiali")] : []),
      ...(args.meteo && args.meteo !== "non_specificato" ? [`Meteo: ${testo(args.meteo, 20)}`] : []),
      ...(args.note ? [`Note: ${testo(args.note)}`] : [])];
  }
  if (action === "carica_scontrino") {
    return [`Spesa di ${euro(args.importo)}`, ...(args.esercente ? [`Negozio: ${testo(args.esercente, 80)}`] : []),
      `Data: ${dataIt(args.data)}`,
      ...(args.pagato_da === "operaio" ? ["Pagato da te: te lo rimborsano dopo la verifica"] : args.pagato_da === "azienda" ? ["Pagato dall'azienda"] : []),
      ...(args.categoria ? [`Categoria: ${testo(args.categoria, 60)}`] : [])];
  }
  if (action === "segna_fase") return [`Fase: ${testo(args.fase, 80)} → completata`];
  if (action === "assegna_fattura") return [testo(args.fattura, 300)];
  if (action === "registra_presenza") {
    const tipi: Record<string, string> = { entrata: "Entrata", uscita: "Uscita", inizio_pausa: "Inizio pausa", fine_pausa: "Fine pausa" };
    return [`${tipi[String(args.tipo)] ?? testo(args.tipo, 20)} alle ${testo(args.ora, 5)} del ${dataIt(args.data_evento)}`,
      ...(args.note ? [`Note: ${testo(args.note)}`] : [])];
  }
  return null;
}

/** Riepilogo dell'operaio dentro il limite di WhatsApp, riducendo solo le righe dell'elenco. */
export function riepilogoConCantiere(action: string, args: Record<string, unknown>, coda: string[], chiusura: string): string | null {
  for (const voci of [6, 4, 2, 0]) {
    const righe = riepilogoOperativo(action, args, voci);
    if (!righe) return null;
    const testoFinale = [names[action] ?? action, ...righe, ...coda].join("\n") + `\n\n${chiusura}`;
    if (testoFinale.length <= 1024) return testoFinale;
  }
  throw new ConfirmationReviewError("confirmation_requires_app", "Il riepilogo è troppo lungo per WhatsApp: completalo dall'app.");
}

/** Complete preview, never a silently truncated approval. */
export function confirmationPreview(action: string, args: Record<string, unknown>, siteName?: string, media?: ToolCtx["mediaCorrente"], quoteReview?: Record<string, unknown>, oggettoRichiesta?: string | null): string {
  if (action === "approva_richiesta") {
    const esito = args.esito === "rifiutata" ? "Rifiutare (chiudere senza intervento)" : "Approvare (segnare come risolta)";
    const righe = [names[action] ?? "Gestire la richiesta",
      `Segnalazione: ${oggettoRichiesta ? testo(oggettoRichiesta, 300) : "segnalazione dal cantiere"}`,
      `Cosa faccio: ${esito}`];
    if (args.note) righe.push(`Note: ${testo(args.note)}`);
    righe.push("", "Confermi?");
    return righe.join("\n");
  }
  if (action === "prepara_preventivo_modello" && quoteReview) {
    const money = (n: unknown) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(n));
    const items = quoteReview.voci_da_mostrare as Record<string, unknown>[];
    const lines = [names[action], `Cliente: ${String(quoteReview.cliente ?? "Da completare nell’app")}`,
      `Modello: ${String(args.modulo)}/${String(args.modello)}`, `Preventivo: ${String(quoteReview.quote_number ?? args.quote_id)}`];
    for (const [i, item] of items.entries()) {
      const text = typeof item.description === "string" && item.description.trim() ? item.description : item.name;
      lines.push(`${i + 1}. ${String(text)} — ${String(item.quantity)} ${String(item.unit_of_measure ?? "corpo")} × ${money(item.unit_price)}; IVA ${String(item.vat_rate)}%`);
    }
    lines.push(`Totale: ${money(quoteReview.totale)}`, "Dati tecnici, condizioni e PDF da verificare nell’app. Nessun documento inviato.", "Confermi questa bozza?");
    const preview = lines.join("\n");
    // A partial list must never be presented as the complete approved computo.
    if (preview.length > 1024) throw new ConfirmationReviewError("confirmation_requires_app", "Computo troppo lungo per una conferma WhatsApp completa: verifica e salva nell’app.");
    return preview;
  }
  const coda = [...(siteName ? [`${action === "assegna_fattura" ? "Commessa" : "Cantiere"}: ${siteName}`] : []), ...(media ? ["Foto allegata"] : [])];
  const leggibile = riepilogoConCantiere(action, args, coda, "Confermi?");
  if (leggibile) return leggibile;
  const lines = [names[action] ?? action.replace(/_/g, " ")];
  for (const [key, value] of Object.entries(args)) {
    if (key === "order_id" && siteName) lines.push(`Cantiere: ${siteName} (${String(value).slice(0, 8)})`);
    else lines.push(`${labels[key] ?? key.replace(/_/g, " ")}: ${typeof value === "boolean" ? (value ? "Sì" : "No") : typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  if (media) lines.push(`Allegato: ${media.storagePath.split("/").pop()}`);
  const preview = lines.join("\n") + "\n\nConfermi questi dati?";
  if (preview.length > 1024) throw new Error("confirmation_preview_too_long");
  return preview;
}

export async function freezeConfirmation(ctx: ToolCtx, action: string, input: Record<string, unknown>, sourceMessageId: string, now = new Date()) {
  const args = JSON.parse(canonicalJson(input)) as Record<string, unknown>;
  let quoteReview: Record<string, unknown> | undefined;
  if (action === "prepara_preventivo_modello") {
    if (!ctx.user_id || !["admin", "ufficio"].includes(ctx.kind) || !isEdileDraftModel(args.modulo, args.modello) || typeof args.quote_id !== "string") {
      throw new ConfirmationReviewError("confirmation_not_available", "Preventivatore non disponibile per questa conferma.");
    }
    const { data, error } = await ctx.supabase.rpc("whatsapp_review_edile_quote", {
      p_company_id: ctx.company_id, p_user_id: ctx.user_id, p_quote_id: args.quote_id,
      p_module: args.modulo, p_model_id: args.modello,
    });
    if (error || !validEdileReview(data, ctx.company_id, args.quote_id, args.modulo, String(args.modello))) {
      throw new ConfirmationReviewError("confirmation_review_unavailable", "Non posso verificare tutte le voci: apri il preventivatore nell’app. Nessuna bozza creata.");
    }
    if (data.revisione_modello !== args.revisione_modello || data.revisione_preventivo !== args.revisione_preventivo ||
      data.impronta_preventivo !== args.impronta_preventivo || data.impronta_modello !== args.impronta_modello) {
      throw new ConfirmationReviewError("confirmation_source_changed", "Voci o modello cambiati: ripeti la verifica prima di chiedere conferma.");
    }
    quoteReview = data;
  }
  if (action === "carica_ddt") delete args.media_url;
  if (action === "carica_scontrino" && ctx.kind === "operaio" && args.pagato_da !== "operaio" && args.pagato_da !== "azienda") {
    throw new ConfirmationReviewError("pagato_da_mancante", "Prima chiedi all'operaio chi l'ha pagato: lui (gli va rimborsato) o l'azienda (carta o conto).");
  }
  let siteName: string | undefined;
  let cantieri: CantiereDaScegliere[] | undefined;
  let motivoCantiere: string | null = null;
  // La fattura: descritta dal database, e la commessa cercata fra tutte quelle
  // dell'azienda, anche chiuse (una fattura arriva spesso a lavori finiti).
  if (action === "assegna_fattura") {
    const tipo = args.tipo === "ricevuta" || args.tipo === "emessa" ? args.tipo : null;
    const descrizione = tipo && typeof args.fattura_id === "string" ? await descriviFattura(ctx, tipo, args.fattura_id) : null;
    if (!descrizione) throw new ConfirmationReviewError("fattura_non_trovata", "Non trovo questa fattura: cercala di nuovo per numero, fornitore o cliente.");
    args.fattura = descrizione;
    if (!args.order_id) {
      const hint = typeof args.cantiere_hint === "string" ? args.cantiere_hint.trim() : "";
      if (hint.length < 2) throw new ConfirmationReviewError("commessa_mancante", "Su quale commessa la metto? Scrivimi il cliente, l'indirizzo o il codice.");
      const trovate = await cantieriInOrdine(ctx, await cercaCommesseUfficio(ctx, hint, now, { ancheChiuse: true }), now);
      if (trovate.length === 0) throw new ConfirmationReviewError("commessa_non_trovata", `Non trovo commesse per «${hint}». Prova col cognome del cliente, l'indirizzo o il codice.`);
      cantieri = trovate.slice(0, MAX_CANTIERI_IN_ELENCO).map(({ id, titolo, dettaglio }) => ({ id, titolo, dettaglio }));
      if (trovate.length === 1) { args.order_id = trovate[0].id; motivoCantiere = "come mi hai scritto"; }
      delete args.cantiere_hint;
    }
  } else if (AZIONI_CON_CANTIERE.has(action) && !args.order_id) {
    // L'operaio non deve conoscere il codice: si propone il cantiere più
    // probabile, oppure si offre l'elenco dei suoi cantieri aperti (18/10/2026).
    const hint = args.cantiere_hint ?? args.cantiere;
    const str = (v: unknown) => typeof v === "string" && v.trim() ? v : null;
    const scelta = await sceltaCantiere(ctx, {
      hint: str(hint),
      signals: action === "carica_ddt"
        ? { indirizzo: str(args.indirizzo_consegna), fornitore: str(args.fornitore), riferimento_ordine: str(args.riferimento_ordine) }
        : undefined,
    }, now);
    cantieri = scelta.candidati.slice(0, MAX_CANTIERI_IN_ELENCO).map(({ id, titolo, dettaglio }) => ({ id, titolo, dettaglio }));
    if (scelta.proposto) {
      args.order_id = scelta.proposto.id;
      motivoCantiere = scelta.proposto.motivo;
      if (!cantieri.some((c) => c.id === scelta.proposto!.id)) {
        cantieri = [{ id: scelta.proposto.id, titolo: scelta.proposto.titolo, dettaglio: scelta.proposto.dettaglio }, ...cantieri].slice(0, MAX_CANTIERI_IN_ELENCO);
      }
    } else if (cantieri.length === 0 && (action !== "carica_scontrino" || ctx.kind === "operaio")) {
      throw new ConfirmationReviewError("site_missing",
        "Non risulti su nessun cantiere aperto, quindi non so dove metterlo. Chiedi all'ufficio di aggiungerti alla squadra della commessa, poi rimandami il messaggio.");
    }
    if (args.order_id || cantieri.length > 0) {
      delete args.cantiere_hint;
      delete args.cantiere;
    }
    if (cantieri.length === 0) cantieri = undefined;
  }
  // «Sono arrivato»: l'entrata va sul cantiere se è chiaro quale (18/10/2026).
  // Non è obbligatorio: senza un cantiere probabile si timbra lo stesso.
  if (action === "registra_presenza" && args.tipo === "entrata" && !args.order_id) {
    const scelta = await sceltaCantiere(ctx, {}, now).catch((): null => null);
    if (scelta?.proposto) {
      args.order_id = scelta.proposto.id;
      motivoCantiere = scelta.proposto.motivo;
      cantieri = scelta.candidati.slice(0, MAX_CANTIERI_IN_ELENCO).map(({ id, titolo, dettaglio }) => ({ id, titolo, dettaglio }));
      if (!cantieri.some((c) => c.id === scelta.proposto!.id)) cantieri.unshift({ id: scelta.proposto.id, titolo: scelta.proposto.titolo, dettaglio: scelta.proposto.dettaglio });
      cantieri = cantieri.slice(0, MAX_CANTIERI_IN_ELENCO);
    }
  }
  if (args.order_id) {
    await requireSiteAccess(ctx, String(args.order_id));
    const { data, error } = await ctx.supabase.from("orders").select("id, description, order_code, client_name, indirizzo_lavori")
      .eq("id", args.order_id).eq("company_id", ctx.company_id).maybeSingle();
    if (error || !data) throw new Error("Cantiere non disponibile per la conferma.");
    const nome = data.client_name || data.description || data.order_code || "Cantiere";
    const codice = data.order_code && data.order_code !== nome ? ` · ${data.order_code}` : "";
    siteName = [nome, data.indirizzo_lavori].filter(Boolean).join(" — ") + codice + (motivoCantiere ? ` (${motivoCantiere})` : "");
  }
  // Approvazioni: il titolare deve vedere l'OGGETTO della segnalazione, non il
  // suo codice. Lo recuperiamo qui e lo passiamo alla preview, come il siteName.
  let oggettoRichiesta: string | null = null;
  if (action === "approva_richiesta" && typeof args.richiesta_id === "string") {
    const { data: tk } = await ctx.supabase.from("tickets")
      .select("subject").eq("id", args.richiesta_id).eq("company_id", ctx.company_id).eq("fonte", "campo").maybeSingle();
    oggettoRichiesta = (tk?.subject as string | undefined)?.trim() || null;
  }
  if (action === "crea_rapportino" && !args.data_lavoro) {
    args.data_lavoro = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
  }
  if (action === "carica_scontrino" && !args.data) args.data = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
  if (action === "registra_presenza") {
    args.ora ??= now.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
    args.data_evento = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
  }
  const media = ctx.mediaCorrente ?? null;
  const pending: ConfermaAttesa = {
    azione: action, proposta_id: null, chiesta_il: now.toISOString(), numero_id: ctx.waNumberId,
    id: crypto.randomUUID(), parametri: args, media, source_message_id: sourceMessageId,
    payload_hash: await confirmationHash(action, args, media, cantieri),
    ...(cantieri ? { cantieri } : {}),
  };
  // Cantiere da scegliere: l'elenco stesso è la domanda, toccare un cantiere conferma.
  if (!args.order_id && cantieri?.length) {
    return { pending: { ...pending, lista_mostrata: true }, interactive: elencoCantieri(pending,
      riepilogoConCantiere(action, args, media ? ["Foto allegata"] : [], "Su quale cantiere? Scegli dall'elenco: la scelta vale come conferma.")
        ?? confirmationPreview(action, args, undefined, media, quoteReview)) };
  }
  // Preventivo (18/10/2026): tutte le voci, anche quando sono tante. Se non
  // stanno nei 1024 caratteri dei bottoni, l'elenco completo parte prima come
  // testo e i bottoni riassumono cliente, numero di voci e totale. L'impronta
  // copre le voci esatte: si approva proprio quell'elenco.
  if (action === "salva_preventivo_bozza") {
    const r = riepilogoPreventivo(args);
    const completo = [r.intestazione, ...r.righe, r.totali, "", "Salvo questa bozza? Nulla viene inviato al cliente."].join("\n");
    const bottoni = [{ id: `approve:${pending.id}`, title: "Sì, salva" }, { id: `reject:${pending.id}`, title: "No" }];
    if (completo.length <= 1024) return { pending, interactive: buildInteractivePayload(completo, bottoni) };
    return {
      pending,
      preambolo: aPezzi([r.intestazione, ...r.righe, r.totali], 3500),
      interactive: buildInteractivePayload(
        `Salvo la bozza per ${r.cliente}: ${r.numero} voci (le trovi qui sopra), ${r.totaliBrevi}. Nulla viene inviato al cliente.`, bottoni),
    };
  }
  const preview = confirmationPreview(action, args, siteName, media, quoteReview, oggettoRichiesta);
  const altri = (cantieri ?? []).filter((c) => c.id !== args.order_id);
  return { pending, interactive: buildInteractivePayload(preview, [
    { id: `approve:${pending.id}`, title: "Sì" },
    ...(altri.length > 0 ? [{ id: `other:${pending.id}`, title: "Altro cantiere" }] : []),
    { id: `reject:${pending.id}`, title: "No" },
  ]) };
}

/** Le azioni che vanno su un cantiere. */
export const AZIONI_CON_CANTIERE = new Set(["crea_rapportino", "carica_ddt", "carica_scontrino", "segna_fase", "assegna_fattura"]);
/** Nove cantieri più la riga «Annulla»: il massimo di una lista WhatsApp è dieci. */
export const MAX_CANTIERI_IN_ELENCO = 9;

/** L'elenco dei cantieri da toccare, con «Annulla» in fondo. */
export function elencoCantieri(pending: ConfermaAttesa, domanda: string) {
  const cantieri = (pending.cantieri ?? []).slice(0, MAX_CANTIERI_IN_ELENCO);
  const righe = cantieri.map((c, i) => ({
    id: `site:${pending.id}:${i}`, title: c.titolo, description: c.dettaglio,
  }));
  // Con due cantieri escono i bottoni, che mostrano solo il codice: i nomi
  // stanno nel testo, numerati (si può anche rispondere «2»).
  const nomi = cantieri.map((c, i) => `${i + 1}. ${c.titolo}${c.dettaglio ? ` · ${c.dettaglio}` : ""}`).join("\n");
  const testo = `${domanda}\n\n${nomi}`.slice(0, 1024);
  return buildInteractivePayload(testo, [...righe, { id: `reject:${pending.id}`, title: "Annulla" }], "Scegli cantiere");
}

export type RispostaCantiere = { tipo: "cantiere"; order_id: string } | { tipo: "altro" } | null;

/**
 * La risposta è la scelta di un cantiere? Dal tocco sull'elenco, dal bottone
 * «Altro cantiere», oppure scritta («2», «Rossi») quando l'elenco è già stato mostrato.
 */
export function rispostaCantiere(pending: ConfermaAttesa | null, metadata: unknown, messageType: string, testoRisposta: string): RispostaCantiere {
  if (!pending?.id || !pending.cantieri?.length) return null;
  if (messageType === "interactive") {
    const record = metadata as { interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } } } | null;
    const id = record?.interactive?.button_reply?.id ?? record?.interactive?.list_reply?.id ?? "";
    if (id === `other:${pending.id}`) return { tipo: "altro" };
    const m = id.match(/^site:([^:]+):(\d+)$/);
    if (m && m[1] === pending.id) {
      const c = pending.cantieri[Number(m[2])];
      return c ? { tipo: "cantiere", order_id: c.id } : null;
    }
    return null;
  }
  const t = testoRisposta.trim().toLowerCase();
  if (/^altro( cantiere)?$/.test(t)) return { tipo: "altro" };
  if (!pending.lista_mostrata) return null;
  const scelto = cantiereDalTesto(testoRisposta, pending.cantieri);
  return scelto ? { tipo: "cantiere", order_id: scelto } : null;
}

export function confirmationReplyMatches(pending: ConfermaAttesa | null, metadata: unknown, messageType: string): boolean {
  if (messageType !== "interactive") return true;
  const record = metadata as { interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } } } | null;
  const id = record?.interactive?.button_reply?.id ?? record?.interactive?.list_reply?.id;
  return !!pending?.id && (id === `approve:${pending.id}` || id === `reject:${pending.id}`
    || id === `other:${pending.id}` || (id ?? "").startsWith(`site:${pending.id}:`));
}

export async function frozenConfirmationValid(pending: ConfermaAttesa): Promise<boolean> {
  return !!pending.azione && !!pending.parametri && !!pending.payload_hash
    && pending.payload_hash === await confirmationHash(pending.azione, pending.parametri, pending.media, pending.cantieri);
}

/** Il preventivo da salvare, in righe leggibili: «3. Piastrelle 60x60 — 6 mq × € 35,00». */
export function riepilogoPreventivo(args: Record<string, unknown>) {
  const voci = Array.isArray(args.items) ? args.items.filter((v) => v && typeof v === "object") as Record<string, unknown>[] : [];
  const cliente = testo(args.client_name ?? args.cliente ?? "cliente", 80);
  let imponibile = 0;
  let iva = 0;
  const righe = voci.map((v, i) => {
    const q = Number(v.quantity ?? 1);
    const prezzo = Number(v.unit_price ?? 0);
    const aliquota = Number(v.vat_rate ?? 0);
    const riga = (Number.isFinite(q) ? q : 0) * (Number.isFinite(prezzo) ? prezzo : 0);
    imponibile += riga;
    iva += riga * (Number.isFinite(aliquota) ? aliquota : 0) / 100;
    const nome = testo(v.name ?? v.description ?? "voce", 70);
    return `${i + 1}. ${nome} — ${numeroIt(q)} ${testo(v.unit_of_measure ?? "pz", 10)} × ${euro(prezzo)}`;
  });
  const aliquote = [...new Set(voci.map((v) => Number(v.vat_rate ?? 0)))];
  const ivaTesto = aliquote.length === 1 ? `IVA ${numeroIt(aliquote[0])}%` : "IVA";
  return {
    cliente,
    numero: voci.length,
    intestazione: `Bozza di preventivo per ${cliente}${args.title ? ` — ${testo(args.title, 80)}` : ""}`,
    righe,
    totali: `Imponibile ${euro(imponibile)} · ${ivaTesto} ${euro(iva)} · Totale ${euro(imponibile + iva)}`,
    totaliBrevi: `imponibile ${euro(imponibile)}, totale ${euro(imponibile + iva)} IVA inclusa`,
  };
}

/** Testo diviso in messaggi da al massimo `max` caratteri, senza spezzare le righe. */
export function aPezzi(righe: string[], max: number): string[] {
  const pezzi: string[] = [];
  let corrente = "";
  for (const r of righe) {
    if (corrente && corrente.length + r.length + 1 > max) { pezzi.push(corrente); corrente = ""; }
    corrente = corrente ? `${corrente}\n${r}` : r;
  }
  if (corrente) pezzi.push(corrente);
  return pezzi;
}
