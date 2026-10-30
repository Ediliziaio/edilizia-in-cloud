/**
 * La pianta in DXF, per il tecnico: un layer per muri, demolizioni, nuovo,
 * aperture, quote, scritte, arredi e contorni dei locali. Le misure sono vere
 * (1 unità = 1 cm di serie), le scritte sono alte quanto servono per stampare
 * alla scala di riferimento.
 *
 * Il file lo scrive un `MotoreDxf`: di serie quello in TypeScript, ma se ne può
 * passare un altro (per esempio quello di cadcraft in WASM) senza cambiare nulla qui.
 */
import { caricaMotoreCadcraft, type OpzioniCaricamento } from "./dxf/cadcraft";
import { MotoreDxfR12 } from "./dxf/r12";
import type { DefinizioneLayer, MotoreDxf, PuntoDxf } from "./dxf/motore";
import { costruisciScena, ORDINE_LAYER, type NomeLayer, type OpzioniScena } from "./scena";
import type { Punto, VistaPianta } from "./tipi";

export type UnitaDxf = "cm" | "m" | "mm";

export interface OpzioniDxf extends OpzioniScena {
  unita?: UnitaDxf;
  /** Il motore che scrive il file; di serie quello in TypeScript (vedi `esportaDxfMigliore`). */
  motore?: (unita: UnitaDxf) => MotoreDxf;
  /** Le doghe e le fughe dei pavimenti (solo con lo stile «presentazione»). */
  pavimenti?: boolean;
}

export interface RisultatoDxf {
  dati: Uint8Array;
  /** Entità scritte per layer. */
  conteggio: Record<string, number>;
  motore: string;
  unita: UnitaDxf;
}

export const LAYER_DXF: Record<NomeLayer, DefinizioneLayer> = {
  MURI: { nome: "MURI", colore: 7 },
  DEMOLIZIONI: { nome: "DEMOLIZIONI", colore: 2 },
  NUOVO: { nome: "NUOVO", colore: 1 },
  APERTURE: { nome: "APERTURE", colore: 4 },
  LOCALI: { nome: "LOCALI", colore: 9 },
  PAVIMENTI: { nome: "PAVIMENTI", colore: 9 },
  ARREDI: { nome: "ARREDI", colore: 8 },
  QUOTE: { nome: "QUOTE", colore: 3 },
  TESTI: { nome: "TESTI", colore: 7 },
};

const FATTORE: Record<UnitaDxf, number> = { cm: 1, m: 0.01, mm: 10 };
const NOME_UNITA: Record<UnitaDxf, string> = { cm: "centimetri", m: "metri", mm: "millimetri" };

/** I layer dei pieni: lì i poligoni chiusi diventano anche campiture. */
const LAYER_CAMPITI = new Set<NomeLayer>(["MURI", "DEMOLIZIONI", "NUOVO"]);

export function esportaDxf(vista: VistaPianta, opzioni: OpzioniDxf = {}): RisultatoDxf {
  const unita = opzioni.unita ?? "cm";
  const k = FATTORE[unita];
  const scala = opzioni.scala ?? 50;
  const scena = costruisciScena(vista, { ...opzioni, scala });
  const motore = (opzioni.motore ?? (() => new MotoreDxfR12()))(unita);
  // y verso l'alto nel DXF: la pianta si vede com'è sullo schermo.
  const P = (p: Punto): PuntoDxf => ({ x: p.x * k, y: -p.y * k });
  const altezza = (mm: number) => ((mm * scala) / 10) * k;

  const usati = new Set(scena.primitive.map((p) => p.layer));
  usati.add("TESTI");
  for (const nome of ORDINE_LAYER) if (usati.has(nome)) motore.layer(LAYER_DXF[nome]);

  for (const p of scena.primitive) {
    if (p.layer === "PAVIMENTI" && !opzioni.pavimenti) continue;
    switch (p.tipo) {
      case "poligono": {
        const punti = p.punti.map(P);
        if (p.chiuso && p.riempimento && LAYER_CAMPITI.has(p.layer) && punti.length <= 4) motore.pieno(p.layer, punti);
        if (!p.chiuso && punti.length === 2) motore.linea(p.layer, punti[0], punti[1]);
        else if (p.tratto || !p.riempimento) motore.polilinea(p.layer, punti, p.chiuso);
        break;
      }
      case "arco": {
        // Sullo schermo l'arco va in senso orario da `inizio` a `fine`; girata la y
        // diventa antiorario da -fine a -inizio, come lo vuole il DXF.
        const gradi = (r: number) => (((-r * 180) / Math.PI) % 360 + 360) % 360;
        motore.arco(p.layer, P(p.centro), p.raggio * k, gradi(p.fine), gradi(p.inizio));
        break;
      }
      case "cerchio":
        motore.cerchio(p.layer, P(p.centro), p.raggio * k);
        break;
      case "testo":
        motore.testo(p.layer, P(p.posizione), p.testo, altezza(p.altezzaMm), {
          rotazione: -p.rotazione, orizzontale: p.allinea, verticale: p.verticale,
        });
        break;
    }
  }

  // Una riga sotto il disegno: cosa è e in che unità, perché il DXF non lo dice da solo.
  const r = scena.riquadro;
  const nota = `${vista.titolo}${vista.livello ? ` - ${vista.livello}` : ""} - unità: ${NOME_UNITA[unita]}, scritte per la scala 1:${scala}`;
  motore.testo("TESTI", P({ x: r.minX, y: r.maxY + (12 * scala) / 10 }), nota, altezza(2.5), { orizzontale: "sinistra" });

  return { dati: motore.chiudi(), conteggio: motore.conteggio(), motore: motore.nome, unita };
}

/**
 * Il DXF col motore migliore che c'è: cadcraft (R2000, retini veri) se il wasm
 * si carica, altrimenti quello in TypeScript (R12). Il risultato dice quale.
 */
export async function esportaDxfMigliore(
  vista: VistaPianta,
  opzioni: Omit<OpzioniDxf, "motore"> = {},
  caricamento: OpzioniCaricamento = {},
): Promise<RisultatoDxf> {
  const cadcraft = await caricaMotoreCadcraft(caricamento);
  return esportaDxf(vista, { ...opzioni, motore: cadcraft ?? undefined });
}
