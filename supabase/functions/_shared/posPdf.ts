import pdfMake from "pdfmake";
import vfs from "pdfmake-fonts";
import { create } from "fontkit";
import { Buffer } from "node:buffer";
import { costruisciHtmlPos, type DatiStampaPos } from "./posHtml.ts";
import { layoutPdfPos } from "./posPdfLayout.ts";
import { sha256Hex } from "./improntaDocumento.ts";

pdfMake.addVirtualFileSystem(vfs);
const fonts = ["Roboto-Regular.ttf", "Roboto-Medium.ttf"];
const copertura = fonts.map(nome => create(Buffer.from(vfs[nome], "base64")));
export const VERSIONE_RENDERER_POS = "pos-pdf-9-riferimento-psc/pdfmake-0.3.9";

export async function generaPdfPos(dati: DatiStampaPos, emessoIl: string, opzioni: { anteprima?: boolean } = {}): Promise<{ bytes: Uint8Array; html: string; fonts: Array<{ nome: string; sha256: string }>; sezioni: string[] }> {
  if (!opzioni.anteprima && dati.stato !== "approvato") throw new Error("Emetti soltanto un contenuto POS approvato");
  if (!Number.isFinite(Date.parse(emessoIl))) throw new Error("Data di emissione non valida");
  const html = costruisciHtmlPos(opzioni.anteprima ? {...dati,stato:"bozza"} : dati);
  const layout = layoutPdfPos(html, dati.codiceCommessa || "Commessa", dati.revisione, emessoIl, opzioni.anteprima===true);
  const caratteri = [...new Set([...layout.testo].filter(c => !/[\r\n\t]/.test(c)))];
  const mancanti = caratteri.filter(c => copertura.some(f => !f.hasGlyphForCodePoint(c.codePointAt(0)!)));
  if (mancanti.length) throw new Error(`Il PDF richiede un font aggiuntivo per i caratteri ${mancanti.slice(0, 8).map(c => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`).join(", ")}. Nessuna emissione è stata completata.`);
  const pdf = await pdfMake.createPdf(layout.definizione).getBuffer();
  const bytes = new Uint8Array(pdf);
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Il generatore non ha prodotto un PDF");
  return { bytes, html, sezioni: layout.sezioni, fonts: await Promise.all(fonts.map(async nome => ({ nome, sha256: await sha256Hex(Buffer.from(vfs[nome], "base64")) }))) };
}
