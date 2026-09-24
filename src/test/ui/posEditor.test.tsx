/**
 * L'editor del POS disegnato davvero: le undici sezioni del modello, la
 * completezza, «Approva» che su un POS incompleto mostra le voci mancanti
 * invece di chiamare il server, un POS approvato in sola lettura con «Nuova
 * revisione», e una scheda proposta dall'AI che chiede la conferma.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { lavorazioneVuota, posVuoto, type PosContenuto } from "../../../supabase/functions/_shared/posModello";

const stato = vi.hoisted(() => ({
  pos: null as unknown,
  approva: vi.fn(),
}));

vi.mock("@/hooks/usePos", () => {
  const mut = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  class ErrorePos extends Error {
    constructor(m: string, readonly mancanti: unknown[] = []) { super(m); }
  }
  return {
    ErrorePos,
    usePos: () => ({ data: stato.pos, isLoading: false, error: null as Error | null, refetch: vi.fn() }),
    useSalvaPos: mut,
    useApprovaPos: () => ({ mutate: vi.fn(), mutateAsync: stato.approva, isPending: false }),
    useNuovaRevisione: mut,
    datiAppPos: vi.fn(() => new Promise(() => {})),
    lavorazioniAiPos: vi.fn(),
    caricaAllegatoPos: vi.fn(),
    linkAllegatoPos: vi.fn(),
  };
});
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canViewSicurezzaCantiere: true, isAdmin: true, solaLettura: false }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az-1" }));

import PosEditor from "@/pages/azienda/sicurezza/PosEditor";

beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
  if (!("structuredClone" in globalThis)) {
    (globalThis as unknown as { structuredClone: unknown }).structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v));
  }
});
afterEach(() => { cleanup(); stato.approva.mockReset(); });

function riga(contenuto: PosContenuto, status = "bozza") {
  return {
    id: "pos-1", company_id: "az-1", order_id: "ord-1", status, revisione: status === "approvato" ? 1 : 0,
    revisioni: [{ rev: 0, data: "2026-09-24", descrizione: "Prima emissione" }], contenuto, daCompilare: false, iter: {},
    approvato_da_nome: status === "approvato" ? "Mario Rossi" : null, approvato_il: status === "approvato" ? "2026-09-24T10:00:00Z" : null,
    created_at: "2026-09-24T09:00:00Z", updated_at: "2026-09-24T09:00:00Z",
    commessa: { order_code: "ORD-2026-029", description: "Cappotto termico" },
  };
}

function mostra() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/azienda/sicurezza-cantiere/pos/pos-1"]}>
        <Routes><Route path="/azienda/sicurezza-cantiere/pos/:id" element={<PosEditor />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("editor del POS", () => {
  it("mostra le sezioni del modello e blocca l'approvazione di un POS incompleto", () => {
    stato.pos = riga(posVuoto());
    mostra();
    expect(screen.getByRole("heading", { name: "Piano Operativo di Sicurezza" })).toBeTruthy();
    for (const titolo of ["Opera, committente e cantiere", "Dati identificativi dell'impresa", "Lavorazioni svolte in cantiere", "Firme e consegna"]) {
      expect(screen.getByRole("heading", { name: new RegExp(titolo) })).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: /Approva/ }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText(/Nominativo del datore di lavoro/)).toBeTruthy();
    expect(stato.approva).not.toHaveBeenCalled();
  });

  it("un POS approvato si legge soltanto e offre la nuova revisione", () => {
    stato.pos = riga(posVuoto(), "approvato");
    mostra();
    expect(screen.queryByRole("button", { name: /^Approva$/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Nuova revisione/ })).toBeTruthy();
    expect((screen.getByLabelText("Datore di lavoro") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/da Mario Rossi il 24\/09\/2026/)).toBeTruthy();
  });

  it("una scheda proposta dall'AI chiede la conferma, e scrivere segna le modifiche da salvare", () => {
    const p = posVuoto();
    p.lavorazioni = [{ ...lavorazioneVuota("ai-1"), titolo: "Montaggio ponteggio", origine: "ai", verificata: false }];
    stato.pos = riga(p);
    mostra();
    expect(screen.getByText("Proposta dall'AI")).toBeTruthy();
    expect(screen.getByText(/Ho letto questa scheda/)).toBeTruthy();
    expect(screen.queryByText("Modifiche non salvate")).toBeNull();
    fireEvent.change(screen.getByLabelText("Datore di lavoro"), { target: { value: "Mario Rossi" } });
    expect(screen.getByText("Modifiche non salvate")).toBeTruthy();
  });
});
