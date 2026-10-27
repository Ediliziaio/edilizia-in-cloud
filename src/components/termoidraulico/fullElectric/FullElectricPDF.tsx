import React from "react";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { baseDocumentoEnergia, contenutiEnergia } from "@/components/preventivi/pdf/adattatoreEnergia";
import { FAQ_FULL_ELECTRIC, PASSAGGI_FULL_ELECTRIC } from "@/lib/fullElectric/testi";
import type { DatiRacconto } from "@/components/preventivi/pdf/racconto/baseRacconto";
import type { DomandaRisposta, Passaggio } from "@/lib/contoTermico/testi";
import type { ComponenteFullElectric } from "@/lib/fullElectric/regole";
import type { PezzoFullElectric } from "@/lib/fullElectric/dati";
import { calcolaFullElectric, type FullElectricEconomia } from "@/lib/fullElectric/calcoli";
import { formatCurrency } from "@/lib/formatters";
import { testiPerPdf } from "../../../../supabase/functions/_shared/testoPerPdf";

export type FotoFullElectric =
  | "copertina" | "cosaVuolDire" | "oggi" | "domani" | "energia" | "bollette" | "incentivi" | "ambiente"
  | "passaggi" | "installazione" | "decisione" | ComponenteFullElectric;

export interface FullElectricPdfData extends DatiRacconto {
  sistema: {
    componenti: PezzoFullElectric[];
    /** Cosa si lascia: «Caldaia a gas e piano cottura a gas». */
    impiantoAttuale: string;
    voci: { descrizione: string; quantita?: number | null; unita?: string | null }[];
    caratteristiche: { etichetta: string; valore: string }[];
  };
  economia: FullElectricEconomia;
  testi?: {
    titoloCopertina?: string | null;
    sottotitoloCopertina?: string | null;
    faq?: DomandaRisposta[] | null;
    passaggi?: Passaggio[] | null;
  };
  foto?: Partial<Record<FotoFullElectric, string | null>>;
  /** Il colore dell'azienda al posto del blu, se c'è. */
  colorePrimario?: string | null;
}


export function FullElectricPDF({ data }: { data: FullElectricPdfData }) {
  const r = calcolaFullElectric(data.economia);
  const dati = baseDocumentoEnergia(data, r, "Casa Full Electric");
  dati.modulo = { ...dati.modulo, etichetta: "Casa Full Electric" };
  contenutiEnergia(dati, data, { faq: FAQ_FULL_ELECTRIC, passaggi: PASSAGGI_FULL_ELECTRIC });
  dati.sezioniTecniche = [
    ...(dati.sezioniTecniche ?? []),
    { id: "fornitura-energetica", titolo: "Forniture e lavorazioni incluse", righe: data.sistema.voci.map(v => ({ etichetta: v.descrizione, valore: [v.quantita, v.unita].filter(x => x != null).join(" ") })) },
    { id: "sistema-energetico", titolo: "Il sistema proposto", testo: data.sistema.impiantoAttuale, righe: [...data.sistema.componenti.map(c => ({ etichetta: c.titolo, valore: c.dettaglio })), ...data.sistema.caratteristiche], immagine: data.foto?.domani },
    { id: "energia", titolo: "Energia e consumi stimati", righe: [{ etichetta: "Produzione annua", valore: r.energia.produzione.toLocaleString("it-IT") + " kWh" }, { etichetta: "Consumi annui", valore: r.energia.consumo.toLocaleString("it-IT") + " kWh" }, { etichetta: "Autoconsumo", valore: r.energia.autoconsumo.toLocaleString("it-IT") + " kWh" }, { etichetta: "Risparmio annuo", valore: formatCurrency(r.risparmioAnnuo) }] },
    { id: "incentivi", titolo: "Scenario degli incentivi", righe: [{ etichetta: "Detrazione stimata", valore: formatCurrency(r.incentivi.detrazione?.totale ?? 0) }, { etichetta: "Contributo Conto Termico stimato", valore: formatCurrency(r.incentivi.contributoCt) }, { etichetta: "Esborso iniziale", valore: formatCurrency(r.pagaOggi) }, { etichetta: "Costo dopo incentivi", valore: formatCurrency(r.costoNetto) }], nota: "Stime soggette ai requisiti e alla verifica delle agevolazioni, senza cumulo su spese non ammissibili." },
    { id: "beneficio", titolo: "Beneficio nel tempo", righe: r.anniBeneficio.map(a => ({ etichetta: "Anno " + a.anno, valore: formatCurrency(a.cumulato) })) },
    { id: "bollette", titolo: "Bollette prima e dopo", righe: [{ etichetta: "Spesa annua attuale", valore: formatCurrency(r.bollette.oggi.totale) }, { etichetta: "Spesa annua prevista", valore: formatCurrency(r.bollette.domani.totale) }, { etichetta: "Ricavo energia immessa", valore: formatCurrency(r.bollette.domani.ricavo) }], immagine: data.foto?.bollette },
    { id: "mesi-energia", titolo: "Energia mese per mese", righe: r.mesi.map(m => ({ etichetta: m.mese, valore: `${m.produzione.toLocaleString("it-IT")} kWh prodotti / ${m.consumo.toLocaleString("it-IT")} kWh consumati` })), grafico: { etichette: r.mesi.map(m => m.mese), serie: [{ nome: "Produzione kWh", valori: r.mesi.map(m => m.produzione) }, { nome: "Consumo kWh", valori: r.mesi.map(m => m.consumo) }] } },
  ];
  const beneficio = dati.sezioniTecniche.find(s => s.id === "beneficio")!;
  beneficio.grafico = { etichette: r.anniBeneficio.map(a => String(a.anno)), serie: [{ nome: "Beneficio cumulato EUR", valori: r.anniBeneficio.map(a => a.cumulato) }] };
  return <DocumentoEdilePDF dati={testiPerPdf(dati)} />;
}
