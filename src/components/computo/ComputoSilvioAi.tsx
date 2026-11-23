import { lazy, Suspense, useMemo, useState } from "react";
import QuoteWizardAiDialog, { QuoteWizardAiIssue } from "@/components/quotes/QuoteWizardAiDialog";
import { emptyQuoteProject, type QuoteProject } from "@/lib/preventivi/quoteProject";
import { cloneWizardDraft, computoChatDocument, quantitaProposta, reconcileComputoDraft, suggestedComputoChapter, wizardDraftFingerprint, type NativeComputoRow, type WizardAiChange } from "@/lib/preventivi/wizardAiDraft";
import { chatLineIssue, type ChatDocument } from "@/lib/preventivi/quoteChatDocument";
import { enrichComputoRowsFromListino } from "@/lib/preventivi/wizardAiListino";
import type { WizardAiCommercialDraft } from "@/lib/preventivi/wizardAiCommercial";
import type { QuoteItemPro } from "@/types/quoteItem";
import { QUOTE_LISTINO_SOURCES } from "../../../supabase/functions/_shared/quoteListinoSource";
import { calcolaVoce, rettificaQuantitaMisurata, voceVuota, type BozzaComputo, type VoceEditor } from "@/lib/computo/editorNativo";
import { unitaCompatibili } from "@/lib/prezzario/confronto";
import type { WizardAiSnapshot } from "@/lib/preventivi/wizardAiMemory";
import { AnteprimaComputoSilvio, type RendiPdfComputo } from "./AnteprimaComputoSilvio";
import type { ControlliCostiSilvio } from "@/lib/preventivi/modificaCostoSilvio";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/** La chat lavora sulle stesse righe del listino generale dell'edilizia, come Ristrutturazione. */
const MODULO = "ristrutturazione" as const;
/** Oltre, `reconcileComputoDraft` rifiuta la bozza: la chat è pensata per un preventivo, non per un computo d'appalto. */
export const MAX_VOCI_SILVIO = 100;
const MAX_NOME_CAPITOLO = 300;
const AnalisiCostiSilvio = lazy(() => import("./AnalisiCostiSilvio"));

const cifra = (n: number) => (Number.isFinite(n) ? n.toLocaleString(intlCampo(), { useGrouping: false, maximumFractionDigits: 6 }) : "");

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
 * chat non ha toccato resta com'era. Una variazione della quantità aggiunge
 * una rettifica alle misure esistenti.
 */
