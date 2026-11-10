import { expect, it } from "vitest";
import { categorieDelCosto, partiPerCategoria } from "@/lib/costi/partiPerCategoria";

const costo = {
  category: "materiali", amount: 41435.5,
  ripartizione_categorie: [{ categoria: "materiali", importo: 38465.5 }, { categoria: "noli_attrezzature", importo: 2870 }, { categoria: "materiali_di_consumo", importo: 100 }],
};

it("un costo senza divisione è tutto sulla sua categoria", () => {
  expect(partiPerCategoria({ category: "trasporti", amount: 120, ripartizione_categorie: [] })).toEqual([{ categoria: "trasporti", importo: 120 }]);
});
it("le parti della fattura divisa, e riportate a una quota", () => {
  expect(partiPerCategoria(costo).map((p) => p.importo)).toEqual([38465.5, 2870, 100]);
  expect(partiPerCategoria(costo, 4143.55).map((p) => p.importo)).toEqual([3846.55, 287, 10]);
});
it("il filtro per categoria trova la fattura anche per una sua parte", () => {
  expect(categorieDelCosto(costo)).toEqual(["materiali", "noli_attrezzature", "materiali_di_consumo"]);
});
