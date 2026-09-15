/**
 * I complementi nel box di ogni finestra (Renova, 15/09): «+ Tapparella» con le
 * misure della finestra e il modello già usato, il cassonetto con altezza e
 * profondità sue, niente complementi su porte e persiane vendute da sole.
 */
import { describe, expect, it } from "vitest";
import { areaDelPreventivatore } from "@/lib/serramenti/pickerListino";
import {
  accettaComplementi,
  complementoDaScelta,
  complementoPerFinestra,
  conTotale,
  copiaComplemento,
  eComplemento,
  haGiaComplemento,
  misureCheSeguono,
  modelloDaRiprendere,
  nomeBottone,
  riepilogoComplementi,
  tipologiaDelComplemento,
  tipologieComplemento,
  tipoComplemento,
  type ModelloRipreso,
} from "@/lib/serramenti/complementiFinestra";
import { articoloEsempio, asseEsempio, valoreEsempio } from "@/lib/listino/esempiListino";
import type { MacroListino, TipologiaListino } from "@/lib/listino/lineeListino";
import type { SrAccessorioRow } from "@/types/serramenti";

function listino() {
  const colore = asseEsempio("tap-colore", "Colore", [
    valoreEsempio("tap-bianco", "Bianco", { is_default: true }),
    valoreEsempio("tap-grigio", "Grigio", { maggiorazione_tipo: "percentuale", maggiorazione_valore: 10 }),
  ]);
  const famiglie = [
    articoloEsempio("fin", "Finestra 2 ante", { macrocategoria_id: "m-serramenti", modalita_prezzo_base: "mq", prezzo_base_vendita: 600 }),
    articoloEsempio("tap-pvc", "Tapparella PVC", { macrocategoria_id: "m-tapparelle", modalita_prezzo_base: "mq", prezzo_base_vendita: 90, axes: [colore] }),
    articoloEsempio("tap-blind", "Blindata alluminio", { macrocategoria_id: "m-tapparelle", modalita_prezzo_base: "mq", prezzo_base_vendita: 180 }),
    articoloEsempio("zanz", "Zanzariera a rullo", { macrocategoria_id: "m-zanzariere", prezzo_base_vendita: 120 }),
    articoloEsempio("cass", "Cassonetto coibentato", { macrocategoria_id: "m-cassonetti", modalita_prezzo_base: "griglia" }),
    articoloEsempio("pers", "Persiana 2 ante", { macrocategoria_id: "m-persiane", modalita_prezzo_base: "mq", prezzo_base_vendita: 250 }),
    articoloEsempio("blind", "Porta blindata classe 3", { macrocategoria_id: "m-blindate", prezzo_base_vendita: 1500 }),
    articoloEsempio("motore", "Motore tubolare", { macrocategoria_id: "m-accessori", prezzo_base_vendita: 150 }),
  ];
  const macro = (id: string, nome: string, categoria_tipo: "principale" | "accessorio"): MacroListino => ({
    id,
    nome,
    verticali_abilitati: ["serramentista"],
    categoria_tipo,
  });
  const macrocategorie = [
    macro("m-serramenti", "Serramenti", "principale"),
    macro("m-tapparelle", "Tapparelle", "accessorio"),
    // Segnata come principale: è la tipologia standard a dire che si lega a una finestra.
    macro("m-zanzariere", "Zanzariere", "principale"),
    macro("m-cassonetti", "Cassonetti", "accessorio"),
    macro("m-persiane", "Persiane e scuri", "principale"),
    macro("m-blindate", "Porte blindate", "principale"),
    macro("m-accessori", "Accessori", "accessorio"),
  ];
  const area = areaDelPreventivatore(famiglie, macrocategorie, [], "accessorio");
  const tipologia = (nome: string): TipologiaListino => {
    const t = area?.tipologie.find((x) => x.nome === nome);
    if (!t) throw new Error(`manca la tipologia ${nome}`);
    return t;
  };
  return { area, tipologia };
}

