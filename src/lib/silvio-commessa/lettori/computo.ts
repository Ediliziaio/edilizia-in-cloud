/**
 * Lettore del computo (31/10/2026, fase 1, lotto 1.1): la bozza nativa del preventivo con
 * computo, e i file (XPWE, PDF stampato da PriMus, foglio Excel) letti da `leggiFileComputo`.
 *
 * Ogni capitolo diventa una fase e ogni voce una sottofase, come nella creazione della
 * commessa dal computo (`crea_commessa_preventivo_atomic`). I tempi vengono dal
 * cronoprogramma del computo; i capitoli che non ci sono hanno la durata stimata dal
 * loro valore (`cronoDaCapitoli`: una giornata ogni 1.500 €), e lo dice la nota.
 *
 * Cosa legge: titolo e oggetto, committente e recapiti, indirizzo del cantiere, imponibile
 * scontato, IVA, rate del piano dei pagamenti (sul totale IVA inclusa, agganciate agli
 * eventi del cantiere), fasi e sottofasi, inizio lavori e costi previsti per fase (dal costo
 * stimato delle voci o, se manca, dal listino aziendale col codice: `applicaCostiListino`).
 * Le righe della commessa no: dal computo nascono lavorazioni, non materiali.
 *
 * I prezzi di un computo sono prezzi di vendita al cliente: il totale (meno lo sconto) è
 * l'importo della commessa, e non diventano mai costi. Per un foglio Excel non è scontato che
 * sia così, perché può essere l'offerta di una ditta: l'importo resta una proposta, e lo si dice.
 */
import type { FaseDelPiano, Fonte, Frammento, RataDelPiano } from "../../../../shared/silvio-commessa/piano.ts";
import { dateDelleFasi } from "../../../../shared/silvio-commessa/modelliLavoro.ts";
import type { CalendarioCantiere } from "../../../../shared/silvio-commessa/calendario.ts";
import { calcolaVoce, numeroEditor, bozzaVuota, type BozzaComputo } from "@/lib/computo/editorNativo";
import { analizzaEconomia, eventoPerCommessa } from "@/lib/computo/economiaComputo";
import { calcolaIvaComputo } from "@/lib/computo/ivaComputo";
import { applicaCostiListino, type CostoListino } from "@/lib/computo/costiDalListino";
import { normalizzaFasi } from "@/lib/computo/cronoprogramma";
import { applicaImportComputo, bozzaDaComputoStrutturato } from "@/lib/computo/importaComputo";
import type { ComputoStrutturato } from "@/lib/computo/computoStrutturato";
import { pianoDaCronoprogrammaComputo } from "@/lib/orders/pianoDalCronoprogramma";
import {
  avvisa, colonne, costiDelleFasi, fasiDaCapitoli, giorniDalValore, indirizzoDaParti, metti, nuovoFrammento, tondo,
  type VoceDiCapitolo,
} from "./comuni";

export interface DatiComputo {
  bozza: BozzaComputo;
  /** La bozza (`computo_preventivo_drafts.id`) o il file caricato. */
  id?: string | null;
  /** «computo Ristrutturazione via Verdi», «Computo.xpwe». */
  etichetta?: string;
  /** I costi del listino aziendale per codice, per le voci senza costo stimato. */
  listino?: readonly CostoListino[];
  /** Inizio dei lavori deciso altrove (AAAA-MM-GG); senza, vale quello del cronoprogramma. */
  inizio?: string | null;
  /** Il calendario dell'azienda per le date (revisione 1/11, L10): senza, le sole feste nazionali. */
  calendario?: CalendarioCantiere;
}

/**
 * Oltre questi giorni lavorativi (circa 9 mesi) una stima dal valore non è un tempo: mette i capitoli
 * uno dopo l'altro, e un computo grande in Excel veniva 891 giornate in fila. Meglio chiedere.
 */
export const SOGLIA_GIORNI_STIMATI = 180;

/** La prima riga della descrizione: il nome della voce. */
const nomeVoce = (descrizione: string) => descrizione.trim().split("\n")[0].slice(0, 160) || "Lavorazione";

/** Le voci vendute (senza le opzionali) come sottofasi del loro capitolo. */
function vociDellaBozza(bozza: BozzaComputo): VoceDiCapitolo[] {
  return bozza.voci.filter((v) => !v.opzionale).map((v) => {
    const r = calcolaVoce(v);
    const costoUnitario = numeroEditor(v.costo ?? "");
    const percento = v.unita.trim() === "%" ? 100 : 1;
    return {
      capitolo: v.capitolo.trim() || "Opere edili",
      name: nomeVoce(v.descrizione),
      quantita: r.quantita,
      unita: v.unita.trim() || null,
      importo: r.importo,
      costo: costoUnitario != null && costoUnitario > 0 && r.quantita != null ? tondo((r.quantita * costoUnitario) / percento) : null,
      codice: v.tariffa.trim() || null,
    };
  });
}

