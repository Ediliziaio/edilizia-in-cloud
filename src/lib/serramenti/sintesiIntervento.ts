/**
 * Generazione automatica del testo "Sintesi dell'intervento" del preventivo
 * serramenti, basata sul BOM (serramenti + accessori).
 *
 * Esempio output:
 *   "Sostituzione di 4 finestre, 2 porte-finestre, più 6 tapparelle, 6 cassonetti e 6 zanzariere."
 *
 * Logica:
 *  - Raggruppa serramenti per "famiglia tipologica" (es. finestra_*, portafinestra_*,
 *    scorrevole, alzante, fisso, lucernario…) per non avere "4 finestre a 1 anta +
 *    2 finestre a 2 ante" ma un più naturale "6 finestre".
 *  - Singolare/plurale automatico (1 finestra vs 2 finestre).
 *  - Accessori raggruppati per tipo (tapparelle, cassonetti…) col loro plurale.
 *  - Connettore "più" tra serramenti e accessori se entrambi presenti.
 *  - Connettore "e" prima dell'ultimo elemento.
 *
 * Pura, no side-effect, no DB: si usa sia dal client (form preview) sia dall'edge
 * function PDF (ri-genera al volo per non dipendere da uno snapshot stale).
 */
import { SR_ACCESSORI_TIPI } from "@/types/serramenti";

type Serramento = {
  tipologia: string;
  tipologia_label?: string | null;
  quantita?: number | null;
};

type Accessorio = {
  tipo: string;
  quantita?: number | null;
};

/** Mappa tipologia DB → categoria narrativa singolare/plurale. */
const TIPOLOGIA_GROUPS: Record<string, { singular: string; plural: string }> = {
  finestra_1anta:      { singular: "finestra",        plural: "finestre" },
  finestra_2ante:      { singular: "finestra",        plural: "finestre" },
  finestra_3ante:      { singular: "finestra",        plural: "finestre" },
  finestra_4ante:      { singular: "finestra",        plural: "finestre" },
  portafinestra_1anta: { singular: "porta-finestra",  plural: "porte-finestre" },
  portafinestra_2ante: { singular: "porta-finestra",  plural: "porte-finestre" },
  portafinestra_3ante: { singular: "porta-finestra",  plural: "porte-finestre" },
  alzante_scorrevole:  { singular: "alzante-scorrevole", plural: "alzanti-scorrevoli" },
  scorrevole:          { singular: "scorrevole",      plural: "scorrevoli" },
  a_libro:             { singular: "pieghevole",      plural: "pieghevoli" },
  bow_window:          { singular: "bow-window",      plural: "bow-window" },
  fisso:               { singular: "vetrata fissa",   plural: "vetrate fisse" },
  lucernario:          { singular: "lucernario",      plural: "lucernari" },
  tonda_ovale:         { singular: "finestra tonda",  plural: "finestre tonde" },
};

/** Mappa tipo accessorio → singolare/plurale italiano corretto. */
const ACCESSORIO_GROUPS: Record<string, { singular: string; plural: string }> = {
  avvolgibile:  { singular: "avvolgibile",   plural: "avvolgibili" },
  tapparella:   { singular: "tapparella",    plural: "tapparelle" },
  cassonetto:   { singular: "cassonetto",    plural: "cassonetti" },
  zanzariera:   { singular: "zanzariera",    plural: "zanzariere" },
  persiana:     { singular: "persiana",      plural: "persiane" },
  scuro:        { singular: "scuro",         plural: "scuri" },
  inferriata:   { singular: "inferriata",    plural: "inferriate" },
  davanzale:    { singular: "davanzale",     plural: "davanzali" },
  controtelaio: { singular: "controtelaio",  plural: "controtelai" },
};

