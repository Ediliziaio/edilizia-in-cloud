/**
 * La freccia «Esci dal preventivo» del guscio dei preventivatori edili (07/10/2026).
 *
 * La freccia salva ORA e aspetta il salvataggio prima di uscire: mentre salva è spenta, altrimenti ogni clic in più
 * metteva un altro salvataggio in coda. Con ogni altro stato (modifiche, salvato, errore, nuovo) è accesa e chiama onEsci.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Hammer } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuscioEdile } from "@/components/preventivatore/GuscioEdile";
import type { StatoSalvataggio } from "@/components/preventivatore";
import type { AnteprimaPreventivo } from "@/lib/preventivatore/anteprima";

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: false, canViewCosts: false }) }));

afterEach(() => cleanup());

const anteprima: AnteprimaPreventivo = {
  emittente: "Bianchi", codice: "BGN-1", dataEtichetta: null, titolo: "Bagno", cliente: { nome: "Mario Rossi", righe: [] },
  gruppi: [], totali: [], totaleDocumento: null, avvisi: [], note: [],
};

function guscio(statoSalvataggio: StatoSalvataggio, onEsci: () => void) {
  return render(
    <GuscioEdile
      testata={{ icona: Hammer, titolo: "BGN-1", onEsci }}
      passi={[{ key: "cliente", label: "Cliente" }, { key: "computo", label: "Computo" }]}
      corrente="computo"
      completati={new Set<string>()}
      onSelect={() => undefined}
      anteprima={anteprima}
      statoSalvataggio={statoSalvataggio}
      piede={{
        onIndietro: () => undefined, indietroDisabilitato: false, onAvanti: () => undefined, etichettaAvanti: "Salva e continua",
        avantiDisabilitato: false, inCorso: false, ultimoPasso: false,
      }}
    >
      <p>contenuto</p>
    </GuscioEdile>,
  );
}

const freccia = () => screen.getByRole("button", { name: "Esci dal preventivo" }) as HTMLButtonElement;

describe("freccia «Esci dal preventivo»", () => {
  it("mentre si salva è spenta: il clic non chiama onEsci (niente salvataggi in coda)", () => {
    const onEsci = vi.fn();
    guscio("salvando", onEsci);
    expect(freccia().disabled).toBe(true);
    fireEvent.click(freccia());
    fireEvent.click(freccia());
    expect(onEsci).not.toHaveBeenCalled();
  });

  it.each<StatoSalvataggio>(["modifiche", "salvato", "errore", "nuovo", "locale"])("con lo stato «%s» è accesa e chiama onEsci una volta per clic", (stato) => {
    const onEsci = vi.fn();
    guscio(stato, onEsci);
    expect(freccia().disabled).toBe(false);
    fireEvent.click(freccia());
    expect(onEsci).toHaveBeenCalledTimes(1);
  });

  it("finito il salvataggio si riaccende", () => {
    const onEsci = vi.fn();
    const { rerender } = guscio("salvando", onEsci);
    expect(freccia().disabled).toBe(true);
    rerender(
      <GuscioEdile
        testata={{ icona: Hammer, titolo: "BGN-1", onEsci }}
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
    expect(freccia().disabled).toBe(false);
  });
});
