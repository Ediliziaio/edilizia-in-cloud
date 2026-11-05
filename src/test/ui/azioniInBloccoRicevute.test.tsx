// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RicevutaInBlocco } from "@/lib/fatturazione/azioniInBlocco";

type EsitoRpc = { error: { message: string } | null };
const finto = vi.hoisted(() => ({ rpc: vi.fn(async (_f: string, _a: Record<string, unknown>): Promise<{ error: { message: string } | null }> => ({ error: null })) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: finto.rpc } }));
vi.mock("@/components/warehouse/OrderSelectCombobox", () => ({ OrderSelectCombobox: (): null => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AzioniInBloccoRicevute } from "@/components/fatturazione/AzioniInBloccoRicevute";

const riga = (patch: Partial<RicevutaInBlocco>): RicevutaInBlocco => ({
  id: "f1", numero: "1", totale: 100, stato: "non_letta", tipo: "TD01", pagataIl: null, pagataSulCosto: false, verificata: false,
  stornata: false, storico: false, notaSenzaOrdine: false, conOrdine: false, scadenze: [], ...patch,
});
const monta = (righe: RicevutaInBlocco[], onSvuota = vi.fn()) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AzioniInBloccoRicevute companyId="c1" righe={righe} filtrate={5} onSelezionaTutte={vi.fn()} onSvuota={onSvuota} />
    </QueryClientProvider>,
  );
  return onSvuota;
};

describe("barra delle modifiche in blocco", () => {
  it("segna pagate solo le idonee, dice quante restano fuori e poi svuota la selezione", async () => {
    finto.rpc.mockClear();
    const onSvuota = monta([riga({ id: "a" }), riga({ id: "b", numero: "2" }), riga({ id: "n", tipo: "TD04" })]);
    fireEvent.click(screen.getByRole("button", { name: /Segna pagate \(2\)/ }));
    expect(await screen.findByText(/1 fattura: non si paga/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Segna pagate" }).at(-1)!);
    await waitFor(() => expect(onSvuota).toHaveBeenCalled());
    expect(finto.rpc).toHaveBeenCalledTimes(2);
    expect(finto.rpc.mock.calls.map((c) => c[1].p_id).sort()).toEqual(["a", "b"]);
    expect(finto.rpc.mock.calls[0][0]).toBe("segna_fattura_ricevuta_pagata");
  });

  it("se una fallisce la mostra col motivo e non svuota la selezione", async () => {
    finto.rpc.mockReset();
    finto.rpc.mockImplementation(async (_f, a): Promise<EsitoRpc> => ({ error: a.p_fattura_id === "b" ? { message: "Non permesso" } : null }));
    const onSvuota = monta([riga({ id: "a" }), riga({ id: "b", numero: "22" })]);
    fireEvent.click(screen.getByRole("button", { name: /^Verificate \(2\)/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Segna verificate" }));
    expect(await screen.findByText("22: Non permesso")).toBeTruthy();
    expect(onSvuota).not.toHaveBeenCalled();
  });

  it("un'azione che non vale per nessuna è spenta", () => {
    monta([riga({ pagataIl: "2026-01-01" })]);
    expect((screen.getByRole("button", { name: /Segna pagate/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
