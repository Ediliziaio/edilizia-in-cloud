import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Un campo che il modulo chiede deve arrivare nel database anche alla CREAZIONE.
 *
 * Il 29/10/2026 «Nuovo profilo HR» buttava via in silenzio undici campi
 * compilati — residenza (indirizzo, citta', CAP), IBAN, sesso, stato civile,
 * telefono ed email privati, orario di inizio e fine, PIN di timbratura —
 * perche' `useCreateHrProfilo` elencava le colonne a mano e quell'elenco era
 * rimasto indietro rispetto al modulo. L'aggiornamento invece passava tutto,
 * quindi riaprendo la scheda e riscrivendo gli stessi dati funzionava: il
 * difetto si vedeva solo la prima volta, e sembrava che l'app «non facesse
 * creare» la persona.
 *
 * Questo controllo confronta i campi registrati nel modulo con quelli scritti
 * dalla creazione. Se qualcuno aggiunge un campo al modulo e non alla
 * creazione, il test lo dice prima che lo dica un cliente.
 */
const leggi = (percorso: string) =>
  readFileSync(resolve(process.cwd(), percorso), "utf8");

/**
 * Campi del modulo che NON sono colonne di `hr_profili` e quindi non devono
 * comparire nella creazione. Ogni riga va con il suo motivo.
 */
const FUORI_TABELLA = new Set<string>([]);

describe("Nuovo profilo HR: niente campi persi alla creazione", () => {
  const modulo = leggi("src/components/hr/HrProfiloSheet.tsx");
  const creazione = leggi("src/hooks/useCreateHrProfilo.ts");

  const campiModulo = [
    ...new Set(
      [...modulo.matchAll(/register\("([a-z_]+)"/g)].map((m) => m[1]),
    ),
  ].filter((c) => !FUORI_TABELLA.has(c));

  const campiCreazione = new Set(
    [...creazione.matchAll(/^\s{10}([a-z_]+):/gm)].map((m) => m[1]),
  );

  it("il modulo registra dei campi (il controllo non gira a vuoto)", () => {
    expect(campiModulo.length).toBeGreaterThan(20);
  });

  it("ogni campo del modulo viene scritto anche alla creazione", () => {
    const persi = campiModulo.filter((c) => !campiCreazione.has(c));
    expect(persi).toEqual([]);
  });

  it("i campi che il difetto del 29/10/2026 perdeva ci sono tutti", () => {
    for (const campo of [
      "sesso",
      "stato_civile",
      "indirizzo",
      "citta_residenza",
      "cap_residenza",
      "telefono_privato",
      "email_privata",
      "iban",
      "orario_inizio",
      "orario_fine",
      "pin_timbratura",
    ]) {
      expect(campiCreazione.has(campo), `manca ${campo}`).toBe(true);
    }
  });
});
