/**
 * Manodopera e servizi + Manutenzione: le schede, gli indirizzi di sempre e gli errori in italiano (10/10/2026).
 *
 * - `?tab=` sceglie la scheda. `manutenzione`, l'indirizzo di prima (ricerca delle impostazioni, ⌘K, vecchia pagina
 *   `listino-manutenzione`), apre i tipi di impianto, che erano la prima scheda di Manutenzione.
 * - Gli avvisi non mostrano più `err.message` com'è: «Failed to fetch», «JSON object requested…».
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parametroDaScheda, schedaDaParametro, SCHEDE_MANUTENZIONE } from "@/pages/azienda/settings/SettingsTariffe/schede";
import { testoErrore } from "@/lib/impostazioni/testoErrore";

const leggi = (percorso: string) => readFileSync(join(process.cwd(), percorso), "utf8");

describe("schedaDaParametro: quale scheda apre ?tab=", () => {
  it("senza parametro, o con un valore che non conosciamo, la manodopera: come prima", () => {
    expect(schedaDaParametro(null)).toBe("manodopera");
    expect(schedaDaParametro(undefined)).toBe("manodopera");
    expect(schedaDaParametro("")).toBe("manodopera");
    expect(schedaDaParametro("manodopera")).toBe("manodopera");
    expect(schedaDaParametro("qualcosa")).toBe("manodopera");
  });

  it("le tre parti di Manutenzione hanno il loro nome", () => {
    expect(schedaDaParametro("impianti")).toBe("impianti");
    expect(schedaDaParametro("interventi")).toBe("interventi");
    expect(schedaDaParametro("prezzi")).toBe("prezzi");
  });

  it("l'indirizzo di prima, ?tab=manutenzione, apre i tipi di impianto", () => {
    expect(schedaDaParametro("manutenzione")).toBe("impianti");
  });

  it("il parametro di una scheda si rilegge come la stessa scheda; la manodopera non ne ha", () => {
    for (const scheda of SCHEDE_MANUTENZIONE) expect(schedaDaParametro(parametroDaScheda(scheda))).toBe(scheda);
    expect(parametroDaScheda("manodopera")).toBeNull();
  });
});

describe("gli indirizzi che già esistono nell'app aprono ancora una parte di Manutenzione", () => {
  const FILE = ["src/components/layouts/SettingsSearch.tsx", "src/components/CommandPalette.tsx", "src/routes/companyRoutes.tsx"];

  it("ogni «tariffe?tab=…» scritto nella ricerca, in ⌘K e nelle rotte apre una scheda di Manutenzione", () => {
    const trovati: { file: string; tab: string }[] = [];
    for (const file of FILE) {
      for (const m of leggi(file).matchAll(/tariffe\?tab=([a-z-]+)/g)) trovati.push({ file, tab: m[1] });
    }
    expect(trovati.length).toBeGreaterThanOrEqual(3);
    for (const { file, tab } of trovati) {
      expect(schedaDaParametro(tab), `${file}: tab=${tab}`).not.toBe("manodopera");
    }
  });

  it("la vecchia pagina «listino-manutenzione» rimanda ancora a ?tab=manutenzione", () => {
    expect(leggi("src/routes/companyRoutes.tsx")).toMatch(
      /<Route path="listino-manutenzione" element=\{<Navigate to="\.\.\/tariffe\?tab=manutenzione" replace \/>\} \/>/,
    );
  });
});

describe("testoErrore: cosa si legge quando un'azione non riesce", () => {
  it("senza rete", () => {
    expect(testoErrore(new TypeError("Failed to fetch"), "Voce non salvata.")).toBe("Voce non salvata. Connessione persa. Controlla la rete e riprova.");
  });

  it("senza permesso: la frase dell'app, non quella del database", () => {
    const rifiuto = { code: "42501", message: "new row violates row-level security policy for table \"tariffe_aziendali\"" };
    expect(testoErrore(rifiuto, "Voce non salvata.")).toBe("Voce non salvata. Non hai i permessi per questa operazione. Contatta l'amministratore.");
  });

  it("un vincolo del database", () => {
    expect(testoErrore({ code: "23503", message: "violates foreign key constraint" }, "Voce non eliminata."))
      .toBe("Voce non eliminata. Impossibile completare: l'elemento è collegato ad altri dati.");
    expect(testoErrore({ code: "23505", message: "duplicate key value violates unique constraint" }, "Voce non salvata."))
      .toBe("Voce non salvata. Esiste già un elemento con questi dati. Controlla e riprova.");
  });

  it("un messaggio scritto apposta per chi lavora si legge com'è, senza il prefisso", () => {
    expect(testoErrore(new Error("Voce non aggiornata: verifica i permessi e riprova."), "Voce non salvata."))
      .toBe("Voce non aggiornata: verifica i permessi e riprova.");
    expect(testoErrore(new Error("Il prezzo di vendita deve essere un numero positivo o zero"), "Voce non salvata."))
      .toBe("Il prezzo di vendita deve essere un numero positivo o zero");
  });

  it("la modifica che il database ignora (una sola riga attesa, zero trovate) spiega cosa può essere", () => {
    const errore = { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" };
    expect(testoErrore(errore, "Voce non salvata.")).toBe("Voce non salvata. Non è stato cambiato niente: forse non hai il permesso, o l'elemento non esiste più.");
    expect(testoErrore(errore)).not.toMatch(/JSON|rows/);
  });

  it("un testo tecnico di una libreria non arriva a chi legge", () => {
    for (const grezzo of [
      new TypeError("Cannot read properties of undefined (reading 'id')"),
      new Error("PGRST204: column does not exist"),
      new Error("invalid input syntax for type uuid: \"abc\""),
      new Error("TypeError: x is not a function"),
    ]) {
      const testo = testoErrore(grezzo, "Voce non salvata.");
      expect(testo, grezzo.message).not.toMatch(/Cannot|PGRST|invalid input|not a function|undefined/);
    }
    expect(testoErrore(new Error("Cannot read properties of undefined"), "Voce non salvata.")).toBe("Voce non salvata. Riprova tra poco.");
  });

  it("senza «cosa non è riuscito» c'è solo il perché (per la descrizione di un avviso con il suo titolo)", () => {
    expect(testoErrore(new TypeError("Failed to fetch"))).toBe("Connessione persa. Controlla la rete e riprova.");
    expect(testoErrore(new Error("Cannot read properties of undefined"))).toBe("Riprova tra poco.");
  });

  it("un errore vuoto o strano non rompe niente", () => {
    expect(testoErrore(null, "Voce non salvata.")).toBe("Voce non salvata. Riprova tra poco.");
    expect(testoErrore(undefined, "Voce non salvata.")).toBe("Voce non salvata. Riprova tra poco.");
    // un testo semplice scritto da noi si legge com'è, uno tecnico no
    expect(testoErrore("Il nome è obbligatorio.", "Voce non salvata.")).toBe("Il nome è obbligatorio.");
    expect(testoErrore("Cannot read properties of undefined", "Voce non salvata.")).toBe("Voce non salvata. Riprova tra poco.");
  });
});

describe("nei file della pagina non resta il testo grezzo dell'errore né un secondo titolo di pagina", () => {
  function sorgenti(cartella: string): string[] {
    return readdirSync(join(process.cwd(), cartella)).flatMap((nome) => {
      const percorso = `${cartella}/${nome}`;
      if (statSync(join(process.cwd(), percorso)).isDirectory()) return sorgenti(percorso);
      return /\.(ts|tsx)$/.test(nome) ? [percorso] : [];
    });
  }
  const FILE_DELLA_PAGINA = [
    "src/pages/azienda/settings/SettingsTariffe.tsx",
    ...sorgenti("src/pages/azienda/settings/SettingsTariffe"),
    ...sorgenti("src/pages/azienda/settings/ListinoManutenzione"),
  ];

  it("ci sono dei file da guardare", () => {
    expect(FILE_DELLA_PAGINA.length).toBeGreaterThanOrEqual(18);
  });

  it.each(FILE_DELLA_PAGINA)("%s: niente «err.message» negli avvisi", (file) => {
    expect(leggi(file)).not.toMatch(/instanceof Error \? (err|e|error)\.message/);
  });

  it.each(FILE_DELLA_PAGINA)("%s: niente <h1> (il titolo lo mette il layout)", (file) => {
    expect(leggi(file)).not.toMatch(/<h1[\s>]/);
  });
});
