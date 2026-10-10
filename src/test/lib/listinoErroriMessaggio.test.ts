/**
 * messaggioErroreListino: la frase che si vede quando un'azione del listino non riesce (10/10/2026).
 * I casi del listino (nome già in uso, schema appena cambiato) hanno le loro parole; tutto il resto è come nelle altre
 * impostazioni. Prima si mostrava il testo del database, o «Errore sconosciuto» per gli errori di Supabase che non sono Error.
 */
import { describe, expect, it } from "vitest";
import { messaggioErroreListino } from "@/lib/listinoErrors";

describe("messaggioErroreListino", () => {
  it("un nome già in uso dice di cosa: tipologia, linea, o un nome qualunque", () => {
    expect(messaggioErroreListino({ code: "23505", message: 'duplicate key value violates unique constraint "listino_macrocategorie_nome_key"' }))
      .toBe("Esiste già una tipologia con questo nome.");
    expect(messaggioErroreListino(new Error('duplicate key value violates unique constraint "listino_categorie_nome_key"')))
      .toBe("Esiste già una linea con questo nome in questa tipologia.");
    expect(messaggioErroreListino({ code: "23505", message: 'duplicate key value violates unique constraint "uq_family_nome"' }))
      .toBe("Nome già in uso. Sceglierne uno diverso.");
  });

  it("un errore di Supabase che non è un Error si legge lo stesso (prima «Errore sconosciuto»)", () => {
    expect(messaggioErroreListino({ code: "23505", message: "duplicate key value violates unique constraint" })).not.toContain("sconosciuto");
  });

  it("rete e permessi hanno la frase di tutte le impostazioni, non il testo del database", () => {
    expect(messaggioErroreListino(new TypeError("Failed to fetch"))).toBe("Connessione persa. Controlla la rete e riprova.");
    expect(messaggioErroreListino({ code: "42501", message: 'new row violates row-level security policy for table "article_families"' }))
      .toBe("Non hai i permessi per questa operazione. Contatta l'amministratore.");
  });

  it("lo schema appena aggiornato dice di aspettare", () => {
    expect(messaggioErroreListino(new Error("Could not find the 'x' column of 'article_families' in the schema cache")))
      .toContain("Attendi qualche secondo");
  });

  it("un messaggio nostro in italiano si legge com'è; un testo tecnico no", () => {
    expect(messaggioErroreListino(new Error("Serve un nome"))).toBe("Serve un nome");
    expect(messaggioErroreListino(new TypeError("Cannot read properties of undefined (reading 'id')"))).toBe("Riprova tra poco.");
  });
});
