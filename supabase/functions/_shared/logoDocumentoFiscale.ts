export interface LogoDocumentoFiscale {
  posizione: "sinistra" | "centro" | "destra";
  dimensione: number;
  spazioSopra: number;
}

/** Solo valori normalizzati entrano nel CSS condiviso fra anteprima e stampa. */
export function leggiLogoDocumentoFiscale(dato: unknown): LogoDocumentoFiscale {
  const d = dato && typeof dato === "object" && !Array.isArray(dato) ? dato as Record<string, unknown> : {};
  const numero = (v: unknown, base: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : base;
  return {
    posizione: d.posizione === "centro" || d.posizione === "destra" ? d.posizione : "sinistra",
    dimensione: numero(d.dimensione, 100, 50, 200),
    spazioSopra: numero(d.spazioSopra, 0, 0, 30),
  };
}

export function cssLogoDocumentoFiscale(dato: unknown): string {
  const c = leggiLogoDocumentoFiscale(dato), scala = c.dimensione / 100;
  return `.fd-foglio .fd-logo { height: ${22 * scala}mm; width: auto; max-width: min(${70 * scala}mm, 100%); margin: ${c.spazioSopra}mm ${c.posizione === "centro" ? "auto" : "0"} 3mm ${c.posizione === "sinistra" ? "0" : "auto"}; object-position: ${c.posizione === "sinistra" ? "left" : c.posizione === "destra" ? "right" : "center"} center; }`;
}
