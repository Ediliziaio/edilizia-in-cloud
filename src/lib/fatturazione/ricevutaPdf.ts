// Fattura ricevuta caricata da PDF (09/11/2026), tipicamente da un fornitore estero.
// Non è un documento SDI: IVA a zero finché non c'è l'integrazione, che è ciò che la
// fa entrare nei registri: niente natura N6 qui, che la porterebbe subito in liquidazione.
// Importo = imponibile.

export interface RicevutaPdfForm {
  fornitore: string;
  partitaIva: string;
  paese: string;
  numero: string;
  data: string;
  totale: string;
  indirizzo: string;
  cap: string;
  comune: string;
}

/** «1.234,56», «1234.56», «1234,5»: il numero che l'utente intende. */
export function importoDaTesto(testo: string): number {
  const t = testo.trim().replace(/\s|€/g, "");
  const n = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const v = Number(n);
  return Number.isFinite(v) ? v : NaN;
}

export function problemiRicevutaPdf(f: RicevutaPdfForm): string[] {
  const p: string[] = [];
  if (!f.fornitore.trim()) p.push("il fornitore");
  if (!/^[A-Za-z]{2}$/.test(f.paese.trim())) p.push("il paese (due lettere, es. DE)");
  if (!f.numero.trim()) p.push("il numero");
  if (!f.data) p.push("la data");
  if (!f.indirizzo.trim()) p.push("l'indirizzo");
  if (!f.comune.trim()) p.push("il comune");
  const v = importoDaTesto(f.totale);
  if (Number.isNaN(v) || v <= 0) p.push("l'importo");
  return p;
}

export function righeRicevutaPdf(f: RicevutaPdfForm) {
  const importo = importoDaTesto(f.totale);
  const paese = f.paese.trim().toUpperCase();
  const id = f.partitaIva.trim().replace(/^IT/i, "") || null;
  return {
    cedente_ragione_sociale: f.fornitore.trim(),
    cedente_piva: id,
    cedente_paese: paese,
    tipo_documento: "TD01",
    numero_fattura: f.numero.trim(),
    data_fattura: f.data,
    imponibile_totale: importo,
    iva_totale: 0,
    totale_documento: importo,
    cedente_indirizzo: f.indirizzo.trim(),
    cedente_cap: f.cap.trim() || null,
    cedente_comune: f.comune.trim(),
    riepilogo_iva: [] as unknown[],
  };
}
