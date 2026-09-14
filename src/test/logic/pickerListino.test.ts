import { describe, expect, it } from "vitest";
import {
  areaDelPreventivatore,
  assiDaScegliere,
  cercaNellArea,
  preferenzeDaRiga,
  preselezioneRiga,
  prezzoIndicativo,
  selezioneIniziale,
  tipologieProposte,
} from "@/lib/serramenti/pickerListino";
import { articoloEsempio, asseEsempio, fotovoltaicoPerComponente, valoreEsempio } from "@/lib/listino/esempiListino";
import type { MacroListino, RigaListino } from "@/lib/listino/lineeListino";
import type { FamilyWithAxes } from "@/types/articleFamily";

// Il caso di Renova: nel preventivatore serramenti la ricerca «inverter»
// trovava gli inverter del fotovoltaico. Un'azienda che vende tutti e due.
function aziendaMista() {
  const fv = fotovoltaicoPerComponente();
  const linee = (id: string) =>
    asseEsempio(`${id}-linea`, "Linea", [
      valoreEsempio(`${id}-sal`, "PVC Salamander 76", { is_default: true }),
      valoreEsempio(`${id}-alu`, "PVC Aluplast Ideal 5000", { maggiorazione_tipo: "percentuale", maggiorazione_valore: -8 }),
    ]);
  const serramento = (id: string, nome: string, extra: Partial<FamilyWithAxes> = {}) =>
    articoloEsempio(id, nome, {
      macrocategoria_id: "m-serramenti",
      modalita_prezzo_base: "mq",
      prezzo_base_vendita: 600,
      axes: [linee(id)],
      ...extra,
    });
  const famiglie: FamilyWithAxes[] = [
    ...fv.famiglie,
    serramento("f2a", "Finestra 2 Ante", { codice: "F2A" }),
    serramento("pf1", "Porta Finestra 1 Anta"),
    serramento("nascosta", "Finestra nascosta", { mostra_preventivo: false }),
    articoloEsempio("tap", "Tapparella PVC", { macrocategoria_id: "m-tapparelle", modalita_prezzo_base: "mq", prezzo_base_vendita: 90 }),
    articoloEsempio("epiq", "Epiq Finestra", { macrocategoria_id: "m-epiq", prezzo_base_vendita: 450 }),
    articoloEsempio("blind", "Porta blindata", { macrocategoria_id: "m-blindate", prezzo_base_vendita: 1500 }),
    // Senza tipologia: non è fra le schede, ma cercandolo si trova.
    articoloEsempio("zoccolo", "Zoccolino su misura", { prezzo_base_vendita: 35 }),
  ];
  const macrocategorie: MacroListino[] = [
    ...fv.macrocategorie,
    { id: "m-serramenti", nome: "Serramenti", verticali_abilitati: ["serramentista"], categoria_tipo: "principale" },
    { id: "m-tapparelle", nome: "Tapparelle", verticali_abilitati: ["serramentista"], categoria_tipo: "accessorio" },
    // Senza collegamenti ma coi serramenti dentro, come le linee di Best Infissi: si propone.
    { id: "m-epiq", nome: "Epiq", verticali_abilitati: [], categoria_tipo: "principale" },
    // Tolta dai preventivi.
    { id: "m-blindate", nome: "Porte blindate", verticali_abilitati: ["serramentista"], categoria_tipo: "principale", attivo: false },
  ];
  return { famiglie, macrocategorie, categorie: fv.categorie };
}

const nomiProdotti = (risultati: ReturnType<typeof cercaNellArea>) =>
  [...new Set(risultati.map((r) => r.riga.famiglia.nome))].sort();

