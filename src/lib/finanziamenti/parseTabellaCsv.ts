/**
 * Parser CSV per tabelle finanziamento.
 *
 * Formato atteso (header riga 1, separatore "," o ";"):
 *   subtariffa, importo_erogato, spese_istruttoria, numero_rate, durata_mesi,
 *   prima_rata_giorni, importo_rata, spese_incasso_rata, interessi_cliente,
 *   importo_totale_dovuto, tan, taeg, icc, provvigione_dealer
 *
 * Numeri italiani: "3.000,00" o "3000.00" entrambi accettati.
 * Le percentuali "8,96 %" / "8.96%" / "8.96" sono normalizzate a number.
 */

import Papa from "papaparse";
import type { ErroreImportRiga, RisultatoImportCsv } from "./types";

const COLONNE_RICHIESTE = [
  "importo_erogato",
  "numero_rate",
  "importo_rata",
  "interessi_cliente",
  "importo_totale_dovuto",
  "tan",
  "taeg",
] as const;

/** Mapping dei nomi colonna alternativi → nome canonico. */
const ALIAS_COLONNE: Record<string, string> = {
  // Importo erogato
  "importo erogato": "importo_erogato",
  "importo erogato/da versare": "importo_erogato",
  "importo erogato da versare": "importo_erogato",
  "capitale": "importo_erogato",
  "capitale erogato": "importo_erogato",
  // Spese
  "spese istruttoria": "spese_istruttoria",
  "spese istr": "spese_istruttoria",
  "spese istr.": "spese_istruttoria",
  "istruttoria": "spese_istruttoria",
  // Importo totale credito
  "importo totale del credito": "importo_totale_credito",
  "importo totale credito": "importo_totale_credito",
  "totale credito": "importo_totale_credito",
  // Numero rate
  "n° rate": "numero_rate",
  "n rate": "numero_rate",
  "numero rate": "numero_rate",
  "rate": "numero_rate",
  "n_rate": "numero_rate",
  // Durata
  "durata contratto in mesi": "durata_mesi",
  "durata mesi": "durata_mesi",
  "durata": "durata_mesi",
  "durata_contratto_mesi": "durata_mesi",
  // Prima rata
  "prima rata a gg.": "prima_rata_giorni",
  "prima rata gg": "prima_rata_giorni",
  "prima rata giorni": "prima_rata_giorni",
  "prima_rata_a_gg": "prima_rata_giorni",
  // Importo rata
  "importo rata": "importo_rata",
  "rata": "importo_rata",
  "rata mensile": "importo_rata",
  // Spese incasso rata
  "spese incasso rata": "spese_incasso_rata",
  "spese incasso": "spese_incasso_rata",
  "incasso rata": "spese_incasso_rata",
  // Interessi
  "interessi cliente": "interessi_cliente",
  "interessi": "interessi_cliente",
  "totale interessi": "interessi_cliente",
  // Totale dovuto
  "importo totale dovuto dal consumatore": "importo_totale_dovuto",
  "importo totale dovuto": "importo_totale_dovuto",
  "totale dovuto": "importo_totale_dovuto",
  "totale da restituire": "importo_totale_dovuto",
  // Tassi
  "t.a.n.": "tan",
  "t.a.n": "tan",
  "tan%": "tan",
  "t.a.e.g.": "taeg",
  "t.a.e.g": "taeg",
  "taeg%": "taeg",
  "i.c.c.": "icc",
  "i.c.c": "icc",
  // Provvigione
  "provvigioni dealer": "provvigione_dealer",
  "provvigione": "provvigione_dealer",
  "provvigione dealer": "provvigione_dealer",
  "provv. dealer": "provvigione_dealer",
};

/**
 * Normalizza l'header di colonna: lowercase, trim, rimuove caratteri speciali,
 * collassa spazi multipli. Poi prova alias esatto, altrimenti torna `slug`.
 */
