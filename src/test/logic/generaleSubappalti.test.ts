import { describe, expect, it } from "vitest";
import {
  confrontoSal, documentiDaGuardare, durcSubappaltatore, leggiSubappalti, ordiniDelSubappalto, quotaSubappaltata,
  salPassivi, type Subappalto,
} from "@/lib/orders/generali/subappalti";

const risposta = {
  permessi: { vede: true, modifica: true },
  soglia_pct: "40.00",
  ordini: [
    { id: "o1", codice: "ODL-1", nome: "Scuola" },
    { id: "o2", codice: null, nome: "Palestra" },
    { id: "o3", codice: "ODL-3", nome: "Mensa" },
  ],
  contratti: [
    {
      id: "c1", numero: "SUB-1", descrizione: "Carpenteria", importo: "100000.00", oneri_sicurezza: 2000, stato: "attivo",
      order_id: "o1", ordini_collegati: ["o3"],
      subappaltatore: { id: "s1", ragione_sociale: "Carpenteria Veneta", piva: "01234567890", durc_scadenza: null as string | null },
      sal: [
        { id: "a", numero: 1, data: "2026-09-30", lordo: 30000, ritenuta: 1500, netto: 28500, stato: "pagato", pagato: null },
        { id: "b", numero: 2, data: "2026-10-30", lordo: 20000, ritenuta: 1000, netto: 19000, stato: "verificato", pagato: 5000 },
        { id: "x", numero: 3, data: "2026-10-31", lordo: 9000, ritenuta: 450, netto: 8550, stato: "contestato", pagato: null },
      ],
      documenti: [
        { tipo: "durc", scadenza: "2026-11-15", rilascio: "2026-07-18" },
        { tipo: "polizza_rc", scadenza: "2026-10-01", rilascio: null },
        { tipo: "visura", scadenza: null, rilascio: "2026-01-10" },
      ],
    },
    {
      id: "c2", numero: null, descrizione: "Impianti", importo: 50000, oneri_sicurezza: null, stato: "risolto",
      order_id: "o2", ordini_collegati: [],
      subappaltatore: { id: "s2", ragione_sociale: "Impianti Srl", piva: null, durc_scadenza: "2026-08-01" },
      sal: [], documenti: [],
    },
    { id: "rotto" },
  ],
};

describe("leggiSubappalti", () => {
  it("legge numeri scritti come testo e scarta le righe senza id o ordine", () => {
    const d = leggiSubappalti(risposta);
    expect(d.sogliaPct).toBe(40);
    expect(d.subappalti).toHaveLength(2);
    expect(d.subappalti[0].importo).toBe(100000);
    expect(d.subappalti[1].oneriSicurezza).toBe(0);
    expect(d.ordini[1].codice).toBeNull();
  });

  it("senza permessi: niente righe", () => {
    const d = leggiSubappalti({ permessi: { vede: false }, soglia_pct: null, contratti: [] });
    expect(d.permessi).toEqual({ vede: false, modifica: false });
    expect(d.subappalti).toEqual([]);
    expect(leggiSubappalti(null).subappalti).toEqual([]);
  });
});

describe("quota subappaltata", () => {
  const { subappalti } = leggiSubappalti(risposta);

  it("conta lavori e sicurezza dei subappalti non risolti, sul valore aggiornato", () => {
    const q = quotaSubappaltata(subappalti, 300000, 40);
    expect(q.importo).toBe(102000);
    expect(q.pct).toBe(34);
    expect(q.margineSoglia).toBe(18000);
    expect(q.stato).toBe("sotto");
  });

  it("avvisa vicino alla soglia e oltre", () => {
    expect(quotaSubappaltata(subappalti, 270000, 40).stato).toBe("vicina");
    const oltre = quotaSubappaltata(subappalti, 200000, 40);
    expect(oltre.stato).toBe("oltre");
    expect(oltre.margineSoglia).toBe(-22000);
  });

  it("senza soglia o senza valore del contratto non avvisa", () => {
    expect(quotaSubappaltata(subappalti, 300000, null).stato).toBe("senza_soglia");
    const senzaValore = quotaSubappaltata(subappalti, null, 40);
    expect(senzaValore.pct).toBeNull();
    expect(senzaValore.stato).toBe("senza_soglia");
  });
});

describe("SAL passivi contro SAL attivi", () => {
  const { subappalti } = leggiSubappalti(risposta);

  it("somma i SAL non contestati; il pagato segue la contabilità del subappaltatore", () => {
    const p = salPassivi(subappalti);
    expect(p.lordo).toBe(50000);
    expect(p.netto).toBe(47500);
    // SAL 1 «pagato» senza registro = netto; SAL 2 = registrato.
    expect(p.pagato).toBe(33500);
    expect(p.daPagare).toBe(14000);
    expect(p.contestati).toBe(1);
  });

  it("confronta quanto ho a SAL e incassato con quanto devo e ho pagato", () => {
    const c = confrontoSal({ aSal: 120000, netto: 114000, incassato: 90000 }, subappalti);
    expect(c.differenzaSal).toBe(70000);
    expect(c.differenzaCassa).toBe(56500);
    expect(c.quotaPassiviPct).toBe(41.7);
    expect(confrontoSal({ aSal: 0, netto: 0, incassato: 0 }, subappalti).quotaPassiviPct).toBeNull();
  });
});

describe("DURC e documenti", () => {
  const [c1, c2] = leggiSubappalti(risposta).subappalti;

  it("prende la scadenza dell'anagrafica, altrimenti quella del DURC caricato", () => {
    expect(durcSubappaltatore(c1, "2026-10-30")).toEqual({ stato: "in_scadenza", scadenza: "2026-11-15" });
    expect(durcSubappaltatore(c1, "2026-09-01").stato).toBe("valido");
    expect(durcSubappaltatore(c2, "2026-10-30")).toEqual({ stato: "scaduto", scadenza: "2026-08-01" });
    const senza: Subappalto = { ...c2, subappaltatore: { ...c2.subappaltatore, durcScadenza: null } };
    expect(durcSubappaltatore(senza, "2026-10-30").stato).toBe("mancante");
  });

  it("segnala solo gli altri documenti scaduti o in scadenza", () => {
    expect(documentiDaGuardare(c1, "2026-10-30").map((d) => [d.tipo, d.stato])).toEqual([["polizza_rc", "scaduto"]]);
  });
});

describe("ordini del subappalto", () => {
  it("quello su cui è nato e i legati, nell'ordine dell'elenco", () => {
    const d = leggiSubappalti(risposta);
    expect(ordiniDelSubappalto(d.subappalti[0], d.ordini).map((o) => o.id)).toEqual(["o1", "o3"]);
  });
});
