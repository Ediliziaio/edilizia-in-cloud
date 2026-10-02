/**
 * diagnosiDnsEmail — perche' un record DNS email risulta "In attesa".
 * Niente API Deno: la usano sia la edge function sia la UI (e Vitest).
 *
 * Caso tipico: il registrar (OVH, Aruba…) aggiunge da solo il dominio al nome
 * che si scrive. Se si incolla `api._domainkey.azienda.it` finisce
 * `api._domainkey.azienda.it.azienda.it` e il provider non lo trova mai.
 */
import { dominioPrincipale } from "./dominioEmailAzienda.ts";

export type StatoDiagnosi = "ok" | "non_trovato" | "nome_doppio" | "valore_diverso" | "non_leggibile";

export interface DiagnosiRecord {
  stato: StatoDiagnosi;
  /** Frase pronta da mostrare all'azienda. */
  messaggio: string;
}

export type Risolutore = (nome: string, tipo: "TXT" | "CNAME") => Promise<string[] | null>;

/** Nome da scrivere nel pannello del registrar: `@` per la radice, altrimenti solo la parte a sinistra della zona. */
export function nomeBreve(host: string, dominio: string): string {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  const zona = dominioPrincipale(dominio.trim().toLowerCase());
  if (h === zona) return "@";
  if (h.endsWith(`.${zona}`)) return h.slice(0, -(zona.length + 1));
  return h;
}

const pulisci = (v: string) => v.replace(/^"|"$/g, "").replace(/"\s*"/g, "").replace(/\.$/, "").trim().toLowerCase();

function uguali(tipo: "TXT" | "CNAME", atteso: string, trovati: string[]): boolean {
  const a = pulisci(atteso).replace(/\s+/g, "");
  return trovati.some((t) => {
    const x = pulisci(t).replace(/\s+/g, "");
    if (tipo === "CNAME") return x === a;
    // TXT lunghi (DKIM): il provider puo' spezzarli, basta che il contenuto combaci.
    return x === a || x.includes(a) || a.includes(x);
  });
}

/** Controlla sul DNS pubblico un record atteso. Per l'SPF/DMARC (che si fondono con altri) usare solo `nome_doppio`/`non_trovato`. */
export async function diagnosticaRecord(
  rec: { type: string; host: string; value: string },
  dominio: string,
  risolvi: Risolutore,
  opzioni: { soloPresenza?: boolean } = {},
): Promise<DiagnosiRecord> {
  const tipo = rec.type === "CNAME" ? "CNAME" : "TXT";
  const host = rec.host.trim().toLowerCase().replace(/\.$/, "");
  const breve = nomeBreve(host, dominio);
  const trovati = await risolvi(host, tipo);
  if (trovati === null) return { stato: "non_leggibile", messaggio: "Non riesco a leggere il DNS in questo momento: riprova tra poco." };

  if (trovati.length > 0) {
    if (opzioni.soloPresenza || uguali(tipo, rec.value, trovati)) {
      return { stato: "ok", messaggio: "Il record è visibile su internet: il provider lo confermerà a breve." };
    }
    return {
      stato: "valore_diverso",
      messaggio: `Il nome «${breve}» esiste ma il valore non è quello atteso: sostituiscilo con quello indicato qui sopra.`,
    };
  }

  // Non c'e' nulla al nome giusto: controllo l'errore piu' comune (zona raddoppiata).
  const zona = dominioPrincipale(dominio.trim().toLowerCase());
  if (breve !== "@") {
    const doppio = `${host}.${zona}`;
    const sulDoppio = await risolvi(doppio, tipo);
    if (sulDoppio && sulDoppio.length > 0) {
      return {
        stato: "nome_doppio",
        messaggio: `Hai scritto il nome completo, ma il registrar ci aggiunge già «${zona}»: il record è finito su «${doppio}». Modificalo scrivendo solo «${breve}».`,
      };
    }
  }
  return {
    stato: "non_trovato",
    messaggio: `Non trovo ancora il record «${breve}». Se l'hai appena inserito attendi qualche minuto (a volte fino a un'ora), altrimenti controlla che nel registrar il nome sia esattamente «${breve}».`,
  };
}

/** Il provider transazionale rifiuta la chiave: non e' un problema dell'azienda ma della piattaforma. */
export function erroreChiaveTransazionale(msg: string | null | undefined): boolean {
  return !!msg && /restricted_api_key|restricted to only send|401|403|invalid api key|api key is invalid/i.test(msg);
}

export const MESSAGGIO_CANALE_TRANSAZIONALE =
  "Il canale per le email transazionali (conferme, notifiche) è in manutenzione lato piattaforma: non dipende dai tuoi DNS. Le email marketing funzionano comunque appena SPF e DKIM sono verificati. Abbiamo avvisato l'assistenza.";
