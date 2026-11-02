import { describe, expect, it } from "vitest";
import { sommeDaGarantire, totaliGenerale, type FigliaGenerale, type RiepilogoGenerale } from "@/lib/orders/commesseGenerali";
import { numeriChiave, pianoPerNumeri } from "@/lib/orders/generali/numeriChiave";
import { orderEconomics } from "@/lib/orders/annualScope";
import { nettoUnitaInLordo } from "@/lib/orders/incassiCommessa";
import type { OrderWithDetails } from "@/lib/orderUtils";

/**
 * Simulazione dell'operazione Villette (02/11/2026): 4 unità vendute per 1.250.000 €, tutte pagate.
 * Prima la testata diceva «Incassato 0», l'elenco «da incassare 125.000» e il margine 318.000
 * contro i 287.000 del piano. Ora un numero solo in ogni punto.
 */
const figlia = (id: string, importo: number): FigliaGenerale => ({
  id, codice: id, nome: id, stato: null, statoNome: null, statoColore: null, indirizzo: null, inizio: null, fine: null,
  avanzamento: 100, importo, eseguito: importo, fatturato: 0, incassato: importo, costo: null, margine: null, residuoUnita: 0,
}) as FigliaGenerale;

const r = (figlie: FigliaGenerale[]): RiepilogoGenerale => ({
  generale: { id: "g", codice: "O-1", nome: "Villette", cliente: null, clienteId: null, modello: "sviluppo", creataIl: null, valore: 1_240_000 },
  figlie, permessi: { importi: true, costi: true, margini: true },
});

describe("un'operazione conclusa si legge uguale ovunque", () => {
  const t = totaliGenerale(r([figlia("V1", 340_000), figlia("V2", 285_000), figlia("V3", 285_000), figlia("V4", 340_000)]));

  it("tutto incassato: niente da incassare", () => {
    expect(t.incassato).toBe(1_250_000);
    expect(t.daIncassare).toBe(0);
  });

  it("venduta e pagata solo in parte: il resto è da incassare, anche senza fatture", () => {
    const parziale = totaliGenerale(r([{ ...figlia("A1", 580_000), incassato: 80_000, residuoUnita: 500_000 }]));
    expect(parziale.daIncassare).toBe(500_000);
  });

  it("un'unità solo prenotata non è ancora da incassare per intero", () => {
    const prenotata = totaliGenerale(r([{ ...figlia("C1a", 145_000), incassato: 8000, residuoUnita: null }]));
    expect(prenotata.incassato).toBe(8000);
    expect(prenotata.daIncassare).toBe(0);
  });

  it("permuta e varianti: conta il residuo dell'unità, non prezzo meno incassato", () => {
    const permuta = totaliGenerale(r([{ ...figlia("P1", 300_000), incassato: 200_000, residuoUnita: 0 }]));
    expect(permuta.daIncassare).toBe(0);
  });

  it("chi ha pagato non compensa chi no", () => {
    const due = totaliGenerale(r([{ ...figlia("A", 100), fatturato: 100, incassato: 0, residuoUnita: null }, { ...figlia("B", 100), fatturato: 0, incassato: 100, residuoUnita: null }]));
    expect(due.daIncassare).toBe(100);
  });

  it("il margine in testa è quello del piano, che comprende interessi e costi comuni", () => {
    const piano = { margineStima: 287_000, capitaleMassimo: 737_000 };
    const n = numeriChiave("sviluppo", { ...t, margine: 600_000 }, piano, { costiComuni: 282_000, aSal: null });
    expect(n.map((x) => x.id)).toEqual(["valore", "margine", "incassare", "capitale"]);
    expect(n.find((x) => x.id === "margine")?.valore).toBe(287_000);
    expect(n.find((x) => x.id === "capitale")?.valore).toBe(737_000);
  });

  it("senza piano il margine è commesse meno costi comuni, e al posto del capitale c'è da assegnare", () => {
    const n = numeriChiave("sviluppo", { ...t, margine: 600_000 }, null, { costiComuni: 282_000, aSal: null });
    expect(n.find((x) => x.id === "margine")?.valore).toBe(318_000);
    expect(n[3].id).toBe("assegnare");
  });

  it("il piano con le sole voci tipiche non inventa un margine pari al valore", () => {
    const solo = (costi: number) => ({ confronto: { totali: { costi: { previsto: costi }, margine: { stima: 3_000_000 - costi } } }, capitale: { massimoStima: 0 } });
    expect(pianoPerNumeri(solo(0))).toBeNull();
    expect(pianoPerNumeri(null)).toBeNull();
    expect(pianoPerNumeri(solo(100))?.margineStima).toBe(2_999_900);
  });

  it("appalto: il quarto numero è quanto del contratto manca al SAL", () => {
    const n = numeriChiave("appalto", { base: 531_000, margine: 309_600, daIncassare: 0, daAssegnare: 15_000 }, { margineStima: 139_000, capitaleMassimo: 206_400 }, { costiComuni: 0, aSal: 292_050 });
    expect(n[3]).toEqual({ id: "residuo", valore: 238_950 });
    expect(n[1].valore).toBe(139_000);
  });
});

describe("la fideiussione copre caparre e acconti, fino al rogito", () => {
  it("il saldo non conta, a rogito fatto non serve più", () => {
    expect(sommeDaGarantire({ acconti: 80_000, incassato: 580_000, statoVendita: "compromesso" })).toBe(80_000);
    expect(sommeDaGarantire({ acconti: 80_000, incassato: 580_000, statoVendita: "rogitata" })).toBe(0);
    expect(sommeDaGarantire({ acconti: 0, incassato: 5000, statoVendita: null })).toBe(5000);
  });
});

describe("le permute pagano ma non sono incassi", () => {
  it("nell'elenco non entrano nell'incassato e tolgono dal da incassare", () => {
    const unita = { id: "u", total_amount: 1000, vat_rate: 10, deposit_amount: 0, balance_amount: 1000, deposit_paid: false, balance_paid: false } as OrderWithDetails;
    const e = orderEconomics([unita], new Map([["u", 600]]), new Map([["u", 400]]));
    expect(e.collected).toBe(660);
    expect(e.pending).toBe(0);
  });
});

describe("gli incassi delle unità sono al netto dell'IVA, come i loro prezzi", () => {
  it("nell'elenco si confrontano col totale ivato: pagata tutta vuol dire niente da incassare", () => {
    expect(nettoUnitaInLordo(1000, 10)).toBe(1100);
    const unita = { id: "u", total_amount: 1000, vat_rate: 10, deposit_amount: 0, balance_amount: 1000, deposit_paid: false, balance_paid: false } as OrderWithDetails;
    const e = orderEconomics([unita], new Map([["u", 1000]]));
    expect(e.collected).toBe(1100);
    expect(e.pending).toBe(0);
  });
});
