/**
 * Varianti che compaiono solo se un'altra variante ha un certo valore.
 *
 * Esempio: «Monoblocco» (Senza / Con) su ogni tipologia; altezza del cassonetto, avvolgimento, colori e zanzariera
 * si chiedono solo se si sceglie «Con monoblocco». La condizione sta sull'asse (`visibile_se`): il nome dell'altra
 * variante (`asse` = il suo codice) e i valori (`valori` = i `valore` del listino, non le etichette) che la accendono.
 *
 * Una variante nascosta non si chiede, non pesa sul prezzo e non finisce nel PDF né nel disegno: basta passare gli
 * assi da qui prima di usarli (`conAssiVisibili`) e tenere le scelte in ordine (`normalizzaSelezione`).
 */

export interface CondizioneAsse {
  asse: string;
  valori: string[];
}

interface ValoreMinimo {
  id: string;
  valore: string;
  attivo?: boolean | null;
  is_default?: boolean | null;
}

interface AsseMinimo {
  codice: string;
  visibile_se?: CondizioneAsse | null;
  values: ReadonlyArray<ValoreMinimo>;
}

const condizioneValida = (c: unknown): c is CondizioneAsse =>
  !!c && typeof c === "object" && typeof (c as CondizioneAsse).asse === "string" && Array.isArray((c as CondizioneAsse).valori);

/** I codici degli assi che si vedono con questa scelta. */
export function codiciVisibili(assi: ReadonlyArray<AsseMinimo>, selezione: Record<string, string> | null | undefined): Set<string> {
  const scelta = selezione ?? {};
  const perCodice = new Map(assi.map((a) => [a.codice, a]));
  const visibili = new Set<string>();
  // Un livello solo: l'asse che comanda deve essere a sua volta visibile (si ripete finché non cambia nulla).
  let cambiato = true;
  const dentro = new Set(assi.filter((a) => !condizioneValida(a.visibile_se)).map((a) => a.codice));
  for (const c of dentro) visibili.add(c);
  while (cambiato) {
    cambiato = false;
    for (const a of assi) {
      if (visibili.has(a.codice) || !condizioneValida(a.visibile_se)) continue;
      const comanda = perCodice.get(a.visibile_se.asse);
      if (!comanda || !visibili.has(comanda.codice)) continue;
      const valore = comanda.values.find((v) => v.id === scelta[comanda.codice]);
      if (valore && a.visibile_se.valori.includes(valore.valore)) {
        visibili.add(a.codice);
        cambiato = true;
      }
    }
  }
  return visibili;
}

export function assiVisibili<A extends AsseMinimo>(assi: ReadonlyArray<A>, selezione: Record<string, string> | null | undefined): A[] {
  const ok = codiciVisibili(assi, selezione);
  return assi.filter((a) => ok.has(a.codice));
}

/** Il prodotto con i soli assi che si vedono con questa scelta. */
export function conAssiVisibili<F extends { axes: ReadonlyArray<AsseMinimo> }>(famiglia: F, selezione: Record<string, string> | null | undefined): F;
export function conAssiVisibili<F extends { axes: ReadonlyArray<AsseMinimo> }>(famiglia: F | null | undefined, selezione: Record<string, string> | null | undefined): F | null;
export function conAssiVisibili<F extends { axes: ReadonlyArray<AsseMinimo> }>(famiglia: F | null | undefined, selezione: Record<string, string> | null | undefined): F | null {
  if (!famiglia) return null;
  if (!famiglia.axes.some((a) => condizioneValida(a.visibile_se))) return famiglia;
  return { ...famiglia, axes: assiVisibili(famiglia.axes, selezione) };
}

/**
 * Le scelte in ordine dopo un cambio: via quelle degli assi nascosti, e per gli assi appena comparsi il valore di
 * partenza del listino. Le voci (il colore dentro «Colore Standard») degli assi nascosti vanno via con loro.
 */
export function normalizzaSelezione(
  assi: ReadonlyArray<AsseMinimo>,
  valori: Record<string, string>,
  voci?: Record<string, string> | null,
): { valori: Record<string, string>; voci: Record<string, string> } {
  const prossimi = { ...valori };
  // Si ripete: un asse che compare può accendere un altro.
  for (let giro = 0; giro < 4; giro++) {
    const ok = codiciVisibili(assi, prossimi);
    let cambiato = false;
    for (const a of assi) {
      if (ok.has(a.codice)) {
        if (!prossimi[a.codice]) {
          const partenza = a.values.find((v) => v.is_default && v.attivo !== false) ?? a.values.find((v) => v.attivo !== false);
          if (partenza) {
            prossimi[a.codice] = partenza.id;
            cambiato = true;
          }
        }
      } else if (a.codice in prossimi) {
        delete prossimi[a.codice];
        cambiato = true;
      }
    }
    if (!cambiato) break;
  }
  const ok = codiciVisibili(assi, prossimi);
  const vociOk: Record<string, string> = {};
  for (const [codice, voce] of Object.entries(voci ?? {})) if (ok.has(codice)) vociOk[codice] = voce;
  return { valori: prossimi, voci: vociOk };
}
