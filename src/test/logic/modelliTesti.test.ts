/**
 * Modelli di preventivo: i testi che la pagina costruisce da sola (10/10/2026).
 *
 * - Un errore non arriva mai a schermo col messaggio del database («new row violates…», «Failed to fetch»):
 *   `erroreInItaliano` lo traduce, e lascia passare solo le frasi che `useQuoteTemplates` scrive già in italiano.
 * - Gli stati vuoti hanno il genere giusto («Nessuna copertina», non «Nessun copertina»).
 * - Le descrizioni e le etichette dei colori non hanno più «template», «specs», «heading», «accent».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { KIND_META, type QuoteTemplateKind } from "@/types/quoteTemplate";
import {
  FRASI_DEI_MODELLI_GIA_ITALIANE,
  descrizioneTipo,
  erroreInItaliano,
  kindColorHint,
  kindColorLabels,
  nomeNuovoBlocco,
  pulsanteVuoto,
  titoloVuoto,
} from "@/pages/azienda/settings/SettingsQuoteTemplates/helpers";

const TIPI = Object.keys(KIND_META) as QuoteTemplateKind[];
const RIPIEGO = "Non sono riuscito a salvarlo. Riprova tra poco.";

describe("erroreInItaliano", () => {
  it("un salvataggio rifiutato dalla regola del database dice che mancano i permessi", () => {
    const rifiutato = { message: 'new row violates row-level security policy for table "quote_templates"', code: "42501" };
    expect(erroreInItaliano(rifiutato, RIPIEGO)).toBe("Non hai i permessi per questa operazione. Contatta l'amministratore.");
  });

  it("senza rete, a sessione scaduta e con un nome già preso dice cosa fare", () => {
    expect(erroreInItaliano(new TypeError("Failed to fetch"), RIPIEGO)).toBe("Connessione persa. Controlla la rete e riprova.");
    expect(erroreInItaliano(new Error("JWT expired"), RIPIEGO)).toBe("Sessione scaduta. Accedi di nuovo per continuare.");
    expect(erroreInItaliano({ message: 'duplicate key value violates unique constraint "x"', code: "23505" }, RIPIEGO))
      .toBe("Esiste già un elemento con questi dati. Controlla e riprova.");
  });

  it("un errore che nessuno riconosce non si mostra com'è: c'è la frase di ripiego", () => {
    const sconosciuti: unknown[] = [new Error("PGRST999 internal weirdness"), "boom", null, undefined, {}, 42];
    for (const sconosciuto of sconosciuti) {
      expect(erroreInItaliano(sconosciuto, RIPIEGO)).toBe(RIPIEGO);
    }
  });

  it("le frasi che l'app scrive già in italiano arrivano com'è", () => {
    for (const frase of FRASI_DEI_MODELLI_GIA_ITALIANE) expect(erroreInItaliano(new Error(frase), RIPIEGO)).toBe(frase);
    expect(erroreInItaliano(new Error("I modelli li cambia chi può modificare il listino"), RIPIEGO))
      .toBe("I modelli li cambia chi può modificare il listino");
  });

  it("una frase simile ma non nostra, o un oggetto che non è un errore, non passa", () => {
    expect(erroreInItaliano(new Error("Azienda non disponibile ora"), RIPIEGO)).toBe(RIPIEGO);
    expect(erroreInItaliano({ message: "Azienda non disponibile" }, RIPIEGO)).toBe(RIPIEGO);
  });

  it("le frasi italiane che useQuoteTemplates lancia sono tutte nell'elenco: una nuova non si perde dietro il ripiego", () => {
    const sorgente = readFileSync(join(process.cwd(), "src/hooks/useQuoteTemplates.ts"), "utf8");
    const lanciate = [...sorgente.matchAll(/throw new Error\((['"`])(.+?)\1\)/g)].map((m) => m[2]);
    expect(lanciate.length).toBeGreaterThanOrEqual(2);
    for (const frase of lanciate) expect(FRASI_DEI_MODELLI_GIA_ITALIANE.has(frase), frase).toBe(true);
  });
});

describe("i testi dei tipi di modello", () => {
  it("lo stato vuoto ha il genere giusto, per ogni tipo", () => {
    expect(Object.fromEntries(TIPI.map((t) => [t, titoloVuoto(t)]))).toEqual({
      offerta: "Nessuna offerta ancora",
      copertina: "Nessuna copertina ancora",
      condizioni: "Nessun blocco di condizioni ancora",
      legali: "Nessun blocco di termini legali ancora",
      prodotto: "Nessuna scheda prodotto ancora",
      sezione: "Nessuna sezione libera ancora",
    });
    expect(Object.fromEntries(TIPI.map((t) => [t, pulsanteVuoto(t)]))).toEqual({
      offerta: "Scegli un'offerta completa",
      copertina: "Crea la prima copertina",
      condizioni: "Crea il primo blocco di condizioni",
      legali: "Crea il primo blocco",
      prodotto: "Crea la prima scheda prodotto",
      sezione: "Crea la prima sezione",
    });
  });

  it("un blocco nuovo nasce con un nome col genere giusto", () => {
    expect(Object.fromEntries(TIPI.map((t) => [t, nomeNuovoBlocco(t)]))).toEqual({
      offerta: "Nuova offerta",
      copertina: "Nuova copertina",
      condizioni: "Nuovo blocco di condizioni",
      legali: "Nuovo blocco di termini legali",
      prodotto: "Nuova scheda prodotto",
      sezione: "Nuova sezione libera",
    });
  });

  it("le descrizioni che la pagina mostra non parlano di «template master» né di «specs» (quelle di KIND_META sì: è un file condiviso)", () => {
    for (const tipo of TIPI) {
      const testo = descrizioneTipo(tipo);
      expect(testo.length, tipo).toBeGreaterThan(20);
      expect(testo, tipo).not.toMatch(/template|\bspecs?\b/i);
    }
    expect(descrizioneTipo("offerta")).toBe("Il modello completo del preventivo: mette insieme copertina, prodotti e condizioni.");
  });

  it("le etichette e i suggerimenti dei colori sono in italiano", () => {
    const inglese = /\b(header|heading|accent|divider|overlay|card|zebra|alert|corpo)\b|H1\/H2/i;
    for (const tipo of TIPI) {
      expect(kindColorHint(tipo), tipo).not.toMatch(inglese);
      for (const colore of kindColorLabels(tipo)) {
        expect(colore.label, `${tipo}: ${colore.label}`).not.toMatch(inglese);
        expect(colore.hint ?? "", `${tipo}: ${colore.hint}`).not.toMatch(inglese);
      }
      expect(kindColorLabels(tipo)).toHaveLength(5);
    }
  });
});
