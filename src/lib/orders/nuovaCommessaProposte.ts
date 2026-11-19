/**
 * Cosa propone il modulo Nuova Commessa (02/11/2026). Modulo puro.
 *
 * Il modulo partiva sempre dal 22%, ma 435 commesse reali su 466 sono al 10%:
 * bastava non toccare il campo per sbagliare totale e rate.
 */
const ALIQUOTE_PROPONIBILI = new Set([4, 10, 22]);
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
  // Dati per riconoscerlo e cercarlo (clienti_per_scelta, 15/11/2026): facoltativi.
  is_business?: boolean | null;
  tipo_cliente?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  site_address?: string | null;
  site_city?: string | null;
  vat_number?: string | null;
  fiscal_code?: string | null;
}

export function nomeCliente(c: ClienteDaCercare): string {
  return c.business_name?.trim() || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Cliente senza nome";
}

const senzaAccenti = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soloCifre = (s: string) => s.replace(/\D/g, "");

/** Il referente, se diverso dal nome mostrato (per un'azienda o un condominio). */
export function referenteCliente(c: ClienteDaCercare): string | null {
  const persona = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
  if (!persona || !c.business_name?.trim()) return null;
  const nome = senzaAccenti(c.business_name);
  return nome.includes(senzaAccenti(persona)) ? null : persona;
}

/** Indirizzo leggibile: via e città, senza ripetere la città se la via la contiene già. */
export function indirizzoCliente(c: ClienteDaCercare): string | null {
  const via = c.address?.trim() || "";
  const citta = c.city?.trim() || "";
  const prov = c.province?.trim();
  const conCitta = citta && !senzaAccenti(via).includes(senzaAccenti(citta))
    ? `${citta}${prov && prov.length <= 3 ? ` (${prov.toUpperCase()})` : ""}` : "";
  const testo = [via, conCitta].filter(Boolean).join(", ");
  return testo || null;
}

/** Privato, Azienda o PA: dall'anagrafica fiscale, se no da «cliente azienda». */
export function tipoCliente(c: ClienteDaCercare): "Privato" | "Azienda" | "PA" | null {
  if (c.tipo_cliente === "PA") return "PA";
  if (c.tipo_cliente === "B2B") return "Azienda";
  if (c.tipo_cliente === "B2C") return "Privato";
  if (c.is_business === true) return "Azienda";
  if (c.is_business === false) return "Privato";
  return null;
}

/**
 * Ogni parola scritta deve stare da qualche parte: nome, referente, email vera, telefono,
 * indirizzo e città (anche del cantiere), partita IVA o codice fiscale, in qualsiasi ordine.
 * Un numero si confronta senza spazi né prefissi («333 12» trova «+39 333 1234567»).
 * Prima chi ha il nome che comincia con la prima parola, poi chi la ha nel nome, poi gli altri;
 * a parità, ordine alfabetico «naturale» (2 prima di 10). Senza testo l'ordine resta quello dato.
 */
export function cercaClienti<T extends ClienteDaCercare>(clienti: ReadonlyArray<T>, testo: string, massimo = 50): { risultati: T[]; altri: number } {
  const parole = senzaAccenti(testo).split(/\s+/).filter(Boolean);
  if (parole.length === 0) return { risultati: clienti.slice(0, massimo), altri: Math.max(0, clienti.length - massimo) };
  // Le cifre scritte tutte insieme («333 1234567») valgono anche come un solo numero.
  const cifreTesto = soloCifre(testo);
  const ordinatore = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

  const punteggiati: Array<{ c: T; punti: number; nome: string }> = [];
  for (const c of clienti) {
    const nome = senzaAccenti(nomeCliente(c));
    const persona = senzaAccenti(`${c.first_name ?? ""} ${c.last_name ?? ""}`);
    const altro = senzaAccenti([
      emailDaMostrare(c.email), c.address, c.city, c.province, c.site_address, c.site_city, c.vat_number, c.fiscal_code,
    ].filter(Boolean).join(" "));
    const telefono = soloCifre(c.phone ?? "");
    const numeri = `${telefono} ${soloCifre(c.vat_number ?? "")}`;
    const dove = `${nome} ${persona} ${altro}`;
    const trova = (p: string) => {
      if (dove.includes(p)) return true;
      const cifre = soloCifre(p);
      return cifre.length >= 3 && cifre.length === p.replace(/[\s+().-]/g, "").length && numeri.includes(cifre);
    };
    const tutte = parole.every(trova)
      || (cifreTesto.length >= 5 && /^[\d\s+().-]+$/.test(testo.trim()) && (telefono.includes(cifreTesto) || numeri.includes(cifreTesto)));
    if (!tutte) continue;
    const prima = parole[0];
    const parolaNome = nome.split(/[\s.,'’-]+/);
    const punti = nome.startsWith(prima) ? 0
      : parolaNome.some((w) => w.startsWith(prima)) ? 1
      : parole.every((p) => nome.includes(p) || persona.includes(p)) ? 2
      : 3;
    punteggiati.push({ c, punti, nome });
  }
  punteggiati.sort((a, b) => a.punti - b.punti || ordinatore.compare(a.nome, b.nome));
  const trovati = punteggiati.map((x) => x.c);
  return { risultati: trovati.slice(0, massimo), altri: Math.max(0, trovati.length - massimo) };
}

export interface DatiNuovoCliente {
  nome?: string;
  telefono?: string;
  email?: string;
  partitaIva?: string;
  codiceFiscale?: string;
}

/**
 * Clienti già in anagrafica che sembrano quello che si sta creando: stessa partita IVA o codice
 * fiscale, stesso telefono (ultime 9 cifre, così «+39 333…» e «333…» coincidono), stessa email
 * vera, o stesso nome (senza accenti, maiuscole e forme societarie). Al massimo `massimo`.
 */
export function clientiSimili<T extends ClienteDaCercare>(
  clienti: ReadonlyArray<T>, dati: DatiNuovoCliente, massimo = 3,
): Array<{ cliente: T; motivo: string }> {
  const piva = soloCifre(dati.partitaIva ?? "");
  const cf = (dati.codiceFiscale ?? "").trim().toUpperCase();
  const tel = soloCifre(dati.telefono ?? "").slice(-9);
  const mail = emailDaMostrare(dati.email)?.toLowerCase() ?? "";
  const nomeNorm = (s: string) => senzaAccenti(s)
    .replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|soc(ieta)?|coop)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
  const nome = nomeNorm(dati.nome ?? "");
  const trovati: Array<{ cliente: T; motivo: string }> = [];
  for (const c of clienti) {
    let motivo: string | null = null;
    if (piva.length >= 11 && soloCifre(c.vat_number ?? "") === piva) motivo = "stessa P.IVA";
    else if (cf.length >= 11 && (c.fiscal_code ?? "").trim().toUpperCase() === cf) motivo = "stesso codice fiscale";
    else if (tel.length >= 8 && soloCifre(c.phone ?? "").slice(-9) === tel) motivo = "stesso telefono";
    else if (mail && emailDaMostrare(c.email)?.toLowerCase() === mail) motivo = "stessa email";
    else if (nome.length >= 4) {
      const loro = [nomeCliente(c), `${c.first_name ?? ""} ${c.last_name ?? ""}`, `${c.last_name ?? ""} ${c.first_name ?? ""}`].map(nomeNorm);
      if (loro.includes(nome)) motivo = "stesso nome";
    }
    if (motivo) trovati.push({ cliente: c, motivo });
    if (trovati.length >= massimo) break;
  }
  return trovati;
}
