/**
 * Elenco utenti: lo stato delle persone e il file CSV di importazione (10/10/2026).
 *
 *  - «Online» non vuol più dire «ha una sessione rimasta aperta»: la persona è
 *    collegata adesso solo con un segno di vita recente (collegamento.ts).
 *  - Il blocco per password sbagliate dice fino a quando e perché, e non si
 *    confonde con il blocco dell'amministratore.
 *  - Il file di importazione ha le colonne del file che si esporta; un ruolo
 *    scritto male non diventa «Operatore» di nascosto.
 */
import { describe, expect, it } from "vitest";
import { chiaveStato, etichettaBloccoTemporaneo, ETICHETTE_STATO, type DatiStatoPersona } from "@/lib/users/statoPersona";
import { COLONNE_DEL_FILE, leggiCsvUtenti } from "@/lib/users/importaUtentiCsv";

const ADESSO = new Date(2026, 9, 10, 12, 0, 0);
const persona = (extra: Partial<DatiStatoPersona> = {}): DatiStatoPersona => ({
  is_blocked: false,
  locked_until: null as unknown as string | null,
  collegato_adesso: false,
  ultimo_segno_di_vita: "2026-10-01T10:00:00Z",
  ...extra,
});

describe("chiaveStato", () => {
  it("collegato adesso solo con un segno di vita recente", () => {
    expect(chiaveStato(persona({ collegato_adesso: true }), ADESSO)).toBe("online");
    // Una sessione rimasta aperta ma ferma da giorni non è «online»: arriva qui come collegato_adesso = false.
    expect(chiaveStato(persona({ collegato_adesso: false }), ADESSO)).toBe("inactive");
  });

  it("mai connesso se non c'è nessun segno di vita", () => {
    expect(chiaveStato(persona({ ultimo_segno_di_vita: null as unknown as string | null }), ADESSO)).toBe("never");
  });

  it("il blocco dell'amministratore vince su tutto; poi il blocco per password sbagliate, se è ancora valido", () => {
    const fra1h = new Date(ADESSO.getTime() + 3_600_000).toISOString();
    const unOraFa = new Date(ADESSO.getTime() - 3_600_000).toISOString();
    expect(chiaveStato(persona({ is_blocked: true, locked_until: fra1h, collegato_adesso: true }), ADESSO)).toBe("blocked");
    expect(chiaveStato(persona({ locked_until: fra1h, collegato_adesso: true }), ADESSO)).toBe("locked");
    // Un blocco scaduto non conta.
    expect(chiaveStato(persona({ locked_until: unOraFa, collegato_adesso: true }), ADESSO)).toBe("online");
  });

  it("le parole dei filtri sono quelle di un titolare", () => {
    expect(ETICHETTE_STATO).toEqual({
      online: "Collegati adesso",
      blocked: "Accesso bloccato",
      locked: "Bloccati per password sbagliate",
      never: "Mai connessi",
      inactive: "Non collegati",
    });
  });
});

describe("etichettaBloccoTemporaneo", () => {
  it("lo stesso giorno: fino alle HH:MM", () => {
    const fino = new Date(2026, 9, 10, 14, 5, 0).toISOString();
    expect(etichettaBloccoTemporaneo(fino, ADESSO)).toBe("Bloccato fino alle 14:05 (password sbagliate)");
  });

  it("un altro giorno: con la data", () => {
    const fino = new Date(2026, 9, 11, 9, 30, 0).toISOString();
    expect(etichettaBloccoTemporaneo(fino, ADESSO)).toBe("Bloccato fino al 11/10 alle 09:30 (password sbagliate)");
  });

  it("la versione breve (telefono) toglie «(password sbagliate)» e non spinge fuori il nome", () => {
    const stessoGiorno = new Date(2026, 9, 10, 14, 5, 0).toISOString();
    const altroGiorno = new Date(2026, 9, 11, 9, 30, 0).toISOString();
    expect(etichettaBloccoTemporaneo(stessoGiorno, ADESSO, true)).toBe("Bloccato fino alle 14:05");
    expect(etichettaBloccoTemporaneo(altroGiorno, ADESSO, true)).toBe("Bloccato fino al 11/10 alle 09:30");
    expect(etichettaBloccoTemporaneo("non è una data", ADESSO, true)).toBe("Bloccato");
  });

  it("una data illeggibile non fa crollare l'elenco", () => {
    expect(etichettaBloccoTemporaneo("non è una data", ADESSO)).toBe("Bloccato per password sbagliate");
  });
});

