/**
 * Le scelte dell'aspetto realistico del 3D (facciata, infissi, ora del giorno, alberi, ombre morbide):
 * senza three.js, così il visualizzatore, il dialogo dei render esterni e i test le usano senza pesi.
 * Le scelte si ricordano nel browser: quelle fatte nel 3D valgono anche per i render esterni con l'AI.
 */

export type IdFacciata = "intonaco_bianco" | "intonaco_caldo" | "intonaco_grigio" | "intonaco_terra" | "mattone" | "pietra" | "legno" | "cemento";
export type IdInfissi = "bianco" | "antracite" | "legno" | "verde" | "grigio";

export const FACCIATE: Record<IdFacciata, { nome: string; colore: string; trama: string; metri: number }> = {
  intonaco_bianco: { nome: "Intonaco bianco", colore: "#f4f1ea", trama: "intonaco", metri: 2 },
  intonaco_caldo: { nome: "Intonaco sabbia", colore: "#e7d2ad", trama: "intonaco", metri: 2 },
  intonaco_grigio: { nome: "Intonaco grigio", colore: "#c6cacf", trama: "intonaco", metri: 2 },
  intonaco_terra: { nome: "Intonaco terracotta", colore: "#cf9d78", trama: "intonaco", metri: 2 },
  mattone: { nome: "Mattoni a vista", colore: "#ffffff", trama: "mattone", metri: 1 },
  pietra: { nome: "Pietra", colore: "#ffffff", trama: "pietra", metri: 1.5 },
  legno: { nome: "Rivestimento in legno", colore: "#ffffff", trama: "legno", metri: 1 },
  cemento: { nome: "Cemento a vista", colore: "#ffffff", trama: "cemento", metri: 2 },
};
export const ID_FACCIATE = Object.keys(FACCIATE) as IdFacciata[];

export const INFISSI: Record<IdInfissi, { nome: string; colore: string }> = {
  bianco: { nome: "Bianchi", colore: "#f1f1ee" },
  antracite: { nome: "Grigio antracite", colore: "#3b4046" },
  legno: { nome: "Legno", colore: "#8a6a4b" },
  verde: { nome: "Verde bosco", colore: "#3f5b49" },
  grigio: { nome: "Grigio chiaro", colore: "#8d949a" },
};
export const ID_INFISSI = Object.keys(INFISSI) as IdInfissi[];

export interface OpzioniAspetto {
  realistico: boolean;
  facciata: IdFacciata;
  infissi: IdInfissi;
  /** Ora del giorno, da 7 a 19. */
  ora: number;
  alberi: boolean;
  /** Occlusione ambientale (ombre negli angoli): più bella, più pesante. */
  effetti: boolean;
  /** Dentro la stanza la facciata e il cielo non servono. */
  dentro?: boolean;
}

export const ASPETTO_PREDEFINITO: OpzioniAspetto = { realistico: true, facciata: "intonaco_bianco", infissi: "antracite", ora: 15, alberi: true, effetti: true };

const CHIAVE = "planimetrie:aspetto:v1";

/** Le scelte ricordate (o quelle di partenza). Non fallisce mai: senza memoria del browser vale il predefinito. */
export function leggiAspetto(): OpzioniAspetto {
  const base: OpzioniAspetto = { ...ASPETTO_PREDEFINITO, effetti: !(typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) };
  try {
    const g = JSON.parse(window.localStorage.getItem(CHIAVE) ?? "null") as Partial<OpzioniAspetto> | null;
    if (!g || typeof g !== "object") return base;
    return {
      realistico: typeof g.realistico === "boolean" ? g.realistico : base.realistico,
      facciata: g.facciata && g.facciata in FACCIATE ? g.facciata : base.facciata,
      infissi: g.infissi && g.infissi in INFISSI ? g.infissi : base.infissi,
      ora: typeof g.ora === "number" && g.ora >= 7 && g.ora <= 19 ? g.ora : base.ora,
      alberi: typeof g.alberi === "boolean" ? g.alberi : base.alberi,
      effetti: typeof g.effetti === "boolean" ? g.effetti : base.effetti,
    };
  } catch {
    return base;
  }
}

export function salvaAspetto(o: OpzioniAspetto): void {
  try {
    const { dentro: _d, ...resto } = o;
    window.localStorage.setItem(CHIAVE, JSON.stringify(resto));
  } catch {
    /* memoria piena o navigazione privata: le scelte valgono solo per questa volta */
  }
}

const NOME_TETTO: Record<string, string> = { tegole: "tegole", verde: "tetto verde a sedum", verde_intensivo: "giardino pensile", ghiaia: "ghiaia", lamiera: "lamiera (zinco)", guaina: "guaina scura" };

/**
 * Una frase per il render AI: com'è fatta la casa nella vista 3D (facciata, infissi, tetto), così l'immagine
 * non viene rifatta con altri materiali. Vuota se l'aspetto realistico è spento.
 */
export function descriviAspetto(o: OpzioniAspetto, tetto?: { tipo: string; finitura?: string }): string {
  if (!o.realistico) return "";
  const parti = [`Facciata: ${FACCIATE[o.facciata].nome.toLowerCase()}`, `infissi ${INFISSI[o.infissi].nome.toLowerCase()}`];
  if (tetto) parti.push(`tetto ${tetto.tipo === "piano" ? "piano" : "a falde"} in ${NOME_TETTO[tetto.finitura ?? (tetto.tipo === "piano" ? "guaina" : "tegole")] ?? "tegole"}`);
  return `${parti.join(", ")}. Mantieni materiali e colori della casa come nell'immagine.`;
}
