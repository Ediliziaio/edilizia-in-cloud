/** Audited factory defaults. Data only: no automatic writes to saved drafts.
 * Main's opt-in refresh must match the old photo fields and preserve custom choices.
 * A null newUrl means text-only economics; move that illustration to the closing page.
 */
export interface IdrPhotoCorrection {
  moduleId: string;
  key: string;
  oldUrl: string;
  newUrl: string | null;
}
/** Shape consumed by the shared rev2 refresh: module -> block -> old/new URL. */
export const idrPhotoCorrectionMap = (changes: readonly IdrPhotoCorrection[]) =>
  changes.reduce<Record<string, Record<string, { oldUrl: string; newUrl: string | null }>>>((map, change) => {
    (map[change.moduleId] ??= {})[change.key] = { oldUrl: change.oldUrl, newUrl: change.newUrl };
    return map;
  }, {});
export const IDR_PHOTO_CORRECTIONS: readonly IdrPhotoCorrection[] = [
  {
    "moduleId": "caldaia",
    "key": "comeFunziona",
    "oldUrl": "/module-art/termoidraulica-caldaia.jpg",
    "newUrl": "/module-art/termoidraulica-caldaia-wide-v3.jpg"
  },
  {
    "moduleId": "pompa-calore",
    "key": "comeFunziona",
    "oldUrl": "/module-art/termoidraulica.jpg",
    "newUrl": "/pdf-stock/termoidraulico/pompa-di-calore.jpg"
  },
  {
    "moduleId": "manutenzione",
    "key": "comeFunziona",
    "oldUrl": "/module-art/termoidraulica.jpg",
    "newUrl": "/pdf-stock/termoidraulico/pompa-di-calore.jpg"
  },
  {
    "moduleId": "caldaia",
    "key": "controlli",
    "oldUrl": "/pdf-stock/comune/controllo-finale.jpg",
    "newUrl": "/module-art/termoidraulica-caldaia.jpg"
  },
  {
    "moduleId": "pompa-calore",
    "key": "controlli",
    "oldUrl": "/pdf-stock/comune/controllo-finale.jpg",
    "newUrl": "/module-art/termoidraulica.jpg"
  },
  {
    "moduleId": "ibrido",
    "key": "controlli",
    "oldUrl": "/pdf-stock/comune/controllo-finale.jpg",
    "newUrl": "/module-art/termoidraulica-caldaia.jpg"
  },
  {
    "moduleId": "terminali",
    "key": "controlli",
    "oldUrl": "/pdf-stock/comune/controllo-finale.jpg",
    "newUrl": "/module-art/termoidraulica-terminali-detail.jpg"
  },
  {
    "moduleId": "manutenzione",
    "key": "controlli",
    "oldUrl": "/pdf-stock/comune/controllo-finale.jpg",
    "newUrl": "/pdf-stock/termoidraulico/collaudo.jpg"
  },
  {
    "moduleId": "caldaia",
    "key": "pagina_chiusura",
    "oldUrl": "/module-art/termoidraulica-caldaia.jpg",
    "newUrl": "/pdf-stock/comune/domande.jpg"
  },
  {
    "moduleId": "manutenzione",
    "key": "pagina_chiusura",
    "oldUrl": "/pdf-stock/termoidraulico/collaudo.jpg",
    "newUrl": "/pdf-stock/comune/domande.jpg"
  },
  {
    "moduleId": "ibrido",
    "key": "pagina_chiusura",
    "oldUrl": "/module-art/termoidraulica-ibrido-cover-v2.jpg",
    "newUrl": "/module-art/termoidraulica-ibrido-cover.jpg"
  },
  {
    "moduleId": "acqua-calda",
    "key": "pagina_chiusura",
    "oldUrl": "/module-art/termoidraulica-acqua-calda-cover-v2.jpg",
    "newUrl": "/module-art/termoidraulica-acqua-calda-cover.jpg"
  },
  {
    "moduleId": "terminali",
    "key": "pagina_chiusura",
    "oldUrl": "/module-art/termoidraulica-terminali-cover.jpg",
    "newUrl": "/module-art/termoidraulica-terminali-closing-v3.jpg"
  },
  {
    "moduleId": "idrico",
    "key": "pagina_chiusura",
    "oldUrl": "/module-art/termoidraulica-idrico-cover.jpg",
    "newUrl": "/module-art/termoidraulica-acqua-calda-comfort.jpg"
  },
  {
    "moduleId": "ibrido",
    "key": "pagina_investimento",
    "oldUrl": "/module-art/termoidraulica-ibrido-cover.jpg",
    "newUrl": null
  },
  {
    "moduleId": "acqua-calda",
    "key": "pagina_investimento",
    "oldUrl": "/module-art/termoidraulica-acqua-calda-cover.jpg",
    "newUrl": null
  },
  {
    "moduleId": "idrico",
    "key": "pagina_investimento",
    "oldUrl": "/module-art/termoidraulica-acqua-calda-comfort.jpg",
    "newUrl": null
  }
];

export const IDR_PHOTOGRAPHY_CORRECTIONS = idrPhotoCorrectionMap(IDR_PHOTO_CORRECTIONS);
