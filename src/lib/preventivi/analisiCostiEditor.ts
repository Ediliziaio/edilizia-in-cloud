import { calcolaVoce, ePercentuale, numeroEditor, type BozzaComputo } from "@/lib/computo/editorNativo";
import { calcolaSconto } from "@/lib/computo/scontoComputo";
import type { QuoteItemPro } from "@/types/quoteItem";
import { importoRiga, normalizzaRigaPerDatabase, round2 } from "@/hooks/usePreventivoCosti";
import { centesimiCosto, prezzoDaCosto, quoteCostiComuni, ripartisciCosto, soldi, type analizzaPreventivo, type VoceAnalisi } from "./analisiCosti";

export type ProiezionePrezzoAnalisi = { imponibile: number; voci: readonly VoceAnalisi[] };

export function economiaAnalisiComputo(bozza: BozzaComputo, voci: BozzaComputo["voci"] = bozza.voci) {
  const righe = voci.map(v => {
    const calcolo = calcolaVoce(v);
    return { voce: v, calcolo, inclusa: !v.opzionale && !bozza.capitoliEsclusiPdf.includes(v.capitolo.trim() || "Opere edili") };
  });
  const totale = righe.reduce((s, r) => r.inclusa ? s + (r.calcolo.importo ?? 0) : s, 0);
  const sicurezza = righe.reduce((s, r) => r.inclusa && r.voce.sicurezza ? s + (r.calcolo.importo ?? 0) : s, 0);
  const sconto = calcolaSconto(totale, bozza.sconto, sicurezza);
  const sconti = ripartisciCosto(centesimiCosto(sconto.importo),
    righe.map(r => r.inclusa && !r.voce.sicurezza ? r.calcolo.importo ?? 0 : 0));
  return {
    imponibile: soldi(centesimiCosto(totale) - centesimiCosto(sconto.importo)),
    errore: sconto.errore,
    voci: righe.map(({ voce, calcolo, inclusa }, i): VoceAnalisi => ({
      id: voce.id, codice: voce.tariffa, descrizione: voce.descrizione, fase: voce.capitolo.trim() || "Opere edili",
      quantita: calcolo.quantita, unita: voce.unita, prezzo: ePercentuale(voce.unita) ? null : calcolo.prezzo,
      venditaLorda: calcolo.importo,
      vendita: calcolo.importo === null ? null : soldi(centesimiCosto(calcolo.importo) - sconti[i]),
      costoUnitario: numeroEditor(voce.costo), inclusa,
    })),
  };
}

export function economiaAnalisiClassica(items: readonly QuoteItemPro[], imponibile: number) {
  const righe = items.filter(r => !["nota", "sconto", "subtotale"].includes(r.item_category));
  const imponibili = righe.map(r => centesimiCosto(importoRiga(r)));
  const prezzi = ripartisciCosto(centesimiCosto(imponibile), righe.map((r, i) => r.is_optional ? 0 : imponibili[i]));
  return righe.map((r, i): VoceAnalisi => {
    const salvata = normalizzaRigaPerDatabase(r);
    return {
      id: r.analisi_riga_id ?? r.id, tariffaId: r.tariffa_id, descrizione: r.name || r.description || "", fase: "",
      descrizioneEstesa: r.description || undefined,
      quantita: r.quantity, unita: r.unit_of_measure || "", prezzo: r.unit_price,
      venditaLorda: round2(salvata.quantity * salvata.unit_price),
      vendita: r.is_optional ? soldi(imponibili[i]) : soldi(prezzi[i]), inclusa: !r.is_optional,
      costoUnitario: r.prezzo_acquisto > 0 ? r.prezzo_acquisto : null,
    };
  });
}

export function economiaRevisioneClassica(fotografia: unknown) {
  if (!fotografia || typeof fotografia !== "object") return null;
  const { quote, items } = fotografia as { quote?: { subtotal?: number; discount_amount?: number }; items?: QuoteItemPro[] };
  if (!quote || !Array.isArray(items)) return null;
  const imponibile = soldi(centesimiCosto(Number(quote.subtotal ?? 0) - Number(quote.discount_amount ?? 0)));
  return { imponibile, voci: economiaAnalisiClassica(items, imponibile) };
}

/** Cerca il primo prezzo rappresentabile che raggiunge il netto richiesto. */
export function cercaPrezzoAnalisi(net: number, nettoConPrezzo: (unitario: number) => number | null, decimali: 2 | 4 = 4): number | null {
  const precisione = 10 ** decimali;
  const obiettivo = centesimiCosto(net);
  const raggiunge = (prezzo: number) => {
    const ricavo = nettoConPrezzo(prezzo / precisione);
    return ricavo !== null && centesimiCosto(ricavo) >= obiettivo;
  };
  let basso = 0;
  let alto = 1_000_000 * precisione - 1;
  if (!raggiunge(alto)) return null;
  while (basso < alto) {
    const mezzo = Math.floor((basso + alto) / 2);
    if (raggiunge(mezzo)) alto = mezzo;
    else basso = mezzo + 1;
  }
  return alto / precisione;
}

/** La quota condivisa segue il nuovo ricavo netto, anche durante la ricerca del prezzo. */
export function simulaPrezzoConCostiComuni(
  calcolo: ReturnType<typeof analizzaPreventivo>, id: string, percentuale: number | null,
  metodo: "margine" | "ricarico", proietta: (prezzo: number) => ProiezionePrezzoAnalisi | null, decimali?: 2 | 4,
) {
  const riga = calcolo.righe.find(r => r.voce.id === id);
  if (!riga || riga.incompleto || riga.costo === null) return null;
  const costoProprio = riga.costo;
  if (prezzoDaCosto(soldi(costoProprio), percentuale, metodo) === null) return null;

  const valuta = (prezzo: number) => {
    const progetto = proietta(prezzo);
    const voce = progetto?.voci.find(v => v.id === id);
    if (!progetto || voce?.vendita == null) return null;
    const quota = quoteCostiComuni(calcolo, progetto.voci).get(id);
    if (quota?.parziale) return null;
    const costo = costoProprio + (quota?.fase ?? 0) + (quota?.preventivo ?? 0);
    const obiettivo = prezzoDaCosto(soldi(costo), percentuale, metodo);
    if (obiettivo === null) return null;
    return { prezzo, costo, quota, obiettivo, voce, netto: voce.vendita, imponibile: progetto.imponibile };
  };

  const prezzo = cercaPrezzoAnalisi(0, p => {
    const esito = valuta(p);
    return esito && esito.netto - esito.obiettivo;
  }, decimali);
  return prezzo === null ? null : valuta(prezzo);
}
