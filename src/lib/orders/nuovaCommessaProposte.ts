/**
 * Cosa propone il modulo Nuova Commessa (02/11/2026). Modulo puro.
 *
 * Il modulo partiva sempre dal 22%, ma 435 commesse reali su 466 sono al 10%:
 * bastava non toccare il campo per sbagliare totale e rate.
 */
const ALIQUOTE_PROPONIBILI = new Set([4, 5, 10, 22]);
/** Sotto questo numero di commesse non c'è un'abitudine da seguire. */
const COMMESSE_MINIME = 3;

export interface AliquotaAbituale {
  aliquota: number;
  commesse: number;
  totale: number;
}

/** L'aliquota più usata dall'azienda. Mai lo 0%: è un regime da confermare caso per caso. */
export function aliquotaAbituale(aliquote: ReadonlyArray<number | string | null | undefined>): AliquotaAbituale | null {
  const conteggi = new Map<number, number>();
  let totale = 0;
  for (const a of aliquote) {
    if (a === null || a === undefined || a === "") continue;
    const n = Number(a);
    if (!ALIQUOTE_PROPONIBILI.has(n)) continue;
    conteggi.set(n, (conteggi.get(n) ?? 0) + 1);
    totale++;
  }
  if (totale < COMMESSE_MINIME) return null;
  const [aliquota, commesse] = [...conteggi.entries()].sort((a, b) => b[1] - a[1])[0];
  return { aliquota, commesse, totale };
}

/** Le email generate per i clienti senza email non dicono niente a chi legge. */
export function emailDaMostrare(email: string | null | undefined): string | null {
  const e = email?.trim();
  if (!e || /@no-email\.|\.invalid$/i.test(e)) return null;
  return e;
}

export interface ClienteDaCercare {
  id: string;
  business_name?: string | null;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
}

export function nomeCliente(c: ClienteDaCercare): string {
  return c.business_name?.trim() || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Cliente senza nome";
}

const senzaAccenti = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ogni parola scritta deve stare nel nome o nell'email vera, in qualsiasi ordine. */
export function cercaClienti<T extends ClienteDaCercare>(clienti: ReadonlyArray<T>, testo: string, massimo = 50): { risultati: T[]; altri: number } {
  const parole = senzaAccenti(testo).split(/\s+/).filter(Boolean);
  const trovati = clienti.filter((c) => {
    const dove = senzaAccenti(`${nomeCliente(c)} ${c.first_name ?? ""} ${c.last_name ?? ""} ${emailDaMostrare(c.email) ?? ""}`);
    return parole.every((p) => dove.includes(p));
  });
  return { risultati: trovati.slice(0, massimo), altri: Math.max(0, trovati.length - massimo) };
}
