import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Selettore di commessa di DDT, fatture ricevute, magazzino e mezzi (14/11/2026): la generale
 * si trova per nome, ha l'etichetta «Generale», e le figlie le stanno sotto.
 */
const m = vi.hoisted(() => ({ chiamate: [] as Array<[string, unknown[]]>, righe: [] as unknown[], fail: false, generali: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => {
  // Una lettura con `.in("id", …)` è quella dei nomi delle generali; le altre sono l'elenco.
  const catena = (perNome = false): unknown =>
    new Proxy(
      {},
      {
        get(_t, k: string) {
          if (k === "then") return (ok: (v: unknown) => void) => ok(m.fail ? { data: null, error: { message: "offline" } } : { data: perNome ? m.generali : m.righe, error: null });
          if (k === "maybeSingle") return async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null });
          return (...args: unknown[]) => {
            m.chiamate.push([k, args]);
            return catena(perNome || k === "in");
          };
        },
      },
    );
  return { supabase: { from: () => catena() } };
});

import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

const riga = (id: string, order_code: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, order_code, client_name: null, client_company: null, customer: null, work_start_date: null, work_end_date: null,
  expected_date: null, indirizzo_lavori: null, work_address: null, status: null, description: null,
  workflow_kind: "commessa", commessa_generale_id: null, order_items: [], ...extra,
});

afterEach(() => { cleanup(); m.chiamate = []; m.fail = false; });

describe("OrderSelectCombobox e le commesse generali", () => {
  it("«Grandi lavori» chiede generali e figlie e le mostra in fila, con l'etichetta", async () => {
    m.righe = [
      riga("g", "O-0003", { workflow_kind: "generale", description: "Via Antonio Lotti 196" }),
      riga("f1", "O-0009", { commessa_generale_id: "g", client_name: "Unità 1" }),
      riga("x", "O-0020", { commessa_generale_id: "h", client_name: "Bagno" }),
    ];
    m.generali = [{ id: "h", order_code: "O-0001", description: "Cherubini" }];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrderSelectCombobox companyId="c" value={undefined} onChange={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Commessa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Grandi lavori" }));
    await waitFor(() => expect(m.chiamate).toContainEqual(["or", ["workflow_kind.eq.generale,commessa_generale_id.not.is.null"]]));
    // Il nome si legge solo per la generale che non è già nell'elenco.
    await waitFor(() => expect(m.chiamate).toContainEqual(["in", ["id", ["h"]]]));
    const opzioni = await screen.findAllByRole("option");
    expect(opzioni.map((o) => o.textContent)).toEqual([
      expect.stringContaining("O-0003Generale"),
      expect.stringContaining("O-0009"),
      expect.stringContaining("O-0020"),
    ]);
    expect(within(opzioni[0]).getByText(/Via Antonio Lotti 196/)).toBeInTheDocument();
    // La figlia sotto la sua generale non ripete «in …»; quella di un'altra generale sì.
    expect(within(opzioni[1]).queryByText(/^in /)).toBeNull();
    expect(within(opzioni[2]).getByText("in O-0001 · Cherubini")).toBeInTheDocument();
  });

  it("con generaliSempre (fatture ricevute) le operazioni stanno in cima anche in «Tutte»", async () => {
    m.righe = [
      riga("u1", "O-0030", { commessa_generale_id: "g", client_name: "Unità 1", work_start_date: "2026-11-01" }),
      riga("g", "O-0003", { workflow_kind: "generale", description: "Via Antonio Lotti 196" }),
    ];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrderSelectCombobox companyId="c" value={undefined} onChange={vi.fn()} filtroIniziale="all" generaliSempre />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Commessa" }));
    // Le generali si chiedono a parte: senza date finivano oltre le 200 più recenti.
    await waitFor(() => expect(m.chiamate).toContainEqual(["eq", ["workflow_kind", "generale"]]));
    const opzioni = await screen.findAllByRole("option");
    expect(opzioni[0].textContent).toContain("O-0003Generale");
  });

  it("la ricerca guarda anche il nome della commessa, dove sta il nome della generale", async () => {
    m.righe = [];
    render(
      <QueryClientProvider client={new QueryClient()}>
        <OrderSelectCombobox companyId="c" value={undefined} onChange={vi.fn()} filtroIniziale="all" />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Commessa" }));
    fireEvent.change(await screen.findByPlaceholderText(/Cerca per codice/), { target: { value: "Lotti" } });
    await waitFor(() =>
      expect(m.chiamate.some(([k, a]) => k === "or" && String(a[0]).includes("description.ilike.%Lotti%"))).toBe(true),
    );
  });
});

it("il collegamento all’Ufficio cerca solo commesse operative, mantenendo azienda e record non eliminati", async () => {
  m.righe = []; m.generali = [];
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OrderSelectCombobox companyId="company-demo" soloOperative filtroIniziale="all" onChange={vi.fn()} value={undefined} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("combobox", { name: "Commessa" }));
  await waitFor(() => expect(m.chiamate).toContainEqual(["or", ["workflow_kind.neq.generale,workflow_kind.is.null"]]));
  expect(m.chiamate).toContainEqual(["eq", ["company_id", "company-demo"]]);
  expect(m.chiamate).toContainEqual(["is", ["deleted_at", null]]);
});
it("un errore di lettura non viene presentato come elenco vuoto e permette di riprovare", async () => {
  m.fail = true; m.righe = []; m.generali = [];
  const onChange = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OrderSelectCombobox companyId="company-demo" filtroIniziale="all" onChange={onChange} value={undefined} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("combobox", { name: "Commessa" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare le commesse.");
  expect(onChange).not.toHaveBeenCalled();
  m.fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(screen.getByText("Nessun ordine trovato")).toBeInTheDocument();
});
