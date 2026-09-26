/**
 * MP-EMAIL-AI-01 — La cascata L1 delle email (_shared/email-ai-cascade.ts) sulle
 * email d'esempio di src/test/fixtures/emailClassificatore.ts.
 *
 * Fino al 25/09/2026 girava su una copia della cascata in src/lib/email-ai/classifier.ts
 * che nessuna pagina usava: ora prova la funzione che email-ai-l1-classify ed
 * email-ai-l3-batch eseguono davvero. Il database è finto e risponde alle letture
 * della cascata con le righe date qui sotto.
 *
 * Verifica:
 *   - Per le fixture con expect_l1_resolves=true → categoria + matched_by attesi
 *   - Stampa % hit rate L1 (target MP §9: ≥70% senza alcuna chiamata AI)
 */

import { describe, it, expect } from "vitest";
import {
  classificaDeterministica as classificaSulServer,
  type EmailInput,
} from "../../../supabase/functions/_shared/email-ai-cascade";
import { EMAIL_FIXTURES, countL1Expected } from "../fixtures/emailClassificatore";

type Riga = Record<string, unknown> | null;
type Filtri = Record<string, unknown>;

interface QueryFinta {
  select(): QueryFinta;
  eq(colonna: string, valore: unknown): QueryFinta;
  ilike(colonna: string, valore: unknown): QueryFinta;
  in(): QueryFinta;
  order(): QueryFinta;
  limit(): QueryFinta;
  maybeSingle(): Promise<{ data: Riga; error: null }>;
  /** Le regole dell'utente si leggono con un await sulla query: nessuna. */
  then<T>(fatto: (risposta: { data: unknown[]; error: null }) => T): Promise<T>;
}

/** Un finto client Supabase: ogni `.maybeSingle()` chiede la riga a `riga(tabella, filtri)`. */
function databaseFinto(riga: (tabella: string, filtri: Filtri) => Riga = () => null) {
  return {
    from(tabella: string): QueryFinta {
      const filtri: Filtri = {};
      const query: QueryFinta = {
        select: () => query,
        eq(colonna, valore) {
          filtri[colonna] = valore;
          return query;
        },
        ilike(colonna, valore) {
          filtri[colonna] = valore;
          return query;
        },
        in: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: riga(tabella, filtri), error: null }),
        then: async (fatto) => fatto({ data: [], error: null }),
      };
      return query;
    },
    rpc: async (): Promise<{ data: null; error: null }> => ({ data: null, error: null }),
  };
}

type DatabaseFinto = ReturnType<typeof databaseFinto>;

const classificaDeterministica = (email: EmailInput, db: DatabaseFinto) =>
  classificaSulServer(db as unknown as Parameters<typeof classificaSulServer>[0], "azienda-di-prova", email);

/** Nessun mittente noto, nessun match CRM: scattano solo header e regex. */
const emptyContext = databaseFinto();

/** Un fornitore già imparato (mittenti_noti) e uno in anagrafica, per la parte CRM. */
const seededContext = databaseFinto((tabella, filtri) => {
  if (tabella === "mittenti_noti" && filtri.email === "vendite@known-supplier.it") {
    return { categoria: "fornitore", entita_tipo: "fornitore", entita_id: "00000000-0000-0000-0000-000000000001" };
  }
  if (tabella === "suppliers" && filtri.email === "info@laterizi-mediterraneo.it") {
    return { id: "00000000-0000-0000-0000-000000000002" };
  }
  return null;
});

