/**
 * Il listino del committente collegato al listino generale (25/11/2026): e' il
 * legame che porta il prezzo concordato dentro i rapportini. Abbinare la voce
 * sbagliata manderebbe in fattura il prezzo di un altro committente, quindi dove
 * c'e' piu' di una candidata la riga resta scollegata.
 */
import { describe, expect, it } from "vitest";
import { abbinaListino, abbinaVoce, chiaveVoce, contaAbbinamenti } from "@/lib/appalto/abbinaListino";

const generali = [
  { id: "g1", codice: "MO.01", nome: "Ore in economia operai" },
  { id: "g2", codice: null, nome: "Escavatore 40qli - a freddo" },
  { id: "g3", codice: null, nome: "Posa cappotto" },
  { id: "g4", codice: null, nome: "CALCESTRUZZO RCK 25/30" },
];

describe("abbinaVoce", () => {
  it("abbina per codice, anche scritto in un altro modo", () => {
    expect(abbinaVoce({ codice: " mo.01 ", descrizione: "Manodopera" }, generali))
      .toEqual({ tariffaId: "g1", nome: "Ore in economia operai", come: "codice" });
  });

  it("abbina per nome a meno di accenti, maiuscole e punteggiatura", () => {
    expect(abbinaVoce({ descrizione: "calcestruzzo rck 25 30" }, generali))
      .toEqual({ tariffaId: "g4", nome: "CALCESTRUZZO RCK 25/30", come: "nome" });
  });

  it("abbina quando una sola voce contiene il nome", () => {
    const esito = abbinaVoce({ descrizione: "Escavatore 40qli" }, generali);
    expect(esito.tariffaId).toBe("g2");
    expect(esito.come).toBe("quasi");
  });

  it("con due candidate plausibili non indovina", () => {
    const due = [...generali, { id: "g5", codice: null, nome: "Escavatore 40qli - a caldo" }];
    expect(abbinaVoce({ descrizione: "Escavatore 40qli" }, due))
      .toEqual({ tariffaId: null, nome: null, come: "ambigua" });
  });

  it("due voci generali con lo stesso codice: scollegata, non la prima", () => {
    const doppio = [
      { id: "a", codice: "X1", nome: "Una" },
      { id: "b", codice: "x1", nome: "Un'altra" },
    ];
    expect(abbinaVoce({ codice: "X1", descrizione: "Una" }, doppio).tariffaId).toBeNull();
  });

  it("un codice che non esiste nel listino generale non impedisce l'abbinamento per nome", () => {
    expect(abbinaVoce({ codice: "ZZ9", descrizione: "Posa cappotto" }, generali).tariffaId).toBe("g3");
  });

  it("senza candidate resta scollegata, e non e' un errore", () => {
    expect(abbinaVoce({ descrizione: "Trasferimento squadra" }, generali))
      .toEqual({ tariffaId: null, nome: null, come: "nessuna" });
  });

  it("una descrizione vuota non abbina niente", () => {
    expect(abbinaVoce({ descrizione: "   " }, generali).tariffaId).toBeNull();
  });

  it("senza listino generale nessuna riga e' collegata", () => {
    expect(abbinaVoce({ descrizione: "Posa cappotto" }, []).tariffaId).toBeNull();
  });
});

describe("abbinaListino", () => {
  it("tiene l'ordine delle righe e conta collegate e scollegate", () => {
    const righe = [
      { descrizione: "Posa cappotto" },
      { descrizione: "Trasferimento squadra" },
      { codice: "MO.01", descrizione: "Operaio" },
    ];
    const esiti = abbinaListino(righe, generali);
    expect(esiti.map((e) => e.tariffaId)).toEqual(["g3", null, "g1"]);
    expect(contaAbbinamenti(esiti)).toEqual({ collegate: 2, scollegate: 1 });
  });
});

describe("chiaveVoce", () => {
  it("toglie accenti, punteggiatura e spazi doppi", () => {
    expect(chiaveVoce("  Posa  cappótto, 10 cm. ")).toBe("posa cappotto 10 cm");
  });
});
