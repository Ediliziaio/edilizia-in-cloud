import React from "react";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { baseDocumentoEnergia, contenutiEnergia } from "@/components/preventivi/pdf/adattatoreEnergia";
import { FAQ_CONTO_TERMICO, PASSAGGI_CONTO_TERMICO, DOCUMENTI_CONTO_TERMICO, VANTAGGI_CONTO_TERMICO } from "@/lib/contoTermico/testi";
import type { DatiRacconto } from "@/components/preventivi/pdf/racconto/baseRacconto";
import type { DomandaRisposta, Passaggio, Vantaggio } from "@/lib/contoTermico/testi";
import type { InterventoContoTermico } from "@/lib/contoTermico/regole";
import { calcolaContoTermico, type ContoTermicoEconomia } from "@/lib/contoTermico/calcoli";
import { formatCurrency } from "@/lib/formatters";
import { testiPerPdf } from "../../../../supabase/functions/_shared/testoPerPdf";

export type FotoContoTermico =
  | "copertina" | "cosaVuolDire" | "oggi" | "domani" | "interno" | "dettaglio" | "incentivo" | "installazione" | "comfort" | "passaggi" | "domande" | "decisione";

export interface ContoTermicoPdfData extends DatiRacconto {
  intervento: {
    tipo: InterventoContoTermico;
    /** Cosa si installa: «Pompa di calore aria-acqua 8 kW». */
    titolo: string;
    /** Cosa si toglie: «Caldaia a gas del 2008». */
    impiantoAttuale: string;
    voci: { descrizione: string; quantita?: number | null; unita?: string | null }[];
    /** La scheda tecnica del modello proposto: «Potenza termica» → «8 kW». */
    caratteristiche?: { etichetta: string; valore: string }[];
  };
  economia: ContoTermicoEconomia;
  testi?: {
    titoloCopertina?: string | null;
    sottotitoloCopertina?: string | null;
    faq?: DomandaRisposta[] | null;
    passaggi?: Passaggio[] | null;
    vantaggi?: Vantaggio[] | null;
  };
  foto?: Partial<Record<FotoContoTermico, string | null>>;
  /** Il colore dell'azienda al posto del blu, se c'è. */
  colorePrimario?: string | null;
}


export function ContoTermicoPDF({ data }: { data: ContoTermicoPdfData }) {
  const r = calcolaContoTermico(data.economia);
  const dati = baseDocumentoEnergia(data, r, "Conto Termico");
  dati.modulo = { ...dati.modulo, etichetta: "Conto Termico" };
  contenutiEnergia(dati, data, { faq: FAQ_CONTO_TERMICO, passaggi: PASSAGGI_CONTO_TERMICO });
  dati.sezioniTecniche = [
    ...(dati.sezioniTecniche ?? []),
    { id: "intervento", titolo: data.intervento.titolo, testo: data.intervento.impiantoAttuale, righe: data.intervento.caratteristiche, immagine: data.foto?.domani },
    { id: "fornitura-energetica", titolo: "Forniture e lavorazioni incluse", righe: data.intervento.voci.map(v => ({ etichetta: v.descrizione, valore: [v.quantita, v.unita].filter(x => x != null).join(" ") })) },
    { id: "vantaggi", titolo: "Caratteristiche dell'intervento", righe: (data.testi?.vantaggi?.length ? data.testi.vantaggi : VANTAGGI_CONTO_TERMICO[data.intervento.tipo] ?? []).map(v => ({ etichetta: v.titolo, valore: v.testo })), immagine: data.foto?.interno },
    { id: "contributo", titolo: "Il contributo previsto", righe: [{ etichetta: "Contributo stimato", valore: formatCurrency(r.contributo) }, { etichetta: "Esborso iniziale", valore: formatCurrency(r.pagaOggi) }, { etichetta: "Costo dopo contributo", valore: formatCurrency(r.restaATe) }, { etichetta: "Risparmio annuo stimato", valore: formatCurrency(r.risparmioAnnuo) }], nota: "Contributo indicato nel progetto, subordinato alla verifica dei requisiti e all'approvazione della pratica." },
    { id: "rate-contributo", titolo: "Erogazione del contributo", righe: r.rate.map(rata => ({ etichetta: "Rata " + rata.numero + " - anno " + rata.anno, valore: formatCurrency(rata.importo) })) },
    { id: "beneficio", titolo: "Beneficio nel tempo", righe: r.anniBeneficio.map(a => ({ etichetta: "Anno " + a.anno, valore: formatCurrency(a.cumulato) })) },
    ...(r.detrazione ? [{ id: "confronto-detrazione", titolo: "Contributo o detrazione: alternative non cumulabili", righe: [{ etichetta: "Contributo GSE", valore: formatCurrency(r.contributo) }, { etichetta: "Detrazione alternativa", valore: formatCurrency(r.detrazione.totale) }, { etichetta: "Detrazione annua per 10 anni", valore: formatCurrency(r.detrazione.perAnno) }], nota: "Le due agevolazioni non si sommano sullo stesso intervento. Requisiti e capienza fiscale devono essere verificati." }] : []),
    { id: "documenti-incentivo", titolo: "Documenti per la pratica", righe: DOCUMENTI_CONTO_TERMICO.map(valore => ({ etichetta: "Da conservare", valore })), immagine: data.foto?.passaggi },
  ];
  dati.sezioniTecniche.find(s => s.id === "beneficio")!.grafico = { etichette: r.anniBeneficio.map(a => String(a.anno)), serie: [{ nome: "Beneficio cumulato EUR", valori: r.anniBeneficio.map(a => a.cumulato) }] };
  return <DocumentoEdilePDF dati={testiPerPdf(dati)} />;
}
