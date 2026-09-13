import { describe, expect, it } from "vitest";
import {
  costruisciListino,
  economiaRiga,
  filtraListino,
  lineaDiRiferimento,
  type AreaListino,
  type TipologiaListino,
} from "@/lib/listino/lineeListino";
import { areaDiVerticale, riconosciTipologiaStandard, sinonimiVerticale, AREE_STANDARD } from "@/lib/listino/areeStandard";
import {
  bagni,
  categorieDaUnArticolo,
  categorieSenzaMacrocategoria,
  fotovoltaicoPerComponente,
  lineeComeMacrocategorie,
  lineeSullAsse,
  serramentistaStandard,
  type ListinoEsempio,
} from "@/lib/listino/esempiListino";

// Il listino si legge area → tipologia → linea → prodotti. Ogni esempio
// riproduce uno dei modi in cui le aziende hanno davvero costruito il proprio:
// se uno smette di tornare, quell'azienda riapre la pagina e non ritrova il
// suo listino.

function listino(esempio: ListinoEsempio): AreaListino[] {
  return costruisciListino(esempio.famiglie, esempio.macrocategorie, esempio.categorie);
}

const nomi = <T extends { nome: string }>(lista: T[] | undefined) => (lista ?? []).map((x) => x.nome);

function tipologia(aree: AreaListino[], nome: string): TipologiaListino {
  const trovata = aree.flatMap((a) => a.tipologie).find((t) => t.nome === nome);
  if (!trovata) throw new Error(`tipologia ${nome} assente`);
  return trovata;
}

describe("aree e tipologie standard", () => {
  it("riconosce l'area dai modi in cui è scritta nei dati", () => {
    expect(areaDiVerticale("serramentista")).toBe("serramenti");
    expect(areaDiVerticale("serramenti")).toBe("serramenti");
    expect(areaDiVerticale("bagno")).toBe("bagni");
    expect(areaDiVerticale("generico")).toBeNull();
    expect(areaDiVerticale("")).toBeNull();
  });

  it("il preventivatore serramenti trova le tipologie etichettate in tutti i modi", () => {
    expect(sinonimiVerticale("serramentista")).toEqual(
      expect.arrayContaining(["serramentista", "serramenti"]),
    );
    expect(sinonimiVerticale("fotovoltaico")).toEqual(["fotovoltaico"]);
    expect(sinonimiVerticale("sconosciuto")).toEqual(["sconosciuto"]);
  });

  it("riconosce una tipologia standard anche col nome dell'azienda", () => {
    const serramenti = AREE_STANDARD[0];
    expect(riconosciTipologiaStandard(serramenti, "Avvolgibili", null)?.nome).toBe("Tapparelle");
    expect(riconosciTipologiaStandard(serramenti, "Tapparelle PVC", null)?.nome).toBe("Tapparelle");
    expect(riconosciTipologiaStandard(serramenti, "Accessori Serramenti", null)?.nome).toBe("Accessori");
    expect(riconosciTipologiaStandard(serramenti, "PIU' LUCE", null)).toBeNull();
    const fotovoltaico = AREE_STANDARD[1];
    expect(riconosciTipologiaStandard(fotovoltaico, "Pannelli solari top", "pannello")?.nome).toBe("Moduli fotovoltaici");
  });
});

