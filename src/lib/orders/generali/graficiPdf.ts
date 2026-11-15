// src/lib/orders/generali/graficiPdf.ts
// I conti dei grafici dei PDF delle operazioni (Dossier, rendiconto all'investitore): fette della
// torta, passi della cascata, scala degli assi. Solo numeri e stringhe di percorso SVG, niente
// React: li disegna components/orders/generali/pdf/GraficiPdf.tsx.
import { CATEGORIE_PIANO, isCategoriaPiano } from "@/lib/orders/generali/pianoCategorie";

/** I colori delle serie, in ordine: blu, arancio, poi tinte che restano distinte anche in bianco e nero. */
export const PALETTE_GRAFICI = [
  "#1E3A5F", "#F97316", "#0E7490", "#7C3AED", "#047857", "#B45309", "#BE185D", "#64748B", "#2563EB", "#A16207",
] as const;

export interface Fetta {
  nome: string;
  valore: number;
  colore: string;
  /** Da 0 a 1. */
  quota: number;
}

/**
 * Le fette di una torta: solo i valori positivi, dal più grande, e oltre `massimo` fette le più
 * piccole finiscono in «Altro» (una torta con quindici spicchi non si legge).
 */
export function fetteTorta(voci: { nome: string; valore: number; colore?: string }[], massimo = 7): Fetta[] {
  const positive = voci.filter((v) => Number.isFinite(v.valore) && v.valore > 0.5).sort((a, b) => b.valore - a.valore);
  const tenute = positive.length > massimo ? positive.slice(0, massimo - 1) : positive;
  const resto = positive.length > massimo ? positive.slice(massimo - 1) : [];
  const tutte = resto.length > 0 ? [...tenute, { nome: "Altro", valore: resto.reduce((t, v) => t + v.valore, 0), colore: "#9ca3af" }] : tenute;
  const totale = tutte.reduce((t, v) => t + v.valore, 0);
  if (totale <= 0) return [];
  return tutte.map((v, i) => ({
    nome: v.nome,
    valore: v.valore,
    colore: v.colore ?? PALETTE_GRAFICI[i % PALETTE_GRAFICI.length],
    quota: v.valore / totale,
  }));
}

const punto = (cx: number, cy: number, r: number, angolo: number) =>
  `${(cx + r * Math.cos(angolo)).toFixed(2)} ${(cy + r * Math.sin(angolo)).toFixed(2)}`;

/**
 * Il percorso di uno spicchio di ciambella da `da` ad `a` (quote da 0 a 1, partendo dall'alto in
 * senso orario). Con raggio interno 0 è una fetta di torta piena. Uno spicchio intero (quota 1)
 * non si può disegnare con un arco solo: lo si chiude in due metà.
 */
export function percorsoSpicchio(cx: number, cy: number, esterno: number, interno: number, da: number, a: number): string {
  const ampiezza = Math.max(0, Math.min(1, a) - Math.max(0, da));
  if (ampiezza >= 0.9999) {
    const meta = da + 0.5;
    return `${percorsoSpicchio(cx, cy, esterno, interno, da, meta)} ${percorsoSpicchio(cx, cy, esterno, interno, meta, da + 1 - 1e-6)}`;
  }
  const a0 = da * 2 * Math.PI - Math.PI / 2;
  const a1 = a * 2 * Math.PI - Math.PI / 2;
  const grande = ampiezza > 0.5 ? 1 : 0;
  if (interno <= 0) {
    return `M ${cx} ${cy} L ${punto(cx, cy, esterno, a0)} A ${esterno} ${esterno} 0 ${grande} 1 ${punto(cx, cy, esterno, a1)} Z`;
  }
  return [
    `M ${punto(cx, cy, esterno, a0)}`,
    `A ${esterno} ${esterno} 0 ${grande} 1 ${punto(cx, cy, esterno, a1)}`,
    `L ${punto(cx, cy, interno, a1)}`,
    `A ${interno} ${interno} 0 ${grande} 0 ${punto(cx, cy, interno, a0)}`,
    "Z",
  ].join(" ");
}

export interface PassoCascata {
  nome: string;
  /** Dove comincia e dove finisce la barra: una barra di totale parte da zero. */
  da: number;
  a: number;
  tipo: "totale" | "piu" | "meno" | "risultato";
}

/**
 * La cascata dai ricavi al margine: la prima barra sono i ricavi, poi ogni gruppo di costi
 * scende dal livello raggiunto, l'ultima è il margine (da zero). I costi oltre `massimo`
 * finiscono in «Altri costi».
 */
