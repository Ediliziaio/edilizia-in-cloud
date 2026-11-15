/**
 * Un lavoro extra o una variante letti da un documento con l'AI (15/11/2026, proposta 2 delle idee sull'AI).
 *
 * Un PDF, una foto o il testo di una mail del cliente («aggiungere due punti luce in cucina, togliere il
 * controsoffitto in bagno») diventa una bozza di variante già scritta: la stessa che si apre con «Nuova variante»
 * o dal preventivo accettato, da rivedere e salvare. Qui, in funzioni pure, cosa si prende dalla lettura:
 *
 *  - aggiunte e voci tolte insieme fanno una «modifica», con le tolte a prezzo negativo;
 *  - solo voci tolte fanno una «riduzione» (prezzi positivi: la riduzione si sottrae da sé);
 *  - le voci vanno «a voci» solo se hanno TUTTE quantità e prezzo; se no il prezzo è a corpo (quello del documento
 *    se lo dice) e l'elenco resta nella descrizione;
 *  - niente si inventa: un prezzo che manca resta vuoto, e un avviso lo dice.
 */
import { emptyVariationDraft, type VariationDraft, type VariationKind, type VariationLine } from "./variationDraft";

export interface VoceVarianteLetta {
  descrizione: string;
  quantita: number | null;
  unita: string | null;
  prezzo_unitario_eur: number | null;
  /** «tolta» = lavoro che esce dal contratto. */
  segno: "aggiunta" | "tolta";
}

export interface VarianteLetta {
  titolo: string;
  descrizione: string;
  fase_riferimento: string | null;
  voci: VoceVarianteLetta[];
  importo_a_corpo_eur: number | null;
  giorni_aggiuntivi: number | null;
  richiesto_da: string | null;
  motivazione: string | null;
  avvisi: string[];
}

const MAX_VOCI = 40;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim().replace(/[€\s]/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};
const testo = (v: unknown, max = 500): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && s.toLowerCase() !== "null" ? s.slice(0, max) : null;
};

/** Parsing difensivo di quello che risponde l'AI. */
export function leggiVarianteDaAi(raw: unknown): VarianteLetta {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const voci = (Array.isArray(r.voci) ? r.voci : [])
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v): VoceVarianteLetta | null => {
      const descrizione = testo(v.descrizione, 300);
      if (!descrizione) return null;
      const q = num(v.quantita);
      const p = num(v.prezzo_unitario_eur);
      // Una voce col prezzo e senza quantità è un lavoro a corpo: «il controsoffitto (era 600 euro)» = 1 × 600.
      const quantita = q != null && q > 0 ? q : p != null ? 1 : null;
      return {
        descrizione,
        quantita,
        unita: testo(v.unita, 20),
        // Il segno lo dice «segno», non il prezzo: un prezzo negativo letto si tiene in valore assoluto.
        prezzo_unitario_eur: p != null ? Math.abs(p) : null,
        segno: v.segno === "tolta" || (p != null && p < 0) ? "tolta" : "aggiunta",
      };
    })
    .filter((v): v is VoceVarianteLetta => v !== null)
    .slice(0, MAX_VOCI);
  const g = num(r.giorni_aggiuntivi);
  const corpo = num(r.importo_a_corpo_eur);
  return {
    titolo: testo(r.titolo, 120) ?? "",
    descrizione: testo(r.descrizione, 2000) ?? "",
    fase_riferimento: testo(r.fase_riferimento, 160),
    voci,
    importo_a_corpo_eur: corpo != null ? Math.abs(corpo) : null,
    giorni_aggiuntivi: g != null && g >= 0 && g <= 3650 ? Math.round(g) : null,
    richiesto_da: testo(r.richiesto_da, 160),
    motivazione: testo(r.motivazione, 1000),
    avvisi: Array.isArray(r.warnings) ? r.warnings.map((w) => String(w)).filter(Boolean).slice(0, 10) : [],
  };
}

const decimale = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

export function tipoVariante(voci: readonly Pick<VoceVarianteLetta, "segno">[]): VariationKind {
  const tolte = voci.filter((v) => v.segno === "tolta").length;
  if (tolte === 0) return "aggiunta";
  return tolte === voci.length ? "riduzione" : "modifica";
}

/**
 * La bozza da aprire nella variante. `base` porta i dati del documento (impresa, cliente), come per «Nuova
 * variante». Gli avvisi vanno mostrati a chi la apre.
 */
export function bozzaVarianteDaDocumento(letta: VarianteLetta, base: VariationDraft = emptyVariationDraft()): { bozza: VariationDraft; avvisi: string[] } {
  const avvisi = [...letta.avvisi];
  const kind = tipoVariante(letta.voci);
  const tuttePrezzate = letta.voci.length > 0 && letta.voci.every((v) => v.quantita != null && v.prezzo_unitario_eur != null);
  const lines: VariationLine[] = tuttePrezzate
    ? letta.voci.map((v, i) => ({
      id: `doc-${i + 1}`,
      description: v.segno === "tolta" && kind === "modifica" ? `Da togliere: ${v.descrizione}` : v.descrizione,
      quantity: decimale(v.quantita!),
      // In una modifica le voci tolte scendono di prezzo; in una riduzione si scrivono positive.
      price: decimale(kind === "modifica" && v.segno === "tolta" ? -v.prezzo_unitario_eur! : v.prezzo_unitario_eur!),
      ...(v.unita ? { unit: v.unita } : {}),
    }))
    : [];
  const elenco = !tuttePrezzate && letta.voci.length > 0
    ? `Lavori:\n${letta.voci.map((v) => `- ${v.segno === "tolta" ? "Togliere: " : ""}${v.descrizione}${v.quantita != null ? ` (${decimale(v.quantita)}${v.unita ? ` ${v.unita}` : ""})` : ""}`).join("\n")}`
    : "";
  if (!tuttePrezzate && letta.voci.length > 0) avvisi.push("Non tutte le voci hanno quantità e prezzo: la variante è a corpo, con l'elenco nella descrizione.");
  if (!tuttePrezzate && letta.importo_a_corpo_eur == null) avvisi.push("Il documento non dice l'importo: scrivilo prima di salvare.");
  if (!letta.titolo) avvisi.push("Il documento non ha un titolo chiaro: scrivilo tu.");

  const descrizione = [letta.descrizione, elenco].filter(Boolean).join("\n\n");
  return {
    avvisi,
    bozza: {
      ...base,
      kind,
      title: letta.titolo,
      description: descrizione,
      phase: letta.fase_riferimento ?? "",
      pricing: tuttePrezzate ? "voci" : "corpo",
      amount: tuttePrezzate || letta.importo_a_corpo_eur == null ? "" : decimale(letta.importo_a_corpo_eur),
      lines,
      days: String(letta.giorni_aggiuntivi ?? 0),
      reason: letta.motivazione ?? "",
      requester: letta.richiesto_da ?? "",
    },
  };
}
