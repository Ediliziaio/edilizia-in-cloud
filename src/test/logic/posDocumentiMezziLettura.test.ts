import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  documentoMezzoProva,
  controlliMezzoProva,
  idMezzoPos,
} from "../fixtures/posDocumentiMezzi";
const m = vi.hoisted(() => ({ rpc: vi.fn(), server: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewSicurezzaCantiere: true }),
}));
vi.mock("@/hooks/usePos", () => ({
  chiamaServerPos: (...args: unknown[]) => m.server(...args),
}));
import {
  leggiDocumentiMezzoPos,
  apriDocumentoMezzoPos,
} from "@/hooks/useDocumentiMezziPos";
const quadro = () => ({
  company_id: "azienda",
  order_id: "ordine",
  mezzo_id: idMezzoPos,
  documenti: [documentoMezzoProva()],
  controlli: controlliMezzoProva(),
});
beforeEach(() => {
  m.rpc.mockReset();
  m.server.mockReset();
  vi.stubEnv("VITE_SUPABASE_URL", "https://esempio.supabase.co");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Lettura documenti macchina", () => {
  it("richiede la commessa e normalizza escludendo percorsi e dati economici", async () => {
    const q = quadro();
    m.rpc.mockResolvedValue({
      data: {
        ...q,
        file_path: "PRIVATO",
        documenti: [{ ...q.documenti[0], importo: 9999, file_path: "PRIVATO" }],
      },
      error: null,
    });
    const r = await leggiDocumentiMezzoPos("azienda", "ordine", idMezzoPos);
    expect(m.rpc).toHaveBeenCalledWith("pos_documenti_mezzo_quadro", {
      _company: "azienda",
      _ordine: "ordine",
      _mezzo: idMezzoPos,
    });
    expect(JSON.stringify(r)).not.toMatch(/PRIVATO|9999/);
  });
  it.each([
    "azienda",
    "commessa",
    "mezzo",
    "documento",
    "categoria",
    "controlli",
    "impronta",
  ])("rifiuta una risposta fuori ambito: %s", (tipo) => {
    const q = quadro();
    if (tipo === "azienda") q.company_id = "altra";
    if (tipo === "commessa") q.order_id = "altra";
    if (tipo === "mezzo") q.mezzo_id = "altro";
    if (tipo === "documento") q.documenti[0].mezzo_id = "altro";
    if (tipo === "categoria") q.documenti[0].categoria = "contratto";
    if (tipo === "controlli") q.controlli.mezzo_id = "altro";
    if (tipo === "impronta") q.controlli.impronta = "mancante";
    m.rpc.mockResolvedValue({ data: q, error: null });
    return expect(
      leggiDocumentiMezzoPos("azienda", "ordine", idMezzoPos),
    ).rejects.toThrow();
  });
  it("un errore server non diventa un quadro vuoto", async () => {
    m.rpc.mockResolvedValue({
      data: null,
      error: { message: "Accesso negato" },
    });
    await expect(
      leggiDocumentiMezzoPos("azienda", "ordine", idMezzoPos),
    ).rejects.toThrow("Accesso negato");
  });
  it("l’apertura richiede un URL temporaneo risolto dal servizio, senza path dal documento", async () => {
    const finestra = {
      opener: undefined as undefined,
      location: { href: "" },
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(finestra as unknown as Window);
    const url = `https://esempio.supabase.co/storage/v1/object/sign/mezzi-documenti/azienda/${idMezzoPos}/test.pdf?token=TEST`;
    m.server.mockResolvedValue({ url });
    await apriDocumentoMezzoPos("azienda", "ordine", documentoMezzoProva());
    expect(m.server).toHaveBeenCalledWith({
      azione: "apri_documento_mezzo",
      company_id: "azienda",
      order_id: "ordine",
      mezzo_id: idMezzoPos,
      documento_id: documentoMezzoProva().id,
      impronta: "a".repeat(64),
    });
    expect(finestra.opener).toBeNull();
    expect(finestra.location.href).toBe(url);
  });
  it.each([
    "https://estraneo.example/test.pdf",
    "javascript:alert(1)",
    "https://esempio.supabase.co/storage/v1/object/sign/mezzi-documenti/altro/privato.pdf",
  ])("rifiuta un URL estraneo e chiude la scheda: %s", async (url) => {
    const finestra = {
      opener: undefined as undefined,
      location: { href: "" },
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(finestra as unknown as Window);
    m.server.mockResolvedValue({ url });
    await expect(
      apriDocumentoMezzoPos("azienda", "ordine", documentoMezzoProva()),
    ).rejects.toThrow();
    expect(finestra.close).toHaveBeenCalledOnce();
    expect(finestra.location.href).toBe("");
  });
  it("non richiede il link quando il browser blocca la scheda", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    await expect(
      apriDocumentoMezzoPos("azienda", "ordine", documentoMezzoProva()),
    ).rejects.toThrow("Consenti");
    expect(m.server).not.toHaveBeenCalled();
  });
});