/** Concatenazione "naturale" italiana: ["a", "b", "c"] → "a, b e c". */
function joinItalian(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function describeGroup(qty: number, sing: string, plural: string): string {
  if (qty <= 0) return "";
  if (qty === 1) return `1 ${sing}`;
  return `${qty} ${plural}`;
}

/**
 * Genera la sintesi dell'intervento.
 *
 * @param serramenti Array di serramenti del progetto (almeno tipologia + quantita).
 * @param accessori  Array di accessori del progetto (almeno tipo + quantita).
 * @returns Stringa narrativa pronta per il PDF. Se BOM vuoto, ritorna stringa vuota.
 */
export function generateInterventoSintesi(
  serramenti: Serramento[],
  accessori: Accessorio[],
): string {
  // ── 1. Raggruppa serramenti per categoria narrativa ───────────────────────
  const serramentiCounts = new Map<string, number>();
  for (const s of serramenti) {
    const group = TIPOLOGIA_GROUPS[s.tipologia];
    const key = group ? `${group.singular}|${group.plural}` : (s.tipologia_label || "serramento");
    const qty = s.quantita ?? 1;
    serramentiCounts.set(key, (serramentiCounts.get(key) ?? 0) + qty);
  }

  // Ordinamento: rispetta l'ordine logico (finestre → portefinestre → altro)
  const serramentoOrder = ["finestra", "porta-finestra", "alzante-scorrevole", "scorrevole",
    "pieghevole", "bow-window", "vetrata fissa", "lucernario", "finestra tonda"];
  const serramentoPieces: string[] = [];
  for (const orderKey of serramentoOrder) {
    for (const [k, v] of serramentiCounts) {
      const [sing, plural] = k.split("|");
      if (sing === orderKey) {
        serramentoPieces.push(describeGroup(v, sing, plural ?? sing));
      }
    }
  }
  // Fallback: tipologie non mappate
  for (const [k, v] of serramentiCounts) {
    const [sing, plural] = k.split("|");
    if (!serramentoOrder.includes(sing) && v > 0) {
      serramentoPieces.push(describeGroup(v, sing, plural ?? sing));
    }
  }

  // ── 2. Raggruppa accessori per tipo ───────────────────────────────────────
  const accessoriCounts = new Map<string, number>();
  for (const a of accessori) {
    const qty = a.quantita ?? 1;
    accessoriCounts.set(a.tipo, (accessoriCounts.get(a.tipo) ?? 0) + qty);
  }

  const accessorioOrder = ["tapparella", "avvolgibile", "cassonetto", "zanzariera",
    "persiana", "scuro", "inferriata", "davanzale", "controtelaio"];
  const accessorioPieces: string[] = [];
  for (const orderKey of accessorioOrder) {
    const qty = accessoriCounts.get(orderKey);
    if (qty && qty > 0) {
      const group = ACCESSORIO_GROUPS[orderKey];
      if (group) {
        accessorioPieces.push(describeGroup(qty, group.singular, group.plural));
      } else {
        // Fallback: usa label da SR_ACCESSORI_TIPI
        const label = SR_ACCESSORI_TIPI.find((t) => t.value === orderKey)?.label ?? orderKey;
        accessorioPieces.push(`${qty} ${label.toLowerCase()}`);
      }
    }
  }
  // Fallback per tipi non noti
  for (const [tipo, qty] of accessoriCounts) {
    if (!accessorioOrder.includes(tipo) && qty > 0) {
      const label = SR_ACCESSORI_TIPI.find((t) => t.value === tipo)?.label ?? tipo;
      accessorioPieces.push(`${qty} ${label.toLowerCase()}`);
    }
  }

  // ── 3. Componi la frase ───────────────────────────────────────────────────
  if (serramentoPieces.length === 0 && accessorioPieces.length === 0) {
    return "";
  }

  const parts: string[] = [];
  if (serramentoPieces.length > 0) {
    parts.push(`Sostituzione di ${joinItalian(serramentoPieces)}`);
  }
  if (accessorioPieces.length > 0) {
    const connector = serramentoPieces.length > 0 ? "più" : "Fornitura di";
    parts.push(`${connector} ${joinItalian(accessorioPieces)}`);
  }

  return parts.join(", ") + ".";
}
