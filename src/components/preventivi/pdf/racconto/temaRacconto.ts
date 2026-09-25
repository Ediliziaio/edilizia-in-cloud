/**
 * I colori, le misure e i numeri dei documenti «racconto» (Conto Termico, Casa
 * Full Electric): senza componenti, così i file delle pagine esportano solo quelli.
 *
 * Caricarlo prepara il PDF nel browser: Buffer prima delle foto e niente
 * sillabazione inglese (vedi sotto). Lo importano tutte le pagine del racconto.
 */
import { Font } from "@react-pdf/renderer";
import { ensurePdfBufferCompatibility } from "@/lib/pdf/ensurePdfBufferCompatibility";
import { mescola, normalizzaHex, scurisci } from "../../../../../supabase/functions/_shared/temaColori";
import { euro } from "@/lib/contoTermico/calcoli";

// Prima che react-pdf legga una foto: nel browser senza Buffer le immagini si
// caricano ma perdono la chiave di cache (vedi ensurePdfBufferCompatibility). Il
// documento degli altri preventivi lo fa già; questo si genera anche da solo.
ensurePdfBufferCompatibility();
// Le parole italiane spezzate dal sillabatore inglese («confi-gurazione»): mai a
// capo dentro la parola, come nel documento degli altri preventivi.
Font.registerHyphenationCallback((word) => [word]);

// ─── Colori: quelli del preventivo fotovoltaico ─────────────────────────────
export const BASE = {
  arancio: "#F97316", arancioScuro: "#C2410C", ambra: "#FBBF24", arancioTenue: "#FFF7ED", arancioBordo: "#FED7AA",
  verde: "#16A34A", verdeScuro: "#15803D", verdeTenue: "#ECFDF3", verdeBordo: "#BBF7D0",
  rosso: "#DC2626", rossoTenue: "#FEF2F2", rossoBordo: "#FECACA",
  bluTenue: "#EFF6FF", bluBordo: "#BFDBFE", blu: "#1D4ED8",
  ink: "#0F172A", testo: "#334155", grigio: "#64748B", grigioChiaro: "#94A3B8", linea: "#E2E8F0", fondo: "#F8FAFC",
};

export function palette(primario?: string | null) {
  const navy = normalizzaHex(primario) ?? "#1E3A5F";
  return {
    ...BASE,
    navy,
    navyScuro: scurisci(navy, 0.45),
    navyChiaro: mescola(navy, "#FFFFFF", 0.14),
    vetro: mescola(navy, "#FFFFFF", 0.09),
    vetroBordo: mescola(navy, "#FFFFFF", 0.22),
  };
}
export type Palette = ReturnType<typeof palette>;

export const W = 595.28;
export const H = 841.89;
export const MARGINE = 46;
export const LARGHEZZA = W - MARGINE * 2;

/**
 * Con i caratteri incorporati react-pdf misura il simbolo € come uno spazio,
 * metà della sua larghezza vera: il simbolo si mangia lo spazio dopo («92 €al
 * mese») ed esce dai riquadri. Nel PDF lo segue uno spazio fisso che copre la
 * metà mancante.
 */
export const PDF_EURO = "€\u00A0";
export const soldi = (n: number) => euro(n).replace(/€$/, PDF_EURO);
export const soldiCent = (n: number) => euro(n, 2).replace(/€$/, PDF_EURO);
export const conEuro = (testo: string) => testo.replace(/€(?!\u00A0)/g, PDF_EURO);

export const dataLunga = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
};

export type Tono = "verde" | "arancio" | "blu" | "neutro" | "rosso";
export const TONI: Record<Tono, { fondo: string; bordo: string; valore: string; etichetta: string }> = {
  verde: { fondo: BASE.verdeTenue, bordo: BASE.verdeBordo, valore: BASE.verdeScuro, etichetta: BASE.verdeScuro },
  arancio: { fondo: BASE.arancioTenue, bordo: BASE.arancioBordo, valore: BASE.arancioScuro, etichetta: BASE.arancioScuro },
  blu: { fondo: BASE.bluTenue, bordo: BASE.bluBordo, valore: BASE.blu, etichetta: BASE.blu },
  neutro: { fondo: BASE.fondo, bordo: BASE.linea, valore: BASE.ink, etichetta: BASE.grigio },
  rosso: { fondo: BASE.rossoTenue, bordo: BASE.rossoBordo, valore: BASE.rosso, etichetta: BASE.rosso },
};

/**
 * Le due aree fra la curva e lo zero: sotto (rossa) e sopra (verde), tagliate
 * dove la curva attraversa lo zero. Due tracciati pieni invece di un gradiente:
 * nei PDF i gradienti in verticale uscivano rovesciati.
 */
export function areeSopraSotto(punti: { x: number; y: number }[], zero: number): { sotto: string; sopra: string } {
  const pezzi = { sotto: [] as { x: number; y: number }[][], sopra: [] as { x: number; y: number }[][] };
  let lato: "sotto" | "sopra" | null = null;
  let corrente: { x: number; y: number }[] = [];
  const chiudi = () => { if (lato && corrente.length > 1) pezzi[lato].push(corrente); corrente = []; };
  for (let i = 0; i < punti.length; i++) {
    const p = punti[i];
    const questo: "sotto" | "sopra" = p.y > zero ? "sotto" : "sopra";
    if (lato && questo !== lato && i > 0) {
      const q = punti[i - 1];
      const t = (zero - q.y) / (p.y - q.y);
      const incrocio = { x: q.x + t * (p.x - q.x), y: zero };
      corrente.push(incrocio);
      chiudi();
      corrente = [incrocio];
    }
    lato = questo;
    corrente.push(p);
  }
  chiudi();
  const tracciato = (pp: { x: number; y: number }[][]) => pp.map((pz) =>
    `M ${pz[0].x} ${zero} ${pz.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${pz[pz.length - 1].x} ${zero} Z`).join(" ");
  return { sotto: tracciato(pezzi.sotto), sopra: tracciato(pezzi.sopra) };
}
