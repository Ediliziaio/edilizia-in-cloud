import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { FinitureSceltePdf, PresentazioneProdottoPdf } from "@/components/serramenti/PresentazioneProdottoPdf";
import { PianoLavoriEditorialePdf } from "@/components/serramenti/PianoLavoriEditorialePdf";

beforeAll(() => vi.stubGlobal("Uint8Array", Object.getPrototypeOf(Buffer.prototype).constructor));
afterAll(() => vi.unstubAllGlobals());

async function leggi(children: import("react").ReactNode) {
  const bytes = await renderToBuffer(<Document><Page size="A4" style={{ padding: 44 }}>{children}</Page></Document>);
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const items = (await page.getTextContent()).items.filter(x => "str" in x);
    pages.push(items.map(x => (x as { str: string }).str).join(" "));
  }
  await task.destroy();
  return pages;
}

describe("Schede editoriali serramenti senza contenuti inventati", () => {
  it("senza immagine non aggiunge un segnaposto e conserva tutti i dati", async () => {
    const dati = Array.from({ length: 8 }, (_, i) => ({ etichetta: `Parametro ${i}`, valore: `Dato reale ${i}` }));
    const pages = await leggi(<PresentazioneProdottoPdf immagine={null} dati={dati} colore="#FFFFFF" />);
    expect(pages).toHaveLength(1);
    for (const d of dati) expect(pages.join(" ")).toContain(d.valore);
    expect(pages.join(" ")).not.toContain("Immagine di catalogo");
  });
  it("i valori lunghi escono dalle tre evidenze ma non vengono tagliati", async () => {
    const lungo = `${"Descrizione tecnica documentata con tutte le sue condizioni. ".repeat(65)}FINE SPECIFICA`;
    const pages = await leggi(<PresentazioneProdottoPdf immagine={null} dati={[
      { etichetta: "Dato breve", valore: "76 mm" }, { etichetta: "Condizioni tecniche", valore: lungo },
    ]} colore="#183D42" />);
    expect(pages.join(" ")).toContain("76 mm");
    expect(pages.join(" ")).toContain("FINE SPECIFICA");
  });
  it("impagina dodici immagini con didascalie lunghe senza perdere contenuti", async () => {
    const { default: sharp } = await import("sharp");
    const immagini = await Promise.all(Array.from({ length: 12 }, async (_, i) => ({
      id: String(i), ruolo: i === 0 ? "principale" as const : "dettaglio" as const,
      url: `data:image/png;base64,${(await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: i * 20, g: 90, b: 130 } } }).png().toBuffer()).toString("base64")}`,
      didascalia: `${"Descrizione di catalogo. ".repeat(8)}FINE IMMAGINE ${i}`,
    })));
    const pages = await leggi(<PresentazioneProdottoPdf immagine={immagini[0].url} immagini={immagini} dati={[]} colore="#183D42" />);
    expect(pages.length).toBeGreaterThan(1);
    for (let i = 0; i < 12; i++) expect(pages.join(" ")).toContain(`FINE IMMAGINE ${i}`);
    expect(pages.every(p => p.trim().length > 100)).toBe(true);
  });
  it("mostra solo finiture e accessori scelti, anche senza un codice RAL", async () => {
    const pages = await leggi(<FinitureSceltePdf colore="#183D42" finitura={{ posizioni: [2, 4], interno: "RAL 9010",
      esterno: "Finitura personalizzata del cliente", altre: [{ label: "Maniglia", value: "Modello concordato" }] }} />);
    const text = pages.join(" ");
    expect(text).toContain("2, 4");
    expect(text).toContain("Finitura personalizzata del cliente");
    expect(text).toContain("Modello concordato");
    expect(text).not.toContain("RAL 7016");
  });
  it("un piano lungo conserva tutte le fasi, i passaggi e le condizioni", async () => {
    const pages = await leggi(<PianoLavoriEditorialePdf colore="#183D42" fasi={Array.from({ length: 8 }, (_, i) => ({
      nome: `Fase ${i}`, icona: "custom", step: ["Rilievo effettivo", "Verifica concordata", `ULTIMO PASSO ${i}`],
      attivita_azienda: "Attivita documentata. ".repeat(15), conferma_cliente: `CONFERMA ${i}`,
      tempistiche: `Condizioni e disponibilita da concordare ${i}`,
    }))} />);
    expect(pages.length).toBeGreaterThan(1);
    for (let i = 0; i < 8; i++) {
      expect(pages.join(" ")).toContain(`ULTIMO PASSO ${i}`);
      expect(pages.join(" ")).toContain(`CONFERMA ${i}`);
      expect(pages.join(" ")).toContain(`Condizioni e disponibilita da concordare ${i}`);
    }
  });
});
