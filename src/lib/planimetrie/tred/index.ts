/**
 * 3D delle planimetrie — parte pura (senza three.js).
 *
 *   modello ──pianteDaPlanimetria──▶ PiantaPer3D ──costruisciScena──▶ Scena3D ──▶ visore (three.js)
 *                                                                       ├─▶ esportaGlb / esportaObj
 *                                                                       └─▶ fotogramma + metadatiFotogramma (render AI)
 */
export * from "./tipi";
export { daStatoPianta, pianteDaPlanimetria, rotazione3D } from "./adattatore";
export { BILOCALE_DA_RISTRUTTURARE } from "./esempio";
export { costruisciScena, limitiDi, muroPresente, comeApertura } from "./scena";
export { esportaGlb, esportaObj } from "./esporta";
export { MATERIALI } from "./materiali";
export {
  ALTEZZA_OCCHI,
  apertureDelLocale,
  metadatiFotogramma,
  proietta,
  vistaDallAlto,
  vistaDentroLocale,
  vistaGiroIntorno,
  type MetadatiFotogramma,
} from "./telecamera";
