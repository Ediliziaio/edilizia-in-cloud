import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { AllegatoPdfComputo } from "./allegatiLocali";

/** Le tavole rimangono vettoriali: si incorporano in nuove pagine, mai rasterizzate. */
export async function appendiAllegatiPdf(base: ArrayBuffer, allegati: AllegatoPdfComputo[]): Promise<Blob> {
  const doc = await PDFDocument.load(new Uint8Array(base));
  const basePages = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ascii = (s: string) => s.normalize("NFKD").replace(/[^\x20-\x7e]/g, "");
  for (const a of allegati) {
    const bytes = new Uint8Array(await a.blob.arrayBuffer());
    const titolo = `${a.tipo === "foto" ? "Foto" : a.tipo === "render" ? "Render" : "Planimetria"} | ${ascii(a.nome)}`;
    const add = (width: number, height: number) => {
      const page = doc.addPage(width > height ? [842, 595] : [595, 842]);
      const { width: w } = page.getSize();
      let label = titolo;
      while (font.widthOfTextAtSize(label, 10) > w - 80 && label.length > 4) label = `${label.slice(0, -4)}...`;
      page.drawText(label, { x: 40, y: page.getHeight() - 35, size: 10, font, color: rgb(.12, .23, .37) });
      return page;
    };
    if (a.blob.type === "application/pdf") {
      const source = await PDFDocument.load(bytes);
      if (source.getPageCount() > 30) throw new Error(`L'allegato ${a.nome} supera 30 pagine.`);
      if (doc.getPageCount() - basePages + source.getPageCount() > 100) throw new Error("Gli allegati superano 100 pagine complessive.");
      for (const p of source.getPages()) {
        const embedded = await doc.embedPage(p);
        const page = add(p.getWidth(), p.getHeight());
        const scale = Math.min((page.getWidth() - 80) / embedded.width, (page.getHeight() - 110) / embedded.height);
        page.drawPage(embedded, { x: (page.getWidth() - embedded.width * scale) / 2, y: (page.getHeight() - embedded.height * scale) / 2 - 8, width: embedded.width * scale, height: embedded.height * scale });
      }
    } else {
      const image = a.blob.type === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const page = add(image.width, image.height);
      const scale = Math.min((page.getWidth() - 80) / image.width, (page.getHeight() - 110) / image.height);
      page.drawImage(image, { x: (page.getWidth() - image.width * scale) / 2, y: (page.getHeight() - image.height * scale) / 2 - 8, width: image.width * scale, height: image.height * scale });
    }
  }
  const pages = doc.getPages();
  pages.forEach((page, n) => page.drawText(`Bozza locale | Pagina ${n + 1} di ${pages.length}`, { x: 40, y: 20, size: 7, font, color: rgb(.38, .44, .52) }));
  return new Blob([await doc.save() as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
}