describe("L1 classifier deterministico", () => {
  describe("Fixture coverage — ogni categoria attesa è coperta", () => {
    it("ha almeno 1 fixture per ognuna delle categorie principali", () => {
      const must_have = [
        "fattura",
        "preventivo",
        "fornitore",
        "operaio",
        "opportunita",
        "pratica",
        "newsletter",
        "social",
        "notifica",
        "spam",
        "supporto",
      ];
      const seen = new Set(EMAIL_FIXTURES.map((f) => f.expected_categoria));
      for (const cat of must_have) {
        expect(seen.has(cat as never)).toBe(true);
      }
    });
  });

  describe("Cache mittenti_noti vince su tutto", () => {
    it("ritorna categoria da mittente_noto anche se subject suggerisce altro", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "vendite@known-supplier.it",
          subject: "Newsletter del mese - ti sei iscritto",
          snippet: "Magazine periodico.",
        },
        seededContext,
      );
      expect(result).not.toBeNull();
      expect(result?.categoria).toBe("fornitore");
      expect(result?.classificato_da).toBe("regola");
      expect(result?.confidenza).toBe(1.0);
      expect(result?.matched_by).toBe("cache:mittenti_noti");
    });
  });

  describe("Match CRM per email/dominio", () => {
    it("ritorna fornitore se email matcha suppliers", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "info@laterizi-mediterraneo.it",
          subject: "DDT 234",
          snippet: "Documento di trasporto",
        },
        seededContext,
      );
      expect(result).not.toBeNull();
      expect(result?.categoria).toBe("fornitore");
      expect(result?.entita_tipo).toBe("fornitore");
      expect(result?.entita_id).toBeTruthy();
      expect(result?.matched_by).toBe("crm:email");
    });
  });

  describe("Header rules", () => {
    it("List-Unsubscribe → newsletter", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "x@example.com",
          subject: "Whatever",
          snippet: "anything",
          headers: { "list-unsubscribe": "<https://x.it/u>" },
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("newsletter");
      expect(result?.matched_by).toBe("header:list-unsubscribe");
    });

    it("Domain facebookmail → social", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "notification@facebookmail.com",
          fromDomain: "facebookmail.com",
          subject: "Notifica generica",
          snippet: "...",
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("social");
      expect(result?.matched_by).toContain("social-domain");
    });

    it("no-reply local-part → notifica", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "noreply@stripe.com",
          subject: "Pagamento ricevuto",
          snippet: "Hai ricevuto un pagamento.",
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("notifica");
      expect(result?.matched_by).toBe("header:noreply-localpart");
    });

    it("Auto-Submitted → notifica", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "info@gov.it",
          subject: "Risposta automatica",
          snippet: "...",
          headers: { "auto-submitted": "auto-generated" },
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("notifica");
    });

    it("Precedence bulk → newsletter", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "marketing@x.it",
          subject: "Offerta",
          snippet: "...",
          headers: { precedence: "bulk" },
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("newsletter");
    });

    it("Dominio PEC → pratica", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "info@miocomune.pec.it",
          subject: "Pratica edilizia comunale",
          snippet: "...",
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("pratica");
      expect(result?.matched_by).toBe("header:pec-domain");
    });
  });

  describe("Regex rules", () => {
    it("Fattura SDI", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "x@example.it",
          subject: "Fattura elettronica n.42/2026",
          snippet: "Allegato XML.",
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("fattura");
    });

    it("Preventivo", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "x@example.it",
          subject: "Richiesta preventivo bagno",
          snippet: "Vorrei un sopralluogo per ristrutturazione.",
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("preventivo");
    });

    it("Pratica AdE/INPS", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "x@example.it",
          subject: "Scadenza F24 INPS",
          snippet: "Versamento contributi.",
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("pratica");
    });

    it("Operaio HR", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "x@example.it",
          subject: "Richiesta ferie agosto",
          snippet: "Vorrei le ferie dal 15 al 22 agosto.",
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("operaio");
    });

    it("Spam scam classico", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "x@suspicious.io",
          subject: "HAI VINTO! Click here",
          snippet: "Congratulations you've won a prize.",
        },
        emptyContext,
      );
      expect(result?.categoria).toBe("spam");
    });
  });

  describe("Ambigui (NESSUNA regola scatta — scendono a L3)", () => {
    it("email generica senza segnali → null", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "tizio@misteriosa.it",
          subject: "Buongiorno",
          snippet: "Volevo chiedervi una cosa.",
        },
        emptyContext,
      );
      expect(result).toBeNull();
    });

    it("from email vuota → null", async () => {
      const result = await classificaDeterministica(
        {
          from_email: "",
          subject: "Test",
          snippet: "...",
        },
        emptyContext,
      );
      expect(result).toBeNull();
    });
  });

  describe("Full fixture suite — target ≥70% L1 hit rate", () => {
    it("classifica correttamente le fixture risolvibili da L1", async () => {
      let l1_resolved = 0;
      let l1_correct = 0;
      const l1_expected = countL1Expected();
      const errors: string[] = [];

      for (const f of EMAIL_FIXTURES) {
        const result = await classificaDeterministica(f.input, emptyContext);

        const did_l1_resolve = result !== null;
        if (did_l1_resolve) l1_resolved++;

        if (f.expect_l1_resolves) {
          if (!did_l1_resolve) {
            errors.push(`${f.id} (${f.description}): L1 non risolve, atteso ${f.expected_categoria}`);
            continue;
          }
          if (result!.categoria !== f.expected_categoria) {
            errors.push(
              `${f.id} (${f.description}): atteso ${f.expected_categoria}, got ${result!.categoria} (matched_by=${result!.matched_by})`,
            );
            continue;
          }
          if (f.expected_matched_by_prefix && !result!.matched_by?.startsWith(f.expected_matched_by_prefix)) {
            errors.push(
              `${f.id}: matched_by atteso prefisso "${f.expected_matched_by_prefix}", got "${result!.matched_by}"`,
            );
            continue;
          }
          l1_correct++;
        } else {
          // Ambigui: ci aspettiamo null. Se L1 risolve è OK ma non lo contiamo.
          if (did_l1_resolve && !f.ambiguous) {
            errors.push(`${f.id}: NON dovrebbe risolvere a L1 ma ha risolto come ${result!.categoria}`);
          }
        }
      }

      const total_fixtures = EMAIL_FIXTURES.length;
      const hit_rate = ((l1_resolved / total_fixtures) * 100).toFixed(1);
      const accuracy_on_expected = ((l1_correct / l1_expected) * 100).toFixed(1);

      // Log stats
       
      console.log("\n═══════════════════════════════════════════════════════════════");
       
      console.log("MP-EMAIL-AI-01 — L1 hit rate test (deterministico, no CRM, no cache)");
       
      console.log("───────────────────────────────────────────────────────────────");
       
      console.log(`Totale fixture:                       ${total_fixtures}`);
       
      console.log(`Fixture risolvibili attese da L1:    ${l1_expected}`);
       
      console.log(`Fixture risolte da L1:                ${l1_resolved}/${total_fixtures}  (${hit_rate}%)`);
       
      console.log(`Fixture correttamente classificate:   ${l1_correct}/${l1_expected}  (${accuracy_on_expected}%)`);
       
      console.log("───────────────────────────────────────────────────────────────");
      if (errors.length > 0) {
         
        console.log("ERRORI:");
        for (const e of errors) {
           
          console.log(`  ✗ ${e}`);
        }
      } else {
         
        console.log("Tutte le fixture risolvibili classificate correttamente ✓");
      }
       
      console.log("═══════════════════════════════════════════════════════════════\n");

      // Assertion principali
      expect(errors).toEqual([]);
      // L1 deve risolvere ≥70% (calcolato su quelle che dovrebbero risolvere)
      const hit_rate_on_expected = l1_correct / l1_expected;
      expect(hit_rate_on_expected).toBeGreaterThanOrEqual(0.7);
    });
  });
});
