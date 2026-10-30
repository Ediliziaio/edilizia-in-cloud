import { TIPI_DOCUMENTO } from "./fatturaRicevutaHtml";

/**
 * Il riepilogo leggibile di una fattura ricevuta, dai dati che il database ha già
 * (righe, riepilogo IVA, totali), senza bisogno dell'XML.
 *
 * Il 30/10/2026 su 14.320 fatture ricevute solo 326 avevano l'XML: alle altre
 * (sincronizzate da Fatture in Cloud, importate) «Vedi la fattura» rispondeva «non
 * disponibile» e restava l'anteprima dell'XML grezzo. Le righe però c'erano per
 * 11.548 di loro. Le scrivono due importatori con forme diverse:
 *  - XML (openapi, ricevi-sdi): `{ numero_linea, descrizione, quantita,
 *    prezzo_unitario, imponibile, aliquota_iva: "22.00", natura_iva }`, più
 *    `riepilogo_iva: [{ aliquota: "22.00", natura, imponibile, imposta }]`;
 *  - Fatture in Cloud: `{ descrizione, quantita, prezzo_unitario, aliquota_iva: 22,
 *    imponibile, imposta, totale }` e nessun riepilogo IVA, che qui si ricava.
 */

export interface RigaLeggibile {
  descrizione: string;
  quantita: number | null;
  prezzoUnitario: number | null;
  imponibile: number;
  aliquota: number | null;
  natura: string | null;
}

export interface AliquotaLeggibile {
  aliquota: number | null;
  natura: string | null;
  imponibile: number;
  imposta: number;
}

/** Le nature IVA più frequenti, per dire «Reverse charge» invece di «N6.3». */
const NATURE: Record<string, string> = {
  N1: "Escluse art. 15", N2: "Non soggette", N2_1: "Non soggette (art. 7)", N2_2: "Non soggette",
  N3: "Non imponibili", N3_1: "Non imponibili (esportazioni)", N3_2: "Non imponibili (cessioni intra UE)",
  N3_3: "Non imponibili (San Marino)", N3_4: "Non imponibili (operazioni assimilate)", N3_5: "Non imponibili (dichiarazione d'intento)",
  N3_6: "Non imponibili (altre)", N4: "Esenti", N5: "Regime del margine",
  N6: "Reverse charge", N6_1: "Reverse charge (rottami)", N6_2: "Reverse charge (oro)", N6_3: "Reverse charge (subappalto edile)",
  N6_4: "Reverse charge (fabbricati)", N6_5: "Reverse charge (telefoni)", N6_6: "Reverse charge (elettronica)",
  N6_7: "Reverse charge (edilizia e settori connessi)", N6_8: "Reverse charge (energia)", N6_9: "Reverse charge (altri casi)",
  N7: "IVA assolta in altro Stato UE",
};

const numero = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const testo = (v: unknown): string => (v == null ? "" : String(v)).trim();
const tondo = (n: number): number => Math.round(n * 100) / 100;

export function nomeTipoDocumento(codice: string | null | undefined): string {
  const c = testo(codice).toUpperCase();
  return TIPI_DOCUMENTO[c] ?? (c || "Documento");
}

export function nomeNatura(codice: string | null | undefined): string | null {
  const c = testo(codice).toUpperCase().replace(".", "_");
  if (!c) return null;
  return NATURE[c] ?? NATURE[c.split("_")[0]] ?? c;
}

/** Le righe come si leggono su una fattura; quelle vuote (senza testo né importo) si tolgono. */
export function righeLeggibili(righe: unknown): RigaLeggibile[] {
  if (!Array.isArray(righe)) return [];
  return righe
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => {
      const quantita = numero(r.quantita);
      const prezzoUnitario = numero(r.prezzo_unitario);
      const imponibile = numero(r.imponibile) ?? (quantita != null && prezzoUnitario != null ? tondo(quantita * prezzoUnitario) : 0);
      return {
        descrizione: testo(r.descrizione),
        quantita,
        prezzoUnitario,
        imponibile,
        aliquota: numero(r.aliquota_iva),
        natura: testo(r.natura_iva) || null,
      };
    })
    .filter((r) => r.descrizione !== "" || r.imponibile !== 0);
}

/**
 * Il riepilogo IVA per aliquota: quello dell'XML se c'è, altrimenti ricavato dalle
 * righe (imposta = imponibile × aliquota, arrotondata per aliquota come fa lo SDI).
 */
export function riepilogoIvaLeggibile(riepilogo: unknown, righe: RigaLeggibile[]): AliquotaLeggibile[] {
  if (Array.isArray(riepilogo) && riepilogo.length > 0) {
    return riepilogo
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => ({
        aliquota: numero(r.aliquota),
        natura: testo(r.natura) || null,
        imponibile: numero(r.imponibile) ?? 0,
        imposta: numero(r.imposta) ?? 0,
      }));
  }
  const gruppi = new Map<string, AliquotaLeggibile>();
  for (const r of righe) {
    const chiave = `${r.aliquota ?? ""}|${r.natura ?? ""}`;
    const g = gruppi.get(chiave) ?? { aliquota: r.aliquota, natura: r.natura, imponibile: 0, imposta: 0 };
    g.imponibile = tondo(g.imponibile + r.imponibile);
    gruppi.set(chiave, g);
  }
  return [...gruppi.values()].map((g) => ({ ...g, imposta: tondo((g.imponibile * (g.aliquota ?? 0)) / 100) }));
}

/** «IVA 22%», «Reverse charge (subappalto edile)», «IVA 0% · Esenti». */
export function etichettaAliquota(a: Pick<AliquotaLeggibile, "aliquota" | "natura">): string {
  const natura = nomeNatura(a.natura);
  if (a.aliquota && a.aliquota > 0) return `IVA ${String(a.aliquota).replace(".", ",")}%`;
  return natura ?? "IVA 0%";
}
