import { describe, expect, it } from "vitest";
import { generateInterventoSintesi, tipoAccessorioDaNome } from "@/lib/serramenti/sintesiIntervento";

/**
 * Le righe aggiunte dal listino nascono tutte con tipologia «finestra_2ante».
 * La sintesi del PDF le contava come finestre: un preventivo con una finestra e
 * un alzante scorrevole diceva «Sostituzione di 2 finestre».
 */
describe("Sintesi intervento: righe da listino", () => {
  const riga = (nome: string, quantita = 1) => ({
    tipologia: "finestra_2ante",
    tipologia_label: nome,
    family_id: `fam-${nome}`,
    quantita,
  });

  it("un alzante scorrevole non diventa una finestra", () => {
    const testo = generateInterventoSintesi(
      [riga("Finestra 2 Ante"), riga("Alzante Scorrevole a Scomparsa")],
      [],
      "sostituzione",
    );
    expect(testo).toContain("1 finestra");
    expect(testo).toContain("1 alzante-scorrevole");
    expect(testo).not.toContain("2 finestre");
  });

  it("riconosce porte-finestre, scorrevoli, portoncini, fissi e persiane dal nome", () => {
    const testo = generateInterventoSintesi(
      [
        riga("Porta Finestra 2 Ante", 2),
        riga("Smart Slide"),
        riga("Portoncino 1 Anta"),
        riga("Fisso nel Telaio"),
        riga("Persiana Finestra 2 Ante", 3),
      ],
      [],
      "sostituzione",
    );
    expect(testo).toContain("2 porte-finestre");
    expect(testo).toContain("1 scorrevole");
    expect(testo).toContain("1 portoncino");
    expect(testo).toContain("1 vetrata fissa");
    expect(testo).toContain("3 persiane");
    expect(testo).not.toContain("finestre e");
  });

  it("le righe senza articolo del listino usano ancora la tipologia", () => {
    const testo = generateInterventoSintesi([{ tipologia: "portafinestra_1anta", quantita: 2 }], [], "sostituzione");
    expect(testo).toContain("2 porte-finestre");
  });

  it("un ordine di sole tapparelle, zanzariere o porte blindate si legge per quello che è", () => {
    const testo = generateInterventoSintesi(
      [
        riga("Tapparella PVC", 4),
        riga("Zanzariera Laterale Avvolgibile", 2),
        riga("Cassonetto Termoisolato PVC"),
        riga("Porta blindata classe 3 · 1 anta"),
      ],
      [],
      "nuova_costruzione",
    );
    expect(testo).toBe("Fornitura e posa di 4 tapparelle, 2 zanzariere, 1 cassonetto e 1 porta blindata.");
  });

  it("un complemento preso dal listino ha il tipo del suo nome, non sempre «avvolgibile»", () => {
    expect(tipoAccessorioDaNome("Zanzariera Laterale Avvolgibile")).toBe("zanzariera");
    expect(tipoAccessorioDaNome("Tapparella Alluminio Coibentata")).toBe("tapparella");
    expect(tipoAccessorioDaNome("Cassonetto Effetto Legno")).toBe("cassonetto");
    expect(tipoAccessorioDaNome("Persiana 2 ante lamelle fisse")).toBe("persiana");
    expect(tipoAccessorioDaNome("Motore tubolare")).toBe("avvolgibile");
    expect(generateInterventoSintesi([riga("Finestra 2 Ante", 2)], [{ tipo: tipoAccessorioDaNome("Zanzariera a Molla Classica"), quantita: 2 }]))
      .toBe("Sostituzione di 2 finestre, con l'aggiunta di 2 zanzariere.");
  });
});

describe("Sintesi intervento: complementi", () => {
  const finestra = { tipologia: "finestra_2ante", tipologia_label: "Finestra 2 Ante", family_id: "fam-f2a", quantita: 1 };

  it("il nome del prodotto vince sul tipo salvato: 7 tapparelle, non «6 avvolgibili e 1 scuro»", () => {
    const tapparelle = [
      ...Array.from({ length: 6 }, () => ({ tipo: "avvolgibile", descrizione: "Tapparella PVC", quantita: 1 })),
      { tipo: "scuro", descrizione: "Tapparella PVC", quantita: 1 },
    ];
    const testo = generateInterventoSintesi([finestra], tapparelle, "sostituzione");
    expect(testo).toContain("7 tapparelle");
    expect(testo).not.toContain("avvolgibil");
    expect(testo).not.toContain("scur");
  });

  it("conta la parola che viene prima; senza nome resta il tipo", () => {
    expect(tipoAccessorioDaNome("Cassonetto coibentato per tapparella")).toBe("cassonetto");
    const testo = generateInterventoSintesi([finestra], [{ tipo: "zanzariera", descrizione: null, quantita: 2 }], "sostituzione");
    expect(testo).toContain("2 zanzariere");
  });
});
