/**
 * Le variabili di un modello WhatsApp compilate per un contatto (24/09/2026).
 *
 * Alla creazione del modello ogni posizione ({{1}}, {{2}}…) si lega a un campo
 * del contatto: wa_meta_templates.variable_mapping, es. {"1": "nome"}. Le
 * chiavi sono quelle di src/lib/whatsapp/templateVariableFields.ts; "cf:<id>"
 * è un campo personalizzato. Una posizione senza campo è testo fisso: nelle
 * automazioni lo scrive chi costruisce il flusso.
 *
 * Meta non consegna un modello con una variabile vuota: chi invia deve sapere
 * PRIMA quali mancano, per dirlo invece di vedersi rifiutare il messaggio.
 *
 * Nessun import: lo leggono sia Deno sia i test.
 */

export interface ContattoPerModello {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  city?: string | null;
  province?: string | null;
  address?: string | null;
  postal_code?: string | null;
}

/** Nome del campo come lo vede chi crea il modello. */
export const ETICHETTE_CAMPI: Record<string, string> = {
  nome: "Nome",
  cognome: "Cognome",
  nome_completo: "Nome completo",
  telefono: "Telefono",
  email: "Email",
  azienda: "Azienda",
  citta: "Città",
  provincia: "Provincia",
  indirizzo: "Indirizzo",
  cap: "CAP",
};

function testo(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Il valore di un campo del contatto (chiavi di templateVariableFields.ts). */
export function valoreDelCampo(
  chiave: string,
  contatto: ContattoPerModello,
  personalizzati: Record<string, string> = {},
): string {
  if (chiave.startsWith("cf:")) return testo(personalizzati[chiave.slice(3)]);
  switch (chiave) {
    case "nome": return testo(contatto.first_name);
    case "cognome": return testo(contatto.last_name);
    case "nome_completo": return [testo(contatto.first_name), testo(contatto.last_name)].filter(Boolean).join(" ");
    case "telefono": return testo(contatto.phone);
    case "email": return testo(contatto.email);
    case "azienda": return testo(contatto.company_name);
    case "citta": return testo(contatto.city);
    case "provincia": return testo(contatto.province);
    case "indirizzo": return testo(contatto.address);
    case "cap": return testo(contatto.postal_code);
    default: return "";
  }
}

/** Le posizioni legate a un campo personalizzato: servono i loro id. */
export function campiPersonalizzatiDelModello(mappatura: unknown): string[] {
  if (!mappatura || typeof mappatura !== "object") return [];
  return Object.values(mappatura as Record<string, unknown>)
    .filter((v): v is string => typeof v === "string" && v.startsWith("cf:"))
    .map((v) => v.slice(3));
}

export interface ValoriDelModello {
  /** Un valore per posizione: valori[0] è {{1}}. */
  valori: string[];
  /** Le posizioni rimaste vuote, con il campo che le doveva riempire. */
  mancanti: Array<{ posizione: number; campo: string }>;
}

/**
 * I valori del modello per il contatto. `fissi` sono i testi delle posizioni
 * senza campo, già con le variabili del flusso risolte.
 */
export function valoriDelModello(
  quante: number,
  mappatura: unknown,
  contatto: ContattoPerModello,
  personalizzati: Record<string, string> = {},
  fissi: Record<string, string> = {},
): ValoriDelModello {
  const mappa = mappatura && typeof mappatura === "object" ? (mappatura as Record<string, unknown>) : {};
  const valori: string[] = [];
  const mancanti: ValoriDelModello["mancanti"] = [];
  for (let n = 1; n <= Math.max(0, Math.floor(quante)); n++) {
    const chiave = typeof mappa[String(n)] === "string" ? (mappa[String(n)] as string) : "";
    const valore = chiave ? valoreDelCampo(chiave, contatto, personalizzati) : testo(fissi[String(n)]);
    valori.push(valore);
    if (!valore) {
      mancanti.push({
        posizione: n,
        campo: chiave ? (ETICHETTE_CAMPI[chiave] ?? (chiave.startsWith("cf:") ? "campo personalizzato" : chiave)) : "testo fisso",
      });
    }
  }
  return { valori, mancanti };
}
