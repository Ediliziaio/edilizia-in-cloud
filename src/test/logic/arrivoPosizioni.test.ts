import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  abbinaRigheBolla, contiPosizione, descriviMisure, fraseCosaManca, misureNelTesto, statoPosizione, testoReclamo,
  type ElencoArrivo, type PosizioneArrivo, type ProblemaArrivo, type RigaBolla,
} from "@/lib/arrivi/arrivoPosizioni";

const pos = (p: Partial<PosizioneArrivo>): PosizioneArrivo => ({
  poi_id: "p1", order_item_id: "o1", nome: "Finestra 2 ante", descrizione: "Finestra PVC bianco", riferimento: "Cucina", gruppo_id: "g",
  misure: { larghezza_mm: 1200, altezza_mm: 1400 }, misura_tipo: "telaio", componente: null, unita: "pz", sku: null,
  quantita: 1, ricevuta: 0, riordino: false, riordino_motivo: null, problemi: [], ...p,
});
const problema = (p: Partial<ProblemaArrivo>): ProblemaArrivo => ({
  id: "x", esito: "danneggiata", quantita: 1, stato: "aperto", foto: [], nota: null, creato_il: "2026-11-08", chi: null,
  riordino_po_id: null, riordino_numero: null, ...p,
});
const riga = (r: Partial<RigaBolla>): RigaBolla => ({ id: "r1", posizione: 1, codice: null, descrizione: "", quantita: 1, unita: "pz", order_item_id: null, origine: "ai", ...r });

describe("conti di una posizione", () => {
  it("non permette di spuntare due volte un pezzo già segnato rotto", () => {
    const c = contiPosizione(pos({ problemi: [problema({})] }));
    expect(c).toMatchObject({ libero: 0, problemi: 1, arrivabili: 0, completa: false });
  });
  it("un pezzo in riordino non si aspetta più su questa riga", () => {
    const c = contiPosizione(pos({ quantita: 2, problemi: [problema({ stato: "riordinato" })] }));
    expect(c).toMatchObject({ libero: 1, riordinati: 1, arrivabili: 1 });
  });
  it("il mancante si può spuntare quando arriva", () => {
    expect(contiPosizione(pos({ problemi: [problema({ esito: "mancante" })] })).arrivabili).toBe(1);
  });
  it("dice lo stato a parole", () => {
    expect(statoPosizione(pos({ ricevuta: 1 })).testo).toBe("Arrivata giusta");
    expect(statoPosizione(pos({ problemi: [problema({ esito: "sbagliata" })] })).testo).toBe("Sbagliata");
    expect(statoPosizione(pos({ quantita: 3, ricevuta: 1 })).testo).toBe("Arrivati 1 su 3");
  });
});

describe("misure", () => {
  it("scrive la misura e di che misura si tratta", () => {
    expect(descriviMisure({ larghezza_mm: 1200, altezza_mm: 1400 }, "telaio")).toBe("L 1200 × H 1400 — misura telaio");
    expect(descriviMisure(null)).toBeNull();
  });
  it("legge le misure dal testo della bolla, in mm o in cm", () => {
    expect(misureNelTesto("Finestra 1200x1400 bianca")).toEqual([1200, 1400]);
    expect(misureNelTesto("Finestra 120 x 140")).toEqual([1200, 1400]);
    expect(misureNelTesto("L 800 H 2100")).toEqual([800, 2100]);
    expect(misureNelTesto("Silicone neutro")).toBeNull();
  });
});

describe("la bolla si abbina alle posizioni", () => {
  const cucina = pos({});
  const bagno = pos({ poi_id: "p2", order_item_id: "o2", riferimento: "Bagno", misure: { larghezza_mm: 800, altezza_mm: 1400 } });

  it("distingue due finestre uguali dalle misure", () => {
    const righe = [riga({ id: "a", descrizione: "Finestra PVC 800x1400" }), riga({ id: "b", descrizione: "Finestra PVC 1200x1400" })];
    expect(abbinaRigheBolla(righe, [cucina, bagno])).toMatchObject({ p1: { rigaId: "b" }, p2: { rigaId: "a" } });
  });
  it("non propone una riga con misure diverse", () => {
    expect(abbinaRigheBolla([riga({ descrizione: "Finestra PVC 2000x900" })], [cucina])).toEqual({});
  });
  it("usa ogni riga una volta sola", () => {
    const proposte = abbinaRigheBolla([riga({ id: "a", descrizione: "Finestra 2 ante PVC bianco Cucina Bagno" })], [cucina, bagno]);
    expect(Object.keys(proposte)).toHaveLength(1);
  });
  it("una riga già confermata resta dov'è", () => {
    expect(abbinaRigheBolla([riga({ id: "z", descrizione: "Boh", order_item_id: "o2" })], [cucina, bagno])).toEqual({ p2: { rigaId: "z", punteggio: 100 } });
  });
  it("il riferimento non può rompere la ricerca", () => {
    expect(() => abbinaRigheBolla([riga({ descrizione: "x" })], [pos({ riferimento: "P(3" })])).not.toThrow();
  });
});

