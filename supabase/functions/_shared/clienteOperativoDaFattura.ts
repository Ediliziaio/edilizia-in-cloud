// Il cliente di una fattura importata finisce nei Clienti, non nei Contatti del CRM
// (20/10/2026): un contatto del CRM diventa cliente, e al cliente si fanno le
// fatture. Chi arriva già fatturato da Fatture in Cloud o Aruba è un cliente.
//
// Stessa strada del pulsante «Recupera clienti dallo storico»
// (src/components/fatturazione/RecuperaClientiImportati.tsx) e del ramo
// `imported_invoice_id` di create-customer, ma senza un utente davanti:
//   1. riconcilia_cliente_emessa_importata(apply) crea o completa l'anagrafica
//      fiscale e dice se il cliente esiste già (per P.IVA/CF, contando TUTTI i
//      candidati: con più di uno risponde «da_verificare» e qui ci si ferma);
//   2. se manca, si crea il cliente con portale spento e account bloccato.
//      L'email di accesso è tecnica e deterministica (azienda + P.IVA/CF): due
//      giri sovrapposti finiscono su «email già registrata», non su un doppione;
//   3. di nuovo la riconciliazione, che lega l'anagrafica fiscale al cliente.
// Nessuna email, nessun invito, nessun contatto CRM.

// deno-lint-ignore-file no-explicit-any
import { sanitizeCustomerInput } from "./customerDataSanitizer.ts";
import { generateSecurePassword } from "./securePassword.ts";
import { emailTecnicaClienteImportato } from "./clienteDaEmessaImportata.ts";

export type EsitoClienteDaFattura =
  | { esito: "collegato"; customer_id: string; creato: boolean }
  | { esito: "da_verificare"; motivo: string }
  | { esito: "errore"; motivo: string };

type Fattura = {
  id: string;
  client_company_name: string | null;
  client_email: string | null;
  client_fiscal_code: string | null;
  client_vat_number: string | null;
  client_address: string | null;
  client_city: string | null;
  client_zip: string | null;
  client_country: string | null;
};

const VOCALI = /[AEIOU]/;
/**
 * Il codice fiscale come sta nella fattura, pulito per il confronto: solo
 * lettere e cifre, maiuscolo. Alcuni gestionali scrivono nel campo del codice
 * fiscale la partita IVA CON il prefisso «IT» (IT14972911003): per il database
 * non è un codice fiscale (13 caratteri), per la legge è il codice fiscale di
 * una società, 11 cifre. Si toglie il prefisso solo se segue esattamente una
 * partita IVA; un codice fiscale di persona non comincia mai così.
 */
export function codiceFiscaleDaFattura(grezzo: string | null | undefined): string | null {
  const pulito = (grezzo || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  return pulito.replace(/^IT(?=\d{11}$)/, "") || null;
}

function lettere(parte: string): { consonanti: string[]; vocali: string[] } {
  const l = parte.toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "").split("");
  return { consonanti: l.filter((c) => !VOCALI.test(c)), vocali: l.filter((c) => VOCALI.test(c)) };
}
/** Le 3 lettere del cognome nel codice fiscale. */
export function codiceCognome(cognome: string): string {
  const { consonanti, vocali } = lettere(cognome);
  return [...consonanti, ...vocali, "X", "X", "X"].slice(0, 3).join("");
}
/** Le 3 lettere del nome nel codice fiscale (con 4+ consonanti: prima, terza e quarta). */
export function codiceNome(nome: string): string {
  const { consonanti, vocali } = lettere(nome);
  if (consonanti.length >= 4) return consonanti[0] + consonanti[2] + consonanti[3];
  return [...consonanti, ...vocali, "X", "X", "X"].slice(0, 3).join("");
}

/**
 * Nome e cognome di una persona dall'intestatario. L'ordine sulle fatture non è
 * fisso («ROSSI MARIO», «Elena Piovano»): decide il codice fiscale, che porta le
 * lettere di cognome e nome. Senza codice fiscale: cognome prima, con la
 * particella («DE LUCA ANNA») attaccata al cognome.
 */
