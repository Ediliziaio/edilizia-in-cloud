/**
 * Lettore del preventivo (31/10/2026, fase 1, lotto 1.1): preventivo classico, preventivo
 * con computo e gli 8 preventivatori edili (rst, bagni, tetti, clm, ele, idr, pav, pis).
 *
 * Il firmato è il contratto: si copia, non si stima. Riusa lo stesso conto della creazione
 * della commessa (`prefillDaPreventivo`, che usa anche `useQuotePrefill`) e lo stesso
 * cronoprogramma della pianificazione delle fasi (`pianoDaFasiDelPreventivo`).
 *
 * Cosa legge:
 * - identità: titolo, descrizione, tipo di lavoro, sede, preventivo d'origine;
 * - cliente: nome, recapiti, indirizzo, opportunità;
 * - cantiere: l'indirizzo dei lavori (dal preventivo o dai quattro campi del preventivatore);
 * - economia: imponibile, IVA, righe (solo i materiali), bonus;
 * - pagamenti: modalità e rate, agganciate agli eventi del cantiere;
 * - fasi: dal cronoprogramma del preventivo, o del modello dell'azienda; con il computo,
 *   un capitolo per fase e una voce per sottofase; senza tempi, le lavorazioni come fasi;
 * - persone: responsabile e venditore.
 *
 * Il cliente del gestionale (`customer_id`) non si ricava qui: il preventivo ha il contatto
 * del CRM (`contact_id`), e il cliente lo collega la creazione (lotto 1.4), come fa la
 * pagina della commessa nuova.
 */
import type { FaseDelPiano, Frammento, RataDelPiano } from "../../../../shared/silvio-commessa/piano.ts";
import type { CalendarioCantiere } from "../../../../shared/silvio-commessa/calendario.ts";
import {
  dateDelleFasi, durateDalModello, misuraDalTesto, MODELLI_LAVORO, riconosciTipoLavoro, type TipoLavoro,
} from "../../../../shared/silvio-commessa/modelliLavoro.ts";
import { prefillDaPreventivo } from "@/lib/preventivi/prefillPreventivo";
import { parseQuotePaymentPhases } from "@/lib/preventivi/paymentTerms";
import { leggiPianoPagamento, rateConImporti } from "@/lib/preventivi/pianoPagamento";
import { leggiCronoprogramma } from "@/lib/preventivi/cronoprogramma";
import { pianoDaFasiDelPreventivo } from "@/lib/orders/pianoDalCronoprogramma";
import { ORDER_WORKFLOW_MODELS } from "@/lib/orders/workflowModels";
import { separaVoci } from "../../../../supabase/functions/_shared/destinazioneVocePreventivo";
import {
  avvisa, colonne, fasiDaCapitoli, giorniDalValore, indirizzoDaParti, metti, nuovoFrammento, numero, testo, tondo,
  type FaseConDurata, type VoceDiCapitolo,
} from "./comuni";

/** I preventivatori edili: la chiave in `quotes.source` («modulo:<chiave>:<progetto>»), le tabelle, il lavoro. */
export const MODULI_EDILI: Readonly<Record<string, { prefisso: string; nome: string; modello: TipoLavoro }>> = {
  rst: { prefisso: "rst", nome: "ristrutturazione", modello: "ristrutturazione" },
  bagni: { prefisso: "bgn", nome: "bagno", modello: "bagno" },
  tetti: { prefisso: "tet", nome: "tetto", modello: "tetto" },
  clm: { prefisso: "clm", nome: "climatizzazione", modello: "climatizzazione" },
  ele: { prefisso: "ele", nome: "impianto elettrico", modello: "elettrico" },
  idr: { prefisso: "idr", nome: "termoidraulica", modello: "termoidraulica" },
  pav: { prefisso: "pav", nome: "pavimenti", modello: "pavimenti" },
  pis: { prefisso: "pis", nome: "piscina", modello: "piscina" },
};

/** «modulo:bagni:<uuid>» → { chiave: "bagni", progettoId }. Null per un preventivo classico. */
export function moduloDelPreventivo(source: unknown): { chiave: string; progettoId: string } | null {
  const m = /^modulo:([a-z]+):([0-9a-f-]{36})$/.exec(String(source ?? ""));
  return m ? { chiave: m[1], progettoId: m[2] } : null;
}