export function frammentoDaComputo(dati: DatiComputo): Frammento {
  const conListino = dati.listino?.length ? applicaCostiListino(dati.bozza.voci, dati.listino) : null;
  const bozza: BozzaComputo = conListino ? { ...dati.bozza, voci: conListino.voci } : dati.bozza;
  const fonte: Fonte = {
    tipo: "computo", id: dati.id ?? null,
    etichetta: dati.etichetta || `computo ${bozza.numero.trim() || bozza.titolo.trim() || "senza titolo"}`, dove: null,
  };
  const fr = nuovoFrammento(fonte);

  // ── Identità ──
  metti(fr, "identita.description", bozza.titolo, { dove: "titolo" });
  metti(fr, "identita.work_description", bozza.oggetto, { dove: "oggetto dei lavori" });

  // ── Cliente ──
  const azienda = bozza.clienteTipo === "azienda" || bozza.clienteTipo === "pa";
  metti(fr, "cliente.nome", colonne(azienda ? { client_company: bozza.committente } : { client_name: bozza.committente }), { dove: "committente" });
  metti(fr, "cliente.contatto", colonne({ client_phone: bozza.clienteTelefono, client_email: bozza.clienteEmail }), { dove: "committente" });

  // ── Cantiere ──
  const cantiere = indirizzoDaParti({
    indirizzo: bozza.cantiere_indirizzo, cap: bozza.cantiere_cap, citta: bozza.cantiere_citta, provincia: bozza.cantiere_provincia,
  }) || bozza.indirizzo.trim();
  metti(fr, "cantiere.indirizzo", colonne({ indirizzo_lavori: cantiere }), { dove: "indirizzo dei lavori" });

  // ── Economia ──
  const economia = analizzaEconomia(bozza);
  metti(fr, "economia.total_amount", economia.netto > 0 ? tondo(economia.netto) : null, { dove: "riepilogo" });
  if (bozza.ivaModalita === "applicata") {
    const aliquota = numeroEditor(bozza.ivaAliquota);
    if (aliquota != null) metti(fr, "economia.vat_rate", aliquota, { dove: "IVA" });
    else avvisa(fr, "l'aliquota IVA non è un numero: va scelta");
  } else if (bozza.ivaModalita === "non-applicabile") {
    metti(fr, "economia.vat_rate", 0, { dove: "IVA", nota: bozza.ivaNota.trim() || "IVA non applicabile." });
  } else {
    avvisa(fr, "l'IVA del computo è «da definire»");
  }
  if (bozza.detrazione.tipo !== "nessuna") metti(fr, "economia.has_building_bonus", true, { dove: "detrazione" });

  // ── Pagamenti ──
  if (economia.errorePiano) avvisa(fr, `piano dei pagamenti: ${economia.errorePiano}`);
  else if (economia.rate.length) {
    // Le rate si incassano sul totale che il cliente paga: con l'IVA quando è applicata.
    const totale = economia.netto > 0 ? calcolaIvaComputo(economia.netto, bozza).totale ?? economia.netto : 0;
    // Con una rata a misura il piano non fa 100%: l'ultima rata prende la SUA percentuale, non «il resto»,
    // che sarebbe la quota dei SAL (11/11/2026). Il resto si assorbe solo quando le rate sono tutte fisse.
    const conAMisura = economia.rate.some(x => x.rata.base === "avanzamento");
    const rate = economia.rate.map((r, i): RataDelPiano => {
      const amount = r.rata.base === "avanzamento" ? 0
        : !conAMisura && i === economia.rate.length - 1
          ? tondo(totale - economia.rate.slice(0, -1).reduce((s, x) => s + tondo((totale * (x.percentuale ?? 0)) / 100), 0))
          : tondo((totale * (r.percentuale ?? 0)) / 100);
      const evento = r.rata.evento;
      // Dall'11/11/2026 il momento della rata è già un evento del cantiere: si traduce solo
      // quello che la commessa non conosce (il collaudo, il SAL a percentuale o a fase).
      const perCommessa = eventoPerCommessa(r.rata, economia.rate.map(x => x.rata));
      return {
        label: r.rata.descrizione.trim() || "Rata",
        type: evento === "fine_lavori" || evento === "collaudo" || (i === economia.rate.length - 1 && economia.rate.length > 1) ? "balance" : "deposit",
        amount, percent: r.percentuale,
        // Il computo dice la percentuale: l'importo segue il totale, se la persona lo cambia.
        ...(r.percentuale != null ? { daPercentuale: true } : {}),
        trigger_evento: perCommessa.evento,
        trigger_numero: perCommessa.numero,
      };
    });
    metti(fr, "pagamenti.rate", rate, { dove: "piano dei pagamenti" });
    metti(fr, "pagamenti.payment_type", "standard", { dove: "piano dei pagamenti" });
  }

  // ── Fasi ──
  const crono = pianoDaCronoprogrammaComputo({ ...bozza.cronoprogramma, fasi: normalizzaFasi(bozza.cronoprogramma.fasi) });
  const voci = vociDellaBozza(bozza);
  const capitoli = fasiDaCapitoli(voci, crono.piano, giorniDalValore);
  const { stimate } = capitoli;
  const giorniInFila = capitoli.fasi.reduce((max, f) => Math.max(max, (f.giorno_inizio ?? 1) + (f.giorni ?? 1) - 1), 0);
  const nonCredibile = stimate.length > 0 && giorniInFila > SOGLIA_GIORNI_STIMATI;
  // Una durata inventata darebbe date inventate: restano i nomi e le voci, senza tempi.
  const fasi: FaseDelPiano[] = nonCredibile
    ? capitoli.fasi.map((f) => { const { giorni: _g, giorno_inizio: _i, ...resto } = f; return resto; })
    : capitoli.fasi;
  const inizio = nonCredibile ? null : dati.inizio || crono.inizioSuggerito;
  const conDate: FaseDelPiano[] = inizio ? dateDelleFasi(fasi, inizio, dati.calendario) : fasi;
  if (nonCredibile) {
    const testo = `Dal valore dei capitoli verrebbero ${giorniInFila} giornate di lavoro in fila: non è un tempo credibile, e le date non le invento. Dimmi quanto dura il lavoro: quando inizia e quando finisce.`;
    avvisa(fr, testo);
    metti(fr, "fasi.order_work_phases", conDate, { fiducia: 0.6, stato: "proposta", dove: "capitoli", nota: testo });
  } else if (conDate.length) {
    metti(fr, "fasi.order_work_phases", conDate, stimate.length
      ? {
        fiducia: crono.piano.length ? 0.8 : 0.6, stato: "proposta", dove: "capitoli",
        nota: `Durate stimate dal valore dei capitoli${crono.piano.length ? ` che il cronoprogramma non ha (${stimate.join(", ")})` : ""}: correggile con i tempi reali delle tue squadre.`,
      }
      : { dove: "cronoprogramma" });
  }
  if (!dati.inizio && crono.inizioSuggerito) metti(fr, "fasi.work_start_date", crono.inizioSuggerito, { dove: "cronoprogramma" });
  const fine = conDate.reduce<string | null>((max, f) => (f.end_date && (!max || f.end_date > max) ? f.end_date : max), null);
  if (fine && !nonCredibile) {
    const opz = { fiducia: stimate.length ? 0.6 : 0.9, stato: "proposta" as const, dove: "cronoprogramma" };
    metti(fr, "fasi.work_end_date", fine, opz);
    metti(fr, "fasi.expected_date", fine, opz);
  }

  // ── Costi previsti ──
  const costi = costiDelleFasi(conDate);
  const senzaCosto = voci.filter((v) => !(v.costo && v.costo > 0)).length;
  metti(fr, "costi.previsti", costi, {
    dove: conListino?.trovate ? `costi delle voci (${conListino.trovate} dal listino)` : "costi delle voci",
    nota: senzaCosto ? `${senzaCosto} ${senzaCosto === 1 ? "voce è" : "voci sono"} senza costo: il costo vero è più alto.` : null,
  });
  if (!costi.length && voci.length) avvisa(fr, "nessuna voce ha un costo stimato: il margine non si può calcolare");
  return fr;
}

