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

  it("margini e sconti insieme, condizioni e firma elettronica insieme", () => {
    expect(gruppoDellaSezione("scontistica")?.titolo).toBe("Margini e sconti");
    expect(gruppoDellaSezione("firma-elettronica")?.titolo).toBe("Firma e condizioni");
  });

  it("finanziamenti, modelli, render e sopralluoghi non hanno schede", () => {
    for (const s of ["finanziamenti", "template-preventivi", "catalogo-render", "sopralluoghi"]) {
      expect(gruppoDellaSezione(s)).toBeNull();
    }
  });

  it("ogni scheda rispetta il suo permesso", () => {
    const soloListino = schedeVisibili(gruppo("listino"), false, { canViewSettingsPricing: true });
    expect(soloListino.map((s) => s.sezione)).toEqual(["listino", "tariffe"]);
    expect(schedeVisibili(gruppo("listino"), true, {})).toHaveLength(3);
    expect(schedeVisibili(gruppo("firma"), false, {})).toHaveLength(0);
  });

  it("la voce del menu resta accesa su tutte le schede del gruppo", () => {
    expect(percorsoNelGruppo(gruppo("listino"), "/azienda/impostazioni/bundle")).toBe(true);
    expect(percorsoNelGruppo(gruppo("listino"), "/azienda/impostazioni/margini")).toBe(false);
  });
});
