/**
 * Portare nell'archivio le condizioni che l'azienda ha già (07/11/2026).
 *
 * Florin: «non devi perdere le condizioni contrattuali importate da Renova, da Dimora Torino e dagli altri».
 *
 * Regole, e nessuna eccezione:
 *   · non si tocca niente di quello che c'è. Le righe di `quote_clause_templates`, `quote_templates` e dei
 *     modelli PDF dei moduli restano dove sono: l'archivio ne prende una COPIA.
 *   · il testo si copia com'è, HTML o Markdown che sia, con dentro i campi automatici `{{…}}`: non si
 *     riscrive, non si "ripulisce", non si accorcia. Quello che si perde non torna.
 *   · chi è già nell'archivio non entra due volte: il confronto è su titolo + testo, a meno di spazi,
 *     maiuscole e tag.
 */
import { testoPiano } from "../../../supabase/functions/_shared/condizioniArchivio";
import type { AmbitoCondizioni, Clausola } from "./archivio";

export interface CandidatoClausola {
  titolo: string;
  testo: string;
  categoria: string | null;
  vessatoria: boolean;
  /** Da dove arriva, per dirlo al titolare prima che importi. */
  fonte: string;
}

export interface CandidatoModello {
  nome: string;
  ambito: AmbitoCondizioni;
  clausole: Clausola[];
  fonte: string;
}

const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const testo = (v: unknown): string => (typeof v === "string" ? v : "");

/** Confronto "sono la stessa cosa": senza tag, senza spazi doppi, senza maiuscole. */
export function impronta(...pezzi: Array<string | null | undefined>): string {
  return pezzi
    .map((p) => String(p ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

/** Testo leggibile per l'anteprima: i tag si tolgono SOLO per mostrarlo, mai per salvarlo. */
export function testoLeggibile(html: string | null | undefined): string {
  // Una regola sola per «il testo senza i tag»: la stessa dei PDF e delle edge function.
  return testoPiano(html);
}

const haParole = (v: unknown): boolean => testoLeggibile(String(v ?? "")).length > 0;

/**
 * Le clausole già scritte in «Firma e condizioni → Condizioni» (`quote_clause_templates`): hanno già la
 * forma dell'archivio (titolo, testo, categoria, vessatoria), quindi passano una per una.
 */
export function clausoleDaImportare(
  righe: ReadonlyArray<unknown>,
  giaNellArchivio: ReadonlyArray<{ titolo: string; testo: string }> = [],
): CandidatoClausola[] {
  const viste = new Set(giaNellArchivio.map((c) => impronta(c.titolo, c.testo)));
  const candidati: CandidatoClausola[] = [];
  for (const raw of righe) {
    const r = record(raw);
    if (r.active === false) continue;
    const titolo = testo(r.title).trim();
    const corpo = testo(r.content);
    if (!titolo || !haParole(corpo)) continue;
    const chiave = impronta(titolo, corpo);
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    const applicabile = record(r.applicable_to);
    const categoria = testo(r.category).trim();
    candidati.push({
      titolo,
      testo: corpo,
      categoria: !categoria || categoria === "custom" ? null : categoria,
      vessatoria: applicabile.vessatoria === true,
      fonte: "Condizioni della firma",
    });
  }
  return candidati;
}

/**
 * I modelli di preventivo (`quote_templates`) e i modelli PDF dei moduli: il testo di ognuno diventa UN
 * modello dell'archivio, con una clausola sola che lo contiene tutto. Non si spezza in pezzi: spezzare
 * un contratto di 30 pagine a naso vuol dire sbagliare, e il testo originale è l'unica cosa che conta.
 */
export function modelliDaImportare(a: {
  quoteTemplates?: ReadonlyArray<unknown>;
  modelliModulo?: ReadonlyArray<{ nome: string; testo: string }>;
  giaNellArchivio?: ReadonlyArray<{ nome: string; clausole: Clausola[] }>;
}): CandidatoModello[] {
  const viste = new Set((a.giaNellArchivio ?? []).map((m) => impronta(m.nome, m.clausole.map((c) => c.testo).join(" "))));
  const candidati: CandidatoModello[] = [];
  const aggiungi = (nome: string, corpo: string, fonte: string, titoloClausola: string): void => {
    if (!nome.trim() || !haParole(corpo)) return;
    const chiave = impronta(nome, corpo);
    if (viste.has(chiave)) return;
    viste.add(chiave);
    candidati.push({ nome: nome.trim(), ambito: "preventivo", clausole: [{ titolo: titoloClausola, testo: corpo }], fonte });
  };

  for (const raw of a.quoteTemplates ?? []) {
    const r = record(raw);
    if (r.is_active === false) continue;
    const tipo = testo(r.kind) || "offerta";
    const nome = testo(r.name).trim();
    if (tipo === "condizioni" || tipo === "legali") {
      aggiungi(nome, testo(r.body_html) || testo(r.contractual_terms_text) || testo(r.legal_terms_text),
        "Modelli preventivi e contratti", tipo === "legali" ? "Termini legali" : "Condizioni generali");
      continue;
    }
    // Un modello d'offerta porta il testo dentro di sé solo se non punta a un blocco separato.
    if (!r.linked_terms_id && r.show_contractual_terms !== false) {
      aggiungi(nome ? `${nome} · condizioni` : "", testo(r.contractual_terms_text), "Modelli preventivi e contratti", "Condizioni generali");
    }
    if (!r.linked_legal_id && r.show_legal_terms) {
      aggiungi(nome ? `${nome} · termini legali` : "", testo(r.legal_terms_text), "Modelli preventivi e contratti", "Termini legali");
    }
  }

  for (const m of a.modelliModulo ?? []) aggiungi(m.nome, m.testo, "Modelli PDF dei moduli", "Condizioni generali");

  return candidati;
}
