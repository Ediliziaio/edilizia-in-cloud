import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegoleContoFornitore } from "@/components/costi/RegoleContoFornitore";

const stato = vi.hoisted(() => ({
  regola: null as { company_id: string; fornitore_id: string; categoria_id: string } | null,
  errorePiano: false,
  inserisci: vi.fn(), aggiorna: vi.fn(), exportCsv: vi.fn(), contiene: vi.fn(),
}));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, canViewBilling: true, solaLettura: false }) }));
vi.mock("@/lib/csvExport", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/csvExport")>();
  return {
    ...original,
    exportToCSV: (...args: Parameters<typeof original.exportToCSV>) => {
      stato.exportCsv(...args);
      original.exportToCSV(...args);
    },
  };
});
vi.mock("@/integrations/supabase/client", () => {
  const from = (tabella: string) => {
      const filtri = new Map<string, string>();
      let nuovaCategoria: string | null = null;
      const q = {
        select: () => q,
        eq: (campo: string, valore: string) => { filtri.set(campo, valore); return q; },
        neq: () => q, is: () => q, not: () => q, order: () => q,
        contains: (colonna: string, valore: unknown) => { stato.contiene(colonna, valore); return q; },
        range: async (): Promise<{ data: unknown[] | null; error: Error | null }> => {
          if (tabella === "fatture_ricevute" && stato.errorePiano) {
            return { data: null, error: new Error("Piano non disponibile") };
          }
          const fattura = { id: "f1", numero_fattura: "F-1", cedente_ragione_sociale: "Fornitore demo" };
          const rata = { metodo: "riba", stato: "da_pagare", pagata_il: null as string | null, fattura_id: fattura.id,
            numero_fattura: fattura.numero_fattura, fornitore: fattura.cedente_ragione_sociale };
          const righe: Record<string, unknown[]> = {
            scadenzario_rate_fornitori: [
              { ...rata, id: "r1", numero: 1, scadenza: "2026-10-30", importo: 100, residuo: 100 },
              { ...rata, id: "r2", numero: 2, scadenza: "2026-11-30", importo: 120, residuo: 80 },
              { ...rata, id: "r3", numero: 3, scadenza: "2026-12-30", importo: 90, residuo: 90 },
              { ...rata, id: "r4", numero: 4, scadenza: "2026-11-30", importo: 70, residuo: 0, stato: "pagata" },
              { ...rata, id: "r5", numero: 5, scadenza: "2026-11-15", importo: 17.35, residuo: 17.35 },
              { ...rata, id: "r6", numero: 6, scadenza: "2026-11-30", importo: 88, residuo: 88, metodo: "bonifico" },
              { ...rata, id: "r7", numero: 7, scadenza: "2026-11-30", importo: null, residuo: null },
              { ...rata, id: "r8", numero: 8, scadenza: null, importo: 34, residuo: 34, fattura_id: null, numero_fattura: null },
            ],
            fatture_ricevute: [{
              id: "f2", numero_fattura: "F-2", cedente_ragione_sociale: "Fornitore 2", tipo_documento: "TD01", pagata_il: null,
              piano_pagamento: [{ modalita: "MP12", scadenza: "2026-11-30", importo: 210 }],
            }, {
              id: "f1", numero_fattura: "F-1", cedente_ragione_sociale: "Fornitore demo", tipo_documento: "TD01", pagata_il: null,
              piano_pagamento: [{ modalita: "MP12", scadenza: "2026-11-30", importo: 120 }],
            }],
            suppliers: [{ id: "s1", name: "FI d’Italia demo", vat_number: "01234567890", fiscal_code: "00012345678" }],
            fornitori_conti_costo: stato.regola ? [stato.regola] : [],
          };
          return { data: righe[tabella] ?? [], error: null };
        },
        insert: async (regola: NonNullable<typeof stato.regola>) => {
          stato.inserisci(regola);
          if (stato.regola) return { error: { code: "23505" } };
          stato.regola = regola;
          return { error: null };
        },
        update: (regola: { categoria_id: string }) => { nuovaCategoria = regola.categoria_id; return q; },
        delete: () => q,
        maybeSingle: async (): Promise<{ data: typeof stato.regola; error: null }> => {
          const attesa = filtri.get("categoria_id");
          stato.aggiorna(attesa, nuovaCategoria);
          if (!stato.regola || stato.regola.categoria_id !== attesa) return { data: null, error: null };
          const applicata = stato.regola;
          stato.regola = nuovaCategoria ? { ...stato.regola, categoria_id: nuovaCategoria } : null;
          return { data: applicata, error: null };
        },
      };
      return q;
  };
  return { supabase: { from, rpc: from } };
});
beforeEach(() => {
  stato.regola = null;
  stato.errorePiano = false;
  stato.inserisci.mockClear();
  stato.aggiorna.mockClear();
  stato.exportCsv.mockClear();
  stato.contiene.mockClear();
});
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("Conti predefiniti dei fornitori", () => {
  it("salva la regola con il fornitore e il conto selezionati nell’azienda attiva", async () => {
    render(<QueryClientProvider client={client()}><RegoleContoFornitore companyId="c1"
      categorie={[{ id: "leasing", name: "leasing" }]} modifica onClose={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(await screen.findByLabelText("Fornitore", { exact: true }), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Conto di costo"), { target: { value: "leasing" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva regola" }));
    await waitFor(() => expect(screen.getByRole("list")).toHaveTextContent(/FI d’Italia demo.*Leasing/));
    expect(stato.inserisci).toHaveBeenCalledWith({ company_id: "c1", fornitore_id: "s1", categoria_id: "leasing" });
  });

  it("trova il fornitore per codice fiscale e conserva il conto salvato da un’altra scheda", async () => {
    stato.regola = { company_id: "c1", fornitore_id: "s1", categoria_id: "leasing" };
    render(<QueryClientProvider client={client()}><RegoleContoFornitore companyId="c1"
      categorie={[{ id: "leasing", name: "leasing" }, { id: "noli", name: "Noli" }, { id: "materiali", name: "Materiali" }]}
      modifica onClose={vi.fn()} /></QueryClientProvider>);
    fireEvent.change(await screen.findByLabelText("Cerca fornitore"), { target: { value: "000 123 456 78" } });
    expect(screen.getByRole("option", { name: /FI d’Italia demo/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Fornitore", { exact: true }), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Conto di costo"), { target: { value: "materiali" } });
    stato.regola = { ...stato.regola, categoria_id: "noli" };
    fireEvent.click(screen.getByRole("button", { name: "Salva regola" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/La regola è cambiata/);
    expect(stato.aggiorna).toHaveBeenCalledWith("leasing", "materiali");
    expect(screen.getByLabelText("Conto di costo")).toHaveValue("noli");
  });
});
