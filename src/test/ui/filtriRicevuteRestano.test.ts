/**
 * I filtri delle fatture ricevute non si perdono più (26/11/2026).
 *
 * «Cerchiamo le fatture di un fornitore, entriamo in una fattura, usciamo e si perde tutta
 * la ricerca: dobbiamo rifare tutto da capo.» Succedeva perché i filtri di questa pagina
 * stavano in `useState`, e uscire dalla pagina li buttava via.
 *
 * Il comportamento vero è provato in `filtriUrl.test.tsx`, che monta e rismonta un elenco.
 * Qui si controlla che QUESTA pagina ci sia sopra: è un test sul sorgente perché la pagina
 * è di duemila righe e gli altri suoi test fanno lo stesso: disegnarla costerebbe più di
 * quello che proverebbe.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pagina = readFileSync("src/pages/azienda/fatturazione/FattureRicevutePage.tsx", "utf8");

/** I filtri che prima vivevano in memoria e sparivano uscendo dalla pagina. */
const FILTRI = [
  "statoFilter", "tipoFilter", "categoriaFilter", "ordineFilter", "metodoFilter",
  "allegatiFilter", "pagamentoFilter", "contabFilter", "soloDaVerificare",
  "soloDaRettificare", "meseScelto",
];

describe("i filtri delle fatture ricevute", () => {
  it("stanno nell'indirizzo, con la memoria dell'elenco", () => {
    expect(pagina).toContain('useFiltriUrl("ricevute"');
  });

  it("nessuno di loro è rimasto in useState", () => {
    for (const filtro of FILTRI) {
      expect(pagina, `${filtro} è ancora in useState`).not.toMatch(
        new RegExp(`const \\[${filtro}, set`),
      );
    }
  });

  it("la ricerca aspetta che le dita si fermino prima di scrivere l'indirizzo", () => {
    // Su un elenco di più di mille fatture, una scrittura per lettera passerebbe dal router.
    expect(pagina).toContain("useDebounce(searchQuery, 300)");
    expect(pagina).toContain('filtriUrl.imposta("cerca", testo)');
  });

  it("«Azzera» scrive l'indirizzo una volta sola, non dodici", () => {
    const azzera = pagina.slice(pagina.indexOf("const azzeraFiltri"), pagina.indexOf("const ordinaPer"));
    expect(azzera).toContain("filtriUrl.azzera()");
    expect(azzera.match(/filtriUrl\.imposta/g) ?? []).toHaveLength(0);
  });

  it("l'ingresso dal Controllo di gestione continua a funzionare", () => {
    expect(pagina).toContain('parametri.get("filtro") === "da_contabilizzare"');
  });
});