export function nomeDaIntestatario(intestatario: string, codiceFiscale?: string | null): { first_name: string; last_name: string } {
  const parti = intestatario.replace(/\s+/g, " ").trim().split(" ");
  if (parti.length < 2) return { first_name: "", last_name: parti[0] || "—" };
  const cf = (codiceFiscale || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (cf.length === 16) {
    for (let i = 1; i < parti.length; i++) {
      const prima = parti.slice(0, i).join(" "), dopo = parti.slice(i).join(" ");
      if (codiceCognome(prima) === cf.slice(0, 3) && codiceNome(dopo) === cf.slice(3, 6)) return { last_name: prima, first_name: dopo };
      if (codiceCognome(dopo) === cf.slice(0, 3) && codiceNome(prima) === cf.slice(3, 6)) return { last_name: dopo, first_name: prima };
    }
  }
  const particella = /^(DE|DI|DA|DEL|DELLA|DELLO|DEGLI|DAL|DALLA|LO|LA|LI|D'|DELL')$/i.test(parti[0]);
  const lunghezza = particella && parti.length > 2 ? 2 : 1;
  return { last_name: parti.slice(0, lunghezza).join(" "), first_name: parti.slice(lunghezza).join(" ") };
}

async function riconcilia(supabase: any, companyId: string, invoiceId: string) {
  const { data, error } = await supabase.rpc("riconcilia_cliente_emessa_importata", {
    p_company_id: companyId, p_invoice_id: invoiceId, p_apply: true,
  });
  if (error) throw new Error(`Riconciliazione: ${error.message}`);
  return data as { status: string; motivo?: string; customer_id?: string | null; cliente_operativo_mancante?: boolean };
}

export async function clienteDaFatturaImportata(
  supabase: any, companyId: string, fattura: Fattura,
): Promise<EsitoClienteDaFattura> {
  try {
    const prima = await riconcilia(supabase, companyId, fattura.id);
    if (prima.status !== "ok") return { esito: "da_verificare", motivo: prima.motivo || "Identità da verificare" };
    if (prima.customer_id) return { esito: "collegato", customer_id: prima.customer_id, creato: false };

    const intestatario = (fattura.client_company_name || "").trim();
    if (!intestatario) return { esito: "da_verificare", motivo: "Intestatario assente" };
    // Azienda: ha la partita IVA, oppure un codice fiscale di 11 cifre (quello
    // delle società). Una persona ha il codice fiscale di 16 caratteri.
    const cfFattura = codiceFiscaleDaFattura(fattura.client_fiscal_code);
    const ivaFattura = (fattura.client_vat_number || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase().replace(/^IT/, "") || null;
    const azienda = !!ivaFattura || /^\d{11}$/.test(cfFattura || "");
    const persona = azienda ? { first_name: "", last_name: intestatario } : nomeDaIntestatario(intestatario, fattura.client_fiscal_code);

    const pulito = sanitizeCustomerInput({
      first_name: persona.first_name, last_name: persona.last_name,
      email: fattura.client_email, fiscal_code: fattura.client_fiscal_code, vat_number: fattura.client_vat_number,
      address: fattura.client_address,
    } as any);
    const emailAccesso = await emailTecnicaClienteImportato(companyId, {
      fiscal_code: fattura.client_fiscal_code, vat_number: fattura.client_vat_number,
    });
    // Per un'azienda il nome è la ragione sociale, intera: il sanitizer la
    // dividerebbe in «nome» e «cognome» come se fosse una persona.
    const nome = azienda ? "" : (pulito.first_name || "—");
    const cognome = azienda ? intestatario.slice(0, 200) : (pulito.last_name || "—");
    const emailVera = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pulito.email || "") ? pulito.email : null;

    const { data: utente, error: errUtente } = await supabase.auth.admin.createUser({
      email: emailAccesso,
      password: generateSecurePassword(32),
      email_confirm: true,
      user_metadata: { first_name: nome, last_name: cognome },
    });
    if (errUtente) {
      // Un altro giro l'ha appena creato: si ricollega invece di fallire.
      const giaCreato = errUtente.message?.includes("already been registered") || (errUtente as any).code === "email_exists";
      if (!giaCreato) return { esito: "errore", motivo: `Account: ${errUtente.message}` };
      const dopo = await riconcilia(supabase, companyId, fattura.id);
      return dopo.status === "ok" && dopo.customer_id
        ? { esito: "collegato", customer_id: dopo.customer_id, creato: false }
        : { esito: "da_verificare", motivo: dopo.motivo || "Cliente già in creazione" };
    }
    const id = utente.user.id as string;

    const testo = (v: string | null | undefined, max: number) => {
      const s = (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
      return s || null;
    };
    const { error: errProfilo } = await supabase.from("profiles").insert({
      id,
      first_name: nome,
      last_name: cognome,
      // L'email vera della fattura, se c'è, è quella da mostrare; quella tecnica serve solo all'account.
      email: emailVera || emailAccesso,
      phone: pulito.phone,
      address: pulito.address,
      company_id: companyId,
      // I dati fiscali sono quelli della fattura, scritti come li confronta
      // norm_id_fiscale: il sanitizer sposterebbe un CF di 11 cifre nella P.IVA,
      // e la riconciliazione non ritroverebbe più il cliente.
      fiscal_code: cfFattura,
      vat_number: ivaFattura,
      is_business: azienda,
      business_name: azienda ? intestatario.slice(0, 200) : null,
      customer_type: "privato",
      city: testo(fattura.client_city, 100),
      postal_code: testo(fattura.client_zip, 10),
      country: (testo(fattura.client_country, 2) || "IT").toUpperCase(),
      notes: "Cliente creato dalle fatture importate.",
      portal_disabled: true,
      is_blocked: true,
    });
    if (errProfilo) {
      await supabase.auth.admin.deleteUser(id);
      // Un dato fiscale che il database rifiuta («Codice fiscale non valido»,
      // «Partita IVA non valida») non cambia riprovando: la fattura si segna
      // da verificare. Come «errore» veniva ripresa ogni 5 minuti, per sempre,
      // creando e cancellando un account ogni volta (288 volte in un giorno).
      if (/non valid[oa]/i.test(errProfilo.message)) {
        return { esito: "da_verificare", motivo: `Profilo: ${errProfilo.message}` };
      }
      return { esito: "errore", motivo: `Profilo: ${errProfilo.message}` };
    }
    const { error: errRuolo } = await supabase.from("user_roles").insert({ user_id: id, role: "customer" });
    if (errRuolo) {
      await supabase.from("profiles").delete().eq("id", id);
      await supabase.auth.admin.deleteUser(id);
      return { esito: "errore", motivo: `Ruolo: ${errRuolo.message}` };
    }

    const dopo = await riconcilia(supabase, companyId, fattura.id);
    if (dopo.status === "ok" && dopo.customer_id) return { esito: "collegato", customer_id: dopo.customer_id, creato: true };
    return { esito: "da_verificare", motivo: dopo.motivo || "Cliente creato ma non collegato" };
  } catch (e) {
    return { esito: "errore", motivo: e instanceof Error ? e.message : String(e) };
  }
}
