import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContoRigaMenu, ProposteContiRighe, useContiRighe, type RigaPerConto } from "@/components/fatturazione/ContoPerRiga";

const m = vi.hoisted(() => ({ update: vi.fn(), rpc: vi.fn(), erroreGiornale: null as string | null, avviso: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: m.avviso } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (tabella: string) => {
    if (tabella === "cost_categories") {
      const q = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: [], error: null }) };
      return q;
    }
    return { update: (v: unknown) => { m.update(v); const q = { eq: () => q, then: (r: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }; return q; } };
  },
  rpc: (fn: string, args: unknown) => { m.rpc(fn, args); return Promise.resolve({ data: { stornate: 1 }, error: m.erroreGiornale ? { message: m.erroreGiornale } : null }); },
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); m.erroreGiornale = null; });

const righe: RigaPerConto[] = [
  { chiave: "1", descrizione: "126 CLS RCK35 S4 XC1XC2" },
  { chiave: "2", descrizione: "POMPAGGIO AL MC AUTOPOMPA FH986JA" },
  { chiave: "3", descrizione: "Rif. documento 17220" },
];

function Prova({ salvati }: { salvati: Record<string, string> }) {
  const conti = useContiRighe({ companyId: "co", fatturaId: "f1", salvati, righe, onCambiato: () => {} });
  return (
    <div>
      <ProposteContiRighe conti={conti} />
      {righe.map((r) => <div key={r.chiave} data-riga={r.chiave}><ContoRigaMenu chiave={r.chiave} conti={conti} /></div>)}
    </div>
  );
}
const disegna = (salvati: Record<string, string> = {}) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Prova salvati={salvati} /></QueryClientProvider>,
);

it("propone il conto dalla descrizione, conferma tutte le proposte e rifà la scrittura", async () => {
  disegna({ "2": "trasporti" });
  // La riga 2 ha già un conto scelto: resta il suo, non la proposta (noli).
  await waitFor(() => expect(screen.getByText(/1 riga ha un conto proposto/)).toBeTruthy());
  const menu = screen.getAllByRole("combobox", { name: "Conto di costo della riga" });
  expect(menu[0].textContent).toBe("Materie prime");
  expect(menu[0].className).toMatch(/italic/);
  expect(menu[1].textContent).toBe("Trasporti");
  expect(menu[2].textContent).toBe("Conto della fattura");
  fireEvent.click(screen.getByRole("button", { name: "Conferma le proposte" }));
  await waitFor(() => expect(m.update).toHaveBeenCalledWith({ conti_righe: { "1": "materie_prime", "2": "trasporti" } }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("contabilita_riregistra_documento", expect.objectContaining({ p_documento: "f1" })));
});

it("se la contabilità generale non segue il conto nuovo lo dice, anche senza il permesso", async () => {
  m.erroreGiornale = "Accesso negato";
  disegna({ "2": "trasporti" });
  await waitFor(() => expect(screen.getByText(/1 riga ha un conto proposto/)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Conferma le proposte" }));
  await waitFor(() => expect(m.avviso).toHaveBeenCalledWith("Conto salvato · contabilità generale da aggiornare",
    expect.objectContaining({ description: expect.stringMatching(/Il conto è salvato/) })));
});
