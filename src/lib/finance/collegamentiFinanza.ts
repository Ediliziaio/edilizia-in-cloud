/**
 * Fatture, scadenze e movimenti bancari si rimandano l'un l'altro: qui stanno
 * gli indirizzi delle schede, le parole degli stati e il punteggio dei
 * suggerimenti di abbinamento, così le tre liste e i due popup dicono la stessa
 * cosa allo stesso modo.
 */

export const linkCommessa = (id: string) => `/azienda/ordini/${id}`;
export const linkOda = (id: string) => `/azienda/ordini-acquisto/${id}`;
export const linkFornitore = (id: string) =>
  `/azienda/impostazioni/fornitori?tab=operativo&fornitore=${encodeURIComponent(id)}`;
/** Le fatture emesse da Edilizia in Cloud hanno il loro dettaglio; quelle importate un altro. */
export const linkFattura = (id: string, nativa: boolean) =>
  nativa ? `/azienda/documenti/${id}/dettaglio` : `/azienda/documenti/importata/${id}`;
export const linkTesoreriaMovimento = (id: string) => `/azienda/tesoreria?tab=transazioni&movimento=${encodeURIComponent(id)}`;

export interface ScadenzaPerStato {
  direction: "entrata" | "uscita";
  status: string;
  due_date: string;
  amount: number;
  paid_amount: number;
}

export type TonoStato = "ok" | "attesa" | "scaduta" | "spenta";

/** Oggi in data locale (YYYY-MM-DD): le scadenze sono date, non istanti. */
export const oggiIso = (d = new Date()) => d.toLocaleDateString("en-CA");

export function giorniDaOggi(dataIso: string, oggi = oggiIso()) {
  const a = Date.UTC(+dataIso.slice(0, 4), +dataIso.slice(5, 7) - 1, +dataIso.slice(8, 10));
  const b = Date.UTC(+oggi.slice(0, 4), +oggi.slice(5, 7) - 1, +oggi.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

/**
 * Le stesse parole della colonna «Incasso» delle fatture: Da incassare,
 * Parz. incassata, Incassata (e per le uscite Da pagare, Parz. pagata, Pagata),
 * più «Scaduta» quando la data è passata e manca ancora qualcosa.
 */
export function statoScadenza(s: ScadenzaPerStato, oggi = oggiIso()): { label: string; tono: TonoStato; giorniRitardo: number } {
  const entrata = s.direction === "entrata";
  if (s.status === "annullata") return { label: "Annullata", tono: "spenta", giorniRitardo: 0 };
  const residuo = Math.round((Number(s.amount) - Number(s.paid_amount || 0)) * 100) / 100;
  if (s.status === "pagata" || residuo <= 0) return { label: entrata ? "Incassata" : "Pagata", tono: "ok", giorniRitardo: 0 };
  const ritardo = -giorniDaOggi(s.due_date, oggi);
  if (ritardo > 0) return { label: "Scaduta", tono: "scaduta", giorniRitardo: ritardo };
  if (Number(s.paid_amount) > 0) return { label: entrata ? "Parz. incassata" : "Parz. pagata", tono: "attesa", giorniRitardo: 0 };
  return { label: entrata ? "Da incassare" : "Da pagare", tono: "attesa", giorniRitardo: 0 };
}

export const CLASSE_TONO: Record<TonoStato, string> = {
  ok: "text-emerald-700 border-emerald-200 bg-emerald-50",
  attesa: "text-amber-700 border-amber-200 bg-amber-50",
  scaduta: "text-red-700 border-red-200 bg-red-50",
  spenta: "text-muted-foreground",
};

const PAROLE_VUOTE = new Set(["srl", "s", "r", "l", "spa", "p", "a", "snc", "sas", "di", "e", "la", "il", "lo", "de", "del", "della", "srls", "societa", "soc", "coop"]);

/** Nome ridotto a parole significative: «Edil Rossi S.r.l.» → ["edil","rossi"]. */
export function paroleNome(s: string | null | undefined): string[] {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !PAROLE_VUOTE.has(w));
}

/** Due nomi sono della stessa controparte se uno contiene tutte le parole dell'altro (almeno una). */
export function stessaControparte(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = paroleNome(a), pb = new Set(paroleNome(b));
  if (!pa.length || !pb.size) return false;
  const comuni = pa.filter((w) => pb.has(w)).length;
  return comuni >= Math.min(pa.length, pb.size, 2);
}

/** «Bonifico … — ODA 2026112» → «2026112». Accetta ODA-2026-0054, ODA n. 12, ordine acquisto 45. */
export function riferimentoOda(causale: string | null | undefined): string | null {
  const m = (causale ?? "").match(/\b(?:ODA|ordine\s+(?:di\s+)?acquisto)\b[\s\-_:.#°n]*([A-Z0-9][A-Z0-9\-/]{1,30})/i);
  if (!m) return null;
  const rif = m[1].replace(/[-/]+$/, "");
  // Senza almeno tre cifre («ordine di acquisto materiale», «ODA nr») non c'è un numero da cercare.
  return cifreRiferimento(rif).length >= 3 ? rif : null;
}

/** Cifre di un numero di documento, per confrontare «ODA-2026-0112» con «2026112»: si tolgono separatori e zeri iniziali dei gruppi. */
export function cifreRiferimento(s: string): string {
  return (s.match(/\d+/g) ?? []).map((g) => g.replace(/^0+(?=\d)/, "")).join("");
}

export interface MovimentoPerPunteggio {
  importo: number;
  controparte: string | null;
  causale: string | null;
}
export interface CandidatoPerPunteggio {
  titolo: string;
  sottotitolo?: string;
  residuo: number;
  affine?: boolean;
}

/**
 * Quanto un documento aperto somiglia al movimento: stesso importo, stessa
 * controparte, numero citato nella causale, proposta già fatta dal sistema.
 * Il punteggio serve a mettere in cima le scelte buone, non decide da solo.
 */
export function punteggioCandidato(m: MovimentoPerPunteggio, c: CandidatoPerPunteggio): { punteggio: number; motivi: string[] } {
  const motivi: string[] = [];
  let p = 0;
  const importo = Math.abs(Number(m.importo));
  const residuo = Number(c.residuo);
  if (Math.abs(residuo - importo) < 0.01) { p += 50; motivi.push("Stesso importo"); }
  else if (importo > 0 && Math.abs(residuo - importo) / importo <= 0.02) { p += 30; motivi.push("Importo quasi uguale"); }
  else if (residuo > importo) { p += 5; motivi.push("Il movimento ne copre una parte"); }
  if (m.controparte && (stessaControparte(m.controparte, c.sottotitolo) || stessaControparte(m.controparte, c.titolo))) {
    p += 30; motivi.push("Stessa controparte");
  }
  const causale = cifreRiferimento(m.causale ?? "");
  const numero = cifreRiferimento(c.titolo);
  if (numero.length >= 3 && causale.includes(numero)) { p += 20; motivi.push("Numero citato nella causale"); }
  if (c.affine) { p += 10; motivi.push("Già proposta dal sistema"); }
  return { punteggio: Math.min(100, p), motivi };
}
