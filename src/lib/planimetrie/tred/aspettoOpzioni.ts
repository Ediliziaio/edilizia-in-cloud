/**
 * Le scelte dell'aspetto realistico del 3D (facciata, infissi, ora del giorno, alberi, ombre morbide):
 * senza three.js, così il visualizzatore, il dialogo dei render esterni e i test le usano senza pesi.
 * Le scelte si ricordano nel browser: quelle fatte nel 3D valgono anche per i render esterni con l'AI.
 */
import type { Scena3D } from "./tipi";
import { LUCI_RENDER_LOCALE, type LuceRenderLocale } from "../../../../shared/planimetrie/renderLocale";

export type IdFacciata = "intonaco_bianco" | "intonaco_caldo" | "intonaco_grigio" | "intonaco_terra" | "mattone" | "pietra" | "legno" | "cemento"
  | "intonaco_salvia" | "intonaco_azzurro" | "intonaco_ocra" | "intonaco_rosa" | "intonaco_antracite" | "mattone_chiaro" | "pietra_grigia";
/** Fascia bassa della facciata: come il resto, oppure in pietra, in mattoni o tinteggiata scura. */
export type IdZoccolo = "intonaco" | "pietra" | "mattone" | "scuro";
export type IdStileCasa = "moderna" | "mediterranea" | "rustica" | "industriale" | "nordica" | "classica";
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
  // i nuovi si aggiungono in fondo: le scelte già ricordate nel browser restano valide
  intonaco_salvia: { nome: "Intonaco verde salvia", colore: "#b9c4ad", trama: "intonaco", metri: 2 },
  intonaco_azzurro: { nome: "Intonaco azzurro polvere", colore: "#b8c9d6", trama: "intonaco", metri: 2 },
  intonaco_ocra: { nome: "Intonaco giallo ocra", colore: "#e3c178", trama: "intonaco", metri: 2 },
  intonaco_rosa: { nome: "Intonaco rosa antico", colore: "#dcb3a2", trama: "intonaco", metri: 2 },
  intonaco_antracite: { nome: "Intonaco antracite", colore: "#5d6167", trama: "intonaco", metri: 2 },
  mattone_chiaro: { nome: "Mattoni chiari", colore: "#ffffff", trama: "mattone_chiaro", metri: 1 },
  pietra_grigia: { nome: "Pietra grigia", colore: "#ffffff", trama: "pietra_grigia", metri: 1.5 },
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

export const ZOCCOLI: Record<IdZoccolo, string> = { intonaco: "Zoccolo come la facciata", pietra: "Zoccolo in pietra", mattone: "Zoccolo in mattoni", scuro: "Zoccolo scuro" };
export const ID_ZOCCOLI = Object.keys(ZOCCOLI) as IdZoccolo[];

/** Modelli estetici: un clic imposta facciata, infissi e zoccolo insieme. Poi ogni scelta si può ritoccare. */
export const STILI_CASA: Record<IdStileCasa, { nome: string; scelte: Pick<OpzioniAspetto, "facciata" | "infissi" | "zoccolo" | "coloreFacciata"> }> = {
  moderna: { nome: "Moderna", scelte: { facciata: "intonaco_bianco", infissi: "antracite", zoccolo: "scuro", coloreFacciata: undefined } },
  mediterranea: { nome: "Mediterranea", scelte: { facciata: "intonaco_ocra", infissi: "verde", zoccolo: "pietra", coloreFacciata: undefined } },
  rustica: { nome: "Rustica", scelte: { facciata: "pietra", infissi: "legno", zoccolo: "intonaco", coloreFacciata: undefined } },
  industriale: { nome: "Industriale", scelte: { facciata: "mattone", infissi: "antracite", zoccolo: "scuro", coloreFacciata: undefined } },
  nordica: { nome: "Nordica", scelte: { facciata: "legno", infissi: "bianco", zoccolo: "pietra", coloreFacciata: undefined } },
  classica: { nome: "Classica", scelte: { facciata: "intonaco_rosa", infissi: "bianco", zoccolo: "mattone", coloreFacciata: undefined } },
};
export const ID_STILI_CASA = Object.keys(STILI_CASA) as IdStileCasa[];

