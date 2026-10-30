/**
 * Confronta due cartelle di JSON: ciò che era scritto nei documenti (`atteso`)
 * e ciò che l'AI ha letto (`letto`), un file per documento, stesso nome.
 * La parte che calcola sta in supabase/functions/_shared/valutaLettura.ts; qui
 * c'è solo la lettura delle cartelle e il raggruppamento per tipo di documento.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  riepilogaSerie,
  valutaLettura,
  type Riepilogo,
  type Valutazione,
} from "../../supabase/functions/_shared/valutaLettura.ts";

export interface CasoValutato {
  nome: string;
  tipo: string;
  valutazione: Valutazione;
  /** Non c'era nessun file letto per questo documento: conta come tutto mancante. */
  nonLetto: boolean;
}

export interface Rapporto {
  casi: CasoValutato[];
  totale: Riepilogo;
  perTipo: Record<string, Riepilogo>;
  nonLetti: string[];
  /** File letti senza un file atteso corrispondente: ignorati. */
  senzaAtteso: string[];
}

/**
 * Dove stanno i campi letti, nei formati che si trovano in giro: la risposta delle
 * funzioni (`extracted`, `ddt`), la riga di document_analysis_results
 * (`structured_fields`), o il file atteso scritto a mano (`campi`).
 */
const CHIAVI_CAMPI = ["campi", "structured_fields", "extracted", "ddt"] as const;

export function estraiCampi(json: unknown): unknown {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const chiave of CHIAVI_CAMPI) {
      const v = (json as Record<string, unknown>)[chiave];
      if (v && typeof v === "object") return v;
    }
  }
  return json;
}

const nomiJson = (cartella: string): string[] =>
  readdirSync(cartella).filter((f) => f.endsWith(".json")).sort();

function leggiJson(percorso: string): unknown {
  try {
    return JSON.parse(readFileSync(percorso, "utf8"));
  } catch (e) {
    throw new Error(`File non leggibile come JSON: ${percorso} (${e instanceof Error ? e.message : String(e)})`, { cause: e });
  }
}

export function confrontaCartelle(cartellaAtteso: string, cartellaLetto: string): Rapporto {
  if (!existsSync(cartellaAtteso)) throw new Error(`Cartella «atteso» non trovata: ${cartellaAtteso}`);
  if (!existsSync(cartellaLetto)) throw new Error(`Cartella «letto» non trovata: ${cartellaLetto}`);

  const attesi = nomiJson(cartellaAtteso);
  const letti = nomiJson(cartellaLetto);
  const casi: CasoValutato[] = [];
  const nonLetti: string[] = [];

  for (const file of attesi) {
    const atteso = leggiJson(join(cartellaAtteso, file));
    const tipo =
      atteso && typeof atteso === "object" && typeof (atteso as { tipo?: unknown }).tipo === "string"
        ? (atteso as { tipo: string }).tipo
        : "senza_tipo";
    const nome = file.replace(/\.json$/, "");
    const haLetto = letti.includes(file);
    if (!haLetto) nonLetti.push(nome);
    const letto = haLetto ? estraiCampi(leggiJson(join(cartellaLetto, file))) : {};
    casi.push({ nome, tipo, valutazione: valutaLettura(estraiCampi(atteso), letto), nonLetto: !haLetto });
  }

  const perTipo: Record<string, Riepilogo> = {};
  for (const tipo of [...new Set(casi.map((c) => c.tipo))].sort()) {
    perTipo[tipo] = riepilogaSerie(casi.filter((c) => c.tipo === tipo).map((c) => c.valutazione));
  }

  return {
    casi,
    totale: riepilogaSerie(casi.map((c) => c.valutazione)),
    perTipo,
    nonLetti,
    senzaAtteso: letti.filter((f) => !attesi.includes(f)).map((f) => f.replace(/\.json$/, "")),
  };
}
