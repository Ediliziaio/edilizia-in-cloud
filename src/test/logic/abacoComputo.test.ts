import { describe, expect, it } from "vitest";
import { abacoDalComputo, riepilogoAbaco } from "@/lib/distinta/abacoComputo";
import { vociGenzano } from "../support/vociGenzano";
import { generaDistinta } from "@/lib/distinta/generaDistinta";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { componentiEspliciti, dettagliLottoIncompleto } from "@/lib/distinta/materialiDocumentali";

describe("abaco del computo, senza inventare misure produttive", () => {
  const voci = vociGenzano();
  const a = abacoDalComputo(voci);
  it("conserva le 154 righe di misura di serramenti, avvolgibili e oscuranti", () => {
    expect(a).toHaveLength(154);
    const serramenti = a.filter(r => r.famiglia === "serramento");
    expect(riepilogoAbaco(serramenti).pezzi_ricostruiti).toBe(148);
    expect(riepilogoAbaco(serramenti).superficie_contabile_mq).toBe(314.27);
  });
  it("due minimi da 1,50 m² sono due pezzi con dimensioni ignote, non un infisso 3×1 m", () => {
    const r = a.find(r => r.numero_voce === "59" && r.ordine_misura === 1)!;
    expect(r).toMatchObject({ pezzi: 2, larghezza_m: null, altezza_m: null, superficie_contabile_mq: 3, minimo_fatturabile: true });
    expect(r.avvisi.join(" ")).toMatch(/rilievo/);
  });
  it("conserva larghezza, altezza, ubicazione e prospetto delle righe dimensionali", () => {
    expect(a.find(r => r.numero_voce === "59" && r.ordine_misura === 4)).toMatchObject({
      pezzi: 1, larghezza_m: 0.88, altezza_m: 1.74, fonte_pezzi: "misure", ubicazione: "Unità Figurativa G Piano Terra", prospetto: "Lato Nord - Est" });
  });
  it("non indovina il numero di finestre da una superficie senza fattori o minimi dichiarati", () => {
    const r = abacoDalComputo([{ id: "nuovo", descrizione_breve: "Finestra a battente", unita_misura: "mq", quantita: 12, misure: [{ quantita: 12 }] }])[0];
    expect(r.pezzi).toBeNull(); expect(r.larghezza_m).toBeNull();
  });
  it("mantiene separata l'ipotesi sul solo minimo dal conteggio esplicito", () => {
    const r = abacoDalComputo([{ id: "m", descrizione_breve: "Finestra a battente, minimo fatturabile 1,50 mq", unita_misura: "mq", quantita: 1.5, misure: [{ quantita: 1.5 }] }])[0];
    expect(r).toMatchObject({ pezzi: null, pezzi_ipotizzati: 1, larghezza_m: null, altezza_m: null });
    expect(r.avvisi.join(" ")).toMatch(/non prova il numero/);
  });
  it("cambia stanza e azzera il prospetto precedente quando inizia una nuova ubicazione", () => {
    const a = abacoDalComputo([{ id: "a", descrizione_breve: "Serramento a battente", unita_misura: "mq", quantita: 2,
      misure: [{ descrizione: "Unità figurativa A Piano terra Lato Nord-Est", larghezza: 1, altezza_peso: 1, quantita: 1 },
        { descrizione: "Unità figurativa B Piano primo", larghezza: 1, altezza_peso: 1, quantita: 1 }] }]);
    expect(a[1].prospetto).toBe(""); expect(a[1].ubicazione).toBe("Unità figurativa B Piano primo");
  });
});

