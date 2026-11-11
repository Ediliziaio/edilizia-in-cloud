// Il conto di costo della riga scelto dal piano dei conti (11/11/2026): per chi tiene la contabilità in casa.
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContoRigaMenu, useContiRighe, type RigaPerConto } from "@/components/fatturazione/ContoPerRiga";

const ID_MASTRO = "00000000-0000-4000-a000-000000000001";
const ID_CONSUMO = "00000000-0000-4000-a000-000000000002";
const ID_NUOVO = "00000000-0000-4000-a000-000000000009";
const m = vi.hoisted(() => ({ update: vi.fn(), rpc: vi.fn(), attiva: true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (tabella: string) => {
    const lettura = (data: unknown) => { const q: Record<string, unknown> = {}; for (const k of ["select", "eq", "order"]) q[k] = () => q; q.maybeSingle = () => Promise.resolve({ data, error: null }); q.then = (r: (x: unknown) => unknown) => Promise.resolve({ data, error: null }).then(r); return q; };
    if (tabella === "cost_categories") return lettura([]);
    if (tabella === "companies") return lettura({ contabilita_generale_attiva: m.attiva });
    if (tabella === "contabilita_conti") return lettura([
      { id: ID_MASTRO, codice: "6005", descrizione: "ACQUISTI", movimentabile: false, mastro_id: null, voce_cee: "B.6" },
      { id: ID_CONSUMO, codice: "6005000150", descrizione: "ACQUISTI MATERIALE DI CONSUMO", movimentabile: true, mastro_id: ID_MASTRO, voce_cee: "B.6" },
    ]);
    return { update: (v: unknown) => { m.update(v); const q = { eq: () => q, then: (r: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }; return q; } };
  },
  rpc: (fn: string, args: unknown) => { m.rpc(fn, args); return Promise.resolve({ data: fn === "contabilita_crea_conto" ? ID_NUOVO : { ok: true }, error: null }); },
} }));
// La tendina con ricerca (cmdk) misura e scorre: in jsdom non ci sono.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function () {};
afterEach(() => { cleanup(); vi.clearAllMocks(); m.attiva = true; });

const righe: RigaPerConto[] = [{ chiave: "1", descrizione: "Bulloni e tasselli" }];
function Prova({ salvati }: { salvati: Record<string, string> }) {
  const conti = useContiRighe({ companyId: "co", fatturaId: "f1", salvati, righe, onCambiato: () => {} });
  return <div><span data-testid="modo">{conti.modo}</span><ContoRigaMenu chiave="1" conti={conti} /></div>;
}
const disegna = (salvati: Record<string, string> = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Prova salvati={salvati} /></QueryClientProvider>,
);

it("con la contabilità in casa il menu mostra i conti del piano, e la scelta si salva come conto", async () => {
  disegna({ "1": `conto:${ID_CONSUMO}` });
  await waitFor(() => expect(screen.getByTestId("modo").textContent).toBe("piano"));
  const menu = screen.getByRole("combobox", { name: "Conto di costo della riga" });
  expect(menu.textContent).toContain("6005000150 ACQUISTI MATERIALE DI CONSUMO");
  fireEvent.click(menu);
  fireEvent.click(await screen.findByText("Conto della fattura"));
  await waitFor(() => expect(m.update).toHaveBeenCalledWith({ conti_righe: {} }));
});

it("«Nuovo conto di costo» lo crea nel piano, sotto il mastro, e lo mette sulla riga", async () => {
  disegna();
  await waitFor(() => expect(screen.getByTestId("modo").textContent).toBe("piano"));
  fireEvent.click(screen.getByRole("combobox", { name: "Conto di costo della riga" }));
  fireEvent.click(await screen.findByText("Nuovo conto di costo"));
  fireEvent.change(await screen.findByLabelText("Codice"), { target: { value: "6005000150" } });
  expect(screen.getByRole("alert").textContent).toContain("c'è già");
  fireEvent.change(screen.getByLabelText("Codice"), { target: { value: "6005000700" } });
  fireEvent.change(screen.getByLabelText("Descrizione"), { target: { value: "ACQUISTI MINUTERIA" } });
  fireEvent.click(screen.getByRole("button", { name: "Crea e usa" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("contabilita_crea_conto", expect.objectContaining({ p_codice: "6005000700", p_natura: "costo", p_mastro: ID_MASTRO, p_voce_cee: "B.6" })));
  await waitFor(() => expect(m.update).toHaveBeenCalledWith({ conti_righe: { "1": `conto:${ID_NUOVO}` } }));
});

it("senza la contabilità in casa restano le categorie", async () => {
  m.attiva = false;
  disegna();
  await waitFor(() => expect(screen.getByTestId("modo").textContent).toBe("categorie"));
});
