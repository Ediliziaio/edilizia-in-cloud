import { describe, expect, it } from "vitest";
import {
  GRUPPI_IMPOSTAZIONI,
  gruppoDellaSezione,
  percorsoNelGruppo,
  schedaDellaSezione,
  schedeVisibili,
  sezioneDaPercorso,
} from "@/lib/impostazioni/gruppiImpostazioni";

const gruppo = (id: string) => GRUPPI_IMPOSTAZIONI.find((g) => g.id === id)!;

describe("Impostazioni dei preventivi raggruppate", () => {
  it("legge la sezione dall'indirizzo, anche con sotto-pagine e parametri", () => {
    expect(sezioneDaPercorso("/azienda/impostazioni/tariffe")).toBe("tariffe");
    expect(sezioneDaPercorso("/azienda/impostazioni/listino/import")).toBe("listino");
    expect(sezioneDaPercorso("/azienda/impostazioni/tariffe?tab=manutenzione")).toBe("tariffe");
    expect(sezioneDaPercorso("/azienda")).toBeNull();
  });

  it("manodopera e kit stanno nel Listino, anche dai vecchi indirizzi", () => {
    expect(gruppoDellaSezione("tariffe")?.titolo).toBe("Listino");
    expect(gruppoDellaSezione("bundle-serramentista")?.id).toBe("listino");
    expect(schedaDellaSezione(gruppo("listino"), "listino-manutenzione")?.etichetta).toBe("Manodopera e servizi");
  });

  it("modelli, prezzo e margini, sconti e approvazioni insieme; condizioni e firma elettronica insieme", () => {
    for (const s of ["template-preventivi", "margini", "scontistica", "approvazioni"]) {
      expect(gruppoDellaSezione(s)?.titolo, s).toBe("Modelli di preventivo");
    }
    expect(gruppoDellaSezione("firma-elettronica")?.titolo).toBe("Firma e condizioni");
  });

  it("«Margini e sconti» non è più un gruppo a sé: le sue pagine sono schede di Modelli di preventivo", () => {
    expect(GRUPPI_IMPOSTAZIONI.map((g) => g.titolo)).toEqual(["Listino", "Modelli di preventivo", "Firma e condizioni"]);
    expect(gruppo("modelli").schede.map((s) => [s.sezione, s.etichetta])).toEqual([
      ["template-preventivi", "Modelli"],
      ["margini", "Prezzo e margini"],
      ["scontistica", "Sconti"],
      ["approvazioni", "Approvazioni"],
    ]);
  });

  it("finanziamenti, render e sopralluoghi non hanno schede", () => {
    for (const s of ["finanziamenti", "catalogo-render", "sopralluoghi"]) {
      expect(gruppoDellaSezione(s)).toBeNull();
    }
  });

  it("ogni scheda rispetta il suo permesso", () => {
    const soloListino = schedeVisibili(gruppo("listino"), false, { canViewSettingsPricing: true });
    expect(soloListino.map((s) => s.sezione)).toEqual(["listino", "tariffe"]);
    expect(schedeVisibili(gruppo("listino"), true, {})).toHaveLength(3);
    expect(schedeVisibili(gruppo("firma"), false, {})).toHaveLength(0);
  });

  it("ogni scheda di Modelli di preventivo rispetta il suo permesso", () => {
    const g = gruppo("modelli");
    expect(schedeVisibili(g, true, {})).toHaveLength(4);
    expect(schedeVisibili(g, false, { canViewCosts: true }).map((s) => s.sezione)).toEqual(["margini", "approvazioni"]);
    expect(schedeVisibili(g, false, { canViewSettingsScontistica: true }).map((s) => s.sezione)).toEqual(["scontistica"]);
    expect(schedeVisibili(g, false, { canViewSettingsPricing: true }).map((s) => s.sezione)).toEqual(["template-preventivi"]);
    expect(schedeVisibili(g, false, {})).toHaveLength(0);
  });

  it("la voce del menu resta accesa su tutte le schede del gruppo", () => {
    expect(percorsoNelGruppo(gruppo("listino"), "/azienda/impostazioni/bundle")).toBe(true);
    expect(percorsoNelGruppo(gruppo("listino"), "/azienda/impostazioni/margini")).toBe(false);
    for (const sezione of ["template-preventivi", "margini", "scontistica", "approvazioni"]) {
      expect(percorsoNelGruppo(gruppo("modelli"), `/azienda/impostazioni/${sezione}`), sezione).toBe(true);
    }
    // l'àncora e i parametri non cambiano la pagina
    expect(percorsoNelGruppo(gruppo("modelli"), "/azienda/impostazioni/margini#prezzo")).toBe(true);
    expect(sezioneDaPercorso("/azienda/impostazioni/margini#pdf-e-firma")).toBe("margini");
  });
});
