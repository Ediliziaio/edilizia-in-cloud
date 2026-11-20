import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RevisioneMateriali } from "@/components/orders/materiali/RevisioneMateriali";
import type { MaterialeFase } from "@/hooks/useMaterialiPerFase";

vi.mock("@/components/orders/materiali/VerificaDatiMateriale", () => ({
  VerificaDatiMaterialeDialog: ({ m, avanzamento, onConfermata, onAperto }: { m: { id: string }; avanzamento: { posizione: number; totale: number }; onConfermata: () => void; onAperto: (aperto: boolean) => void }) =>
    <div role="dialog" aria-label="Verifica"><span>{m.id}</span><span>{avanzamento.posizione} di {avanzamento.totale}</span><button onClick={onConfermata}>Salvataggio riuscito</button><button onClick={() => onAperto(false)}>Annulla</button></div>,
}));
afterEach(cleanup);
const materiale = (id: string, stato: "confermata" | "da_verificare" = "da_verificare") => ({ id, name: id, origini: [{ tipo: "computo", voce_id: "v1", descrizione: "Voce", quantita: 1, quantita_voce: 1, unita_voce: "pz", verifica_acquisto: { stato, motivi: ["Modello da confermare"], campi_mancanti: ["modello"] } }] } as unknown as MaterialeFase);
describe("revisione guidata", () => {
  it("apre solo le righe da verificare del contesto e avanza dopo ogni salvataggio riuscito", () => {
    render(<RevisioneMateriali materiali={[materiale("a"), materiale("gia-fatto", "confermata"), materiale("b")]} />);
    expect(screen.getByText("2 articoli da completare")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inizia revisione" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("a1 di 2");
    fireEvent.click(screen.getByRole("button", { name: "Salvataggio riuscito" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("b2 di 2");
    fireEvent.click(screen.getByRole("button", { name: "Salvataggio riuscito" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("annullare non passa alla riga successiva e non dichiara verifiche riuscite", () => {
    render(<RevisioneMateriali materiali={[materiale("a"), materiale("b")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Inizia revisione" }));
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/articoli verificati/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprendi revisione" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("a1 di 2");
  });
});
