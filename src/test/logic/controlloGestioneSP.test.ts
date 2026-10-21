import { describe, expect, it } from "vitest";
import { indiziQuadratura, vociSenzaFonte } from "@/lib/controlloGestione/statoPatrimoniale";
import type { SPResult } from "@/hooks/controlloGestione/useStatoPatrimoniale";

// cg_get_sp_safe Demo 2, 2026, al 22/10/2026 (prima della migrazione 20281022081000).
const SP: SPResult = {
  meta: { company_id: "d2", anno: 2026, data_riferimento: "2026-10-21", generato_il: "" },
  attivo: {
    imm_immateriali: 4000, imm_materiali: 650150, imm_finanziarie: 0, attivo_fisso: 654150,
    rimanenze: 173192, crediti_clienti: 1037822.19, crediti_tributari: 0, anticipi_fornitori: 0,
    liquidita_differite: 1037822.19, cassa: 0, banche_positive: 746294.63, liquidita_immediate: 746294.63,
    attivo_circolante: 1957308.82, totale: 2611458.82,
  },
  passivo: {
    capitale_sociale: 100000, riserve: 105000, utile_esercizio: 287444.44, rettifica_patrimoniale: 0,
    mezzi_propri: 492444.44, fondo_tfr: 28000, fondi_rischi: 5000, mutui_mlt: 243500, pas_consolidato: 276500,
    banche_negative: 496182.83, debiti_fornitori: 0, debiti_tributari: 0, debiti_personale: 0,
    debiti_previdenziali: 0, pas_corrente: 496182.83, totale: 1265127.27,
  },
  quadratura: { differenza: 1346331.55, quadrato: false },
};

describe("Stato patrimoniale: dove sta la differenza", () => {
  it("con attivo > passivo indica fonti mancanti: patrimonio netto e debiti fornitori", () => {
    const indizi = indiziQuadratura(SP.attivo, SP.passivo, SP.quadratura.differenza, vociSenzaFonte(SP));
    const testi = indizi.map((i) => i.testo).join(" | ");
    expect(testi).toContain("Debiti verso fornitori a zero");
    expect(testi).toContain("utili degli anni passati");
    expect(testi).toContain("Debiti tributari a zero");
    expect(indizi.find((i) => i.testo.startsWith("Debiti verso fornitori"))?.href).toBe("/azienda/scadenzario");
  });

  it("senza capitale e riserve lo dice esplicitamente", () => {
    const passivo = { ...SP.passivo, capitale_sociale: 0, riserve: 0 };
    const indizi = indiziQuadratura(SP.attivo, passivo, 100, vociSenzaFonte(SP));
    expect(indizi[0].testo).toContain("Capitale e riserve non inseriti");
  });

  it("con passivo > attivo cerca impieghi mancanti", () => {
    const attivo = { ...SP.attivo, attivo_fisso: 0, rimanenze: 0 };
    const testi = indiziQuadratura(attivo, SP.passivo, -500, new Set()).map((i) => i.testo).join(" | ");
    expect(testi).toContain("Nessun cespite");
    expect(testi).toContain("Magazzino a zero");
  });

  it("quadrato: nessun indizio", () => {
    expect(indiziQuadratura(SP.attivo, SP.passivo, 0.5, new Set())).toEqual([]);
  });

  it("le voci senza fonte vengono dal database quando le dichiara", () => {
    expect(vociSenzaFonte(SP).has("debiti_personale")).toBe(true);
    const nuovo = { ...SP, meta: { ...SP.meta, voci_manuali: ["cassa"] } } as SPResult;
    expect([...vociSenzaFonte(nuovo)]).toEqual(["cassa"]);
  });
});
