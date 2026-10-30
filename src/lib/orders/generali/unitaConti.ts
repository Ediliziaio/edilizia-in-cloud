// src/lib/orders/generali/unitaConti.ts
// I conti delle unità, in lettura: quanto è venduto e incassato, la quota dei costi comuni
// di ogni unità, il margine, cosa chiede il D.Lgs. 122/2005, come si divide un'unità.
// Niente React né database: i dati arrivano da `generale_unita_elenco` (unita.ts).
import {
  confrontaSigle, isIncasso, prezzoCorrente, unitaVive, type ElencoUnita, type StatoVendita, type UnitaGenerale,
} from "@/lib/orders/generali/unita";

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/**
 * Divide `totale` in parti proporzionali ai pesi, con `decimali` cifre: gli spiccioli che
 * avanzano vanno alle parti con il resto più grande, così la somma torna sempre al centesimo.
 * Pesi tutti a zero: parti uguali.
 */
export function ripartisci(totale: number, pesi: number[], decimali = 2): number[] {
  if (pesi.length === 0) return [];
  if (totale < 0) return ripartisci(-totale, pesi, decimali).map((q) => (q === 0 ? 0 : -q));
  const scala = 10 ** decimali;
  const pesiPositivi = pesi.map((p) => (Number.isFinite(p) && p > 0 ? p : 0));
  const somma = pesiPositivi.reduce((t, p) => t + p, 0);
  const usati = somma > 0 ? pesiPositivi : pesi.map(() => 1);
  const sommaUsati = somma > 0 ? somma : pesi.length;
  const unita = Math.round(totale * scala);
  const esatte = usati.map((p) => (unita * p) / sommaUsati);
  const base = esatte.map((e) => Math.floor(e));
  let avanzo = unita - base.reduce((t, b) => t + b, 0);
  const ordine = esatte.map((e, i) => ({ i, resto: e - Math.floor(e) })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; avanzo > 0 && k < ordine.length; k++, avanzo--) base[ordine[k].i] += 1;
  return base.map((b) => b / scala);
}

// ── Pagamenti di un'unità ────────────────────────────────────────────────────

export interface PagamentiUnita {
  /** Caparra, acconti e saldo. */
  incassato: number | null;
  /** Valore delle permute: paga il prezzo senza incasso. */
  permute: number | null;
  /** Incassato più permute. */
  pagato: number | null;
  /** Prezzo corrente meno pagato (mai sotto zero); null su un'unità libera o senza prezzo. */
  residuo: number | null;
}

export function pagamentiUnita(u: UnitaGenerale): PagamentiUnita {
  if (u.movimenti.some((m) => m.importo === null)) return { incassato: null, permute: null, pagato: null, residuo: null };
  const incassato = arrotonda(u.movimenti.filter((m) => isIncasso(m.tipo)).reduce((t, m) => t + (m.importo ?? 0), 0));
  const permute = arrotonda(u.movimenti.filter((m) => m.tipo === "permuta").reduce((t, m) => t + (m.importo ?? 0), 0));
  const pagato = arrotonda(incassato + permute);
  const prezzo = prezzoCorrente(u);
  return {
    incassato,
    permute,
    pagato,
    residuo: u.stato === "libera" || prezzo === null ? null : arrotonda(Math.max(0, prezzo - pagato)),
  };
}

// ── Il riquadro: stati, venduto, incassato ───────────────────────────────────

export interface RiepilogoVendite {
  unita: number;
  conteggi: Record<StatoVendita, number>;
  /** Prezzi di compromessi e rogiti: quello che è venduto davvero. */
  venduto: number | null;
  /** Prezzi delle prenotate (trattato, altrimenti listino). */
  prenotato: number | null;
  /** Le libere a prezzo di listino. */
  inVendita: number | null;
  incassato: number | null;
  permute: number | null;
  /** Venduto meno pagato. */
  daIncassare: number | null;
  mq: number;
  millesimi: number;
}

