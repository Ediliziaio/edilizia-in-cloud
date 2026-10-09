/**
 * Il PDF firmato: timbro su ogni pagina del documento + pagina del certificato.
 * pdf-lib arriva da esm.sh nelle edge function: qui lo stesso pacchetto da node_modules.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => await import("pdf-lib"));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, PDFPage } from "pdf-lib";
import { DbMinimo } from "../helpers/edgeFinto";

// Caricato per percorso in una variabile: il modulo importa pdf-lib da un indirizzo
// esm.sh che il controllo dei tipi dell'app non sa risolvere, e non deve seguirlo.
const PERCORSO = "../../../supabase/functions/_shared/pdfFirmato";
const { codiceDiVerifica, costruisciPdfFirmato, dataItaliana, perPdf, assicuraPdfFirmato } = await import(/* @vite-ignore */ PERCORSO);

const dati = {
  azienda: "Renova Solution S.r.l.",
  documento: "Preventivo OFF-2026-0042",
  firmatario: "Marta Rossi",
  email: "marta@example.it",
  tipoFirmatario: "b2c",
  firmatoIl: "05/10/2026 14:03:09",
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  hashDocumento: "a".repeat(64),
  richiestaId: "11111111-2222-3333-4444-555555555555",
  codiceVerifica: "ABCD-1234-EF56",
  clausole: [
    "Art. 4 — Pagamenti (sospensione dei lavori in caso di ritardo)",
    "Art. 5 — Tempi di esecuzione (cause non imputabili all'Impresa) ".repeat(6),
  ],
  recessoAccettato: true,
  conTimbro: false,
  impronteDiverse: false,
};

async function pdfDiPagine(n: number): Promise<Uint8Array> {
  const p = await PDFDocument.create();
  for (let i = 0; i < n; i++) p.addPage([595, 842]);
  return await p.save();
}

