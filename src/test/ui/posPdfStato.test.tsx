/**
 * L'avanzamento del PDF del POS nell'editor: il testo della fase e il pulsante «Annulla» a sola icona (regola del
 * telefono: azioni secondarie solo icona). Si annulla finché si prepara o si disegna; dopo il server potrebbe aver già conservato.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnullaPdf, AnnunciaFasePdf } from "@/components/sicurezza/pos/PosPdfStato";
import { etichettaFasePdf } from "@/lib/sicurezza/posPdfErrori";

afterEach(cleanup);

describe("Fasi del PDF", () => {
  it("ogni fase ha il suo testo, in italiano semplice, e senza fase non c'è testo", () => {
    expect(etichettaFasePdf("prepara")).toBe("Preparo il documento…");
    expect(etichettaFasePdf("disegna")).toBe("Disegno il PDF…");
    expect(etichettaFasePdf("conserva")).toBe("Lo conservo…");
    expect(etichettaFasePdf("server")).toBe("Lo preparo sul server…");
    expect(etichettaFasePdf("annullo")).toBe("Annullo…");        // il riscontro subito dopo il clic su «Annulla»
    expect(etichettaFasePdf(null)).toBeUndefined();
  });

  it("la fase si annuncia a chi usa uno screen reader", () => {
    render(<AnnunciaFasePdf fase="disegna" />);
    expect(screen.getByRole("status").textContent).toBe("Disegno il PDF…");
  });
});

describe("Annulla", () => {
  it("compare, a sola icona e con il suo nome per chi non vede l'icona, mentre si prepara o si disegna, e annulla", () => {
    for (const fase of ["prepara", "disegna"] as const) {
      const annulla = vi.fn();
      const { unmount } = render(<AnnullaPdf fase={fase} onAnnulla={annulla} />);
      const pulsante = screen.getByRole("button", { name: "Annulla" });
      expect(pulsante.textContent).toBe("");                    // solo icona
      fireEvent.click(pulsante);
      expect(annulla).toHaveBeenCalledOnce();
      unmount();
    }
  });

  it("non compare quando non si può più fermare (si conserva, o lavora il server), né mentre si annulla, né quando non c'è nulla in corso", () => {
    for (const fase of ["conserva", "server", "annullo", null] as const) {
      const { container, unmount } = render(<AnnullaPdf fase={fase} onAnnulla={vi.fn()} />);
      expect(container.querySelector("button")).toBeNull();
      unmount();
    }
  });
});
