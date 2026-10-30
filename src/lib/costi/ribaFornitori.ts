// ============================================================================
// Le RiBa ai fornitori: stati, azioni e i numeri del riquadro di Tesoreria
// ----------------------------------------------------------------------------
// Logica pura, separata dal componente perché si possa provare da sola.
// La fonte è la vista `v_riba_fornitori`: una riga per RiBa, da `rate_fornitori`.
// ============================================================================

/** Gli stati che una persona registra; gli altri si calcolano dalla data. */
export type StatoRegistrato = "da_pagare" | "avvisata" | "da_bloccare" | "richiamata" | "pagata" | "insoluta";

export interface RibaFornitore {
  /** NULL solo per un costo segnato RiBa a mano senza rate. */
  rata_id: string | null;
  cost_id: string;
  fornitore: string | null;
  order_code: string | null;
  numero_fattura: string | null;
  numero_rata: number;
  rate_riba_della_fattura: number;
  scadenza: string | null;
  importo: number | null;
  stato: "pagata" | "passata" | "in_arrivo" | "futura" | "senza_data"
       | "avvisata" | "da_bloccare" | "richiamata" | "insoluta";
  giorni: number | null;
}

/** Il menu di una RiBa: in quest'ordine, quello in cui le cose succedono. */
export const AZIONI_RIBA: { stato: StatoRegistrato; label: string }[] = [
  { stato: "avvisata", label: "La banca l'ha avvisata" },
  { stato: "pagata", label: "Addebitata (pagata)" },
  { stato: "da_bloccare", label: "Da bloccare" },
  { stato: "richiamata", label: "Richiamata (bloccata)" },
  { stato: "insoluta", label: "Insoluta" },
  { stato: "da_pagare", label: "Rimetti da pagare" },
];

/** I numeri del riquadro, calcolati a parte per poterli provare. */
export function riepilogoRiba(righe: RibaFornitore[], liquidita: number | null) {
  const somma = (r: RibaFornitore[]) => r.reduce((s, x) => s + Number(x.importo ?? 0), 0);
  // In arrivo vuol dire «la banca la addebiterà entro 30 giorni»: anche se è
  // già stata avvisata, o se è da bloccare ma nessuno l'ha ancora fermata.
  const inArrivo = righe.filter(
    (r) => r.stato === "in_arrivo"
      || ((r.stato === "avvisata" || r.stato === "da_bloccare") && r.giorni != null && r.giorni >= 0 && r.giorni <= 30),
  );
  const passate = righe.filter((r) => r.stato === "passata");
  const insolute = righe.filter((r) => r.stato === "insoluta");
  const totaleInArrivo = somma(inArrivo);
  return {
    inArrivo,
    passate,
    insolute,
    totaleInArrivo,
    totalePassate: somma(passate),
    totaleInsolute: somma(insolute),
    // Senza un conto collegato la copertura non si sa: NULL, non «coperta».
    scoperto: liquidita == null ? null : Math.max(0, totaleInArrivo - liquidita),
  };
}
