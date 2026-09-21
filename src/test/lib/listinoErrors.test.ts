import { describe, it, expect } from "vitest";
import { translateListinoError } from "@/lib/listinoErrors";

/**
 * Suite per translateListinoError. Copre i pattern di errore Supabase/
 * PostgREST che possiamo incontrare nelle mutation listino, garantendo
 * un messaggio UX italiano e il flag isTransient correttamente impostato
 * per abilitare il bottone "Riprova" nei toast.
 */
describe("translateListinoError — schema cache miss", () => {
  it("riconosce 'Could not find the X column in the schema cache' come transient", () => {
    const err = new Error(
      "Could not find the 'descrizione' column of 'listino_categorie' in the schema cache",
    );
    const result = translateListinoError(err);
    expect(result.isTransient).toBe(true);
    expect(result.message).toMatch(/schema.*database/i);
    expect(result.message).toMatch(/riprova/i);
  });
});

describe("translateListinoError — duplicate key", () => {
  // Dal 14/09/2026 il listino parla con le parole dello schermo: Area → Tipologia
  // → Linea. Le tabelle restano listino_macrocategorie (le tipologie) e
  // listino_categorie (le linee), i messaggi seguono i nomi che l'azienda vede.
  it("23505 su listino_macrocategorie → messaggio tipologia duplicata", () => {
    const err = new Error(
      'duplicate key value violates unique constraint "listino_macrocategorie_company_id_nome_key"',
    );
    const result = translateListinoError(err);
    expect(result.isTransient).toBe(false);
    expect(result.message).toMatch(/tipologia/i);
    expect(result.message).not.toMatch(/macrocategoria/i);
  });

  it("23505 su listino_categorie → messaggio linea duplicata nella tipologia", () => {
    const err = new Error(
      'duplicate key value violates unique constraint "listino_categorie_company_macro_nome_uniq"',
    );
    const result = translateListinoError(err);
    expect(result.message).toMatch(/linea/i);
    expect(result.message).toMatch(/tipologia/i);
    expect(result.message).not.toMatch(/categoria/i);
  });

  it("duplicate generico → messaggio fallback nome già in uso", () => {
    const err = new Error(
      "duplicate key value violates unique constraint on some_other_table",
    );
    const result = translateListinoError(err);
    expect(result.message).toMatch(/nome già in uso/i);
  });
});

describe("translateListinoError — FK + permessi", () => {
  it("foreign key violation → suggerisce di scollegare", () => {
    const err = new Error(
      "insert or update on table violates foreign key constraint",
    );
    const result = translateListinoError(err);
    expect(result.message).toMatch(/elementi collegati/i);
  });

  it("permission denied → messaggio permessi insufficienti", () => {
    const err = new Error(
      "new row violates row-level security policy for table",
    );
    const result = translateListinoError(err);
    expect(result.message).toMatch(/permessi insufficienti/i);
  });
});

describe("translateListinoError — fallback", () => {
  it("errore sconosciuto → messaggio originale (non transient)", () => {
    const err = new Error("Errore random sconosciuto");
    const result = translateListinoError(err);
    expect(result.isTransient).toBe(false);
    expect(result.message).toBe("Errore random sconosciuto");
  });

  it("messaggio lungo viene troncato a 160 char", () => {
    const longMsg = "a".repeat(300);
    const result = translateListinoError(new Error(longMsg));
    expect(result.message.length).toBeLessThanOrEqual(160);
    expect(result.message).toMatch(/…$/);
  });

  it("input non-Error viene gestito senza throw", () => {
    expect(() => translateListinoError("string error")).not.toThrow();
    expect(() => translateListinoError(null)).not.toThrow();
    expect(() => translateListinoError(undefined)).not.toThrow();
    expect(() => translateListinoError(42)).not.toThrow();
  });

  it("rete/timeout → transient", () => {
    const result = translateListinoError(new Error("network timeout"));
    expect(result.isTransient).toBe(true);
    expect(result.message).toMatch(/rete/i);
  });
});
