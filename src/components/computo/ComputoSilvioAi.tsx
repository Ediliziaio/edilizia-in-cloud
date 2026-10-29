import { useState } from "react";
import QuoteWizardAiDialog, { QuoteWizardAiIssue } from "@/components/quotes/QuoteWizardAiDialog";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { emptyQuoteProject, type QuoteProject } from "@/lib/preventivi/quoteProject";
import { cloneWizardDraft, computoChatDocument, reconcileComputoDraft, suggestedComputoChapter, wizardDraftFingerprint, type NativeComputoRow, type WizardAiChange } from "@/lib/preventivi/wizardAiDraft";
import { chatLineIssue, type ChatDocument } from "@/lib/preventivi/quoteChatDocument";
import { enrichComputoRowsFromListino } from "@/lib/preventivi/wizardAiListino";
import type { WizardAiCommercialDraft } from "@/lib/preventivi/wizardAiCommercial";
import type { QuoteItemPro } from "@/types/quoteItem";
import { QUOTE_LISTINO_SOURCES } from "../../../supabase/functions/_shared/quoteListinoSource";
import { calcolaVoce, voceVuota, vociPerAnteprima, type BozzaComputo, type VoceEditor } from "@/lib/computo/editorNativo";
import type { IntestazioneComputo } from "@/lib/computo/esportaComputo";
import { createPdfPreviewUrl } from "@/lib/pdfPreviewSource";

/** La chat lavora sulle stesse righe del listino generale dell'edilizia, come Ristrutturazione. */
const MODULO = "ristrutturazione" as const;
/** Oltre, `reconcileComputoDraft` rifiuta la bozza: la chat è pensata per un preventivo, non per un computo d'appalto. */
export const MAX_VOCI_SILVIO = 100;

const cifra = (n: number) => (Number.isFinite(n) ? n.toLocaleString("it-IT", { useGrouping: false, maximumFractionDigits: 6 }) : "");

function rigaDaVoce(v: VoceEditor, ordine: number, companyId: string, draftId: string): NativeComputoRow {
  const c = calcolaVoce(v);
  return {
    id: v.id, progetto_id: draftId, company_id: companyId, capitolo_nome: v.capitolo.trim() || "Opere edili",
    descrizione: v.descrizione.trim() || "Lavorazione da completare",
    unita_misura: (v.unita.trim() || "corpo") as NativeComputoRow["unita_misura"],
    quantita: c.quantita ?? 0, prezzo_unitario: c.prezzo ?? 0, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0,
    importo: c.importo ?? 0, margine_eur: 0, margine_pct: 0, listino_voce_id: null, ordine, fonte: v.fonte || null,
  };
}

/**
 * Le righe confermate nella chat tornano voci dell'editor. Una voce che la
 * chat non ha toccato resta com'era, con le sue righe di misura; se la chat ne
 * cambia la quantità, vince la quantità confermata e le misure (che direbbero
 * un altro numero) si tolgono.
 */
export function vociDaRigheChat(righe: NativeComputoRow[], prima: VoceEditor[], daCompletare: { prezzo: Set<string>; quantita: Set<string> } = { prezzo: new Set(), quantita: new Set() }): VoceEditor[] {
  const vecchie = new Map(prima.map(v => [v.id, v]));
  return righe.map(r => {
    const vecchia = vecchie.get(r.id);
    const unita = String(r.unita_misura ?? "").trim();
    const qVecchia = vecchia ? calcolaVoce(vecchia).quantita : null;
    const tieniMisure = !!vecchia?.misure.length && qVecchia !== null && Math.abs(qVecchia - r.quantita) < 0.005;
    const testo = r.descrizione_estesa && r.descrizione_estesa.trim() !== r.descrizione.trim() ? `${r.descrizione}\n${r.descrizione_estesa}` : r.descrizione;
    return {
      ...(vecchia ?? voceVuota()), id: r.id,
      capitolo: (r.capitolo_nome || "Opere edili").slice(0, 300),
      descrizione: vecchia && vecchia.descrizione.trim() === testo.trim() ? vecchia.descrizione : testo.slice(0, 30000),
      // Senza prezzo o senza quantità la voce entra vuota lì: l'editor la segna «da completare», non la prezza a zero.
      unita: unita.slice(0, 40), prezzo: daCompletare.prezzo.has(r.id) ? "" : cifra(r.prezzo_unitario),
      quantita: tieniMisure || daCompletare.quantita.has(r.id) ? "" : cifra(r.quantita), misure: tieniMisure ? vecchia!.misure : [],
      fonte: r.fonte ?? vecchia?.fonte ?? "",
      // Una voce agganciata al listino aziendale porta il suo costo (materiali + manodopera); le altre tengono quello che avevano.
      costo: r.listino_voce_id && (r.costo_materiali || 0) + (r.costo_manodopera || 0) > 0
        ? String(Math.round(((r.costo_materiali || 0) + (r.costo_manodopera || 0)) * 100) / 100).replace(".", ",") : vecchia?.costo ?? "",
      corpo: unita === "corpo" || unita === "a corpo",
    };
  });
}

