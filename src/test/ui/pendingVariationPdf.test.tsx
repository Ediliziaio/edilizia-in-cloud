import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { PendingVariationPdf } from "@/components/orders/PendingVariationPdf";

const mock = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("@/lib/orders/variationPreviewPdf", () => ({ variationProposalPdf: mock.generate, variationPdfFilename: () => "proposta.pdf" }));
const variation: Database["public"]["Tables"]["ordini_variazione"]["Row"] = {
  id: "variation", order_id: "order", company_id: "company", status: "in_attesa", numero_odv: 2,
  titolo: "Extra", descrizione: "Lavori extra", motivazione: null, richiesto_da: null,
  impatto_economico: 120, impatto_giorni: 2, created_at: "2026-10-09T08:00:00Z",
  created_by: null, richiesto_il: "2026-10-09T08:00:00Z", firma_cliente: null,
  firmato_da: null, firmato_il: null, firma_token: "PRIVATE_TOKEN", note_interne: "PRIVATE_NOTES",
};
const props = { variation, orderId: "order", companyId: "company", context: { companyName: "Impresa", customerName: "Cliente", currentNet: 1000 } };
beforeEach(() => { vi.clearAllMocks(); mock.generate.mockResolvedValue({ output: () => "data:application/pdf;base64,TEST" }); });
afterEach(cleanup);
const open = () => { fireEvent.click(screen.getByRole("button", { name: "Proposta PDF" })); };
describe("Download proposta registrata", () => {
  it("duplice clic genera un solo documento, senza esportare token e appunti", async () => {
    let finish!: (value: unknown) => void;
    mock.generate.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<PendingVariationPdf {...props} />); open();
    const button = screen.getByRole("button", { name: "Prepara proposta PDF" });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(mock.generate).toHaveBeenCalledOnce());
    expect(JSON.stringify(mock.generate.mock.calls)).not.toMatch(/PRIVATE_TOKEN|PRIVATE_NOTES/);
    finish({ output: () => "data:application/pdf;base64,TEST" });
    expect(await screen.findByRole("link", { name: "Scarica proposta PDF" })).toHaveAttribute("download", "proposta.pdf");
  });
  it("blocca una generazione che termina dopo il cambio dei dati e permette di rigenerare", async () => {
    let finish!: (value: unknown) => void;
    mock.generate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const view = render(<PendingVariationPdf {...props} />); open();
    fireEvent.click(screen.getByRole("button", { name: "Prepara proposta PDF" }));
    await waitFor(() => expect(mock.generate).toHaveBeenCalledOnce());
    view.rerender(<PendingVariationPdf {...props} context={{ ...props.context, currentNet: 2000 }} />);
    finish({ output: () => "data:application/pdf;base64,OLD" });
    expect(await screen.findByRole("alert")).toHaveTextContent("sono cambiate");
    expect(screen.queryByRole("link", { name: "Scarica proposta PDF" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prepara proposta PDF" }));
    expect(await screen.findByRole("link", { name: "Scarica proposta PDF" })).toBeInTheDocument();
    expect(mock.generate.mock.calls[1][1]).toMatchObject({ currentNet: 2000 });
  });
  it("un PDF pronto non resta scaricabile dopo una modifica della descrizione", async () => {
    const view = render(<PendingVariationPdf {...props} />); open();
    fireEvent.click(screen.getByRole("button", { name: "Prepara proposta PDF" }));
    await screen.findByRole("link", { name: "Scarica proposta PDF" });
    view.rerender(<PendingVariationPdf {...props} variation={{ ...variation, descrizione: "Nuove condizioni" }} />);
    expect(screen.queryByRole("link", { name: "Scarica proposta PDF" })).not.toBeInTheDocument();
  });
  it("ambito errato o variante già approvata non avviano il generatore", async () => {
    render(<PendingVariationPdf {...props} variation={{ ...variation, status: "approvato" }} />); open();
    fireEvent.click(screen.getByRole("button", { name: "Prepara proposta PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("non è più in attesa");
    expect(mock.generate).not.toHaveBeenCalled();
  });
  it("il passaggio ai documenti è separato dal download e non genera un PDF né approva", () => {
    const documents = vi.fn(); render(<PendingVariationPdf {...props} onOpenDocuments={documents} />); open();
    fireEvent.click(screen.getByRole("button", { name: "Apri Documenti commessa" }));
    expect(documents).toHaveBeenCalledOnce(); expect(mock.generate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
