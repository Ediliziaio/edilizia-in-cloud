import { describe, it, expect } from "vitest";
import { puoReinviare, isInvioInCorso, faseSdi, puoInviare, motivoSdi } from "@/lib/fatturazione/sdiCassetto";

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

  it.each(["RC", "AT", "DT", "EC", "EC01", "EC02", "MC"])(
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

// ─── Le fasi verso lo SDI (24/09/2026) ────────────────────────────────────
// «Da inviare SDI» → «In elaborazione» → «Inviata», uguali in elenco, editor,
// dettaglio e cassetto.

const fattura = (x: Record<string, unknown> = {}) => ({ tipo: "fattura", stato: "emessa", ...x });
const fase = (x: Record<string, unknown> = {}) => faseSdi(fattura(x))?.fase ?? null;

describe("faseSdi", () => {
  it("le tre fasi del giro normale", () => {
    expect(fase()).toBe("da_inviare");
    expect(faseSdi(fattura())?.etichetta).toBe("Da inviare SDI");
    expect(fase({ stato: "inviata_sdi", sdi_stato: "AT", sdi_id_trasmissione: "OA-1" })).toBe("in_elaborazione");
    expect(faseSdi(fattura({ stato: "inviata_sdi", sdi_stato: "AT", sdi_id_trasmissione: "OA-1" }))?.etichetta).toBe("In elaborazione");
    expect(fase({ stato: "consegnata", sdi_stato: "RC", sdi_id_trasmissione: "OA-1" })).toBe("inviata");
    expect(faseSdi(fattura({ stato: "consegnata", sdi_stato: "RC", sdi_id_trasmissione: "OA-1" }))?.etichetta).toBe("Inviata");
  });

  it("mentre parte: invio in corso", () => {
    expect(fase({ stato: "in_invio" })).toBe("invio_in_corso");
  });

  it("incassata ma mai inviata: la fase dice ancora «da inviare» (prima si vedeva solo «Pagata»)", () => {
    expect(fase({ stato: "pagata" })).toBe("da_inviare");
    expect(fase({ stato: "pagata", sdi_stato: "RC", sdi_id_trasmissione: "OA-1" })).toBe("inviata");
  });

  it("la mancata consegna è una fattura inviata e valida", () => {
    expect(fase({ stato: "inviata_sdi", sdi_stato: "MC", sdi_id_trasmissione: "OA-1" })).toBe("inviata");
    expect(faseSdi(fattura({ sdi_stato: "MC", sdi_id_trasmissione: "OA-1" }))?.spiegazione).toMatch(/cassetto fiscale/);
  });

  it("scartata, accettata, rifiutata dall'ente", () => {
    expect(fase({ stato: "rifiutata", sdi_stato: "NS", sdi_id_trasmissione: "OA-1" })).toBe("scartata");
    expect(fase({ stato: "accettata", sdi_stato: "EC01", sdi_id_trasmissione: "OA-1" })).toBe("accettata");
    expect(fase({ stato: "accettata", sdi_stato: "DT", sdi_id_trasmissione: "OA-1" })).toBe("accettata");
    expect(fase({ stato: "rifiutata", sdi_stato: "EC02", sdi_id_trasmissione: "OA-1" })).toBe("rifiutata_ente");
  });

  it("verso la PA la consegna aspetta la risposta dell'ente", () => {
    expect(faseSdi(fattura({ sdi_stato: "RC", sdi_id_trasmissione: "OA-1", cliente_snapshot: { tipo_cliente: "PA" } }))?.spiegazione)
      .toMatch(/15 giorni/);
  });

  it("invio manuale: l'XML va caricato a mano", () => {
    expect(fase({ stato: "inviata_sdi", trasmissione: "manuale", sdi_id_trasmissione: "MAN-1" })).toBe("manuale");
  });

  it("bozze, annullate e documenti che allo SDI non vanno: nessuna fase", () => {
    expect(fase({ stato: "bozza" })).toBeNull();
    expect(fase({ stato: "annullata" })).toBeNull();
    expect(faseSdi({ tipo: "preventivo", stato: "emessa" })).toBeNull();
    expect(faseSdi({ tipo: "proforma", stato: "emessa" })).toBeNull();
  });
});

describe("puoInviare: la stessa regola del server", () => {
  it("da inviare e scartata sì; in elaborazione, inviata e rifiutata dall'ente no", () => {
    expect(puoInviare(fattura())).toBe(true);
    expect(puoInviare(fattura({ stato: "pagata" }))).toBe(true);
    expect(puoInviare(fattura({ stato: "rifiutata", sdi_stato: "NS", sdi_id_trasmissione: "OA-1" }))).toBe(true);
    expect(puoInviare(fattura({ stato: "pagata", sdi_stato: "NS", sdi_id_trasmissione: "OA-1" }))).toBe(true);
    expect(puoInviare(fattura({ stato: "inviata_sdi", sdi_stato: "AT", sdi_id_trasmissione: "OA-1" }))).toBe(false);
    expect(puoInviare(fattura({ stato: "consegnata", sdi_stato: "RC", sdi_id_trasmissione: "OA-1" }))).toBe(false);
    expect(puoInviare(fattura({ stato: "rifiutata", sdi_stato: "EC02", sdi_id_trasmissione: "OA-1" }))).toBe(false);
    expect(puoInviare(fattura({ stato: "in_invio" }))).toBe(false);
    expect(puoInviare(fattura({ stato: "bozza" }))).toBe(false);
    expect(puoInviare({ tipo: "preventivo", stato: "emessa" })).toBe(false);
  });
});

describe("motivoSdi", () => {
  it("legge il motivo come lo scrivono il giro automatico, il webhook e l'invio", () => {
    expect(motivoSdi([{ tipo: "NS", messaggio: "00305 IdFiscaleIVA non valida" }])).toBe("00305 IdFiscaleIVA non valida");
    expect(motivoSdi([{ provider: "openapi", message: "Token scaduto" }])).toBe("Token scaduto");
    expect(motivoSdi(["uno", { message: "due" }])).toBe("uno · due");
    expect(motivoSdi([])).toBeNull();
    expect(motivoSdi(null)).toBeNull();
  });
});
