/**
 * Nuova uscita senza fattura: tutto già alla creazione (12/11/2026).
 *
 * Prima la finestra prendeva solo importo, data, fornitore, una commessa e un mezzo: le note non
 * c'erano, i documenti si allegavano solo dopo, riaprendo l'uscita, e un costo diviso tra due
 * cantieri non si poteva registrare. Il mese di competenza restava «---------- ----».
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stato = vi.hoisted(() => ({
  inseriti: [] as Array<{ tabella: string; riga: Record<string, unknown> }>,
  caricati: [] as string[],
  erroreUpload: null as null | { message: string },
  uscite: [] as unknown[],
  aggiornati: [] as Array<Record<string, unknown>>,
  eliminati: [] as string[],
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" } }) }));
vi.mock("@/lib/listino/loadCatalogPages", () => ({ loadCatalogPages: async (): Promise<unknown[]> => [] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const risposta = (tabella: string) => {
    const dati: unknown[] = tabella === "orders"
      ? [{ id: "o1", order_code: "C-1", description: "Villa" }, { id: "o2", order_code: "C-2", description: "Scuola" }]
      : [];
    const catena: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "in", "not"]) catena[m] = () => catena;
    catena.limit = async () => ({ data: dati, error: null as unknown });
    catena.range = async () => ({ data: tabella === "company_costs" ? stato.uscite : [], error: null as unknown });
    catena.update = (riga: Record<string, unknown>) => {
      stato.aggiornati.push(riga);
      const fine: Record<string, unknown> = {};
      fine.eq = () => fine; fine.select = () => fine; fine.single = async () => ({ data: { id: "u1" }, error: null as unknown });
      return fine;
    };
    catena.delete = () => {
      const fine: Record<string, unknown> = {};
      fine.eq = (_c: string, v: string) => { if (_c === "id") stato.eliminati.push(v); return fine; };
      fine.select = async () => ({ data: [{ id: "u1" }], error: null as unknown });
      return fine;
    };
    catena.insert = (riga: Record<string, unknown>) => {
      stato.inseriti.push({ tabella, riga });
      const fine = { select: () => fine, single: async () => ({ data: { id: "costo-1" }, error: null as unknown }), then: (r: (v: unknown) => void) => r({ error: null as unknown }) };
      return fine;
    };
    return catena;
  };
  return {
    supabase: {
      from: (t: string) => risposta(t),
      storage: {
        from: () => ({
          upload: async (percorso: string) => { stato.caricati.push(percorso); return { error: stato.erroreUpload }; },
          remove: async () => ({ error: null as unknown }),
        }),
      },
    },
  };
});

import { UsciteSenzaFattura } from "@/components/fatturazione/UsciteSenzaFattura";
import { toast } from "sonner";

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= () => {};

beforeEach(() => { stato.inseriti = []; stato.caricati = []; stato.erroreUpload = null; stato.uscite = []; stato.aggiornati = []; stato.eliminati = []; vi.clearAllMocks(); });
afterEach(cleanup);

function apri() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <UsciteSenzaFattura companyId="c1" puoModificare />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Nuova uscita/ }));
  return screen.getByRole("dialog");
}

async function scegliCommessa(finestra: HTMLElement, n: number, nome: string) {
  fireEvent.click(within(finestra).getByRole("combobox", { name: `Commessa ${n}` }));
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(nome) }));
  // La lista si chiude dopo la scelta: la prossima tendina si apre solo quando questa è sparita.
  await waitFor(() => expect(screen.queryAllByRole("option")).toHaveLength(0));
}

describe("Nuova uscita senza fattura", () => {
  it("il mese di competenza è già compilato con quello della data", () => {
    const finestra = apri();
    const data = (within(finestra).getByLabelText("Data") as HTMLInputElement).value;
    expect(within(finestra).getByLabelText("Mese di competenza")).toHaveValue(data.slice(0, 7));
  });

  it("si divide su due commesse, con note e documenti, e tutto parte con il salvataggio", async () => {
    const finestra = apri();
    fireEvent.change(within(finestra).getByLabelText("Cos'è"), { target: { value: "Tassa occupazione suolo" } });
    fireEvent.change(within(finestra).getByLabelText("Importo €"), { target: { value: "300" } });
    await scegliCommessa(finestra, 1, "Villa");
    fireEvent.click(within(finestra).getByRole("button", { name: /Dividi su un'altra commessa/ }));
    await scegliCommessa(finestra, 2, "Scuola");
    expect(within(finestra).getByLabelText("Quota commessa 1 %")).toHaveValue("50");
    fireEvent.change(within(finestra).getByLabelText("Quota commessa 1 %"), { target: { value: "70" } });
    fireEvent.change(within(finestra).getByLabelText("Quota commessa 2 %"), { target: { value: "30" } });
    fireEvent.change(within(finestra).getByLabelText("Note"), { target: { value: "Pagata allo sportello" } });
    const pdf = new File(["x"], "ricevuta.pdf", { type: "application/pdf" });
    fireEvent.change(within(finestra).getByLabelText("Scegli i documenti"), { target: { files: [pdf] } });
    expect(within(finestra).getByText("ricevuta.pdf")).toBeInTheDocument();

    fireEvent.click(within(finestra).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(stato.inseriti.some((i) => i.tabella === "fattura_allegati")).toBe(true));

    const costo = stato.inseriti.find((i) => i.tabella === "company_costs")!.riga;
    expect(costo).toMatchObject({
      name: "Tassa occupazione suolo", amount: 300, senza_fattura: true, notes: "Pagata allo sportello",
      order_id: null, allocations: [{ order_id: "o1", pct: 70 }, { order_id: "o2", pct: 30 }],
    });
    expect(stato.caricati[0]).toMatch(/^c1\/company_cost\/costo-1\/.+-ricevuta\.pdf$/);
    expect(stato.inseriti.find((i) => i.tabella === "fattura_allegati")!.riga).toMatchObject({ company_cost_id: "costo-1", file_name: "ricevuta.pdf" });
    expect(toast.success).toHaveBeenCalledWith("Uscita registrata con il documento");
  });

  it("se un documento non passa, l'uscita resta salvata e lo dice", async () => {
    stato.erroreUpload = { message: "Rete assente." };
    const finestra = apri();
    fireEvent.change(within(finestra).getByLabelText("Cos'è"), { target: { value: "Bollo" } });
    fireEvent.change(within(finestra).getByLabelText("Importo €"), { target: { value: "16" } });
    fireEvent.change(within(finestra).getByLabelText("Scegli i documenti"), { target: { files: [new File(["x"], "f24.pdf", { type: "application/pdf" })] } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    expect(stato.inseriti.filter((i) => i.tabella === "company_costs")).toHaveLength(1);
    expect(vi.mocked(toast.warning).mock.calls[0][0]).toMatch(/Uscita registrata/);
  });

  it("percentuali oltre il 100% bloccano il salvataggio", async () => {
    const finestra = apri();
    fireEvent.change(within(finestra).getByLabelText("Cos'è"), { target: { value: "Bollo" } });
    fireEvent.change(within(finestra).getByLabelText("Importo €"), { target: { value: "16" } });
    await scegliCommessa(finestra, 1, "Villa");
    fireEvent.click(within(finestra).getByRole("button", { name: /Dividi su un'altra commessa/ }));
    await scegliCommessa(finestra, 2, "Scuola");
    fireEvent.change(within(finestra).getByLabelText("Quota commessa 1 %"), { target: { value: "80" } });
    expect(within(finestra).getByText(/superano il 100%/)).toBeInTheDocument();
    expect(within(finestra).getByRole("button", { name: "Salva" })).toBeDisabled();
  });

  it("un'uscita registrata si riapre compilata, si corregge e si elimina", async () => {
    stato.uscite = [{ id: "u1", name: "Bollo furgone", amount: 16, vat_rate: 0, documento_data: "2026-11-10", due_date: "2026-11-10",
      documento_riferimento: null, mese_competenza: "2026-11-01", is_paid: true, notes: "contanti", allocations: null,
      supplier_id: null, order_id: "o1", mezzo_id: null, suppliers: null, orders: { order_code: "C-1" }, mezzi: null }];
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <UsciteSenzaFattura companyId="c1" puoModificare />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Uscite senza fattura · 1/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Bollo furgone/ }));
    fireEvent.click(screen.getByRole("button", { name: "Modifica" }));
    const finestra = screen.getByRole("dialog");
    expect(within(finestra).getByText("Modifica uscita senza fattura")).toBeInTheDocument();
    expect(within(finestra).getByLabelText("Cos'è")).toHaveValue("Bollo furgone");
    expect(within(finestra).getByLabelText("Note")).toHaveValue("contanti");
    fireEvent.change(within(finestra).getByLabelText("Importo €"), { target: { value: "32" } });
    fireEvent.click(within(finestra).getByRole("button", { name: "Salva modifiche" }));
    await waitFor(() => expect(stato.aggiornati).toHaveLength(1));
    expect(stato.aggiornati[0]).toMatchObject({ amount: 32, name: "Bollo furgone", order_id: "o1", notes: "contanti" });
    expect(stato.inseriti.filter((i) => i.tabella === "company_costs")).toHaveLength(0);
    expect(toast.success).toHaveBeenCalledWith("Uscita aggiornata");

    fireEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Elimina" }));
    await waitFor(() => expect(stato.eliminati).toEqual(["u1"]));
  });
});
