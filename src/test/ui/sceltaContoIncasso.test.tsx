/**
 * «Dove c'è la banca vorrei che mi uscissero anche le altre, così da poter scegliere e non
 * rischiare di sbagliare nell'inserimento manuale degli altri IBAN» (26/11/2026, Impresa Vulcano).
 *
 * In «Fatturazione elettronica → Dati pagamento per XML» c'erano tre campi liberi: per incassare
 * su un'altra banca bisognava ribattere 27 caratteri a mano, su un dato che finisce nell'XML e con
 * cui il cliente paga. La tendina dei conti esisteva dal 19/11, ma solo dentro «Dettagli bancari»
 * della sezione Pagamento, chiusa, e solo se l'azienda aveva già scritto più di un conto.
 *
 * Qui si tiene fermo: i conti si scelgono, un IBAN sbagliato si vede prima dello SdI, e il conto
 * scritto a mano una volta si salva fra quelli dell'azienda — la seconda volta è in tendina.
 */
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { SceltaContoIncasso } from "@/components/fatturazione/SceltaContoIncasso";
import type { AnagraficaAzienda } from "@/types/fatturazione";

const fake = vi.hoisted(() => ({
  update: vi.fn(),
  righe: [{ company_id: "az" }] as { company_id: string }[],
  errore: null as { message: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (campi: Record<string, unknown>) => {
        fake.update(campi);
        return { eq: () => ({ select: async () => ({ data: fake.righe, error: fake.errore }) }) };
      },
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PRINCIPALE = "IT09B0538722800000035200769";
const ALTRO = "IT60X0542811101000000123456";

const azienda = (conti: { nome: string; iban: string }[] = []): Partial<AnagraficaAzienda> => ({
  company_id: "az", ragione_sociale: "Impresa Esempio S.r.l.",
  iban_principale: PRINCIPALE, nome_banca: "BPER BANCA S.P.A.",
  conti_fatturazione: conti,
});

beforeEach(() => { vi.clearAllMocks(); fake.righe = [{ company_id: "az" }]; fake.errore = null; });
afterEach(cleanup);

function monta(props: Partial<Parameters<typeof SceltaContoIncasso>[0]> = {}) {
  const onCambia = vi.fn();
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SceltaContoIncasso
          azienda={azienda()} iban={PRINCIPALE} nomeBanca="BPER BANCA S.P.A."
          intestatario="Impresa Esempio S.r.l." onCambia={onCambia} {...props}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return onCambia;
}

describe("scegliere il conto su cui incassare, dentro i dati per l'XML", () => {
  it("elenca i conti dell'azienda e, scegliendone un altro, riscrive IBAN e banca", () => {
    const onCambia = monta({ azienda: azienda([{ nome: "BCC conto lavori", iban: ALTRO }]) });
    const tendina = screen.getByLabelText("Conto su cui incassare") as HTMLSelectElement;
    expect([...tendina.options].map((o) => o.value)).toEqual([PRINCIPALE, ALTRO, "__a_mano__"]);
    fireEvent.change(tendina, { target: { value: ALTRO } });
    expect(onCambia).toHaveBeenCalledWith(expect.objectContaining({
      iban_pagamento: ALTRO, nome_banca: "BCC conto lavori",
    }));
  });

  it("un IBAN sbagliato si vede qui, non allo SdI", () => {
    monta({ iban: "IT09B05387228000000352007" });
    expect(screen.getByRole("alert").textContent).toContain("lo SdI lo rifiuta");
    expect(screen.queryByRole("button", { name: "Salva fra i conti dell'azienda" })).toBeNull();
  });

  it("un conto scritto a mano si salva fra quelli dell'azienda, e non si riscrive più", async () => {
    monta({ iban: ALTRO, nomeBanca: "BCC" });
    fireEvent.click(screen.getByRole("button", { name: "Salva fra i conti dell'azienda" }));
    await waitFor(() => expect(fake.update).toHaveBeenCalledWith({
      conti_fatturazione: [{ nome: "BCC", iban: ALTRO, banca: "BCC" }],
    }));
  });

  it("se l'accesso non permette di cambiare la scheda non si finge che sia salvato", async () => {
    const { toast } = await import("sonner");
    fake.righe = [];
    monta({ iban: ALTRO, nomeBanca: "BCC" });
    fireEvent.click(screen.getByRole("button", { name: "Salva fra i conti dell'azienda" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Il conto non è stato salvato", expect.anything()));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("chi ha un conto solo sa dove scrivere gli altri", () => {
    monta();
    expect(screen.getByRole("link", { name: /impostazioni/i }).getAttribute("href"))
      .toBe("/azienda/impostazioni/fatturazione");
  });
});
