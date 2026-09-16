/**
 * Il selettore DKIM letto dai record NSEC di una zona firmata DNSSEC.
 *
 * Register genera un selettore diverso per ogni dominio («key-la4nd14ln9») e
 * non lo scrive da nessuna parte: fino al 16/09/2026 andava copiato a mano dal
 * pannello del provider, dominio per dominio. Ma le zone di Register sono
 * firmate DNSSEC con NSEC: se si chiede un nome che non esiste sotto
 * `_domainkey`, la risposta porta il record NSEC che prova l'assenza, e quel
 * record nomina i nomi veri più vicini. Chiedendo «zzzzzz._domainkey.dominio»
 * il vicino è proprio «key-…._domainkey.dominio»: il selettore, senza mandare
 * nessuna email. Provato su 22 domini Register su 25; i tre «.me» non sono
 * firmati e restano da scrivere a mano.
 *
 * Modulo puro: la domanda DNS la fa il chiamante.
 */

/** Un record della risposta JSON di DNS-over-HTTPS (dns.google, cloudflare-dns.com). */
export interface RecordDoh { name?: string; type?: number; data?: string }

/** Il nome inesistente da chiedere: «z» viene dopo «key-» nell'ordine DNS. */
export const NOME_SONDA_DKIM = "zzzzzz";

const TIPO_NSEC = 47;

/** I selettori nominati dai record NSEC della sezione Authority. */
export function selettoriDaNsec(authority: RecordDoh[] | null | undefined, dominio: string): string[] {
  const suffisso = `._domainkey.${dominio.trim().toLowerCase().replace(/\.$/, "")}.`;
  const trovati = new Set<string>();
  for (const r of authority ?? []) {
    if (r.type !== TIPO_NSEC) continue;
    // Il nome del record e il «prossimo nome», primo campo dei dati.
    for (const nome of [r.name ?? "", (r.data ?? "").split(" ")[0]]) {
      const n = nome.toLowerCase();
      if (!n.endsWith(suffisso)) continue;
      const selettore = n.slice(0, -suffisso.length);
      if (selettore && !selettore.includes(".") && selettore !== NOME_SONDA_DKIM) trovati.add(selettore);
    }
  }
  return [...trovati];
}