describe("PDF firmato", () => {
  it("un PDF di 3 pagine diventa 3 pagine timbrate + il certificato", async () => {
    const out = await costruisciPdfFirmato(await pdfDiPagine(3), dati);
    const letto = await PDFDocument.load(out);
    expect(letto.getPageCount()).toBe(4);
    expect(String.fromCharCode(...out.slice(0, 4))).toBe("%PDF");
  });

  it("senza PDF originale (preventivo HTML) resta il solo certificato", async () => {
    const out = await costruisciPdfFirmato(null, dati);
    expect((await PDFDocument.load(out)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("un file che non si legge come PDF non rompe la firma: solo certificato", async () => {
    const out = await costruisciPdfFirmato(new TextEncoder().encode("%PDF-1.4 rotto rotto rotto"), dati);
    expect((await PDFDocument.load(out)).getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("caratteri fuori WinAnsi (meno tipografico, emoji, virgolette) non fanno fallire la scrittura", async () => {
    const out = await costruisciPdfFirmato(null, {
      ...dati,
      firmatario: "Zoë “Ödön” Müller — −5% ✅ 😀",
      clausole: ["Penale del −10% “salvo diverso accordo” … €"],
    });
    expect(out.length).toBeGreaterThan(500);
  });

  it("molte clausole vanno su più pagine del certificato", async () => {
    const molte = Array.from({ length: 60 }, (_, i) => `Clausola ${i + 1}: ${"testo di una clausola ".repeat(12)}`);
    const out = await costruisciPdfFirmato(null, { ...dati, clausole: molte });
    expect((await PDFDocument.load(out)).getPageCount()).toBeGreaterThan(1);
  });

  it("il testo del certificato è scritto con gli accenti (identità, è diversa, non è un PDF)", async () => {
    const spia = vi.spyOn(PDFPage.prototype, "drawText");
    try {
      await costruisciPdfFirmato(null, { ...dati, impronteDiverse: true });
      const scritto = spia.mock.calls.map((c) => String(c[0])).join("\n");
      expect(scritto).toContain("VERIFICA DELL'IDENTITÀ");
      expect(scritto).toContain("è diversa da quella registrata all'invio");
      expect(scritto).toContain("non è un PDF");
      expect(scritto).not.toMatch(/identita|\be diversa|non e un/i);
    } finally {
      spia.mockRestore();
    }
  });

  it("il codice di verifica ha la forma XXXX-XXXX-XXXX e cambia se cambia l'istante di firma", async () => {
    const a = await codiceDiVerifica("r1", "h", "2026-10-05T12:03:09Z");
    const b = await codiceDiVerifica("r1", "h", "2026-10-05T12:03:10Z");
    expect(a).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(a).not.toBe(b);
    expect(await codiceDiVerifica("r1", "h", "2026-10-05T12:03:09Z")).toBe(a);
  });

  it("le date sono in ora italiana e il testo è sicuro per i font standard", () => {
    expect(dataItaliana("2026-10-05T12:03:09Z")).toContain("14:03:09");
    expect(perPdf("a−b “c” 😀")).toBe('a-b "c" ?');
  });

  it("la firma completata genera il PDF dopo la risposta, e l'app lo scarica da fea-pdf-firmato", () => {
    const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
    const completa = leggi("supabase/functions/fea-completa-firma/index.ts");
    expect(completa).toContain("assicuraPdfFirmato(supabaseAdmin, sigReq.id)");
    expect(completa).toContain("waitUntil");
    expect(completa).toContain("attachments:  allegato ? [allegato] : undefined");
    const fn = leggi("supabase/functions/fea-pdf-firmato/index.ts");
    expect(fn).toContain("requireCompanyAccess");
    expect(fn).toContain('r.status !== "signed"');
    expect(leggi("src/pages/azienda/firma-elettronica/index.tsx")).toContain('invoke("fea-pdf-firmato"');
  });
});

describe("Copia firmata: download reale dei byte e salvataggio simulato", () => {
  async function ambiente() {
    const originale = await pdfDiPagine(2);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(originale)))).map(b => b.toString(16).padStart(2, "0")).join("");
    const db = new DbMinimo();
    db.tabelle.signature_requests = [{ id: "r1", company_id: "c1", status: "signed", signed_at: "2026-10-09T10:00:00Z", tipo_documento: "quote", quote_id: "q1", signer_name: "Mario Rossi", signer_email: "mario@example.test", documento_hash: hash }];
    db.tabelle.quotes = [{ id: "q1", quote_number: "PREV-1", pdf_storage_path: "c1/originale.pdf" }];
    db.tabelle.companies = [{ id: "c1", name: "Demo" }];
    const download = vi.fn(async () => ({ data: { arrayBuffer: async () => new Uint8Array(originale).buffer }, error: null as unknown }));
    const upload = vi.fn(async () => ({ error: null }));
    const sb = Object.assign(db, { storage: { from: () => ({ download, upload }) } });
    return { db, sb, download, upload };
  }
  it("scarica il PDF congelato, aggiunge il certificato e restituisce lo stesso file al secondo download", async () => {
    const a = await ambiente();
    const result = await assicuraPdfFirmato(a.sb, "r1");
    expect(result.creato).toBe(true);
    expect(a.download).toHaveBeenCalledWith("c1/originale.pdf");
    const bytes = (a.upload.mock.calls[0] as unknown as [string, Uint8Array])[1];
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(3);
    expect((await assicuraPdfFirmato(a.sb, "r1")).creato).toBe(false);
    expect(a.upload).toHaveBeenCalledTimes(1);
  });
  it("un errore di storage non congela per sempre un certificato senza documento", async () => {
    const a = await ambiente(); a.download.mockResolvedValue({ data: null!, error: { message: "rete non disponibile" } });
    await expect(assicuraPdfFirmato(a.sb, "r1")).rejects.toThrow("originale non disponibile");
    expect(a.upload).not.toHaveBeenCalled(); expect(a.db.tabelle.signature_requests[0].signed_pdf_path).toBeUndefined();
  });
  it("non timbra un documento cambiato rispetto all'impronta registrata all'invio", async () => {
    const a = await ambiente(); a.db.tabelle.signature_requests[0].documento_hash = "a".repeat(64);
    await expect(assicuraPdfFirmato(a.sb, "r1")).rejects.toThrow("cambiato"); expect(a.upload).not.toHaveBeenCalled();
  });
});
