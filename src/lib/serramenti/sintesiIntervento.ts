/**
 * Generazione automatica del testo "Sintesi dell'intervento" del preventivo
 * serramenti, basata sul BOM (serramenti + accessori) + tipo intervento.
 *
 * Esempi output per tipo intervento:
 *   sostituzione      -> "Sostituzione di 4 finestre e 2 porte-finestre, con
 *                         l'aggiunta di 6 tapparelle, 6 cassonetti e 6 zanzariere."
 *   nuova_costruzione -> "Fornitura e posa di 4 finestre e 2 porte-finestre,
 *                         oltre a 6 tapparelle, 6 cassonetti e 6 zanzariere."
 *   ristrutturazione  -> "Riqualificazione con 4 nuove finestre e 2
 *                         porte-finestre, completate da 6 tapparelle..."
 *   manutenzione      -> "Intervento di manutenzione su 4 finestre e
 *                         2 porte-finestre, con 6 tapparelle..."
 *
 * Logica:
 *  - Raggruppa serramenti per "famiglia tipologica" (es. finestra_1ante +
 *    finestra_2ante = "X finestre"). Singolare/plurale italiani corretti.
 *  - Connettore italiano naturale: ", " e " e " per le enumerazioni
 *    (al posto del "più" precedente, percepito troppo informale).
 *  - Prefisso narrativo coerente con il tipo intervento (no sempre
 *    "Sostituzione di..." anche per nuova costruzione).
 *
 * Pura, no side-effect, no DB: si usa sia dal client (auto-fill form) sia
 * dal componente PDF (fallback se snapshot stale o vuoto).
 */
import { SR_ACCESSORI_TIPI } from "@/types/serramenti";

/** Tipo intervento del progetto, per dispatch del prefisso narrativo. */
export type SintesiTipoIntervento =
  | "sostituzione"
  | "nuova_costruzione"
  | "ristrutturazione"
  | "manutenzione"
  | null
  | undefined;

type Serramento = {
  tipologia: string;
  tipologia_label?: string | null;
  quantita?: number | null;
  /** Presente sulle righe aggiunte dal listino. */
  family_id?: string | null;
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

/**
 * Le righe aggiunte dal listino nascono tutte con tipologia «finestra_2ante»: il
 * tipo vero sta nel nome dell'articolo. Senza, un alzante scorrevole entrava nella
 * sintesi del PDF come finestra («Sostituzione di 2 finestre»).
 */
function gruppoDaNomeArticolo(nome: string): { singular: string; plural: string } {
  const n = nome.toLowerCase();
  if (/persian|\bscur[oi]\b/.test(n)) return { singular: "persiana", plural: "persiane" };
  if (/alzante/.test(n)) return TIPOLOGIA_GROUPS.alzante_scorrevole;
  if (/scorrevol|traslant|\bslide\b/.test(n)) return TIPOLOGIA_GROUPS.scorrevole;
  if (/porta[\s-]?finestr/.test(n)) return TIPOLOGIA_GROUPS.portafinestra_1anta;
  if (/portoncin/.test(n)) return { singular: "portoncino", plural: "portoncini" };
  if (/\bport[ae]\b/.test(n)) return { singular: "porta", plural: "porte" };
  if (/finestr|vasistas|wasistas/.test(n)) return TIPOLOGIA_GROUPS.finestra_1anta;
  if (/\bfiss[oi]\b/.test(n)) return TIPOLOGIA_GROUPS.fisso;
  return { singular: "serramento", plural: "serramenti" };
}

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
 * @param tipoIntervento Tipo di intervento (per dispatch del prefisso narrativo).
 *                       Default: "sostituzione" se omesso (retro-compat).
 * @returns Stringa narrativa pronta per il PDF. Se BOM vuoto, ritorna stringa vuota.
 */
export function generateInterventoSintesi(
  serramenti: Serramento[],
  accessori: Accessorio[],
  tipoIntervento: SintesiTipoIntervento = "sostituzione",
): string {
  // ── 1. Raggruppa serramenti per categoria narrativa ───────────────────────
  const serramentiCounts = new Map<string, number>();
  for (const s of serramenti) {
    if ((s.tipologia === "voce_manuale" || s.tipologia === "a_corpo") && s.tipologia_label) {
      const label = s.tipologia_label.trim();
      if (label) {
        const qty = s.quantita ?? 1;
        serramentiCounts.set(label, (serramentiCounts.get(label) ?? 0) + qty);
        continue;
      }
    }
    const nomeArticolo = s.family_id ? (s.tipologia_label ?? "").trim() : "";
    const group = nomeArticolo ? gruppoDaNomeArticolo(nomeArticolo) : TIPOLOGIA_GROUPS[s.tipologia];
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

  // Prefissi narrativi per tipo intervento. Italiano naturale, da preventivo.
  //   - sostituzione      -> "Sostituzione di ..."         (default)
  //   - nuova_costruzione -> "Fornitura e posa di ..."
  //   - ristrutturazione  -> "Riqualificazione con ..."
  //   - manutenzione      -> "Intervento di manutenzione su ..."
  const tipo = tipoIntervento ?? "sostituzione";
  const prefisso = (() => {
    switch (tipo) {
      case "nuova_costruzione": return "Fornitura e posa di";
      case "ristrutturazione":  return "Riqualificazione con";
      case "manutenzione":      return "Intervento di manutenzione su";
      default:                  return "Sostituzione di";
    }
  })();

  // Connettore tra serramenti e accessori, anch'esso dipendente dal tipo.
  // "più" e' troppo informale -> sostituito con "con l'aggiunta di" /
  // "oltre a" / "completate da", secondo il contesto narrativo.
  const connettoreAccessori = (() => {
    switch (tipo) {
      case "nuova_costruzione": return "oltre a";
      case "ristrutturazione":  return "completate da";
      case "manutenzione":      return "con";
      default:                  return "con l'aggiunta di";
    }
  })();

  // Per ristrutturazione, l'aggettivo "nuove/nuovi" davanti al serramento e'
  // ridondante con "Riqualificazione" -> lo omettiamo per non appesantire.
  // (in passato avevamo "Riqualificazione con 4 nuove finestre" — meglio
  //  "Riqualificazione con 4 finestre" che e' piu' fluido).

  const parts: string[] = [];
  if (serramentoPieces.length > 0) {
    parts.push(`${prefisso} ${joinItalian(serramentoPieces)}`);
  } else {
    // Caso edge: solo accessori, niente serramenti. Usiamo "Fornitura di"
    // come prefisso indipendente (es. "Fornitura di 6 tapparelle.").
    parts.push(`Fornitura di ${joinItalian(accessorioPieces)}`);
    return parts.join("") + ".";
  }
  if (accessorioPieces.length > 0) {
    parts.push(`${connettoreAccessori} ${joinItalian(accessorioPieces)}`);
  }

  return parts.join(", ") + ".";
}
