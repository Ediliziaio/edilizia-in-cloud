/**
 * Il doppione su Google che bloccava tutto il calendario (24/10/2026).
 *
 * Due appuntamenti avevano già un evento Google (importato) e su Google
 * c'era un secondo evento che dichiarava di essere lo stesso appuntamento del
 * CRM. Il ramo «mappa persa, ricollega» provava a salvare il collegamento: un
 * appuntamento ha un solo evento per calendario (indice unico), il salvataggio
 * falliva e l'errore, senza try/catch intorno, interrompeva la riconciliazione
 * di TUTTO il calendario a ogni giro: gli eventi dopo quello non venivano più
 * allineati e le cancellazioni non si propagavano. 228 errori in un giorno.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SORGENTE = readFileSync(
  join(__dirname, "../../../supabase/functions/google-calendar-sync/index.ts"),
  "utf8",
);
const RICOLLEGA = SORGENTE.slice(SORGENTE.indexOf("CRM-originated but mapping lost"));
const PRIMA_DEL_CICLO = SORGENTE.slice(0, SORGENTE.indexOf("for (const gEvent of googleEvents)"));

describe("google-calendar-sync — un evento Google doppione non ferma il calendario", () => {
  it("si ricordano gli appuntamenti che hanno già un evento in questo calendario", () => {
    expect(PRIMA_DEL_CICLO).toContain("const appuntamentiCollegati = new Set<string>(");
    expect(PRIMA_DEL_CICLO).toMatch(/existingMappings \|\| \[\]\)\.map\(\(m: any\) => String\(m\.appointment_id\)\)/);
  });

  it("se l'appuntamento è già collegato si salta l'evento e si va avanti, prima di salvare", () => {
    const controllo = RICOLLEGA.indexOf("if (appuntamentiCollegati.has(String(aptId)))");
    const salvataggio = RICOLLEGA.indexOf("await saveGoogleAppointmentMapping(");
    expect(controllo).toBeGreaterThan(0);
    expect(salvataggio).toBeGreaterThan(controllo);
    const blocco = RICOLLEGA.slice(controllo, salvataggio);
    expect(blocco).toContain("continue;");
    expect(blocco).toContain("console.warn(");
  });

  it("dopo un collegamento riuscito l'appuntamento entra nell'insieme: due doppioni nello stesso giro non si scontrano", () => {
    const salvataggio = RICOLLEGA.indexOf("await saveGoogleAppointmentMapping(");
    const dopo = RICOLLEGA.slice(salvataggio);
    expect(dopo.indexOf("appuntamentiCollegati.add(String(aptId))")).toBeGreaterThan(0);
    expect(dopo.indexOf("appuntamentiCollegati.add(String(aptId))")).toBeLessThan(dopo.indexOf("else if (allowImport)"));
  });

  it("il controllo di proprietà dell'azienda resta prima di tutto: un evento altrui si ignora", () => {
    const proprieta = RICOLLEGA.indexOf("if (!owned) continue;");
    const doppione = RICOLLEGA.indexOf("if (appuntamentiCollegati.has(");
    expect(proprieta).toBeGreaterThan(0);
    expect(proprieta).toBeLessThan(doppione);
  });
});
