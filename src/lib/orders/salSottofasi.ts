/**
 * Le sottofasi nel verbale SAL (10/11/2026, docs/piano-verbale-sal-sottofasi.md, lotto A).
 *
 * La fase resta la voce del verbale: importo del SAL, rate e fattura sono per fase. Le sottofasi
 * sono il suo dettaglio (tabella sal_voci_sottofasi) e spiegano la % della fase:
 * - importo della sottofase: le voci della commessa collegate, se tutte le sottofasi ne hanno;
 *   altrimenti la quota del venduto della fase secondo il peso; altrimenti niente;
 * - avanzamento: quantità fatta / quantità del contratto se ci sono, altrimenti la % dichiarata
 *   («fatta» = 100), mai sotto quella già certificata nel SAL precedente;
 * - la % della fase è la media delle sottofasi pesata sugli importi (o sul peso).
 *
 * Modulo puro: niente React, niente Supabase.
 */

export interface VoceCommessaPerSal {
  quantita: number | null;
  unita: string | null;
  importo: number | null;
}

export interface SottofasePerSal {
  id: string;
  name: string;
  position?: number | null;
  peso?: number | null;
  fatta?: boolean | null;
  percentuale?: number | null;
  quantita_fatta?: number | null;
  /** Voci della commessa collegate (order_work_phase_voci.subphase_id): importo e quantità del contratto. */
  voci?: ReadonlyArray<VoceCommessaPerSal>;
}

/** Una sottofase nel modulo del verbale (campi stringa per gli input). */
export interface SottofaseSalDraft {
  sottofase_id: string | null;
  descrizione: string;
  peso: number;
  unita: string | null;
  quantita_contratto: number | null;
  /** Solo se c'è la quantità del contratto: chi compila scrive la quantità, la % ne segue. */
  quantita_a_oggi: string;
  importo_contrattuale: number | null;
  percentuale_avanzamento: string;
}

