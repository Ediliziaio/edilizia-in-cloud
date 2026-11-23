import { describe, expect, it } from "vitest";
import { leggiRispostaInterprete, messaggioInterprete, PROMPT_INTERPRETE } from "../../../shared/planimetrie/interpreteComandi";
import { comandiDaChatDisegno } from "@/components/planimetrie/editor/comandiChat";
import { piantaVuota } from "@/components/planimetrie/editor/adattatore";

describe("interprete della chat del disegno", () => {
  it("tiene solo comandi brevi su una riga e la domanda, senza markdown", () => {
    expect(leggiRispostaInterprete({ comandi: ["  Bagno 2,40 x 2,10 m ", 7, "", "x".repeat(201), "Misura\nBagno"], domanda: "**Di quanto?**" }))
      .toEqual({ comandi: ["Bagno 2,40 x 2,10 m", "Misura Bagno"], domanda: "Di quanto?" });
    expect(leggiRispostaInterprete({ comandi: Array(9).fill("3D") })?.comandi).toHaveLength(6);
    expect(leggiRispostaInterprete({ comandi: [], domanda: "" })).toBeNull();
    expect(leggiRispostaInterprete("testo libero")).toBeNull();
  });

  it("manda al modello la richiesta e gli ambienti, senza doppioni", () => {
    expect(JSON.parse(messaggioInterprete("allarga il bagno", ["Bagno", " Bagno ", "Cucina", ""], "progetto")))
      .toEqual({ richiesta: "allarga il bagno", vista: "progetto", ambienti: ["Bagno", "Cucina"] });
    expect(PROMPT_INTERPRETE).toMatch(/SEMPRE e solo con un oggetto JSON/);
  });

  it("le forme che il prompt promette sono davvero comandi che le regole eseguono", () => {
    const base = comandiDaChatDisegno(piantaVuota(), "fatto", "Soggiorno 5,00 x 4,00 m").passi.at(-1)!.pianta;
    const due = comandiDaChatDisegno(base, "fatto", "Cucina 3,00 x 4,00 m a destra di Soggiorno");
    expect(due.avvisi).toEqual([]);
    expect(due.passi.at(-1)!.pianta.locali).toHaveLength(2);
    for (const comando of ["Porta tra Soggiorno e Cucina da 80 cm", "Finestra Soggiorno sul lato alto da 120 cm", "Misura Cucina", "Arreda Soggiorno"]) {
      const esito = comandiDaChatDisegno(due.passi.at(-1)!.pianta, "fatto", comando);
      expect([comando, esito.passi.length > 0, esito.avvisi]).toEqual([comando, true, []]);
    }
  });
});
