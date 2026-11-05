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
export { pianiDaPlanimetria, scenaEdificio, type OpzioniEdificio, type PianoPer3D } from "./edificio";
export { MATERIALI } from "./materiali";
export {
  ALTEZZA_OCCHI,
  apertureDelLocale,
  localeAllaPosizione,
  metadatiFotogramma,
  passoLibero,
  proietta,
  vistaDallAlto,
  vistaDalGiardino,
  vistaDentroLocale,
  type LatoEsterno,
  vistaGiroIntorno,
  type MetadatiFotogramma,
} from "./telecamera";
