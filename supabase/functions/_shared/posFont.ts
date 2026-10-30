import { FONT_CASELLE_BASE64 } from "./posFontCaselle.ts";

/**
 * Le caselle ☐ e ☒ del modello del decreto. Roboto, il font del PDF, non le ha: le disegna un mini-font di due glifi
 * (vedi scripts/genera-font-caselle-pos.ts), registrato con questa funzione sia dal server sia dal browser, così il
 * documento è identico ovunque lo si disegni.
 */
export const FONT_CASELLE = "PosCaselle";
export const CASELLA_SPUNTATA = "☒";
export const CASELLA_VUOTA = "☐";

/** La parte di pdfmake che serve per registrare un font (la stessa API in Deno e nel browser). */
export interface PdfMakeConFont {
  addVirtualFileSystem(vfs: Record<string, string>): void;
  addFonts(fonts: Record<string, Record<string, string>>): void;
}

export function registraFontPos(pdfMake: PdfMakeConFont): void {
  pdfMake.addVirtualFileSystem({ "PosCaselle.ttf": FONT_CASELLE_BASE64 });
  pdfMake.addFonts({ [FONT_CASELLE]: { normal: "PosCaselle.ttf", bold: "PosCaselle.ttf", italics: "PosCaselle.ttf", bolditalics: "PosCaselle.ttf" } });
}
