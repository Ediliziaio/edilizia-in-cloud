/**
 * Il motore DXF di cadcraft, compilato in WebAssembly (fase 0,
 * `tools/planimetrie-wasm`, esito in docs/planimetrie/fase0-esito.md).
 *
 * Scrive DXF R2000 (AC1015) con $INSUNITS, polilinee leggere e retini pieni
 * veri (HATCH): è il formato che AutoCAD si aspetta oggi. Le entità le prepara
 * la nostra scena come per il motore TypeScript; il wasm le scrive con
 * `scrivi_entita`.
 *
 * Il .wasm non è nel repository: lo compila `tools/planimetrie-wasm/build.sh`
 * in `dev/planimetria-motore/wasm/`, e il server di sviluppo lo serve da lì. In
 * produzione non c'è ancora (va deciso se compilarlo in CI o versionarlo in
 * `public/`): `caricaMotoreCadcraft` allora risponde null e si usa il motore
 * TypeScript, che non ha bisogno di nulla.
 */
import type { DefinizioneLayer, MotoreDxf, OpzioniTestoDxf, PuntoDxf } from "./motore";
import { codificaCp1252 } from "./r12";

export const URL_MOTORE_CADCRAFT = "/dev/planimetria-motore/wasm/planimetrie_wasm.js";

interface ModuloCadcraft {
  default: (ingresso?: unknown) => Promise<unknown>;
  scrivi_entita?: (json: string) => string;
}

type Xy = [number, number];
type EntitaCadcraft =
  | { tipo: "linea"; layer: string; a: Xy; b: Xy }
  | { tipo: "polilinea"; layer: string; punti: Xy[]; chiusa: boolean }
  | { tipo: "arco"; layer: string; centro: Xy; raggio: number; inizio: number; fine: number }
  | { tipo: "cerchio"; layer: string; centro: Xy; raggio: number }
  | { tipo: "testo"; layer: string; p: Xy; testo: string; altezza: number; rotazione: number; orizzontale: string; verticale: string }
  | { tipo: "pieno"; layer: string; punti: Xy[] };

const xy = (p: PuntoDxf): Xy => [Math.round(p.x * 10_000) / 10_000, Math.round(p.y * 10_000) / 10_000];

/** Codici $INSUNITS. */
export const INSUNITS = { mm: 4, cm: 5, m: 6 } as const;

export class MotoreDxfCadcraft implements MotoreDxf {
  readonly nome = "cadcraft-wasm";
  private layers = new Map<string, DefinizioneLayer>();
  private entita: EntitaCadcraft[] = [];
  private conti: Record<string, number> = {};

  constructor(private scrivi: (json: string) => string, private unita: number = INSUNITS.cm) {}

  private conta(layer: string) {
    if (!this.layers.has(layer)) this.layers.set(layer, { nome: layer, colore: 7 });
    this.conti[layer] = (this.conti[layer] ?? 0) + 1;
    return layer;
  }

  layer(def: DefinizioneLayer): void {
    this.layers.set(def.nome, def);
  }
  linea(layer: string, a: PuntoDxf, b: PuntoDxf): void {
    this.entita.push({ tipo: "linea", layer: this.conta(layer), a: xy(a), b: xy(b) });
  }
  polilinea(layer: string, punti: PuntoDxf[], chiusa: boolean): void {
    if (punti.length < 2) return;
    this.entita.push({ tipo: "polilinea", layer: this.conta(layer), punti: punti.map(xy), chiusa });
  }
  arco(layer: string, centro: PuntoDxf, raggio: number, inizioGradi: number, fineGradi: number): void {
    this.entita.push({ tipo: "arco", layer: this.conta(layer), centro: xy(centro), raggio, inizio: inizioGradi, fine: fineGradi });
  }
  cerchio(layer: string, centro: PuntoDxf, raggio: number): void {
    this.entita.push({ tipo: "cerchio", layer: this.conta(layer), centro: xy(centro), raggio });
  }
  testo(layer: string, posizione: PuntoDxf, testo: string, altezza: number, o: OpzioniTestoDxf = {}): void {
    this.entita.push({
      tipo: "testo", layer: this.conta(layer), p: xy(posizione), testo: testo.replace(/[\r\n]+/g, " "), altezza,
      rotazione: o.rotazione ?? 0, orizzontale: o.orizzontale ?? "sinistra", verticale: o.verticale ?? "basso",
    });
  }
  pieno(layer: string, punti: PuntoDxf[]): void {
    if (punti.length < 3) return;
    this.entita.push({ tipo: "pieno", layer: this.conta(layer), punti: punti.map(xy) });
  }
  conteggio(): Record<string, number> {
    return { ...this.conti };
  }
  chiudi(): Uint8Array {
    const testo = this.scrivi(JSON.stringify({ unita: this.unita, layer: [...this.layers.values()].map((l) => ({ nome: l.nome, colore: l.colore })), entita: this.entita }));
    // cadcraft scrive ogni carattere non ASCII come \U+XXXX: AutoCAD lo capisce, LibreCAD e
    // ezdxf no («m\U+00B2»). Il file dichiara Windows-1252, quindi quei caratteri vanno come
    // byte veri; solo ciò che in Windows-1252 non c'è resta \U+XXXX.
    const decodificato = testo.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)));
    return codificaCp1252(decodificato);
  }
}

let inCorso: Promise<ModuloCadcraft | null> | null = null;

export interface OpzioniCaricamento {
  /** Dove sta il JS generato da wasm-bindgen. */
  url?: string;
  /** Il .wasm già letto (in node, per gli script): altrimenti lo scarica il modulo. */
  wasm?: BufferSource;
  /** Il modulo già importato (in node): salta l'import per URL. */
  modulo?: ModuloCadcraft;
}

/**
 * Carica il motore la prima volta che serve. Risponde con la fabbrica dei
 * motori, o null se il wasm non c'è (produzione, o non compilato).
 */
export async function caricaMotoreCadcraft(o: OpzioniCaricamento = {}): Promise<((unita: keyof typeof INSUNITS) => MotoreDxf) | null> {
  if (!inCorso || o.modulo || o.wasm) {
    inCorso = (async () => {
      try {
        const m: ModuloCadcraft = o.modulo ?? (await import(/* @vite-ignore */ o.url ?? URL_MOTORE_CADCRAFT));
        await m.default(o.wasm ? { module_or_path: o.wasm } : undefined);
        return typeof m.scrivi_entita === "function" ? m : null;
      } catch {
        return null;
      }
    })();
  }
  const m = await inCorso;
  if (!m?.scrivi_entita) return null;
  const scrivi = m.scrivi_entita.bind(m);
  return (unita) => new MotoreDxfCadcraft(scrivi, INSUNITS[unita]);
}
