import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";
import { DA_STIMARE } from "@/lib/orders/generali/budgetCompletezza";

/**
 * Il calendario rapido del piano e il riquadro «Budget da completare» (14/11/2026, URBAN VISION:
 * 88 voci importate da Excel senza mese bloccavano cassa, capitale e approvazione).
 */
const m = vi.hoisted(() => ({ salva: vi.fn(), modifica: vi.fn() }));
vi.mock("@/hooks/useGeneralePiano", () => ({
  useCalendarioPiano: () => ({ mutate: m.salva, isPending: false }),
  useModificaVoce: () => ({ mutate: m.modifica, isPending: false }),
  messaggioPiano: (_e: unknown, cosa: string) => `errore ${cosa}`,
}));

import { CalendarioPianoDialog } from "@/components/orders/generali/piano/CalendarioPianoDialog";
import { CompletezzaBudget } from "@/components/orders/generali/piano/CompletezzaBudget";

let n = 0;
const voce = (v: Partial<VocePiano>): VocePiano => ({
  id: `v${++n}`, tipo: "costo", categoria: "costruzione", descrizione: `Voce ${n}`, importo: 1000, mese: null, durataMesi: 1,
  figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: n * 10, origineId: null, ...v,
});

beforeEach(() => { n = 0; m.salva.mockReset(); m.modifica.mockReset(); });
afterEach(cleanup);

describe("calendario rapido del piano", () => {
  const voci = () => [
    voce({ tipo: "ricavo", categoria: "vendite", descrizione: "Unità 1", importo: 365_000 }),
    voce({ categoria: "terreno", descrizione: "Acquisto immobile", importo: 726_750 }),
    voce({ categoria: "costruzione", descrizione: "Demolizioni", importo: 0 }),
    voce({ categoria: "costruzione", descrizione: "Opere edili", importo: 4100, mese: "2027-06" }),
  ];
  const apri = (v = voci()) =>
    render(<CalendarioPianoDialog open onOpenChange={vi.fn()} generaleId="g" versioneId="b" modello="sviluppo" voci={v} />);

  it("propone i tempi del modello per gruppo e non sceglie il mese d'inizio", () => {
    apri();
    expect(screen.getByText("Vendite")).toBeInTheDocument();
    expect(screen.getByText("Terreno e acquisto")).toBeInTheDocument();
    expect(screen.getByLabelText("L'operazione parte a")).toHaveValue("");
    expect(screen.getByText("4.100 €", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Metti i mesi" })).toBeDisabled();
  });

  it("con il mese d'inizio scrive i mesi alle voci senza mese, anche a quelle ancora a zero, e lo dice", () => {
    apri();
    fireEvent.change(screen.getByLabelText("L'operazione parte a"), { target: { value: "03/2027" } });
    expect(screen.getByText(/Cambiano 3 voci: 2 con un importo, 1 ancora a zero\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Metti i mesi a 3 voci" }));
    const modifiche = m.salva.mock.calls[0][0] as { id: string; mese: string; durataMesi: number }[];
    expect(modifiche.map((x) => x.id).sort()).toEqual(["v1", "v2", "v3"]);
    // Terreno: mese 1 dell'operazione → il mese d'inizio.
    expect(modifiche.find((x) => x.id === "v2")?.mese).toBe("2027-03");
  });

  it("le voci che hanno già un mese si riscrivono solo a chiederlo", () => {
    apri();
    fireEvent.change(screen.getByLabelText("L'operazione parte a"), { target: { value: "03/2027" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Riscrivi anche/ }));
    fireEvent.click(screen.getByRole("button", { name: "Metti i mesi a 4 voci" }));
    expect((m.salva.mock.calls[0][0] as unknown[]).length).toBe(4);
  });

  it("un mese scritto male e tempi fuori misura fermano la conferma con la ragione", () => {
    apri();
    fireEvent.change(screen.getByLabelText("L'operazione parte a"), { target: { value: "13/27x" } });
    expect(screen.getByText("Scrivi il mese come 11/2026.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("L'operazione parte a"), { target: { value: "03/2027" } });
    fireEvent.change(screen.getByLabelText("Per mesi, Vendite"), { target: { value: "0" } });
    expect(screen.getByText(/Un gruppo ha tempi da correggere/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Metti i mesi/ })).toBeDisabled();
  });
});

describe("budget da completare", () => {
  it("una riga per problema, ognuna con la sua azione; le frasi non si ripetono", () => {
    const onCalendario = vi.fn();
    render(
      <CompletezzaBudget
        generaleId="g" versioneId="b" modificabile onCalendario={onCalendario}
        voci={[voce({ importo: 5000 }), voce({ importo: 0, descrizione: "Bonifica", nota: DA_STIMARE })]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Budget da completare" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Metti i mesi/ }));
    expect(onCalendario).toHaveBeenCalled();
    expect(screen.queryByText("Bonifica")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Vedi le voci/ }));
    fireEvent.click(screen.getByRole("button", { name: "Conferma zero" }));
    expect(m.modifica.mock.calls[0][0]).toEqual({ id: "v2", modifica: { importo: 0 } });
  });

  it("in sola lettura dice cosa manca senza offrire azioni", () => {
    render(<CompletezzaBudget generaleId="g" versioneId="b" modificabile={false} onCalendario={vi.fn()} voci={[voce({ importo: 5000 })]} />);
    expect(screen.getByText(/non ha il mese/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Metti i mesi/ })).not.toBeInTheDocument();
  });

  it("completo, lo dice in una riga", () => {
    render(<CompletezzaBudget generaleId="g" versioneId="b" modificabile voci={[voce({ importo: 5000, mese: "2027-01" })]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Non risultano stime o scadenze mancanti");
  });
});
