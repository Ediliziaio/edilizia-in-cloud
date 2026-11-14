import { describe, expect, it } from "vitest";
import { datiMancanti, giorniA, leggiDatiSezioni, SEZIONI_PER_MODELLO } from "@/lib/orders/generali/datiOperazione";
import { avvisiGenerale, totaliGenerale, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { datiDaIpotesi } from "@/lib/orders/generali/simulatoreOperazione";

/** Dati della commessa generale per tipologia (14/11/2026). */
const base: { clienteId: string | null; indirizzo: string | null; inizio: string | null; fine: string | null; dati: Record<string, never> } = { clienteId: null, indirizzo: null, inizio: null, fine: null, dati: {} };

describe("dati per tipologia", () => {
  it("ogni tipologia ha le sue sezioni", () => {
    expect(SEZIONI_PER_MODELLO.appalto.map((s) => s.id)).toEqual(["appalto"]);
    expect(SEZIONI_PER_MODELLO.sviluppo.map((s) => s.id)).toEqual(["area", "titolo", "tecnici"]);
    expect(SEZIONI_PER_MODELLO.compravendita.map((s) => s.id)).toEqual(["immobile", "ristrutturazione", "rivendita"]);
  });

  it("cosa manca, per tipologia", () => {
    expect(datiMancanti({ ...base, modello: "appalto" }).map((m) => m.id)).toEqual(["cliente", "tipo", "indirizzo", "inizio"]);
    expect(datiMancanti({ ...base, modello: "sviluppo" }).map((m) => m.id)).toEqual(["indirizzo", "inizio", "titolo"]);
    expect(datiMancanti({ ...base, modello: "compravendita" }).map((m) => m.id)).toEqual(["indirizzo", "inizio", "immobile"]);
    // Compravendita: l'indirizzo dell'immobile acquistato basta come indirizzo.
    expect(datiMancanti({ ...base, modello: "compravendita", inizio: "2027-01-01", dati: { immobile: { indirizzo: "Via Po 1", prezzo: 200000, data_rogito: "2027-01-10" } } })).toEqual([]);
    expect(datiMancanti({ ...base, modello: "appalto", clienteId: "c", indirizzo: "x", inizio: "2027-01-01", dati: { appalto: { tipo: "Pubblico" } } })).toEqual([]);
  });

  it("la lettura dal database scarta quello che non è un valore semplice", () => {
    expect(leggiDatiSezioni({ note: "ok", titolo: { tipo: "SCIA", x: { a: 1 }, n: 3 }, rotto: "testo", lista: [1] })).toEqual({ note: "ok", titolo: { tipo: "SCIA", n: 3 } });
    expect(leggiDatiSezioni(null)).toEqual({});
  });

  it("giorni a una data", () => {
    const oggi = new Date(2026, 10, 14);
    expect(giorniA("2026-11-24", oggi)).toBe(10);
    expect(giorniA("2026-11-04", oggi)).toBe(-10);
    expect(giorniA(null, oggi)).toBeNull();
  });

  it("sviluppo: il titolo edilizio che scade fra meno di 90 giorni (o è scaduto) è un avviso", () => {
    const fra = (giorni: number) => new Date(Date.now() + giorni * 86_400_000).toISOString().slice(0, 10);
    const r = (scadenza: string) => ({
      generale: { id: "g", codice: null, nome: "Op", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: 1, dati: { titolo: { tipo: "Permesso di costruire", numero: "12/2026", scadenza } } },
      figlie: [{ id: "f" } as never], permessi: { importi: true, costi: true, margini: true },
    }) as unknown as RiepilogoGenerale;
    const titolo = (x: RiepilogoGenerale) => avvisiGenerale(x, totaliGenerale({ ...x, figlie: [] })).find((a) => a.id === "titolo");
    expect(titolo(r(fra(30)))?.testo).toMatch(/Permesso di costruire n\. 12\/2026: i lavori vanno finiti entro il .*, fra 30 giorni\./);
    expect(titolo(r(fra(-5)))?.testo).toMatch(/Serve una proroga/);
    expect(titolo(r(fra(200)))).toBeUndefined();
  });
});

describe("dal Simulatore alla scheda Dati", () => {
  it("inizio dopo i permessi, fine dopo i lavori; compravendita con prezzo e rogito", () => {
    expect(datiDaIpotesi({ modello: "sviluppo", inizio: "2027-01", acquisto: 400000, mesiPermessi: 6, mesiLavori: 18 })).toEqual({ inizio: "2027-07-01", fine: "2028-12-31" });
    expect(datiDaIpotesi({ modello: "compravendita", inizio: "2027-03", acquisto: 185000, mesiPermessi: 1, mesiLavori: 4 })).toEqual({
      inizio: "2027-04-01", fine: "2027-07-31", immobile: { prezzo: 185000, data_rogito: "2027-03-01" },
    });
  });
});
