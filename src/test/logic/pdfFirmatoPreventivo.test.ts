import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
const state = vi.hoisted(() => ({ db: null as unknown as DbMinimo, invoke: vi.fn(), signedUrl: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => state.db.from(t), functions: { invoke: state.invoke }, storage: { from: () => ({ createSignedUrl: state.signedUrl }) } } }));
import { pdfFirmatoPreventivo } from "@/lib/preventivi/pdfFirmatoPreventivo";
beforeEach(() => {
  state.db = new DbMinimo(); state.invoke.mockReset(); state.signedUrl.mockReset();
  state.db.tabelle.quotes = [{ id: "q1", company_id: "c1", source: "modulo:sr:p1" }, { id: "q2", company_id: "c2", source: "modulo:sr:p1" }];
  state.db.tabelle.signature_requests = [
    { id: "r1", company_id: "c1", fv_progetto_id: "p1", quote_id: "q1", status: "signed", signed_at: "2026-10-26" },
    { id: "r2", company_id: "c2", fv_progetto_id: "p1", quote_id: "q2", status: "signed", signed_at: "2027-01-01" },
  ];
  state.invoke.mockResolvedValue({ data: { url: "https://storage.example.test/firmato.pdf", nome_file: "firmato.pdf" }, error: null });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("%PDF-1.7 copia firmata esatta", { headers: { "Content-Type": "application/pdf" } })));
});
afterEach(() => vi.unstubAllGlobals());
describe("Download nell'app: soltanto la copia firmata del preventivo e dell'azienda giusti", () => {
  it("scarica il file SR gia conservato e ne controlla l'impronta senza rigenerarlo", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 copia firmata esatta");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(n => n.toString(16).padStart(2, "0")).join("");
    Object.assign(state.db.tabelle.signature_requests[0], { signed_pdf_path: "c1/firmati/r1.pdf", signed_pdf_hash: hash, codice_verifica: "QA" });
    state.signedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example.test/conservato.pdf" }, error: null });
    expect(await (await pdfFirmatoPreventivo({ tipo: "sr", companyId: "c1", progettoId: "p1" }))?.blob.text()).toContain("copia firmata esatta");
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("blocca il file se i byte non corrispondono all'impronta firmata", async () => {
    Object.assign(state.db.tabelle.signature_requests[0], { signed_pdf_path: "c1/firmati/r1.pdf", signed_pdf_hash: "0".repeat(64) });
    state.signedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.example.test/conservato.pdf" }, error: null });
    await expect(pdfFirmatoPreventivo({ tipo: "sr", companyId: "c1", progettoId: "p1" })).rejects.toThrow("impronta");
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it("non usa un percorso conservato appartenente a un'altra azienda", async () => {
    Object.assign(state.db.tabelle.signature_requests[0], { signed_pdf_path: "c2/firmati/r1.pdf", signed_pdf_hash: "0".repeat(64) });
    await pdfFirmatoPreventivo({ tipo: "sr", companyId: "c1", progettoId: "p1" });
    expect(state.signedUrl).not.toHaveBeenCalled(); expect(state.invoke).toHaveBeenCalled();
  });
  it.each(["fv", "sr"] as const)("%s: usa la richiesta conservata, mai la firma di un'altra azienda", async tipo => {
    const file = await pdfFirmatoPreventivo({ tipo, companyId: "c1", progettoId: "p1" });
    expect(await file?.blob.text()).toBe("%PDF-1.7 copia firmata esatta");
    expect(state.invoke).toHaveBeenCalledWith("fea-pdf-firmato", { body: { request_id: "r1" } });
  });
  it("una copia con id nuovo non eredita firma e file dell'originale", async () => {
    expect(await pdfFirmatoPreventivo({ tipo: "sr", companyId: "c1", progettoId: "copia" })).toBeNull();
    expect(state.invoke).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("un errore della funzione viene mostrato, non genera un nuovo PDF senza firma", async () => {
    state.invoke.mockResolvedValue({ data: null, error: { context: { json: async () => ({ error: "Copia in preparazione" }) } } });
    await expect(pdfFirmatoPreventivo({ tipo: "fv", companyId: "c1", progettoId: "p1" })).rejects.toThrow("Copia in preparazione");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("un errore HTTP durante il download non è un successo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("offline", { status: 503 })));
    await expect(pdfFirmatoPreventivo({ tipo: "fv", companyId: "c1", progettoId: "p1" })).rejects.toThrow("Download");
  });
  it("non scarica HTML o JSON spacciati per PDF", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>errore</html>")));
    await expect(pdfFirmatoPreventivo({ tipo: "fv", companyId: "c1", progettoId: "p1" })).rejects.toThrow("non è un PDF");
  });
});