export interface DatiPreventivo {
  /** La riga di `quotes`. */
  quote: Record<string, unknown>;
  /** Le righe (`quote_items`), nell'ordine del preventivo. */
  righe: ReadonlyArray<Record<string, unknown>>;
  /** Preventivatore edile: il progetto (`<prefisso>_progetti`) e le sue voci (`<prefisso>_computo_voci`). */
  modulo?: { chiave: string; progetto: Record<string, unknown>; voci?: ReadonlyArray<Record<string, unknown>> } | null;
  /** Il cronoprogramma del modello dell'azienda, per il preventivo che non ha il suo. */
  cronoprogrammaModello?: unknown;
  /** Inizio dei lavori, se già deciso (AAAA-MM-GG): con questo le fasi hanno le date. */
  inizio?: string | null;
  /** Il calendario dell'azienda per le date (revisione 1/11, L10): senza, le sole feste nazionali. */
  calendario?: CalendarioCantiere;
}

const STATI_FIRMATI = new Set(["accettato", "accepted", "firmato", "signed", "approvato", "vinto"]);
const CHIAVI_TIPO_LAVORO = new Set(ORDER_WORKFLOW_MODELS.map((m) => m.key));

export function preventivoFirmato(quote: Record<string, unknown>): boolean {
  return !!quote.signed_at || STATI_FIRMATI.has(testo(quote.status).toLowerCase());
}

/** Il tipo di lavoro del modello che vale per questo preventivo, se si sa. */
export function modelloDelPreventivo(dati: Pick<DatiPreventivo, "quote" | "modulo">): TipoLavoro | null {
  const m = dati.modulo ? MODULI_EDILI[dati.modulo.chiave] : undefined;
  if (m) return m.modello;
  return riconosciTipoLavoro(`${testo(dati.quote.tipo_lavoro)} ${testo(dati.quote.title)} ${testo(dati.quote.description)}`);
}

/**
 * Le rate del preventivo classico: le fasi di pagamento con l'importo (o la percentuale sul
 * totale). L'acconto iniziale scatta alla firma, il saldo a fine lavori; gli acconti di mezzo
 * restano senza evento (data da scegliere), il finanziamento lo paga la finanziaria.
 */
export function rateDelPreventivo(paymentPhases: unknown, totale: number): RataDelPiano[] {
  const fasi = parseQuotePaymentPhases(paymentPhases);
  return fasi.map((p, i): RataDelPiano => {
    const amount = p.amount > 0 ? tondo(p.amount) : tondo((totale * p.percent) / 100);
    const evento = p.type === "balance" ? "fine_lavori" : p.type === "deposit" && i === 0 ? "firma_contratto" : null;
    return { label: p.label || (p.type === "balance" ? "Saldo" : "Acconto"), type: p.type, amount, percent: p.percent || null, trigger_evento: evento };
  });
}

/** Le rate del piano di pagamento di un preventivatore edile (percentuali sul totale IVA inclusa). */
export function rateDelPreventivatore(pianoPagamento: unknown, totale: number): RataDelPiano[] {
  const piano = leggiPianoPagamento(pianoPagamento);
  const rate = rateConImporti(piano, totale);
  return rate.map((r, i): RataDelPiano => ({
    label: r.nome,
    type: r.evento === "fine_lavori" || (i === rate.length - 1 && rate.length > 1) ? "balance" : "deposit",
    amount: r.importo,
    percent: r.percent,
    trigger_evento: r.evento,
    trigger_numero: r.numero,
  }));
}

