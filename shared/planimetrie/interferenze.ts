/**
 * Controlli «di progetto» che un tecnico fa guardando la pianta (non sono igienico-sanitari):
 * - un pilastro, una scala o un ascensore che cade dentro il vano di una porta o di una finestra
 *   (il caso classico del pilastro in mezzo alla porta);
 * - una scala o un ascensore attraversati da una parete;
 * - alzata e pedata delle scale (regola 2a + p ≈ 62-64 cm, alzata fino a 18 cm, rampa larga almeno 80 cm).
 * Sono controlli di massima sui disegni: la verifica vera la firma il tecnico.
 */
import { assiDelMuro } from "./geometria.ts";
import type { Elemento, Livello, Muro, Punto, StatoPianta } from "./modello.ts";
import type { Verifica } from "./verifiche.ts";

const INGOMBRANTI = ["pilastro", "ascensore", "scala", "scala_u", "scala_chiocciola"];
const SCALE = ["scala", "scala_u", "scala_chiocciola"];
const NOMI: Record<string, string> = { pilastro: "Il pilastro", ascensore: "L'ascensore", scala: "La scala", scala_u: "La scala a U", scala_chiocciola: "La scala a chiocciola" };
const MISURE_PREDEFINITE: Record<string, [number, number]> = { pilastro: [30, 30], muro_contenimento: [600, 220], ascensore: [150, 150], scala: [100, 450], scala_u: [200, 360], scala_chiocciola: [160, 160] };
const ALTEZZA_INTERPIANO_CM = 280;

/** Gli angoli dell'ingombro ruotato (gradi in senso orario sulla pianta, y verso il basso). */
export function angoli(e: Elemento): Punto[] {
  const [lp, pp] = MISURE_PREDEFINITE[e.tipo] ?? [100, 100];
  const hl = (e.larghezza ?? lp) / 2, hp = (e.profondita ?? pp) / 2;
  const a = (e.rotazione * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-hl, -hp], [hl, -hp], [hl, hp], [-hl, hp]].map(([x, y]) => ({ x: e.posizione.x + x * c - y * s, y: e.posizione.y + x * s + y * c }));
}

