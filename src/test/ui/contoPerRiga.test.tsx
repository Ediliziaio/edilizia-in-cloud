import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContoRigaMenu, ProposteContiRighe, useContiRighe, type RigaPerConto } from "@/components/fatturazione/ContoPerRiga";

const m = vi.hoisted(() => ({ update: vi.fn(), rpc: vi.fn(), erroreGiornale: null as string | null, avviso: vi.fn(), errore: vi.fn(), passate: [] as unknown[] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: m.errore, warning: m.avviso } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (tabella: string) => {
    if (tabella === "companies") { const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: { contabilita_generale_attiva: false }, error: null }) }; return q; }
    if (tabella === "cost_categories") {
      const q = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: [], error: null }) };
      return q;
    }
    if (tabella === "fatture_ricevute") {
      const q = { select: () => q, eq: () => q, neq: () => q, order: () => q, limit: () => Promise.resolve({ data: m.passate, error: null }),
        update: (v: unknown) => { m.update(v); const u = { eq: () => u, then: (r: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }; return u; } };
      return q;
    }
    return { update: (v: unknown) => { m.update(v); const q = { eq: () => q, then: (r: (x: unknown) => unknown) => Promise.resolve({ error: null }).then(r) }; return q; } };
  },
  rpc: (fn: string, args: unknown) => { m.rpc(fn, args); return Promise.resolve({ data: { stornate: 1 }, error: m.erroreGiornale ? { message: m.erroreGiornale } : null }); },
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); m.erroreGiornale = null; m.passate = []; });

const righe: RigaPerConto[] = [
  { chiave: "1", descrizione: "126 CLS RCK35 S4 XC1XC2" },
  { chiave: "2", descrizione: "POMPAGGIO AL MC AUTOPOMPA EF456GH" },
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
  await waitFor(() => expect(screen.getByText(/1 righe hanno un conto proposto/)).toBeTruthy());
  const menu = screen.getAllByRole("combobox", { name: "Conto di costo della riga" });
  expect(menu[0].textContent).toBe("Materie prime");
  expect(menu[0].className).toMatch(/italic/);
  expect(menu[1].textContent).toBe("Trasporti");
  expect(menu[2].textContent).toBe("Conto della fattura");
  fireEvent.click(screen.getByRole("button", { name: "Usa le proposte" }));
  expect(m.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Salva conti della fattura" }));
  await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("contabilita_salva_conti_fattura", { p_fattura: "f1", p_conti: { "1": "materie_prime", "2": "trasporti" }, p_precedenti: { "2": "trasporti" } }));
  expect(m.update).not.toHaveBeenCalled();
});

it("un errore conserva la bozza e non dichiara salvati conti non aggiornati", async () => {
  m.erroreGiornale = "Accesso negato";
  disegna({ "2": "trasporti" });
  await waitFor(() => expect(screen.getByText(/1 righe hanno un conto proposto/)).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Usa le proposte" }));
  fireEvent.click(screen.getByRole("button", { name: "Salva conti della fattura" }));
  await waitFor(() => expect(m.errore).toHaveBeenCalled());
  expect(m.avviso).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Salva conti della fattura" })).toBeTruthy();
});

it("la scelta fatta a mano su un'altra fattura vale per la stessa riga (24/11/2026)", async () => {
  // In un'altra fattura l'autopompa era stata messa a mano su «trasporti»: vince sulla regola (noli).
  m.passate = [{ cedente_piva: "IT01", righe: [{ numero_linea: 4, descrizione: "POMPAGGIO AL MC AUTOPOMPA AB123CD" }], conti_righe: { "4": "trasporti" } }];
  disegna();
  await waitFor(() => expect(screen.getAllByRole("combobox", { name: "Conto di costo della riga" })[1].textContent).toBe("Trasporti"));
  expect(screen.getAllByRole("combobox", { name: "Conto di costo della riga" })[0].textContent).toBe("Materie prime");
});
