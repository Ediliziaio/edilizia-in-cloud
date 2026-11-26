import { describe, expect, it } from "vitest";
import {
  MAX_RIGHE_VISTE,
  contaRigheArticolo,
  rigaDaRigaVista,
  righeArticoloViste,
  righeNonRese,
  righeVisteValide,
} from "@/lib/ddt/righeViste";

const CORPO = `Cod  Descrizione                      UM   Qta    Prezzo   Importo
A100  Tubo multistrato 16x2            ml   120    2,35     282,00
A101  Raccordo a T 16                  pz   24     3,10      74,40
B200  Collettore 6 vie                 pz   2      48,00     96,00
C300  Isolante guaina 13mm             m    60     1,20      72,00
Totale imponibile                                          524,40`;

describe("le righe che il telefono vede sul foglio", () => {
  it("prende le righe di merce e lascia fuori intestazione e totali", () => {
    const viste = righeArticoloViste([CORPO]);
    expect(viste).toHaveLength(4);
    expect(viste[0]).toContain("Tubo multistrato");
    expect(viste.join(" ")).not.toContain("Totale");
    expect(contaRigheArticolo([CORPO])).toBe(4);
  });

  it("segnala la riga che l'AI non ha reso, e tace quando ci sono tutte", () => {
    const viste = righeArticoloViste([CORPO]);
    const rese = [
      { codice_articolo: "A100", descrizione: "Tubo multistrato 16x2" },
      { codice_articolo: "A101", descrizione: "Raccordo a T 16" },
      { codice_articolo: "C300", descrizione: "Isolante guaina 13mm" },
    ];
    const mancanti = righeNonRese(viste, rese);
    expect(mancanti).toHaveLength(1);
    expect(mancanti[0]).toContain("Collettore 6 vie");
    expect(righeNonRese(viste, [...rese, { codice_articolo: "B200", descrizione: "Collettore 6 vie" }])).toEqual([]);
  });

  it("basta il codice articolo quando l'OCR ha storpiato la descrizione", () => {
    expect(righeNonRese(["B200 Collettore 6 vie pz 2 48,00"], [
      { codice_articolo: "B200", descrizione: "C0llett0re seí vìe" },
    ])).toEqual([]);
  });

  it("basta la descrizione quando il codice non c'è", () => {
    expect(righeNonRese(["Collettore 6 vie pz 2 48,00"], [
      { codice_articolo: null, descrizione: "Collettore 6 vie in ottone" },
    ])).toEqual([]);
  });

  it("una riga diversa resta segnalata anche se condivide una parola", () => {
    expect(righeNonRese(["B200 Collettore 6 vie pz 2 48,00"], [
      { codice_articolo: "A101", descrizione: "Raccordo collettore" },
    ])).toHaveLength(1);
  });

  describe("la riga pronta da aggiungere", () => {
    it("ricava codice, descrizione, unità e quantità dalla stessa riga", () => {
      const riga = rigaDaRigaVista("A100  Tubo multistrato 16x2   ml   120    2,35   282,00", 5);
      expect(riga.posizione).toBe(5);
      expect(riga.codice_articolo).toBe("A100");
      expect(riga.descrizione).toBe("Tubo multistrato 16x2");
      expect(riga.unita_misura).toBe("ml");
      expect(riga.quantita).toBe(120);
      // La scrive una regola, non il modello: in ufficio si corregge come una riga a mano.
      expect(riga.origine).toBe("manuale");
      expect(riga.testo_grezzo).toContain("Tubo multistrato");
      expect(riga.prezzo_unitario).toBeNull();
    });

    it("legge la quantità anche quando precede l'unità", () => {
      const riga = rigaDaRigaVista("Sabbia lavata 1.200 kg", 1);
      expect(riga.unita_misura).toBe("kg");
      expect(riga.quantita).toBe(1200);
    });

    it("senza codice tiene tutta la descrizione", () => {
      const riga = rigaDaRigaVista("Collettore 6 vie pz 2 48,00", 1);
      expect(riga.codice_articolo).toBeNull();
      expect(riga.descrizione).toBe("Collettore 6 vie");
      expect(riga.quantita).toBe(2);
    });
  });

  describe("quello che si rilegge dalla coda o dall'archivio", () => {
    it("ripulisce, taglia e rifiuta ciò che non è un elenco di righe", () => {
      expect(righeVisteValide(["  A100   Tubo   ml 1 ", "", 7, null])).toEqual(["A100 Tubo ml 1"]);
      expect(righeVisteValide(Array.from({ length: 80 }, (_, i) => `riga ${i}`))).toHaveLength(MAX_RIGHE_VISTE);
      expect(righeVisteValide("A100 Tubo")).toBeUndefined();
      expect(righeVisteValide([])).toBeUndefined();
      expect(righeVisteValide([" "])).toBeUndefined();
      expect(righeVisteValide(righeVisteValide(["a".repeat(500)]))?.[0]).toHaveLength(140);
    });
  });
});
