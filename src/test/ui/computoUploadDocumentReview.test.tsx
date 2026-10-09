import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ComputoVoceLocal } from "@/types/computo";
const state = vi.hoisted(() => ({ raw: null as unknown, loaded: true, reviewError: null as Error | null, quantity: 2, generate: vi.fn(), confirm: vi.fn(), reset: vi.fn(), empty: [] }));
vi.mock("@/hooks/useComputoExtract", () => ({ useComputoExtract: () => ({
  status: "review", progress: "", error: null, vociLoading: false, reviewError: state.reviewError,
  voci: [{ id: "v1", capitolo_numero: 1, capitolo_nome: "Opere", codice_voce: "1", descrizione_breve: "Posa", unita_misura: "mq", quantita: state.quantity, prezzo_unitario_computo: 10, importo_computo: 20, confidence: .9, is_included: true, warnings: [] }],
  computoUpload: state.loaded ? { id: "upload", oggetto_lavori: "Computo", raw_extracted_json: state.raw } : undefined,
  upload: vi.fn(), generatePreventivo: state.generate, isUploading: false, isGenerating: false, loadExistingComputo: vi.fn(), reset: state.reset,
}) }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company" }));
vi.mock("@/hooks/useCatalogItems", () => ({ useCatalogItems: () => ({ items: state.empty }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.empty }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/quotes/MatchProductPickerDialog", () => ({ MatchProductPickerDialog: () => null }));
vi.mock("@/components/quotes/MatchTariffaPickerDialog", () => ({ MatchTariffaPickerDialog: () => null }));
vi.mock("@/components/computo/AIProcessingStage", () => ({ AIProcessingStage: () => <span>Attendo dati</span> }));
vi.mock("@/components/computo/ComputoPreviewEditor", () => ({ ComputoPreviewEditor: ({ voci, onChange }: { voci: ComputoVoceLocal[]; onChange: (rows: ComputoVoceLocal[]) => void }) =>
  <button onClick={() => onChange(voci.map(v => ({ ...v, quantita: v.quantita + 1, _importoImpresa: (v.quantita + 1) * v._prezzoImpresa })))}>Modifica voce</button>,
}));
import { ComputoUploadModal } from "@/components/computo/ComputoUploadModal";
const warningSource = () => ({ document_checks: { requires_review: true, warnings: ["Verifica totale"], computed_total: 20, source_declared_total: 25 } });
const modal = (returnRows = false) => <MemoryRouter><ComputoUploadModal open onOpenChange={vi.fn()} initialComputoId="upload" onConfirmVoci={returnRows ? state.confirm : undefined} /></MemoryRouter>;
beforeEach(() => { vi.clearAllMocks(); state.raw = warningSource(); state.loaded = true; state.reviewError = null; state.quantity = 2; });
afterEach(cleanup);
describe("computo modal prevents unsafe confirmation", () => {
  it("requires acknowledgement before generating, without changing original amounts", async () => {
    render(modal());
    const submit = await screen.findByRole("button", { name: "Genera Preventivo" });
    expect(submit).toBeDisabled(); fireEvent.click(submit); expect(state.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox")); expect(submit).toBeEnabled(); fireEvent.click(submit);
    expect(state.generate).toHaveBeenCalledOnce();
    expect(state.generate.mock.calls[0][0].vociIncluse[0].quantity).toBe(2);
  });
  it("invalidates acknowledgement when a row changes", async () => {
    render(modal()); await screen.findByRole("button", { name: "Genera Preventivo" });
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Modifica voce" }));
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Genera Preventivo" })).toBeDisabled();
  });
  it("waits for source checks even when extracted rows arrive first", async () => {
    state.loaded = false; const view = render(modal());
    const submit = await screen.findByRole("button", { name: "Genera Preventivo" }); expect(submit).toBeDisabled();
    state.loaded = true; view.rerender(modal());
    expect(submit).toBeDisabled(); expect(screen.getByRole("checkbox")).not.toBeChecked();
  });
  it("keeps old uploads compatible but never confirms incomplete PDFs", async () => {
    state.raw = null; const view = render(modal());
    const submit = await screen.findByRole("button", { name: "Genera Preventivo" }); expect(submit).toBeEnabled();
    state.raw = { document_coverage: { complete: false } }; view.rerender(modal());
    expect(submit).toBeDisabled(); expect(screen.getByRole("alert")).toHaveTextContent("Lettura incompleta");
  });
  it("applies the same checks when returning rows to a renovation module", async () => {
    render(modal(true)); const submit = await screen.findByRole("button", { name: "Genera Preventivo" });
    expect(submit).toBeDisabled(); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(submit);
    expect(state.confirm).toHaveBeenCalledOnce(); expect(state.generate).not.toHaveBeenCalled();
    expect(state.confirm.mock.calls[0][0][0].importo_computo).toBe(20);
  });
  it("reports a review read error instead of exposing a confirmation button", async () => {
    state.reviewError = new Error("network"); render(modal());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare"));
    expect(screen.queryByRole("button", { name: "Genera Preventivo" })).not.toBeInTheDocument();
  });
});
