// ============================================================================
// trediciSettimane — il piano di cassa a tredici settimane, logica pura
// ============================================================================
// Un trimestre di cassa, una colonna per settimana: saldo iniziale, entrate
// con gli ACCONTI separati dai SALDI (l'acconto è denaro per lavoro futuro:
// una cassa che sale di soli acconti è un allarme, non una buona notizia),
// uscite per famiglia, saldo progressivo e prima settimana sotto la soglia.
//
// STIPENDI: il giorno di pagamento NON è fisso (né 27 né fine mese uguale per
// tutti) — si IMPARA dai pagamenti reali registrati in Prima Nota con
// categoria "stipendi" (mediana del giorno del mese, minimo 2 campioni).
// Finché non c'è storia, fine mese dichiarato in UI. Mai un giorno inventato.
//
// Zero React e zero Supabase: tutto testabile a tavolino.
// ============================================================================

export type CategoriaEntrata = "acconti" | "saldi" | "fatture" | "altreEntrate";
export type CategoriaUscita = "fornitori" | "stipendi" | "fisco" | "squadreProvvigioni" | "altriCosti";

export interface MovimentoPrevisto {
  /** null = senza data: NON entra nelle colonne, finisce nel cassetto "senza data". */
  data: Date | null;
  importo: number;
  direzione: "in" | "out";
  categoria: CategoriaEntrata | CategoriaUscita;
}

export interface SettimanaPiano {
  inizio: Date;
  fine: Date;
  /** Es. "25 ago – 31 ago" (la prima è "questa settimana" e assorbe gli scaduti). */
  label: string;
  entrate: Record<CategoriaEntrata, number>;
  uscite: Record<CategoriaUscita, number>;
  totaleEntrate: number;
  totaleUscite: number;
  saldoSettimana: number;
  saldoProgressivo: number;
  /** Quanti movimenti già scaduti sono confluiti qui (solo settimana 1). */
  scadutiAssorbiti: number;
}

export interface PianoTredici {
  settimane: SettimanaPiano[];
  /** Indice (0-based) della prima settimana con saldo sotto soglia; null se mai. */
  primaSettimanaRossa: number | null;
  /** Movimenti senza data: esclusi dalle colonne ma mai nascosti. */
  senzaData: { entrate: number; uscite: number; conteggio: number };
}

const MS_GIORNO = 86400_000;

function lunediDella(data: Date): Date {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const giorno = d.getDay(); // 0 = domenica
  const delta = giorno === 0 ? -6 : 1 - giorno;
  return new Date(d.getTime() + delta * MS_GIORNO);
}

const MESI_CORTI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function labelSettimana(inizio: Date, fine: Date): string {
  return `${inizio.getDate()} ${MESI_CORTI[inizio.getMonth()]} – ${fine.getDate()} ${MESI_CORTI[fine.getMonth()]}`;
}

const ENTRATE_VUOTE = (): Record<CategoriaEntrata, number> => ({
  acconti: 0, saldi: 0, fatture: 0, altreEntrate: 0,
});
const USCITE_VUOTE = (): Record<CategoriaUscita, number> => ({
  fornitori: 0, stipendi: 0, fisco: 0, squadreProvvigioni: 0, altriCosti: 0,
});

/**
 * Costruisce il piano: 13 settimane a partire dal lunedì della settimana di
 * `oggi`. I movimenti già scaduti (data < inizio piano) confluiscono nella
 * settimana corrente — sono incassi/pagamenti arretrati che premono adesso —
 * e vengono contati a parte per dirlo in chiaro.
 */
