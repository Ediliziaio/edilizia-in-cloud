import { describe, expect, it } from "vitest";
import { chiaveTerritorio, leggiPrezziMimit } from "../../../shared/carburanti/mimit";
import { arriviDaBozza, campoArrivo, erroreArrivi, leggiArrivo } from "@/lib/campo/arrivoRapportino";

const a = "16000000-0000-4000-8000-000000000001";
const b = "16000000-0000-4000-8000-000000000002";
const arrivo = { mezzoId: a, partenza: " Deposito ", km: "18,5" };

describe("trasporti dichiarati nel rapportino", () => {
  it("rilegge una bozza precedente e conserva più mezzi distinti con i rispettivi km", () => {
    expect(arriviDaBozza(arrivo)).toEqual([arrivo]);
    expect(leggiArrivo(campoArrivo([arrivo, { mezzoId: b, partenza: "", km: "" }]))).toEqual([
      { mezzoId: a, partenza: "Deposito", km: "18.5" },
      { mezzoId: b, partenza: "", km: "" },
    ]);
    expect(campoArrivo([])).toEqual([]);
  });
  it("rifiuta i doppi mezzi e i chilometri non validi", () => {
    expect(() => campoArrivo([arrivo, arrivo])).toThrow(/una sola volta/);
    expect(erroreArrivi([{ ...arrivo, km: "10000,01" }])).toMatch(/10.000/);
  });
});

describe("rilevazione ufficiale MIMIT", () => {
  const csv = [
    "Aggiornamento 22-11-2026", "REGIONE;TIPOLOGIA;EROGAZIONE;PREZZO MEDIO",
    "Emilia Romagna;Gasolio;SELF;2.201", "Emilia Romagna;Benzina;SELF;1,950",
    "Emilia Romagna;Gasolio;SERVITO;4.01", "Bolzano;Gasolio;SELF;ND",
    "Bolzano;Metano;SERVITO;1.8",
  ].join("\r\n");

  it("usa la data del Ministero, riconosce le varianti territoriali e lascia assente un dato ND", () => {
    const { giorno, territori } = leggiPrezziMimit(csv);
    expect(giorno).toBe("2026-11-22");
    expect(territori).toEqual([
      { chiave: "bolzano", nome: "Bolzano", prezzi: {} },
      { chiave: chiaveTerritorio("Emilia-Romagna"), nome: "Emilia Romagna", prezzi: { gasolio: 2.201, benzina: 1.95 } },
    ]);
  });
  it("rifiuta un documento errato e una data impossibile", () => {
    expect(() => leggiPrezziMimit("<html>Errore</html>")).toThrow();
    expect(() => leggiPrezziMimit(csv.replace("22-11", "31-11"))).toThrow(/Data/);
  });
});
