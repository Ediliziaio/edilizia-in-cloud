/**
 * Una ricerca sola per gli indirizzi (30/10/2026).
 *
 * Finora l'unico campo con i suggerimenti era AddressAutocomplete (clienti, nuova commessa, sopralluogo,
 * appuntamenti); il fotovoltaico ne aveva una copia, e una ventina di campi (la commessa d'appalto, la modifica
 * commessa, i preventivi, ticket e interventi, fornitori, subappaltatori, magazzini, sedi, azienda, documenti…)
 * non cercavano niente. Ora tutti passano da qui: due chiamate a maps-proxy (HERE) e il modo di leggere la
 * risposta, scritti una volta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

import {
  campiDaTrovato,
  separaCivico,
  cercaIndirizzi,
  dettaglioIndirizzo,
  indirizzoDaDettaglio,
  MINIMO_CARATTERI,
  riempiCampi,
  RicercaNonDisponibile,
  siglaProvincia,
  testoIndirizzo,
  type IndirizzoTrovato,
} from "@/lib/indirizzi/ricercaIndirizzi";

beforeEach(() => mocks.invoke.mockReset());

const suggerimento = { id: "here:af:street:abc", testo: "Via Roma, 1, 20121 Milano MI, Italia" };

describe("testoIndirizzo: una riga all'italiana", () => {
  it("via, CAP, città e provincia tra parentesi", () => {
    expect(testoIndirizzo({ via: "Via Roma 1", cap: "20121", citta: "Milano", provincia: "MI" })).toBe("Via Roma 1, 20121 Milano (MI)");
  });

  it("salta i pezzi che mancano senza lasciare virgole o parentesi vuote", () => {
    expect(testoIndirizzo({ via: "Via Roma 1" })).toBe("Via Roma 1");
    expect(testoIndirizzo({ cap: "20121", citta: "Milano" })).toBe("20121 Milano");
    expect(testoIndirizzo({ citta: "Milano", provincia: "MI" })).toBe("Milano (MI)");
    expect(testoIndirizzo({ via: "Via Roma 1", provincia: "MI" })).toBe("Via Roma 1, MI");
    expect(testoIndirizzo({})).toBe("");
  });

  it("toglie gli spazi in più", () => {
    expect(testoIndirizzo({ via: "  Via Roma 1 ", cap: " 20121", citta: "Milano  ", provincia: " mi " })).toBe("Via Roma 1, 20121 Milano (MI)");
  });
});

describe("siglaProvincia", () => {
  it("tiene solo una sigla di due lettere, in maiuscolo", () => {
    expect(siglaProvincia("MI")).toBe("MI");
    expect(siglaProvincia(" to ")).toBe("TO");
    expect(siglaProvincia("Milano")).toBe("");
    expect(siglaProvincia(null)).toBe("");
    expect(siglaProvincia(42)).toBe("");
  });
});

describe("cercaIndirizzi", () => {
  it(`sotto ${MINIMO_CARATTERI} caratteri non chiama il servizio`, async () => {
    expect(MINIMO_CARATTERI).toBe(3);
    await expect(cercaIndirizzi("vi")).resolves.toEqual([]);
    await expect(cercaIndirizzi("   ")).resolves.toEqual([]);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("chiama maps-proxy come ha sempre fatto il campo condiviso e restituisce id e testo", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { predictions: [{ place_id: suggerimento.id, description: suggerimento.testo }] }, error: null });
    await expect(cercaIndirizzi("via roma")).resolves.toEqual([suggerimento]);
    expect(mocks.invoke).toHaveBeenCalledWith("maps-proxy", { body: { action: "autocomplete", query: "via roma", country: "it" } });
  });

  it("scarta i suggerimenti senza id o testo e i doppioni", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: {
        predictions: [
          { place_id: "a", description: "Via A" },
          { place_id: "", description: "Senza id" },
          { place_id: "b" },
          { place_id: "a", description: "Via A di nuovo" },
          { place_id: "c", description: "Via C" },
        ],
      },
      error: null,
    });
    await expect(cercaIndirizzi("via")).resolves.toEqual([{ id: "a", testo: "Via A" }, { id: "c", testo: "Via C" }]);
  });

  it("servizio giù o risposta senza elenco: lo dice, invece di far finta che non ci sia niente", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error("offline") });
    await expect(cercaIndirizzi("via roma")).rejects.toBeInstanceOf(RicercaNonDisponibile);
    mocks.invoke.mockResolvedValueOnce({ data: { error: "Maps API key not configured" }, error: null });
    await expect(cercaIndirizzi("via roma")).rejects.toBeInstanceOf(RicercaNonDisponibile);
    mocks.invoke.mockRejectedValueOnce(new Error("rete"));
    await expect(cercaIndirizzi("via roma")).rejects.toBeInstanceOf(RicercaNonDisponibile);
  });
});

describe("dettaglioIndirizzo e indirizzoDaDettaglio", () => {
  const dettaglio = {
    formatted_address: "Via Roma, 1, 20121 Milano MI, Italia",
    address_line: "Via Roma 1",
    city: "Milano",
    postal_code: "20121",
    province: "MI",
    lat: 45.4642,
    lng: 9.19,
  };

  it("chiede i dettagli del suggerimento scelto e li mette in forma", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: dettaglio, error: null });
    await expect(dettaglioIndirizzo(suggerimento)).resolves.toEqual({
      id: suggerimento.id,
      via: "Via Roma 1",
      cap: "20121",
      citta: "Milano",
      provincia: "MI",
      testo: "Via Roma 1, 20121 Milano (MI)",
      etichetta: "Via Roma, 1, 20121 Milano MI, Italia",
      lat: 45.4642,
      lng: 9.19,
    });
    expect(mocks.invoke).toHaveBeenCalledWith("maps-proxy", { body: { action: "place-details", place_id: suggerimento.id } });
  });

  it("dettagli non disponibili: null, mai coordinate inventate", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error("offline") });
    await expect(dettaglioIndirizzo(suggerimento)).resolves.toBeNull();
    mocks.invoke.mockResolvedValueOnce({ data: { error: "Place not found" }, error: null });
    await expect(dettaglioIndirizzo(suggerimento)).resolves.toBeNull();
    mocks.invoke.mockRejectedValueOnce(new Error("rete"));
    await expect(dettaglioIndirizzo(suggerimento)).resolves.toBeNull();
  });

  it("un comune senza via: il testo è il luogo, la via resta vuota", () => {
    expect(indirizzoDaDettaglio(suggerimento, { formatted_address: "20121 Milano MI, Italia", city: "Milano", postal_code: "20121", province: "MI", lat: 45, lng: 9 }))
      .toMatchObject({ via: "", testo: "20121 Milano (MI)", citta: "Milano" });
  });

  it("coordinate fuori scala o non numeriche: null", () => {
    expect(indirizzoDaDettaglio(suggerimento, { ...dettaglio, lat: 120, lng: "9" })).toMatchObject({ lat: null, lng: null });
    expect(indirizzoDaDettaglio(suggerimento, { ...dettaglio, lat: Number.NaN, lng: 9 })).toMatchObject({ lat: null, lng: null });
  });

  it("senza nessun pezzo strutturato resta l'etichetta del servizio, poi quella del suggerimento", () => {
    expect(indirizzoDaDettaglio(suggerimento, { formatted_address: "Località Prati, Italia" })).toMatchObject({ testo: "Località Prati, Italia", etichetta: "Località Prati, Italia" });
    expect(indirizzoDaDettaglio(suggerimento, {})).toMatchObject({ testo: suggerimento.testo, etichetta: suggerimento.testo });
  });

  it("una provincia scritta per esteso non entra nei campi da due lettere", () => {
    expect(indirizzoDaDettaglio(suggerimento, { ...dettaglio, province: "Milano" })).toMatchObject({ provincia: "", testo: "Via Roma 1, 20121 Milano" });
  });
});

describe("moduli con via, città, CAP e provincia separati", () => {
  const trovato: IndirizzoTrovato = {
    id: "here:1", via: "Via Roma 1", cap: "20121", citta: "Milano", provincia: "MI",
    testo: "Via Roma 1, 20121 Milano (MI)", etichetta: "Via Roma, 1, 20121 Milano MI, Italia", lat: 45.46, lng: 9.19,
  };

  it("riempiCampi: la via sempre, gli altri solo se il servizio li dà (un CAP già scritto non si cancella)", () => {
    const scritti: Array<[string, string]> = [];
    riempiCampi({ ...trovato, cap: "" }, (campo, valore) => scritti.push([campo, valore]));
    expect(scritti).toEqual([["via", "Via Roma 1"], ["citta", "Milano"], ["provincia", "MI"]]);
  });

  it("riempiCampi: scelto un comune, la via torna vuota", () => {
    const scritti: Array<[string, string]> = [];
    riempiCampi({ ...trovato, via: "" }, (campo, valore) => scritti.push([campo, valore]));
    expect(scritti[0]).toEqual(["via", ""]);
  });

  it("separaCivico: per i moduli col civico in un campo a parte", () => {
    expect(separaCivico("Via Roma 1")).toEqual({ strada: "Via Roma", civico: "1" });
    expect(separaCivico("Via Roma 12/A")).toEqual({ strada: "Via Roma", civico: "12/A" });
    expect(separaCivico("Corso Italia 3B")).toEqual({ strada: "Corso Italia", civico: "3B" });
    expect(separaCivico("Viale 4 Novembre 10")).toEqual({ strada: "Viale 4 Novembre", civico: "10" });
    expect(separaCivico("Via XX Settembre")).toEqual({ strada: "Via XX Settembre", civico: "" });
    expect(separaCivico("Via 4 Novembre")).toEqual({ strada: "Via 4 Novembre", civico: "" });
    expect(separaCivico("  ")).toEqual({ strada: "", civico: "" });
  });

  it("campiDaTrovato: tutto in un oggetto, coi nomi dei campi del modulo, per scrivere in un colpo solo", () => {
    expect(campiDaTrovato(trovato, { via: "indirizzo_via", citta: "indirizzo_comune", cap: "indirizzo_cap", provincia: "indirizzo_provincia" }))
      .toEqual({ indirizzo_via: "Via Roma 1", indirizzo_comune: "Milano", indirizzo_cap: "20121", indirizzo_provincia: "MI" });
    expect(campiDaTrovato({ ...trovato, cap: "" }, { via: "address", citta: "city", provincia: "province" }))
      .toEqual({ address: "Via Roma 1", city: "Milano", province: "MI" });
  });
});