describe("il serramentista con le tipologie standard", () => {
  const aree = listino(serramentistaStandard());

  it("divide le aree e le ordina per numero di prodotti", () => {
    expect(aree.map((a) => [a.nome, a.articoli])).toEqual([
      ["Serramenti", 32],
      ["Fotovoltaico", 6],
    ]);
    expect(aree[0].standard?.preventivatore).toBe("Preventivatore serramenti");
  });

  it("mette le tipologie nell'ordine dell'azienda, gli accessori in fondo e i senza tipologia per ultimi", () => {
    expect(nomi(aree[0].tipologie)).toEqual([
      "Serramenti",
      "Persiane e scuri",
      "Tapparelle",
      "Zanzariere",
      "Cassonetti",
      "Accessori",
      "Senza tipologia",
    ]);
    expect(nomi(aree[0].mancanti)).toEqual(["Porte da interno", "Porte blindate"]);
    expect(nomi(aree[1].tipologie)).toEqual(["Moduli fotovoltaici", "Inverter", "Sistemi di accumulo", "Senza tipologia"]);
    expect(nomi(aree[1].mancanti)).toEqual(["Ottimizzatori", "Colonnine di ricarica", "Strutture e zavorre", "Accessori"]);
  });

  it("nei serramenti le linee dell'asse vengono prima, poi le categorie, poi il resto", () => {
    const serramenti = tipologia(aree, "Serramenti");
    expect(nomi(serramenti.linee)).toEqual(["PVC Salamander 76", "PVC Aluplast Ideal 5000", "Legno Rovere 68", "Altri articoli"]);
    expect(serramenti.linee.map((l) => l.righe.length)).toEqual([16, 16, 3, 1]);
    // 16 tipologie in due linee contano una volta sola.
    expect(serramenti.articoli).toBe(20);
    expect(serramenti.standard?.nome).toBe("Serramenti");
    expect(serramenti.collegamento).toBe("area");
  });

  it("dice di quanto si scosta ogni linea dell'asse, e la linea spenta non compare", () => {
    const serramenti = tipologia(aree, "Serramenti");
    const [salamander, aluplast] = serramenti.linee;
    expect(salamander).toMatchObject({ fonte: "asse", scostamentoPct: 0, base: true });
    expect(aluplast).toMatchObject({ fonte: "asse", scostamentoPct: -8, base: false });
    expect(lineaDiRiferimento(serramenti)?.nome).toBe("PVC Salamander 76");
    expect(serramenti.linee.some((l) => l.nome === "Linea base")).toBe(false);
  });

  it("tapparelle e zanzariere hanno le loro linee, anche con un solo prodotto", () => {
    expect(nomi(tipologia(aree, "Tapparelle").linee)).toEqual(["PVC", "Alluminio coibentato"]);
    const zanzariere = tipologia(aree, "Zanzariere");
    expect(nomi(zanzariere.linee)).toEqual(["A molla", "Plissé"]);
    expect(zanzariere.linee[1].righe.map((r) => r.famiglia.nome)).toEqual(["Zanzariera plissé"]);
  });

  it("una tipologia senza linee ha una linea sola col suo nome; una appena creata è vuota ma si vede", () => {
    expect(nomi(tipologia(aree, "Cassonetti").linee)).toEqual(["Cassonetti"]);
    expect(tipologia(aree, "Cassonetti").linee[0].fonte).toBe("altri");
    expect(tipologia(aree, "Persiane e scuri")).toMatchObject({ articoli: 0, linee: [] });
  });

  it("un inverter marcato generico resta con gli inverter", () => {
    expect(tipologia(aree, "Inverter").linee[0].righe.map((r) => r.famiglia.id)).toEqual(["fv-inv-1", "fv-inv-2"]);
  });

  it("dà a ogni riga una chiave unica anche quando la tipologia compare in più linee", () => {
    const chiavi = aree.flatMap((a) => a.tipologie.flatMap((t) => t.linee.flatMap((l) => l.righe.map((r) => r.chiave))));
    expect(new Set(chiavi).size).toBe(chiavi.length);
  });
});

describe("economiaRiga — il prezzo della linea", () => {
  const aree = listino(serramentistaStandard());
  const serramenti = tipologia(aree, "Serramenti");
  const [salamander, aluplast, , altri] = serramenti.linee;
  const riga = (righe: typeof altri.righe, nome: string) => {
    const trovata = righe.find((r) => r.famiglia.nome === nome);
    if (!trovata) throw new Error(`riga ${nome} assente`);
    return trovata;
  };

  it("usa il prezzo base nella linea di riferimento, al metro quadro", () => {
    const e = economiaRiga(riga(salamander.righe, "Finestra 1 Anta"));
    expect(e).toMatchObject({ vendita: 520, acquisto: 160, unita: "mq", griglia: false });
    expect(e.marginePct).toBeCloseTo(69.23, 2);
  });

  it("applica lo scostamento della linea a vendita e costo, come il preventivatore", () => {
    const e = economiaRiga(riga(aluplast.righe, "Finestra 1 Anta"));
    expect(e.vendita).toBe(478.4);
    expect(e.acquisto).toBe(147.2);
    expect(e.marginePct).toBeCloseTo(69.23, 2);
  });

  it("al pezzo per chi si vende al pezzo", () => {
    const cassonetto = riga(tipologia(aree, "Cassonetti").linee[0].righe, "Cassonetto termoisolato PVC");
    const e = economiaRiga(cassonetto);
    expect(e).toMatchObject({ vendita: 95, acquisto: 38, unita: "pz" });
    expect(e.marginePct).toBeCloseTo(60, 5);
  });

  it("senza prezzo di vendita non inventa un margine", () => {
    const modulo = riga(tipologia(aree, "Moduli fotovoltaici").linee[0].righe, "Modulo 500 Wp bifacciale");
    expect(economiaRiga(modulo)).toMatchObject({ vendita: 0, acquisto: 118, marginePct: null });
  });

  it("una griglia L×H senza misure non ha un prezzo da mostrare", () => {
    expect(economiaRiga(riga(altri.righe, "Porta d'ingresso a 2 ante"))).toMatchObject({ vendita: null, griglia: true });
  });
});

