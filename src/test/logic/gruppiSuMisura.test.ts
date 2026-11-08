import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";
import {
  costoDiListino, erroreDiPosizione, misureDaBozza, posizioneIntatta, posizioniDaSalvare, prodottoSuMisura, raggruppaRighe, specifichePosizione,
  type PosizioneBozza,
} from "@/lib/orders/gruppiSuMisura";
import { cercaArticoli, giacenzaDi, righeUsateDistinte } from "@/lib/orders/ricercaArticoli";
import { trovaDoppione } from "@/lib/distinta/elencoArticoli";
import type { FamilyWithAxes } from "@/types/articleFamily";

const pos = (c: Partial<PosizioneBozza> = {}): PosizioneBozza => ({ chiave: "a", riferimento: "Cucina", larghezza: "1200", altezza: "1400", pezzi: "2", costo: "", ...c });

const famiglia = {
  id: "f1", nome: "Finestra", modalita_prezzo_base: "griglia", prezzo_base_mode: "vendita", prezzo_base_vendita: 0, prezzo_base_acquisto: 0,
  axes: [], custom_field_values: {}, sconto_fornitore_1: 0, sconto_fornitore_2: 0,
} as unknown as FamilyWithAxes;
const griglia = [
  { valore_x: 1200, valore_y: 1400, prezzo_vendita: 500, prezzo_acquisto_netto: 300 },
  { valore_x: 1500, valore_y: 1800, prezzo_vendita: 800, prezzo_acquisto_netto: 450 },
];

describe("cosa è su misura", () => {
  it("serramenti a griglia e a mq sì, piastrelle al mq e prese a griglia no", () => {
    expect(prodottoSuMisura({ vertical: "serramenti", modalita_prezzo_base: "mq" })).toBe(true);
    expect(prodottoSuMisura({ vertical: "serramentista", modalita_prezzo_base: "griglia" })).toBe(true);
    expect(prodottoSuMisura({ vertical: "pavimenti", modalita_prezzo_base: "mq" })).toBe(false);
    expect(prodottoSuMisura({ vertical: "elettrico", modalita_prezzo_base: "griglia" })).toBe(false);
    expect(prodottoSuMisura({ vertical: "serramenti", modalita_prezzo_base: "pz" })).toBe(false);
  });
});

describe("il costo delle posizioni", () => {
  it("è lo stesso numero del preventivo", () => {
    const preventivo = calcolaPrezzoFamiglia({ family: famiglia, selections: {}, larghezza_mm: 1250, altezza_mm: 1420, quantita: 1 }, griglia);
    expect(costoDiListino(famiglia, {}, griglia, 1250, 1420).costo).toBe(preventivo.unit_price_acquisto);
    expect(preventivo.unit_price_acquisto).toBe(450);
  });
  it("senza misure o fuori griglia è da definire, mai zero spacciato per prezzo", () => {
    expect(costoDiListino(famiglia, {}, griglia, null, null).costo).toBeNull();
    const fuori = costoDiListino(famiglia, {}, griglia, 3000, 3000);
    expect(fuori.costo).toBeNull();
    expect(fuori.fuoriListino).toBe(true);
    expect(costoDiListino(famiglia, {}, [], 1200, 1400).costo).toBeNull();
  });
});

describe("una posizione", () => {
  it("riga mai toccata non diventa una riga", () => {
    expect(posizioneIntatta(pos({ riferimento: "P2", larghezza: "", altezza: "" }))).toBe(true);
    expect(posizioneIntatta(pos({ riferimento: "Cucina", larghezza: "", altezza: "" }))).toBe(false);
  });
  it("da rilevare: P1 e P2 senza misure sono due posizioni, ma la riga in più dopo Invio no", () => {
    const p1 = pos({ riferimento: "P1", larghezza: "", altezza: "", pezzi: "1" });
    const p2 = pos({ chiave: "b", riferimento: "P2", larghezza: "", altezza: "", pezzi: "1" });
    expect(posizioniDaSalvare([p1, p2], "da_rilevare")).toHaveLength(2);
    expect(posizioniDaSalvare([p1, p2], "confermato")).toHaveLength(0);
    const misurata = pos({ riferimento: "P1", pezzi: "1" });
    expect(posizioniDaSalvare([misurata, p2], "da_rilevare")).toEqual([misurata]);
  });
  it("si può inserire senza misure, ma non con una sola", () => {
    expect(erroreDiPosizione(pos({ larghezza: "", altezza: "" }))).toBeNull();
    expect(erroreDiPosizione(pos({ altezza: "" }))).toMatch(/sia L sia H/);
  });
  it("rifiuta misure in metri, pezzi con la virgola e costi illeggibili", () => {
    expect(erroreDiPosizione(pos({ larghezza: "1,2" }))).toMatch(/millimetri/);
    expect(erroreDiPosizione(pos({ pezzi: "1,5" }))).toMatch(/intero/);
    expect(erroreDiPosizione(pos({ pezzi: "0" }))).toMatch(/intero/);
    expect(erroreDiPosizione(pos({ costo: "abc" }))).toMatch(/costo/);
    expect(erroreDiPosizione(pos({ costo: "12,50" }))).toBeNull();
  });
  it("le misure hanno le chiavi del preventivo, le specifiche arrivano a chi ordina", () => {
    expect(misureDaBozza(1200, 1400)).toEqual({ larghezza_mm: 1200, altezza_mm: 1400, mq: 1.68 });
    expect(misureDaBozza(null, null)).toBeNull();
    expect(specifichePosizione(["Colore bianco", "Ante 2"])).toBe("Colore bianco · Ante 2");
  });
});

