/**
 * Dal preventivo termoidraulico ai dati comuni dei documenti «racconto»
 * (Conto Termico, Casa Full Electric): chi manda, a chi, quale preventivo, i
 * testi del modello e le pagine di ogni preventivo. Ogni documento ci aggiunge
 * i suoi numeri.
 */
import type { IdrPdfEnriched } from "@/hooks/useTermoidraulicoPDF";
import type { DatiRacconto } from "@/components/preventivi/pdf/racconto/baseRacconto";
import type { DomandaRisposta, Passaggio } from "@/lib/contoTermico/testi";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";
import { GENERATORI, parolaDelCodice } from "@/components/preventivi/pdf/paroleDeiCodici";

/** Il preventivo usa questo modello? Si legge dal modello congelato (o da quello di libreria nell'anteprima). */
export function usaModello(e: Pick<IdrPdfEnriched, "progetto" | "template">, modello: string): boolean {
  const blocchi = (e.template as unknown as { pdf_blocchi?: { modulo_intervento?: unknown } }).pdf_blocchi;
  return e.progetto.modello_snapshot?.modelId === modello || blocchi?.modulo_intervento === modello;
}

export interface RaccontoDelPreventivo extends DatiRacconto {
  testi: {
    titoloCopertina: string | null;
    sottotitoloCopertina: string | null;
    /** Le domande del modello; null = quelle del documento. */
    faq: DomandaRisposta[] | null;
    /** I passaggi del modello; vuoto = quelli del documento. */
    passaggi: Passaggio[];
  };
  /** Le voci del computo, per le anteprime senza capitoli. */
  voci: { descrizione: string; quantita: number | null; unita: string | null }[];
  colorePrimario: string | null;
}

export function raccontoDelPreventivo(e: IdrPdfEnriched): RaccontoDelPreventivo {
  const p = e.progetto;
  const t = e.template;
  const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ").trim() || "Cliente";
  const indirizzo = [p.cantiere_indirizzo, [p.cantiere_cap, p.cantiere_citta].filter(Boolean).join(" "), p.cantiere_provincia ? `(${p.cantiere_provincia})` : null]
    .filter(Boolean).join(", ").replace(", (", " (") || null;
  const faq = (t.faq ?? []).filter((q) => q.domanda?.trim() && q.risposta?.trim());
  const passaggi = (t.percorso ?? []).filter((x) => x.titolo?.trim()).map((x) => ({ titolo: x.titolo, testo: x.descrizione ?? "" }));
  const voci = e.capitoli.flatMap((c) => c.voci)
    .filter((v) => v.descrizione?.trim())
    .map((v) => ({ descrizione: v.descrizione, quantita: Number(v.quantita) || null, unita: v.unita_misura === "corpo" || v.unita_misura === "a corpo" ? null : v.unita_misura }));
  const creato = (p as unknown as { created_at?: string | null }).created_at ?? new Date().toISOString();
  const azienda = e.company;
  // Le pagine che ogni preventivo ha (chi siamo, voce per voce, foto, recensioni,
  // garanzie, condizioni e firma): gli stessi dati del documento degli altri
  // interventi, letti dallo stesso adattatore, disegnati nello stile del racconto.
  const standard = costruisciDatiEdile({
    modulo: MODULI_EDILI.termoidraulico,
    progetto: p,
    template: t as unknown as Record<string, unknown>,
    azienda,
    capitoli: e.capitoli,
    totali: e.totali,
    media: e.media,
    opzioniComputo: e.computoOptions,
    schedaModulo: [{ etichetta: "Generatore", valore: parolaDelCodice(p.tipo_generatore, GENERATORI) }],
  });
  return {
    azienda: {
      nome: azienda?.ragione_sociale || azienda?.name || "La tua azienda",
      logoUrl: t.logo_url ?? azienda?.logo_url ?? null,
      telefono: azienda?.telefono ?? null,
      email: azienda?.email ?? null,
      sito: azienda?.website?.replace(/^https?:\/\//, "") ?? null,
      piva: azienda?.partita_iva ?? null,
    },
    cliente: { nome: cliente, indirizzo },
    preventivo: { codice: p.code ?? "Bozza", dataIso: creato, validitaGiorni: Number(t.default_validita_giorni) || 30, consulente: null },
    standard,
    testi: {
      titoloCopertina: (t as unknown as { cover_title?: string | null }).cover_title ?? null,
      sottotitoloCopertina: (t as unknown as { cover_subtitle?: string | null }).cover_subtitle ?? null,
      faq: faq.length ? faq : null,
      passaggi,
    },
    voci,
    colorePrimario: azienda?.colore_marca ?? null,
  };
}
