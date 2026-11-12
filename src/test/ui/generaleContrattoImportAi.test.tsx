import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DatiContrattoDialog } from "@/components/orders/generali/contratto/DatiContrattoDialog";
import { CONTRATTO_VUOTO } from "@/lib/orders/generali/contratto";
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "u" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useGeneraleContratto", () => ({ useSalvaContratto: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/lib/orders/documentImportAi", () => ({ collegaOriginaleAi: vi.fn() }));
vi.mock("@/components/orders/ContractImportDialog", async () => {
  const { parseContractExtract } = await import("@/lib/orders/contractExtract");
  const source = { bucket: "order-attachments", path: "demo/ai-contratti/documento.pdf", name: "documento.pdf", mime: "application/pdf" };
  return { ContractImportDialog: ({ onApply, onOpenChange }: { onApply: Function; onOpenChange: Function }) => <>
    <button onClick={() => { onApply(parseContractExtract({ descrizione_lavori: "Lavori", dati_appalto: { importo_base_eur: 100000, ribasso_pct: 10, oneri_sicurezza_eur: 5000 } }), null, source); onOpenChange(false); }}>Applica singolo</button>
    <button onClick={() => { onApply(parseContractExtract({ descrizione_lavori: "Lavori RTI", importo_totale_eur: 500000, appalto_pubblico: { presente: true, ruolo_azienda_importatrice: "mandante", quota_azienda_eur: 100000, importo_totale_appalto_eur: 500000 } }), null, source); onOpenChange(false); }}>Applica RTI</button>
  </> };
});
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("i campi visibili seguono la nuova proposta AI, compreso l’azzeramento della base RTI da confermare", async () => {
  render(<QueryClientProvider client={new QueryClient()}><DatiContrattoDialog open onOpenChange={vi.fn()} generaleId="g" contratto={CONTRATTO_VUOTO} atti={[]}/></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Carica contratto (AI)" })); fireEvent.click(await screen.findByRole("button", { name: "Applica singolo" }));
  expect(screen.getByLabelText("Importo lavori a base del contratto")).toHaveValue("100.000"); expect(screen.getByLabelText("Ribasso")).toHaveValue("10"); expect(screen.getByLabelText("Oneri della sicurezza")).toHaveValue("5000");
  fireEvent.click(screen.getByRole("button", { name: "Carica contratto (AI)" })); fireEvent.click(await screen.findByRole("button", { name: "Applica RTI" }));
  expect(screen.getByLabelText("Importo lavori a base del contratto")).toHaveValue(""); expect(screen.getByLabelText("Ribasso")).toHaveValue("0"); expect(screen.getByRole("button", { name: "Salva il contratto" })).toBeDisabled();
});