describe("reclamo e cosa manca", () => {
  const elenco = (posizioni: PosizioneArrivo[]): ElencoArrivo => ({
    ordine: { id: "o", numero: "ODA-1", stato: "parziale", order_id: "c", fornitore: "Rossi", email_fornitore: "r@x.it", commessa: "C-9", cliente: null },
    puo_riordinare: true, articoli_normali: 0, righe_bolla: [], posizioni,
  });
  it("elenca solo i pezzi scelti, con le misure, e chiede la sostituzione", () => {
    const e = elenco([pos({ problemi: [problema({ id: "a", nota: "vetro rotto" })] }), pos({ poi_id: "p2", riferimento: "Bagno", problemi: [problema({ id: "b", esito: "sbagliata" })] })]);
    const t = testoReclamo(e, ["a"]);
    expect(t.oggetto).toBe("Reclamo merce — ordine ODA-1");
    expect(t.corpo).toContain("Cucina — Finestra 2 ante (L 1200 × H 1400 — misura telaio): 1 pz arrivata danneggiata. vetro rotto");
    expect(t.corpo).toContain("senza addebito");
    expect(t.corpo).not.toContain("Bagno");
  });
  it("per i soli mancanti chiede quando arrivano", () => {
    const t = testoReclamo(elenco([pos({ problemi: [problema({ id: "a", esito: "mancante" })] })]), ["a"]);
    expect(t.corpo).toContain("non arrivata");
    expect(t.corpo).not.toContain("senza addebito");
  });
  it("fa la frase corta", () => {
    expect(fraseCosaManca({ non_arrivate: 3, parziali: 0, da_sostituire: 1 })).toBe("3 posizioni non arrivate · 1 da sostituire");
    expect(fraseCosaManca({ non_arrivate: 1, parziali: 0, da_sostituire: 0 })).toBe("1 posizione non arrivata");
    expect(fraseCosaManca({ non_arrivate: 0, parziali: 0, da_sostituire: 0 })).toBeNull();
  });
});

describe("le regole nel database", () => {
  const leggi = (n: string) => readFileSync(`supabase/migrations/${n}`, "utf8");
  const giacenza = leggi("20290104110000_su_misura_mai_in_giacenza.sql");
  const arrivo = leggi("20290104100000_arrivo_posizioni.sql");
  const bolla = leggi("20290104120000_bolla_controllo_unico.sql");

  it.each(["auto_carico_stock_on_receipt", "insert_goods_receipt_atomic", "oda_registra_arrivo", "receive_from_oda_via_scans", "conferma_carico_ddt", "bolla_carica_magazzino", "ricalcola_ricezione_oda"])(
    "%s tiene il su misura fuori dalla giacenza", (fn) => { expect(giacenza).toContain(`arrivo_correggi('${fn}'`); });

  it("la patch si ferma se il punto da cambiare non c'è", () => {
    expect(giacenza).toContain("if v_volte <> 1 then");
  });
  it("le funzioni interne sono chiuse, le spunte passano dal permesso", () => {
    expect(arrivo).toContain("revoke all on function public.riga_e_su_misura(uuid) from public, anon, authenticated");
    expect(arrivo).toContain("arrivo_puo_registrare(v_company, v_order)");
    expect(arrivo).toContain("revoke all on public.arrivi_posizione from public, anon, authenticated");
  });
  it("il riordino non tocca il costo e il doppio invio è riconosciuto", () => {
    expect(arrivo).toContain("case when p_gratis then 0 else p.unit_price end");
    expect(arrivo).toContain("a.invio_id = p_invio_id");
  });
  it("la bolla ha un controllo solo, sotto lucchetto, sulle due strade", () => {
    expect(bolla).toContain("before insert on public.campo_acquisti");
    expect(bolla).toContain("before insert or update of numero_ddt, supplier_id, purchase_order_id on public.ddt_ricezione");
    expect(bolla.match(/bolla_lucchetto\(new\.company_id/g)).toHaveLength(2);
    // Un ordine vuoto sul documento del cantiere non deve annullare il controllo.
    expect(bolla).toContain("a.purchase_order_id is not distinct from new.purchase_order_id");
  });
  it("due fornitori diversi con lo stesso numero non sono un doppione", () => {
    const correzioni = leggi("20290104130000_arrivo_correzioni.sql");
    expect(correzioni).toContain("when a_id is not null and b_id is not null then a_id = b_id");
    expect(correzioni).toContain("else a_order is not null and a_order = b_order");
  });
});
