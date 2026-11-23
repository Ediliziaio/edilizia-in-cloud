import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Scadenzario from "@/pages/azienda/billing/Scadenzario";

const state = vi.hoisted(() => ({ fail: false, summaryFail: false, extraRows: false, senzaData: false, exportCompleto: false, exportCsv: vi.fn(), writes: vi.fn(), projectionErrors: vi.fn() }));
vi.mock("@/components/charts/grafici/GraficoEntrateUscite", () => ({ GraficoEntrateUscite: (): null => null }));
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
  // scadenzario_totali (23/11/2026) risponde riepilogo e mesi insieme: una
  // chiamata sola invece del riepilogo più due giri del grafico.
  rpc: (name: string) => name === "scadenzario_fonti" ? supabase.from("scadenze") : Promise.resolve({ data: { riepilogo: { senza_data_count: state.senzaData ? 1 : 0 }, mesi: null }, error: state.summaryFail ? { message: "Riepilogo assente" } : null }),
  from: () => {
    const year = new Date().getFullYear();
    let rows = [
      { id: "1", description: "Incasso aperto", direction: "entrata", status: "da_pagare" },
      { id: "2", description: "Incasso parziale", direction: "entrata", status: "parziale" },
      { id: "3", description: "Incasso già saldato", direction: "entrata", status: "pagata" },
      { id: "4", description: "Pagamento aperto", direction: "uscita", status: "da_pagare" },
      { id: "5", description: "Pagamento già saldato", direction: "uscita", status: "pagata" },
      { id: "6", description: "Incasso annullato", direction: "entrata", status: "annullata" },
    ].map(r => ({ ...r, company_id: "demo", due_date: `${year}-01-01` as string | null, amount: 100, paid_amount: 0,
      order_id: state.exportCompleto ? "commessa-demo" : null, orders: state.exportCompleto ? { order_code: "C-DEMO" } : null,
      notes: state.exportCompleto ? "Nota piano" : null }));
    if (state.extraRows) rows = [...rows, ...Array.from({ length: 1001 }, (_, i) => ({ ...rows[0], id: `extra-${i}`, description: `Scadenza demo ${i}` }))];
    if (state.senzaData) rows.push({ ...rows[0], id: "senza-data", description: "Commessa senza data", due_date: null });
    let from = 0, to = Infinity;
    let proiezione = "*";
    const q: Record<string, unknown> = {};
    const methods: Record<string, (a: unknown, b: unknown) => void> = {
      eq: (k, v) => { rows = rows.filter(r => r[k as keyof typeof r] === v); },
      neq: (k, v) => { rows = rows.filter(r => r[k as keyof typeof r] !== v); },
      in: (k, v) => { rows = rows.filter(r => (v as unknown[]).includes(r[k as keyof typeof r])); },
      is: (k, v) => { rows = rows.filter(r => r[k as keyof typeof r] === v); },
      or: () => {},
      gte: () => {}, lte: () => {}, lt: () => {},
      ilike: (_, v) => { rows = rows.filter(r => r.description.toLowerCase().includes(String(v).slice(1, -1).toLowerCase())); },
      order: (campo) => {
        if (campo === "id" && !proiezione.includes("*") && !proiezione.split(",").some(c => c.trim() === "id")) {
          state.projectionErrors();
          throw new Error("column scadenze.id does not exist");
        }
      },
      select: (campi) => { proiezione = String(campi ?? "*"); }, range: (a, b) => { from = Number(a); to = Number(b); }, limit: () => {},
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
beforeEach(() => { state.fail = false; state.summaryFail = false; state.extraRows = false; state.senzaData = false; state.exportCompleto = false; state.exportCsv.mockClear(); state.writes.mockClear(); state.projectionErrors.mockClear(); });
afterEach(cleanup);

describe("Scadenzario: viste aperte e recupero errori", () => {
  it("apre un pannello compatto e mostra date e filtri avanzati su richiesta", async () => {
    setup();
    await screen.findByText("Incasso aperto");
    fireEvent.click(screen.getByRole("button", { name: "Filtri" }));
    const pannello = within(screen.getByRole("dialog", { name: "Filtri" }));
    expect(pannello.getByRole("combobox", { name: "Vista" })).toHaveValue("aperte");
    expect(pannello.queryByLabelText("Da")).toBeNull();

    const periodo = pannello.getByRole("combobox", { name: "Periodo" });
    fireEvent.change(periodo, { target: { value: "custom" } });
    expect(pannello.getByLabelText("Da")).toBeVisible();
    expect(pannello.getByLabelText("A", { exact: true })).toBeVisible();
    fireEvent.change(periodo, { target: { value: "anno:all" } });
    expect(pannello.queryByLabelText("Da")).toBeNull();

    const altriFiltri = pannello.getByText("Altri filtri");
    expect(altriFiltri.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(altriFiltri);
    expect(altriFiltri.closest("details")).toHaveAttribute("open");
    expect(pannello.getByRole("combobox", { name: "Pagamento" })).toBeVisible();
    fireEvent.click(pannello.getByRole("button", { name: "Azzera" }));
    expect(periodo).toHaveValue(`anno:${new Date().getFullYear()}`);
    expect(state.writes).not.toHaveBeenCalled();
  });
  it("include commesse e note nelle colonne e nelle righe del CSV", async () => {
    state.exportCompleto = true;
    setup();await screen.findByText("Incasso aperto");
    fireEvent.click(screen.getByRole("button", { name: "Esporta CSV" }));
    await waitFor(() => expect(state.exportCsv).toHaveBeenCalled());
    expect(state.exportCsv.mock.calls[0][0][0]).toEqual(expect.objectContaining({ commesse: "C-DEMO", note: "Nota piano" }));
    expect(state.exportCsv.mock.calls[0][1]).toEqual(expect.arrayContaining([{ key: "commesse", label: "Commesse" }, { key: "note", label: "Note" }]));
  });
  it("carica il grafico con l'identità necessaria all'ordinamento della RPC", async () => {
    setup();
    await screen.findByText("Incasso aperto");
    expect(state.projectionErrors).not.toHaveBeenCalled();
  });
  it("Da incassare e Da pagare escludono saldati e annullati, anche nell'export", async () => {
    setup();
    // Si apre su «Aperte» (16/11/2026): il saldato non c'è; con «Tutte» compare.
    await screen.findByText("Incasso aperto");
    expect(screen.queryByText("Incasso già saldato")).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Tutte/ }), { button: 0, ctrlKey: false });
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
  it("aspetta che la ricerca sia applicata e scarica lo stesso risultato visibile", async () => {
    setup();
    await screen.findByText("Incasso aperto");
    const esporta = screen.getByRole("button", { name: "Esporta CSV" });
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca nello scadenzario" }), { target: { value: "  Incasso parziale  " } });
    expect(esporta).toBeDisabled();
    fireEvent.click(esporta);
    expect(state.exportCsv).not.toHaveBeenCalled();
    await waitFor(() => expect(esporta).toBeEnabled());
    expect(screen.queryByText("Incasso aperto")).toBeNull();
    expect(screen.getByText("Incasso parziale")).toBeInTheDocument();
    fireEvent.click(esporta);
    await waitFor(() => expect(state.exportCsv.mock.calls[0][0]).toEqual([expect.objectContaining({ descrizione: "Incasso parziale" })]));
  });
  it("segnala l’intervallo invertito prima dell’esportazione", async () => {
    setup();
    await screen.findByText("Incasso aperto");
    fireEvent.click(screen.getByRole("button", { name: "Filtri avanzati scadenzario" }));
    fireEvent.change(screen.getByLabelText("Da", { exact: true }), { target: { value: "2026-11-30" } });
    fireEvent.change(screen.getByLabelText("A", { exact: true }), { target: { value: "2026-11-01" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/data finale/);
    expect(screen.getByRole("button", { name: "Esporta CSV" })).toBeDisabled();
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

it("rende visibili gli importi senza data anche con l'anno corrente e li esporta", async () => {
  state.senzaData = true; setup();
  await screen.findByText("Commessa senza data");
  fireEvent.click(screen.getByRole("button", { name: /mostra senza data|1 senza data/i }));
  await waitFor(() => expect(screen.queryByText("Incasso aperto")).toBeNull());
  expect(await screen.findByText("Commessa senza data")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Esporta CSV" }));
  await waitFor(() => expect(state.exportCsv).toHaveBeenCalledOnce());
  expect(state.exportCsv.mock.calls[0][0]).toEqual([expect.objectContaining({ descrizione: "Commessa senza data", scadenza: "" })]);
});
