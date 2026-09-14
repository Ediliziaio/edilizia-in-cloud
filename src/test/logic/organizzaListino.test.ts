import { describe, expect, it } from "vitest";
import { costruisciListino, type AreaListino, type MacroListino, type TipologiaListino } from "@/lib/listino/lineeListino";
import { articoloEsempio, asseEsempio, valoreEsempio } from "@/lib/listino/esempiListino";
import {
  areeDaAggiungere,
  leggiImporto,
  leggiPercentuale,
  nomeLineaDaSerie,
  nomeTipologiaLibero,
  prezzoMqPrevalente,
  problemaCopiaTipologia,
  problemaNomeLinea,
  problemaPrezziLinee,
  prodottiSenzaLinee,
  scriviPercentuale,
  tipologiaDaRiusare,
  tipologiaDiArea,
} from "@/lib/listino/organizzaListino";

// Le regole di «+ Area», «+ Tipologia», «+ Linea», «Copia tipologia» e «Prezzi
// delle linee»: ogni caso qui è un errore che il database avrebbe dato in
// inglese, o una linea creata e poi sparita dal listino.

const MACRO: MacroListino[] = [
  { id: "m-serr", nome: "Serramenti", verticali_abilitati: ["serramentista"], tipologia: "serramenti", sort_order: 0 },
  { id: "m-tapp", nome: "Tapparelle", verticali_abilitati: ["serramentista"], tipologia: "serramenti", categoria_tipo: "accessorio", sort_order: 10 },
  // Vuota e senza area: il listino non la mostra.
  { id: "m-vecchia", nome: "Accessori", sort_order: 90 },
];

const linea = (id: string, label: string, pct: number, base = false) =>
  valoreEsempio(id, label, {
    maggiorazione_tipo: pct === 0 ? "none" : "percentuale",
    maggiorazione_valore: pct,
    is_default: base,
  });

const conLinee = (id: string, nome: string) =>
  articoloEsempio(id, nome, {
    macrocategoria_id: "m-serr",
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 600,
    prezzo_base_acquisto: 180,
    axes: [asseEsempio(`asse-${id}`, "Linea", [linea(`${id}-76`, "PVC Salamander 76", 0, true), linea(`${id}-5000`, "PVC Aluplast Ideal 5000", -8)])],
  });

const FAMIGLIE = [
  conLinee("f1", "Finestra 1 Anta"),
  conLinee("f2", "Finestra 2 Ante"),
  // Senza l'asse delle linee: finisce in «Altri articoli».
  articoloEsempio("f3", "Portoncino 1 Anta", { macrocategoria_id: "m-serr", modalita_prezzo_base: "pz", prezzo_base_vendita: 1500 }),
  articoloEsempio("t1", "Tapparella PVC pesante", { macrocategoria_id: "m-tapp", categoria_id: "c-pvc" }),
];

const CATEGORIE = [{ id: "c-pvc", nome: "PVC", macrocategoria_id: "m-tapp", sort_order: 0 }];

const aree: AreaListino[] = costruisciListino(FAMIGLIE, MACRO, CATEGORIE);

function tipologia(nome: string): TipologiaListino {
  const trovata = aree.flatMap((a) => a.tipologie).find((t) => t.nome === nome);
  if (!trovata) throw new Error(`tipologia ${nome} assente`);
  return trovata;
}

describe("aree e tipologie nuove", () => {
  it("scrive la tipologia come la leggono i preventivatori", () => {
    expect(tipologiaDiArea("bagni")).toBe("bagno");
    expect(tipologiaDiArea("serramenti")).toBe("serramenti");
    expect(tipologiaDiArea("fotovoltaico")).toBe("fotovoltaico");
  });

  it("propone solo le aree standard che mancano", () => {
    const nomi = areeDaAggiungere(aree).map((a) => a.nome);
    expect(nomi).toEqual(["Fotovoltaico", "Bagni"]);
  });

  it("«Accessori» in una seconda area prende il nome dell'area invece di dare errore", () => {
    expect(nomeTipologiaLibero("Accessori", [{ nome: "Accessori" }], "Fotovoltaico")).toBe("Accessori Fotovoltaico");
    expect(
      nomeTipologiaLibero("Accessori", [{ nome: "accessori" }, { nome: "Accessori Fotovoltaico" }], "Fotovoltaico"),
    ).toBe("Accessori Fotovoltaico 2");
    expect(nomeTipologiaLibero("Inverter", [{ nome: "Accessori" }], "Fotovoltaico")).toBe("Inverter");
  });

  it("riusa una tipologia vuota che il listino non mostra, mai una visibile", () => {
    expect(tipologiaDaRiusare("ACCESSORI", MACRO, aree)?.id).toBe("m-vecchia");
    expect(tipologiaDaRiusare("Serramenti", MACRO, aree)).toBeNull();
  });
});

