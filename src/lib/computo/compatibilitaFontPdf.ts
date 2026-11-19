import { PDFDocument, PDFDict, PDFArray, PDFName, PDFString } from "pdf-lib";

/**
 * jsPDF scrive «Identity-H» anche come nome della collezione CID dei TTF.
 * L'encoding è Identity-H, ma la collezione Adobe è Identity: alcuni lettori
 * e stampanti segnalano il documento come non valido senza questa correzione.
 */
export async function normalizzaFontPdf(bytes: ArrayBuffer): Promise<Blob> {
  const doc = await PDFDocument.load(bytes);
  for (const page of doc.getPages()) {
    const font = page.node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (!font) continue;
    for (const [, riferimento] of font.entries()) {
      const dizionario = doc.context.lookup(riferimento);
      if (!(dizionario instanceof PDFDict) || dizionario.get(PDFName.of("Encoding"))?.toString() !== "/Identity-H") continue;
      const discendenti = dizionario.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
      for (let k = 0; k < (discendenti?.size() ?? 0); k++) {
        const cid = discendenti!.lookup(k, PDFDict);
        const info = cid.lookupMaybe(PDFName.of("CIDSystemInfo"), PDFDict);
        const registry = info?.lookupMaybe(PDFName.of("Registry"), PDFString)?.decodeText();
        const ordering = info?.lookupMaybe(PDFName.of("Ordering"), PDFString)?.decodeText();
        if (registry === "Adobe" && ordering === "Identity-H") info!.set(PDFName.of("Ordering"), PDFString.of("Identity"));
      }
    }
  }
  return new Blob([Uint8Array.from(await doc.save()).buffer], { type: "application/pdf" });
}