describe("aggiungi dal listino nel preventivo serramenti", () => {
  const { famiglie, macrocategorie, categorie } = aziendaMista();
  const area = areaDelPreventivatore(famiglie, macrocategorie, categorie, "principale");

  it("propone solo le tipologie dell'area Serramenti, mai il fotovoltaico", () => {
    expect(area?.chiave).toBe("serramenti");
    expect(tipologieProposte(area).map((t) => t.nome).sort()).toEqual(["Epiq", "Serramenti"]);
    expect(cercaNellArea(area, "inverter")).toEqual([]);
    expect(cercaNellArea(area, "caldaia")).toEqual([]);
    expect(cercaNellArea(area, "batteria")).toEqual([]);
  });

  it("cerca per nome, codice e linea, ma non fra i prodotti tolti dai preventivi", () => {
    expect(nomiProdotti(cercaNellArea(area, "F2A"))).toEqual(["Finestra 2 Ante"]);
    const aluplast = cercaNellArea(area, "aluplast");
    expect(new Set(aluplast.map((r) => r.linea.nome))).toEqual(new Set(["PVC Aluplast Ideal 5000"]));
    expect(nomiProdotti(aluplast)).toEqual(["Finestra 2 Ante", "Porta Finestra 1 Anta"]);
    // La scheda deve poter scrivere «Serramenti · PVC Aluplast Ideal 5000»: la
    // tipologia arriva con tutte e due le linee, non solo quella trovata.
    expect(aluplast.every((r) => r.tipologia.linee.length === 2)).toBe(true);
    expect(cercaNellArea(area, "nascosta")).toEqual([]);
    expect(cercaNellArea(area, "blindata")).toEqual([]);
    expect(cercaNellArea(area, "f")).toEqual([]);
    // Un prodotto senza tipologia non ha una scheda, ma si trova.
    expect(nomiProdotti(cercaNellArea(area, "zoccolino"))).toEqual(["Zoccolino su misura"]);
    expect(tipologieProposte(area).some((t) => t.nome === "Senza tipologia")).toBe(false);
  });

  it("gli accessori sono un'altra lista", () => {
    const accessori = areaDelPreventivatore(famiglie, macrocategorie, categorie, "accessorio");
    expect(tipologieProposte(accessori).map((t) => t.nome)).toEqual(["Tapparelle"]);
    expect(cercaNellArea(accessori, "finestra")).toEqual([]);
  });

  it("la linea scelta resta scelta e il prezzo della scheda è quello della linea", () => {
    const serramenti = tipologieProposte(area).find((t) => t.nome === "Serramenti");
    const aluplast = serramenti?.linee.find((l) => l.nome === "PVC Aluplast Ideal 5000");
    const riga = aluplast?.righe.find((r) => r.famiglia.nome === "Finestra 2 Ante");
    expect(riga).toBeDefined();
    if (!riga) return;
    expect(preselezioneRiga(riga)).toEqual({ linea: "f2a-alu" });
    expect(prezzoIndicativo(riga)?.alMetroQuadro).toBe(true);
    expect(prezzoIndicativo(riga)?.prezzo).toBeCloseTo(552, 6);
    const salamander = serramenti?.linee.find((l) => l.nome === "PVC Salamander 76")?.righe[0];
    expect(salamander && prezzoIndicativo(salamander)?.prezzo).toBeCloseTo(600, 6);
  });

  it("un asse con tutti i valori spenti non si fa scegliere", () => {
    const assi = [
      { id: "spento", values: [{ attivo: false }] },
      { id: "acceso", values: [{ attivo: false }, { attivo: true }] },
    ];
    expect(assiDaScegliere(assi).map((a) => a.id)).toEqual(["acceso"]);
  });

  it("la linea della scheda scelta vince sulle scelte dell'ultima posizione", () => {
    const aluplast = tipologieProposte(area)
      .find((t) => t.nome === "Serramenti")
      ?.linee.find((l) => l.nome === "PVC Aluplast Ideal 5000")
      ?.righe.find((r) => r.famiglia.id === "f2a");
    expect(aluplast).toBeDefined();
    if (!aluplast) return;
    const conSalamander = preferenzeDaRiga({ family_id: "pf1", valori_assi: { linea: "pf1-sal" } }, famiglie);
    expect(conSalamander.linea?.label).toBe("PVC Salamander 76");
    expect(selezioneIniziale(aluplast, conSalamander).valori).toEqual({ linea: "f2a-alu" });
  });

  it("configurazione rapida: la posizione nuova riparte dalle scelte dell'ultima", () => {
    const colore = (id: string) =>
      asseEsempio(`${id}-colore`, "Colore", [
        valoreEsempio(`${id}-bianco`, "Bianco", { is_default: true }),
        valoreEsempio(`${id}-std`, "Colore Standard", { opzioni: ["21 - Nussbaum (noce)", "51 - Golden Oak"] }),
        valoreEsempio(`${id}-fuori`, "Fuori Standard", { attivo: false }),
      ]);
    const vetro = (id: string) =>
      asseEsempio(`${id}-vetro`, "Vetro", [
        valoreEsempio(`${id}-doppio`, "Doppio vetro stratificato", { is_default: true }),
        valoreEsempio(`${id}-triplo`, "Triplo vetro stratificato"),
      ]);
    const finestra = articoloEsempio("f1", "Finestra 1 Anta", { axes: [colore("f1"), vetro("f1")] });
    const porta = articoloEsempio("pf2", "Porta Finestra 2 Ante", { axes: [colore("pf2"), vetro("pf2")] });
    const riga = { chiave: "pf2", famiglia: porta, linea: null, asseCodice: null } as RigaListino;

    // L'ultima posizione: noce fuori e triplo vetro. La porta dopo parte uguale.
    const preferenze = preferenzeDaRiga(
      { family_id: "f1", valori_assi: { colore: "f1-std", vetro: "f1-triplo" }, scelte_assi: { colore: "21 - Nussbaum (noce)" } },
      [finestra, porta],
    );
    expect(selezioneIniziale(riga, preferenze)).toEqual({
      valori: { colore: "pf2-std", vetro: "pf2-triplo" },
      voci: { colore: "21 - Nussbaum (noce)" },
    });
    // Senza posizioni prima: i valori di serie.
    expect(selezioneIniziale(riga).valori).toEqual({ colore: "pf2-bianco", vetro: "pf2-doppio" });
    // Un valore spento nel prodotto nuovo non si riprende.
    const spento = preferenzeDaRiga({ family_id: "f1", valori_assi: { colore: "f1-fuori" } }, [finestra, porta]);
    expect(selezioneIniziale(riga, spento).valori.colore).toBe("pf2-bianco");
  });
});
