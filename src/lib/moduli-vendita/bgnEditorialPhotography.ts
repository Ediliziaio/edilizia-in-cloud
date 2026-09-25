/** Local editorial assets. No renderer, factory or storage dependency. */
export const BGN_ACCESSIBILITY_CHECK_IMAGE = "/module-art/bagni-accessibilita-verifica-supporti-v1.jpg";
export const BGN_ACCESSIBILITY_CLOSING_IMAGE = "/module-art/bagni-accessibilita-chiusura-v1.jpg";
export const BGN_FIXTURE_CHECK_IMAGE = "/module-art/bagni-verifica-lavabo-v1.jpg";
export const BGN_FINISH_CHECK_IMAGE = "/module-art/bagni-rinnovo-verifica-finiture-v1.jpg";
export const BGN_SHOWER_CHECK_IMAGE = "/pdf-stock/bagni/controllo-impermeabilizzazione.jpg";

export const BGN_CHECK_IMAGES = {
  completo: BGN_SHOWER_CHECK_IMAGE,
  "vasca-doccia": BGN_SHOWER_CHECK_IMAGE,
  doccia: BGN_SHOWER_CHECK_IMAGE,
  sanitari: BGN_FIXTURE_CHECK_IMAGE,
  accessibilita: BGN_ACCESSIBILITY_CHECK_IMAGE,
  rinnovo: BGN_FINISH_CHECK_IMAGE,
} as const;

export const BGN_GENERATED_CHECK_IMAGES: readonly string[] = [
  BGN_ACCESSIBILITY_CHECK_IMAGE, BGN_FIXTURE_CHECK_IMAGE, BGN_FINISH_CHECK_IMAGE,
];

/** Proposed rev2 replacements for the main-owned, opt-in conservative refresh.
 * Apply only when the CURRENT photo still equals oldUrl; never replace custom
 * photos or an explicit senzaFoto choice. Doccia already has the correct photo.
 * No migration is performed merely by importing this map.
 */
const oldChecks = "/pdf-stock/comune/controllo-finale.jpg";
export const BGN_EDITORIAL_PHOTO_REPLACEMENTS = {
  completo: { controlli: { oldUrl: oldChecks, newUrl: BGN_SHOWER_CHECK_IMAGE } },
  "vasca-doccia": { controlli: { oldUrl: oldChecks, newUrl: BGN_SHOWER_CHECK_IMAGE } },
  doccia: {},
  sanitari: { controlli: { oldUrl: oldChecks, newUrl: BGN_FIXTURE_CHECK_IMAGE } },
  accessibilita: {
    pagina_chiusura: { oldUrl: "/module-art/bagni-accessibilita-cover.jpg", newUrl: BGN_ACCESSIBILITY_CLOSING_IMAGE },
    controlli: { oldUrl: oldChecks, newUrl: BGN_ACCESSIBILITY_CHECK_IMAGE },
    comeFunziona: { oldUrl: "/module-art/bagni-rubinetteria-banner.jpg", newUrl: BGN_ACCESSIBILITY_CHECK_IMAGE },
    diario: { oldUrl: "/pdf-stock/bagni/installazione.jpg", newUrl: BGN_ACCESSIBILITY_CHECK_IMAGE },
  },
  rinnovo: { controlli: { oldUrl: oldChecks, newUrl: BGN_FINISH_CHECK_IMAGE } },
} as const;
