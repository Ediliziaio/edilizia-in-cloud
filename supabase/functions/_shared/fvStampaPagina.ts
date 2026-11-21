/** I livelli trasformati di Google possono indurre Chromium a ridurre tutti i
 * fogli per includere le tile esterne. Il ritaglio conserva foto e attribuzioni
 * dentro la mappa. I nodi di servizio dopo i fogli non generano pagine vuote. */
export const STILE_STAMPA_PAGINE_FV = `@media print {
  html, body { width: 210mm; max-width: 210mm; }
  body > .page { contain: paint; }
  [data-fv-google-map] { contain: strict; clip-path: inset(0); }
  body > :not(.page) { display: none !important; }
  body > .page:not(:has(~ .page)) { break-after: auto !important; page-break-after: auto !important; }
}`;
