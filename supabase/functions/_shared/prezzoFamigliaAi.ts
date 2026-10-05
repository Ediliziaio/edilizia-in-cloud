/**
 * Prezzo di vendita di una famiglia del listino nella generazione AI del
 * preventivo (ai-genera-preventivo-v2).
 *
 * È la regola del preventivo — calcolaPrezzoFamiglia in
 * src/hooks/useFamilyPricing.ts — ridotta alla vendita: quando la riga entra
 * nel preventivo il conto si rifà lì, e l'anteprima della generazione deve dire
 * lo stesso numero (05/10/2026). Prima prendeva la cella della griglia più
 * vicina (anche più piccola della misura, anche fuori dalla griglia), il prezzo
 * di vendita salvato anche per le famiglie «acquisto + ricarico» e nessun prezzo
 * proprio delle varianti. Un test confronta le due regole
 * (src/test/logic/prezzoFamigliaAi.test.ts).
 *
 * Funzione pura e senza import: la usano sia Deno sia vitest.
 */

export interface PrezziFamigliaAi {
  modalita_prezzo_base: string;
  prezzo_base_mode: string | null;
  prezzo_base_vendita: number;
  /** Listino del fornitore: lordo quando ci sono sconti fornitore. */
  prezzo_base_acquisto: number;
  sconto_fornitore_1: number;
  sconto_fornitore_2: number;
  markup_tipo: string | null;
  markup_valore: number;
}

export interface ValoreAsseAi {
  id: string;
  /** Il valore del listino: lo legge la condizione di visibilità degli altri assi. */
  valore?: string;
  maggiorazione_tipo: string;
  maggiorazione_valore: number;
  /** Prezzo proprio della variante: sostituisce il prezzo base (non per la griglia). */
  prezzo_vendita: number | null;
}

/** Variante che compare solo se un'altra (per codice) ha uno di questi valori, come «con monoblocco». */
export interface CondizioneAsseAi {
  asse: string;
  valori: string[];
}

export interface AsseAi {
  codice: string;
  sort_order: number;
  obbligatorio: boolean;
  values: ValoreAsseAi[];
  visibile_se?: CondizioneAsseAi | null;
}

const condizioneValida = (c: unknown): c is CondizioneAsseAi =>
  !!c && typeof c === "object" && typeof (c as CondizioneAsseAi).asse === "string" &&
  Array.isArray((c as CondizioneAsseAi).valori);

/**
 * I codici degli assi che si vedono con queste scelte, con la regola di
 * codiciVisibili (src/lib/serramenti/assiCondizionati.ts): un asse con la
 * condizione si vede se quello che lo comanda è visibile e ha uno dei valori
 * indicati. Un asse nascosto non si chiede e non pesa sul prezzo (05/10/2026):
 * prima l'AI lo segnalava come «obbligatorio non selezionato» su 574 prodotti
 * col monoblocco.
 */
export function codiciVisibiliAi(assi: AsseAi[], scelte: Record<string, string>): Set<string> {
  const perCodice = new Map(assi.map((a) => [a.codice, a]));
  const visibili = new Set(assi.filter((a) => !condizioneValida(a.visibile_se)).map((a) => a.codice));
  let cambiato = true;
  while (cambiato) {
    cambiato = false;
    for (const a of assi) {
      if (visibili.has(a.codice) || !condizioneValida(a.visibile_se)) continue;
      const comanda = perCodice.get(a.visibile_se.asse);
      if (!comanda || !visibili.has(comanda.codice)) continue;
      const scelto = comanda.values.find((v) => v.id === scelte[comanda.codice]);
      if (scelto?.valore != null && a.visibile_se.valori.includes(scelto.valore)) {
        visibili.add(a.codice);
        cambiato = true;
      }
    }
  }
  return visibili;
}

export interface CellaGrigliaAi {
  valore_x: number;
  valore_y: number;
  prezzo_vendita: number;
  prezzo_acquisto: number | null;
}

/** La misura esatta, altrimenti la più piccola che la contiene; null fuori griglia. */
export function cellaGrigliaAi(
  griglia: CellaGrigliaAi[],
  x: number,
  y: number,
): { cella: CellaGrigliaAi; esatta: boolean } | null {
  const esatta = griglia.find((g) => g.valore_x === x && g.valore_y === y);
  if (esatta) return { cella: esatta, esatta: true };
  const contiene = griglia
    .filter((g) => g.valore_x >= x && g.valore_y >= y)
    .sort((a, b) =>
      a.valore_x * a.valore_y - b.valore_x * b.valore_y ||
      a.valore_x - b.valore_x ||
      a.valore_y - b.valore_y
    );
  return contiene.length > 0 ? { cella: contiene[0], esatta: false } : null;
}

/**
 * Prezzo unitario di vendita (arrotondato al centesimo), oppure null quando non
 * si può dire: misure mancanti, griglia vuota, misura fuori dalla griglia. Il
 * motivo finisce in `avvisi`.
 */
