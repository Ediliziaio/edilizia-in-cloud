import { changeFormControl } from "@/test/helpers/changeFormControl";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";

/** «Le fasi del cantiere dal piano» (lotto 6, 14/11/2026): si controlla, si sposta, si crea. */
const m = vi.hoisted(() => ({ rpc: vi.fn(), voci: [] as unknown[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@/hooks/useGeneralePiano", () => ({ useGeneralePianoNumeri: () => ({ isLoading: false, voci: m.voci }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FasiDalPianoDialog } from "@/components/orders/generali/design/FasiDalPianoDialog";

let n = 0;
const voce = (descrizione: string, importo: number, categoria = "costruzione"): VocePiano => ({
  id: `v${++n}`, tipo: "costo", categoria: categoria as VocePiano["categoria"], descrizione, importo, mese: "2026-12", durataMesi: 9,
  figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: n * 10, origineId: null,
});
const riepilogo = { generale: { id: "g", modello: "sviluppo" }, figlie: [], permessi: { importi: true, costi: true, margini: true } } as unknown as RiepilogoGenerale;
const disegna = () => render(
  <QueryClientProvider client={new QueryClient()}>
    <FasiDalPianoDialog open onOpenChange={vi.fn()} riepilogo={riepilogo} fasiEsistenti={0} />
  </QueryClientProvider>,
);

beforeEach(() => {
  n = 0;
  m.rpc.mockReset().mockResolvedValue({ data: { aggiunte: 2, saltate: 0, voci: 3, con_costi: true }, error: null });
  m.voci = [voce("Opere civili secondo computo", 300000), voce("Finestre", 35000), voce("Magazzini edili", 50000), voce("Unità 1", 365000, "vendite")];
});
afterEach(cleanup);

describe("fasi del cantiere dal piano", () => {
  it("propone le fasi con le voci e lascia sulla generale quello che non è un lavoro", () => {
    disegna();
    expect(screen.getByLabelText("Crea la fase Strutture e opere civili")).toBeChecked();
    expect(screen.getByLabelText("Crea la fase Impianti")).not.toBeChecked();
    expect(screen.getByLabelText("Dal mese, Strutture e opere civili")).toHaveValue("01/2027");
    expect(screen.getByText(/1 costo resta sulla generale/)).toBeInTheDocument();
    expect(screen.getByText("2 fasi, 2 lavorazioni.")).toBeInTheDocument();
  });

  it("una voce spostata cambia fase; la creazione manda nomi, date e id", async () => {
    disegna();
    changeFormControl(screen.getByLabelText("Fase di Magazzini edili"), { target: { value: "strutture" } });
    expect(screen.getByText("2 fasi, 3 lavorazioni.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Crea 2 fasi" }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    const [fn, args] = m.rpc.mock.calls[0];
    expect(fn).toBe("generale_fasi_dal_piano");
    expect(args.p_fasi).toEqual([
      { nome: "Strutture e opere civili", inizio: "2027-01-01", fine: "2027-04-30", voci: ["v1", "v3"] },
      { nome: "Serramenti e opere da fabbro", inizio: "2027-04-01", fine: "2027-07-31", voci: ["v2"] },
    ]);
  });

  it("una data scritta male ferma la creazione e lo dice", () => {
    disegna();
    changeFormControl(screen.getByLabelText("Al mese, Strutture e opere civili"), { target: { value: "13/27" } });
    expect(screen.getByText(/date da correggere/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crea 2 fasi" })).toBeDisabled();
  });
});