describe("leggiCsvUtenti", () => {
  const INTESTAZIONE = "Nome,Cognome,Email,Telefono,Ruolo,Ultimo Accesso";

  it("legge il file che esporta lo stesso elenco, compreso «Operaio / Tecnico»", () => {
    const esito = leggiCsvUtenti([
      "﻿" + INTESTAZIONE,
      "Anna,Neri,anna@x.it,333,Operatore,Mai",
      "Luca,Verdi,luca@x.it,,Venditore,Mai",
      "Gina,Blu,gina@x.it,,Call Center,Mai",
      "Piero,Rossi,piero@x.it,,Operaio / Tecnico,Mai",
      "Edil,Srl,edil@x.it,,Subappaltatore,Mai",
    ].join("\r\n"));
    expect(esito.vuoto).toBe(false);
    expect(esito.scartate).toEqual([]);
    expect(esito.daImportare.map((r) => r.roleType)).toEqual(["company_staff", "salesperson", "call_center", "employee", "subcontractor"]);
    expect(esito.daImportare[0]).toMatchObject({ riga: 2, firstName: "Anna", lastName: "Neri", email: "anna@x.it" });
  });

  it("accetta anche i vecchi nomi («Operaio», «Tecnico») e il ruolo vuoto (Operatore)", () => {
    const esito = leggiCsvUtenti([INTESTAZIONE, "A,B,a@x.it,,Operaio,", "C,D,c@x.it,,tecnico,", "E,F,e@x.it,,,"].join("\n"));
    expect(esito.daImportare.map((r) => r.roleType)).toEqual(["employee", "employee", "company_staff"]);
  });

  it("un ruolo scritto male NON diventa Operatore di nascosto: la riga è scartata col motivo", () => {
    const esito = leggiCsvUtenti([INTESTAZIONE, "A,B,a@x.it,,Vendtore,"].join("\n"));
    expect(esito.daImportare).toEqual([]);
    expect(esito.scartate).toHaveLength(1);
    expect(esito.scartate[0].motivo).toMatch(/Ruolo non riconosciuto/);
    expect(esito.scartate[0]).toMatchObject({ riga: 2, email: "a@x.it" });
  });

  it("gli amministratori non si importano, con le parole giuste", () => {
    for (const ruolo of ["Amministratore", "Admin", "company_admin"]) {
      const esito = leggiCsvUtenti([INTESTAZIONE, `A,B,a@x.it,,${ruolo},`].join("\n"));
      expect(esito.daImportare).toEqual([]);
      expect(esito.scartate[0].motivo).toBe("Gli amministratori si creano a mano, con «Nuovo utente»");
    }
  });

  it("scarta le righe incomplete, con email sbagliata o ripetuta", () => {
    const esito = leggiCsvUtenti([
      INTESTAZIONE,
      "A,,a@x.it,,Operatore,",
      "B,C,non-una-email,,Operatore,",
      "D,E,d@x.it,,Operatore,",
      "F,G,D@X.IT,,Operatore,",
    ].join("\n"));
    expect(esito.daImportare.map((r) => r.email)).toEqual(["d@x.it"]);
    expect(esito.scartate.map((r) => [r.riga, r.motivo])).toEqual([
      [2, "Mancano nome, cognome o email"],
      [3, "Email non valida"],
      [5, "Email ripetuta nel file"],
    ]);
  });

  it("un file vuoto o con la sola intestazione è «vuoto»", () => {
    expect(leggiCsvUtenti("").vuoto).toBe(true);
    expect(leggiCsvUtenti(INTESTAZIONE).vuoto).toBe(true);
  });

  it("riconosce il punto e virgola dei CSV salvati da Excel in italiano", () => {
    const esito = leggiCsvUtenti(["Nome;Cognome;Email;Telefono;Ruolo", "Anna;Neri;anna@x.it;;Venditore"].join("\n"));
    expect(esito.daImportare).toEqual([{ riga: 2, firstName: "Anna", lastName: "Neri", email: "anna@x.it", roleType: "salesperson" }]);
  });

  it("una virgola dentro le virgolette non spezza la cella", () => {
    const esito = leggiCsvUtenti([INTESTAZIONE, '"Maria, Luisa","De ""Rossi""",m@x.it,,Operatore,'].join("\n"));
    expect(esito.daImportare[0]).toMatchObject({ firstName: "Maria, Luisa", lastName: 'De "Rossi"', email: "m@x.it" });
  });

  it("dice quali colonne vuole il file", () => {
    expect(COLONNE_DEL_FILE).toBe("Nome, Cognome, Email, Telefono, Ruolo");
  });
});
