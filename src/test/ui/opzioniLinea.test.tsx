import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { VariantiTipologiaDialog } from "@/components/listino/VariantiTipologiaDialog";
import type { TipologiaListino } from "@/lib/listino/lineeListino";
afterEach(cleanup);
function tipo(): TipologiaListino {
  return {
    nome: "Serramenti", macrocategoriaId: "macro", linee: ["Salamander", "Aluplast"].map((nome, i) => ({
      chiave: "cat-" + i, nome, fonte: "categoria", categoriaId: "cat-" + i,
      righe: [{ famiglia: { id: "family-" + i, attivo: true, deleted_at: null as string | null, axes: [{
        id: "axis-" + i, codice: "colore", nome: "Colore", obbligatorio: true, values: [{
          id: "value-" + i, valore: "bianco", label: "Bianco", is_default: true, attivo: true,
          maggiorazione_tipo: "percentuale", maggiorazione_valore: 10 + i * 10,
          maggiorazione_acquisto: 5, opzioni: [] as string[],
        }]
      }] } }]
    }))
  } as unknown as TipologiaListino;
}
describe("opzioni comuni per linea", () => {
  it("modifica solo la linea selezionata e blocca cambi di ambito con modifiche aperte", () => {
    const salva = vi.fn();
    render(<VariantiTipologiaDialog tipologia={tipo()} area="serramenti" inCorso={false} onChiudi={() => {}} onSalva={salva} />);
    expect(screen.getByRole("combobox", { name: "Ambito delle opzioni" })).toHaveTextContent("Solo linea Salamander");
    expect(screen.getByLabelText("Maggiorazione di vendita di Bianco")).toHaveValue("+10");
    fireEvent.change(screen.getByLabelText("Maggiorazione di vendita di Bianco"), { target: { value: "15" } });
    expect(screen.getByRole("combobox", { name: "Ambito delle opzioni" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /^Salva$/ }));
    expect(salva).toHaveBeenCalledOnce();
    expect(salva).toHaveBeenCalledWith(expect.any(Array), ["family-0"]);
    expect(salva.mock.calls[0][0][0].valori[0].vendita).toBe(15);
  });
});