export function riepilogoVendite(e: Pick<ElencoUnita, "unita" | "permessi">): RiepilogoVendite {
  const vive = unitaVive(e.unita);
  const conteggi: Record<StatoVendita, number> = { libera: 0, prenotata: 0, compromesso: 0, rogitata: 0 };
  for (const u of vive) conteggi[u.stato] += 1;
  const importi = e.permessi.importi;
  const somma = (lista: UnitaGenerale[], f: (u: UnitaGenerale) => number | null) =>
    importi ? arrotonda(lista.reduce((t, u) => t + (f(u) ?? 0), 0)) : null;
  const vendute = vive.filter((u) => u.stato === "compromesso" || u.stato === "rogitata");
  const pagamenti = new Map(vive.map((u) => [u.orderId, pagamentiUnita(u)]));
  return {
    unita: vive.length,
    conteggi,
    venduto: somma(vendute, prezzoCorrente),
    prenotato: somma(vive.filter((u) => u.stato === "prenotata"), (u) => u.trattato ?? u.listino),
    inVendita: somma(vive.filter((u) => u.stato === "libera"), (u) => u.listino),
    incassato: somma(vive, (u) => pagamenti.get(u.orderId)!.incassato),
    permute: somma(vive, (u) => pagamenti.get(u.orderId)!.permute),
    daIncassare: somma(vendute, (u) => pagamenti.get(u.orderId)!.residuo),
    mq: arrotonda(vive.reduce((t, u) => t + (u.mq ?? 0), 0)),
    millesimi: Math.round(vive.reduce((t, u) => t + (u.millesimi ?? 0), 0) * 1000) / 1000,
  };
}

// ── Costi comuni e margine ───────────────────────────────────────────────────

export type CriterioRiparto = "millesimi" | "mq" | "prezzo" | "uguale";

export const NOMI_CRITERIO: Record<CriterioRiparto, string> = {
  millesimi: "per millesimi",
  mq: "per m² commerciali",
  prezzo: "per prezzo",
  uguale: "in parti uguali",
};

/** Millesimi se ce li hanno tutte, altrimenti m², altrimenti prezzo, altrimenti parti uguali (piano, §5). */
export function criterioRiparto(vive: Pick<UnitaGenerale, "millesimi" | "mq" | "rogito" | "trattato" | "listino">[]): CriterioRiparto {
  const tutte = (f: (u: (typeof vive)[number]) => number | null) => vive.length > 0 && vive.every((u) => (f(u) ?? 0) > 0);
  if (tutte((u) => u.millesimi)) return "millesimi";
  if (tutte((u) => u.mq)) return "mq";
  if (tutte(prezzoCorrente)) return "prezzo";
  return "uguale";
}

const pesoDi = (criterio: CriterioRiparto, u: UnitaGenerale) =>
  criterio === "millesimi" ? u.millesimi ?? 0 : criterio === "mq" ? u.mq ?? 0 : criterio === "prezzo" ? prezzoCorrente(u) ?? 0 : 1;

export interface ContoUnita {
  prezzo: number | null;
  /** Costi registrati sulla commessa dell'unità. */
  costoDiretto: number | null;
  /** Costi passati da un'unità divisa alle sue parti (per m²). */
  costoEreditato: number | null;
  provvigione: number;
  /** Quota dei costi comuni; `peso` su `pesoTotale` col criterio della generale. */
  quotaComuni: number | null;
  peso: number;
  /** null = chi guarda non può vederlo, o manca il prezzo. */
  margine: number | null;
}

export interface ContiUnita {
  criterio: CriterioRiparto;
  pesoTotale: number;
  /** Costi registrati sulla generale. */
  costiGenerale: number | null;
  /** Le permute: il terreno pagato con le unità. Sono un costo comune. */
  permute: number | null;
  /** Costi di unità divise che non hanno più parti in questa generale: restano comuni. */
  costiSenzaParti: number | null;
  /** Il totale da ripartire. */
  costiComuni: number | null;
  perUnita: Map<string, ContoUnita>;
}

/**
 * Margine dell'unità = prezzo − costi della sua commessa − costi ereditati da un'unità divisa
 * − provvigione dell'agenzia − quota dei costi comuni. I costi comuni sono quelli registrati
 * sulla generale più le permute (il terreno), ripartiti sulle unità vive.
 */
