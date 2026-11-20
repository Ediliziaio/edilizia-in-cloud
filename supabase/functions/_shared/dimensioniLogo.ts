/** Stessa regolazione per editor, anteprime e PDF, nel browser e sul server. */
export const SCALA_LOGO_MIN = 25;
export const SCALA_LOGO_MAX = 250;

export type AllineamentoLogo = "left" | "center" | "right";

export function normalizzaAllineamentoLogo(valore: unknown): AllineamentoLogo {
  return valore === "center" || valore === "right" ? valore : "left";
}

/** Coordinate relative alla testata; stessa logica in millimetri e in punti. */
export function disponiLogoTestata(larghezza: number, larghezzaLogo: number, spazioTesto: number, valore: unknown, distanza: number) {
  const allineamento = normalizzaAllineamentoLogo(valore);
  const titoloSotto = allineamento === "center" || larghezzaLogo + spazioTesto + distanza > larghezza + 0.01;
  return {
    logoX: allineamento === "right" ? larghezza - larghezzaLogo : allineamento === "center" ? (larghezza - larghezzaLogo) / 2 : 0,
    titoloSotto,
    larghezzaTesto: titoloSotto ? larghezza : larghezza - larghezzaLogo - distanza,
    allineamentoTesto: (allineamento === "right" ? "left" : allineamento === "center" ? "center" : "right") as AllineamentoLogo,
    ancoraTestoX: allineamento === "right" ? 0 : allineamento === "center" ? larghezza / 2 : larghezza,
  };
}

export function normalizzaScalaLogo(valore: unknown): number {
  return typeof valore === "number" && Number.isFinite(valore)
    ? Math.min(SCALA_LOGO_MAX, Math.max(SCALA_LOGO_MIN, Math.round(valore)))
    : 100;
}

interface Misure { larghezza: number; altezza: number }

/** Scala la misura di serie già proporzionata, poi la contiene nello spazio disponibile. */
export function dimensioniLogo(
  originale: Misure,
  base: Misure,
  percentuale: unknown = 100,
  limite: Misure = { larghezza: base.larghezza * 2.5, altezza: base.altezza * 2.5 },
): Misure {
  if (![originale.larghezza, originale.altezza, base.larghezza, base.altezza, limite.larghezza, limite.altezza]
    .every(v => Number.isFinite(v) && v > 0)) return { larghezza: 0, altezza: 0 };
  const scalaBase = Math.min(base.larghezza / originale.larghezza, base.altezza / originale.altezza);
  const scala = Math.min(
    scalaBase * normalizzaScalaLogo(percentuale) / 100,
    limite.larghezza / originale.larghezza,
    limite.altezza / originale.altezza,
  );
  return { larghezza: originale.larghezza * scala, altezza: originale.altezza * scala };
}
