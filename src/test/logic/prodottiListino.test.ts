/**
 * I prodotti del listino prodotti dentro i preventivatori edili (06/10/2026): chi sceglie
 * un prodotto lo ritrova nel preventivo col suo prezzo e, se ci sono, la sua foto e la sua
 * descrizione. Qui le regole pure: cosa si propone, a che prezzo, come si legge il testo.
 */
import { describe, expect, it } from "vitest";
import {
  areaDelProdotto,
  dettaglioNelPicker,
  eProdottoPrezzabile,
  famigliaInProdotto,
  type RigaFamigliaPicker,
} from "@/lib/moduli/prodottiListino";
import { descrizioneBreve, testoDelListino } from "@/lib/moduli/testoProdotto";

const riga = (extra: Partial<RigaFamigliaPicker> = {}): RigaFamigliaPicker => ({
  id: "f1", nome: "Piatto doccia in resina 120x80 cm", codice: "PD-12080", descrizione: "Antiscivolo, finitura pietra.",
  immagine_url: "/templates/bagno/products/piatto-doccia.webp", vertical: "bagno", unit_of_measure: "pz",
  modalita_prezzo_base: "pz", prezzo_base_mode: "vendita", prezzo_base_vendita: 235, prezzo_base_acquisto: 130,
  markup_tipo: "percentuale", markup_valore: 0, sconto_fornitore_1: 0, sconto_fornitore_2: 0, axes: [],
  ...extra,
});

describe("dalla famiglia del listino al prodotto da proporre", () => {
  it("a pezzo: il prezzo di vendita e il costo d'acquisto del listino, foto e descrizione com'erano", () => {
    expect(famigliaInProdotto(riga())).toEqual({
      id: "f1", nome: "Piatto doccia in resina 120x80 cm", codice: "PD-12080", descrizione: "Antiscivolo, finitura pietra.",
      immagine_url: "/templates/bagno/products/piatto-doccia.webp", vertical: "bagno", modo: "pz", unita: "pz",
      prezzo_vendita: 235, prezzo_acquisto: 130, con_varianti: false,
    });
  });

  it("al metro quadro: il prezzo è quello di UN metro quadro, l'unità è «mq»", () => {
    const p = famigliaInProdotto(riga({ modalita_prezzo_base: "mq", unit_of_measure: "pz", prezzo_base_vendita: 48.5, prezzo_base_acquisto: 27 }));
    expect(p).toMatchObject({ modo: "mq", unita: "mq", prezzo_vendita: 48.5, prezzo_acquisto: 27 });
  });

  it("col listino «acquisto + ricarico» il prezzo lo fa lo stesso motore dei serramenti: sconti del fornitore, poi il ricarico", () => {
    // 200 € di listino, −50% e poi −10%: 90 € d'acquisto; ricarico 30%: 117 € di vendita.
    const p = famigliaInProdotto(riga({
      prezzo_base_mode: "acquisto_markup", prezzo_base_vendita: 1, prezzo_base_acquisto: 200,
      sconto_fornitore_1: 50, sconto_fornitore_2: 10, markup_tipo: "percentuale", markup_valore: 30,
    }));
    expect(p.prezzo_acquisto).toBe(90);
    expect(p.prezzo_vendita).toBe(117);
  });

  it("i numeri che arrivano come testo si leggono; quelli rotti valgono zero, mai NaN", () => {
    const p = famigliaInProdotto(riga({ prezzo_base_vendita: "199.90", prezzo_base_acquisto: null }));
    expect(p.prezzo_vendita).toBe(199.9);
    expect(p.prezzo_acquisto).toBe(0);
    expect(famigliaInProdotto(riga({ prezzo_base_vendita: "boh" })).prezzo_vendita).toBe(0);
  });

  it("senza foto e senza descrizione non si inventa niente: vuoto è null, anche con soli spazi", () => {
    const p = famigliaInProdotto(riga({ immagine_url: "  ", descrizione: "\n \n" }));
    expect(p.immagine_url).toBeNull();
    expect(p.descrizione).toBeNull();
    expect(famigliaInProdotto(riga({ immagine_url: null, descrizione: undefined }))).toMatchObject({ immagine_url: null, descrizione: null });
  });

  it("il testo del listino si ripulisce: spazi doppi e a capo diventano uno spazio", () => {
    expect(famigliaInProdotto(riga({ descrizione: "  Antiscivolo,\n  finitura   pietra. " })).descrizione).toBe("Antiscivolo, finitura pietra.");
    expect(testoDelListino(42)).toBeNull();
  });

  it("un prodotto senza nome si chiama «Prodotto»; con le varianti lo dice", () => {
    expect(famigliaInProdotto(riga({ nome: "   " })).nome).toBe("Prodotto");
    expect(famigliaInProdotto(riga({ axes: [{ id: "a1" }] })).con_varianti).toBe(true);
  });
});