export function passiCascata(ricavi: number, costi: { nome: string; valore: number }[], massimo = 7): PassoCascata[] {
  const ordinati = costi.filter((c) => Math.abs(c.valore) > 0.5).sort((a, b) => b.valore - a.valore);
  const tenuti = ordinati.length > massimo ? ordinati.slice(0, massimo - 1) : ordinati;
  const resto = ordinati.length > massimo ? ordinati.slice(massimo - 1) : [];
  const gruppi = resto.length > 0 ? [...tenuti, { nome: "Altri costi", valore: resto.reduce((t, c) => t + c.valore, 0) }] : tenuti;
  const passi: PassoCascata[] = [{ nome: "Ricavi", da: 0, a: ricavi, tipo: "totale" }];
  let livello = ricavi;
  for (const g of gruppi) {
    const dopo = livello - g.valore;
    passi.push({ nome: g.nome, da: livello, a: dopo, tipo: g.valore >= 0 ? "meno" : "piu" });
    livello = dopo;
  }
  passi.push({ nome: "Margine", da: 0, a: livello, tipo: "risultato" });
  return passi;
}

/** Una scala «tonda» per l'asse: da min a max con 3-5 tacche a passi di 1, 2 o 5 × 10^n. */
export function scalaAsse(min: number, max: number, tacche = 4): { min: number; max: number; passo: number; valori: number[] } {
  const basso = Math.min(0, min);
  const alto = Math.max(0, max);
  const campo = alto - basso || 1;
  const grezzo = campo / tacche;
  const potenza = Math.pow(10, Math.floor(Math.log10(grezzo)));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potenza).find((p) => campo / p <= tacche + 0.5) ?? 10 * potenza;
  const da = Math.floor(basso / passo) * passo;
  const fino = Math.ceil(alto / passo) * passo;
  const valori: number[] = [];
  for (let v = da; v <= fino + passo / 2; v += passo) valori.push(Math.abs(v) < passo / 1e6 ? 0 : v);
  return { min: da, max: fino, passo, valori };
}

/** «1,2 mln», «450k», «-80k», «900»: per gli assi e le etichette sulle barre. Trattino normale. */
export function cifraCompatta(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const segno = n < -0.5 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${segno}${(a / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: a >= 10_000_000 ? 0 : 1 })} mln`;
  if (a >= 1_000) return `${segno}${Math.round(a / 1_000).toLocaleString("it-IT", { useGrouping: "always" } as Intl.NumberFormatOptions)}k`;
  return `${segno}${Math.round(a)}`;
}

/** Ogni quante etichette dell'asse orizzontale scriverne una, per non farle accavallare. */
export const passoEtichette = (n: number, quante = 8) => Math.max(1, Math.ceil(n / quante));

/** Il nome di una categoria del piano; per le righe fuori piano la parola del reale, leggibile. */
export function nomeCategoriaPiano(categoria: string): string {
  if (isCategoriaPiano(categoria)) return CATEGORIE_PIANO[categoria].nome;
  if (categoria === "varianti_acquirenti") return "Varianti degli acquirenti";
  const t = categoria.replace(/^fuori:(costo|ricavo):/, "").replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Senza categoria";
}

export interface ColonnePiano {
  previsto: number;
  reale: number;
  aFinire: number;
  stima: number;
  scostamento: number;
}

/**
 * Le righe del piano raggruppate per categoria, nell'ordine in cui le categorie compaiono, con
 * i totali di ogni gruppo: la tabella dei PDF e la torta dei costi leggono da qui.
 */
export function gruppiPerCategoria<R extends ColonnePiano & { categoria: string }>(righe: R[]): { categoria: string; nome: string; righe: R[]; totali: ColonnePiano }[] {
  const ordine: string[] = [];
  const mappa = new Map<string, R[]>();
  for (const r of righe) {
    if (!mappa.has(r.categoria)) {
      mappa.set(r.categoria, []);
      ordine.push(r.categoria);
    }
    mappa.get(r.categoria)!.push(r);
  }
  const tondo = (n: number) => Math.round(n * 100) / 100;
  return ordine.map((categoria) => {
    const sue = mappa.get(categoria)!;
    const somma = (k: keyof ColonnePiano) => tondo(sue.reduce((t, r) => t + r[k], 0));
    return {
      categoria,
      nome: nomeCategoriaPiano(categoria),
      righe: sue,
      totali: { previsto: somma("previsto"), reale: somma("reale"), aFinire: somma("aFinire"), stima: somma("stima"), scostamento: somma("scostamento") },
    };
  });
}
