import { describe, it, expect } from "vitest";
import { puoReinviare, isInvioInCorso } from "@/lib/fatturazione/sdiCassetto";

/**
 * Predicati UI del Cassetto SDI. Devono rispecchiare la guardia server-side
 * (sdiInvioGuard): il bottone "Reinvia" compare SOLO per fatture scartate (NS /
 * stato 'rifiutata'), MAI per fatture già consegnate/accettate o mentre l'invio
 * è in corso.
 */

describe("isInvioInCorso", () => {
  it("è true solo per lo stato transitorio 'in_invio'", () => {
    expect(isInvioInCorso({ stato: "in_invio" })).toBe(true);
    expect(isInvioInCorso({ stato: "rifiutata" })).toBe(false);
    expect(isInvioInCorso({ stato: "inviata_sdi" })).toBe(false);
  });
});

describe("puoReinviare", () => {
  it("permette il reinvio di una fattura scartata (NS)", () => {
    expect(puoReinviare({ stato: "rifiutata", sdi_stato: "NS" })).toBe(true);
  });

  it("permette il reinvio quando stato='rifiutata' anche senza sdi_stato", () => {
    expect(puoReinviare({ stato: "rifiutata", sdi_stato: null })).toBe(true);
  });

  it("NON mostra reinvio durante un invio in corso ('in_invio')", () => {
    // Dopo il click su Reinvia lo stato diventa 'in_invio' ma sdi_stato resta 'NS':
    // il bottone NON deve ricomparire (evita doppio click → doppio invio).
    expect(puoReinviare({ stato: "in_invio", sdi_stato: "NS" })).toBe(false);
  });

  it.each(["RC", "AT", "DT", "EC"])(
    "NON mostra reinvio per fatture già prese in carico/consegnate (sdi_stato='%s')",
    (sdiStato) => {
      expect(puoReinviare({ stato: "rifiutata", sdi_stato: sdiStato })).toBe(false);
    },
  );

  it.each(["bozza", "emessa", "inviata_sdi", "consegnata", "accettata", "pagata"])(
    "NON mostra reinvio per stato '%s' senza scarto",
    (stato) => {
      expect(puoReinviare({ stato, sdi_stato: null })).toBe(false);
    },
  );
});
