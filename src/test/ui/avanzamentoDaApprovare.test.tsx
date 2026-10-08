// src/test/ui/avanzamentoDaApprovare.test.tsx
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvanzamentoDaApprovare } from "@/components/orders/AvanzamentoDaApprovare";

const dati = vi.hoisted(() => ({ rapportino: null as unknown, fasi: [] as unknown[], sottofasi: [] as unknown[], chiamate: 0 }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    dati.chiamate += 1;
    const righe = () => (tabella === "order_work_phases" ? dati.fasi : tabella === "order_work_subphases" ? dati.sottofasi : []);
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: righe(), error: null }).then(ok, ko),
      maybeSingle: async () => ({ data: tabella === "campo_rapportini" ? dati.rapportino : null, error: null as null }),
    };
    for (const m of ["select", "eq", "in", "order"]) q[m] = () => q;
    return q;
  };
  return { supabase: { from: catena } };
});

const disegna = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AvanzamentoDaApprovare orderId="o1" reportId="r1" />
    </QueryClientProvider>,
  );
const fase = (id: string, patch: Record<string, unknown> = {}) => ({ id, name: `Fase ${id}`, status: "in_corso", percentuale: 20, ...patch });
beforeEach(() => { dati.rapportino = { fasi_lavorate: [] }; dati.fasi = []; dati.sottofasi = []; dati.chiamate = 0; });
afterEach(cleanup);

describe("AvanzamentoDaApprovare", () => {
  it("se il rapportino non dichiara fasi non mostra niente", async () => {
    const { container } = disegna();
    await waitFor(() => expect(dati.chiamate).toBeGreaterThanOrEqual(3));
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("una fase libera: da quanto a quanto, e che si chiude", async () => {
    dati.fasi = [fase("a")];
    dati.rapportino = { fasi_lavorate: [{ phase_id: "a", percentuale: 100 }] };
    disegna();
    expect(await screen.findByText("Avanzamento che passa in commessa")).toBeInTheDocument();
    expect(screen.getByText("Fase a")).toBeInTheDocument();
    expect(screen.getByText("20% → 100%")).toBeInTheDocument();
    expect(screen.getByText("si chiude")).toBeInTheDocument();
  });

  it("una fase con sottofasi: elenca quelle che diventano fatte", async () => {
    dati.fasi = [fase("f", { percentuale: 33 })];
    dati.sottofasi = [
      { id: "s1", phase_id: "f", name: "Tracce", position: 0, peso: 1, fatta: true, fatta_il: null },
      { id: "s2", phase_id: "f", name: "Cavi", position: 1, peso: 1, fatta: false, fatta_il: null },
      { id: "s3", phase_id: "f", name: "Quadro", position: 2, peso: 1, fatta: false, fatta_il: null },
    ];
    dati.rapportino = { fasi_lavorate: [{ phase_id: "f", percentuale: 67, sottofasi_fatte: ["s2"] }] };
    disegna();
    expect(await screen.findByText("33% → 67%")).toBeInTheDocument();
    expect(screen.getByText("Sottofasi fatte: Cavi")).toBeInTheDocument();
  });

  it("se la voce dice meno di oggi lo spiega: l'avanzamento non scende", async () => {
    dati.fasi = [fase("a", { percentuale: 70 })];
    dati.rapportino = { fasi_lavorate: [{ phase_id: "a", percentuale: 30 }] };
    disegna();
    expect(await screen.findByText("Il rapportino dice 30%: l'avanzamento non scende.")).toBeInTheDocument();
  });
});
