import { describe, expect, it } from "vitest";
import { costruisciListino, type AreaListino, type MacroListino, type TipologiaListino } from "@/lib/listino/lineeListino";
import { articoloEsempio, asseEsempio, valoreEsempio } from "@/lib/listino/esempiListino";
import {
  areeDaAggiungere,
  datiAsseVarianti,
  formVariantePronta,
  formVarianti,
  leggiImporto,
  leggiPercentuale,
  nomeDiceCodice,
  nomeLineaDaSerie,
  nomeTipologiaLibero,
  percentualeVariante,
  prezzoMqPrevalente,
  problemaCopiaTipologia,
  problemaNomeLinea,
  problemaNuovaVariante,
  problemaPrezziLinee,
  problemaVarianti,
  prodottiSenzaLinee,
  riepilogoVarianti,
  scriviPercentuale,
  tipologiaDaRiusare,
  tipologiaDiArea,
  VARIANTI_PRONTE_SERRAMENTI,
  type AsseVariante,
  type VarianteForm,
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

describe("colori e varianti di una tipologia", () => {
  // Il caso di Renova: 22 finestre col colore fuori standard a zero, l'alzante a
  // +15% e col colore standard rinominato «pellicola solo un lato».
  const MACRO_VARIANTI: MacroListino[] = [
    { id: "m-var", nome: "Serramenti", verticali_abilitati: ["serramentista"], tipologia: "serramenti", sort_order: 0 },
  ];
  const percentuale = (valore: number) => ({ maggiorazione_tipo: "percentuale" as const, maggiorazione_valore: valore });
  const coloreFinestra = (id: string) =>
    asseEsempio(`colore-${id}`, "Colore", [
      valoreEsempio(`${id}-bianco`, "Bianco", { is_default: true }),
      valoreEsempio(`${id}-std`, "Colore Standard"),
      valoreEsempio(`${id}-fuori`, "Colore Fuori Standard"),
    ]);
  const famiglie = [
    articoloEsempio("v1", "Finestra 1 Anta", {
      macrocategoria_id: "m-var",
      axes: [
        asseEsempio("linea-v1", "Linea", [valoreEsempio("v1-76", "PVC Salamander 76", { is_default: true })]),
        coloreFinestra("v1"),
      ],
    }),
    articoloEsempio("v2", "Finestra 2 Ante", { macrocategoria_id: "m-var", axes: [coloreFinestra("v2")] }),
    articoloEsempio("v3", "Alzante scorrevole", {
      macrocategoria_id: "m-var",
      axes: [
        asseEsempio("colore-v3", "Colore", [
          valoreEsempio("v3-bianco", "Bianco", { is_default: true }),
          valoreEsempio("v3-pell", "pellicola solo un lato", { valore: "colore_standard", ...percentuale(10) }),
          valoreEsempio("v3-fuori", "Colore Fuori Standard", percentuale(15)),
        ]),
      ],
    }),
    // Senza varianti: con «metti in tutti» le riceve.
    articoloEsempio("v4", "Portoncino", { macrocategoria_id: "m-var" }),
  ];
  const serramenti = (): TipologiaListino => {
    const trovata = costruisciListino(famiglie, MACRO_VARIANTI, [])
      .flatMap((a) => a.tipologie)
      .find((t) => t.macrocategoriaId === "m-var");
    if (!trovata) throw new Error("tipologia di prova mancante");
    return trovata;
  };

  it("riassume ogni variabile sui prodotti, linee escluse, e dice dove non sono d'accordo", () => {
    const riepilogo = riepilogoVarianti(serramenti());
    expect(riepilogo.prodotti).toBe(4);
    expect(riepilogo.assi.map((a) => a.chiave)).toEqual(["colore"]);
    const [colore] = riepilogo.assi;
    expect(colore.prodotti).toBe(3);
    expect(Object.fromEntries(colore.valori.map((v) => [v.nome, v.prodotti]))).toEqual({
      Bianco: 3,
      "Colore Standard": 2,
      "Colore Fuori Standard": 3,
      "pellicola solo un lato": 1,
    });
    const fuori = colore.valori.find((v) => v.chiave === "colore_fuori_standard");
    expect(fuori?.tipo).toBe("none");
    expect(fuori?.diverse).toEqual([
      { testo: "nessuna", prodotti: 2 },
      { testo: "+15% · acquisto invariato", prodotti: 1 },
    ]);
    expect(colore.valori.find((v) => v.base)?.nome).toBe("Bianco");
    expect(colore.baseDiversaIn).toBe(0);
  });

  it("i modelli standard trovano un valore dal codice, ma non quello rinominato", () => {
    const riepilogo = riepilogoVarianti(serramenti());
    expect(nomeDiceCodice("Vetro Antisonoro", "antisonoro")).toBe(true);
    expect(nomeDiceCodice("Bianco RAL 9010", "bianco")).toBe(true);
    expect(nomeDiceCodice("pellicola solo un lato", "colore_standard")).toBe(false);
    expect(percentualeVariante(riepilogo, "colore", "colore_standard")).toBe(0);
    expect(percentualeVariante(riepilogo, "tipologia_vetro", "antisonoro")).toBeNull();
  });

  it("manda solo quello che cambia, e aggiunge dove manca solo se lo si chiede", () => {
    const [colore] = riepilogoVarianti(serramenti()).assi;
    const iniziali = formVarianti(colore);
    const fuori15 = iniziali.map((v) => (v.chiave === "colore_fuori_standard" ? { ...v, vendita: "15", acquisto: "15" } : v));

    expect(datiAsseVarianti(colore, iniziali, iniziali, false, 4)).toBeNull();
    expect(datiAsseVarianti(colore, iniziali, fuori15, false, 4)).toEqual({
      chiave: "colore",
      nome: "Colore",
      base: "Bianco",
      allineaBase: false,
      completa: false,
      valori: [
        {
          nome: "Colore Fuori Standard",
          tipo: "percentuale",
          vendita: 15,
          acquisto: 15,
          attivo: true,
          aggiorna: true,
          opzioni: [],
          aggiornaOpzioni: false,
        },
      ],
    });

    // «Metti in tutti» col portoncino senza colore: partono tutti i valori, ma
    // dove ci sono già non si riscrivono.
    const completa = datiAsseVarianti(colore, iniziali, iniziali, true, 4);
    expect(completa?.valori).toHaveLength(4);
    expect(completa?.valori.every((v) => !v.aggiorna)).toBe(true);

    const pellicolaDiSerie = iniziali.map((v) => ({ ...v, base: v.chiave === "pellicola_solo_un_lato" }));
    expect(problemaVarianti(colore, iniziali, pellicolaDiSerie, false)).toContain("manca in 2 prodotti");
    expect(problemaVarianti(colore, iniziali, pellicolaDiSerie, true)).toBeNull();
    expect(datiAsseVarianti(colore, iniziali, pellicolaDiSerie, true, 4)?.allineaBase).toBe(true);
    // Riallineare lo stesso valore di serie quando i prodotti non sono d'accordo.
    expect(datiAsseVarianti(colore, iniziali, iniziali, false, 4, true)).toMatchObject({ allineaBase: true, valori: [] });
  });

  it("non lascia salvare valori senza senso", () => {
    const [colore] = riepilogoVarianti(serramenti()).assi;
    const iniziali = formVarianti(colore);
    const nuovo: VarianteForm = {
      chiave: null,
      nome: "Antracite RAL 7016",
      tipo: "percentuale",
      vendita: "20",
      acquisto: "20",
      attivo: true,
      base: false,
      prodotti: 0,
      opzioni: [],
    };
    expect(problemaVarianti(colore, iniziali, [...iniziali, nuovo], false)).toContain("Metti i valori mancanti");
    expect(problemaVarianti(colore, iniziali, [...iniziali, nuovo], true)).toBeNull();
    expect(problemaVarianti(colore, iniziali, [...iniziali, { ...nuovo, nome: "colore standard" }], true)).toContain("due volte");
    expect(problemaVarianti(colore, iniziali, iniziali.map((v) => ({ ...v, attivo: false })), false)).toBe(
      "Colore: lascia acceso almeno un valore.",
    );
    expect(problemaVarianti(colore, iniziali, iniziali.map((v) => (v.base ? { ...v, attivo: false } : v)), false)).toContain("è spento");
    expect(problemaVarianti(colore, iniziali, iniziali.map((v, i) => (i === 0 ? { ...v, vendita: "circa dieci" } : v)), false)).toContain(
      "come numero",
    );
    expect(problemaVarianti(colore, iniziali, iniziali.map((v, i) => (i === 0 ? { ...v, vendita: "-100" } : v)), false)).toContain(
      "azzererebbe",
    );
  });

  it("tiene l'elenco dei colori di ogni fascia, lo manda solo se cambia e dice dove i prodotti non sono d'accordo", () => {
    const elenco = ["51 Golden Oak", "21 Nussbaum"];
    const finestra = (id: string, nome: string, voci: string[]) =>
      articoloEsempio(id, nome, {
        macrocategoria_id: "m-var",
        axes: [
          asseEsempio(`colore-${id}`, "Colore", [
            valoreEsempio(`${id}-bianco`, "Bianco", { is_default: true }),
            valoreEsempio(`${id}-std`, "Colore Standard", { opzioni: voci }),
          ]),
        ],
      });
    const trovata = costruisciListino(
      [finestra("e1", "Finestra 1 Anta", elenco), finestra("e2", "Finestra 2 Ante", elenco), finestra("e3", "Alzante", [])],
      MACRO_VARIANTI,
      [],
    )
      .flatMap((a) => a.tipologie)
      .find((t) => t.macrocategoriaId === "m-var");
    if (!trovata) throw new Error("tipologia di prova mancante");

    const [colore] = riepilogoVarianti(trovata).assi;
    const standard = colore.valori.find((v) => v.chiave === "colore_standard");
    expect(standard?.opzioni).toEqual(elenco);
    expect(standard?.opzioniDiverse).toBe(1);

    const iniziali = formVarianti(colore);
    expect(datiAsseVarianti(colore, iniziali, iniziali, false, 3)).toBeNull();
    const conMooreiche = iniziali.map((v) =>
      v.chiave === "colore_standard" ? { ...v, opzioni: [...v.opzioni, "25 Mooreiche"] } : v,
    );
    // Cambia solo l'elenco: le maggiorazioni dei prodotti non si riscrivono.
    expect(datiAsseVarianti(colore, iniziali, conMooreiche, false, 3)?.valori).toEqual([
      {
        nome: "Colore Standard",
        tipo: "none",
        vendita: 0,
        acquisto: 0,
        attivo: true,
        aggiorna: false,
        opzioni: [...elenco, "25 Mooreiche"],
        aggiornaOpzioni: true,
      },
    ]);
    const troppoLunga = iniziali.map((v) => (v.chiave === "colore_standard" ? { ...v, opzioni: ["x".repeat(121)] } : v));
    expect(problemaVarianti(colore, iniziali, troppoLunga, false)).toContain("più lunga");
  });

  it("aggiunge a tutti i prodotti una variante che non hanno, anche da un modello pronto", () => {
    const { assi } = riepilogoVarianti(serramenti());
    expect(problemaNuovaVariante("colore", assi)).toBe("C'è già la variante «Colore».");
    expect(problemaNuovaVariante("Linea", assi)).toContain("+ Linea");
    expect(problemaNuovaVariante("  ", assi)).toContain("Scrivi il nome");
    expect(problemaNuovaVariante("Maniglia", assi)).toBeNull();

    const maniglia = VARIANTI_PRONTE_SERRAMENTI.find((p) => p.chiave === "maniglia") ?? null;
    const nuova: AsseVariante = { chiave: "maniglia", nome: "Maniglia", prodotti: 0, obbligatorio: false, baseDiversaIn: 0, valori: [] };
    const righe = formVariantePronta(maniglia);
    expect(problemaVarianti(nuova, [], righe, true)).toBeNull();
    expect(datiAsseVarianti(nuova, [], righe, true, 4)).toMatchObject({
      chiave: "maniglia",
      base: "Standard",
      allineaBase: true,
      completa: true,
      valori: [
        { nome: "Standard", aggiorna: true },
        { nome: "Con chiave", aggiorna: true },
      ],
    });
    // Senza modello pronto si parte da una riga da scrivere.
    expect(problemaVarianti(nuova, [], formVariantePronta(null), true)).toContain("nome del valore nuovo");
  });
});
