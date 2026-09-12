/**
 * Il rilievo per posizioni: come si prende davvero una misura in cantiere.
 *
 * Chi va a misurare non compila un preventivo, compila un elenco: P1 cucina
 * 1200×1400, P2 bagno 600×800, P3 camera 1500×1400. Poi decide una volta sola
 * che è tutto Salamander bianco con doppio vetro, e solo dove serve cambia. Il
 * wizard attuale chiede invece tutto da capo per ogni finestra, quattro passi
 * per volta: su venti posizioni sono ottanta passi.
 *
 * Qui c'è solo il conto — niente React — così il totale del rilievo si può
 * verificare senza aprire una finestra del browser.
 */

export interface PosizioneRilievo {
  /** Identificativo di riga, stabile mentre si compila. */
  id: string;
  /** "P1", "Cucina", "Rif. 3": come la chiama il cliente nel suo appunto. */
  riferimento: string;
  /** La tipologia scelta dal listino. */
  familyId: string | null;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  quantita: number;
  /** Le scelte per asse (linea, colore, vetro…). Vuoto = quelle comuni. */
  selezioni: Record<string, string>;
  note?: string;
}

export interface PrezzoPosizione {
  unitario_vendita: number;
  unitario_acquisto: number;
  mq: number | null;
}

export interface TotaliRilievo {
  posizioni: number;
  pezzi: number;
  mq: number;
  vendita: number;
  acquisto: number;
  /** Margine in percentuale sul venduto; null se non si vende nulla. */
  marginePct: number | null;
}

/** Riferimento proposto per una posizione nuova: P1, P2, P3… */
export function riferimentoSuccessivo(esistenti: string[]): string {
  let massimo = 0;
  for (const r of esistenti) {
    const m = /^P(\d+)$/i.exec(r.trim());
    if (m) massimo = Math.max(massimo, Number(m[1]));
  }
  return `P${massimo + 1}`;
}

/** Metri quadri di una posizione, dal foro in millimetri. */
export function mqPosizione(larghezza_mm: number | null, altezza_mm: number | null): number | null {
  if (larghezza_mm == null || altezza_mm == null) return null;
  if (larghezza_mm <= 0 || altezza_mm <= 0) return null;
  return (larghezza_mm / 1000) * (altezza_mm / 1000);
}

/**
 * Una posizione è pronta quando ha tipologia, misure e quantità. Le altre
 * restano in elenco senza entrare nel totale: in cantiere capita di segnare il
 * riferimento prima di avere la misura.
 */
export function posizioneCompleta(p: PosizioneRilievo): boolean {
  return (
    p.familyId != null &&
    p.quantita > 0 &&
    mqPosizione(p.larghezza_mm, p.altezza_mm) != null
  );
}

/** Il totale del rilievo: pezzi, metri quadri, vendita, acquisto, margine. */
export function totaliRilievo(
  righe: Array<{ posizione: PosizioneRilievo; prezzo: PrezzoPosizione }>,
): TotaliRilievo {
  let pezzi = 0;
  let mq = 0;
  let vendita = 0;
  let acquisto = 0;
  let posizioni = 0;

  for (const { posizione, prezzo } of righe) {
    if (!posizioneCompleta(posizione)) continue;
    posizioni += 1;
    pezzi += posizione.quantita;
    mq += (prezzo.mq ?? 0) * posizione.quantita;
    vendita += prezzo.unitario_vendita * posizione.quantita;
    acquisto += prezzo.unitario_acquisto * posizione.quantita;
  }

  return {
    posizioni,
    pezzi,
    mq: arrotonda(mq, 4),
    vendita: arrotonda(vendita, 2),
    acquisto: arrotonda(acquisto, 2),
    marginePct: vendita > 0 ? arrotonda(((vendita - acquisto) / vendita) * 100, 2) : null,
  };
}

/**
 * Le scelte effettive di una posizione: quelle comuni al rilievo, con sopra le
 * eccezioni di quella riga. Serve perché il caso normale è «tutto uguale tranne
 * il bagno, che è satinato».
 */
export function selezioniEffettive(
  comuni: Record<string, string>,
  posizione: PosizioneRilievo,
): Record<string, string> {
  return { ...comuni, ...posizione.selezioni };
}

/**
 * La descrizione che finisce sulla riga del preventivo. Il riferimento davanti,
 * perché è quello che il posatore cerca quando arriva in cantiere.
 */
export function descrizionePosizione(
  posizione: PosizioneRilievo,
  nomeTipologia: string,
  etichetteScelte: string[],
): string {
  const misura =
    posizione.larghezza_mm != null && posizione.altezza_mm != null
      ? `${posizione.larghezza_mm} × ${posizione.altezza_mm} mm`
      : null;
  const pezzi = [nomeTipologia, misura, ...etichetteScelte].filter(Boolean).join(" · ");
  const riferimento = posizione.riferimento.trim();
  return riferimento ? `${riferimento} — ${pezzi}` : pezzi;
}

function arrotonda(n: number, decimali: number): number {
  const f = 10 ** decimali;
  return Math.round(n * f) / f;
}
