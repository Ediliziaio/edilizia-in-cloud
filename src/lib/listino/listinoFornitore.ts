/**
 * Listino fornitore — la logica pura: prezzi netti, abbinamento voce↔riga
 * ordine, e la lettura dell'incolla-da-Excel.
 *
 * L'abbinamento e' volutamente SOLO ESATTO (codice o descrizione normalizzata):
 * un suggerimento di prezzo sbagliato su un ordine costa denaro vero, quindi
 * niente somiglianze — se non c'e' un match esatto, non si suggerisce niente.
 */

import { round2 } from "@/lib/listino/analisiPrezzo";

export interface VoceListinoFornitore {
  id: string;
  codice: string | null;
  descrizione: string;
  unita: string | null;
  prezzo: number;
  sconto_pct: number;
}

/** minuscole, spazi collassati: quanto basta per l'uguaglianza esatta. */
export function normalizza(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}

/** Il netto e' sempre prezzo × (1 − sconto voce). Nessuna composizione. */
export function prezzoNetto(prezzo: number, scontoPct: number): number {
  return round2((prezzo || 0) * (1 - (scontoPct || 0) / 100));
}

/**
 * Trova la voce per una riga d'ordine. Prima il codice (se entrambi lo
 * hanno), poi la descrizione. Match multipli sulla descrizione = ambiguita'
 * = nessun suggerimento.
 */
export function trovaVoce(
  voci: VoceListinoFornitore[],
  riga: { codice?: string | null; descrizione: string },
): VoceListinoFornitore | null {
  const cod = normalizza(riga.codice);
  if (cod) {
    const perCodice = voci.filter((v) => normalizza(v.codice) === cod);
    if (perCodice.length === 1) return perCodice[0];
    if (perCodice.length > 1) return null;
  }
  const desc = normalizza(riga.descrizione);
  if (!desc) return null;
  const perDescrizione = voci.filter((v) => normalizza(v.descrizione) === desc);
  return perDescrizione.length === 1 ? perDescrizione[0] : null;
}

/** "1.234,56" → 1234.56 · "12,5" → 12.5 · "€ 12.50" → 12.5 · robaccia → NaN */
export function parseImporto(s: string): number {
  const pulito = (s ?? "").replace(/[€\s]/g, "");
  if (!pulito) return NaN;
  let normalizzato = pulito;
  const virgola = pulito.lastIndexOf(",");
  const punto = pulito.lastIndexOf(".");
  if (virgola >= 0 && punto >= 0) {
    // Entrambi presenti: l'ultimo e' il separatore decimale.
    normalizzato = virgola > punto
      ? pulito.replace(/\./g, "").replace(",", ".")
      : pulito.replace(/,/g, "");
  } else if (virgola >= 0) {
    normalizzato = pulito.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(normalizzato);
  return Number.isFinite(n) ? n : NaN;
}

export interface VoceIncollata {
  codice: string | null;
  descrizione: string;
  unita: string | null;
  prezzo: number;
  sconto_pct: number;
}

export interface RisultatoIncolla {
  voci: VoceIncollata[];
  /** Righe che non si sono potute leggere, col motivo: si mostrano, non si perdono in silenzio. */
  scartate: Array<{ riga: string; motivo: string }>;
}

/**
 * Legge righe incollate da Excel (tab) o da CSV italiano (punto e virgola).
 * Colonne accettate, in quest'ordine:
 *   2 → descrizione · prezzo
 *   3 → codice · descrizione · prezzo
 *   4 → codice · descrizione · unita · prezzo
 *   5 → codice · descrizione · unita · prezzo · sconto%
 * La virgola NON e' mai un separatore di colonna: in Italia e' il decimale.
 */
export function parseVociIncollate(testo: string): RisultatoIncolla {
  const voci: VoceIncollata[] = [];
  const scartate: RisultatoIncolla["scartate"] = [];

  const righe = (testo ?? "").split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  for (const riga of righe) {
    const sep = riga.includes("\t") ? "\t" : riga.includes(";") ? ";" : null;
    const celle = (sep ? riga.split(sep) : [riga]).map((c) => c.trim());

    // Riga d'intestazione: la si riconosce e la si salta senza segnalarla.
    const testa = normalizza(celle.join(" "));
    if (/\bdescrizione\b/.test(testa) && /\bprezzo\b/.test(testa)) continue;

    let voce: VoceIncollata | null = null;
    if (celle.length === 2) {
      voce = { codice: null, descrizione: celle[0], unita: null, prezzo: parseImporto(celle[1]), sconto_pct: 0 };
    } else if (celle.length === 3) {
      voce = { codice: celle[0] || null, descrizione: celle[1], unita: null, prezzo: parseImporto(celle[2]), sconto_pct: 0 };
    } else if (celle.length === 4) {
      voce = { codice: celle[0] || null, descrizione: celle[1], unita: celle[2] || null, prezzo: parseImporto(celle[3]), sconto_pct: 0 };
    } else if (celle.length >= 5) {
      const sconto = parseImporto(celle[4]);
      voce = {
        codice: celle[0] || null, descrizione: celle[1], unita: celle[2] || null,
        prezzo: parseImporto(celle[3]),
        sconto_pct: Number.isFinite(sconto) ? Math.min(Math.max(sconto, 0), 100) : 0,
      };
    } else {
      scartate.push({ riga, motivo: "Servono almeno due colonne: descrizione e prezzo." });
      continue;
    }

    if (!voce.descrizione.trim()) {
      scartate.push({ riga, motivo: "Descrizione vuota." });
    } else if (!Number.isFinite(voce.prezzo) || voce.prezzo < 0) {
      scartate.push({ riga, motivo: "Prezzo non leggibile." });
    } else {
      voci.push({ ...voce, prezzo: round2(voce.prezzo) });
    }
  }
  return { voci, scartate };
}
