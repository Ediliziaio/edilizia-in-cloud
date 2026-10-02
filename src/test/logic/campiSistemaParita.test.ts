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
const TIPI = [
  "contact", "opportunity", "appointment", "order", "quote", "invoice", "task", "ticket",
  "supplier", "ordine_acquisto", "ddt_ricezione", "ordini_variazione", "giornale_lavori", "pos_document", "duvri_document",
  "impianto", "contratto_manutenzione", "rapportino", "subappaltatore", "contratto_subappalto", "sal_subappaltatore",
  "costo_aziendale", "salesperson", "external_team", "piano_manutenzione", "employee", "company",
];
/** Il prefisso del dizionario è il nome del tipo. */
const PREFISSO: Record<string, string> = Object.fromEntries(TIPI.map((t) => [t, t]));

/** Campi che il dizionario mostra ma il motore NON deve mettere nei testi, con la ragione. */
const INTERNO = "dato interno, non per i messaggi";
const NON_NEI_TESTI: Record<string, Record<string, string>> = {
  supplier: { rating: INTERNO, credit_limit: INTERNO, notes: INTERNO },
  salesperson: { commission_type: "compenso", commission_value: "compenso", compensation_mode: "compenso", fixed_monthly_eur: "compenso", notes: INTERNO },
  employee: {
    gross_salary: "retribuzione", net_salary: "retribuzione", monthly_hours: "dato di paga", hourly_cost: "retribuzione",
    costo_orario: "retribuzione", retribuzione_lorda_annua: "retribuzione", visita_medica_esito: "dato sanitario", notes: INTERNO,
  },
  ordine_acquisto: { notes: INTERNO },
  subappaltatore: { note: INTERNO },
  ddt_ricezione: {},
  giornale_lavori: { note: INTERNO },
  rapportino: { note_chiusura: INTERNO },
  impianto: { note_tecniche: INTERNO },
  contratto_manutenzione: { note: INTERNO },
  sal_subappaltatore: { note_contestazione: INTERNO },
  costo_aziendale: { notes: INTERNO },
  external_team: { notes: INTERNO },
  company: {},
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
const TECNICO = /(_id|^assigned_to|^created_by|^user_id)$/;
/** Note interne di qualunque oggetto: mai in un messaggio al cliente. */
const NOTE_INTERNE = /^(notes?|internal_notes|note_interne|note_tecniche?|note_contestazione|note_chiusura|note_richiami|note_pagamento)$/;

const campiDizionario = (prefisso: string) =>
  BUILTIN_FIELDS.filter((f) => f.uniqueKey.startsWith(`{{ ${prefisso}.`)).map((f) => f.uniqueKey.replace(`{{ ${prefisso}.`, "").replace(" }}", ""));

describe("dizionario campi di sistema ↔ motore dei testi", () => {
  for (const [tipo, prefisso] of Object.entries(PREFISSO)) {
    it(`${tipo}: ogni campo del dizionario si risolve nei testi (salvo quelli interni)`, () => {
      const motore = new Set(EMAIL_RECORD_FIELDS[tipo]);
      const esclusi = NON_NEI_TESTI[tipo] ?? {};
      const mancanti = campiDizionario(prefisso).filter((k) => !motore.has(k) && !(k in esclusi) && !TECNICO.test(k) && !NOTE_INTERNE.test(k));
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
