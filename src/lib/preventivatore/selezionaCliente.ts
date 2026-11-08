/**
 * Da chi prende i dati il preventivo (07/11/2026): un contatto del CRM o, per chi ha la sezione Clienti, un
 * cliente già in anagrafica. Logica pura del popup «Seleziona cliente» (`SelezionaCliente.tsx`).
 *
 * Chi vede cosa:
 *  · Contatti CRM — chi ha i contatti (o è amministratore). «Solo i propri» lo applica il database: le regole
 *    di lettura di marketing_contacts tengono fuori i contatti assegnati ad altri.
 *  · Clienti — solo chi ha la sezione Clienti. Con «Solo i propri» si vedono soltanto i clienti di cui si è il
 *    venditore; chi non è un venditore non ne vede nessuno. (La lettura dei clienti nel database oggi è più
 *    larga: vedi il rapporto del 07/11/2026.)
 */
export type OrigineScelta = "contatto" | "cliente";

/** Quello che serve al preventivo, da un contatto o da un cliente. */
export interface ClienteScelto {
  origine: OrigineScelta;
  id: string;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  ragioneSociale: string | null;
  codiceFiscale: string | null;
  partitaIva: string | null;
  indirizzo: string | null;
  citta: string | null;
  cap: string | null;
  provincia: string | null;
}

export interface RigaContattoCrm {
  id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null;
  address?: string | null; city?: string | null; province?: string | null; postal_code?: string | null;
  company_name?: string | null; fiscal_code?: string | null; vat_number?: string | null;
}

export interface RigaClienteAnagrafica {
  id: string; first_name: string | null; last_name: string | null; is_business?: boolean | null; business_name?: string | null;
  email: string | null; phone: string | null; fiscal_code?: string | null;
  address?: string | null; city?: string | null; postal_code?: string | null; province?: string | null;
  vat_number?: string | null;
}

const pulito = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/**
 * Le email tecniche dei clienti senza email (`…@no-email.ediliziaincloud.local`, `…@demo-….invalid`): servono al
 * database, non sono un recapito. Non si mostrano e non finiscono nel preventivo.
 */
export function emailVera(v: string | null | undefined): string | null {
  const e = pulito(v);
  if (!e || !e.includes("@")) return null;
  const dominio = e.slice(e.lastIndexOf("@") + 1).toLowerCase();
  return dominio === "no-email.ediliziaincloud.local" || dominio.endsWith(".invalid") || dominio.endsWith(".local") ? null : e;
}

export function daContatto(c: RigaContattoCrm): ClienteScelto {
  return {
    origine: "contatto", id: c.id,
    nome: pulito(c.first_name), cognome: pulito(c.last_name), email: emailVera(c.email), telefono: pulito(c.phone),
    ragioneSociale: pulito(c.company_name), codiceFiscale: pulito(c.fiscal_code), partitaIva: pulito(c.vat_number),
    indirizzo: pulito(c.address), citta: pulito(c.city), cap: pulito(c.postal_code), provincia: pulito(c.province),
  };
}

export function daCliente(c: RigaClienteAnagrafica): ClienteScelto {
  return {
    origine: "cliente", id: c.id,
    nome: pulito(c.first_name), cognome: pulito(c.last_name), email: emailVera(c.email), telefono: pulito(c.phone),
    ragioneSociale: c.is_business || c.business_name ? pulito(c.business_name) : null,
    codiceFiscale: pulito(c.fiscal_code), partitaIva: pulito(c.vat_number),
    indirizzo: pulito(c.address), citta: pulito(c.city), cap: pulito(c.postal_code), provincia: pulito(c.province),
  };
}

/** Il nome da mostrare: persona, altrimenti azienda, altrimenti email. */
export function nomeDaMostrare(c: ClienteScelto): string {
  return [c.nome, c.cognome].filter(Boolean).join(" ") || c.ragioneSociale || c.email || "Senza nome";
}

/** Privato o azienda, come lo legge il passo Cliente. */
export function tipoDaScelta(c: ClienteScelto): "privato" | "azienda" {
  return c.ragioneSociale || c.partitaIva ? "azienda" : "privato";
}

/** Sotto il nome, piccolo: l'azienda (se non è già il nome) e partita IVA o codice fiscale. */
export function sottotitoloDaMostrare(c: ClienteScelto): string {
  const nomePersona = [c.nome, c.cognome].filter(Boolean).join(" ");
  const aziendaDiversa = !!c.ragioneSociale && !!nomePersona && c.ragioneSociale.toLowerCase() !== nomePersona.toLowerCase();
  return [aziendaDiversa ? c.ragioneSociale : null, c.partitaIva ? `P.IVA ${c.partitaIva}` : c.codiceFiscale ? `CF ${c.codiceFiscale}` : null]
    .filter(Boolean).join(" · ");
}

/** La seconda riga del popup: i dati che servono a riconoscere la persona giusta. */
export function dettagliDaMostrare(c: ClienteScelto): string[] {
  const nomePersona = [c.nome, c.cognome].filter(Boolean).join(" ");
  // L'azienda nei dettagli solo se non è già il nome mostrato (Costruzioni Alpine S.r.l. due volte, 07/11/2026).
  const aziendaDiversa = !!c.ragioneSociale && !!nomePersona && c.ragioneSociale.toLowerCase() !== nomePersona.toLowerCase();
  return [
    aziendaDiversa ? c.ragioneSociale : null,
    c.telefono, c.email,
    [c.citta, c.provincia ? `(${c.provincia})` : null].filter(Boolean).join(" ") || null,
    c.partitaIva ? `P.IVA ${c.partitaIva}` : c.codiceFiscale ? `CF ${c.codiceFiscale}` : null,
  ].filter((x): x is string => !!x);
}

export interface PermessiScelta {
  isAdmin?: boolean;
  canViewMarketingContacts?: boolean;
  canViewCustomers?: boolean;
  onlyAssigned?: boolean;
  isLoading?: boolean;
}

/** Quali linguette ha il popup, e se i clienti vanno ristretti al venditore. */
export function fontiVisibili(p: PermessiScelta | null | undefined): { contatti: boolean; clienti: boolean; soloMieiClienti: boolean } {
  if (!p || p.isLoading) return { contatti: false, clienti: false, soloMieiClienti: false };
  return {
    contatti: !!p.isAdmin || !!p.canViewMarketingContacts,
    clienti: !!p.isAdmin || !!p.canViewCustomers,
    soloMieiClienti: !p.isAdmin && !!p.onlyAssigned,
  };
}