const accessorio = (extra: Partial<SrAccessorioRow>) =>
  ({
    id: "a",
    tipo: "tapparella",
    descrizione: null,
    quantita: 1,
    position: 0,
    family_id: null,
    valori_assi: null,
    scelte_assi: {},
    larghezza_mm: null,
    altezza_mm: null,
    profondita_mm: null,
    prezzo_unitario: null,
    prezzo_totale: null,
    serramento_id: null,
    posa_esclusa: false,
    ...extra,
  }) as SrAccessorioRow;

const finestra = { id: "w1", larghezza_mm: 1200, altezza_mm: 1400, quantita: 2, posa_esclusa: false };
const nessunaTariffa = new Map<string, number>();
const nessunaLinea = new Map();
const griglia = (id: string, valore_x: number, valore_y: number, prezzo_vendita: number) => ({
  id,
  valore_x,
  valore_y,
  prezzo_vendita,
  prezzo_acquisto: null as number | null,
  supplier_catalog_id: null as string | null,
  supplier_product_line_id: null as string | null,
});
const grigliaCassonetti = [griglia("g1", 1000, 300, 200), griglia("g2", 1400, 300, 260), griglia("g3", 1400, 400, 300)];

const modelloDi = (t: TipologiaListino, complementi: SrAccessorioRow[]): ModelloRipreso => {
  const modello = modelloDaRiprendere(t, complementi);
  if (!modello) throw new Error(`nessun modello per ${t.nome}`);
  return modello;
};

