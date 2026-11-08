import { describe, expect, it } from "vitest";
import {
  TIPI_EVENTO, eventiPerTipo, giorniAperto, oraBreve, ordinaEventi, puoAggiungereEvento, regoleEvento, righeEventiProposti, testoGiorniAperto, tipoEventoValido, unisciEventiProposti,
  type EventoProposto,
} from "../../../supabase/functions/_shared/eventiGiornale";
import { componiBozzaGiornale } from "../../../supabase/functions/_shared/bozzaGiornale";

describe("regole degli eventi", () => {
  it("i tipi sono quelli del CHECK del database", () => {
    expect(TIPI_EVENTO).toEqual(["consegna", "problema", "sospensione", "ripresa", "istruzione", "sopralluogo", "sicurezza", "nota"]);
    expect(tipoEventoValido("problema")).toBe(true);
    expect(tipoEventoValido("altro")).toBe(false);
  });

  it("in bozza si aggiunge e si toglie, sulla firmata no", () => {
    expect(puoAggiungereEvento("bozza", true)).toBe(true);
    expect(puoAggiungereEvento("firmata", true)).toBe(false);
    expect(puoAggiungereEvento("bozza", false)).toBe(false);
    expect(regoleEvento({ tipo: "nota" }, "bozza", true).puoEliminare).toBe(true);
    expect(regoleEvento({ tipo: "nota" }, "firmata", true).puoEliminare).toBe(false);
  });

  it("un problema si chiude e si riapre anche dopo la firma, solo col permesso", () => {
    expect(regoleEvento({ tipo: "problema", stato: "aperto" }, "firmata", true)).toMatchObject({ puoChiudere: true, puoRiaprire: false });
    expect(regoleEvento({ tipo: "problema", stato: "chiuso" }, "firmata", true)).toMatchObject({ puoChiudere: false, puoRiaprire: true });
    expect(regoleEvento({ tipo: "problema", stato: "aperto" }, "firmata", false)).toMatchObject({ puoChiudere: false, puoRiaprire: false });
    expect(regoleEvento({ tipo: "consegna" }, "firmata", true)).toMatchObject({ puoChiudere: false, puoRiaprire: false });
  });

  it("da quanti giorni è aperto", () => {
    expect(giorniAperto("2026-11-01", "2026-11-08")).toBe(7);
    expect(giorniAperto("2026-11-08", "2026-11-08")).toBe(0);
    expect(giorniAperto("2026-11-09", "2026-11-08")).toBe(0);
    expect(giorniAperto("boh", "2026-11-08")).toBe(0);
    expect(testoGiorniAperto(0)).toBe("da oggi");
    expect(testoGiorniAperto(1)).toBe("da 1 giorno");
    expect(testoGiorniAperto(7)).toBe("da 7 giorni");
  });

  it("per tipo nell'ordine fisso, dentro il tipo per ora", () => {
    expect(oraBreve("08:30:00")).toBe("08:30");
    expect(oraBreve(null)).toBe("");
    const eventi = [
      { tipo: "nota", ora: null, created_at: "1" },
      { tipo: "problema", ora: "10:00:00", created_at: "2" },
      { tipo: "problema", ora: "08:00:00", created_at: "3" },
    ];
    expect(eventiPerTipo(eventi).map((g) => g.tipo)).toEqual(["problema", "nota"]);
    expect(eventiPerTipo(eventi)[0].eventi.map((e) => e.ora)).toEqual(["08:00:00", "10:00:00"]);
    expect(ordinaEventi(eventi).at(-1)?.tipo).toBe("nota");
  });
});

describe("eventi proposti senza doppioni", () => {
  const giornata = {
    rapportini: [] as never[],
    ddt: [{ id: "d1", numero_ddt: "1", stato: "ricevuto" }, { id: "d1", numero_ddt: "1", stato: "ricevuto" }],
    segnalazioni: [{ id: "s1", titolo: "Perdita" }, { id: "s2", titolo: "perdita." }],
  };

  it("una bolla una volta, due segnalazioni uguali una volta", () => {
    expect(componiBozzaGiornale(giornata).eventi).toEqual([
      { tipo: "consegna", ddt_id: "d1", testo: "DDT 1" },
      { tipo: "problema", ticket_id: "s1", testo: "Perdita" },
    ]);
  });

  it("solo eventi: la pagina non è vuota", () => {
    expect(componiBozzaGiornale(giornata).vuota).toBe(false);
  });

  it("premere due volte non raddoppia, e quel che è già salvato non torna", () => {
    const { eventi } = componiBozzaGiornale(giornata);
    const una = unisciEventiProposti([], eventi);
    expect(unisciEventiProposti(una, eventi)).toEqual(una);
    expect(unisciEventiProposti(una, eventi, [{ ddt_id: "d1" }])).toEqual([{ tipo: "problema", ticket_id: "s1", testo: "Perdita" }]);
    expect(unisciEventiProposti([], eventi, [{ ddt_id: "d1" }, { ticket_id: "s1" }])).toEqual([]);
  });

  it("le righe da scrivere portano azienda e pagina, divise per indice", () => {
    const proposti: EventoProposto[] = [{ tipo: "consegna", ddt_id: "d", testo: "a" }, { tipo: "problema", ticket_id: "t", testo: "b" }];
    const { conDdt, conTicket } = righeEventiProposti(proposti, "az", "g");
    expect(conDdt).toEqual([{ tipo: "consegna", ddt_id: "d", testo: "a", company_id: "az", giornale_id: "g" }]);
    expect(conTicket).toEqual([{ tipo: "problema", ticket_id: "t", testo: "b", company_id: "az", giornale_id: "g" }]);
  });
});
