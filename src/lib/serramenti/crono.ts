/**
 * src/lib/serramenti/crono.ts — Cronoprogramma lavori.
 *
 * Genera un mini-Gantt visuale da n° pezzi × tempi standard azienda.
 * Output: array di fasi con giorno di inizio, durata, label.
 *
 * Default:
 *   ORDINE         giorno 1
 *   PRODUZIONE     giorni 2 — (2 + giorni_produzione - 1)
 *   SOPRALLUOGO    1 giorno (~3 giorni prima della posa)
 *   POSA           giorni dopo produzione
 *   COLLAUDO       1 giorno dopo posa
 */

export interface FaseCrono {
  key: string;
  label: string;
  giorno_inizio: number;
  giorno_fine: number;
  durata: number;
  emoji?: string;
}

export interface InputCrono {
  num_serramenti: number;
  giorni_produzione?: number;      // default 30
  giorni_posa_per_pezzo?: number;  // default 0.8 — quindi 8 pezzi = ~6.4 giorni → 7
  giorni_collaudo?: number;        // default 1
  sopralluogo_prima_di_posa?: number; // default 3 (giorni prima)
}

export function generaCrono(input: InputCrono): FaseCrono[] {
  const giorni_produzione = input.giorni_produzione ?? 30;
  const giorni_posa = Math.ceil((input.num_serramenti || 1) * (input.giorni_posa_per_pezzo ?? 0.8));
  const giorni_collaudo = input.giorni_collaudo ?? 1;
  const sopralluogo_offset = input.sopralluogo_prima_di_posa ?? 3;

  const fasi: FaseCrono[] = [];

  // Ordine: giorno 1
  fasi.push({
    key: "ordine",
    label: "Conferma ordine",
    giorno_inizio: 1,
    giorno_fine: 1,
    durata: 1,
    emoji: "📝",
  });

  // Produzione: giorno 2 → (2 + giorni_produzione - 1)
  const prod_inizio = 2;
  const prod_fine = prod_inizio + giorni_produzione - 1;
  fasi.push({
    key: "produzione",
    label: "Produzione",
    giorno_inizio: prod_inizio,
    giorno_fine: prod_fine,
    durata: giorni_produzione,
    emoji: "🏭",
  });

  // Sopralluogo pre-posa: prod_fine - sopralluogo_offset + 1
  const sopr_giorno = Math.max(prod_fine - sopralluogo_offset + 1, prod_inizio + 1);
  fasi.push({
    key: "sopralluogo_pre_posa",
    label: "Sopralluogo pre-posa",
    giorno_inizio: sopr_giorno,
    giorno_fine: sopr_giorno,
    durata: 1,
    emoji: "📐",
  });

  // Posa: dopo produzione
  const posa_inizio = prod_fine + 1;
  const posa_fine = posa_inizio + giorni_posa - 1;
  fasi.push({
    key: "posa",
    label: "Posa",
    giorno_inizio: posa_inizio,
    giorno_fine: posa_fine,
    durata: giorni_posa,
    emoji: "🔧",
  });

  // Collaudo
  const coll_inizio = posa_fine + 1;
  fasi.push({
    key: "collaudo",
    label: "Collaudo finale",
    giorno_inizio: coll_inizio,
    giorno_fine: coll_inizio + giorni_collaudo - 1,
    durata: giorni_collaudo,
    emoji: "✅",
  });

  return fasi;
}

/**
 * Durata totale del cantiere (giorni dal primo al collaudo finale).
 */
export function durataTotaleGiorni(fasi: FaseCrono[]): number {
  if (fasi.length === 0) return 0;
  return Math.max(...fasi.map((f) => f.giorno_fine));
}

/**
 * Versione ASCII per anteprima debug / fallback.
 */
export function renderCronoAscii(fasi: FaseCrono[], larghezza: number = 30): string {
  const totale = durataTotaleGiorni(fasi);
  if (totale === 0) return "";
  return fasi.map((f) => {
    const start = Math.floor(((f.giorno_inizio - 1) / totale) * larghezza);
    const end = Math.ceil((f.giorno_fine / totale) * larghezza);
    const bar = " ".repeat(start) + "█".repeat(Math.max(1, end - start));
    return `${f.label.padEnd(20)} ${bar.padEnd(larghezza)} g.${f.giorno_inizio}-${f.giorno_fine}`;
  }).join("\n");
}
