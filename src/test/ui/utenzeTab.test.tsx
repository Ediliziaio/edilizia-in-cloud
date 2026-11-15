// @vitest-environment jsdom
// Costi → Utenze: elenco dei contatori dalle bollette, collegamento a sede/immobile/commessa,
// decisione sui doppioni sospetti, sola lettura.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const stato = vi.hoisted(() => ({
  chiamate: [] as Array<{ nome: string; args: unknown }>,
  permessi: { canViewCosts: true, solaLettura: false },
  righe: {} as Record<string, unknown[]>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "order", "limit"]) q[m] = () => q;
      q.then = (ok: (v: unknown) => unknown) => ok({ data: stato.righe[t] ?? [], error: null });
      return q;
    },
    rpc: async (nome: string, args: unknown) => { stato.chiamate.push({ nome, args }); return { data: { bollette_riviste: 2 } as unknown, error: null as unknown }; },
  },
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "az" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => stato.permessi }));

import UtenzeTab, { destinazioneAttuale, type Destinazione } from "@/components/costi/UtenzeTab";

function seme() {
  stato.righe = {
    utenze: [
      { id: "u1", tipo: "luce", codice: "IT001E02621799", fornitore_nome: "Energia Spa", indirizzo_fornitura: "Via Roma 3, Torino", numero_contratto: "11734015" },
      { id: "u2", tipo: "gas", codice: "00881234567890", fornitore_nome: "Gas Spa", indirizzo_fornitura: null, numero_contratto: null },
    ],
    utenze_destinazioni: [{ id: "d1", utenza_id: "u2", destinazione_tipo: "sede", sede_id: "s1", unita_id: null, order_id: null, valido_dal: "-infinity", valido_al: null }],
    bollette_righe: [
      { bolletta_id: "b1", utenza_id: "u1", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 120 },
      { bolletta_id: "b2", utenza_id: "u1", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 120 },
    ],
    bollette: [
      { id: "b1", numero: "FT-1", data: "2026-10-05", stato: "riconosciuta", costo_esito: "da_collegare", avvisi: [] },
      { id: "b2", numero: "FT-2", data: "2026-10-06", stato: "doppione_sospetto", costo_esito: "sospesa", avvisi: [{ codice: "x", testo: "stesso periodo e stesso importo della bolletta FT-1" }] },
    ],
    sedi: [{ id: "s1", nome: "Sede di Torino" }],
    orders: [{ id: "o1", order_code: "COMM-12", description: "Via Roma 3" }],
    unita_immobiliari: [],
  };
}
const apri = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><UtenzeTab /></QueryClientProvider>);
afterEach(() => { cleanup(); stato.chiamate = []; stato.permessi = { canViewCosts: true, solaLettura: false }; });

describe("Costi → Utenze", () => {
  it("elenca le utenze col codice, l'indirizzo come aiuto e dove va il costo", async () => {
    seme();
    apri();
    expect(await screen.findByText("IT001E02621799")).toBeTruthy();
    expect(screen.getByText("Via Roma 3, Torino")).toBeTruthy();
    expect(screen.getByText("Da collegare")).toBeTruthy();
    expect(screen.getByText("Sede · Sede di Torino")).toBeTruthy();
    // La spesa dell'anno non conta il doppione sospetto (120 €, non 240 €).
    expect(screen.getByText(/120,00/)).toBeTruthy();
    expect(screen.queryByText(/240,00/)).toBeNull();
  });

  it("il doppione sospetto si decide: «Non è un doppione» o «Scarta»", async () => {
    seme();
    apri();
    const sezione = await screen.findByRole("region", { name: "Bollette da decidere" });
    expect(within(sezione).getByText(/stesso periodo e stesso importo/)).toBeTruthy();
    fireEvent.click(within(sezione).getByRole("button", { name: "Non è un doppione" }));
    await vi.waitFor(() => expect(stato.chiamate).toContainEqual({ nome: "bolletta_decidi", args: { p_bolletta: "b2", p_decisione: "non_doppione" } }));
  });

  it("in sola lettura niente pulsanti né collegamenti", async () => {
    seme();
    stato.permessi = { canViewCosts: true, solaLettura: true };
    apri();
    await screen.findByText("IT001E02621799");
    expect(screen.queryByRole("button", { name: "Non è un doppione" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Destinazione di/ })).toBeNull();
  });

  it("una nota di credito si sottrae dalla spesa, anche se la riga ha l'importo positivo", async () => {
    seme();
    stato.righe.bollette_righe = [
      { bolletta_id: "b1", utenza_id: "u1", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 120 },
      { bolletta_id: "nc", utenza_id: "u1", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 20 },
    ];
    stato.righe.bollette = [
      { id: "b1", numero: "FT-1", data: "2026-10-05", stato: "riconosciuta", tipo: "ordinaria", costo_esito: "da_collegare", avvisi: [] },
      { id: "nc", numero: "NC-1", data: "2026-10-09", stato: "riconosciuta", tipo: "nota_credito", costo_esito: "da_collegare", avvisi: [] },
    ];
    apri();
    expect(await screen.findByText(/100,00/)).toBeTruthy();
  });

  it("senza utenze spiega da dove nasceranno", async () => {
    stato.righe = {};
    apri();
    expect(await screen.findByText(/nascono da sole dalle bollette/)).toBeTruthy();
  });

  it("la destinazione che vale oggi è l'ultima aperta", () => {
    const d = (id: string, dal: string, al: string | null): Destinazione => ({ id, utenza_id: "u", destinazione_tipo: "commessa", sede_id: null, unita_id: null, order_id: id, valido_dal: dal, valido_al: al });
    expect(destinazioneAttuale([d("a", "2026-01-01", "2026-09-30"), d("b", "2026-10-01", null)], "u", "2026-11-15")?.id).toBe("b");
    expect(destinazioneAttuale([d("a", "2026-01-01", "2026-09-30")], "u", "2026-11-15")).toBeNull();
  });
});
