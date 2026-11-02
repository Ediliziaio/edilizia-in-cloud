/**
 * L'intestazione dei documenti (verbale SAL, giornale lavori, cedolino).
 *
 * Quelle funzioni chiedevano ad anagrafica_azienda `indirizzo, citta, cap`, che
 * nella tabella si chiamano indirizzo_via, indirizzo_comune, indirizzo_cap: la
 * lettura falliva sempre e il verbale rispondeva «Anagrafica azienda non
 * configurata» anche a chi l'aveva compilata. L'anagrafica vince, campo per campo;
 * quello che manca viene dalla scheda azienda, che tutte le aziende hanno.
 *
 * Niente import esterni: lo usano sia le funzioni sia i test.
 */
import { logoDiRiserva } from "./logoAzienda.ts";

export const COLONNE_ANAGRAFICA =
  "ragione_sociale, partita_iva, colore_primario, logo_url, indirizzo_via, indirizzo_numero_civico, indirizzo_cap, indirizzo_comune, indirizzo_provincia, telefono, email";
export const COLONNE_AZIENDA =
  "name, vat_number, logo_url, phone, email, legal_address, legal_city, legal_postal_code, legal_province";

export interface AziendaDocumento {
  ragione_sociale: string;
  partita_iva: string | null;
  colore_primario: string | null;
  logo_url: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  telefono: string | null;
  email: string | null;
}

type Riga = Record<string, string | null | undefined>;
const primo = (...valori: Array<string | null | undefined>) => valori.find((v) => typeof v === "string" && v.trim())?.trim() ?? null;

export function aziendaPerDocumento(anagrafica: Riga | null | undefined, azienda: Riga | null | undefined): AziendaDocumento | null {
  const a = anagrafica ?? {};
  const c = azienda ?? {};
  const ragioneSociale = primo(a.ragione_sociale, c.name);
  if (!ragioneSociale) return null;
  const via = [a.indirizzo_via, a.indirizzo_numero_civico].map((v) => v?.trim()).filter(Boolean).join(" ");
  return {
    ragione_sociale: ragioneSociale,
    partita_iva: primo(a.partita_iva, c.vat_number),
    colore_primario: primo(a.colore_primario),
    logo_url: logoDiRiserva(a.logo_url, c.logo_url),
    indirizzo: primo(via, c.legal_address),
    citta: primo(a.indirizzo_comune, c.legal_city),
    cap: primo(a.indirizzo_cap, c.legal_postal_code),
    telefono: primo(a.telefono, c.phone),
    email: primo(a.email, c.email),
  };
}

// deno-lint-ignore no-explicit-any
export async function leggiAziendaDocumento(db: any, companyId: string): Promise<AziendaDocumento | null> {
  const [anagrafica, azienda] = await Promise.all([
    db.from("anagrafica_azienda").select(COLONNE_ANAGRAFICA).eq("company_id", companyId).maybeSingle(),
    db.from("companies").select(COLONNE_AZIENDA).eq("id", companyId).maybeSingle(),
  ]);
  if (anagrafica.error) console.error("[aziendaDocumento] anagrafica non letta:", anagrafica.error.message);
  if (azienda.error) console.error("[aziendaDocumento] azienda non letta:", azienda.error.message);
  return aziendaPerDocumento(anagrafica.data, azienda.data);
}