export function contiUnita(e: ElencoUnita): ContiUnita {
  const vive = unitaVive(e.unita);
  const criterio = criterioRiparto(vive);
  const pesi = vive.map((u) => pesoDi(criterio, u));
  const pesoTotale = criterio === "uguale" ? vive.length : pesi.reduce((t, p) => t + p, 0);
  const vedeCosti = e.unita.every((u) => u.costoDiretto !== null) && e.costiGenerale !== null;

  // I costi di un'unità divisa scendono sulle parti, per m² (parti uguali se manca qualche m²).
  const ereditato = new Map<string, number>();
  let costiSenzaParti = 0;
  if (vedeCosti) {
    const perId = new Map(e.unita.filter((u) => u.id).map((u) => [u.id!, u]));
    const parti = new Map<string, UnitaGenerale[]>();
    for (const u of e.unita) {
      if (u.origineId && perId.has(u.origineId)) parti.set(u.origineId, [...(parti.get(u.origineId) ?? []), u]);
    }
    const visti = new Set<string>();
    const scendi = (u: UnitaGenerale, eredita: number) => {
      if (visti.has(u.orderId)) return;
      visti.add(u.orderId);
      const totale = arrotonda((u.costoDiretto ?? 0) + eredita);
      if (!u.divisaIl) {
        ereditato.set(u.orderId, eredita);
        return;
      }
      const figlie = (u.id ? parti.get(u.id) ?? [] : []).sort((a, b) => confrontaSigle(a.sigla, b.sigla));
      if (figlie.length === 0) {
        costiSenzaParti = arrotonda(costiSenzaParti + totale);
        return;
      }
      const conMq = figlie.every((f) => (f.mq ?? 0) > 0);
      const quote = ripartisci(totale, figlie.map((f) => (conMq ? f.mq ?? 0 : 1)));
      figlie.forEach((f, i) => scendi(f, quote[i]));
    };
    for (const u of e.unita) if (!u.origineId || !perId.has(u.origineId)) scendi(u, 0);
  }

  const permute = e.permessi.importi
    ? arrotonda(e.unita.reduce((t, u) => t + u.movimenti.filter((m) => m.tipo === "permuta").reduce((s, m) => s + (m.importo ?? 0), 0), 0))
    : null;
  const costiComuni = vedeCosti && permute !== null ? arrotonda(e.costiGenerale! + permute + costiSenzaParti) : null;
  const quote = costiComuni !== null ? ripartisci(costiComuni, pesi) : null;
  const vedeMargini = e.permessi.margini && e.permessi.importi && costiComuni !== null;

  const perUnita = new Map<string, ContoUnita>();
  vive.forEach((u, i) => {
    const prezzo = e.permessi.importi ? prezzoCorrente(u) : null;
    const costoEreditato = vedeCosti ? ereditato.get(u.orderId) ?? 0 : null;
    const provvigione = u.provvigione ?? 0;
    const quotaComuni = quote ? quote[i] : null;
    perUnita.set(u.orderId, {
      prezzo,
      costoDiretto: vedeCosti ? u.costoDiretto : null,
      costoEreditato,
      provvigione,
      quotaComuni,
      peso: pesi[i],
      margine: vedeMargini && prezzo !== null && quotaComuni !== null
        ? arrotonda(prezzo - (u.costoDiretto ?? 0) - (costoEreditato ?? 0) - provvigione - quotaComuni)
        : null,
    });
  });

  return {
    criterio,
    pesoTotale,
    costiGenerale: vedeCosti ? e.costiGenerale : null,
    permute,
    costiSenzaParti: vedeCosti ? costiSenzaParti : null,
    costiComuni,
    perUnita,
  };
}

// ── D.Lgs. 122/2005 ──────────────────────────────────────────────────────────

export interface AvvisoGaranzie {
  /** Le unità con somme versate prima del rogito. */
  sigle: string[];
  /** Quanto va garantito con la fideiussione (null = importi non visibili). */
  somme: number | null;
}

/**
 * Immobili da costruire (solo modello «sviluppo»): su un'unità non ancora rogitata con caparra,
 * acconti o permuta serve la fideiussione per quelle somme (art. 2), e al rogito la polizza
 * decennale (art. 4). Il documento lo segue il modulo Documenti: qui solo l'avviso.
 */