describe("nell'elenco una voce sola", () => {
  const righe = [
    { name: "Silicone", quantity: 3, purchase_price: 4 },
    { name: "Finestra", quantity: 2, purchase_price: 300, gruppo_id: "g1" },
    { name: "Viti", quantity: 1, purchase_price: 2 },
    { name: "Finestra", quantity: 1, purchase_price: 0, gruppo_id: "g1" },
  ];
  it("somma pezzi e costo, conta chi non ha costo, tiene gli indici veri", () => {
    const voci = raggruppaRighe(righe);
    expect(voci.map((v) => v.tipo)).toEqual(["riga", "gruppo", "riga"]);
    const g = voci[1];
    if (g.tipo !== "gruppo") throw new Error();
    expect(g).toMatchObject({ pezzi: 3, costo: 600, senzaCosto: 1, nome: "Finestra" });
    expect(g.righe.map((r) => r.indice)).toEqual([1, 3]);
  });
  it("gli articoli normali restano tali e quali", () => {
    const normali = righe.filter((r) => !r.gruppo_id);
    expect(raggruppaRighe(normali)).toEqual(normali.map((riga, i) => ({ tipo: "riga", riga, indice: i })));
  });
});

describe("la ricerca", () => {
  const magazzino = [{ id: "s1", name: "Silicone bianco", quantity: 4 }];
  const listino = [{ id: "l1", name: "Finestra PVC" }, { id: "l2", name: "Silicone neutro", sku: "SN1" }];
  const recenti = [{ chiave: "viti 4x40", name: "Viti 4x40" }, { chiave: "finestra pvc", name: "Finestra PVC" }];
  it("cerca nei tre gruppi e non ripete ciò che sta nel listino", () => {
    const r = cercaArticoli("sili", magazzino, listino, recenti);
    expect(r.magazzino.voci).toHaveLength(1);
    expect(r.listino.voci.map((v) => v.id)).toEqual(["l2"]);
    expect(cercaArticoli("", magazzino, listino, recenti).recenti.voci.map((v) => v.name)).toEqual(["Viti 4x40"]);
  });
  it("cerca parola per parola, in qualsiasi ordine", () => {
    const scaffale = [{ id: "c", name: "Cemento 32.5 - sacco 25 kg", quantity: 3 }];
    expect(cercaArticoli("sacco cemento", scaffale, [], []).magazzino.voci).toHaveLength(1);
    expect(cercaArticoli("sacco gesso", scaffale, [], []).magazzino.voci).toHaveLength(0);
  });
  it("riconosce lo stesso articolo a scaffale per nome o codice, solo se ce n'è", () => {
    const scaffale = [
      { id: "a", name: "Silicone bianco", internal_code: "SIL-1", quantity: 4 },
      { id: "b", name: "silicone BIANCO ", quantity: 9 },
      { id: "z", name: "Stucco", quantity: 0 },
    ];
    expect(giacenzaDi("Silicone bianco", null, scaffale)?.id).toBe("b");
    expect(giacenzaDi("Altro nome", "sil-1", scaffale)?.id).toBe("a");
    expect(giacenzaDi("Stucco", null, scaffale)).toBeNull();
    expect(giacenzaDi("Silicone", null, scaffale)).toBeNull();
    expect(giacenzaDi("", "", scaffale)).toBeNull();
  });
  it("propone il nuovo solo se il nome non esiste tale e quale", () => {
    expect(cercaArticoli("Tassello 8", magazzino, listino, recenti).nuovo).toBe("Tassello 8");
    expect(cercaArticoli("finestra pvc", magazzino, listino, recenti).nuovo).toBeNull();
    expect(cercaArticoli("  ", magazzino, listino, recenti).nuovo).toBeNull();
  });
  it("taglia i gruppi lunghi e dice quanti ne restano", () => {
    const tanti = Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, name: `Tubo ${i}` }));
    const r = cercaArticoli("tubo", [], tanti, []);
    expect(r.listino.voci).toHaveLength(6);
    expect(r.listino.altri).toBe(3);
  });
  it("degli usati tiene il più recente per ogni nome", () => {
    const u = righeUsateDistinte([{ name: "Viti", purchase_price: 9 }, { name: "viti", purchase_price: 1 }]);
    expect(u).toHaveLength(1);
    expect(u[0].purchase_price).toBe(9);
  });
});

describe("regole sul codice", () => {
  const elenco = readFileSync("src/components/orders/OrderItemsList.tsx", "utf8");
  const combo = readFileSync("src/components/orders/ArticleCombobox.tsx", "utf8");
  const popup = readFileSync("src/components/orders/articoli/AggiungiArticoloDialog.tsx", "utf8");
  it("l'avviso «c'è già» non guarda le righe su misura", () => {
    expect(elenco).toContain("items.filter((i) => !i.gruppo_id)");
    expect(elenco).not.toMatch(/trovaDoppione\((newItem|conPosto), items\)/);
    expect(trovaDoppione({ name: "Finestra" }, [])).toBeNull();
  });
  it("un nome nuovo non finisce nel catalogo da solo", () => {
    expect(combo).toContain("companyId && salvaNuoviNelCatalogo");
    expect(elenco).toContain("salvaNuoviNelCatalogo={false}");
    expect(popup).toContain("scelta.nuovo && nelCatalogo");
  });
  it("gli usati di recente non toccano il su misura e chiedono i costi solo con il permesso", () => {
    expect(popup).toContain('.is("gruppo_id", null)');
    expect(popup).toContain('canViewCosts ? "purchase_price, " : ""');
  });
});