describe("linee nuove", () => {
  it("non accetta una linea che la tipologia ha già, scritta in un altro modo", () => {
    expect(problemaNomeLinea("pvc salamander 76", tipologia("Serramenti"), "asse")).toContain("PVC Salamander 76");
    expect(problemaNomeLinea("PVC Salamander bluEvolution 73", tipologia("Serramenti"), "asse")).toBeNull();
    expect(problemaNomeLinea("  ", tipologia("Serramenti"), "asse")).toBe("Scrivi il nome della linea.");
  });

  it("una linea-cartella non si chiama come la tipologia né come l'inizio di un prodotto", () => {
    const tapparelle = tipologia("Tapparelle");
    expect(problemaNomeLinea("Tapparelle", tapparelle, "categoria")).toContain("come la sua tipologia");
    expect(problemaNomeLinea("Tapparella", tapparelle, "categoria")).toContain("Tapparella PVC pesante");
    expect(problemaNomeLinea("PVC", tapparelle, "categoria")).toContain("c'è già la linea");
    expect(problemaNomeLinea("Alluminio coibentato", tapparelle, "categoria")).toBeNull();
  });

  it("conta i prodotti rimasti senza le linee della tipologia", () => {
    expect(prodottiSenzaLinee(tipologia("Serramenti"))).toBe(1);
    expect(prodottiSenzaLinee(tipologia("Tapparelle"))).toBe(0);
  });

  it("dà alla linea della libreria un nome leggibile", () => {
    expect(nomeLineaDaSerie("PVC", "Salamander", "bluEvolution 73")).toBe("PVC Salamander bluEvolution 73");
    expect(nomeLineaDaSerie("PVC", "Generico", "PVC standard")).toBe("PVC standard");
    expect(nomeLineaDaSerie("Alluminio", "Schüco", "AWS 75.SI+")).toBe("Alluminio Schüco AWS 75.SI+");
    expect(nomeLineaDaSerie(null, "Rehau", "Synego")).toBe("Rehau Synego");
  });
});

describe("numeri scritti a mano", () => {
  it("legge gli scostamenti come li scrive chi vende", () => {
    expect(leggiPercentuale("−8")).toBe(-8);
    expect(leggiPercentuale("-8,5")).toBe(-8.5);
    expect(leggiPercentuale("+3")).toBe(3);
    expect(leggiPercentuale("3 %")).toBe(3);
    expect(leggiPercentuale("tre")).toBeNull();
    expect(leggiPercentuale("")).toBeNull();
    expect(scriviPercentuale(-8)).toBe("−8");
    expect(scriviPercentuale(12.5)).toBe("+12,5");
    expect(scriviPercentuale(0)).toBe("0");
    expect(scriviPercentuale(null)).toBe("");
  });

  it("legge gli importi con virgola e punto delle migliaia", () => {
    expect(leggiImporto("600")).toBe(600);
    expect(leggiImporto("600,50")).toBe(600.5);
    expect(leggiImporto("1.250")).toBe(1250);
    expect(leggiImporto("1.250,50")).toBe(1250.5);
    expect(leggiImporto("12.5")).toBe(12.5);
    expect(leggiImporto("€ 480")).toBe(480);
    expect(leggiImporto("-3")).toBeNull();
    expect(leggiImporto("")).toBeNull();
  });
});

describe("copia di una tipologia", () => {
  const vuota = { nome: "", suffisso: "", variazione: "", conProdotti: true };

  it("chiede un nome libero e, se copia i prodotti, un testo per distinguerli", () => {
    const serramenti = tipologia("Serramenti");
    expect(problemaCopiaTipologia(vuota, serramenti, MACRO)).toBe("Scrivi il nome della nuova tipologia.");
    expect(problemaCopiaTipologia({ ...vuota, nome: "serramenti" }, serramenti, MACRO)).toContain("Esiste già");
    expect(problemaCopiaTipologia({ ...vuota, nome: "Serramenti alluminio" }, serramenti, MACRO)).toContain(
      "cosa aggiungere ai nomi",
    );
    expect(problemaCopiaTipologia({ ...vuota, nome: "Serramenti alluminio", conProdotti: false }, serramenti, MACRO)).toBeNull();
    expect(
      problemaCopiaTipologia({ ...vuota, nome: "Serramenti alluminio", suffisso: "Alluminio", variazione: "+15" }, serramenti, MACRO),
    ).toBeNull();
    expect(
      problemaCopiaTipologia({ ...vuota, nome: "Serramenti alluminio", suffisso: "Alluminio", variazione: "molto" }, serramenti, MACRO),
    ).toContain("come numero");
  });
});

describe("prezzi delle linee di una tipologia", () => {
  const linee = [
    { nome: "PVC Salamander 76", pct: "0", attiva: true },
    { nome: "PVC Aluplast Ideal 5000", pct: "−8", attiva: true },
  ];

  it("non lascia spegnere tutte le linee né salvare prezzi senza senso", () => {
    expect(problemaPrezziLinee(linee, "", "")).toBeNull();
    expect(problemaPrezziLinee(linee.map((l) => ({ ...l, attiva: false })), "", "")).toBe("Lascia accesa almeno una linea.");
    expect(problemaPrezziLinee([{ ...linee[0], pct: "circa otto" }], "", "")).toContain("come numero");
    expect(problemaPrezziLinee(linee, "0", "")).toContain("maggiore di zero");
    expect(problemaPrezziLinee(linee, "500", "620")).toContain("margine sarebbe negativo");
    expect(problemaPrezziLinee(linee, "620", "190")).toBeNull();
  });

  it("propone il prezzo al mq che hanno i prodotti a metro quadro", () => {
    expect(prezzoMqPrevalente(tipologia("Serramenti"))).toEqual({ vendita: 600, acquisto: 180, prodotti: 2 });
  });
});
