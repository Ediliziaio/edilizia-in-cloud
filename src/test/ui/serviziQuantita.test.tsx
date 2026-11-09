/** La quantità di un servizio aggiuntivo si salva mentre la si cambia, con le mezze unità e senza azzerarsi da sola (09/11/2026). */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SrProgettoDetail } from "@/types/serramenti";

const { update } = vi.hoisted(() => ({ update: vi.fn() }));
const mutazione = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock("@/lib/serramenti/queries", () => ({
  useAddManodopera: () => mutazione,
  useUpdateManodopera: () => ({ mutate: update, isPending: false }),
  useDeleteManodopera: () => mutazione,
  useTariffeManodopera: () => ({ data: [] as unknown[], isLoading: false }),
}));

import { ServiziSection } from "@/components/serramenti/ServiziSection";

afterEach(() => { cleanup(); update.mockClear(); });

const detail = {
  servizi: [{ id: "v1", progetto_id: "p1", tipo: "trasporto", descrizione: "Trasporto", unita: "n", quantita: 1, prezzo_unitario_vendita: 100, prezzo_totale: 100, tariffa_id: null, position: 0 }],
  serramenti: [], accessori: [], media: [], risparmio: null, progetto: { id: "p1", stato: "bozza" },
} as unknown as SrProgettoDetail;

const campo = () => screen.getByRole("spinbutton", { name: "Quantità Trasporto" }) as HTMLInputElement;

describe("Quantità dei servizi", () => {
  it("parte senza uscire dal campo, anche a mezze unità", async () => {
    render(<ServiziSection progettoId="p1" detail={detail} />);
    fireEvent.change(campo(), { target: { value: "2.5" } });
    await waitFor(() => expect(update).toHaveBeenCalledWith({ id: "v1", patch: { quantita: 2.5 } }));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("zero si può scrivere; vuoto torna il numero salvato e non azzera", () => {
    render(<ServiziSection progettoId="p1" detail={detail} />);
    fireEvent.change(campo(), { target: { value: "" } });
    fireEvent.blur(campo());
    expect(campo().value).toBe("1");
    expect(update).not.toHaveBeenCalled();
    fireEvent.change(campo(), { target: { value: "0" } });
    fireEvent.blur(campo());
    expect(update).toHaveBeenCalledWith({ id: "v1", patch: { quantita: 0 } });
  });
});
