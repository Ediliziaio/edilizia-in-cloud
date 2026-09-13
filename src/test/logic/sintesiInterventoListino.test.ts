import { describe, expect, it } from "vitest";
import { generateInterventoSintesi } from "@/lib/serramenti/sintesiIntervento";

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
});
