import { describe, expect, it } from "vitest";
import {
  contaInRitardo, prossimoPasso, ritardoLavori, statoIncasso, statoMateriali, statoSquadra,
} from "@/lib/orders/etichettePipeline";

describe("etichette della pipeline commesse", () => {
  it("usa la fine lavori se presente e non segnala come in ritardo le fasi completate", () => {
    const oggi = new Date(2026, 10, 19);
    const ordine = { expected_date: "2026-11-12", work_end_date: "2026-11-18" };
    expect(ritardoLavori(ordine, oggi)).toBe(1);
    expect(ritardoLavori({ ...ordine, work_end_date: null }, oggi)).toBe(7);
    expect(ritardoLavori({ expected_date: null }, oggi)).toBe(0);
    expect(ritardoLavori({ ...ordine, fasiPipeline: { total: 2, done: 2 } }, oggi)).toBe(0);
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
    const base = { ritardo: 0, daIncassare: 0, incassato: 100, articoli: 0, pronti: 0, daOrdinare: 0 };
    expect(prossimoPasso({ ...base, daIncassare: 100, incassato: 0 }).testo).toBe("Verificare gli incassi");
    expect(prossimoPasso({ ...base, ritardo: 3 }).testo).toBe("Verificare il ritardo");
    expect(prossimoPasso({ ...base, articoli: 4, pronti: 1, daOrdinare: 2 }).testo).toBe("Ordinare i materiali");
    expect(prossimoPasso({ ...base, articoli: 4, pronti: 1 }).testo).toBe("Verificare gli arrivi");
    expect(prossimoPasso({ ...base, articoli: 4, pronti: 4 })).toMatchObject({ testo: "Controllare il cronoprogramma", tipo: "pronto" });
    expect(prossimoPasso(base).testo).toBe("Aprire la scheda");
    expect(prossimoPasso({ ...base, lavoriCompletati: true, daIncassare: 200, articoli: 4, daOrdinare: 2 }).testo).toBe("Verificare il saldo");
  });

  it("conta le commesse in ritardo", () => {
    expect(contaInRitardo([-3, 0, 5, null, -1])).toBe(2);
  });
});
