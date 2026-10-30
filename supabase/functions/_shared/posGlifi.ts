import vfs from "pdfmake-fonts";
import { create } from "fontkit";
import { Buffer } from "node:buffer";
import { sha256Hex } from "./improntaDocumento.ts";
import { FONT_CASELLE_BASE64 } from "./posFontCaselle.ts";

/**
 * Il controllo dei glifi e l'impronta dei font, separati dal disegno: la preparazione di un PDF che disegna il browser
 * li usa senza caricare pdfmake (il bundle da solo costa 100-300 ms di CPU a ogni avvio a freddo).
 */
const fonts = ["Roboto-Regular.ttf", "Roboto-Medium.ttf"];
const copertura = fonts.map(nome => create(Buffer.from(vfs[nome], "base64")));

/** Un carattere perso in silenzio in un documento di sicurezza è peggio di un errore: se manca un glifo si ferma, dicendo dove. */
export function verificaGlifiPos(testo: string): void {
  const caratteri = [...new Set([...testo].filter(c => !/[\r\n\t]/.test(c)))];
  const mancanti = caratteri.filter(c => copertura.some(f => !f.hasGlyphForCodePoint(c.codePointAt(0)!)));
  if (!mancanti.length) return;
  // Il codice da solo non dice dove: si riporta il pezzo di testo in cui il carattere compare.
  const dove = mancanti.slice(0, 3).map(c => {
    const i = testo.indexOf(c);
    const intorno = testo.slice(Math.max(0, i - 25), i + 26).replace(/\s+/g, " ").trim();
    return `${c} (U+${c.codePointAt(0)!.toString(16).toUpperCase()}) in «…${intorno}…»`;
  });
  throw new Error(`Il PDF richiede un font aggiuntivo per i caratteri ${mancanti.slice(0, 8).map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`).join(", ")}: togli o sostituisci ${dove.join("; ")}. Nessuna emissione è stata completata.`);
}

/** I font con cui si disegna: stessi byte per il server e per il browser (pdfmake è fissato alla stessa versione). */
export const fontsRiferimentoPos = async () => [
  ...await Promise.all(fonts.map(async nome => ({ nome, sha256: await sha256Hex(Buffer.from(vfs[nome], "base64")) }))),
  // Il mini-font delle caselle (posFont.ts): lo registrano allo stesso modo il server e il Worker del browser.
  { nome: "PosCaselle.ttf", sha256: await sha256Hex(Buffer.from(FONT_CASELLE_BASE64, "base64")) },
];
