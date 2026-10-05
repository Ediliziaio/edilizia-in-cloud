import { describe, expect, it } from "vitest";
import { anteprimaSerramenti } from "@/lib/serramenti/anteprima";
import { calcolaTotale } from "@/lib/serramenti/calcoli";
import type { RigaCostoListino } from "@/lib/serramenti/margine";
import { righeDaPrezzare, righeTotali } from "@/lib/preventivatore/anteprima";
import type { SrAccessorioRow, SrProgettoDetail, SrProgettoRow, SrSerramentoRow, SrServizioRow } from "@/types/serramenti";

/**
 * L'anteprima a destra non calcola niente di suo: dispone i numeri di
 * `calcolaTotale` (gli stessi dello step Economia e del PDF). Qui si controlla che
 * i totali coincidano, che l'ordine sia quello delle posizioni, che i dati non
 * ancora salvati nel modulo si vedano subito, e che la vista impresa non
 * inventi margini quando mancano i costi.
 */

const OGGI = new Date("2026-10-05T10:00:00");

const serramento = (extra: Partial<SrSerramentoRow>): SrSerramentoRow => ({
  id: "s1", progetto_id: "p1", company_id: "c1", position: 0, tipologia: "finestra", tipologia_label: "Finestra 2 ante",
  ambiente: null, materiale: null, serie: null, vetro: null, vetro_specs: null, apertura: null,
  colore_interno: null, colore_esterno: null, larghezza_mm: 1200, altezza_mm: 1400, quantita: 1, metri_quadri: null,
  family_id: null, macrocategoria_override_id: null, listino_voce_id: null, supplier_catalog_id: null,
  supplier_product_line_id: null, prezzo_unitario: 800, prezzo_totale: 800, valori_assi: {},
  foto_storage_path: null, foto_render_path: null, note: null, posa_esclusa: false, created_at: "", updated_at: "",
  ...extra,
});

const accessorio = (extra: Partial<SrAccessorioRow>): SrAccessorioRow => ({
  id: "a1", progetto_id: "p1", company_id: "c1", position: 0, tipo: "persiana", descrizione: null, quantita: 1,
  larghezza_mm: null, altezza_mm: null, prezzo_unitario: 300, prezzo_totale: 300, listino_voce_id: null,
  serramento_id: null, note: null, posa_esclusa: false, family_id: null, valori_assi: null, modalita_prezzo: null,
  supplier_catalog_id: null, supplier_product_line_id: null, created_at: "", updated_at: "",
  ...extra,
});

const servizio = (extra: Partial<SrServizioRow>): SrServizioRow => ({
  id: "m1", progetto_id: "p1", company_id: "c1", position: 0, tariffa_id: null, variante_id: null,
  descrizione: "Trasporto", unita: null, quantita: 1, prezzo_unitario_costo: null, prezzo_unitario_vendita: 150,
  prezzo_totale_costo: null, prezzo_totale_vendita: 150, note: null, created_at: "", updated_at: "",
  ...extra,
});

const progetto = (extra: Partial<SrProgettoRow> = {}): SrProgettoRow =>
  ({ id: "p1", code: "SR-2026-0412", iva_percentuale: 10, sconto_percentuale: 0, sconto_importo: 0, tipo_intervento: "sostituzione", ...extra }) as unknown as SrProgettoRow;

const dettaglio = (over: Partial<SrProgettoDetail> = {}, p: Partial<SrProgettoRow> = {}): SrProgettoDetail => ({
  progetto: progetto(p),
  serramenti: [
    serramento({ id: "s2", position: 1, tipologia: "portafinestra", tipologia_label: "Portafinestra", larghezza_mm: 900, altezza_mm: 2200, prezzo_unitario: 1100, prezzo_totale: 1100 }),
    serramento({ id: "s1", position: 0, quantita: 3, ambiente: "Soggiorno", apertura: "2 ante", colore_interno: "Bianco", colore_esterno: "Bianco", prezzo_unitario: 800, prezzo_totale: 2400 }),
  ],
  accessori: [accessorio({ id: "a1", serramento_id: "s1", quantita: 4, prezzo_unitario: 300, prezzo_totale: 1200 })],
  media: [],
  risparmio: null,
  servizi: [servizio({})],
  ...over,
});

