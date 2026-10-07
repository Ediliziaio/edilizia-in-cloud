/**
 * Passo PDF da telefono: l'ultimo riquadro del passo non finisce sotto la barra fissa (06/10/2026).
 *
 * Al passo PDF la barra «indietro · PDF · invia per firma» (BarraInvioMobile) è fissa, 66 px alta e a 5,5 rem dal
 * fondo (più l'area sicura); il contenitore che scorre (`<main>` di CompanyLayout) ha solo 7 rem di spazio in
 * fondo, e il piede che di solito riempie quello spazio al passo PDF è nascosto. Misurato a 375 × 740: arrivati in
 * fondo alla pagina il riquadro «Il cliente ha accettato? · Crea commessa» stava tra 578 e 628 px, la barra tra 586
 * e 652: il pulsante era coperto e non si poteva più né toccare né scorrere oltre. Il guscio riserva lo spazio
 * che manca, solo da telefono e solo quando la barra c'è.
 */
import { cleanup, render } from "@testing-library/react";
import { Hammer } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuscioEdile } from "@/components/preventivatore/GuscioEdile";
import { RISERVA_BARRA_INVIO_TELEFONO } from "@/components/preventivatore";
import type { AnteprimaPreventivo } from "@/lib/preventivatore/anteprima";

vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewMargins: false, canViewCosts: false }) }));

afterEach(() => cleanup());

const anteprima: AnteprimaPreventivo = {
  emittente: "Bianchi", codice: "BGN-1", dataEtichetta: null, titolo: "Bagno", cliente: { nome: "Mario Rossi", righe: [] },
  gruppi: [], totali: [], totaleDocumento: null, avvisi: [], note: [],
};

function guscio(nascostoSuTelefono: boolean) {
  return render(
    <GuscioEdile
      testata={{ icona: Hammer, titolo: "BGN-1", onEsci: () => undefined }}
      passi={[{ key: "cliente", label: "Cliente" }, { key: "pdf", label: "PDF" }]}
      corrente="pdf"
      completati={new Set<string>()}
      onSelect={() => undefined}
      anteprima={anteprima}
      statoSalvataggio="salvato"
      piede={{
        onIndietro: () => undefined, indietroDisabilitato: false, onAvanti: () => undefined, etichettaAvanti: "Salva",
        avantiDisabilitato: false, inCorso: false, ultimoPasso: true, nascostoSuTelefono,
      }}
    >
      <p>contenuto</p>
    </GuscioEdile>,
  ).container.firstElementChild as HTMLElement;
}

describe("guscio dei preventivatori al passo PDF da telefono", () => {
  it("con la barra di invio fissa riserva lo spazio sotto il contenuto (sopra la barra, area sicura compresa)", () => {
    const radice = guscio(true);
    expect(RISERVA_BARRA_INVIO_TELEFONO).toContain("env(safe-area-inset-bottom)");
    for (const classe of RISERVA_BARRA_INVIO_TELEFONO.split(" ")) expect(radice.className).toContain(classe);
  });

  it("senza la barra (tutti gli altri passi) niente spazio in più: c'è il piede a riempirlo", () => {
    const radice = guscio(false);
    expect(radice.className).not.toContain("max-md:pb-");
  });

  it("lo spazio è solo da telefono: da tablet e computer la barra non c'è", () => {
    expect(RISERVA_BARRA_INVIO_TELEFONO.startsWith("max-md:")).toBe(true);
  });
});
