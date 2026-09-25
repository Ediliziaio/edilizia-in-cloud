/** Read-only handoff for an explicit, conservative refresh; this module performs no migration.
 * oldUrl is the previous factory/helper default (null = an empty photo array).
 * Never replace an arbitrary current photo or a user's explicit removal.
 */
export const RST_PHOTO_CORRECTIONS = {
  completa: {
    diario: { oldUrl: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg", newUrl: "/pdf-stock/comune/lavorazioni-nascoste.jpg" },
  },
  parziale: {
    comeFunziona: { oldUrl: null as string | null, newUrl: "/pdf-stock/pavimenti/installazione.jpg" },
  },
  commerciale: {
    comeFunziona: { oldUrl: null as string | null, newUrl: "/module-art/ristrutturazioni-commerciale-cantiere.jpg" },
    documenti: { oldUrl: "/pdf-stock/comune/consegna-documenti.jpg", newUrl: "/pdf-stock/ristrutturazione/cantiere.jpg" },
  },
  spazi: {},
  computo: {
    comeFunziona: { oldUrl: "/pdf-stock/ristrutturazione/controllo-planarita.jpg", newUrl: "/pdf-stock/pavimenti/materiali.jpg" },
    diario: { oldUrl: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg", newUrl: "/pdf-stock/pavimenti/installazione.jpg" },
    // Previously populated by helper with the COVER, then suppressed in the PDF.
    pagina_chiusura: { oldUrl: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg", newUrl: "/module-art/pavimenti.jpg" },
  },
} as const;