export function prezzoFamigliaAi(
  args: {
    nome: string;
    prezzi: PrezziFamigliaAi;
    assi: AsseAi[];
    scelte: Record<string, string>;
    xMm: number | null;
    yMm: number | null;
    ml: number | null;
    griglia: CellaGrigliaAi[] | undefined;
  },
  avvisi: string[],
): number | null {
  const { nome, prezzi, assi, scelte, xMm, yMm, ml, griglia } = args;
  const mq = xMm != null && yMm != null ? (xMm / 1000) * (yMm / 1000) : null;
  const modalita = prezzi.modalita_prezzo_base;
  let pv = 0;
  let pa = 0;

  switch (modalita) {
    case "mq":
      if (mq == null) {
        avvisi.push(`Famiglia '${nome}' mq: misure L×H mancanti.`);
        return null;
      }
      pv = prezzi.prezzo_base_vendita * mq;
      pa = prezzi.prezzo_base_acquisto * mq;
      break;
    case "griglia": {
      if (xMm == null || yMm == null) {
        avvisi.push(`Famiglia '${nome}' griglia: misure L×H mancanti.`);
        return null;
      }
      if (!griglia || griglia.length === 0) {
        avvisi.push(`Famiglia '${nome}' griglia: listino vuoto.`);
        return null;
      }
      const trovata = cellaGrigliaAi(griglia, xMm, yMm);
      if (!trovata) {
        const maxX = Math.max(...griglia.map((g) => g.valore_x));
        const maxY = Math.max(...griglia.map((g) => g.valore_y));
        avvisi.push(
          `Famiglia '${nome}': misura ${xMm}×${yMm} fuori listino (la griglia arriva a ${maxX}×${maxY} mm), prezzo da scrivere.`,
        );
        return null;
      }
      if (!trovata.esatta) {
        avvisi.push(
          `Famiglia '${nome}': misura ${xMm}×${yMm} non in griglia, usato il prezzo della misura superiore ${trovata.cella.valore_x}×${trovata.cella.valore_y} mm.`,
        );
      }
      pv = trovata.cella.prezzo_vendita;
      pa = trovata.cella.prezzo_acquisto ?? 0;
      break;
    }
    default: // pz, misura_libera
      pv = prezzi.prezzo_base_vendita;
      pa = prezzi.prezzo_base_acquisto;
  }

  // «Acquisto + ricarico»: la vendita si rifà dal costo al netto degli sconti
  // fornitore, col ricarico di oggi (il prezzo salvato può essere vecchio).
  if (prezzi.prezzo_base_mode === "acquisto_markup") {
    const sconto = (n: number) => Math.min(100, Math.max(0, Number(n) || 0)) / 100;
    const netto = Math.max(0, pa) * (1 - sconto(prezzi.sconto_fornitore_1)) * (1 - sconto(prezzi.sconto_fornitore_2));
    const ricarico = Math.max(0, Number(prezzi.markup_valore) || 0);
    pv = prezzi.markup_tipo === "percentuale"
      ? netto * (1 + ricarico / 100)
      : prezzi.markup_tipo === "fisso_pz"
        ? netto + ricarico
        : netto;
  }

  const visibili = codiciVisibiliAi(assi, scelte);
  const ordinati = assi.filter((a) => visibili.has(a.codice)).sort((a, b) => a.sort_order - b.sort_order);
  const valore = (asse: AsseAi) => {
    const id = scelte[asse.codice];
    return id ? asse.values.find((v) => v.id === id) : undefined;
  };

  // Prezzo proprio della variante: sostituisce il prezzo base (al m² per le
  // famiglie a mq); su quell'asse le maggiorazioni non si sommano. Non per la
  // griglia, dove il prezzo dipende dalla cella.
  const conPrezzoProprio = new Set<string>();
  if (modalita !== "griglia") {
    for (const asse of ordinati) {
      const v = valore(asse);
      if (!v || v.prezzo_vendita == null || !(v.prezzo_vendita > 0)) continue;
      pv = modalita === "mq" && mq != null ? v.prezzo_vendita * mq : v.prezzo_vendita;
      conPrezzoProprio.add(asse.codice);
    }
  }

  // Prima le percentuali, poi i fissi, nell'ordine degli assi.
  for (const asse of ordinati) {
    if (!scelte[asse.codice]) {
      if (asse.obbligatorio) avvisi.push(`Famiglia '${nome}': asse "${asse.codice}" obbligatorio non selezionato.`);
      continue;
    }
    if (conPrezzoProprio.has(asse.codice)) continue;
    const v = valore(asse);
    if (v?.maggiorazione_tipo === "percentuale") pv = pv * (1 + v.maggiorazione_valore / 100);
  }
  for (const asse of ordinati) {
    if (conPrezzoProprio.has(asse.codice)) continue;
    const v = valore(asse);
    if (!v) continue;
    if (v.maggiorazione_tipo === "fisso_pz") pv += v.maggiorazione_valore;
    else if (v.maggiorazione_tipo === "fisso_mq" && mq != null) pv += v.maggiorazione_valore * mq;
    else if (v.maggiorazione_tipo === "fisso_ml" && ml != null) pv += v.maggiorazione_valore * ml;
  }

  // Le varianti possono ridurre il prezzo (−8%, −20 €), mai sotto zero.
  if (pv < 0) {
    avvisi.push(`Famiglia '${nome}': le riduzioni delle varianti portano il prezzo sotto zero, conta 0 €.`);
    pv = 0;
  }

  return Math.round(pv * 100) / 100;
}
