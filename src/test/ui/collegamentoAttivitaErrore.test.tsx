import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CollegaAttivitaPicker } from "@/components/tasks/CollegaAttivitaPicker";

const state = vi.hoisted(() => ({ fail: true, calls: 0 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order", "limit", "or"]) q[m] = () => q;
  q.then = (ok: (value: unknown) => unknown) => {
    state.calls++;
    return Promise.resolve(state.fail ? { data: null, error: { message: "Connessione assente" } } : { data: [], error: null }).then(ok);
  };
  return q;
} } }));
Object.assign(Element.prototype, { hasPointerCapture: () => false, releasePointerCapture: () => {}, setPointerCapture: () => {}, scrollIntoView: () => {} });
beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("collegamento attività: errore distinto da elenco vuoto", () => {
  it("mostra l'errore e recupera con Riprova senza modificare il collegamento", async () => {
    state.fail = true; state.calls = 0;
    const onChange = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><label htmlFor="collega">Collegata a</label><CollegaAttivitaPicker id="collega" companyId="demo" valore={null} onChange={onChange} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("combobox", { name: "Collegata a" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare clienti e opportunità.");
    expect(screen.queryByText("Nessun risultato")).toBeNull();
    state.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByText("Nessun risultato")).toBeTruthy();
    expect(state.calls).toBe(2);
    expect(onChange).not.toHaveBeenCalled();
  });
});
