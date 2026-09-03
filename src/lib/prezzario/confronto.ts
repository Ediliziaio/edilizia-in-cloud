/**
 * Prezzo di zona: quanto sta sopra o sotto il prezzario della propria regione
 * ogni voce del computo, e il preventivo nel suo insieme.
 *
 * I 363.000 prezzi regionali erano già caricati e nessuno li usava per
 * confrontare: servivano solo a copiare voci nel listino. Metterli accanto al
 * prezzo che si sta per proporre è la differenza fra "questo è il mio prezzo" e
 * "questo è il mio prezzo, e nella mia regione la stessa cosa vale così".
 *
 * Due regole che decidono se il confronto è onesto:
 *
 *  1. **Unità diverse, nessun confronto.** Un €/mq accanto a un €/cad produce
 *     uno scostamento del 4000% che non significa niente. Meglio dire "non
 *     confrontabile" che stampare un numero spettacolare e falso.
 *  2. **La copertura si dichiara.** "Sei il 12% sopra il mercato" calcolato su
 *     3 righe di 40 non è una risposta, è un'impressione. L'aggregato porta
 *     sempre con sé su quante righe e su che parte dell'importo è calcolato.
 */

/** Quanto ci si fida della corrispondenza trovata. */
export type ConfidenzaConfronto = "certa" | "probabile";

export interface VoceComputoDaConfrontare {
  id: string;
  descrizione: string;
  unita_misura: string | null;
  prezzo_unitario: number;
  quantita: number;
  /** Codice del prezzario, se la voce discende da una voce adottata. */
  codicePrezzario?: string | null;
}

export interface VocePrezzario {
  id: string;
  codice: string | null;
  descrizione: string;
  unita_misura: string | null;
  prezzo: number | null;
}

export interface ConfrontoVoce {
  voceId: string;
  /** null = nessuna corrispondenza utilizzabile. */
  riferimento: VocePrezzario | null;
  confidenza: ConfidenzaConfronto | null;
  /** Scostamento percentuale sul prezzo unitario. Positivo = sopra il prezzario. */
  scostamentoPct: number | null;
  /** Differenza in euro sull'intera riga (quantità inclusa). */
  scostamentoEuro: number | null;
  /** Perché non si confronta, quando non si confronta. */
  motivo?: "nessuna-corrispondenza" | "unita-diversa" | "prezzo-mancante";
}

/**
 * Unità di misura normalizzata. In edilizia la stessa cosa si scrive in cinque
 * modi ("mq", "m²", "m2", "MQ") e sono la stessa unità; "mq" e "ml" no.
 */
export function normalizzaUnita(u: string | null | undefined): string {
  const t = (u ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[.]/g, "")
    .replace(/²/g, "2")
    .replace(/³/g, "3");
  if (!t) return "";
  const sinonimi: Record<string, string> = {
    mq: "m2", m2: "m2", metroquadro: "m2", metriquadri: "m2", metroquadrato: "m2",
    mc: "m3", m3: "m3", metrocubo: "m3", metricubi: "m3",
    ml: "m", m: "m", metro: "m", metrolineare: "m", metrilineari: "m",
    cad: "cad", pz: "cad", pezzo: "cad", pezzi: "cad", n: "cad", nr: "cad", num: "cad", "cadauno": "cad",
    kg: "kg", chilogrammo: "kg", chili: "kg",
    t: "t", ton: "t", tonnellata: "t",
    h: "h", ora: "h", ore: "h",
    l: "l", lt: "l", litro: "l", litri: "l",
    acorpo: "a corpo", "acorpo1": "a corpo",
  };
  return sinonimi[t] ?? t;
}