describe("anteprimaSerramenti: dispone i numeri di calcolaTotale", () => {
  it("righe nell'ordine delle posizioni, in gruppi, con misure in cm e dettagli", () => {
    const a = anteprimaSerramenti({}, dettaglio(), { emittente: "Bianchi Infissi", oggi: OGGI });
    expect(a.gruppi.map((g) => [g.id, g.righe.length])).toEqual([["serramenti", 2], ["complementi", 1], ["servizi", 1]]);
    const [prima, seconda] = a.gruppi[0].righe;
    expect(prima.id).toBe("s1");
    expect(seconda.id).toBe("s2");
    expect(prima.titolo).toBe("Finestra 2 ante");
    expect(prima.dettaglio).toBe("Soggiorno · 120 × 140 cm · 2 ante · Bianco");
    expect(seconda.dettaglio).toBe("90 × 220 cm");
    // il complemento dice a quale finestra appartiene
    expect(a.gruppi[1].righe[0].titolo).toBe("Persiana");
    expect(a.gruppi[1].righe[0].dettaglio).toBe("per Finestra 2 ante · Soggiorno");
    expect(a.emittente).toBe("Bianchi Infissi");
    expect(a.codice).toBe("SR-2026-0412");
    expect(righeTotali(a)).toBe(4);
  });

  it("i totali sono quelli di calcolaTotale: voci 4.850, sconto 5%, IVA 10%", () => {
    const d = dettaglio({}, { sconto_percentuale: 5 });
    const a = anteprimaSerramenti({}, d, { oggi: OGGI });
    const atteso = calcolaTotale(d.serramenti, d.accessori, { iva_percentuale: 10, sconto_percentuale: 5, sconto_importo: 0 }, d.servizi);

    expect(a.totali.map((v) => [v.id, v.importo])).toEqual([
      ["lordo", 4850], ["sconto", 242.5], ["netto", 4607.5], ["iva", 460.75], ["totale", 5068.25],
    ]);
    expect(a.totaleDocumento).toBe(atteso.totale_iva_inclusa);
    expect(a.totali.at(-1)).toMatchObject({ id: "totale", forte: true });
    expect(a.totali.find((v) => v.id === "sconto")).toMatchObject({ etichetta: "Sconto 5%", negativo: true });
  });

  it("i campi del modulo non ancora salvati si vedono subito (il form vince sul preventivo)", () => {
    const a = anteprimaSerramenti({ sconto_percentuale: 10, cliente_nome: "Mario", cliente_cognome: "Rossi", cliente_telefono: "347 123 4567" }, dettaglio({}, { sconto_percentuale: 0 }), { oggi: OGGI });
    expect(a.totali.find((v) => v.id === "sconto")?.importo).toBe(485);
    expect(a.totaleDocumento).toBe(4365 * 1.1);
    expect(a.cliente.nome).toBe("Mario Rossi");
    expect(a.cliente.righe).toEqual(["347 123 4567"]);
  });

  it("senza sconto non c'è la riga dello sconto né dell'imponibile", () => {
    const a = anteprimaSerramenti({}, dettaglio(), { oggi: OGGI });
    expect(a.totali.map((v) => v.id)).toEqual(["lordo", "iva", "totale"]);
  });

  it("prezzo scritto a mano: parte da quello, le voci senza prezzo restano «da prezzare» e c'è la nota", () => {
    const d = dettaglio({ serramenti: [serramento({ prezzo_unitario: null, prezzo_totale: null })], accessori: [], servizi: [] }, { prezzo_manuale: 6000 });
    const a = anteprimaSerramenti({}, d, { oggi: OGGI });
    expect(a.totali[0]).toMatchObject({ id: "lordo", etichetta: "Prezzo concordato", importo: 6000 });
    expect(a.totaleDocumento).toBe(6600);
    expect(righeDaPrezzare(a)).toBe(1);
    expect(a.prezzoACorpo).toBe(true);
    expect(a.note.join(" ")).toContain("Prezzo scritto a mano");
    // e senza prezzo a mano non lo dichiara
    expect(anteprimaSerramenti({}, dettaglio(), { oggi: OGGI }).prezzoACorpo).toBe(false);
  });

  it("IVA mista: due righe di IVA con la base di ciascuna, e la spiegazione", () => {
    const d = dettaglio({}, { iva_percentuale: -1 });
    const a = anteprimaSerramenti({}, d, { oggi: OGGI });
    // serramenti 3.500 > altre prestazioni 1.350 (accessori 1.200 + servizi 150): 1.350 al 10%, 2.150 al 22%
    expect(a.totali.find((v) => v.id === "iva10")).toMatchObject({ importo: 270 });
    expect(a.totali.find((v) => v.id === "iva10")?.etichetta).toMatch(/^IVA 10% su € 2\.700$/);
    expect(a.totali.find((v) => v.id === "iva22")).toMatchObject({ importo: 473 });
    expect(a.totali.find((v) => v.id === "iva22")?.etichetta).toMatch(/^IVA 22% su € 2\.150$/);
    expect(a.note.join(" ")).toContain("IVA mista");
  });

  it("preventivo nuovo (senza posizioni salvate): solo i dati del cliente, niente totali", () => {
    const a = anteprimaSerramenti({ cliente_nome: "Anna", cantiere_indirizzo: "Via Roma 4", cantiere_citta: "Vicenza" }, undefined, { oggi: OGGI });
    expect(a.gruppi.every((g) => g.righe.length === 0)).toBe(true);
    expect(a.totali).toEqual([]);
    expect(a.totaleDocumento).toBeNull();
    expect(a.cliente.nome).toBe("Anna");
    expect(a.cantiere).toBe("Via Roma 4, Vicenza");
  });

  it("titolo e data: il titolo scritto, altrimenti quello del tipo di intervento; validità se c'è", () => {
    const a = anteprimaSerramenti({ valido_fino_data: "2026-11-04T12:00:00" }, dettaglio(), { oggi: OGGI });
    expect(a.titolo).toBe("Sostituzione serramenti");
    expect(a.dataEtichetta).toBe("5 ottobre 2026 · valido fino al 4 novembre 2026");
    expect(anteprimaSerramenti({ intervento_titolo: "Casa al mare" }, dettaglio(), { oggi: OGGI }).titolo).toBe("Casa al mare");
  });

  it("vista impresa: i costi li dà il listino riga per riga, un costo che manca toglie la percentuale", () => {
    const d = dettaglio({
      serramenti: [
        serramento({ id: "s1", listino_voce_id: "v1", quantita: 3, prezzo_unitario: 800, prezzo_totale: 2400 }),
        serramento({ id: "s2", position: 1, prezzo_unitario: 1100, prezzo_totale: 1100 }),
      ],
      accessori: [accessorio({ id: "a1", quantita: 4, prezzo_totale: 1200 })],
      servizi: [servizio({ prezzo_totale_costo: 100 })],
    }, { sconto_percentuale: 5 });
    // il listino conosce il costo della finestra s1 (500 × 3 pezzi) e della persiana, non quello della portafinestra
    const costoPosizione = (r: RigaCostoListino): number | null => (r.id === "s1" ? 500 * Number(r.quantita) : r.id === "a1" ? 700 : null);
    const a = anteprimaSerramenti({}, d, { oggi: OGGI, costoPosizione });

    // costi: 1.500 + 700 + 100 = 2.300; la portafinestra s2 non ha costo
    expect(a.impresa).toMatchObject({ costi: 2300, margine: 4607.5 - 2300, costiCompleti: false, marginePct: null, righeSenzaCosto: 1 });
    expect(a.gruppi[0].righe.find((r) => r.id === "s1")?.costo).toBe(1500);
    expect(a.gruppi[0].righe.find((r) => r.id === "s2")?.costo).toBeNull();

    const completo = anteprimaSerramenti({}, { ...d, serramenti: [d.serramenti[0]], accessori: d.accessori, servizi: d.servizi }, { oggi: OGGI, costoPosizione });
    expect(completo.impresa?.costiCompleti).toBe(true);
    expect(completo.impresa?.marginePct).toBeCloseTo(((3750 * 0.95 - 2300) / (3750 * 0.95)) * 100, 6);
  });

  it("senza i costi caricati non c'è il blocco impresa (chi non può vederla non lo riceve nemmeno)", () => {
    expect(anteprimaSerramenti({}, dettaglio(), { oggi: OGGI }).impresa).toBeNull();
  });
});
