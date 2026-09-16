/**
 * outreach-warmup — logica PURA del riscaldamento caselle (niente Deno/Supabase).
 * Vero warm-up: le caselle del pool si scambiano email tra loro per costruire
 * reputazione (come la rete di Instantly), con volume crescente per giorno.
 * Testato in vitest.
 */

export interface WarmupBox {
  id: string;
  email: string;
  display_name?: string | null;
  warmup_day: number;
  status: string; // 'warming' | 'active' | 'paused' | 'disabled'
}

/** Volume di warm-up del giorno: cresce piano e si cappa (default 2 → +1/giorno → max 8). */
export function warmupTargetForDay(day: number, base = 2, step = 1, max = 8): number {
  return Math.max(0, Math.min(max, base + Math.max(0, day) * step));
}

export interface WarmupPair { fromId: string; fromEmail: string; toId: string; toEmail: string; }

/**
 * Giri di warm-up al giorno: il cron gira una volta all'ora, dalle 6:13 alle
 * 15:13 UTC, lun–ven (migrazione 20280918101000).
 *
 * Prima partiva tutto alle 8:15 UTC in un colpo: ogni casella mandava le sue
 * 2-8 email di warm-up a pochi secondi l'una dall'altra. Il titolare vuole che
 * una casella non mandi mai due email nello stesso minuto (16/09/2026): ora ne
 * manda al massimo una per giro, e i giri distano un'ora.
 */
export const GIRI_WARMUP = 10;

/** Ora UTC del primo giro. */
export const PRIMA_ORA_WARMUP_UTC = 6;