/** Le due unità sono la stessa cosa? Un'unità mancante non combacia con niente. */
export function unitaCompatibili(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizzaUnita(a);
  const nb = normalizzaUnita(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Confronta una riga di computo con la voce di prezzario che le corrisponde.
 * `riferimento` null significa che non è stata trovata: non è un errore, è
 * un'informazione che va mostrata.
 */
export function confrontaVoce(
  voce: VoceComputoDaConfrontare,
  riferimento: VocePrezzario | null,
  confidenza: ConfidenzaConfronto | null,
): ConfrontoVoce {
  const vuoto = { voceId: voce.id, riferimento: null, confidenza: null, scostamentoPct: null, scostamentoEuro: null };
  if (!riferimento) return { ...vuoto, motivo: "nessuna-corrispondenza" };
  if (riferimento.prezzo == null || riferimento.prezzo <= 0) {
    return { ...vuoto, riferimento, confidenza, motivo: "prezzo-mancante" };
  }
  if (!unitaCompatibili(voce.unita_misura, riferimento.unita_misura)) {
    // Il confronto sarebbe fra grandezze diverse: non si fa e si dice perché.
    return { ...vuoto, riferimento, confidenza, motivo: "unita-diversa" };
  }
  const scostamentoPct = ((voce.prezzo_unitario - riferimento.prezzo) / riferimento.prezzo) * 100;
  const scostamentoEuro = (voce.prezzo_unitario - riferimento.prezzo) * (voce.quantita ?? 0);
  return { voceId: voce.id, riferimento, confidenza, scostamentoPct, scostamentoEuro };
}

export interface RiepilogoConfronto {
  /** Righe con un confronto valido. */
  confrontate: number;
  /** Righe totali guardate. */
  totali: number;
  /** Importo delle righe confrontate. */
  importoConfrontato: number;
  /** Importo di tutte le righe. */
  importoTotale: number;
  /**
   * Frazione dell'importo su cui il confronto è calcolato, 0..1. È il numero
   * che dice quanto fidarsi della percentuale qui sotto.
   */
  copertura: number;
  /** Somma degli scostamenti in euro sulle righe confrontate. */
  scostamentoEuro: number;
  /**
   * Scostamento percentuale sull'importo confrontato. `null` se non c'è nulla
   * da confrontare: e allora si dice, non si scrive 0%.
   */
  scostamentoPct: number | null;
  /**
   * Righe per cui una voce di prezzario è stata TROVATA ma non si è potuta
   * confrontare (di solito perché il prezzario non dichiara l'unità di misura).
   * Serve a distinguere "il prezzario non ha questa lavorazione" da "il
   * prezzario ce l'ha ma non dice in che unità".
   */
  trovateNonConfrontabili: number;
}

export function riepilogaConfronti(
  voci: VoceComputoDaConfrontare[],
  confronti: ConfrontoVoce[],
): RiepilogoConfronto {
  const perId = new Map(confronti.map((c) => [c.voceId, c]));
  let importoConfrontato = 0;
  let importoTotale = 0;
  let scostamentoEuro = 0;
  let confrontate = 0;
  let trovateNonConfrontabili = 0;

  for (const v of voci) {
    const importo = (v.prezzo_unitario ?? 0) * (v.quantita ?? 0);
    importoTotale += importo;
    const c = perId.get(v.id);
    if (!c || c.scostamentoEuro == null || !c.riferimento || c.riferimento.prezzo == null) {
      if (c?.riferimento) trovateNonConfrontabili += 1;
      continue;
    }
    confrontate += 1;
    importoConfrontato += importo;
    scostamentoEuro += c.scostamentoEuro;
  }

  // Il denominatore è l'importo del PREZZARIO sulle righe confrontate, non il
  // proprio: "sono il 20% sopra" significa 20% in più di quanto costerebbe lì.
  const importoPrezzario = importoConfrontato - scostamentoEuro;

  return {
    confrontate,
    totali: voci.length,
    importoConfrontato,
    importoTotale,
    copertura: importoTotale > 0 ? importoConfrontato / importoTotale : 0,
    scostamentoEuro,
    scostamentoPct: importoPrezzario > 0 ? (scostamentoEuro / importoPrezzario) * 100 : null,
    trovateNonConfrontabili,
  };
}

/** Parole che non aiutano a distinguere una lavorazione da un'altra. */
const PAROLE_VUOTE = new Set([
  "con", "per", "del", "della", "dello", "delle", "dei", "degli", "dal", "dalla",
  "sul", "sulla", "nel", "nella", "una", "uno", "che", "non", "compreso",
  "compresa", "inoltre", "quanto", "altro", "occorre", "dare", "opera", "finita",
  "tipo", "come", "ogni", "anche", "esclusi", "esclusa", "incluso", "inclusa",
  "misura", "fornitura", "posa", "essere", "sono", "viene", "oppure",
]);

/**
 * Termini con cui cercare una voce nel prezzario.
 *
 * Passare la descrizione intera alla ricerca full-text non trova mai niente: in
 * modalità `websearch` tutte le parole devono comparire, e una descrizione di
 * prezzario è lunga trenta parole con dentro le clausole di capitolato. Si
 * tengono le prime parole PIENE, che sono quelle che identificano la
 * lavorazione ("muratura mattoni forati laterizio").
 */
export function termineRicerca(descrizione: string, quante = 4): string {
  return descrizione
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !PAROLE_VUOTE.has(w))
    .slice(0, quante)
    .join(" ")
    .trim();
}

/** Come si legge uno scostamento: sopra, sotto o in linea (±3%). */
export function tonoScostamento(pct: number | null): "sopra" | "sotto" | "in-linea" | "ignoto" {
  if (pct == null) return "ignoto";
  if (pct > 3) return "sopra";
  if (pct < -3) return "sotto";
  return "in-linea";
}