describe("i complementi nel box della finestra", () => {
  const { area, tipologia } = listino();

  it("propone tapparelle, zanzariere, cassonetti e persiane col nome al singolare, mai porte o finestre", () => {
    const tipologie = tipologieComplemento(area);
    expect(tipologie.map((t) => t.nome)).toEqual(["Tapparelle", "Zanzariere", "Cassonetti", "Persiane e scuri", "Accessori"]);
    expect(tipologie.map(nomeBottone)).toEqual(["Tapparella", "Zanzariera", "Cassonetto", "Persiana", "Accessorio"]);
    expect(eComplemento(tipologia("Serramenti"))).toBe(false);
    expect(eComplemento(tipologia("Porte blindate"))).toBe(false);
    // Con la parola dell'azienda.
    expect(nomeBottone({ ...tipologia("Tapparelle"), nome: "Avvolgibili" })).toBe("Avvolgibile");
    expect(nomeBottone({ ...tipologia("Persiane e scuri"), nome: "Scuri" })).toBe("Scuro");
  });

  it("il box c'è sulle finestre, anche scritte a mano; non sulle porte, sulle voci a corpo e su un complemento venduto da solo", () => {
    const tutte = area?.tipologie ?? [];
    const riga = (tipologia: string, tipologia_label: string | null, family_id: string | null) => ({ tipologia, tipologia_label, family_id });
    expect(accettaComplementi(riga("finestra_2ante", "Finestra 2 ante", "fin"), tutte)).toBe(true);
    expect(accettaComplementi(riga("finestra_2ante", "PORTA BALCONE 1 ANTA", null), tutte)).toBe(true);
    expect(accettaComplementi(riga("voce_manuale", "Finestra su misura", null), tutte)).toBe(true);
    expect(accettaComplementi(riga("finestra_2ante", "Porta blindata classe 3", "blind"), tutte)).toBe(false);
    expect(accettaComplementi(riga("voce_manuale", "Porta interna laccata", null), tutte)).toBe(false);
    // Un ordine di sole persiane: la persiana è la posizione, non prende una tapparella.
    expect(accettaComplementi(riga("finestra_2ante", "Persiana 2 ante", "pers"), tutte)).toBe(false);
    // Anche quando il listino non propone più quel prodotto.
    expect(accettaComplementi(riga("finestra_2ante", "Tapparella in acciaio", "tolta-dal-listino"), tutte)).toBe(false);
    expect(accettaComplementi(riga("a_corpo", "Fornitura a corpo", null), tutte)).toBe(false);
  });

  it("riprende il modello più usato: la tapparella blindata di una finestra sola non diventa quella di tutte", () => {
    const tapparelle = tipologia("Tapparelle");
    // Due prodotti e nessuno ancora usato: si sceglie dal listino.
    expect(modelloDaRiprendere(tapparelle, [])).toBeNull();
    const pvc = (position: number) =>
      accessorio({ family_id: "tap-pvc", valori_assi: { colore: "tap-grigio" }, scelte_assi: { colore: "Grigio antracite" }, position });
    const blindata = (position: number) => accessorio({ family_id: "tap-blind", valori_assi: {}, position });

    const ripreso = modelloDi(tapparelle, [pvc(0), pvc(1), blindata(2)]);
    expect(ripreso.riga.famiglia.id).toBe("tap-pvc");
    expect(ripreso.valori).toEqual({ colore: "tap-grigio" });
    expect(ripreso.voci).toEqual({ colore: "Grigio antracite" });
    // A pari merito vale la prima scelta.
    expect(modelloDi(tapparelle, [pvc(0), blindata(1)]).riga.famiglia.id).toBe("tap-pvc");
    // Una tipologia con un solo prodotto non chiede niente.
    expect(modelloDi(tipologia("Zanzariere"), []).riga.famiglia.nome).toBe("Zanzariera a rullo");
  });

  it("tapparella: misure e pezzi della finestra, prezzo del listino con le varianti", () => {
    const tapparelle = tipologia("Tapparelle");
    const modello = modelloDi(tapparelle, [accessorio({ family_id: "tap-pvc", valori_assi: { colore: "tap-grigio" } })]);
    const esito = complementoPerFinestra({
      modello, tipologia: tapparelle, finestra, griglia: [], tariffePrezzi: nessunaTariffa, supplierLines: nessunaLinea, position: 7,
    });
    // 1,68 m² × 90 € × 2 pezzi, +10% per il grigio.
    expect(esito).toEqual({
      daCompletare: null,
      riga: expect.objectContaining({
        tipo: "tapparella",
        descrizione: "Tapparella PVC",
        larghezza_mm: 1200,
        altezza_mm: 1400,
        profondita_mm: null,
        quantita: 2,
        prezzo_unitario: 166.32,
        prezzo_totale: 332.64,
        valori_assi: { colore: "tap-grigio" },
        modalita_prezzo: "mq",
        posa_esclusa: false,
        serramento_id: "w1",
        position: 7,
      }),
    });
  });

  it("la posa del listino entra nel prezzo, se la finestra non è in sola fornitura", () => {
    const tapparelle = tipologia("Tapparelle");
    const modello = modelloDi(tapparelle, [accessorio({ family_id: "tap-pvc", valori_assi: { colore: "tap-grigio" } })]);
    const conPosa: ModelloRipreso = {
      ...modello,
      riga: {
        ...modello.riga,
        famiglia: { ...modello.riga.famiglia, manodopera_modalita: "manuale", manodopera_prezzo_vendita: 40, posa_quantita_default: 1 },
      },
    };
    const prezzo = (posa_esclusa: boolean) => {
      const esito = complementoPerFinestra({
        modello: conPosa, tipologia: tapparelle, finestra: { ...finestra, posa_esclusa },
        griglia: [], tariffePrezzi: nessunaTariffa, supplierLines: nessunaLinea, position: 0,
      });
      return "riga" in esito ? [esito.riga.prezzo_unitario, esito.riga.posa_esclusa] : esito.motivo;
    };
    // (332,64 € + 40 € × 2 pezzi) / 2
    expect(prezzo(false)).toEqual([206.32, false]);
    expect(prezzo(true)).toEqual([166.32, true]);
  });

  it("zanzariera a pezzo su una finestra senza misure: si aggiunge; una tapparella a m² chiede prima le misure", () => {
    const senzaMisure = { id: "w2", larghezza_mm: null as number | null, altezza_mm: null as number | null, quantita: 1, posa_esclusa: false };
    const zanzariere = tipologia("Zanzariere");
    const zanzariera = complementoPerFinestra({
      modello: modelloDi(zanzariere, []), tipologia: zanzariere, finestra: senzaMisure,
      griglia: [], tariffePrezzi: nessunaTariffa, supplierLines: nessunaLinea, position: 0,
    });
    expect(zanzariera).toMatchObject({ riga: { tipo: "zanzariera", prezzo_unitario: 120, larghezza_mm: null }, daCompletare: null });

    const tapparelle = tipologia("Tapparelle");
    const tapparella = complementoPerFinestra({
      modello: modelloDi(tapparelle, [accessorio({ family_id: "tap-pvc" })]), tipologia: tapparelle, finestra: senzaMisure,
      griglia: [], tariffePrezzi: nessunaTariffa, supplierLines: nessunaLinea, position: 0,
    });
    expect(tapparella).toMatchObject({ motivo: "misure" });
  });

  it("cassonetto: la larghezza dalla finestra, altezza e profondità dall'ultimo cassonetto del preventivo", () => {
    const cassonetti = tipologia("Cassonetti");
    const precedenti = [
      accessorio({ id: "c1", tipo: "cassonetto", family_id: "cass", larghezza_mm: 1000, altezza_mm: 300, profondita_mm: 240, position: 0 }),
      accessorio({ id: "c2", tipo: "cassonetto", family_id: "cass", larghezza_mm: 900, altezza_mm: 280, profondita_mm: 250, position: 1 }),
    ];
    const conPrecedenti = complementoPerFinestra({
      modello: modelloDi(cassonetti, precedenti), tipologia: cassonetti, finestra: { ...finestra, quantita: 1 },
      griglia: grigliaCassonetti, tariffePrezzi: nessunaTariffa, supplierLines: nessunaLinea, position: 2,
    });
    expect(conPrecedenti).toMatchObject({
      riga: { tipo: "cassonetto", larghezza_mm: 1200, altezza_mm: 280, profondita_mm: 250, prezzo_unitario: 260, listino_voce_id: "g2" },
      daCompletare: null,
    });

    // Il primo cassonetto del preventivo: si aggiunge e si completa sulla riga.
    const primo = complementoPerFinestra({
      modello: modelloDi(cassonetti, []), tipologia: cassonetti, finestra,
      griglia: grigliaCassonetti, tariffePrezzi: nessunaTariffa, supplierLines: nessunaLinea, position: 0,
    });
    expect(primo).toMatchObject({ riga: { larghezza_mm: 1200, altezza_mm: null, profondita_mm: null, prezzo_unitario: null } });
    expect("daCompletare" in primo && primo.daCompletare).toContain("altezza e profondità");

    // Più largo della griglia: il listino non lo fa.
    const largo = complementoPerFinestra({
      modello: modelloDi(cassonetti, precedenti), tipologia: cassonetti, finestra: { ...finestra, larghezza_mm: 2000 },
      griglia: grigliaCassonetti, tariffePrezzi: nessunaTariffa, supplierLines: nessunaLinea, position: 0,
    });
    expect(largo).toMatchObject({ motivo: "fuori_listino" });
  });

  it("dal listino: per una finestra in sola fornitura la posa esce dal prezzo", () => {
    const scelta = {
      family_id: "tap-pvc", family_nome: "Tapparella PVC", larghezza_mm: 1200, altezza_mm: 1400, quantita: 2,
      prezzo_unitario: 191.2, prezzo_posa: 40, griglia_id: null as string | null, valori_assi: { colore: "tap-bianco" }, scelte_assi: {},
      modalita_prezzo: "mq" as const,
    };
    expect(complementoDaScelta(scelta, tipologia("Tapparelle"), false)).toMatchObject({ tipo: "tapparella", prezzo_unitario: 191.2, prezzo_totale: 382.4, posa_esclusa: false });
    expect(complementoDaScelta(scelta, tipologia("Tapparelle"), true)).toMatchObject({ prezzo_unitario: 151.2, prezzo_totale: 302.4, posa_esclusa: true });
  });

  it("se la finestra cambia misure, i complementi che avevano le sue le seguono; quelle ritoccate a mano restano", () => {
    const prima = { larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 };
    const dopo = { larghezza_mm: 1250, altezza_mm: 1400, quantita: 2 };
    expect(misureCheSeguono({ larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 }, prima, dopo)).toEqual({ larghezza_mm: 1250, quantita: 2 });
    expect(misureCheSeguono({ larghezza_mm: 1300, altezza_mm: 1400, quantita: 1 }, prima, dopo)).toEqual({ quantita: 2 });
    // L'altezza di un cassonetto non è quella della finestra.
    expect(misureCheSeguono({ larghezza_mm: 1200, altezza_mm: 280, quantita: 1 }, prima, { ...prima, altezza_mm: 1500 })).toBeNull();
  });

  it("totale rifatto con prezzo e pezzi; duplicando la finestra i complementi vengono con lei", () => {
    expect(conTotale({ prezzo_unitario: 151.2, quantita: 2 }, { quantita: 3 })).toEqual({ quantita: 3, prezzo_totale: 453.6 });
    expect(conTotale({ prezzo_unitario: 151.2, quantita: 2 }, { prezzo_unitario: null })).toEqual({ prezzo_unitario: null, prezzo_totale: 0 });
    expect(conTotale({ prezzo_unitario: 10, quantita: 2 }, { descrizione: "Coibentato" })).toEqual({ descrizione: "Coibentato" });

    const cassonetto = accessorio({
      id: "c1", tipo: "cassonetto", family_id: "cass", larghezza_mm: 1200, altezza_mm: 280, profondita_mm: 250,
      prezzo_unitario: 260, serramento_id: "w1", position: 3,
    });
    const copia = copiaComplemento(cassonetto, "w9", 12);
    expect(copia).toMatchObject({
      tipo: "cassonetto", family_id: "cass", larghezza_mm: 1200, altezza_mm: 280, profondita_mm: 250,
      prezzo_unitario: 260, serramento_id: "w9", position: 12,
    });
    expect(copia).not.toHaveProperty("id");
  });

  it("il tipo viene dal prodotto o dalla tipologia; la testata della finestra dice cosa ha", () => {
    expect(tipoComplemento(tipologia("Tapparelle"), "Blindata alluminio")).toBe("tapparella");
    expect(tipoComplemento(tipologia("Persiane e scuri"), "Scuro in legno")).toBe("scuro");
    expect(tipoComplemento(null, "Zanzariera a rullo")).toBe("zanzariera");
    // Una riga vecchia col tipo sbagliato si legge dal nome del prodotto.
    expect(riepilogoComplementi([
      { tipo: "avvolgibile", descrizione: "Tapparella PVC" },
      { tipo: "zanzariera", descrizione: null },
      { tipo: "zanzariera", descrizione: "Zanzariera a rullo" },
      { tipo: "cassonetto", descrizione: null },
    ])).toBe("Tapparella · Zanzariera ×2 · Cassonetto");
    // Conta la parola che viene prima: un cassonetto «per tapparella» resta un cassonetto.
    expect(tipoComplemento(null, "Cassonetto coibentato per tapparella")).toBe("cassonetto");

    const tipologie = tipologieComplemento(area);
    expect(tipologiaDelComplemento(tipologie, { family_id: "tap-blind", tipo: "avvolgibile" })?.nome).toBe("Tapparelle");
    expect(tipologiaDelComplemento(tipologie, { family_id: null, tipo: "cassonetto" })?.nome).toBe("Cassonetti");
    expect(haGiaComplemento([{ family_id: "tap-blind", tipo: "tapparella" }], tipologia("Tapparelle"))).toBe(true);
    expect(haGiaComplemento([{ family_id: null, tipo: "zanzariera" }], tipologia("Tapparelle"))).toBe(false);
  });
});