function hashCasella(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Il giro (0…giri-1) della k-esima email di warm-up di una casella che oggi ne
 * manda `totale`. Le email della stessa casella cadono in giri diversi, finché
 * `totale` non supera i giri; lo scarto proprio della casella evita che tutte
 * partano al primo giro.
 */
export function giroEmailWarmup(idCasella: string, k: number, totale: number, giri = GIRI_WARMUP): number {
  const base = Math.floor((k * giri) / Math.max(1, totale));
  return (base + (hashCasella(idCasella) % giri)) % giri;
}

/** Le coppie da spedire nel giro `giro`: ogni casella compare come mittente al massimo una volta. */
export function coppieDelGiro(pairs: WarmupPair[], giro: number, giri = GIRI_WARMUP): WarmupPair[] {
  const perMittente = new Map<string, WarmupPair[]>();
  for (const p of pairs) perMittente.set(p.fromId, [...(perMittente.get(p.fromId) ?? []), p]);
  const out: WarmupPair[] = [];
  for (const [id, lista] of perMittente) {
    // Oltre un'email per giro non si va: il massimo del warm-up (8) sta sotto i giri.
    const totale = Math.min(lista.length, giri);
    for (let k = 0; k < totale; k++) {
      if (giroEmailWarmup(id, k, totale, giri) === giro) out.push(lista[k]);
    }
  }
  return out;
}

/** Il giro di adesso dall'ora UTC: 6 → 0, 15 → 9. Fuori orario (chiamata a mano) resta nei giri. */
export function giroDaOraUtc(oraUtc: number, primaOra = PRIMA_ORA_WARMUP_UTC, giri = GIRI_WARMUP): number {
  return (((oraUtc - primaOra) % giri) + giri) % giri;
}

/**
 * Costruisce le coppie mittente→destinatario per il giro di warm-up. Ogni casella
 * (attiva o in warm-up) manda alle ALTRE del pool, round-robin, mai a se stessa.
 * `countEach` può variare per casella (es. in base al suo warmup_day).
 */
export function buildWarmupPairs(
  boxes: WarmupBox[],
  countEach: number | ((b: WarmupBox) => number),
): WarmupPair[] {
  const active = boxes.filter((b) => b.status === "active" || b.status === "warming");
  const pairs: WarmupPair[] = [];
  if (active.length < 2) return pairs;

  for (let i = 0; i < active.length; i++) {
    const from = active[i];
    const want = typeof countEach === "function" ? countEach(from) : countEach;
    const cap = Math.min(Math.max(0, want), active.length - 1);
    for (let k = 1; k <= cap; k++) {
      const to = active[(i + k) % active.length];
      pairs.push({ fromId: from.id, fromEmail: from.email, toId: to.id, toEmail: to.email });
    }
  }
  return pairs;
}


/* ───────────── corpus del warm-up: mai due email uguali ───────────── */

const SOGGETTI = [
  "{Due parole|Due righe} {sul cantiere|sul preventivo|sulla riunione}",
  "{Come va|Tutto ok|Come procede} {con i lavori|con la pratica|da voi}?",
  "{Aggiornamento|Nota} {veloce|breve} {di oggi|della settimana}",
  "{Ci sentiamo|Ci vediamo} {giovedì|lunedì|la prossima settimana}?",
  "{Un saluto|Un pensiero} {dal cantiere|dall'ufficio}",
  "{Domanda|Curiosità} {sul materiale|sui tempi|sul sopralluogo}",
  "{Re: |}{Conferma|Promemoria} {appuntamento|consegna|riunione}",
  "{Foto|Documenti} {del cantiere|della consegna} di {ieri|stamattina}",
  "{Grazie|Ottimo lavoro} per {ieri|la disponibilità|il confronto}",
  "{Piccola|Ultima} {cosa|nota} prima di {venerdì|chiudere}",
];
const CORPI = [
  "{Ciao|Buongiorno}, {volevo solo|ti scrivo per} {restare in contatto|farti un saluto}. {Tutto bene|Tutto regolare} da queste parti, {a presto|ci sentiamo}!",
  "{Ciao|Salve}, {grazie|grazie mille} del confronto {dell'altra volta|di ieri}: {mi è stato utile|ha chiarito parecchio}. {Ci aggiorniamo|Ti aggiorno} {presto|nei prossimi giorni}.",
  "{Buongiorno|Ciao}, {ti confermo|confermo} {l'appuntamento|la consegna} di {giovedì|lunedì} {mattina|pomeriggio}. {Se cambia qualcosa|Per qualsiasi cosa} {fammi sapere|scrivimi}.",
  "{Ciao|Ehi}, {ho visto|ho letto} {le foto|il documento} che {hai mandato|mi hai girato}: {ottimo|perfetto}, {procediamo così|andiamo avanti}. {A presto|Buona giornata}!",
  "{Buongiorno|Ciao}, {due righe|una nota veloce}: {il materiale|la pratica} {è arrivato|è partita} {stamattina|ieri}. {Ti aggiorno|Ci sentiamo} {appena ho novità|domani}.",
  "{Ciao|Salve}, {come procede|come va} {con i lavori|con il cantiere}? {Qui|Da noi} {tutto nei tempi|tutto regolare}. {Buon lavoro|A presto}!",
  "{Buongiorno|Ciao}, {ti lascio|ti mando} {un promemoria|una nota} per {venerdì|la riunione}: {porta|prepara} {i disegni|il preventivo} {se riesci|se ce la fai}. {Grazie|A dopo}!",
  "{Ciao|Buongiorno}, {ricevuto|letto} tutto, {grazie|ti ringrazio}. {Rispondo|Ti rispondo} {con calma|meglio} {domani|entro sera}. {Buona giornata|A presto}!",
];

function spin(t: string, rnd: () => number): string {
  let out = t;
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/\{([^{}]+)\}/g, (w, inner) => {
      const opts = String(inner).split("|");
      return opts.length < 2 ? w : opts[Math.floor(rnd() * opts.length)];
    });
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Oggetto e corpo del warm-up: soggetto e frasi variabili, mai il testo fisso di prima. */
export function warmupMessage(i: number, rnd: () => number = Math.random): { subject: string; body: string } {
  const subject = spin(SOGGETTI[Math.abs(i) % SOGGETTI.length], rnd).replace(/^Re: /, "");
  const body = spin(CORPI[Math.abs(i * 7 + 3) % CORPI.length], rnd);
  return { subject, body };
}

/** Risposta di warm-up: breve, nel thread. */
export function warmupReply(rnd: () => number = Math.random): string {
  return spin("{Ricevuto|Perfetto|Ok grazie}, {ci sentiamo|a presto|ti aggiorno} {allora|presto}!", rnd);
}
