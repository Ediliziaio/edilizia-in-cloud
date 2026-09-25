/**
 * Dal preventivo termoidraulico col modello «conto-termico» ai dati del PDF
 * Conto Termico. Usato da useTermoidraulicoPDF: anteprima, download e firma
 * online passano tutti da qui, così il documento è sempre lo stesso.
 */
import type { ContoTermicoPdfData, FotoContoTermico } from "@/components/termoidraulico/contoTermico/ContoTermicoPDF";
import type { IdrPdfEnriched } from "@/hooks/useTermoidraulicoPDF";
import { costruisciDatiEdile } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";
import { GENERATORI, parolaDelCodice } from "@/components/preventivi/pdf/paroleDeiCodici";
import { economiaContoTermico, leggiDatiContoTermico } from "./dati";
import { FOTO_CONTO_TERMICO_DI_SERIE, FOTO_DOMANI_PER_TIPO } from "./anteprima";
import { PASSAGGI_CONTO_TERMICO } from "./testi";

export const MODELLO_CONTO_TERMICO = "conto-termico";

/** Il preventivo usa il modello Conto Termico? Si legge dal modello congelato. */
export function eContoTermico(e: Pick<IdrPdfEnriched, "progetto" | "template">): boolean {
  const blocchi = (e.template as unknown as { pdf_blocchi?: { modulo_intervento?: unknown } }).pdf_blocchi;
  return e.progetto.modello_snapshot?.modelId === MODELLO_CONTO_TERMICO || blocchi?.modulo_intervento === MODELLO_CONTO_TERMICO;
}

/** Le foto del documento, prima di essere incorporate: percorsi del sito. */
export function fotoDelPreventivo(tipo: ReturnType<typeof leggiDatiContoTermico>["tipo"]): Partial<Record<FotoContoTermico, string>> {
  return { ...FOTO_CONTO_TERMICO_DI_SERIE, domani: FOTO_DOMANI_PER_TIPO[tipo] ?? undefined };
}

export function datiPdfContoTermico(e: IdrPdfEnriched, foto: Partial<Record<FotoContoTermico, string | null>>): ContoTermicoPdfData {
  const p = e.progetto;
  const dati = leggiDatiContoTermico((p as unknown as { conto_termico?: unknown }).conto_termico);
  const cliente = [p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ").trim() || "Cliente";
  const indirizzo = [p.cantiere_indirizzo, [p.cantiere_cap, p.cantiere_citta].filter(Boolean).join(" "), p.cantiere_provincia ? `(${p.cantiere_provincia})` : null]
    .filter(Boolean).join(", ").replace(", (", " (") || null;
  const t = e.template;
  const faq = (t.faq ?? []).filter((q) => q.domanda?.trim() && q.risposta?.trim());
  const passaggi = (t.percorso ?? []).filter((x) => x.titolo?.trim()).map((x) => ({ titolo: x.titolo, testo: x.descrizione ?? "" }));
  const voci = e.capitoli.flatMap((c) => c.voci)
    .filter((v) => v.descrizione?.trim())
    .map((v) => ({ descrizione: v.descrizione, quantita: Number(v.quantita) || null, unita: v.unita_misura === "corpo" || v.unita_misura === "a corpo" ? null : v.unita_misura }));
  const creato = (p as unknown as { created_at?: string | null }).created_at ?? new Date().toISOString();
  const azienda = e.company;
  // Le pagine che ogni preventivo ha (chi siamo, voce per voce, foto, recensioni,
  // garanzie, condizioni e firma): gli stessi dati del documento degli altri
  // interventi, letti dallo stesso adattatore, disegnati nello stile del Conto Termico.
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
    intervento: {
      tipo: dati.tipo,
      titolo: dati.titolo,
      impiantoAttuale: dati.impianto_attuale,
      voci,
      caratteristiche: dati.caratteristiche,
    },
    economia: economiaContoTermico(dati, e.totali.totale, e.totali.ivaPct),
    testi: {
      titoloCopertina: (t as unknown as { cover_title?: string | null }).cover_title ?? null,
      sottotitoloCopertina: (t as unknown as { cover_subtitle?: string | null }).cover_subtitle ?? null,
      faq: faq.length ? faq : null,
      passaggi: passaggi.length ? passaggi : PASSAGGI_CONTO_TERMICO,
    },
    foto,
    colorePrimario: azienda?.colore_marca ?? null,
    standard,
  };
}
