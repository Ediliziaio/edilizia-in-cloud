import { describe, expect, it } from "vitest";
import { prossimoPassoGiornata } from "@/lib/campo/prossimoPassoGiornata";
import { ETICHETTA_STATO_OPERAIO, rapportinoConsegnato, rapportinoDaRifare, statoRapportino, type StatoRapportino } from "@/lib/campo/rapportinoStato";

describe("stato di un rapportino", () => {
  it("legge `stato`", () => {
    expect(statoRapportino({ stato: "inviato" })).toBe("inviato");
    expect(statoRapportino({ stato: "approvato" })).toBe("approvato");
    expect(statoRapportino({ stato: "rifiutato" })).toBe("rifiutato");
    expect(statoRapportino({ stato: "bozza" })).toBe("bozza");
  });

  it("`stato` prevale sul vecchio flag `approvato`", () => {
    expect(statoRapportino({ stato: "rifiutato", approvato: true })).toBe("rifiutato");
  });

  it("i record vecchi senza `stato`: approvato o inviato", () => {
    expect(statoRapportino({ approvato: true })).toBe("approvato");
    expect(statoRapportino({ approvato: false })).toBe("inviato");
    expect(statoRapportino({})).toBe("inviato");
  });

  it("uno stato che non si riconosce è una bozza: non si dà per consegnato", () => {
    expect(statoRapportino({ stato: "boh" })).toBe("bozza");
  });

  it("senza rapportino non c'è stato", () => {
    expect(statoRapportino(null)).toBeNull();
    expect(statoRapportino(undefined)).toBeNull();
  });

  it("consegnato = inviato o approvato; da rifare = respinto o bozza", () => {
    expect([rapportinoConsegnato("inviato"), rapportinoConsegnato("approvato")]).toEqual([true, true]);
    expect([rapportinoConsegnato("rifiutato"), rapportinoConsegnato("bozza"), rapportinoConsegnato(null)]).toEqual([false, false, false]);
    expect([rapportinoDaRifare("rifiutato"), rapportinoDaRifare("bozza")]).toEqual([true, true]);
    expect([rapportinoDaRifare("inviato"), rapportinoDaRifare("approvato"), rapportinoDaRifare(null)]).toEqual([false, false, false]);
  });

  it("le parole per l'operaio", () => {
    expect(ETICHETTA_STATO_OPERAIO.inviato).toBe("In attesa");
    expect(ETICHETTA_STATO_OPERAIO.rifiutato).toBe("Respinto");
  });
});

describe("il prossimo passo della giornata", () => {
  const base = { checklistFatta: true, statoRapportino: null as StatoRapportino | null, isOperaio: true, hasTimbrato: false, uscitaRegistrata: false };

  it("prima la sicurezza", () => {
    expect(prossimoPassoGiornata({ ...base, checklistFatta: false })).toBe("checklist");
  });

  it("poi il rapportino, anche senza timbratura: non è un prerequisito", () => {
    expect(prossimoPassoGiornata(base)).toBe("rapportino-vocale");
    expect(prossimoPassoGiornata({ ...base, isOperaio: false })).toBe("rapportino-vocale");
  });

  it("un rapportino respinto si corregge, non se ne fa uno nuovo (il vocale rifiuterebbe)", () => {
    expect(prossimoPassoGiornata({ ...base, statoRapportino: "rifiutato" })).toBe("correggi-rapportino");
  });

  it("un rapportino in bozza si completa", () => {
    expect(prossimoPassoGiornata({ ...base, statoRapportino: "bozza" })).toBe("completa-rapportino");
  });

  it("un rapportino respinto blocca la chiusura anche se l'operaio ha già timbrato", () => {
    expect(prossimoPassoGiornata({ ...base, statoRapportino: "rifiutato", hasTimbrato: true, uscitaRegistrata: true })).toBe("correggi-rapportino");
  });

  it("consegnato: l'operaio timbra entrata e uscita, il subappaltatore ha finito", () => {
    expect(prossimoPassoGiornata({ ...base, statoRapportino: "inviato" })).toBe("timbra-entrata");
    expect(prossimoPassoGiornata({ ...base, statoRapportino: "approvato", hasTimbrato: true })).toBe("timbra-uscita");
    expect(prossimoPassoGiornata({ ...base, statoRapportino: "inviato", hasTimbrato: true, uscitaRegistrata: true })).toBe("torna-ai-lavori");
    expect(prossimoPassoGiornata({ ...base, statoRapportino: "inviato", isOperaio: false })).toBe("torna-ai-lavori");
  });
});
