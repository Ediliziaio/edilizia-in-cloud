/** Data-only handoff for main's opt-in saved-default refresh.
 * Match the stored previous default AND the current photo; preserve removals/custom photos.
 * Original assets were not overwritten: every crop fix uses a new URL.
 */
export const CLM_PHOTO_CORRECTIONS = {
  canalizzato: {
    comeFunziona: { oldUrl: "/module-art/climatizzazione-canalizzato-editorial.jpg", newUrl: "/module-art/climatizzazione-canalizzato-detail.jpg" },
    controlli: { oldUrl: "/pdf-stock/comune/controllo-finale.jpg", newUrl: "/module-art/climatizzazione-canalizzato-editorial.jpg" },
  },
  vmc: {
    comeFunziona: { oldUrl: "/module-art/climatizzazione-vmc-editorial.jpg", newUrl: "/module-art/climatizzazione-vmc-centered.jpg" },
    controlli: { oldUrl: "/pdf-stock/comune/controllo-finale.jpg", newUrl: "/module-art/climatizzazione-vmc-editorial.jpg" },
  },
  manutenzione: {
    comeFunziona: { oldUrl: "/pdf-stock/climatizzazione/installazione.jpg", newUrl: "/module-art/climatizzazione-manutenzione-filtri.jpg" },
  },
} as const;

/** Cover fields live outside pdf_blocchi: do not pass this map to block refresh.
 * Both cover_image_url and pdf_cover_image_url are factory aliases.
 * VMC's new overlay is 45 (previous default 70); preserve custom cover styling.
 */
export const CLM_COVER_PHOTO_CORRECTIONS = {
  vmc: { oldUrl: "/module-art/climatizzazione-vmc-editorial.jpg", newUrl: "/module-art/climatizzazione-vmc-centered.jpg" },
} as const;