/** Un file (XPWE, PDF di PriMus, foglio Excel) già letto da `leggiFileComputo`, come frammento. */
export function frammentoDaFileComputo(
  computo: ComputoStrutturato, nomeFile: string, opzioni: Pick<DatiComputo, "listino" | "inizio" | "calendario"> = {},
): Frammento {
  const esito = bozzaDaComputoStrutturato(computo);
  const bozza = applicaImportComputo(bozzaVuota(), esito);
  const fr = frammentoDaComputo({ bozza, etichetta: nomeFile, ...opzioni });
  const avvisi = [...esito.avvisi];
  if (esito.scostamenti.length) avvisi.push(`${esito.scostamenti.length} voci con la quantità ricalcolata diversa dal documento`);
  if (esito.totaleDocumento != null && Math.abs(esito.totaleDocumento - esito.totaleRicalcolato) >= 0.01) {
    const euro = (n: number) => `${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" })} €`;
    avvisi.push(`il totale del documento (${euro(esito.totaleDocumento)}) non torna col ricalcolo (${euro(esito.totaleRicalcolato)})`);
  }
  if (computo.formato === "excel") {
    const importo = fr.aree.economia?.["economia.total_amount"];
    const nota = "I prezzi del foglio sono letti come prezzi di vendita al cliente: se è l'offerta di una ditta, il totale è un costo, non l'importo della commessa.";
    if (importo) {
      importo.stato = "proposta";
      importo.fiducia = 0.7;
      importo.nota = nota;
    }
    avvisi.push(nota);
  }
  return { ...fr, avvisi: [...(fr.avvisi ?? []), ...avvisi] };
}