describe("i listini costruiti in altri modi", () => {
  it("linee messe al posto delle tipologie: restano tipologie, con le loro categorie vere come linee", () => {
    const aree = listino(lineeComeMacrocategorie());
    expect(aree.map((a) => a.nome)).toEqual(["Serramenti"]);
    expect(nomi(aree[0].tipologie)).toEqual(["Linea Classica", "Linea Design", "Zanzariere", "Tapparelle PVC"]);
    const classica = tipologia(aree, "Linea Classica");
    expect(nomi(classica.linee)).toEqual(["Finestre", "Porte-finestra", "Altri articoli"]);
    expect(classica.linee.map((l) => l.righe.length)).toEqual([2, 2, 1]);
    expect(classica.collegamento).toBe("tutte");
    // La categoria che si chiama come la macrocategoria non è una linea.
    expect(nomi(tipologia(aree, "Tapparelle PVC").linee)).toEqual(["Tapparelle PVC"]);
    expect(tipologia(aree, "Tapparelle PVC").standard?.nome).toBe("Tapparelle");
    expect(nomi(aree[0].mancanti)).toContain("Serramenti");
  });

  it("le categorie nate con l'articolo non fanno cartelle, nemmeno quelle rimaste vuote", () => {
    const aree = listino(categorieDaUnArticolo());
    const club = tipologia(aree, "Club");
    expect(nomi(club.linee)).toEqual(["Club"]);
    expect(club.linee[0].righe).toHaveLength(3);
  });

  it("bagni: vasche divise in linea tipo 1 e tipo 2", () => {
    const aree = listino(bagni());
    expect(aree.map((a) => a.nome)).toEqual(["Bagni"]);
    expect(aree[0].standard?.preventivatore).toBeNull();
    expect(nomi(aree[0].tipologie)).toEqual(["Vasche", "Box doccia", "Rubinetteria"]);
    const vasche = tipologia(aree, "Vasche");
    expect(nomi(vasche.linee)).toEqual(["Linea vasca Tipo 1", "Linea vasca Tipo 2"]);
    expect(vasche.linee[0].righe.map((r) => r.famiglia.nome)).toEqual(["Vasca ovale 170×75", "Vasca quadrata 140×140"]);
    expect(nomi(aree[0].mancanti)).toEqual(["Piatti doccia", "Sanitari", "Mobili bagno", "Rivestimenti", "Accessori"]);
  });

  it("fotovoltaico per componente: area dai dati, orfani in Senza tipologia, macrocategoria vuota di prova nascosta", () => {
    const aree = listino(fotovoltaicoPerComponente());
    expect(aree.map((a) => a.nome)).toEqual(["Fotovoltaico"]);
    expect(nomi(aree[0].tipologie)).toEqual(["Inverter", "Sistemi di accumulo", "Moduli fotovoltaici", "Caldaie", "Senza tipologia"]);
    expect(tipologia(aree, "Inverter").linee[0].righe.map((r) => r.famiglia.id)).toEqual(["inv-3", "inv-6", "inv-10"]);
    expect(tipologia(aree, "Caldaie").standard).toBeNull();
    expect(tipologia(aree, "Senza tipologia").articoli).toBe(3);
  });

  it("senza macrocategorie le categorie fanno da tipologie, e il preventivatore non le propone", () => {
    const aree = listino(categorieSenzaMacrocategoria());
    expect(nomi(aree[0].tipologie)).toEqual(["Finestre", "Persiane", "Zanzariere"]);
    const finestre = tipologia(aree, "Finestre");
    expect(finestre).toMatchObject({ fonte: "categoria", collegamento: "nessuno" });
    expect(finestre.standard?.nome).toBe("Serramenti");
    expect(tipologia(aree, "Persiane").standard?.nome).toBe("Persiane e scuri");
  });

  it("linee sull'asse in una tipologia etichettata «serramenti»: stessa area, linee unite per nome", () => {
    const aree = listino(lineeSullAsse());
    expect(nomi(aree[0].tipologie)).toEqual(["SERRAMENTI STANDARD", "Accessori Serramenti"]);
    const standard = tipologia(aree, "SERRAMENTI STANDARD");
    expect(standard.collegamento).toBe("area");
    expect(nomi(standard.linee)).toEqual(["PVC Salamander 76", "Rehau Synego", "Alluminio a taglio termico", "Altri articoli"]);
    expect(standard.linee[1]).toMatchObject({ scostamentoPct: 18 });
    expect(standard.linee[1].righe.map((r) => r.famiglia.id)).toEqual(["dg-1", "dg-2"]);
    expect(tipologia(aree, "Accessori Serramenti")).toMatchObject({ articoli: 0, accessorio: true });
  });
});

describe("filtraListino", () => {
  it("toglie linee, tipologie e aree rimaste vuote e riconta i prodotti", () => {
    const tutto = [...listino(bagni()), ...listino(fotovoltaicoPerComponente())];
    const trovati = filtraListino(tutto, (r) => r.famiglia.nome.toLowerCase().includes("ovale"));
    expect(trovati.map((a) => [a.nome, a.articoli])).toEqual([["Bagni", 2]]);
    expect(nomi(trovati[0].tipologie)).toEqual(["Vasche"]);
    expect(nomi(trovati[0].tipologie[0].linee)).toEqual(["Linea vasca Tipo 1", "Linea vasca Tipo 2"]);
  });

  it("lascia intatta la linea quando passano tutte le sue righe", () => {
    const tutto = listino(bagni());
    const trovati = filtraListino(tutto, () => true);
    expect(trovati[0].tipologie[0].linee[0]).toBe(tutto[0].tipologie[0].linee[0]);
  });
});