/** Le voci di un preventivo con computo (`custom_field_values.computo.capitolo` sulle righe). */
function vociDelComputoNelPreventivo(righe: ReadonlyArray<Record<string, unknown>>): VoceDiCapitolo[] {
  return righe.flatMap((r) => {
    const cfv = r.custom_field_values as { computo?: { capitolo?: unknown } } | null | undefined;
    const capitolo = testo(cfv?.computo?.capitolo);
    if (!capitolo || r.is_optional === true) return [];
    const q = numero(r.quantity) ?? 0;
    const prezzo = numero(r.unit_price) ?? 0;
    const sconto = numero(r.discount_percent) ?? 0;
    const costo = numero(r.prezzo_acquisto);
    return [{
      capitolo, name: testo(r.name).slice(0, 160) || "Lavorazione",
      quantita: q, unita: testo(r.unit_of_measure) || null,
      importo: tondo(q * prezzo * (1 - sconto / 100)),
      costo: costo != null && costo > 0 ? tondo(q * costo) : null,
      codice: testo(r.codice_prezzario) || null,
    }];
  });
}

/** Le voci di un preventivatore edile (`<prefisso>_computo_voci`). */
function vociDelPreventivatore(voci: ReadonlyArray<Record<string, unknown>>): VoceDiCapitolo[] {
  return [...voci]
    .sort((a, b) => (numero(a.ordine) ?? 0) - (numero(b.ordine) ?? 0))
    .map((v) => {
      const q = numero(v.quantita) ?? 0;
      const unitario = (numero(v.costo_materiali) ?? 0) + (numero(v.costo_manodopera) ?? 0);
      return {
        capitolo: testo(v.capitolo_nome) || "Lavorazioni",
        name: testo(v.descrizione).split("\n")[0].slice(0, 160) || "Lavorazione",
        quantita: q, unita: testo(v.unita_misura) || null,
        importo: numero(v.importo),
        costo: unitario > 0 ? tondo(q * unitario) : null,
      };
    });
}

function cronoDelPreventivo(raw: unknown): { fasi: FaseConDurata[]; senzaDurata: string[] } | null {
  const lette = leggiCronoprogramma(raw);
  if (!lette) return null;
  const { piano, senzaDurata } = pianoDaFasiDelPreventivo(lette);
  return piano.length ? { fasi: piano, senzaDurata } : null;
}

