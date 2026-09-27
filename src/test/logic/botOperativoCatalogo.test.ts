import { describe, expect, it } from "vitest";
import { unisciCatalogo, usaStrumentiSilvio } from "../../../supabase/functions/_shared/botOperativoCatalogo";
import {
  istruzioniAzienda,
  leggiConfigOperativo,
  MAX_ISTRUZIONI,
  senzaVietati,
} from "../../../supabase/functions/_shared/agenteOperativoConfig";

describe("catalogo del bot operativo", () => {
  it("solo ufficio e admin hanno gli strumenti di Silvio", () => {
    expect(usaStrumentiSilvio("admin")).toBe(true);
    expect(usaStrumentiSilvio("ufficio")).toBe(true);
    expect(usaStrumentiSilvio("operaio")).toBe(false);
  });
  it("i doppioni di Silvio lasciano il posto a quelli del bot, che usano la foto o il vocale appena arrivati", () => {
    const { bot, silvio } = unisciCatalogo(
      ["carica_ddt", "crea_rapportino", "chiedi_conferma"],
      ["carica_ddt", "registra_rapportino", "analyze_image", "get_quadro_incassi"],
    );
    expect(bot).toEqual(["carica_ddt", "crea_rapportino", "chiedi_conferma"]);
    expect(silvio).toEqual(["get_quadro_incassi"]);
  });
  it("le letture vecchie del bot lasciano il posto a quelle di Silvio", () => {
    const { bot, silvio } = unisciCatalogo(
      ["stato_cantiere", "scadenze_fatture", "crea_segnalazione"],
      ["report_commessa", "lista_scadenze"],
    );
    expect(bot).toEqual(["crea_segnalazione"]);
    expect(silvio).toEqual(["report_commessa", "lista_scadenze"]);
  });
});

const scheda = (extra: Record<string, unknown> = {}) => ({
  nome: "Silvio operativo",
  stato: "attivo",
  system_prompt: "Dai sempre del tu. Per i cantieri di Como avvisa Marco.",
  temperatura: 0.3,
  tools_config: {
    operativo: {
      per_ruolo: { operaio: "Niente cifre agli operai.", admin: "Col titolare parti dai numeri." },
      aree_iniziali: ["cantieri", "magazzino", "area_inventata"],
      strumenti_vietati: ["registra_pagamento_commessa"],
    },
  },
  ...extra,
});

describe("configurazione dell'agente operativo dalla scheda", () => {
  it("una scheda spenta o non operativa non vale", () => {
    expect(leggiConfigOperativo(null)).toBeNull();
    expect(leggiConfigOperativo(scheda({ stato: "bozza" }))).toBeNull();
    expect(leggiConfigOperativo(scheda({ tools_config: { lead_whatsapp: {} } }))).toBeNull();
  });
  it("legge istruzioni, ruoli, aree valide e strumenti vietati", () => {
    const c = leggiConfigOperativo(scheda())!;
    expect(c.istruzioni).toContain("Dai sempre del tu");
    expect(c.perRuolo.admin).toBe("Col titolare parti dai numeri.");
    expect(c.perRuolo.ufficio).toBeNull();
    expect(c.areeIniziali).toEqual(["cantieri", "magazzino"]);
    expect(c.strumentiVietati).toEqual(["registra_pagamento_commessa"]);
    expect(c.temperatura).toBe(0.3);
  });
  it("le istruzioni per ruolo arrivano solo a quel ruolo", () => {
    const c = leggiConfigOperativo(scheda());
    const admin = istruzioniAzienda(c, "admin");
    expect(admin).toContain("ISTRUZIONI DELL'AZIENDA (Silvio operativo)");
    expect(admin).toContain("Col titolare parti dai numeri.");
    expect(admin).not.toContain("Niente cifre agli operai.");
    expect(istruzioniAzienda(c, "operaio")).toContain("Niente cifre agli operai.");
    expect(istruzioniAzienda(null, "admin")).toBe("");
  });
  it("istruzioni troppo lunghe vengono tagliate", () => {
    const c = leggiConfigOperativo(scheda({ system_prompt: "x".repeat(MAX_ISTRUZIONI + 500) }));
    expect(istruzioniAzienda(c, "ufficio").length).toBeLessThan(MAX_ISTRUZIONI + 400);
  });
  it("gli strumenti vietati spariscono", () => {
    const c = leggiConfigOperativo(scheda());
    expect(senzaVietati(["registra_pagamento_commessa", "report_commessa"], (n) => n, c)).toEqual(["report_commessa"]);
    expect(senzaVietati(["a"], (n) => n, null)).toEqual(["a"]);
  });
});