/** Lo stile che corrisponde alle scelte di adesso, se ce n'è uno. */
export function stileCasa(o: Pick<OpzioniAspetto, "facciata" | "infissi" | "zoccolo" | "coloreFacciata">): IdStileCasa | undefined {
  return ID_STILI_CASA.find((id) => {
    const s = STILI_CASA[id].scelte;
    return s.facciata === o.facciata && s.infissi === o.infissi && (s.zoccolo ?? "intonaco") === (o.zoccolo ?? "intonaco") && !o.coloreFacciata;
  });
}

const COLORE = /^#[0-9a-f]{6}$/i;
/** Il colore della facciata: quello scelto a mano (solo sugli intonaci) o quello del campione. */
export function coloreDellaFacciata(o: Pick<OpzioniAspetto, "facciata" | "coloreFacciata">): string {
  const f = FACCIATE[o.facciata];
  return f.trama === "intonaco" && o.coloreFacciata && COLORE.test(o.coloreFacciata) ? o.coloreFacciata : f.colore;
}

export interface OpzioniAspetto {
  realistico: boolean;
  facciata: IdFacciata;
  /** Tinta scelta a mano per una facciata a intonaco ("#rrggbb"). */
  coloreFacciata?: string;
  zoccolo?: IdZoccolo;
  infissi: IdInfissi;
  /** Ora del giorno, da 7 a 19. */
  ora: number;
  luce?: LuceRenderLocale;
  alberi: boolean;
  /** Occlusione ambientale (ombre negli angoli): più bella, più pesante. */
  effetti: boolean;
  /** Dentro la stanza la facciata e il cielo non servono. */
  dentro?: boolean;
}

export const ASPETTO_PREDEFINITO: OpzioniAspetto = { realistico: true, facciata: "intonaco_bianco", infissi: "antracite", ora: 15, alberi: true, effetti: true };

export function ammetteAlberiDiContesto(scena: Scena3D) {
  return !scena.mesh.some(m => /(?:^|:)area:/.test(m.id) || /^albero/i.test(m.nome));
}

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
      luce: g.luce && LUCI_RENDER_LOCALE.includes(g.luce) ? g.luce : undefined,
      alberi: typeof g.alberi === "boolean" ? g.alberi : base.alberi,
      effetti: typeof g.effetti === "boolean" ? g.effetti : base.effetti,
      ...(typeof g.coloreFacciata === "string" && COLORE.test(g.coloreFacciata) ? { coloreFacciata: g.coloreFacciata } : {}),
      ...(g.zoccolo && g.zoccolo in ZOCCOLI && g.zoccolo !== "intonaco" ? { zoccolo: g.zoccolo } : {}),
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
  const tinta = FACCIATE[o.facciata].trama === "intonaco" && o.coloreFacciata && COLORE.test(o.coloreFacciata) ? `intonaco tinteggiato ${o.coloreFacciata}` : FACCIATE[o.facciata].nome.toLowerCase();
  const parti = [`Facciata: ${tinta}`, `infissi ${INFISSI[o.infissi].nome.toLowerCase()}`];
  if (o.zoccolo && o.zoccolo !== "intonaco") parti.push(ZOCCOLI[o.zoccolo].toLowerCase());
  if (tetto) parti.push(`tetto ${tetto.tipo === "piano" ? "piano" : "a falde"} in ${NOME_TETTO[tetto.finitura ?? (tetto.tipo === "piano" ? "guaina" : "tegole")] ?? "tegole"}`);
  return `${parti.join(", ")}. Mantieni materiali e colori della casa come nell'immagine.`;
}
