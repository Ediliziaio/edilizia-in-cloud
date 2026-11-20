import { Blob as NodeBlob } from "node:buffer";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { bozzaVuota, voceVuota } from "@/lib/computo/editorNativo";
import { readPdfPreview, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";
import ComputoNativoEditor from "@/components/computo/ComputoNativoEditor";

const documento = vi.hoisted(() => vi.fn());
vi.mock("@/lib/computo/esportaComputo", () => ({ esportaComputoPdf: vi.fn(), generaDocumentoComputo: async (...args: unknown[]) => { documento(...args); return new Blob(["%PDF-computo"], { type: "application/pdf" }); } }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: ({ renderBlobUrl, activeDestination }: { renderBlobUrl: () => Promise<string>; activeDestination?: string }) => {
  const [result, setResult] = useState("");
  return <div><button onClick={async () => {
    let url: string | undefined;
    try { url = await renderBlobUrl(); setResult(new TextDecoder().decode(await readPdfPreview(url))); }
    catch (e) { setResult(String(e)); }
    finally { if (url) revokePdfPreviewUrl(url); }
  }}>Leggi byte anteprima</button><output>{result}</output><output aria-label="Voce collegata al PDF">{activeDestination}</output></div>;
} }));
beforeEach(() => {
  localStorage.clear();
  documento.mockClear();
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
    expect(screen.queryByRole("complementary", { name: "Anteprima del preventivo" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostra PDF" }));
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
  it("rigenera tutte le voci anche se l'elenco è filtrato per capitolo", async () => {
    localStorage.setItem("csp-computo", JSON.stringify({ ...bozzaVuota(), titolo: "Computo CSP", voci: [
      { ...voceVuota(), capitolo: "Demolizioni", descrizione: "Rimozione", quantita: "2", prezzo: "10" },
      { ...voceVuota(), capitolo: "Finiture", descrizione: "Pittura", quantita: "3", prezzo: "20" },
    ] }));
    render(<ComputoNativoEditor storageKey="csp-computo" initialFase={2} />);
    fireEvent.click(within(screen.getByRole("navigation", { name: "Indice dei capitoli" })).getByRole("button", { name: /Demolizioni/ }));
    expect(screen.queryByRole("button", { name: "Apri voce 2" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mostra PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Leggi byte anteprima" }));
    expect(await screen.findByText("%PDF-computo")).toBeInTheDocument();
    expect(documento.mock.lastCall?.[0]).toHaveLength(2);
    fireEvent.change(screen.getByRole("textbox", { name: "Prezzo voce 1" }), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Leggi byte anteprima" }));
    await vi.waitFor(() => expect(documento.mock.lastCall?.[0][0].importo_computo).toBe(30));
    expect(documento.mock.lastCall?.[0]).toHaveLength(2);
    expect(documento.mock.lastCall?.[0][1].importo_computo).toBe(60);
  });
  it("segue sia il clic sulla voce sia il prezzo rapido, senza rigenerare alla sola selezione", async () => {
    const voci = [
      { ...voceVuota(), id: "prima", descrizione: "Posa", quantita: "2", prezzo: "10" },
      { ...voceVuota(), id: "seconda", descrizione: "Posa", quantita: "3", prezzo: "20" },
    ];
    localStorage.setItem("csp-computo", JSON.stringify({ ...bozzaVuota(), titolo: "Computo CSP", voci }));
    render(<ComputoNativoEditor storageKey="csp-computo" initialFase={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Mostra PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Apri voce 1" }));
    expect(screen.getByLabelText("Voce collegata al PDF")).toHaveTextContent("computo.voce.prima");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi dettagli" }));
    const prezzo = screen.getByRole("textbox", { name: "Prezzo voce 2" });
    fireEvent.focus(prezzo);
    expect(screen.getByLabelText("Voce collegata al PDF")).toHaveTextContent("computo.voce.seconda");
    expect(documento).not.toHaveBeenCalled();
    fireEvent.change(prezzo, { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Leggi byte anteprima" }));
    expect(await screen.findByText("%PDF-computo")).toBeInTheDocument();
    expect(documento.mock.lastCall?.[0][1].importo_computo).toBe(75);
    expect(screen.getByLabelText("Voce collegata al PDF")).toHaveTextContent("computo.voce.seconda");
  });
});
