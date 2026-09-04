/**
 * Riconoscimento di un cliente già in anagrafica.
 *
 * Perché serve: quando il portale clienti è disattivato, `create-customer`
 * genera un'email tecnica unica (`cliente-<uuid>@…`) per rispettare il vincolo
 * su auth/profiles. Quel vincolo era l'unica cosa che impediva di inserire due
 * volte lo stesso cliente: con l'email finta non impedisce più niente, e lo
 * stesso cliente entra dieci volte senza che nessuno se ne accorga — finché non
 * si cerca in fatturazione.
 *
 * Qui non si blocca: si avvisa. Le omonimie esistono e due aziende possono
 * davvero condividere un centralino; la decisione resta a chi sta inserendo.
 */

/** Solo le cifre: "+39 333 / 123-4567" → "393331234567". */
export function soloCifre(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D+/g, "");
}

/**
 * Parte significativa di un numero italiano: si scarta il prefisso
 * internazionale e si tengono le ultime 9-10 cifre, così "+39 333 1234567",
 * "0039 3331234567" e "333 123 45 67" si riconoscono fra loro.
 */
export function nucleoTelefono(raw: string | null | undefined): string {
  let d = soloCifre(raw);
  if (d.startsWith("0039")) d = d.slice(4);
  else if (d.startsWith("39") && d.length > 10) d = d.slice(2);
  if (d.length < 6) return ""; // troppo corto per dire qualcosa
  return d.slice(-9);
}

/** P.IVA e codice fiscale: maiuscole, senza spazi, senza il prefisso IT. */
export function normalizzaFiscale(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase().replace(/^IT/, "");
}

/**
 * Pattern PostgREST `ilike` che ignora spazi e punteggiatura fra le cifre:
 * "3331234567" → "%3%3%3%1%2%3%4%5%6%7%". Serve perché in anagrafica i telefoni
 * sono scritti in dieci modi diversi e non esiste una colonna normalizzata.
 * Restituisce "" se il numero è troppo corto per essere indicativo.
 */
export function patternTelefonoIlike(raw: string | null | undefined): string {
  const nucleo = nucleoTelefono(raw);
  if (!nucleo) return "";
  return `%${nucleo.split("").join("%")}%`;
}

export type MotivoDuplicato = "vat" | "fiscal" | "phone";

export interface ClienteEsistente {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name?: string | null;
  email?: string | null;
  phone?: string | null;
  fiscal_code?: string | null;
  vat_number?: string | null;
}

export interface DatiNuovoCliente {
  vatNumber?: string | null;
  fiscalCode?: string | null;
  phone?: string | null;
}

export interface Somiglianza {
  cliente: ClienteEsistente;
  motivi: MotivoDuplicato[];
}

export const ETICHETTA_MOTIVO: Record<MotivoDuplicato, string> = {
  vat: "stessa partita IVA",
  fiscal: "stesso codice fiscale",
  phone: "stesso telefono",
};

/** Nome leggibile di un cliente, ragione sociale se c'è. */
export function nomeCliente(c: ClienteEsistente): string {
  const nome = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  return (c.business_name || "").trim() || nome || c.email || "cliente senza nome";
}

/**
 * Confronta i dati digitati con i clienti candidati e restituisce solo quelli
 * che combaciano davvero, col motivo. Puro: la query la fa il chiamante.
 */
export function trovaSomiglianze(
  candidati: ClienteEsistente[],
  dati: DatiNuovoCliente,
): Somiglianza[] {
  const vat = normalizzaFiscale(dati.vatNumber);
  const cf = normalizzaFiscale(dati.fiscalCode);
  const tel = nucleoTelefono(dati.phone);

  const esiti: Somiglianza[] = [];
  for (const c of candidati) {
    const motivi: MotivoDuplicato[] = [];
    if (vat && normalizzaFiscale(c.vat_number) === vat) motivi.push("vat");
    if (cf && normalizzaFiscale(c.fiscal_code) === cf) motivi.push("fiscal");
    if (tel && nucleoTelefono(c.phone) === tel) motivi.push("phone");
    if (motivi.length > 0) esiti.push({ cliente: c, motivi });
  }
  // Prima chi combacia su più campi: è quello di cui si è più sicuri.
  return esiti.sort((a, b) => b.motivi.length - a.motivi.length);
}

/** Frase pronta per l'avviso: "stessa partita IVA e stesso telefono". */
export function descriviMotivi(motivi: MotivoDuplicato[]): string {
  const parti = motivi.map((m) => ETICHETTA_MOTIVO[m]);
  if (parti.length <= 1) return parti[0] ?? "";
  return `${parti.slice(0, -1).join(", ")} e ${parti[parti.length - 1]}`;
}
