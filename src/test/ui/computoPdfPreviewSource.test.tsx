import { Blob as NodeBlob } from "node:buffer";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";
import { readPdfPreview, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";
import ComputoNativoEditor from "@/components/computo/ComputoNativoEditor";

vi.mock("@/lib/computo/esportaComputo", () => ({ esportaComputoPdf: vi.fn(), generaDocumentoComputo: async () => new Blob(["%PDF-computo"], { type: "application/pdf" }) }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: ({ renderBlobUrl }: { renderBlobUrl: () => Promise<string> }) => {
  const [result, setResult] = useState("");
  return <div><button onClick={async () => {
    let url: string | undefined;
    try { url = await renderBlobUrl(); setResult(new TextDecoder().decode(await readPdfPreview(url))); }
    catch (e) { setResult(String(e)); }
    finally { if (url) revokePdfPreviewUrl(url); }
  }}>Leggi byte anteprima</button><output>{result}</output></div>;
} }));
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("CSP: Failed to fetch blob")));
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:test-${crypto.randomUUID()}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  localStorage.setItem("csp-computo", JSON.stringify({ ...bozzaVuota(), titolo: "Computo CSP", voci: [{ ...voceVuota(), descrizione: "Posa", quantita: "2", prezzo: "10" }] }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("anteprima computo con le protezioni di produzione", () => {
  it("la vista in tempo reale legge il PDF senza fetch(blob:)", async () => {
    render(<ComputoNativoEditor storageKey="csp-computo" initialFase={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Leggi byte anteprima" }));
    expect(await screen.findByText("%PDF-computo")).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
  });
  it("anche il popup di anteprima usa i byte originali senza rete", async () => {
    render(<ComputoNativoEditor storageKey="csp-computo" initialFase={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Anteprima" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Leggi byte anteprima" }));
    expect(await screen.findByText("%PDF-computo")).toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
  });
});
