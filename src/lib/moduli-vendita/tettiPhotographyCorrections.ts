/** Data-only handoff for an explicitly requested, conservative local photo refresh.
 * Apply only when the saved photo still matches its captured old default and oldUrl.
 * Preserve custom photos, removals and unrelated fields; update the captured default
 * together with an applied correction. This module performs no migration or writes.
 */
export const TETTI_PHOTOGRAPHY_CORRECTIONS = {
  lattoneria: {
    pagina_percorso: {
      oldUrl: "/module-art/tetti-lattoneria-cover.jpg",
      newUrl: "/pdf-stock/comune/domande.jpg",
    },
  },
  isolamento: {
    pagina_chiusura: {
      oldUrl: "/pdf-stock/tetti/isolamento.jpg",
      newUrl: "/module-art/tetti.jpg",
    },
  },
  riparazioni: {
    pagina_chiusura: {
      oldUrl: "/module-art/tetti-riparazioni-cover.jpg",
      newUrl: "/pdf-stock/tetti/squadra.jpg",
    },
  },
  impermeabilizzazione: {
    protezione: {
      oldUrl: "/pdf-stock/tetti/protezione.jpg",
      newUrl: "/module-art/tetti-terrazzo-protezioni-v1.jpg",
    },
    controlli: {
      oldUrl: "/pdf-stock/tetti/controllo-termico.jpg",
      newUrl: "/module-art/tetti-terrazzo-raccordi-v1.jpg",
    },
    pagina_chiusura: {
      oldUrl: "/module-art/tetti-impermeabilizzazione-cover.jpg",
      newUrl: "/module-art/tetti-terrazzo-finitura.jpg",
    },
    pagina_percorso: {
      oldUrl: "/module-art/tetti-terrazzo-finitura.jpg",
      newUrl: "/pdf-stock/comune/domande.jpg",
    },
    diario: {
      oldUrl: "/pdf-stock/tetti/installazione.jpg",
      newUrl: "/module-art/tetti-impermeabilizzazione-cover.jpg",
    },
    // This was an implicit sector fallback, not necessarily stored in old defaults.
    // null means { foto: [], senzaFoto: true }; do not remove a custom timeline photo.
    pagina_tempi: {
      oldUrl: "/pdf-stock/tetti/installazione.jpg",
      newUrl: null as string | null,
    },
  },
} as const;
