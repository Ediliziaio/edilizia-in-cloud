/**
 * Testo di un .docx lato client (JSZip è già nel bundle): word/document.xml →
 * paragrafi. Basta per mandare le condizioni all'AI che le riordina.
 */
import JSZip from "jszip";

export async function estraiTestoDocx(file: File): Promise<string> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("Il file non sembra un documento Word (.docx) valido");
  const xml = await doc.async("string");
  const testo = xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!testo) throw new Error("Il documento Word è vuoto");
  return testo;
}
