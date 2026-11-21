import { PDFDocument } from "pdf-lib";
import { beforeEach, expect, it, vi } from "vitest";
import { preparaPdfWhatsApp } from "../../../supabase/functions/ddt-documenti-processa/pdfWhatsApp";
import { gruppiDdtVerificabili } from "../../../shared/ddtPaginePdf";

const m = vi.hoisted(() => ({ testo: vi.fn(), upload: vi.fn(), rpc: vi.fn(), ocr: vi.fn() }));
vi.mock("https://esm.sh/pdf-lib@1.17.1", async () => await import("pdf-lib"));
vi.mock("../../../supabase/functions/_shared/pdfExtraction.ts", () => ({ estraiPagineTestoPdf: m.testo }));
vi.mock("../../../supabase/functions/_shared/aiRouter.ts", () => ({ aiRouterComplete: m.ocr }));

const id = "10000000-0000-4000-8000-000000000001";
const job = { id, company_id: "azienda", created_by: "utente", source: "whatsapp", files: [],
  file_hash: "a".repeat(64), lease_id: "lease", attempts: 1 };
const db = { storage: { from: () => ({ upload: m.upload }) }, rpc: m.rpc } as unknown as Parameters<typeof preparaPdfWhatsApp>[0];
const intestazioni = ["DDT n. 41 Pagina 1 di 2", "Righe della merce Pagina 2 di 2", "DDT n. 42 Pagina 1 di 1"];

async function pdfDaTrePagine() {
  const pdf = await PDFDocument.create();
  for (const larghezza of [420, 430, 440]) pdf.addPage([larghezza, 595]);
  return pdf.save();
}

beforeEach(() => {
  m.testo.mockReset().mockResolvedValue({
    pagine: intestazioni.map((testo, i) => ({ pagina: i + 1, testo })), ispezionate: 3, totale: 3,
  });
  m.upload.mockReset().mockResolvedValue({ error: null });
  m.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  m.ocr.mockReset().mockResolvedValue({ content: '{"pagine":[]}' });
});

it("fa OCR in quattro richieste per venti pagine senza testo", async () => {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 20; i++) pdf.addPage([420 + i, 595]);
  m.testo.mockResolvedValueOnce({ pagine: [], ispezionate: 20, totale: 20 });
  for (let blocco = 0; blocco < 4; blocco++) m.ocr.mockResolvedValueOnce({
    content: JSON.stringify({ pagine: Array.from({ length: 5 }, (_, i) => ({
      pagina: i + 1, intestazione: `DDT n. ${100 + blocco * 5 + i} Pagina 1 di 1`,
    })) }),
  });
  expect(await preparaPdfWhatsApp(db, job, await pdf.save())).toBe("split");
  expect(m.ocr).toHaveBeenCalledTimes(4);
  expect(m.upload).toHaveBeenCalledTimes(20);
  expect(m.rpc.mock.calls[0][1].p_figli.map((f: { name: string }) => f.name)).toEqual(
    Array.from({ length: 20 }, (_, i) => `Bolla ${100 + i}.pdf`),
  );
});

it("separa due bolle preservando le due pagine della prima e pubblica le parti insieme", async () => {
  const originale = await pdfDaTrePagine();
  expect(await preparaPdfWhatsApp(db, job, originale)).toBe("split");
  expect(m.upload).toHaveBeenCalledTimes(2);
  const parti = await Promise.all(m.upload.mock.calls.map(async ([, bytes]) =>
    (await PDFDocument.load(bytes)).getPages().map(p => p.getWidth())));
  expect(parti).toEqual([[420, 430], [440]]);
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("ddt_whatsapp_dividi_pdf", {
    p_id: id, p_lease: "lease",
    p_figli: [expect.objectContaining({ name: "Bolla 41.pdf" }), expect.objectContaining({ name: "Bolla 42.pdf" })],
  });
  const percorsi = m.upload.mock.calls.map(([path]) => path);
  m.upload.mockResolvedValue({ error: { statusCode: 409, message: "Already exists" } });
  expect(await preparaPdfWhatsApp(db, job, originale)).toBe("split");
  expect(m.upload.mock.calls.slice(2).map(([path]) => path)).toEqual(percorsi);
});

it("mantiene il PDF insieme se manca il testo o una numerazione contraddice i documenti", async () => {
  m.testo.mockResolvedValueOnce({ pagine: [{ pagina: 1, testo: intestazioni[0] }], ispezionate: 3, totale: 3 });
  expect(await preparaPdfWhatsApp(db, job, await pdfDaTrePagine())).toBe("da_controllare");
  expect(m.upload).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
  expect(gruppiDdtVerificabili(["DDT n. 41 Pagina 1 di 2", "DDT n. 42 Pagina 1 di 1"])).toBeNull();
  expect(gruppiDdtVerificabili(["DDT n. 41", "DDT n. 42", "DDT n. 41"])).toBeNull();
  expect(gruppiDdtVerificabili(["DDT n. 41 Fornitore Alfa", "DDT n. 41 Fornitore Beta"])).toBeNull();
});

it("non pubblica documenti parziali quando il caricamento di una parte fallisce", async () => {
  m.upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { statusCode: 503, message: "Unavailable" } });
  await expect(preparaPdfWhatsApp(db, job, await pdfDaTrePagine())).rejects.toThrow("Salvataggio parti PDF");
  expect(m.rpc).not.toHaveBeenCalled();
});
