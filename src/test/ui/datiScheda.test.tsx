import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

/** Scheda «Dati» della commessa generale (14/11/2026). */
const m = vi.hoisted(() => ({ salva: vi.fn() }));
vi.mock("@/hooks/useCommesseGenerali", () => ({
  useSalvaDatiGenerale: () => ({ mutate: m.salva, isPending: false }),
  messaggioGenerale: (_e: unknown, cosa: string) => `errore ${cosa}`,
}));
vi.mock("@/components/orders/generali/ScegliCliente", () => ({
  ScegliCliente: ({ onCambia }: { onCambia: (v: string | null) => void }) => <button type="button" onClick={() => onCambia("cli-2")}>Scegli cliente</button>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { SchedaDati } from "@/components/orders/generali/moduli/DatiScheda";

const riepilogo = (modello: "appalto" | "sviluppo" | "compravendita", extra: Partial<RiepilogoGenerale["generale"]> = {}) => ({
  generale: { id: "g", codice: "O-1", nome: "Op", cliente: null, clienteId: null, modello, creataIl: null, valore: null, dati: {}, ...extra },
  figlie: [],
  permessi: { importi: true, costi: true, margini: true },
}) as unknown as RiepilogoGenerale;
const disegna = (r: RiepilogoGenerale, puoModificare = true) => render(<SchedaDati riepilogo={r} totali={{} as never} puoModificare={puoModificare} />);

beforeEach(() => m.salva.mockReset());
afterEach(cleanup);

describe("scheda Dati", () => {
  it("appalto: dice cosa manca e ha la sezione delle figure", () => {
    disegna(riepilogo("appalto"));
    expect(screen.getByRole("status")).toHaveTextContent("Mancano il committente, se è pubblico o privato, l'indirizzo del cantiere, l'inizio dei lavori.");
    expect(screen.getByRole("region", { name: "Committente e figure" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Immobile acquistato" })).toBeNull();
  });

  it("la commessa: manda solo quello che è cambiato, il cliente come cliente_id", () => {
    disegna(riepilogo("sviluppo", { indirizzo: "Via A" }));
    const comune = screen.getByRole("region", { name: "La commessa" });
    fireEvent.change(within(comune).getByLabelText("Inizio lavori"), { target: { value: "2027-03-01" } });
    fireEvent.click(within(comune).getByRole("button", { name: "Scegli cliente" }));
    fireEvent.click(within(comune).getByRole("button", { name: "Salva" }));
    expect(m.salva).toHaveBeenCalledWith({ inizio: "2027-03-01", cliente_id: "cli-2" }, expect.anything());
  });

  it("date al contrario: non salva", () => {
    disegna(riepilogo("sviluppo", { inizio: "2027-03-01" }));
    const comune = screen.getByRole("region", { name: "La commessa" });
    fireEvent.change(within(comune).getByLabelText("Fine lavori prevista"), { target: { value: "2027-01-01" } });
    expect(within(comune).getByText("Viene prima dell'inizio.")).toBeInTheDocument();
    fireEvent.click(within(comune).getByRole("button", { name: "Salva" }));
    expect(m.salva).not.toHaveBeenCalled();
  });

  it("compravendita: l'immobile si salva intero, il prezzo come numero, i vuoti come null", () => {
    disegna(riepilogo("compravendita"));
    const immobile = screen.getByRole("region", { name: "Immobile acquistato" });
    fireEvent.change(within(immobile).getByLabelText(/Prezzo d'acquisto/), { target: { value: "185.000" } });
    fireEvent.change(within(immobile).getByLabelText("Rogito d'acquisto"), { target: { value: "2027-02-15" } });
    fireEvent.click(within(immobile).getByRole("button", { name: "Salva" }));
    const [payload] = m.salva.mock.calls[0];
    expect(payload.immobile).toMatchObject({ prezzo: 185000, data_rogito: "2027-02-15", venditore: null });
  });

  it("chi non può modificare legge e basta", () => {
    disegna(riepilogo("sviluppo", { indirizzo: "Via A" }), false);
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull();
    expect(screen.getByLabelText("Indirizzo dell'area")).toBeDisabled();
  });
});