export function frammentoDaPreventivo(dati: DatiPreventivo): Frammento {
  const q = dati.quote;
  const righe = [...dati.righe] as Array<Record<string, unknown>>;
  const p = dati.modulo?.progetto ?? {};
  const modulo = dati.modulo ? MODULI_EDILI[dati.modulo.chiave] : undefined;
  const numeroPrev = testo(q.quote_number);
  const fr = nuovoFrammento({
    tipo: "preventivo",
    id: testo(q.id) || null,
    etichetta: `preventivo ${numeroPrev || testo(q.title) || "senza numero"}`,
    dove: null,
  });
  const firmato = preventivoFirmato(q);
  if (!firmato) avvisa(fr, "il preventivo non risulta firmato: i valori sono quelli proposti al cliente");
  // Un preventivo non firmato non è il contratto: vale meno di uno firmato, ma resta un documento.
  const fiducia = firmato ? 1 : 0.8;
  const pf = prefillDaPreventivo(q, righe);

  // ── Identità ──
  const titolo = pf.description || testo(p.tipo_intervento) || (modulo ? `Preventivo ${modulo.nome}` : "");
  metti(fr, "identita.description", titolo, { fiducia, dove: "titolo" });
  const descrizione = testo(q.description) !== titolo ? testo(q.description) : "";
  const lavorazioni = pf.workLines.map((l) => l.name).filter(Boolean);
  metti(fr, "identita.work_description",
    descrizione || testo(p.tipo_intervento) || (lavorazioni.length ? `Lavorazioni: ${lavorazioni.slice(0, 12).join(", ")}` : ""),
    { fiducia, dove: descrizione ? "descrizione" : "righe" });
  const tipoScritto = testo(q.tipo_lavoro).toLowerCase();
  if (modulo) metti(fr, "identita.tipo_lavoro", MODELLI_LAVORO[modulo.modello].tipoLavoroCommessa, { dove: "preventivatore" });
  else if (CHIAVI_TIPO_LAVORO.has(tipoScritto)) metti(fr, "identita.tipo_lavoro", tipoScritto, { dove: "tipo di lavoro" });
  else {
    const riconosciuto = riconosciTipoLavoro(`${tipoScritto} ${titolo}`);
    if (riconosciuto) {
      metti(fr, "identita.tipo_lavoro", MODELLI_LAVORO[riconosciuto].tipoLavoroCommessa,
        { fiducia: 0.7, stato: "proposta", nota: "Ricavato dal titolo del preventivo.", dove: "titolo" });
    }
  }
  metti(fr, "identita.sede_id", q.sede_id);
  metti(fr, "identita.origine", colonne({
    quote_id: q.id, quote_number: numeroPrev,
    rst_progetto_id: dati.modulo?.chiave === "rst" ? p.id : null,
  }));

  // ── Cliente ──
  const nomeModulo = [testo(p.cliente_nome), testo(p.cliente_cognome)].filter(Boolean).join(" ");
  metti(fr, "cliente.nome", colonne({
    client_name: pf.client.name || nomeModulo,
    client_company: pf.client.company || p.cliente_ragione_sociale,
  }), { fiducia, dove: "cliente" });
  metti(fr, "cliente.contatto", colonne({
    client_phone: pf.client.phone || p.cliente_telefono,
    client_email: pf.client.email || p.cliente_email,
  }), { fiducia, dove: "cliente" });
  metti(fr, "cliente.client_address", pf.client.address, { fiducia, dove: "cliente" });
  metti(fr, "cliente.opportunity_id", q.opportunity_id ?? p.opportunita_id);

  // ── Cantiere ──
  const cantiere = testo(q.indirizzo_lavori) || indirizzoDaParti({
    indirizzo: p.cantiere_indirizzo, cap: p.cantiere_cap, citta: p.cantiere_citta, provincia: p.cantiere_provincia,
  });
  metti(fr, "cantiere.indirizzo", colonne({ indirizzo_lavori: cantiere }), { fiducia, dove: "indirizzo dei lavori" });

  // ── Economia ──
  const conSubtotale = (numero(q.subtotal) ?? 0) > 0;
  // Senza subtotale il preventivo classico vale il totale (contrattoPreventivo); un preventivatore ha l'imponibile suo.
  const imponibileModulo = numero(p.totale_imponibile) ?? 0;
  const imponibile = modulo && !conSubtotale && imponibileModulo > 0 ? imponibileModulo : pf.totalAmount;
  metti(fr, "economia.total_amount", imponibile > 0 ? tondo(imponibile) : null, { fiducia, dove: "totale imponibile" });
  const iva = conSubtotale ? pf.vatRate : numero(p.iva_pct);
  metti(fr, "economia.vat_rate", iva, { fiducia, dove: "IVA" });
  if (pf.bonusLines.length || (numero(p.detrazione_pct) ?? 0) > 0) metti(fr, "economia.has_building_bonus", true, { fiducia, dove: "bonus" });
  metti(fr, "economia.order_items", pf.orderItems, { fiducia, dove: `righe 1–${righe.length}` });
  metti(fr, "economia.order_bonus_lines", pf.bonusLines, { fiducia, dove: "bonus" });
  const daVerificare = separaVoci(righe).daVerificare.length;
  if (daVerificare) avvisa(fr, `${daVerificare} ${daVerificare === 1 ? "riga non si sa se è materiale o lavorazione" : "righe non si sa se sono materiali o lavorazioni"}: restano fuori dalle righe`);

  // ── Pagamenti ──
  const finanziato = pf.hasFinancing || (numero(p.finanziamento_importo) ?? 0) > 0;
  metti(fr, "pagamenti.payment_type", finanziato ? "financing" : "standard", { fiducia, dove: "pagamento" });
  const totaleIvato = numero(q.total) ?? numero(p.totale) ?? imponibile;
  const rate = modulo && p.piano_pagamento
    ? rateDelPreventivatore(p.piano_pagamento, totaleIvato)
    : rateDelPreventivo(q.payment_phases, totaleIvato);
  const senzaEvento = rate.filter((r) => !r.trigger_evento && r.type !== "financing").length;
  metti(fr, "pagamenti.rate", rate, {
    fiducia, dove: "condizioni di pagamento",
    nota: senzaEvento ? `${senzaEvento === 1 ? "Una rata non ha" : `${senzaEvento} rate non hanno`} un momento del cantiere: scegli quando scade.` : null,
  });

  // ── Fasi ──
  const crono = cronoDelPreventivo(modulo ? p.cronoprogramma ?? null : q.cronoprogramma)
    ?? cronoDelPreventivo(dati.cronoprogrammaModello);
  const vociComputo = vociDelComputoNelPreventivo(righe);
  const vociModulo = dati.modulo?.voci?.length ? vociDelPreventivatore(dati.modulo.voci) : [];
  let fasi: FaseDelPiano[] = [];
  let stimate: string[] = [];
  let doveFasi = "cronoprogramma";
  let durateModello: { tipo: TipoLavoro; completate: string[] } | null = null;
  if (vociComputo.length) {
    // Preventivo con computo: un capitolo per fase, come la creazione della commessa.
    ({ fasi, stimate } = fasiDaCapitoli(vociComputo, crono?.fasi ?? [], giorniDalValore));
    doveFasi = "capitoli del computo";
  } else if (crono) {
    // Preventivatore o classico col cronoprogramma: le sue fasi; le voci dei capitoli con lo stesso nome ne sono le sottofasi.
    const conVoci = fasiDaCapitoli(vociModulo, crono.fasi, giorniDalValore).fasi;
    fasi = conVoci.slice(0, crono.fasi.length);
  } else if (vociModulo.length) {
    ({ fasi, stimate } = fasiDaCapitoli(vociModulo, [], giorniDalValore));
    doveFasi = "capitoli del preventivo";
  } else if (lavorazioni.length) {
    fasi = lavorazioni.map((name) => ({ name: name.slice(0, 160) }));
    doveFasi = "lavorazioni del preventivo";
    // Le fasi senza tempi prendono le durate del modello del lavoro, come proposta: il
    // preventivo resta la fonte delle fasi, e non nasce un conflitto col modello.
    const tipo = modelloDelPreventivo(dati);
    if (tipo) {
      const misura = misuraDalTesto(`${titolo} ${testo(q.description)}`, MODELLI_LAVORO[tipo].unita);
      const conDurate = durateDalModello(fasi, tipo, misura);
      fasi = conDurate.fasi;
      durateModello = { tipo, completate: conDurate.completate };
      avvisa(fr, `il preventivo non ha il cronoprogramma: le fasi sono le lavorazioni, con le durate del modello del ${MODELLI_LAVORO[tipo].etichetta}`);
    } else {
      avvisa(fr, "il preventivo non ha il cronoprogramma: le fasi sono le lavorazioni, senza durate");
    }
  }
  if (crono?.senzaDurata.length) avvisa(fr, `fasi senza durata leggibile, contate un giorno: ${crono.senzaDurata.join(", ")}`);
  if (fasi.length) {
    const conDate = dati.inizio ? dateDelleFasi(fasi, dati.inizio, dati.calendario) : fasi;
    metti(fr, "fasi.order_work_phases", conDate, durateModello?.completate.length
      ? {
        fiducia: Math.min(fiducia, 0.5), stato: "proposta", dove: doveFasi,
        nota: `Le fasi sono del preventivo, le durate del modello del ${MODELLI_LAVORO[durateModello.tipo].etichetta} (${durateModello.completate.join(", ")}): correggile coi tempi delle tue squadre.`,
      }
      : stimate.length
      ? { fiducia: Math.min(fiducia, 0.7), stato: "proposta", dove: doveFasi, nota: `Durate stimate dal valore dei capitoli (${stimate.join(", ")}): correggile.` }
      : { fiducia, dove: doveFasi });
    const fine = conDate.reduce<string | null>((max, f) => (f.end_date && (!max || f.end_date > max) ? f.end_date : max), null);
    if (fine) {
      const opz = { fiducia: Math.min(fiducia, 0.9), stato: "proposta" as const, dove: doveFasi, nota: "Dalle durate del cronoprogramma e dall'inizio lavori." };
      metti(fr, "fasi.work_end_date", fine, opz);
      metti(fr, "fasi.expected_date", fine, opz);
    }
  }

  // ── Persone ──
  metti(fr, "persone.assigned_to", q.assigned_to);
  metti(fr, "persone.venditori", q.salesperson_id ? [q.salesperson_id] : null, { dove: "venditore" });
  return fr;
}