const dentro = (p: Punto, poly: Punto[]): boolean => {
  let s = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if ((poly[i].y > p.y) !== (poly[j].y > p.y) && p.x < ((poly[j].x - poly[i].x) * (p.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) s = !s;
  }
  return s;
};

const segmentiSiTagliano = (a: Punto, b: Punto, c: Punto, d: Punto): boolean => {
  const o = (p: Punto, q: Punto, r: Punto) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
};

/** Due poligoni convessi si toccano (vertici dentro o lati che si incrociano). */
export function siSovrappongono(p: Punto[], q: Punto[]): boolean {
  if (p.some((x) => dentro(x, q)) || q.some((x) => dentro(x, p))) return true;
  return p.some((a, i) => q.some((c, j) => segmentiSiTagliano(a, p[(i + 1) % p.length], c, q[(j + 1) % q.length])));
}

/** Il vano di una porta o finestra come rettangolo lungo la parete (un po' più largo dello spessore). */
function vano(m: Muro, offset: number, larghezza: number): Punto[] {
  const { dir, normale } = assiDelMuro(m);
  const h = m.spessore / 2 + 5;
  const p = (s: number, n: number) => ({ x: m.p1.x + dir.x * s + normale.x * n, y: m.p1.y + dir.y * s + normale.y * n });
  return [p(offset, -h), p(offset + larghezza, -h), p(offset + larghezza, h), p(offset, h)];
}

const cm = (v: number) => `${v.toLocaleString("it-IT", { maximumFractionDigits: 1 })} cm`;

/** Alzata e pedata di una scala (cm), dalla sua altezza e dal suo sviluppo; null se non si possono stimare. */
export function alzataEPedata(e: Elemento, interpianoCm: number): { alzata: number; pedata: number; larghezzaRampa: number } | null {
  const [lp, pp] = MISURE_PREDEFINITE[e.tipo] ?? [100, 100];
  const l = e.larghezza ?? lp, p = e.profondita ?? pp, h = e.altezza ?? interpianoCm;
  const n = Math.max(1, Math.round(h / 17.5));
  if (e.tipo === "scala") return { alzata: h / n, pedata: p / n, larghezzaRampa: l };
  if (e.tipo === "scala_u") {
    const pian = Math.min(100, p * 0.35), meta = Math.max(1, Math.floor(n / 2));
    return { alzata: h / n, pedata: (p - pian) / meta, larghezzaRampa: (l - 20) / 2 };
  }
  if (e.tipo === "scala_chiocciola") {
    const R = Math.min(l, p) / 2, palo = 10, centro = palo + (R - palo) / 2;
    return { alzata: h / n, pedata: (2 * Math.PI * centro) / n, larghezzaRampa: R - palo };
  }
  return null;
}

/** Controllo di massima sulle proporzioni di un muro di contenimento a mensola: non sostituisce il calcolo di stabilità. */
function verificheMuroContenimento(e: Elemento, v: (esito: Verifica["esito"], codice: Verifica["codice"], oggetto: string, messaggio: string, valore?: string, richiesto?: string) => void) {
  const H = e.altezza ?? 300, B = e.profondita ?? 220;
  const rapporto = B / H;
  const valore = `base ${cm(B)} su ${cm(H)} di altezza (${rapporto.toLocaleString("it-IT", { maximumFractionDigits: 2 })} H)`;
  const nome = e.etichetta?.trim() || "Il muro di contenimento";
  if (rapporto < 0.5) v("non_conforme", "contenimento", nome, "Base troppo stretta rispetto all'altezza: di solito la suola è larga 0,5–0,7 volte l'altezza. Serve il calcolo di un ingegnere.", valore, "0,5–0,7 × H");
  else if (rapporto > 0.9) v("attenzione", "contenimento", nome, "Base molto larga rispetto all'altezza: controlla le misure.", valore, "0,5–0,7 × H");
  else v("ok", "contenimento", nome, "Proporzioni tipiche per un muro a mensola (il calcolo di stabilità resta del progettista).", valore, "0,5–0,7 × H");
  if (H > 400) v("attenzione", "contenimento", nome, "Oltre 4 m di altezza servono contrafforti o un progetto strutturale dedicato.", cm(H), "fino a 4 m a mensola");
}

export function verificheDiProgetto(livello: Livello, stato: StatoPianta, interpianoCm = ALTEZZA_INTERPIANO_CM): Verifica[] {
  const out: Verifica[] = [];
  const v = (esito: Verifica["esito"], codice: Verifica["codice"], oggetto: string, messaggio: string, valore?: string, richiesto?: string) =>
    out.push({ codice, esito, livello: livello.nome, oggetto, messaggio, valore, richiesto });
  for (const e of stato.elementi) if (e.tipo === "muro_contenimento" && e.stato !== "da_demolire") verificheMuroContenimento(e, v);
  const muri = new Map(stato.muri.filter((m) => m.stato !== "da_demolire").map((m) => [m.id, m]));
  const elementi = stato.elementi.filter((e) => INGOMBRANTI.includes(e.tipo) && e.stato !== "da_demolire");
  for (const e of elementi) {
    const box = angoli(e);
    const nome = e.etichetta?.trim() || NOMI[e.tipo];
    for (const a of stato.aperture) {
      if (a.stato === "da_demolire") continue;
      const m = muri.get(a.muroId);
      if (!m) continue;
      if (siSovrappongono(box, vano(m, a.offset, a.larghezza))) {
        const cosa = a.tipo === "porta" ? "la porta" : a.tipo === "varco" ? "il varco" : "la finestra";
        v("non_conforme", "interferenza", nome, `${NOMI[e.tipo]} cade dentro ${cosa}: sposta l'elemento o l'apertura.`);
      }
    }
    if (e.tipo !== "pilastro") {
      // un muro che passa dentro la scala o l'ascensore (non solo sul bordo)
      for (const m of muri.values()) {
        const dentroDi = [m.p1, m.p2].some((p) => dentro(p, box));
        const attraversa = box.some((c, i) => segmentiSiTagliano(m.p1, m.p2, c, box[(i + 1) % 4]));
        if (dentroDi || attraversa) {
          v("attenzione", "interferenza", nome, `${NOMI[e.tipo]} è attraversato da una parete: controlla che sia il suo vano e non un errore di posizione.`);
          break;
        }
      }
    }
    if (SCALE.includes(e.tipo)) {
      const r = alzataEPedata(e, interpianoCm);
      if (!r) continue;
      const regola = 2 * r.alzata + r.pedata;
      const valore = `alzata ${cm(r.alzata)}, pedata ${cm(r.pedata)}`;
      if (r.alzata > 18 || r.pedata < 22 || regola < 58 || regola > 68) {
        v(r.pedata < 22 || r.alzata > 19 ? "non_conforme" : "attenzione", "scala", nome,
          r.pedata < 22 ? "Pedata troppo stretta: la scala è troppo ripida." : r.alzata > 18 ? "Alzata troppo alta." : `Scala scomoda: 2 × alzata + pedata fa ${cm(regola)}.`, valore, "2a + p = 62–64 cm, alzata ≤ 18 cm, pedata ≥ 25 cm");
      } else v("ok", "scala", nome, "Alzata e pedata regolari.", valore, "2a + p = 62–64 cm");
      if (r.larghezzaRampa < 80) v("non_conforme", "scala", nome, "Rampa più stretta di 80 cm.", cm(r.larghezzaRampa), "almeno 80 cm (120 cm nelle scale comuni)");
    }
  }
  return out;
}
