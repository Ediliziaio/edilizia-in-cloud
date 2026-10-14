import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VariationTemplatesPanel } from "@/pages/azienda/settings/SettingsQuoteTemplates/VariationTemplatesPanel";
import { VariationTemplatePicker } from "@/components/orders/VariationTemplatePicker";
import { emptyVariationDraft } from "@/lib/orders/variationDraft";
const mock = vi.hoisted(() => ({ save: vi.fn(), archive: vi.fn() }));
vi.mock("@/hooks/useVariationTemplates", () => ({ useVariationTemplates: () => ({ data: [] as unknown[], isError: false, isLoading: false, save: { mutateAsync: mock.save, isPending: false }, archive: { mutateAsync: mock.archive, isPending: false } }) }));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel", () => ({ PdfBlobLivePreviewPanel: () => <div data-testid="live-pdf-preview">Anteprima PDF</div> }));
vi.mock("@/components/orders/VariationTemplateAttachments", () => ({ VariationTemplateAttachments: () => <div>Allegati PDF del modello salvato</div> }));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);
describe("Libreria varianti", () => {
  it("l'esempio non viene salvato finché non si conferma", async () => {
    mock.save.mockImplementation(async ({ content }) => ({ ...content, id: "saved", company_id: "company", revision: 1 }));
    render(<VariationTemplatesPanel companyId="company" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Lavori extra standard" }));
    expect(mock.save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nome del modello *")).toHaveValue("Lavori extra standard");
    expect(screen.getByLabelText("Anteprima visiva della variante")).toContainElement(screen.getByTestId("live-pdf-preview"));
    fireEvent.click(screen.getByRole("button", { name: "Salva modello di variante" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Modello salvato"); expect(mock.save).toHaveBeenCalledOnce();
  });
  it("un salvataggio fallito mantiene testi e non mostra successo", async () => {
    mock.save.mockRejectedValue(new Error("Conflitto di revisione")); render(<VariationTemplatesPanel companyId="company" canEdit />);
    fireEvent.click(screen.getByRole("button", { name: "Lavori extra standard" })); fireEvent.click(screen.getByRole("button", { name: "Salva modello di variante" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Conflitto"); expect(screen.getByLabelText("Nome del modello *")).toHaveValue("Lavori extra standard");
    expect(screen.queryByText(/Modello salvato/)).not.toBeInTheDocument();
  });
  it("chi consulta non può creare o salvare ma può provare il PDF", async () => {
    render(<VariationTemplatesPanel companyId="company" canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Nuovo modello di variante" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lavori extra standard" })); expect(screen.getByLabelText("Nome del modello *")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva modello di variante" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Prova con dati di esempio" }));
    const link = await screen.findByRole("link", { name: "Scarica esempio PDF" }); expect(atob(link.getAttribute("href")!.split(",")[1])).toContain("DEMO"); expect(mock.save).not.toHaveBeenCalled();
  });
  it("scegliere il modello non modifica nulla prima di applicarlo", async () => {
    const apply = vi.fn(); render(<VariationTemplatePicker companyId="company" draft={{ ...emptyVariationDraft(), amount: "123" }} context={{ orderCode: "ORD-1" }} disabled={false} onApply={apply} />);
    fireEvent.change(screen.getByLabelText("Modello di variante"), { target: { value: "example-0" } }); expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Usa questo modello" })); await waitFor(() => expect(apply).toHaveBeenCalledOnce()); expect(apply.mock.calls[0][0].amount).toBe("123");
  });
});
