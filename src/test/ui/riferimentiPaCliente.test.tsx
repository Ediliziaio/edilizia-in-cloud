/**
 * «Riferimenti appalto» nella scheda cliente (15/11/2026): righe di tutte le commesse,
 * raggruppate, col link alla commessa e il copia sui codici; si vede per la PA e per chi ha
 * almeno un riferimento; «Lotto 1» senza ripetere l'etichetta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RiferimentoPa } from "@/lib/orders/riferimentiPa";

const db = vi.hoisted(() => ({ righe: [] as unknown[], chiesti: [] as string[][] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async (_c: string, ids: string[]) => {
          db.chiesti.push(ids);
          return { data: db.righe.filter((r) => ids.includes((r as RiferimentoPa).order_id)), error: null as unknown };
        },
      }),
    }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { RiferimentiPaCliente } from "@/components/orders/riferimentiPa/RiferimentiPaCliente";

afterEach(() => { cleanup(); db.righe = []; db.chiesti = []; });

const riga = (p: Partial<RiferimentoPa>): RiferimentoPa => ({
  id: "r", company_id: "c", order_id: "o", tipo: "contratto", numero: null, data: null, cig: null, cig_non_dovuto: false,
  cig_motivo_esclusione: null, cup: null, cup_non_dovuto: false, lotto: null, determina: null, impegno_spesa: null,
  ufficio_id: null, codice_univoco_ufficio: null, note_fatturazione: null, fonte: "manuale", fonte_id: null, ordinamento: 0,
  created_at: "2026-11-15", updated_at: "2026-11-15", created_by: null, ...p,
});

const COMMESSE = [
  { id: "o13", order_code: "DEMO2-0013", description: "Scuola media" },
  { id: "o14", order_code: "DEMO2-0014", description: "Senza riferimenti" },
  { id: "o15", order_code: "DEMO2-0015", description: "Palestra" },
];

function monta(props: Partial<Parameters<typeof RiferimentiPaCliente>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RiferimentiPaCliente commesse={COMMESSE} clientePa {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RiferimentiPaCliente", () => {
  it("raggruppa per commessa, col link e i codici da copiare", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    db.righe = [
      riga({ id: "a", order_id: "o13", numero: "Rep. 12/2026", data: "2026-03-02", cig: "1234567ABC", cup: "J51B21000140006", lotto: "Lotto 1", ufficio_id: "u1", codice_univoco_ufficio: "UFXYZ1", impegno_spesa: "Imp. 2026/889", determina: "Det. 45 del 01/02/2026" }),
      riga({ id: "b", order_id: "o15", tipo: "ordine_acquisto", numero: "OA-7", cig_non_dovuto: true, cig_motivo_esclusione: "affidamento in house", cup: "B11H22000330001" }),
    ];
    monta({ nomiUffici: { u1: "Ufficio tecnico" } });
    const gruppi = await screen.findAllByRole("region");
    expect(gruppi).toHaveLength(2);
    expect(db.chiesti[0]).toEqual(["o13", "o14", "o15"]);

    const primo = gruppi[0];
    expect(within(primo).getByRole("link", { name: /DEMO2-0013/ }).getAttribute("href")).toBe("/azienda/ordini/o13");
    expect(within(primo).getByText(/Contratto n\. Rep\. 12\/2026 del 02\/03\/2026/)).toBeTruthy();
    expect(within(primo).getByText("Lotto 1")).toBeTruthy();
    expect(within(primo).queryByText(/Lotto Lotto/)).toBeNull();
    expect(within(primo).getByText("Ufficio tecnico")).toBeTruthy();
    expect(within(primo).getByText("Imp. 2026/889")).toBeTruthy();
    expect(within(primo).getByText("Det. 45 del 01/02/2026")).toBeTruthy();
    fireEvent.click(within(primo).getByRole("button", { name: "Copia CIG" }));
    expect(writeText).toHaveBeenCalledWith("1234567ABC");
    fireEvent.click(within(primo).getByRole("button", { name: "Copia CUP" }));
    expect(writeText).toHaveBeenCalledWith("J51B21000140006");

    const secondo = gruppi[1];
    expect(within(secondo).getByRole("link", { name: /DEMO2-0015/ })).toBeTruthy();
    expect(within(secondo).getByText(/Non dovuto: affidamento in house/)).toBeTruthy();
    expect(screen.queryByText(/DEMO2-0014/)).toBeNull();
  });

  it("PA senza riferimenti: il riquadro c'è e dice dove si scrivono", async () => {
    monta();
    expect(await screen.findByText(/Nessuna commessa ha ancora contratto, CIG o CUP/)).toBeTruthy();
  });

  it("azienda o privato senza riferimenti: niente riquadro", async () => {
    const { container } = monta({ clientePa: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector("[data-testid='riferimenti-pa-cliente']")).toBeNull();
  });

  it("azienda con un CUP su una commessa: il riquadro c'è", async () => {
    db.righe = [riga({ id: "c", order_id: "o14", cup: "J51B21000140006" })];
    monta({ clientePa: false });
    expect(await screen.findByRole("link", { name: /DEMO2-0014/ })).toBeTruthy();
  });
});