/**
 * «Apri Silvio AI» nel preventivo con computo: la stessa chat dei Bagni e
 * degli altri moduli (`QuoteWizardAiDialog`), che parla col computo di questa
 * bozza. Le modifiche restano nella chat finché l'utente non le rivede e le
 * applica; l'anteprima è il PDF di questo editor.
 */
export default function ComputoSilvioAi({ bozza, companyId, draftId, intestazione, open, onOpenChange, onApply, fileIniziale }: {
  bozza: BozzaComputo; companyId: string; draftId: string; intestazione: IntestazioneComputo;
  /** Un file del passo Progetto (la planimetria) da far leggere subito. */
  fileIniziale?: File;
  open: boolean; onOpenChange: (open: boolean) => void;
  /** `titolo`: quello che la chat ha dato al lavoro («Campo da tennis in resina»), se diverso da quello di partenza. */
  onApply: (voci: VoceEditor[], titolo?: string) => void;
}) {
  const titolo = bozza.titolo.trim() || "Preventivo con computo";
  const [seme] = useState(() => {
    try {
      const base = cloneWizardDraft(bozza.voci.map((v, i) => rigaDaVoce(v, i, companyId, draftId)));
      return { base, documento: computoChatDocument(base, titolo), errore: null as string | null };
    } catch (e) {
      return { base: [] as NativeComputoRow[], documento: { revision: 0, title: titolo, lines: [] } as ChatDocument, errore: (e as Error).message };
    }
  });
  if (seme.errore) return <QuoteWizardAiIssue open={open} onOpenChange={onOpenChange} message={seme.errore} />;

  const aliquota = bozza.ivaModalita === "applicata" && /^\d+(?:[.,]\d+)?$/.test(bozza.ivaAliquota.trim()) ? Number(bozza.ivaAliquota.replace(",", ".")) : null;
  const progetto: QuoteProject = { ...emptyQuoteProject(), address: bozza.indirizzo, notes: [bozza.oggetto, bozza.condizioni].filter(s => s.trim()).join("\n\n"),
    tax: { defaultRate: aliquota, lineRates: [], display: "net" as const } };
  const commerciale: WizardAiCommercialDraft = {
    clientName: bozza.committente, discountPercent: 0, prezzoManuale: null, prezzoManualeIvaPct: aliquota,
    nativeTax: { significantGoods: false, significantLineIds: [] },
    items: seme.base.map((r): QuoteItemPro => ({ client_temp_id: r.id, item_type: "service", item_category: "posa", name: r.descrizione,
      description: r.descrizione, quantity: r.quantita, unit_of_measure: r.unita_misura, unit_price: r.prezzo_unitario,
      discount_percent: 0, vat_rate: aliquota, prezzo_acquisto: 0, mostra_nel_pdf: true, is_optional: false, sort_order: r.ordine })),
  };
  /**
   * Il riconciliatore condiviso fa entrare solo le voci spuntate «Inclusa», e
   * una voce si può spuntare solo con quantità e prezzo: per un modulo che
   * stampa subito il PDF ha senso. Qui no: nel computo una voce senza prezzo
   * si gestisce benissimo («da completare») e si prezza in riga. Quindi le voci
   * NUOVE della chat entrano tutte; quelle incomplete arrivano vuote dove manca
   * il dato. Prima del 29/10/2026 servivano 18 spunte e 18 prezzi riscritti a
   * mano, anche dopo averli dettati, prima che «Rivedi e applica» si accendesse.
   */
  const riconcilia = (bozzaChat: ChatDocument, capitoli: Record<string, string> = {}) => {
    const base = reconcileComputoDraft(seme.base, seme.documento, bozzaChat, { companyId, projectId: draftId }, capitoli);
    const esistenti = new Set(seme.base.map(r => r.id));
    const daCompletare = { prezzo: new Set<string>(), quantita: new Set<string>() };
    const nuove = bozzaChat.lines.filter(l => !esistenti.has(l.id) && !l.supersededBy?.length && !l.included && l.title.trim());
    const righe = nuove.map((l, k): NativeComputoRow => {
      const senzaQuantita = l.quantity == null || !!l.proposedCalculation;
      if (l.price == null) daCompletare.prezzo.add(l.id);
      if (senzaQuantita) daCompletare.quantita.add(l.id);
      return {
        id: l.id, progetto_id: draftId, company_id: companyId,
        capitolo_nome: (capitoli[l.id] ?? suggestedComputoChapter(l.title)).trim() || "Opere edili",
        descrizione: l.title, descrizione_estesa: l.description || null,
        unita_misura: (l.unit.trim() || "corpo") as NativeComputoRow["unita_misura"],
        quantita: senzaQuantita ? 0 : l.quantity!, prezzo_unitario: l.price ?? 0, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0,
        importo: 0, margine_eur: 0, margine_pct: 0, listino_voce_id: null, ordine: base.rows.length + k,
        fonte: l.pricing?.basis ?? null,
      };
    });
    const cambi: WizardAiChange[] = nuove.map((l, k) => {
      const manca = [daCompletare.quantita.has(l.id) && "quantità", daCompletare.prezzo.has(l.id) && "prezzo"].filter(Boolean).join(" e ");
      return { id: l.id, title: manca ? `${l.title} · ${manca} da inserire nel computo` : l.title, chapter: righe[k].capitolo_nome, kind: "aggiunta",
        ...(manca ? {} : { after: { quantity: righe[k].quantita, unit: righe[k].unita_misura, price: righe[k].prezzo_unitario } }) };
    });
    return { rows: [...base.rows, ...righe], changes: [...base.changes, ...cambi], pending: 0, daCompletare,
      // Una voce che resta da completare non è un errore del riconciliatore: serve solo a dirlo nel riepilogo.
      incomplete: nuove.filter(l => !!chatLineIssue(l)).length };
  };
  const anteprima = (bozzaChat: ChatDocument, capitoli: Record<string, string>) => {
    let voci: VoceEditor[] = []; let errore = "";
    try { const r = riconcilia(bozzaChat, capitoli); voci = vociDaRigheChat(r.rows, bozza.voci, r.daCompletare); } catch (e) { errore = (e as Error).message; }
    return <section className="rounded-2xl border bg-white p-4" aria-label="Anteprima del computo">
      <h2 className="font-semibold text-blue-950">{titolo}</h2>
      <p className="mb-3 mt-1 text-xs text-slate-500">Anteprima della bozza della chat: niente cambia nel preventivo finché non applichi.</p>
      {errore ? <p role="alert" className="text-sm text-orange-800">{errore}</p> : <div className="h-[65dvh] min-h-[320px]"><PdfBlobLivePreviewPanel
        renderBlobUrl={async () => {
          const { generaDocumentoComputo } = await import("@/lib/computo/esportaComputo");
          const a = vociPerAnteprima({ ...bozza, voci }, false);
          return createPdfPreviewUrl(await generaDocumentoComputo(a.voci, { ...intestazione, titolo }));
        }}
        depsKey={JSON.stringify([voci, intestazione])} debounceMs={1000} downloadFileName="bozza-silvio-computo.pdf" /></div>}
    </section>;
  };

  return <QuoteWizardAiDialog open={open} onOpenChange={onOpenChange} companyId={companyId} title={titolo} document={seme.documento} project={progetto}
    fingerprint={wizardDraftFingerprint([seme.base, companyId, draftId])} commercial={{ draft: commerciale, defaultVat: aliquota, module: MODULO }} chapters
    preview={anteprima} review={(bozzaChat, capitoli) => riconcilia(bozzaChat, capitoli)} listinoSourceId={QUOTE_LISTINO_SOURCES[MODULO].id} initialFile={fileIniziale}
    onApply={async (bozzaChat, capitoli) => {
      const r = riconcilia(bozzaChat, capitoli);
      const titoloChat = bozzaChat.title?.trim();
      onApply(vociDaRigheChat(await enrichComputoRowsFromListino(MODULO, r.rows), bozza.voci, r.daCompletare), titoloChat && titoloChat !== titolo ? titoloChat.slice(0, 160) : undefined);
    }} />;
}
