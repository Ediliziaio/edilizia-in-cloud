import React from "react";
import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";
import { buildMockPdfData } from "@/lib/serramenti/mockPdfData";
import { SerramentoPDF } from "@/components/serramenti/SerramentoPDF";
import { srEditorPreviewSection, srPreviewPage, srSectionAnchor, withSrSectionAnchor } from "@/components/serramenti/srSemanticPreview";
import { PAGINE_EDITOR_SERRAMENTI } from "@/components/preventivi/pagineEditor";

// The renderer supports View bookmarks; its published ViewProps omit that field.
const BookmarkView = View as React.ComponentType<React.ComponentProps<typeof View> & { bookmark: string }>;

vi.mock("@/lib/storage/immaginiModelloPdf", () => ({ CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (v: unknown) => v, firmaImmaginiModello: async (v: unknown) => v }));
vi.mock("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: () => { throw new Error("No network in anchor QA"); } }));
vi.mock("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url || url.startsWith("data:")) return url;
  if (url.startsWith(window.location.origin + "/")) url = new URL(url).pathname;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  const bytes = await readFile(path.resolve("public", url.slice(1)));
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
} }));

async function pdfDoc(element: React.ReactElement) {
  const bytes = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  return getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
}
const stripAnchors = (node: React.ReactNode): React.ReactNode => {
  if (Array.isArray(node)) return node.map(stripAnchors);
  if (!React.isValidElement<{ children?: React.ReactNode; bookmark?: string }>(node)) return node;
  const children = stripAnchors(node.props.children);
  return React.cloneElement(node, { bookmark: undefined }, ...(Array.isArray(children) ? children : [children]));
};
// PDF.js prefixes resource names with its document-load counter, not PDF content.
const sameResources = (value: unknown) => JSON.stringify(value).replace(/g_d\d+_/g, "g_document_");

describe("Sr semantic PDF metadata (real renderer, offline, no files written)", () => {
  it("maps every document section without reading editable headings", () => {
    for (const section of PAGINE_EDITOR_SERRAMENTI.filter(p => p.pagina)) expect(srEditorPreviewSection(section.id)).toBe(section.pagina);
    expect(srEditorPreviewSection("page_cover")).toBe("cover");
    expect(srEditorPreviewSection("page_consulente")).toBe("allegato_tecnico");
    expect(srEditorPreviewSection("condizioni")).toBe("condizioni");
    for (const id of ["brand", "default", "page_ordine", "not-a-section"]) expect(srEditorPreviewSection(id)).toBeNull();
  });

  it("resolves renamed/reordered chapters and leaves absent sections alone; geometry is unchanged", async () => {
    const template = createFullSerramentiTemplate({ company_id: "qa", ragione_sociale: "Impresa esempio" }, "finestre");
    template.pdf_blocchi!.controlli = { ...template.pdf_blocchi!.controlli as object, titolo: "Titolo completamente personalizzato" };
    const order = template.pdf_pages_order!;
    template.pdf_pages_order = [order.find(p => p.id === "controlli")!, ...order.filter(p => p.id !== "controlli")].map(p => p.id === "diario" ? { ...p, visible: false } : p);
    const payload = await buildMockPdfData({ template, moduleId: "finestre", companyName: "Impresa esempio" });
    const tree = SerramentoPDF(payload);
    const marked = await pdfDoc(tree);
    const plain = await pdfDoc(stripAnchors(tree) as React.ReactElement);
    try {
      expect(marked.numPages).toBe(plain.numPages);
      expect(await srPreviewPage(marked, "cover")).toBe(1);
      const actual = await srPreviewPage(marked, "controlli");
      expect(actual).not.toBeNull();
      expect(actual).toBeLessThan((await srPreviewPage(marked, "proposta"))!);
      const texts = await (await marked.getPage(actual!)).getTextContent();
      expect(texts.items.map(i => "str" in i ? i.str : "").join(" ")).toContain("Titolo completamente personalizzato");
      expect(await srPreviewPage(marked, "diario")).toBeNull();
      expect(await srPreviewPage(marked, "gallery_lavori")).toBeNull();
      for (let page = 1; page <= marked.numPages; page++) {
        const a = await marked.getPage(page), b = await plain.getPage(page);
        expect(a.view).toEqual(b.view);
        expect(sameResources((await a.getTextContent()).items)).toBe(sameResources((await b.getTextContent()).items));
        const oa = await a.getOperatorList(), ob = await b.getOperatorList();
        expect(oa.fnArray).toEqual(ob.fnArray);
        expect(sameResources(oa.argsArray)).toBe(sameResources(ob.argsArray));
      }
    } finally { await marked.loadingTask.destroy(); await plain.loadingTask.destroy(); }
  }, 60000);

  it("keeps first-page metadata for split chapters, grouped sections and multi-Page fragments", async () => {
    const chapter = <><Page key="first" size="A4" style={{ padding: 40 }}><Text>Long chapter</Text>{Array.from({ length: 100 }, (_, i) => <Text key={i} style={{ fontSize: 12, marginBottom: 10 }}>Line {i}: renamed content without lookup keywords.</Text>)}</Page><Page key="continuation"><Text>Explicit continuation</Text></Page></>;
    const pdf = await pdfDoc(<Document>
      <Page><Text>Unrelated introduction</Text></Page>
      {withSrSectionAnchor(chapter, "documenti")}
      <Page><BookmarkView bookmark={srSectionAnchor("controlli")}><Text>Unrelated heading A</Text></BookmarkView><BookmarkView bookmark={srSectionAnchor("diario")}><Text>Unrelated heading B</Text></BookmarkView></Page>
    </Document>);
    try {
      const first = await srPreviewPage(pdf, "documenti");
      expect(first).not.toBeNull();
      const content = await (await pdf.getPage(first!)).getTextContent();
      expect(content.items.map(i => "str" in i ? i.str : "").join(" ")).toContain("Line 0:");
      expect(pdf.numPages).toBeGreaterThan(4);
      expect(await srPreviewPage(pdf, "controlli")).toBe(await srPreviewPage(pdf, "diario"));
      expect(await srPreviewPage(pdf, "absent")).toBeNull();
    } finally { await pdf.loadingTask.destroy(); }
  }, 30000);
});
