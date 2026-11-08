/**
 * Approvata una nuova revisione di computo o tavola, la finestra propone la
 * variante e i materiali invece di chiudersi in silenzio (07/11/2026).
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { linkDopoApprovazione, proponiDopoApprovazione } from "@/lib/commesse/revisioniDocumenti";

// La tendina di Radix dentro una finestra fa rimbalzare il focus in jsdom: nel
// test una <select> nativa con le stesse opzioni.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react");
  type P = { children?: React.ReactNode; value?: string; onValueChange?: (v: string) => void; id?: string };
  const Ctx = React.createContext<{ value?: string; onValueChange?: (v: string) => void }>({});
  const Select = ({ children, value, onValueChange }: P) => React.createElement(Ctx.Provider, { value: { value, onValueChange } }, children);
  const SelectTrigger = (): null => null;
  const SelectContent = ({ children }: P) => {
    const c = React.useContext(Ctx);
    return React.createElement("select", { "aria-label": "scelta", value: c.value, onChange: (e: { target: { value: string } }) => c.onValueChange?.(e.target.value) }, children);
  };
  const SelectItem = ({ children, value }: P) => React.createElement("option", { value }, children);
  const SelectValue = (): null => null;
  return { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
});

const rpc = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...(a as [])) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { RevisioneDocumentoDialog } = await import("@/components/orders/RevisioneDocumento");

function Dove() { return <p data-testid="dove">{useLocation().pathname + useLocation().search}</p>; }

const disegna = (doc: Record<string, unknown>, onOpenChange = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/azienda/ordini/o1"]}>
        <Routes><Route path="*" element={<><Dove /><RevisioneDocumentoDialog open onOpenChange={onOpenChange}
          doc={{ id: "d1", order_id: "o1", file_name: "computo.pdf", tipo_documento: null, codice_elaborato: null, revisione: null, stato_revisione: null, ...doc } as never} /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return onOpenChange;
};

describe("dopo l'approvazione", () => {
  it("si propone solo per computo e tavola che diventano approvati adesso", () => {
    expect(proponiDopoApprovazione("computo", "approvato", "in_lavorazione")).toBe(true);
    expect(proponiDopoApprovazione("tavola", "approvato", null)).toBe(true);
    expect(proponiDopoApprovazione("tavola", "approvato", "approvato")).toBe(false);
    expect(proponiDopoApprovazione("relazione", "approvato", null)).toBe(false);
    expect(proponiDopoApprovazione("computo", "in_lavorazione", null)).toBe(false);
    expect(linkDopoApprovazione("o1").varianti).toBe("/azienda/ordini/o1?tab=finanza&vista_economia=varianti");
  });

  it("computo approvato: la finestra resta e porta alla variante", async () => {
    const chiudi = disegna({ tipo_documento: "computo", codice_elaborato: "CME", revisione: "B", stato_revisione: "approvato" }, vi.fn());
    // stato già approvato all'apertura: si salva e si chiude
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(chiudi).toHaveBeenCalledWith(false));
    expect(screen.queryByText(/approvato: e la commessa/)).toBeNull();
  });

  it("computo in lavorazione che si approva: propone variante e materiali", async () => {
    disegna({ tipo_documento: "computo", codice_elaborato: "CME", revisione: "B", stato_revisione: "in_lavorazione" });
    // La seconda tendina è lo stato.
    fireEvent.change(screen.getAllByLabelText("scelta")[1], { target: { value: "approvato" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    expect(await screen.findByText("Computo approvato: e la commessa?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apri una variante" }));
    expect(screen.getByTestId("dove").textContent).toBe("/azienda/ordini/o1?tab=finanza&vista_economia=varianti");
  });
});
