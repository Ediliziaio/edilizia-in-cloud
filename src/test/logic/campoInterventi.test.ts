import { describe, expect, it } from "vitest";
import { giornoRoma, interventoFatto, interventoIniziato, oraRoma, prossimoIntervento, spostaGiorno, type InterventoCampo } from "@/lib/campo/interventi";

const base = (id: string, quando: string, extra: Partial<InterventoCampo> = {}): InterventoCampo => ({
  id, titolo: id, descrizione: null, tipo: null, tipo_intervento: null, durata_stimata_h: null, stato: "programmato", priorita: null,
  quando, indirizzo: null, lat: null, lng: null, order_id: null, order_code: null, merce_richiesta: null, merce_stato: null,
  cliente: null, impianto: null, iniziato_at: null, finito_at: null, firma_obbligatoria: false, ...extra,
});

describe("interventi brevi del tecnico", () => {
  it("giorno e ora sono quelli di Roma, non del telefono", () => {
    expect(giornoRoma("2026-11-26T23:30:00Z")).toBe("2026-11-27");
    expect(oraRoma("2026-11-26T08:00:00Z")).toBe("09:00");
    expect(spostaGiorno("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("fatto = finito dal tecnico o già risolto/da fatturare/chiuso dall'ufficio", () => {
    expect(interventoFatto(base("a", "2026-11-26T08:00:00Z", { finito_at: "2026-11-26T09:00:00Z" }))).toBe(true);
    expect(interventoFatto(base("a", "2026-11-26T08:00:00Z", { stato: "da_fatturare" }))).toBe(true);
    expect(interventoFatto(base("a", "2026-11-26T08:00:00Z", { stato: "in_lavorazione" }))).toBe(false);
    expect(interventoIniziato(base("a", "2026-11-26T08:00:00Z", { stato: "in_lavorazione" }))).toBe(true);
  });

  it("il prossimo è il primo non fatto dello stesso giorno, in ordine di orario", () => {
    const lista = [
      base("caldaia", "2026-11-26T08:00:00Z"),
      base("finestra", "2026-11-26T13:30:00Z"),
      base("gia-fatto", "2026-11-26T11:00:00Z", { stato: "risolto" }),
      base("domani", "2026-11-27T07:00:00Z"),
    ];
    expect(prossimoIntervento(lista, "caldaia")?.id).toBe("finestra");
    // Finita la finestra resta da fare la caldaia (anche se era prima): è quella che propone.
    expect(prossimoIntervento(lista, "finestra")?.id).toBe("caldaia");
    expect(prossimoIntervento([lista[0]], "caldaia")).toBeNull();
  });
});
