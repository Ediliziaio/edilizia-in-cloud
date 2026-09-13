import { describe, expect, it } from "vitest";
import { chiaveTesto } from "@/lib/listino/areeStandard";
import {
  bozzaDaScheda,
  datiTecniciScheda,
  eAsseLinea,
  elencoProdotti,
  indiceSchede,
  leggiBozzaScheda,
  lineaDellaRiga,
  nomeLineaScelta,
  schedaVuota,
  schedeUsate,
  trovaSchedaLinea,
  type SchedaLinea,
} from "@/lib/listino/schedeLinea";

function scheda(parziale: Partial<SchedaLinea> & Pick<SchedaLinea, "id" | "nome">): SchedaLinea {
  return {
    company_id: "renova",
    macrocategoria_id: "m-serramenti",
    chiave: chiaveTesto(parziale.nome),
    descrizione: null,
    immagine_url: null,
    profondita_mm: null,
    camere: null,
    guarnizioni: null,
    uw: null,
    scheda_tecnica_url: null,
    scheda_tecnica_nome: null,
    ...parziale,
  };
}

const salamander = scheda({
  id: "s-76",
  nome: "PVC Salamander 76",
  descrizione: "Sistema a 6 camere.",
  profondita_mm: 76,
  camere: 6,
  guarnizioni: 3,
  uw: 0.9,
});
const aluplastVuota = scheda({ id: "s-5000", nome: "PVC Aluplast Ideal 5000" });
const pvcTapparelle = scheda({ id: "s-tapp", nome: "PVC", macrocategoria_id: "m-tapparelle", descrizione: "Stecche in PVC." });
const pvcCassonetti = scheda({ id: "s-cass", nome: "PVC", macrocategoria_id: "m-cassonetti", descrizione: "Cassonetto in PVC." });
const senzaTipologia = scheda({ id: "s-libera", nome: "Alluminio a taglio termico", macrocategoria_id: null, uw: 1.3 });

const indice = indiceSchede([salamander, aluplastVuota, pvcTapparelle, pvcCassonetti, senzaTipologia]);

describe("trovaSchedaLinea", () => {
  it("ritrova la scheda per tipologia e nome, comunque sia scritto", () => {
    expect(trovaSchedaLinea(indice, "m-serramenti", "pvc  SALAMANDER-76")?.id).toBe("s-76");
    expect(trovaSchedaLinea(indice, "m-tapparelle", "PVC Salamander 76")).toBeNull();
    expect(trovaSchedaLinea(indice, "m-serramenti", "")).toBeNull();
    expect(trovaSchedaLinea(indice, "m-serramenti", null)).toBeNull();
  });

  it("«PVC» delle tapparelle e dei cassonetti sono due schede", () => {
    expect(trovaSchedaLinea(indice, "m-tapparelle", "PVC")?.id).toBe("s-tapp");
    expect(trovaSchedaLinea(indice, "m-cassonetti", "PVC")?.id).toBe("s-cass");
  });

  it("la scheda scritta senza tipologia vale anche dentro una tipologia", () => {
    expect(trovaSchedaLinea(indice, "m-serramenti", "Alluminio a taglio termico")?.id).toBe("s-libera");
    expect(trovaSchedaLinea(indice, null, "Alluminio a taglio termico")?.id).toBe("s-libera");
  });
});

describe("la linea di una riga di preventivo", () => {
  const assi = [
    { codice: "colore", nome: "Colore", values: [{ id: "c-bianco", label: "Bianco", valore: "bianco" }] },
    {
      codice: "linea",
      nome: "Linea",
      values: [
        { id: "l-76", label: "PVC Salamander 76", valore: "salamander_76" },
        { id: "l-5000", label: "", valore: "PVC Aluplast Ideal 5000" },
      ],
    },
  ];

  it("è il valore scelto sull'asse Linea; senza etichetta vale il valore", () => {
    expect(nomeLineaScelta(assi, { colore: "c-bianco", linea: "l-76" })).toBe("PVC Salamander 76");
    expect(nomeLineaScelta(assi, { linea: "l-5000" })).toBe("PVC Aluplast Ideal 5000");
    expect(nomeLineaScelta(assi, { colore: "c-bianco" })).toBeNull();
    expect(nomeLineaScelta(assi, null)).toBeNull();
  });

  it("riconosce l'asse dal codice o dal nome: «serie», «Linea»", () => {
    expect(eAsseLinea({ codice: "serie" })).toBe(true);
    expect(eAsseLinea({ codice: "profilo_1", nome: "Linea" })).toBe(true);
    expect(eAsseLinea({ codice: "colore", nome: "Colore" })).toBe(false);
  });

  it("senza asse Linea la linea è la categoria del prodotto", () => {
    expect(lineaDellaRiga({ assi: [], valoriAssi: {}, categoria: " PVC " })).toBe("PVC");
    expect(lineaDellaRiga({ assi, valoriAssi: { linea: "l-76" }, categoria: "Finestre" })).toBe("PVC Salamander 76");
    expect(lineaDellaRiga({ assi: null, valoriAssi: null, categoria: null })).toBeNull();
  });
});

