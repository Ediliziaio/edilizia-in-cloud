import { describe, it, expect } from "vitest";
import {
  attrezzatureNelContesto,
  statoDocumentoAttrezzatura,
} from "@/lib/sicurezza/attrezzatureCommessa";
import { normalizzaMezzoFonte } from "../../../supabase/functions/_shared/posMezzi";
import { normalizzaDocumentoMezzo } from "../../../supabase/functions/_shared/posDocumentiMezzi";
const fonte = (v: Record<string, unknown> = {}) =>
  normalizzaMezzoFonte({
    mezzo_id: "m1",
    fonte_id: "a1",
    order_id: "c1",
    nome: "Trapano",
    fonte_tipo: "assegnazione",
    dal: "2026-11-09",
    al: "2026-11-13",
    quantita: "1",
    ...v,
  });
describe("Attrezzature della commessa nel contesto", () => {
  it("include entrambi gli estremi del periodo e scarta altre commesse", () => {
    const f = [
      fonte(),
      fonte({ mezzo_id: "altro", order_id: "c2" }),
      fonte({ mezzo_id: "futuro", dal: "2026-11-14" }),
      fonte({ mezzo_id: "finito", al: "2026-11-08" }),
    ];
    expect(
      attrezzatureNelContesto(f, "c1", "2026-11-09").map((m) => m.id),
    ).toEqual(["m1"]);
    expect(attrezzatureNelContesto([fonte()], "c1", "2026-11-13")).toHaveLength(
      1,
    );
  });
  it("raggruppa per identità senza sommare due volte quantità né confondere omonimi", () => {
    const a = fonte({ fonte_tipo: "allocazione", quantita: "10" });
    const r = attrezzatureNelContesto(
      [
        a,
        a,
        fonte({ fonte_id: "a2", fonte_tipo: "allocazione", quantita: "4" }),
        fonte({ mezzo_id: "m2" }),
      ],
      "c1",
      "2026-11-10",
    );
    expect(r).toHaveLength(2);
    expect(r[0].collegamenti).toHaveLength(2);
    expect(r[0].fonte.quantita).toBe("10");
  });
  it.each(["corrente", "su_mezzo_corrente"])(
    "una collocazione %s non dimostra il periodo di assegnazione",
    (tipo) => {
      expect(
        attrezzatureNelContesto(
          [fonte({ fonte_tipo: tipo, dal: null, al: null })],
          "c1",
          "2026-11-10",
        )[0].periodoDocumentato,
      ).toBe(false);
    },
  );
  it("un’assegnazione senza inizio resta da verificare", () => {
    expect(
      attrezzatureNelContesto([fonte({ dal: null })], "c1", "2026-11-10")[0]
        .periodoDocumentato,
    ).toBe(false);
  });
  it.each([
    [{ disponibile: false }, "Originale non disponibile"],
    [
      { disponibile: true, data_inizio: "2026-11-11" },
      "Decorrenza successiva alla data scelta",
    ],
    [
      { disponibile: true, data_scadenza: "2026-11-09" },
      "Scaduto alla data scelta",
    ],
    [
      { disponibile: true, data_scadenza: "2026-11-10" },
      "Da riesaminare per l’utilizzo",
    ],
    [{ disponibile: true, confermata: true }, "Da riesaminare per l’utilizzo"],
  ])(
    "lo stato documentale resta distinto dall’utilizzabilità: %o",
    (d, label) => {
      expect(
        statoDocumentoAttrezzatura(normalizzaDocumentoMezzo(d), "2026-11-10"),
      ).toBe(label);
    },
  );
});