describe("prodotti espliciti del PDF prima delle ricette", () => {
  const voci = vociGenzano();
  const g = generaDistinta({ voci, scomposizioni: [], riserva: catalogoComeScomposizioni() });
  const di = (n: string) => g.righe.filter(r => r.origini.some(o => o.tipo === "computo" && o.voce_id === n));
  const fondoDa = (vv = voci) => generaDistinta({ voci: vv, scomposizioni: [{ id: "fondo", nome: "Fondo ai silicati", attiva: true,
    codice_prezzario: voci.find(v => v.id === "35")!.codice_prezzario,
    componenti: [{ descrizione: "Fondo impregnante ai silicati", unita_misura: "l", quantita_per_unita: 0.15 }] }] })
    .righe.find(m => m.origini.some(o => o.tipo === "computo" && o.voce_id === "35"))!;
  it("cassetta 220: due scatole da parete IP56 110×100×50, nessun morsetto o separatore inventato", () => {
    expect(di("220")).toHaveLength(1);
    expect(di("220")[0]).toMatchObject({ descrizione: "Cassetta di derivazione da parete", quantita_calcolata: 2, unita_misura: "pz" });
    expect(di("220")[0].specifiche).toMatch(/110x100x50/); expect(di("220")[0].specifiche).toMatch(/IP 56/);
    expect(di("220")[0].verifica_acquisto).toBeUndefined();
  });
  it("45 cassonetti a pezzi non diventano 47,25 metri quadrati", () => {
    expect(di("74")[0]).toMatchObject({ quantita_calcolata: 45, unita_misura: "pz", dati_documentali: { quantita_documento: 45 } });
    expect(di("74")[0].verifica_acquisto?.campi_mancanti).toContain("abaco");
  });
  it("separa potere di interruzione 4,5 e 6 kA e tipo AC dagli esempi di ricetta", () => {
    expect(di("149")).toHaveLength(1); expect(di("215")).toHaveLength(1); expect(di("218")).toHaveLength(1);
    expect(di("149")[0].specifiche).toMatch(/4,5 kA/); expect(di("215")[0].specifiche).toMatch(/6kA/);
    expect(di("149")[0].verifica_acquisto?.campi_mancanti).toContain("corrente_nominale");
  });
  it("non converte una tempera in idropittura e non aggiunge l'imprimitura esclusa dal PDF", () => {
    expect(di("157")).toHaveLength(1);
    expect(di("157")[0]).toMatchObject({ descrizione: "Tempera per interni", quantita_calcolata: 411, unita_misura: "mq", verifica_acquisto: { stato: "da_verificare" } });
  });
  it("applica una sola volta lo sfrido delle lastre alla superficie documentata", () => {
    const m = di("154").find(m => m.descrizione === "Lastra in cartongesso")!;
    expect(m.quantita_netta).toBe(355); expect(m.quantita_calcolata).toBe(372.75);
    expect(m.dati_documentali?.quantita_documento).toBe(355);
  });
  it("gli spessori ricostruiti non sovrascrivono la quantità e la descrizione documentali della voce base", () => {
    const g = generaDistinta({ voci, scomposizioni: [{ id: "eps", nome: "Pannello EPS", codice_prezzario: voci.find(v => v.id === "32")!.codice_prezzario,
      unita_misura: "mq", attiva: true, componenti: [{ descrizione: "Pannello isolante", specifiche: "EPS spessore 3 cm", unita_misura: "mq", quantita_per_unita: 1 }] }] });
    const p = g.righe.find(m => m.specifiche?.includes("12 cm") && m.origini.some(o => o.tipo === "computo" && o.voce_id === "32"))!;
    expect(p.dati_documentali?.fonti.find(f => f.numero === "32")?.quantita).toBe(3104.39);
    expect(p.dati_documentali?.quantita_documento).toBe(3054.24);
    expect(p.dati_documentali?.fonti.some(f => f.numero === "33")).toBe(true);
  });
  it("il collante dei pannelli resta una stima di consumo, senza ereditare i metri quadrati dei pannelli", () => {
    const collante = di("32").find(m => m.descrizione === "Collante per pannelli isolanti")!;
    expect(collante.dati_documentali).toMatchObject({ quantita: "stimata", quantita_documento: null, unita_documento: null });
    expect(collante.dati_documentali?.dati_mancanti.join(" ")).toMatch(/ricetta generica/);
    expect(collante.verifica_acquisto?.stato).toBe("da_verificare");
  });
  it("recupera i 30 cm nominali delle spallette e distingue la geometria dalla superficie contabile", () => {
    const m = fondoDa();
    expect(m.dati_documentali?.specifiche.join(" ")).toMatch(/30 cm.*191,16 m²/);
    expect(m.dati_documentali?.specifiche.join(" ")).toMatch(/3\.?295,55 m².*3\.?741,59 m²/);
    expect(m.dati_documentali?.fonti.some(f => f.numero === "34")).toBe(true);
    expect(m.verifica_acquisto?.stato).toBe("da_verificare");
    expect(voci.find(v => v.id === "35")?.quantita).toBe(3741.59);
  });
  it("non prende una larghezza da un altro capitolo o da una fonte ambigua", () => {
    const fuori = voci.map(v => v.id === "34" ? { ...v, super_categoria: "Altro cantiere" } : v);
    const m = fondoDa(fuori);
    expect(m.dati_documentali?.specifiche.join(" ")).not.toMatch(/3\.?295,55/);
    expect(m.dati_documentali?.dati_mancanti.join(" ")).toMatch(/larghezza documentata e non ambigua/);
  });
  it("non trasforma i puntini del quadro in componenti inventati", () => {
    const c = componentiEspliciti(voci.find(v => v.numero_ordine === "95")!.descrizione_breve);
    expect(c.some(x => x.descrizione.includes("Siemens 160A"))).toBe(true);
    expect(c.some(x => x.descrizione.includes("Schneider SRVS1KI-E"))).toBe(true);
    expect(c.some(x => /\.{3}|…/.test(x.descrizione))).toBe(false);
    expect(di("95")[0].dati_documentali?.dati_mancanti.join(" ")).toMatch(/puntini/);
  });
  it("ricava solo il volume minimo del massetto senza inventare prodotto o resa in sacchi", () => {
    const d = dettagliLottoIncompleto(voci.find(v => v.numero_ordine === "226")!);
    expect(d.join(" ")).toMatch(/26.714 m³/); expect(d.join(" ")).toMatch(/resa kg/);
  });
  it("un prodotto fornito dal committente resta escluso anche se ha dimensioni esplicite", () => {
    const g = generaDistinta({ voci: [{ id: "c", descrizione_breve: "Cassetta di derivazione da parete, dimensioni 200x100x50 mm, materiale fornito dal committente", unita_misura: "pz", quantita: 2 }], scomposizioni: [] });
    expect(g.righe).toHaveLength(0); expect(g.escluse[0].motivo).toMatch(/committente/);
  });
});