export function costruisciPianoTredici(
  movimenti: MovimentoPrevisto[],
  saldoIniziale: number,
  oggi: Date,
  sogliaGuardia = 0,
  nSettimane = 13,
): PianoTredici {
  const inizioPiano = lunediDella(oggi);
  const settimane: SettimanaPiano[] = [];

  for (let i = 0; i < nSettimane; i++) {
    const inizio = new Date(inizioPiano.getTime() + i * 7 * MS_GIORNO);
    const fine = new Date(inizio.getTime() + 6 * MS_GIORNO);
    settimane.push({
      inizio, fine,
      label: labelSettimana(inizio, fine),
      entrate: ENTRATE_VUOTE(),
      uscite: USCITE_VUOTE(),
      totaleEntrate: 0, totaleUscite: 0,
      saldoSettimana: 0, saldoProgressivo: 0,
      scadutiAssorbiti: 0,
    });
  }
  const finePiano = new Date(inizioPiano.getTime() + nSettimane * 7 * MS_GIORNO);

  const senzaData = { entrate: 0, uscite: 0, conteggio: 0 };

  for (const m of movimenti) {
    if (!Number.isFinite(m.importo) || m.importo <= 0) continue;
    if (!m.data) {
      senzaData.conteggio += 1;
      if (m.direzione === "in") senzaData.entrate += m.importo;
      else senzaData.uscite += m.importo;
      continue;
    }
    if (m.data.getTime() >= finePiano.getTime()) continue; // oltre l'orizzonte

    let indice = Math.floor((m.data.getTime() - inizioPiano.getTime()) / (7 * MS_GIORNO));
    const scaduto = indice < 0;
    if (scaduto) indice = 0;
    const s = settimane[indice];
    if (!s) continue;

    if (scaduto) s.scadutiAssorbiti += 1;
    if (m.direzione === "in") {
      s.entrate[m.categoria as CategoriaEntrata] += m.importo;
      s.totaleEntrate += m.importo;
    } else {
      s.uscite[m.categoria as CategoriaUscita] += m.importo;
      s.totaleUscite += m.importo;
    }
  }

  let progressivo = saldoIniziale;
  let primaRossa: number | null = null;
  settimane.forEach((s, i) => {
    s.saldoSettimana = s.totaleEntrate - s.totaleUscite;
    progressivo += s.saldoSettimana;
    s.saldoProgressivo = progressivo;
    if (primaRossa === null && progressivo < sogliaGuardia) primaRossa = i;
  });

  return { settimane, primaSettimanaRossa: primaRossa, senzaData };
}

// ── Giorno stipendi: imparato dai pagamenti reali ───────────────────────────

/**
 * Mediana del giorno del mese dei pagamenti stipendi registrati.
 * Servono ALMENO 2 campioni per fidarsi; con meno si torna null (fine mese).
 */
export function giornoStipendiDaDate(dateISO: string[]): number | null {
  const giorni = dateISO
    .map((d) => Number(d.slice(8, 10)))
    .filter((g) => Number.isInteger(g) && g >= 1 && g <= 31)
    .sort((a, b) => a - b);
  if (giorni.length < 2) return null;
  const mid = Math.floor(giorni.length / 2);
  return giorni.length % 2 === 1 ? giorni[mid] : Math.round((giorni[mid - 1] + giorni[mid]) / 2);
}

/**
 * Sposta una scadenza stipendio (proiettata a fine mese) sul giorno di paga
 * reale dell'azienda, nello stesso mese. Se il mese è più corto (es. giorno
 * 31 a febbraio) si resta sull'ultimo giorno del mese.
 */
export function applicaGiornoStipendi(fineMese: Date, giorno: number | null): Date {
  if (giorno === null) return fineMese;
  const ultimo = new Date(fineMese.getFullYear(), fineMese.getMonth() + 1, 0).getDate();
  return new Date(fineMese.getFullYear(), fineMese.getMonth(), Math.min(giorno, ultimo));
}

/**
 * Il 16 del mese successivo: quando si versano in F24 i contributi del mese
 * di paga e l'IVA della liquidazione mensile.
 */
export function sedicesimoDelMeseSuccessivo(meseDiCompetenza: Date): Date {
  return new Date(meseDiCompetenza.getFullYear(), meseDiCompetenza.getMonth() + 1, 16);
}