export function avvisoGaranzie(e: Pick<ElencoUnita, "modello" | "unita">): AvvisoGaranzie | null {
  if (e.modello !== "sviluppo") return null;
  const con = unitaVive(e.unita)
    .filter((u) => u.stato !== "rogitata" && u.stato !== "libera")
    .map((u) => ({ u, anticipi: u.movimenti.filter((m) => m.tipo !== "saldo") }))
    .filter((x) => x.anticipi.length > 0)
    .sort((a, b) => confrontaSigle(a.u.sigla, b.u.sigla));
  if (con.length === 0) return null;
  const tutteVisibili = con.every((x) => x.anticipi.every((m) => m.importo !== null));
  return {
    sigle: con.map((x) => x.u.sigla),
    somme: tutteVisibili ? arrotonda(con.reduce((t, x) => t + x.anticipi.reduce((s, m) => s + (m.importo ?? 0), 0), 0)) : null,
  };
}

// ── Dividere un'unità ────────────────────────────────────────────────────────

export interface ParteDivisione {
  sigla: string;
  mq: number | null;
  listino: number | null;
  tipologia: string | null;
}

export interface ParteCalcolata extends ParteDivisione { millesimi: number | null }

const LETTERE = "abcdefghij";

/** Una proposta da ritoccare: A1 → A1a, A1b, … con m² e listino in parti uguali. */
export function proponiDivisione(u: Pick<UnitaGenerale, "sigla" | "mq" | "listino">, parti = 2): ParteDivisione[] {
  const n = Math.min(10, Math.max(2, parti));
  const mq = u.mq !== null ? ripartisci(u.mq, Array(n).fill(1)) : null;
  const listino = u.listino !== null ? ripartisci(u.listino, Array(n).fill(1), 0) : null;
  return Array.from({ length: n }, (_, i): ParteDivisione => ({
    sigla: `${u.sigla}${LETTERE[i]}`,
    mq: mq ? mq[i] : null,
    listino: listino ? listino[i] : null,
    tipologia: null,
  }));
}

/**
 * Le parti come le salva il database: i millesimi in proporzione ai m² (in parti uguali se
 * manca qualche m²), più gli errori da correggere prima di dividere.
 */
export function completaDivisione(
  u: Pick<UnitaGenerale, "sigla" | "mq" | "millesimi" | "stato" | "divisaIl" | "movimenti">,
  parti: ParteDivisione[],
  sigleEsistenti: string[],
): { parti: ParteCalcolata[]; errori: string[] } {
  const errori: string[] = [];
  if (u.divisaIl) errori.push(`${u.sigla} è già stata divisa.`);
  if (u.stato !== "libera") errori.push("Si divide solo un'unità libera.");
  if (u.movimenti.length > 0) errori.push(`Su ${u.sigla} ci sono pagamenti registrati: non si può dividere.`);
  if (parti.length < 2) errori.push("Dividi in almeno due parti.");
  if (parti.length > 10) errori.push("Al massimo 10 parti.");

  const sigle = parti.map((p) => p.sigla.trim());
  if (sigle.some((s) => s === "")) errori.push("Ogni parte ha bisogno di una sigla.");
  const viste = new Set<string>();
  const esistenti = new Set(sigleEsistenti.map((s) => s.trim().toLowerCase()));
  for (const s of sigle.filter(Boolean)) {
    const k = s.toLowerCase();
    if (viste.has(k)) errori.push(`Due parti hanno la stessa sigla: ${s}.`);
    else if (esistenti.has(k)) errori.push(`C'è già un'unità ${s}.`);
    viste.add(k);
  }
  if (parti.some((p) => (p.mq ?? 0) < 0 || (p.listino ?? 0) < 0)) errori.push("m² e prezzi non possono essere negativi.");
  if (u.mq !== null) {
    const somma = arrotonda(parti.reduce((t, p) => t + (p.mq ?? 0), 0));
    if (Math.abs(somma - u.mq) > 0.01) errori.push(`I m² delle parti (${formattaNumero(somma)}) non tornano con quelli di ${u.sigla} (${formattaNumero(u.mq)}).`);
  }

  const conMq = parti.length > 0 && parti.every((p) => (p.mq ?? 0) > 0);
  const millesimi = u.millesimi !== null ? ripartisci(u.millesimi, parti.map((p) => (conMq ? p.mq ?? 0 : 1)), 3) : null;
  return {
    parti: parti.map((p, i) => ({ ...p, sigla: p.sigla.trim(), millesimi: millesimi ? millesimi[i] : null })),
    errori: [...new Set(errori)],
  };
}

const NUMERO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 });
/** m² e millesimi: fino a tre decimali, solo se servono. */
export const formattaNumero = (n: number) => NUMERO.format(n);
