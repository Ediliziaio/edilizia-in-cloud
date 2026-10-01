import { describe, expect, it } from "vitest";
import {
  contaInRitardo, prossimoPasso, statoIncasso, statoMateriali, statoPosa, statoSquadra,
} from "@/lib/orders/etichettePipeline";

describe("etichette della pipeline commesse", () => {
  it("dice della posa in chiaro", () => {
    expect(statoPosa(-199, "15/03/2026")).toMatchObject({ testo: "199 giorni di ritardo", tono: "critico" });
    expect(statoPosa(-1, "15/03/2026").testo).toBe("1 giorno di ritardo");
    expect(statoPosa(0, null)).toMatchObject({ testo: "Oggi", tono: "attenzione" });
    expect(statoPosa(5, "10 ott").testo).toBe("Tra 5 giorni");
    expect(statoPosa(30, "10 nov")).toMatchObject({ testo: "10 nov", tono: "neutro" });
    expect(statoPosa(null, null)).toMatchObject({ testo: "Da fissare", tono: "attenzione" });
    expect(statoPosa(-199, "15/03/2026").dettaglio).toContain("prevista il 15/03/2026");
  });

  it("dice dei materiali", () => {
    expect(statoMateriali(5, 5, 0)).toMatchObject({ testo: "5/5 pronti", tono: "ok" });
    expect(statoMateriali(5, 0, 5)).toMatchObject({ testo: "0/5 pronti", tono: "critico" });
    expect(statoMateriali(5, 3, 0)).toMatchObject({ tono: "attenzione" });
    expect(statoMateriali(5, 3, 1).dettaglio).toContain("1 è ancora da ordinare");
    expect(statoMateriali(0, 0, 0)).toMatchObject({ testo: "Nessun articolo", tono: "neutro" });
  });

  it("dice dell'incasso", () => {
    expect(statoIncasso(10000, 10000, 0)).toMatchObject({ testo: "Pagata", tono: "ok" });
    expect(statoIncasso(10000, 0, 10000)).toMatchObject({ testo: "Nessun incasso", tono: "attenzione" });
    expect(statoIncasso(10000, 3000, 7000).testo).toBe("Incassato 30%");
  });

  it("dice della squadra", () => {
    expect(statoSquadra([], false, false)).toMatchObject({ testo: "Da assegnare", tono: "attenzione" });
    expect(statoSquadra(["Mario Verdi", "Luca", "Anna"], true, false).testo).toBe("Mario Verdi +2");
    expect(statoSquadra(["Ditta X"], false, true).dettaglio).toContain("in subappalto");
  });

  it("sceglie il prossimo passo nello stesso ordine di prima", () => {
    const base = { giorniAllaPosa: 10, daIncassare: 0, incassato: 100, articoli: 0, pronti: 0, daOrdinare: 0 };
    expect(prossimoPasso({ ...base, daIncassare: 100, incassato: 0 }).testo).toBe("Incassare l'acconto");
    expect(prossimoPasso({ ...base, giorniAllaPosa: -3 }).testo).toBe("Sbloccare la posa");
    expect(prossimoPasso({ ...base, articoli: 4, pronti: 1, daOrdinare: 2 }).testo).toBe("Ordinare i materiali");
    expect(prossimoPasso({ ...base, articoli: 4, pronti: 1 }).testo).toBe("Verificare gli arrivi");
    expect(prossimoPasso({ ...base, articoli: 4, pronti: 4 })).toMatchObject({ testo: "Preparare la posa", tipo: "pronto" });
    expect(prossimoPasso(base).testo).toBe("Aprire la scheda");
  });

  it("conta le commesse in ritardo", () => {
    expect(contaInRitardo([-3, 0, 5, null, -1])).toBe(2);
  });
});
