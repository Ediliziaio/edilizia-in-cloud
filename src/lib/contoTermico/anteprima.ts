/**
 * Il preventivo d'esempio: lo usano l'anteprima del modello e la prova del PDF.
 * Numeri verosimili ma dimostrativi, dichiarati come tali.
 */
import type { ContoTermicoPdfData, FotoContoTermico } from "@/components/termoidraulico/contoTermico/ContoTermicoPDF";
import type { InterventoContoTermico } from "./regole";
import { economiaContoTermico, type DatiContoTermico } from "./dati";

/** Le foto di serie del modello, finché non ci sono quelle dedicate. */
export const FOTO_CONTO_TERMICO_DI_SERIE: Partial<Record<FotoContoTermico, string>> = {
  copertina: "/pdf-stock/termoidraulico/pompa-di-calore.jpg",
  cosaVuolDire: "/pdf-stock/comune/consegna-documenti.jpg",
  oggi: "/module-art/termoidraulica-caldaia.jpg",
  domani: "/module-art/termoidraulica-pompa-calore-cover.jpg",
  interno: "/module-art/termoidraulica.jpg",
  dettaglio: "/pdf-stock/ristrutturazione/tecnica-riscaldamento-pavimento.jpg",
  incentivo: "/pdf-stock/fotovoltaico/consegna-app.jpg",
  installazione: "/module-art/termoidraulica-acqua-calda-verifica.jpg",
  comfort: "/pdf-stock/termoidraulico/risultato.jpg",
  passaggi: "/pdf-stock/comune/domande.jpg",
  decisione: "/module-art/termoidraulica-terminali-closing-v3.jpg",
};

/** «Domani» cambia col tipo d'intervento; senza foto adatta la scheda resta senza. */
export const FOTO_DOMANI_PER_TIPO: Record<InterventoContoTermico, string | null> = {
  pompa_calore: "/module-art/termoidraulica-pompa-calore-cover.jpg",
  ibrido: "/module-art/termoidraulica-ibrido-cover-v2.jpg",
  scaldacqua_pdc: "/module-art/termoidraulica-acqua-calda-cover-v2.jpg",
  solare_termico: null,
  biomassa: null,
};

/** I dati d'esempio del preventivo: li usano l'anteprima della libreria e la prova del PDF. */
export const DATI_CONTO_TERMICO_DIMOSTRATIVI: DatiContoTermico = {
  tipo: "pompa_calore",
  titolo: "Pompa di calore aria-acqua 8 kW",
  impianto_attuale: "Caldaia a gas del 2008",
  potenza_kw: 8,
  contributo: 4800,
  modalita: "sconto_in_fattura",
  spesa_annua_attuale: 2100,
  spesa_annua_nuova: 1000,
  aumento_energia_pct: 2,
  anni: 15,
  detrazione_confronto: 50,
  caratteristiche: [
    { etichetta: "Potenza termica nominale", valore: "8 kW" },
    { etichetta: "Efficienza stagionale (SCOP, 35 °C)", valore: "4,6" },
    { etichetta: "Classe energetica (35 °C)", valore: "A+++" },
    { etichetta: "Refrigerante", valore: "R290 · GWP 3" },
    { etichetta: "Temperatura di mandata", valore: "fino a 70 °C" },
    { etichetta: "Bollitore acqua calda", valore: "200 litri" },
    { etichetta: "Rumore unità esterna", valore: "48 dB(A)" },
    { etichetta: "Comando", valore: "Termostato e app" },
  ],
};

export function anteprimaContoTermico(foto: Partial<Record<FotoContoTermico, string | null>> = FOTO_CONTO_TERMICO_DI_SERIE): ContoTermicoPdfData {
  return {
    azienda: { nome: "La tua azienda", telefono: "+39 02 000 000", email: "info@azienda.it", sito: "azienda.it", piva: "IT00000000000" },
    cliente: { nome: "Mario Rossi", indirizzo: "Via Roma 1, 20100 Milano (MI)" },
    preventivo: { codice: "CT-ESEMPIO", dataIso: "2026-09-25T10:00:00Z", validitaGiorni: 30, consulente: "Il tuo consulente" },
    intervento: {
      tipo: DATI_CONTO_TERMICO_DIMOSTRATIVI.tipo,
      titolo: DATI_CONTO_TERMICO_DIMOSTRATIVI.titolo,
      impiantoAttuale: DATI_CONTO_TERMICO_DIMOSTRATIVI.impianto_attuale,
      voci: [
        { descrizione: "Pompa di calore aria-acqua monoblocco 8 kW, refrigerante R290" },
        { descrizione: "Modulo idronico interno con regolazione climatica" },
        { descrizione: "Bollitore per l'acqua calda sanitaria da 200 litri" },
        { descrizione: "Valvole termostatiche sui radiatori", quantita: 6, unita: "pz" },
        { descrizione: "Smontaggio e smaltimento della caldaia esistente, con certificato" },
        { descrizione: "Collegamenti idraulici ed elettrici, messa in funzione e collaudo" },
        { descrizione: "Pratica Conto Termico: raccolta dei documenti e invio al GSE" },
      ],
      caratteristiche: DATI_CONTO_TERMICO_DIMOSTRATIVI.caratteristiche,
    },
    economia: economiaContoTermico(DATI_CONTO_TERMICO_DIMOSTRATIVI, 12900, 10),
    foto,
  };
}
