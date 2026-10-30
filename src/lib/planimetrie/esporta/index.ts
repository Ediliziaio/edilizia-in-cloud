/**
 * Esportazioni 2D della pianta: PDF in scala con cartiglio, DXF a layer,
 * SVG e PNG, pianta da presentazione. Il 3D (glTF, OBJ) sta in `../tred`.
 *
 * Le funzioni pesanti si caricano solo quando servono: il PDF importa pdf-lib
 * al momento dell'esportazione, il PNG usa il canvas del browser.
 */
export * from "./tipi";
export { vistaDaPlanimetria, type ModoVista, type SceltaVista } from "./adattatore";
export { PIANTA_ESEMPIO } from "./esempio";
export { costruisciScena, type Scena, type Primitiva, type NomeLayer, type OpzioniScena } from "./scena";
export { esportaSvg, scenaInSvg, type OpzioniSvg, type RisultatoSvg } from "./svg";
export { esportaPng, dimensioniPng, type OpzioniPng, type RisultatoPng } from "./png";
export { esportaDxf, LAYER_DXF, type OpzioniDxf, type RisultatoDxf, type UnitaDxf } from "./dxf";
export type { MotoreDxf } from "./dxf/motore";
export { esportaPdf, pianificaPdf, ErroreImpaginazione, type OpzioniPdf, type RisultatoPdf } from "./pdf";
export { SCALE_STANDARD, type FormatoFoglio, type Orientamento } from "./impaginazione";
export { aziendaDelCartiglio, caricaLogo } from "./cartiglio";
export { allegatoPreventivo, nomeFilePianta, type AllegatoPianta } from "./allegato";
