import { describe, expect, it } from "vitest";
import { statoCantiere, type RigaCantiere } from "@/pages/azienda/CantieriOggi";

const riga = (over: Partial<RigaCantiere>): RigaCantiere => ({
  id: "o", codice: "C1", descrizione: null, indirizzo: null, stato: "in_corso", responsabile: null,
  previste: 0, timbrate: 0, rapportini_oggi: 0, rapportini_da_approvare: 0, correzioni: 0, bolle: 0,
  ultimo_segnale: null, giorni_senza_segnale: null, ...over,
});

describe("Cantieri oggi: com'è il cantiere", () => {
  it("persone previste e nessun segnale da 3 giorni → fermo, da guardare", () => {
    expect(statoCantiere(riga({ previste: 3, giorni_senza_segnale: 4 }))).toEqual({ testo: "Fermo da 4 giorni", tono: "attenzione" });
  });
  it("previste ma ancora nessuno oggi", () => {
    expect(statoCantiere(riga({ previste: 2, giorni_senza_segnale: 1 })).testo).toBe("Nessuno ancora oggi");
  });
  it("al lavoro senza rapportino, e rapportino arrivato", () => {
    expect(statoCantiere(riga({ previste: 2, timbrate: 2 })).testo).toBe("Al lavoro, rapportino non arrivato");
    expect(statoCantiere(riga({ previste: 2, timbrate: 2, rapportini_oggi: 1 })).tono).toBe("ok");
  });
});
