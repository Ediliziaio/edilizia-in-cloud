import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Scadenzario from "@/pages/azienda/billing/Scadenzario";

const state = vi.hoisted(() => ({ fail: false, summaryFail: false, extraRows: false, exportCsv: vi.fn(), writes: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/lib/csvExport", () => ({ exportToCSV: state.exportCsv }));
vi.mock("@/components/fatturazione/GestionaleEsterno", () => ({ invalidaFattureImportate: vi.fn() }));
vi.mock("@/components/scadenzario/ScadenzarioKPIs", () => ({ default: () => <p>Riepilogo disponibile</p> }));
vi.mock("@/components/scadenzario/FattureDaRegistrareCard", () => ({ default: (): null => null }));
vi.mock("@/components/scadenzario/AdempimentiFiscali", () => ({ default: (): null => null }));
vi.mock("@/components/scadenzario/IncassiPerSettimana", () => ({ IncassiPerSettimanaVista: (): null => null }));
vi.mock("@/components/scadenzario/NewScadenzaDialog", () => ({ default: (): null => null }));
vi.mock("@/components/scadenzario/MarkPaidDialog", () => ({ default: (): null => null }));
vi.mock("@/components/scadenzario/AnnullaIncassoDialog", () => ({ AnnullaIncassoDialog: (): null => null }));
vi.mock("@/components/scadenzario/ScadenzarioTable", () => ({ default: ({ scadenze }: { scadenze: { id: string; description: string }[] }) => <ul aria-label="Risultati scadenze">{scadenze.map(s => <li key={s.id}>{s.description}</li>)}</ul> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: () => Promise.resolve({ data: {}, error: state.summaryFail ? { message: "Riepilogo assente" } : null }),
  from: () => {
    const year = new Date().getFullYear();
    let rows = [
      { id: "1", description: "Incasso aperto", direction: "entrata", status: "da_pagare" },
      { id: "2", description: "Incasso parziale", direction: "entrata", status: "parziale" },
      { id: "3", description: "Incasso già saldato", direction: "entrata", status: "pagata" },
      { id: "4", description: "Pagamento aperto", direction: "uscita", status: "da_pagare" },
      { id: "5", description: "Pagamento già saldato", direction: "uscita", status: "pagata" },
      { id: "6", description: "Incasso annullato", direction: "entrata", status: "annullata" },
    ].map(r => ({ ...r, company_id: "demo", due_date: `${year}-01-01`, amount: 100, paid_amount: 0 }));
    if (state.extraRows) rows = [...rows, ...Array.from({ length: 1001 }, (_, i) => ({ ...rows[0], id: `extra-${i}`, description: `Scadenza demo ${i}` }))];
    let from = 0, to = Infinity;
    const q: Record<string, unknown> = {};
    const methods: Record<string, (a: unknown, b: unknown) => void> = {
      eq: (k, v) => { rows = rows.filter(r => r[k as keyof typeof r] === v); },
      neq: (k, v) => { rows = rows.filter(r => r[k as keyof typeof r] !== v); },
      in: (k, v) => { rows = rows.filter(r => (v as unknown[]).includes(r[k as keyof typeof r])); },
      gte: () => {}, lte: () => {}, lt: () => {}, ilike: () => {},
      order: () => {}, select: () => {}, range: (a, b) => { from = Number(a); to = Number(b); }, limit: () => {},
    };
    for (const [name, fn] of Object.entries(methods)) q[name] = (a: unknown, b: unknown) => { fn(a, b); return q; };
    for (const name of ["insert", "update", "delete"]) q[name] = state.writes;
    q.then = (ok: (value: unknown) => unknown) => Promise.resolve({ data: state.fail ? null : rows.slice(from, to + 1), count: rows.length, error: state.fail ? { message: "Rete assente" } : null }).then(ok);
    return q;
  },
} }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}><Scadenzario /></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => { state.fail = false; state.summaryFail = false; state.extraRows = false; state.exportCsv.mockClear(); state.writes.mockClear(); });
afterEach(cleanup);

describe("Scadenzario: viste aperte e recupero errori", () => {
  it("Da incassare e Da pagare escludono saldati e annullati, anche nell'export", async () => {
    setup();
    await screen.findByText("Incasso già saldato");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Da Incassare/ }), { button: 0, ctrlKey: false });
    await screen.findByText("Incasso aperto");
    expect(screen.queryByText("Incasso già saldato")).toBeNull();
    expect(screen.getByText("Incasso parziale")).toBeTruthy();
    expect(screen.queryByText("Incasso annullato")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Esporta CSV" }));
    await waitFor(() => expect(state.exportCsv).toHaveBeenCalled());
    expect(state.exportCsv.mock.calls[0][0].map((r: { descrizione: string }) => r.descrizione)).toEqual(["Incasso aperto", "Incasso parziale"]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Da Pagare/ }), { button: 0, ctrlKey: false });
    await screen.findByText("Pagamento aperto");
    expect(screen.queryByText("Pagamento già saldato")).toBeNull();
    expect(state.writes).not.toHaveBeenCalled();
  });
  it("esporta tutte le pagine oltre il limite REST di 1000 righe", async () => {
    state.extraRows = true;
    setup();
    await screen.findByText("Incasso aperto");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Da Incassare/ }), { button: 0, ctrlKey: false });
    await screen.findByText("Incasso parziale");
    fireEvent.click(screen.getByRole("button", { name: "Esporta CSV" }));
    await waitFor(() => expect(state.exportCsv).toHaveBeenCalledTimes(1));
    expect(state.exportCsv.mock.calls[0][0]).toHaveLength(1003);
    expect(state.writes).not.toHaveBeenCalled();
  });
  it("un errore di lettura non appare come elenco vuoto e Riprova recupera i dati", async () => {
    state.fail = true; setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Non riesco a caricare le scadenze");
    expect(screen.queryByRole("list", { name: "Risultati scadenze" })).toBeNull();
    expect(screen.getByRole("button", { name: "Esporta CSV" })).toBeDisabled();
    state.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Riprova scadenze" }));
    expect(await screen.findByText("Incasso aperto")).toBeTruthy();
    expect(state.writes).not.toHaveBeenCalled();
  });
  it("un errore nel riepilogo non lascia uno scheletro infinito o totali falsi", async () => {
    state.summaryFail = true; setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Riepilogo scadenze non disponibile");
    expect(screen.queryByText("Riepilogo disponibile")).toBeNull();
    state.summaryFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Riprova riepilogo" }));
    expect(await screen.findByText("Riepilogo disponibile")).toBeTruthy();
    expect(state.writes).not.toHaveBeenCalled();
  });
});