describe("schedaVuota", () => {
  it("una scheda col solo nome, o con spazi al posto del testo, è come se non ci fosse", () => {
    expect(schedaVuota(aluplastVuota)).toBe(true);
    expect(schedaVuota(scheda({ id: "x", nome: "X", descrizione: "   " }))).toBe(true);
    expect(schedaVuota(null)).toBe(true);
    expect(schedaVuota(scheda({ id: "y", nome: "Y", uw: 1.1 }))).toBe(false);
    expect(schedaVuota(scheda({ id: "z", nome: "Z", scheda_tecnica_url: "https://esempio/pdf" }))).toBe(false);
  });
});

describe("datiTecniciScheda", () => {
  it("scrive i dati all'italiana e salta quelli mancanti", () => {
    expect(datiTecniciScheda(salamander).map((d) => d.breve)).toEqual(["76 mm", "6 camere", "3 guarnizioni", "Uw 0,9"]);
    expect(datiTecniciScheda(salamander).find((d) => d.etichetta === "Isolamento termico")?.valore).toBe(
      "Uw fino a 0,9 W/m²K",
    );
    expect(datiTecniciScheda({ profondita_mm: null, camere: 1, guarnizioni: 1, uw: null }).map((d) => d.breve)).toEqual([
      "1 camera",
      "1 guarnizione",
    ]);
    expect(datiTecniciScheda(aluplastVuota)).toEqual([]);
  });
});

describe("schedeUsate", () => {
  it("una pagina per linea, nell'ordine del preventivo, con i prodotti che la usano", () => {
    const usate = schedeUsate(
      [
        { macrocategoriaId: "m-serramenti", linea: "PVC Salamander 76", prodotto: "Finestra 1 Anta" },
        { macrocategoriaId: "m-serramenti", linea: "PVC Aluplast Ideal 5000", prodotto: "Finestra 2 Ante" },
        { macrocategoriaId: "m-tapparelle", linea: "PVC", prodotto: "Tapparella PVC" },
        { macrocategoriaId: "m-serramenti", linea: "PVC Salamander 76", prodotto: "Porta Finestra 2 Ante" },
        { macrocategoriaId: "m-serramenti", linea: "PVC Salamander 76", prodotto: "Finestra 1 Anta" },
        { macrocategoriaId: "m-serramenti", linea: null, prodotto: "Voce a mano" },
      ],
      indice,
    );
    expect(usate.map((u) => u.scheda.id)).toEqual(["s-76", "s-tapp"]);
    expect(usate[0].prodotti).toEqual(["Finestra 1 Anta", "Porta Finestra 2 Ante"]);
  });
});

describe("elencoProdotti", () => {
  it("elenca fino a tre prodotti e conta gli altri", () => {
    expect(elencoProdotti([])).toBe("");
    expect(elencoProdotti(["Finestra 1 Anta"])).toBe("Finestra 1 Anta");
    expect(elencoProdotti(["A", "B"])).toBe("A e B");
    expect(elencoProdotti(["A", "B", "C"])).toBe("A, B e C");
    expect(elencoProdotti(["A", "B", "C", "D"])).toBe("A, B, C e un altro");
    expect(elencoProdotti(["A", "B", "C", "D", "E"])).toBe("A, B, C e altri 2");
  });
});

describe("il modulo della scheda", () => {
  it("accetta la virgola e i campi vuoti, con gli stessi limiti del database", () => {
    const esito = leggiBozzaScheda({ descrizione: "  Sei camere.  ", profondita: "76", camere: "6", guarnizioni: "", uw: "0,9" });
    expect(esito).toEqual({
      ok: true,
      valori: { descrizione: "Sei camere.", profondita_mm: 76, camere: 6, guarnizioni: null, uw: 0.9 },
    });
  });

  it("dice cosa non va, campo per campo", () => {
    const esito = leggiBozzaScheda({ descrizione: "", profondita: "76,5", camere: "0", guarnizioni: "11", uw: "zero" });
    expect(esito.ok).toBe(false);
    if (!("errori" in esito)) throw new Error("il modulo doveva avere errori");
    expect(Object.keys(esito.errori).sort()).toEqual(["camere", "guarnizioni", "profondita", "uw"]);
    expect(leggiBozzaScheda({ descrizione: "x".repeat(2001), profondita: "", camere: "", guarnizioni: "", uw: "" }).ok).toBe(false);
  });

  it("riparte dalla scheda salvata, con la virgola", () => {
    expect(bozzaDaScheda(salamander)).toEqual({
      descrizione: "Sistema a 6 camere.",
      profondita: "76",
      camere: "6",
      guarnizioni: "3",
      uw: "0,9",
    });
    expect(bozzaDaScheda(null)).toEqual({ descrizione: "", profondita: "", camere: "", guarnizioni: "", uw: "" });
  });
});
