import { describe, expect, it } from "vitest";
import {
  documentiCantiere,
  filtraGiornali,
  linkGiornale,
  righeCsvDocumenti,
  type GiornaleRiga,
} from "@/lib/orders/documentiCantiere";
import {
  totaliRapportini,
  type RapportinoRiga,
} from "@/lib/orders/rapportiniMese";

const r: RapportinoRiga = {
  id: "stesso-id",
  order_id: "o1",
  data_lavoro: "2026-09-23",
  stato: "approvato",
  presenze: [{ employee_id: "p1", nome: "Anna", ore: 8 }],
  costo_manodopera: 240,
  descrizione_lavori: "Posa",
  order: { client_name: "Cliente", order_code: "C-01" },
};
const g: GiornaleRiga = {
  id: "stesso-id",
  order_id: "o1",
  data_lavori: "2026-09-24",
  stato: "firmata",
  personale_presente: 2,
  lavorazioni_eseguite: "Posa e sopralluogo",
  order: r.order,
  giornale_foto: [{ id: "f1" }],
};

describe("documenti del cantiere nello stesso elenco", () => {
  it("ordina insieme le due fonti, mantenendo le chiavi distinte", () => {
    const elenco = documentiCantiere([r], [g]);
    expect(elenco.map((d) => [d.tipo, d.data, d.chiave])).toEqual([
      ["giornale", "2026-09-24", "giornale:stesso-id"],
      ["rapportino", "2026-09-23", "rapportino:stesso-id"],
    ]);
    expect(elenco[0].riga).toBe(g);
    expect(elenco[1].riga).toBe(r);
  });
  it("il filtro tipo non trasforma il giornale in un rapportino", () => {
    expect(documentiCantiere([r], [g], "giornale").map((d) => d.tipo)).toEqual([
      "giornale",
    ]);
    expect(
      documentiCantiere([r], [g], "rapportino").map((d) => d.tipo),
    ).toEqual(["rapportino"]);
    const rapportini = documentiCantiere([r], [g]).flatMap((d) =>
      d.tipo === "rapportino" ? [d.riga] : [],
    );
    expect(totaliRapportini(rapportini)).toMatchObject({
      rapportini: 1,
      ore: 8,
      costo: 240,
    });
  });
  it("applica cantiere, data, testo e stati propri del giornale", () => {
    const bozze = { ...g, id: "bozza", stato: null, order_id: "o2" };
    expect(
      filtraGiornali([g, bozze], {
        cantiere: "o1",
        giorno: g.data_lavori,
        stato: "firmata",
        testo: "sopRALLUOGO",
      }),
    ).toEqual([g]);
    expect(filtraGiornali([g, bozze], { stato: "bozza" })).toEqual([bozze]);
    expect(filtraGiornali([g], { stato: "approvato" })).toEqual([]);
    expect(filtraGiornali([g], { giorno: "2026-09-25" })).toEqual([]);
    expect(filtraGiornali([g], { testo: "C-01" })).toEqual([g]);
    expect(filtraGiornali([g], { persona: "e:p1" })).toEqual([]);
  });
  it("nell'export il giornale non duplica ore o costi", () => {
    const [giornale, rapportino] = righeCsvDocumenti(
      documentiCantiere([r], [g]),
    );
    expect(giornale).toMatchObject({
      tipo: "Giornale lavori",
      stato: "Firmata",
      ore: "",
      persone: "2",
      foto: "1",
    });
    expect(rapportino).toMatchObject({
      tipo: "Rapportino",
      stato: "Approvato",
      ore: "8",
    });
    expect(giornale).not.toHaveProperty("costo");
    expect(rapportino).not.toHaveProperty("costo");
    expect(Object.values(giornale).every((v) => typeof v === "string")).toBe(
      true,
    );
  });
  it("il collegamento apre proprio la pagina scelta, con parametri codificati", () => {
    expect(linkGiornale({ id: "pagina 2", order_id: "ordine&1" })).toBe(
      "/azienda/giornale-lavori?ordine=ordine%261&pagina=pagina+2",
    );
  });
});
