/**
 * La validita' dei listini fornitore: da quali si puo' suggerire un prezzo.
 *
 * Il caso che ha fatto nascere la regola: un contratto di fornitura attivo e
 * con scadenza 30/11/2026. Fino al 12/11/2026 il programma guardava solo il
 * flag `attivo`, quindi dal primo dicembre avrebbe continuato a suggerire quei
 * prezzi come pattuiti.
 */
import { describe, it, expect } from "vitest";
import {
  etichettaValidita, listinoDiOggi, listinoInScadenza, listinoInVigore, statoListino,
} from "@/lib/listino/validitaListino";

const l = (valido_dal: string | null, valido_al: string | null, attivo = true) => ({ valido_dal, valido_al, attivo });

describe("statoListino", () => {
  it("in vigore: attivo, iniziato e non scaduto", () => {
    expect(statoListino(l("2026-05-13", "2026-11-30"), "2026-11-12")).toBe("in_vigore");
  });

  it("senza date e' in vigore: vale da sempre e per sempre", () => {
    expect(statoListino(l(null, null), "2026-11-12")).toBe("in_vigore");
  });

  it("il giorno della scadenza e' ancora valido, il giorno dopo no", () => {
    expect(statoListino(l(null, "2026-11-30"), "2026-11-30")).toBe("in_vigore");
    expect(statoListino(l(null, "2026-11-30"), "2026-12-01")).toBe("scaduto");
  });

  it("il giorno di inizio e' valido, il giorno prima no", () => {
    expect(statoListino(l("2026-12-01", null), "2026-12-01")).toBe("in_vigore");
    expect(statoListino(l("2026-12-01", null), "2026-11-30")).toBe("non_ancora");
  });

  it("spento vince su tutto: un listino disattivato non torna in vigore da solo", () => {
    expect(statoListino(l(null, null, false), "2026-11-12")).toBe("spento");
    expect(statoListino(l("2026-01-01", "2026-12-31", false), "2026-11-12")).toBe("spento");
  });
});

describe("listinoInVigore", () => {
  it("solo lo stato in vigore permette di suggerire un prezzo", () => {
    expect(listinoInVigore(l("2026-05-13", "2026-11-30"), "2026-11-12")).toBe(true);
    // Il contratto di fornitura, il giorno dopo la scadenza.
    expect(listinoInVigore(l("2026-05-13", "2026-11-30"), "2026-12-01")).toBe(false);
    expect(listinoInVigore(l(null, "2025-12-31"), "2026-11-12")).toBe(false);
    expect(listinoInVigore(l(null, null, false), "2026-11-12")).toBe(false);
  });
});

describe("listinoInScadenza", () => {
  it("avvisa prima della scadenza, non il giorno dopo", () => {
    expect(listinoInScadenza(l(null, "2026-11-30"), 30, "2026-11-12")).toBe(true);
    expect(listinoInScadenza(l(null, "2027-06-30"), 30, "2026-11-12")).toBe(false);
  });

  it("un listino gia' scaduto non e' «in scadenza»: e' un'altra cosa, e si dice diversamente", () => {
    expect(listinoInScadenza(l(null, "2026-10-31"), 30, "2026-11-12")).toBe(false);
  });

  it("senza scadenza non scade", () => {
    expect(listinoInScadenza(l(null, null), 30, "2026-11-12")).toBe(false);
  });
});

describe("etichettaValidita", () => {
  it("in vigore: niente da scrivere", () => {
    expect(etichettaValidita(l(null, "2027-01-01"), "2026-11-12")).toBeNull();
  });

  it("scaduto e non ancora in vigore si leggono in italiano, giorno/mese/anno", () => {
    expect(etichettaValidita(l(null, "2025-12-31"), "2026-11-12")).toBe("scaduto il 31/12/2025");
    expect(etichettaValidita(l("2027-01-01", null), "2026-11-12")).toBe("in vigore dal 01/01/2027");
    expect(etichettaValidita(l(null, null, false), "2026-11-12")).toBe("disattivato");
  });
});

describe("listinoDiOggi", () => {
  const scaduto = { id: "scaduto", ...l(null, "2025-12-31") };
  const vigore = { id: "vigore", ...l("2026-02-01", null) };
  const futuro = { id: "futuro", ...l("2027-01-01", null) };
  const spento = { id: "spento", ...l(null, null, false) };

  it("apre quello in vigore, anche se nell'elenco viene dopo", () => {
    expect(listinoDiOggi([futuro, scaduto, vigore], "2026-11-12")?.id).toBe("vigore");
  });

  it("senza nessuno in vigore apre il primo attivo: meglio uno scaduto e correggibile che il vuoto", () => {
    expect(listinoDiOggi([scaduto, spento], "2026-11-12")?.id).toBe("scaduto");
  });

  it("fra un listino futuro e uno scaduto apre il futuro, che e' l'accordo piu' recente", () => {
    // L'elenco arriva ordinato per valido_dal decrescente: il futuro viene prima.
    expect(listinoDiOggi([futuro, scaduto], "2026-11-12")?.id).toBe("futuro");
  });

  it("se sono tutti spenti apre il primo, e l'etichetta dice perche'", () => {
    expect(listinoDiOggi([spento], "2026-11-12")?.id).toBe("spento");
  });

  it("nessun listino: niente da aprire", () => {
    expect(listinoDiOggi([], "2026-11-12")).toBeNull();
  });
});