function vociDaRigheChat(righe: NativeComputoRow[], prima: VoceEditor[], cambi: WizardAiChange[], daCompletare: { prezzo: Set<string>; quantita: Set<string> }, chat: ChatDocument): VoceEditor[] {
  const vecchie = new Map(prima.map(v => [v.id, v]));
  const cambiate = new Set(cambi.map(c => c.id));
  const proposte = new Map(chat.lines.map(l => [l.id, l]));
  return righe.map(r => {
    const vecchia = vecchie.get(r.id);
    if (vecchia && !cambiate.has(r.id)) return vecchia;
    const unita = String(r.unita_misura ?? "").trim();
    let misure = vecchia?.misure ?? [];
    if (vecchia && misure.length && calcolaVoce(vecchia).quantita !== null) {
      misure = rettificaQuantitaMisurata(vecchia, r.quantita, proposte.get(r.id)?.quantityBasis);
    }
    const testo = r.descrizione_estesa && r.descrizione_estesa.trim() !== r.descrizione.trim() ? `${r.descrizione}\n${r.descrizione_estesa}` : r.descrizione;
    return {
      ...(vecchia ?? voceVuota()), id: r.id,
      capitolo: (r.capitolo_nome || "Opere edili").slice(0, 300),
      descrizione: vecchia && vecchia.descrizione.trim() === testo.trim() ? vecchia.descrizione : testo.slice(0, 30000),
      // Senza prezzo o senza quantità la voce entra vuota lì: l'editor la segna «da completare», non la prezza a zero.
      unita: unita.slice(0, 40), prezzo: daCompletare.prezzo.has(r.id) ? "" : cifra(r.prezzo_unitario),
      quantita: misure.length || daCompletare.quantita.has(r.id) ? "" : cifra(r.quantita), misure,
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
export default function ComputoSilvioAi({ bozza, companyId, draftId, renderPdf, chiavePdf, open, onOpenChange, onApply, fileIniziale, capitoloIniziale, mostraAnalisiCosti, modificaAnalisiCosti, progettoOperativo, progettoInModifica, apriProgetto, onAggiornaChatPreventivo, continuazione, chiediChiusura }: {
  bozza: BozzaComputo; companyId: string; draftId: string;
  renderPdf: RendiPdfComputo;
  chiavePdf: string;
  /** Un file del passo Progetto (la planimetria) da far leggere subito. */
  fileIniziale?: File;
  capitoloIniziale?: string;
  mostraAnalisiCosti?: boolean;
  modificaAnalisiCosti?: boolean;
  progettoOperativo?: React.ReactNode;
  progettoInModifica?: boolean;
  apriProgetto?: boolean;
  onAggiornaChatPreventivo?: (continuazione: WizardAiSnapshot, chiusura: boolean) => void;
  continuazione?: WizardAiSnapshot;
  chiediChiusura?: boolean;
  open: boolean; onOpenChange: (open: boolean) => void;
  /** `titolo`: quello che la chat ha dato al lavoro («Campo da tennis in resina»), se diverso da quello di partenza. */
  onApply: (voci: VoceEditor[], titolo?: string) => void;
}) {
  const t = useT();
  const titolo = bozza.titolo.trim() || "Preventivo con computo";
  const righeCorrenti = useMemo(() => bozza.voci.map((v, i) => rigaDaVoce(v, i, companyId, draftId)), [bozza.voci, companyId, draftId]);
  const [seme] = useState(() => {
    try {
      const base = cloneWizardDraft(righeCorrenti);
      const documento = computoChatDocument(base, titolo);
      documento.lines = documento.lines.map((linea, indice) => {
        const voce = bozza.voci[indice];
        if (!voce.misure.length) return linea;
        const versioni = [...new Set(voce.misure.flatMap(m => m.dallaPianta ? [m.dallaPianta.versione] : []))];
        const baseMisure = `Totale da ${voce.misure.length} righe di misura${versioni.length ? ` collegate alla planimetria v${versioni.join(", v")}` : " del computo"}.`;
        const quantityBasis = `${baseMisure} Qualsiasi variazione è una rettifica da confermare.`.slice(0, 400);
        return { ...linea, quantityBasis, original: { ...linea.original, quantityBasis } };
      });
      return { base, documento, errore: null as string | null };
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
    const esistenti = new Set(seme.base.map(r => r.id));
    const assegnazioni = { ...capitoli };
    if (capitoloIniziale) {
      for (const linea of bozzaChat.lines) {
        if (!esistenti.has(linea.id)) assegnazioni[linea.id] ??= capitoloIniziale;
      }
    }
    const base = reconcileComputoDraft(seme.base, seme.documento, bozzaChat,
      { companyId, projectId: draftId, chapterMaxLength: MAX_NOME_CAPITOLO }, assegnazioni);
    const originali = new Map(bozza.voci.map(v => [v.id, v]));
    const modifiche = base.changes.map(cambio => {
      const voce = originali.get(cambio.id);
      if (!voce?.misure.length || !cambio.after) return cambio;
      if (voce.unita !== cambio.after.unit && !unitaCompatibili(voce.unita, cambio.after.unit)) {
        throw new Error(`Modifica l’unità di «${cambio.title}» nelle righe di misura del computo.`);
      }
      const prima = calcolaVoce(voce).quantita;
      if (prima === null && cambio.before?.quantity !== cambio.after.quantity) throw new Error("Completa le misure della voce prima di rettificarle.");
      const nuovo = cambio.after.quantity;
      if (prima === null || Math.abs(prima - nuovo) < 0.005) return cambio;
      rettificaQuantitaMisurata(voce, nuovo);
      return { ...cambio, nota: "Il nuovo totale entra come rettifica. Le misure originali restano nella voce." };
    });
    const daCompletare = { prezzo: new Set<string>(), quantita: new Set<string>() };
    const nuove = bozzaChat.lines.filter(l => !esistenti.has(l.id) && !l.supersededBy?.length && !l.included && l.title.trim());
    const righe = nuove.map((l, k): NativeComputoRow => {
      // Una voce a corpo vale 1: senza quantità restava «da completare» e fuori dal totale (padel, 30/10/2026).
      const quantita = quantitaProposta(l);
      const senzaQuantita = quantita == null;
      const capitolo = (assegnazioni[l.id] ?? suggestedComputoChapter(l.title)).trim();
      if (!capitolo || capitolo.length > MAX_NOME_CAPITOLO) throw new Error("Indica un capitolo valido per ogni voce.");
      if (l.price == null) daCompletare.prezzo.add(l.id);
      if (senzaQuantita) daCompletare.quantita.add(l.id);
      return {
        id: l.id, progetto_id: draftId, company_id: companyId,
        capitolo_nome: capitolo,
        descrizione: l.title, descrizione_estesa: l.description || null,
        unita_misura: (l.unit.trim() || "corpo") as NativeComputoRow["unita_misura"],
        quantita: quantita ?? 0, prezzo_unitario: l.price ?? 0, costo_materiali: 0, costo_manodopera: 0, sconto_pct: 0,
        importo: 0, margine_eur: 0, margine_pct: 0, listino_voce_id: null, ordine: base.rows.length + k,
        fonte: l.pricing?.basis ?? null,
      };
    });
    const cambi: WizardAiChange[] = nuove.map((l, k) => {
      const manca = [daCompletare.quantita.has(l.id) && "quantità", daCompletare.prezzo.has(l.id) && "prezzo"].filter(Boolean).join(" e ");
      return { id: l.id, title: manca ? t("{title} · {manca} da inserire nel computo", { title: String(l.title ?? ""), manca: String(manca ?? "") }) : l.title, chapter: righe[k].capitolo_nome, kind: "aggiunta",
        ...(manca ? {} : { after: { quantity: righe[k].quantita, unit: righe[k].unita_misura, price: righe[k].prezzo_unitario } }) };
    });
    return { rows: [...base.rows, ...righe], changes: [...modifiche, ...cambi], pending: 0, daCompletare,
      // Una voce che resta da completare non è un errore del riconciliatore: serve solo a dirlo nel riepilogo.
      incomplete: nuove.filter(l => !!chatLineIssue(l)).length };
  };
  const preparaAnteprima = (bozzaChat: ChatDocument, capitoli: Record<string, string>) => {
    try {
      const r = riconcilia(bozzaChat, capitoli);
      return { voci: vociDaRigheChat(r.rows, bozza.voci, r.changes, r.daCompletare, bozzaChat), modifiche: r.changes.length > 0 };
    } catch (e) {
      return { errore: (e as Error).message };
    }
  };

  const anteprima = (bozzaChat: ChatDocument, capitoli: Record<string, string>, visibile = true) => {
    const { voci, errore, modifiche } = preparaAnteprima(bozzaChat, capitoli);
    if (errore) return <p role="alert" className="p-3 text-sm text-orange-800">{errore}</p>;
    return <AnteprimaComputoSilvio renderPdf={renderPdf} chiave={chiavePdf} visibile={visibile}
      proposta={modifiche && voci ? { voci } : undefined} />;
  };
  const anteprimaCosti = (bozzaChat: ChatDocument, capitoli: Record<string, string>, controlli: ControlliCostiSilvio) => {
    const proposta = preparaAnteprima(bozzaChat, capitoli);
    return <Suspense fallback={<p role="status" className="p-4 text-sm">{t("Carico l’analisi costi…")}</p>}>
      <AnalisiCostiSilvio companyId={companyId} draftId={draftId} bozza={bozza} proposta={proposta.modifiche ? proposta.voci : undefined}
        puoModificare={modificaAnalisiCosti} {...controlli} />
    </Suspense>;
  };

  return <QuoteWizardAiDialog open={open} onOpenChange={onOpenChange} companyId={companyId} title={titolo} document={seme.documento} project={progetto}
    progettoOperativo={progettoOperativo} progettoCollegato={bozza.piantaOrigine}
    progettoInModifica={progettoInModifica} apriProgetto={apriProgetto}
    onAggiornaChatPreventivo={onAggiornaChatPreventivo} continuazione={continuazione} chiediChiusura={chiediChiusura}
    fingerprint={wizardDraftFingerprint(capitoloIniziale ? [righeCorrenti, companyId, draftId, capitoloIniziale] : [righeCorrenti, companyId, draftId])}
    commercial={{ draft: commerciale, defaultVat: aliquota, module: MODULO }} chapters chapterMaxLength={MAX_NOME_CAPITOLO}
    computo={Object.fromEntries(bozza.voci.map(voce => [voce.id, { capitolo: voce.capitolo, codice: voce.tariffa }]))}
    initialInput={capitoloIniziale ? `Aiutami a preparare le lavorazioni del capitolo «${capitoloIniziale}». Mantieni le voci già inserite e segnala le quantità e i prezzi da verificare.` : undefined}
    preview={anteprima} costPreview={mostraAnalisiCosti ? anteprimaCosti : undefined}
    costEditable={mostraAnalisiCosti && modificaAnalisiCosti}
    review={(bozzaChat, capitoli) => riconcilia(bozzaChat, capitoli)} listinoSourceId={QUOTE_LISTINO_SOURCES[MODULO].id} initialFile={fileIniziale}
    onApply={async (bozzaChat, capitoli) => {
      const r = riconcilia(bozzaChat, capitoli);
      const titoloChat = bozzaChat.title?.trim();
      onApply(vociDaRigheChat(await enrichComputoRowsFromListino(MODULO, r.rows), bozza.voci, r.changes, r.daCompletare, bozzaChat), titoloChat && titoloChat !== titolo ? titoloChat.slice(0, 160) : undefined);
    }} />;
}
