/**
 * Il dizionario «Campi di sistema» e il motore dei testi devono dire le stesse cose.
 *
 * Il dizionario (Impostazioni → Campi personalizzati) è quello che le persone
 * copiano nei messaggi e nelle automazioni; l'elenco in EMAIL_RECORD_FIELDS è
 * quello che il motore sa davvero sostituire. Col tempo i due si erano
 * allontanati: decine di campi presenti in un elenco e non nell'altro, e quelli
 * mancanti nel motore uscivano stampati come {{contact.fiscal_code}}. Qui la prova.
 */
import { describe, expect, it } from "vitest";
import { BUILTIN_FIELDS } from "@/components/settings/CustomFieldsConfig";
import { EMAIL_PREFIX_TYPES, EMAIL_RECORD_FIELDS } from "../../../supabase/functions/_shared/automationEmail";

/** Tipo del motore → prefisso usato nel dizionario. */
const PREFISSO: Record<string, string> = {
  contact: "contact", opportunity: "opportunity", appointment: "appointment", order: "order",
  quote: "quote", invoice: "invoice", task: "task", ticket: "ticket",
};

/** Campi che il dizionario mostra ma il motore NON deve mettere nei testi, con la ragione. */
const NON_NEI_TESTI: Record<string, Record<string, string>> = {
  contact: { notes: "note interne del CRM", type: "alias vecchio, non è una colonna" },
  opportunity: { notes: "testo scritto dai flussi automatici", loss_notes: "note interne sulla perdita" },
  appointment: { internal_notes: "note interne" },
  order: { internal_notes: "note interne" },
  quote: { internal_notes: "note interne" },
  ticket: { internal_notes: "note interne" },
  task: { notes: "note interne" },
};

/** Nomi comodi che il motore calcola (non sono colonne): non devono stare nel dizionario. */
const CALCOLATI = new Set(["full_name", "giorno", "data", "ora", "ora_fine", "titolo", "luogo", "link_riprogramma", "link_sposta", "link_call"]);

/** Riferimenti tecnici: restano nel dizionario (servono a filtri e report) ma non nei testi ai clienti. */
const TECNICO = /(_id|^assigned_to|^created_by)$/;

const campiDizionario = (prefisso: string) =>
  BUILTIN_FIELDS.filter((f) => f.uniqueKey.startsWith(`{{ ${prefisso}.`)).map((f) => f.uniqueKey.replace(`{{ ${prefisso}.`, "").replace(" }}", ""));

describe("dizionario campi di sistema ↔ motore dei testi", () => {
  for (const [tipo, prefisso] of Object.entries(PREFISSO)) {
    it(`${tipo}: ogni campo del dizionario si risolve nei testi (salvo quelli interni)`, () => {
      const motore = new Set(EMAIL_RECORD_FIELDS[tipo]);
      const esclusi = NON_NEI_TESTI[tipo] ?? {};
      const mancanti = campiDizionario(prefisso).filter((k) => !motore.has(k) && !(k in esclusi) && !TECNICO.test(k));
      expect(mancanti).toEqual([]);
    });

    it(`${tipo}: ogni campo che il motore risolve è nel dizionario`, () => {
      const dizionario = new Set(campiDizionario(prefisso));
      const mancanti = EMAIL_RECORD_FIELDS[tipo].filter((k) => !dizionario.has(k) && !CALCOLATI.has(k));
      expect(mancanti).toEqual([]);
    });
  }

  it("i prefissi del motore e del dizionario coincidono", () => {
    for (const tipo of Object.keys(PREFISSO)) {
      expect(Object.values(EMAIL_PREFIX_TYPES)).toContain(tipo);
    }
  });

  it("nessuna voce del dizionario è doppia (stesso id o stessa chiave)", () => {
    const ids = BUILTIN_FIELDS.map((f) => f.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    const chiavi = BUILTIN_FIELDS.map((f) => f.uniqueKey);
    expect(chiavi.filter((k, i) => chiavi.indexOf(k) !== i)).toEqual([]);
  });

  it("ogni voce ha chiave nel formato {{ oggetto.campo }} e un'etichetta", () => {
    for (const f of BUILTIN_FIELDS) {
      expect(f.uniqueKey).toMatch(/^\{\{ [a-z_]+\.[A-Za-z0-9_]+ \}\}$/);
      expect(f.name.trim().length).toBeGreaterThan(0);
    }
  });
});
