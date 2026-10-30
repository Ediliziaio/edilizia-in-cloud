import pdfMake from "pdfmake";
import vfs from "pdfmake-fonts";
import { costruisciHtmlPos, type DatiStampaPos } from "./posHtml.ts";
import { layoutPdfPos } from "./posPdfLayout.ts";
import { fontsRiferimentoPos, verificaGlifiPos } from "./posGlifi.ts";
import { VERSIONE_RENDERER_POS } from "./posRenderer.ts";

pdfMake.addVirtualFileSystem(vfs);
export { VERSIONE_RENDERER_POS };

export async function generaPdfPos(dati: DatiStampaPos, emessoIl: string, opzioni: { anteprima?: boolean } = {}): Promise<{ bytes: Uint8Array; html: string; fonts: Array<{ nome: string; sha256: string }>; sezioni: string[] }> {
  if (!opzioni.anteprima && dati.stato !== "approvato") throw new Error("Emetti soltanto un contenuto POS approvato");
  if (!Number.isFinite(Date.parse(emessoIl))) throw new Error("Data di emissione non valida");
  const html = costruisciHtmlPos(opzioni.anteprima ? {...dati,stato:"bozza"} : dati);
  const layout = layoutPdfPos(html, dati.codiceCommessa || "Commessa", dati.revisione, emessoIl, opzioni.anteprima===true);
  verificaGlifiPos(layout.testo);
  const pdf = await pdfMake.createPdf(layout.definizione).getBuffer();
  const bytes = new Uint8Array(pdf);
  if (bytes.length < 5 || new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Il generatore non ha prodotto un PDF");
  return { bytes, html, sezioni: layout.sezioni, fonts: await fontsRiferimentoPos() };
}