describe("cosa si propone", () => {
  it("solo i prodotti a pezzo o al metro quadro: griglie di misure e misura libera sono dei serramenti", () => {
    expect(eProdottoPrezzabile({ modalita_prezzo_base: "pz" })).toBe(true);
    expect(eProdottoPrezzabile({ modalita_prezzo_base: "mq" })).toBe(true);
    for (const modo of ["griglia", "misura_libera", "", null, undefined]) {
      expect(eProdottoPrezzabile({ modalita_prezzo_base: modo as string | null | undefined })).toBe(false);
    }
  });

  it("sotto il nome, nel selettore: l'area solo se è di un'altra area, il codice, e le varianti", () => {
    const mio = famigliaInProdotto(riga());
    expect(dettaglioNelPicker(mio, "bagno")).toBe("PD-12080");
    const altrui = famigliaInProdotto(riga({ vertical: "termoidraulico", codice: "RAD-1", axes: [{ id: "x" }] }));
    expect(dettaglioNelPicker(altrui, "bagno")).toBe("Termoidraulico · RAD-1 · con varianti: prezzo di base");
    expect(dettaglioNelPicker(famigliaInProdotto(riga({ codice: null })), "bagno")).toBe("");
  });

  it("l'area in parole", () => {
    expect(areaDelProdotto("bagno")).toBe("Bagno");
    expect(areaDelProdotto("pareti-soffitti")).toBe("Pareti e soffitti");
    expect(areaDelProdotto("  TETTI ")).toBe("Tetti");
    expect(areaDelProdotto("arredo-urbano")).toBe("Arredo-urbano");
    expect(areaDelProdotto(null)).toBe("");
  });
});

/** I font dei PDF sono WinAnsi: Latin-1 più poche punteggiature (qui servono i puntini di sospensione). */
const WIN_ANSI = new RegExp("^[\\u0020-\\u007E\\u00A0-\\u00FF\\u2018\\u2019\\u201C\\u201D\\u2013\\u2014\\u2026\\u20AC\\u2022]*$");

describe("la descrizione nel PDF: una frase corta", () => {
  const lunga = "Piatto doccia in resina minerale con finitura ardesia antiscivolo, bordo ribassato a filo pavimento, piletta inclusa e sifone ispezionabile. ".repeat(4);

  it("quella corta resta com'è; senza testo non c'è niente", () => {
    expect(descrizioneBreve("Antiscivolo, finitura pietra.")).toBe("Antiscivolo, finitura pietra.");
    expect(descrizioneBreve(null)).toBeNull();
    expect(descrizioneBreve("   ")).toBeNull();
  });

  it("quella lunga si taglia su una parola intera, con i puntini, entro il massimo", () => {
    const b = descrizioneBreve(lunga)!;
    expect(b.length).toBeLessThanOrEqual(220);
    expect(b.endsWith("…")).toBe(true);
    // Mai una parola spezzata a metà: ciò che precede i puntini è un pezzo del testo che finisce in uno spazio.
    expect(lunga.replace(/\s+/g, " ").trim().startsWith(b.slice(0, -1))).toBe(true);
    expect(lunga.replace(/\s+/g, " ").trim().charAt(b.length - 1)).toBe(" ");
    expect(b).toMatch(WIN_ANSI);
  });

  it("niente virgole o punti appesi davanti ai puntini", () => {
    const b = descrizioneBreve("Alfa beta gamma, delta epsilon zeta, eta theta iota, kappa lambda mi.", 40)!;
    expect(b).not.toMatch(/[,;:.\-–—]…$/);
    expect(b.endsWith("…")).toBe(true);
  });

  it("il massimo si può stringere", () => {
    expect(descrizioneBreve(lunga, 60)!.length).toBeLessThanOrEqual(60);
  });
});