function normalizzaHeader(raw: string): string {
  const lower = (raw ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[°]/g, "") // simbolo gradi °
    .replace(/[–—]/g, "-") // dash unicode
    .replace(/\s+/g, " ");
  if (ALIAS_COLONNE[lower]) return ALIAS_COLONNE[lower];
  // slug: spazi → underscore, rimuove punti/parentesi
  const slug = lower
    .replace(/[.()[\]/]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (ALIAS_COLONNE[slug]) return ALIAS_COLONNE[slug];
  return slug;
}

/** Converte stringa numerica in numero gestendo formati italiani e percentuali. */
function parseNumero(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (s === "" || s === "-" || s.toLowerCase() === "n/a") return null;
  // Rimuovi simboli valuta/percentuale e spazi non-breaking
  s = s.replace(/[€$£%]/g, "").replace(/\u00a0/g, " ").trim();
  // Caso italiano: "3.000,00" → "3000.00". Se ha sia "." che ",", "." è migliaia.
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma && !hasDot) {
    s = s.replace(",", ".");
  }
  // Rimuovi spazi (separatori di migliaia in alcuni locale)
  s = s.replace(/\s/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

interface OpzioniParse {
  /** Subtariffa di default se non presente in riga. */
  subtariffa_default?: string | null;
}

export function parseTabellaCsv(
  testoCsv: string,
  opzioni: OpzioniParse = {}
): RisultatoImportCsv {
  const errori: ErroreImportRiga[] = [];

  // Auto-detect separatore: papaparse lo fa, ma forziamo se necessario
  const result = Papa.parse<Record<string, string>>(testoCsv, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: normalizzaHeader,
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  if (result.errors && result.errors.length > 0) {
    for (const e of result.errors) {
      errori.push({
        riga: typeof e.row === "number" ? e.row + 2 : 0,
        messaggio: `Errore parser CSV: ${e.message}`,
      });
    }
  }

  const headers = result.meta.fields ?? [];
  // Verifica colonne obbligatorie
  for (const col of COLONNE_RICHIESTE) {
    if (!headers.includes(col)) {
      errori.push({
        riga: 1,
        colonna: col,
        messaggio: `Colonna obbligatoria mancante: "${col}". Header trovati: ${headers.join(", ")}`,
      });
    }
  }
  if (errori.length > 0 && headers.length === 0) {
    return { righe_valide: [], errori };
  }

  const righe_valide: RisultatoImportCsv["righe_valide"] = [];

  result.data.forEach((row, idx) => {
    const numeroRiga = idx + 2; // header riga 1 → dati partono da riga 2
    const errPerRiga: ErroreImportRiga[] = [];

    const importo_erogato = parseNumero(row.importo_erogato);
    const numero_rate = parseNumero(row.numero_rate);
    const importo_rata = parseNumero(row.importo_rata);
    const interessi_cliente = parseNumero(row.interessi_cliente);
    const importo_totale_dovuto = parseNumero(row.importo_totale_dovuto);
    const tan = parseNumero(row.tan);
    const taeg = parseNumero(row.taeg);

    if (importo_erogato == null || importo_erogato <= 0)
      errPerRiga.push({
        riga: numeroRiga,
        colonna: "importo_erogato",
        messaggio: "importo_erogato non valido",
      });
    if (numero_rate == null || numero_rate <= 0)
      errPerRiga.push({
        riga: numeroRiga,
        colonna: "numero_rate",
        messaggio: "numero_rate non valido",
      });
    if (importo_rata == null || importo_rata <= 0)
      errPerRiga.push({
        riga: numeroRiga,
        colonna: "importo_rata",
        messaggio: "importo_rata non valido",
      });
    if (tan == null)
      errPerRiga.push({
        riga: numeroRiga,
        colonna: "tan",
        messaggio: "tan non valido",
      });
    if (taeg == null)
      errPerRiga.push({
        riga: numeroRiga,
        colonna: "taeg",
        messaggio: "taeg non valido",
      });

    if (errPerRiga.length > 0) {
      errori.push(...errPerRiga);
      return;
    }

    const spese_istruttoria = parseNumero(row.spese_istruttoria) ?? 0;
    const importo_totale_credito =
      parseNumero(row.importo_totale_credito) ??
      importo_erogato! + spese_istruttoria;
    const durata_mesi = parseNumero(row.durata_mesi) ?? numero_rate!;
    const prima_rata_giorni = parseNumero(row.prima_rata_giorni) ?? 30;
    const spese_incasso_rata = parseNumero(row.spese_incasso_rata) ?? 0;
    const icc_n = parseNumero(row.icc);
    const provvigione_dealer = parseNumero(row.provvigione_dealer) ?? 0;

    righe_valide.push({
      subtariffa: (row.subtariffa ?? "").trim() || opzioni.subtariffa_default || null,
      importo_erogato: importo_erogato!,
      spese_istruttoria,
      importo_totale_credito,
      numero_rate: Math.round(numero_rate!),
      durata_mesi: Math.round(durata_mesi),
      prima_rata_giorni: Math.round(prima_rata_giorni),
      importo_rata: importo_rata!,
      spese_incasso_rata,
      interessi_cliente: interessi_cliente!,
      importo_totale_dovuto: importo_totale_dovuto!,
      tan: tan!,
      taeg: taeg!,
      icc: icc_n,
      provvigione_dealer,
    });
  });

  // Cerca duplicati (importo + numero_rate)
  const visti = new Map<string, number>();
  righe_valide.forEach((r, i) => {
    const key = `${r.importo_erogato}|${r.numero_rate}`;
    if (visti.has(key)) {
      errori.push({
        riga: i + 2,
        messaggio: `Riga duplicata: importo ${r.importo_erogato} con ${r.numero_rate} rate è già presente alla riga ${visti.get(key)}`,
      });
    } else {
      visti.set(key, i + 2);
    }
  });

  return { righe_valide, errori };
}

/**
 * Genera un CSV template scaricabile con header e una riga d'esempio.
 */
export function generaCsvTemplate(): string {
  const header = [
    "subtariffa",
    "importo_erogato",
    "spese_istruttoria",
    "importo_totale_credito",
    "numero_rate",
    "durata_mesi",
    "prima_rata_giorni",
    "importo_rata",
    "spese_incasso_rata",
    "interessi_cliente",
    "importo_totale_dovuto",
    "tan",
    "taeg",
    "icc",
    "provvigione_dealer",
  ].join(",");
  const esempio1 = [
    "GT57T", "10000.00", "0.00", "10000.00",
    "60", "60", "30", "207.00", "3.00", "2420.00", "12632.00",
    "8.88", "10.06", "16.25", "200.00",
  ].join(",");
  const esempio2 = [
    "GT57T", "10000.00", "0.00", "10000.00",
    "84", "84", "30", "160.00", "3.00", "3440.00", "13730.40",
    "8.83", "9.94", "16.27", "200.00",
  ].join(",");
  return [header, esempio1, esempio2].join("\n");
}
