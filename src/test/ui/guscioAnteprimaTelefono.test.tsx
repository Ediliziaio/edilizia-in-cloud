/**
 * Anteprima da telefono e da tablet (sotto i 1280 px, 06/10/2026): senza la colonna di destra l'anteprima sale dal
 * basso. Si apre da due punti (il pulsante con l'occhio nella barra delle fasi e il totale nel piede), mostra gli
 * stessi numeri della colonna, si chiude con Esc o toccando fuori, e non lascia un velo scuro sulla pagina.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Hammer } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuscioEdile } from "@/components/preventivatore/GuscioEdile";
import type { AnteprimaPreventivo } from "@/lib/preventivatore/anteprima";

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: false, canViewCosts: false }) }));

afterEach(() => cleanup());

const anteprima: AnteprimaPreventivo = {
  emittente: "Bianchi", codice: "BGN-1", dataEtichetta: null, titolo: "Rifacimento bagno", cliente: { nome: "Mario Rossi", righe: [] },
  gruppi: [{ id: "g", titolo: "Demolizioni", righe: [{ id: "r1", titolo: "Rimozione sanitari", quantita: 1, unita: "cad", prezzoUnitario: 900, totale: 900 }] }],
  totali: [{ id: "t", etichetta: "Totale", importo: 900, forte: true }], totaleDocumento: 900, avvisi: [], note: [],
};

function guscio() {
  return render(
    <GuscioEdile
      testata={{ icona: Hammer, titolo: "BGN-1", onEsci: () => undefined }}
      passi={[{ key: "cliente", label: "Cliente" }, { key: "computo", label: "Computo" }]}
      corrente="computo"
      completati={new Set<string>()}
      onSelect={() => undefined}
      anteprima={anteprima}
      statoSalvataggio="salvato"
      piede={{
        onIndietro: () => undefined, indietroDisabilitato: false, onAvanti: () => undefined, etichettaAvanti: "Salva e continua",
        avantiDisabilitato: false, inCorso: false, ultimoPasso: false,
      }}
    >
      <p>contenuto</p>
    </GuscioEdile>,
  );
}

describe("anteprima apribile e chiudibile sotto i 1280 px", () => {
  it("si apre dal pulsante in barra e dal totale nel piede, con la voce e il totale del preventivo", async () => {
    guscio();
    const apritori = screen.getAllByRole("button", { name: /apri l'anteprima/i });
    expect(apritori).toHaveLength(2);
    for (const apritore of apritori) {
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(apritore);
      const finestra = await screen.findByRole("dialog");
      expect(within(finestra).getByText("Anteprima")).toBeTruthy();
      expect(within(finestra).getByText("Rimozione sanitari")).toBeTruthy();
      // formattaEuro: «€ 900», senza decimali.
      expect(within(finestra).getAllByText(/€\s900\b/).length).toBeGreaterThan(0);
      fireEvent.keyDown(finestra, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });

  it("si chiude anche con il pulsante di chiusura, e dopo la pagina è di nuovo toccabile (nessun velo)", async () => {
    guscio();
    fireEvent.click(screen.getAllByRole("button", { name: /apri l'anteprima/i })[0]);
    const finestra = await screen.findByRole("dialog");
    fireEvent.click(within(finestra).getByRole("button", { name: /chiudi|close/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector("[data-state='open'][class*='bg-black']")).toBeNull();
    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("l'anteprima aperta da telefono non ha il pulsante «nascondi», che è della colonna da computer", async () => {
    guscio();
    fireEvent.click(screen.getAllByRole("button", { name: /apri l'anteprima/i })[0]);
    const finestra = await screen.findByRole("dialog");
    expect(within(finestra).queryByRole("button", { name: /nascondi/i })).toBeNull();
  });
});
