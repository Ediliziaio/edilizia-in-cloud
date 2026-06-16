import { describe, it, expect } from "vitest";
import { mapRistrutturazioneStato } from "@/lib/preventivi/statoUnificato";

describe("mapRistrutturazioneStato", () => {
  it("bozza → bozza", () => {
    expect(mapRistrutturazioneStato("bozza")).toBe("bozza");
  });
  it("da_consegnare / consegnato / in_valutazione → in_corso", () => {
    expect(mapRistrutturazioneStato("da_consegnare")).toBe("in_corso");
    expect(mapRistrutturazioneStato("consegnato")).toBe("in_corso");
    expect(mapRistrutturazioneStato("in_valutazione")).toBe("in_corso");
  });
  it("accettato → vinto", () => {
    expect(mapRistrutturazioneStato("accettato")).toBe("vinto");
  });
  it("rifiutato / scaduto → perso", () => {
    expect(mapRistrutturazioneStato("rifiutato")).toBe("perso");
    expect(mapRistrutturazioneStato("scaduto")).toBe("perso");
  });
  it("valori sconosciuti / null / undefined → altro", () => {
    expect(mapRistrutturazioneStato("archiviato")).toBe("altro");
    expect(mapRistrutturazioneStato(null)).toBe("altro");
    expect(mapRistrutturazioneStato(undefined)).toBe("altro");
    expect(mapRistrutturazioneStato("qualcosa")).toBe("altro");
  });
});