const tondo = (n: number, cifre: number) => Math.round(n * 10 ** cifre) / 10 ** cifre;
const numero = (s: string) => {
  // «1.234,5» all'italiana: col virgola, i punti sono le migliaia.
  const grezzo = String(s ?? "").trim();
  const t = (grezzo.includes(",") ? grezzo.replace(/\./g, "") : grezzo).replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Quantità del contratto: le voci collegate, se parlano tutte della stessa unità. */
function quantitaContratto(voci: ReadonlyArray<VoceCommessaPerSal>): { q: number | null; unita: string | null } {
  const conQ = voci.filter((v) => v.quantita != null && Number(v.quantita) > 0);
  if (!conQ.length || conQ.length !== voci.length) return { q: null, unita: null };
  const unita = new Set(conQ.map((v) => (v.unita ?? "").trim().toLowerCase()));
  if (unita.size !== 1) return { q: null, unita: null };
  return { q: tondo(conQ.reduce((s, v) => s + Number(v.quantita), 0), 3), unita: conQ[0].unita?.trim() || null };
}

/** Avanzamento dal cantiere: quantità se ci sono, altrimenti la % («fatta» = 100). Due decimali. */
export function percentualeCantiere(s: SottofasePerSal, qContratto: number | null): number {
  if (s.fatta) return 100;
  if (qContratto && qContratto > 0 && s.quantita_fatta != null && Number.isFinite(Number(s.quantita_fatta))) {
    return Math.min(100, Math.max(0, tondo((Number(s.quantita_fatta) / qContratto) * 100, 2)));
  }
  return Math.min(100, Math.max(0, tondo(Number(s.percentuale) || 0, 2)));
}

/**
 * Le sottofasi di una fase per il verbale nuovo. `venduto` è l'importo della fase (null se non lo
 * si conosce); `precedenti` le % già certificate per sottofase nel SAL precedente.
 */
export function sottofasiPerSal(
  sottofasi: ReadonlyArray<SottofasePerSal>,
  venduto: number | null,
  precedenti: ReadonlyMap<string, number> = new Map(),
): SottofaseSalDraft[] {
  const ordinate = [...sottofasi].filter((s) => s.name?.trim()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (!ordinate.length) return [];
  const importoVoci = (s: SottofasePerSal) => (s.voci ?? []).reduce((t, v) => t + (Number(v.importo) || 0), 0);
  const tutteConVoci = ordinate.every((s) => importoVoci(s) > 0);
  const pesi = ordinate.map((s) => (Number(s.peso) > 0 ? Number(s.peso) : 1));
  const totPesi = pesi.reduce((a, b) => a + b, 0);
  // Quote del venduto della fase, in centesimi, l'ultima prende il resto: le sottofasi sommano
  // esattamente la fase. Pesi: gli importi delle voci collegate se ci sono tutti, altrimenti il peso.
  const quote: Array<number | null> = ordinate.map((): number | null => null);
  const dividi = (totale: number, pesiQuota: number[]) => {
    const cent = Math.round(totale * 100);
    const tot = pesiQuota.reduce((a, b) => a + b, 0);
    let usati = 0;
    pesiQuota.forEach((p, i) => {
      const c = i === pesiQuota.length - 1 ? cent - usati : Math.round((cent * p) / tot);
      usati += c;
      quote[i] = c / 100;
    });
  };
  if (venduto != null && venduto > 0) dividi(venduto, tutteConVoci ? ordinate.map(importoVoci) : pesi);
  else if (tutteConVoci) ordinate.forEach((s, i) => { quote[i] = tondo(importoVoci(s), 2); });
  return ordinate.map((s, i) => {
    const { q, unita } = quantitaContratto(s.voci ?? []);
    const cantiere = percentualeCantiere(s, q);
    const certificata = precedenti.get(s.id) ?? null;
    const pct = certificata != null && certificata > cantiere ? certificata : cantiere;
    let qOggi = "";
    if (q) {
      const usaFatta = pct === cantiere && !s.fatta && s.quantita_fatta != null;
      qOggi = String(tondo(usaFatta ? Number(s.quantita_fatta) : (q * pct) / 100, 3));
    }
    return {
      sottofase_id: s.id,
      descrizione: s.name.trim(),
      peso: pesi[i],
      unita,
      quantita_contratto: q,
      quantita_a_oggi: qOggi,
      importo_contrattuale: quote[i],
      percentuale_avanzamento: String(pct),
    };
  });
}

/** La % della fase dalle sue sottofasi: media pesata sugli importi, o sul peso se mancano. Due decimali. */
export function percentualeFaseDaSottofasi(sottofasi: ReadonlyArray<SottofaseSalDraft>): number | null {
  if (!sottofasi.length) return null;
  const pct = sottofasi.map((s) => Math.min(100, Math.max(0, numero(s.percentuale_avanzamento) ?? 0)));
  const perImporto = sottofasi.every((s) => s.importo_contrattuale != null && s.importo_contrattuale > 0);
  const pesi = sottofasi.map((s) => (perImporto ? Number(s.importo_contrattuale) : s.peso > 0 ? s.peso : 1));
  const tot = pesi.reduce((a, b) => a + b, 0);
  if (tot <= 0) return null;
  return tondo(pct.reduce((acc, p, i) => acc + p * pesi[i], 0) / tot, 2);
}

/** Chi scrive la quantità a oggi: la % della sottofase ne segue (mai oltre 100). */
export function conQuantita(s: SottofaseSalDraft, quantita: string): SottofaseSalDraft {
  const q = numero(quantita);
  if (!s.quantita_contratto || q === null) return { ...s, quantita_a_oggi: quantita };
  return { ...s, quantita_a_oggi: quantita, percentuale_avanzamento: String(Math.min(100, tondo((q / s.quantita_contratto) * 100, 2))) };
}

/** Chi scrive la %: la quantità a oggi ne segue, se c'è quella del contratto. */
export function conPercentuale(s: SottofaseSalDraft, percentuale: string): SottofaseSalDraft {
  const p = numero(percentuale);
  if (!s.quantita_contratto || p === null) return { ...s, percentuale_avanzamento: percentuale };
  return { ...s, percentuale_avanzamento: percentuale, quantita_a_oggi: String(tondo((s.quantita_contratto * Math.min(100, p)) / 100, 3)) };
}

/** Riga da salvare in sal_voci_sottofasi (senza voce_id, che si aggiunge al salvataggio). */
export interface SottofaseSalRiga {
  sottofase_id: string | null;
  posizione: number;
  descrizione: string;
  unita: string | null;
  quantita_contratto: number | null;
  quantita_a_oggi: number | null;
  importo_contrattuale: number | null;
  percentuale_avanzamento: number;
}

/** Controlla e prepara le sottofasi di una voce. Lancia con un messaggio per chi compila. */
export function preparaSottofasi(sottofasi: ReadonlyArray<SottofaseSalDraft>, etichettaVoce: string): SottofaseSalRiga[] {
  return sottofasi.map((s, i) => {
    const pct = numero(s.percentuale_avanzamento);
    if (!s.descrizione.trim()) throw new Error(`${etichettaVoce}: una sottofase non ha il nome.`);
    if (pct === null || pct > 100) throw new Error(`${etichettaVoce}, «${s.descrizione.trim()}»: l'avanzamento deve essere tra 0 e 100%.`);
    const q = s.quantita_contratto ? numero(s.quantita_a_oggi) : null;
    return {
      sottofase_id: s.sottofase_id,
      posizione: i,
      descrizione: s.descrizione.trim(),
      unita: s.unita,
      quantita_contratto: s.quantita_contratto,
      quantita_a_oggi: q === null ? null : tondo(q, 3),
      importo_contrattuale: s.importo_contrattuale,
      percentuale_avanzamento: tondo(pct, 2),
    };
  });
}
