/**
 * useElettricoPDF — download/preview del PDF cliente del preventivo
 * Elettrico (Task 21).
 *
 * Pattern mutuato ESATTAMENTE da `useSerramentoPDF`:
 *  - dynamic import per code-split del vendor @react-pdf/renderer (~740 KB):
 *    caricato SOLO al click "Scarica/Anteprima PDF", non nel bundle del wizard.
 *  - pre-fetch/arricchimento dati PRIMA della generazione (template fresco,
 *    company, computo raggruppato per capitolo, immagini inlinate come data URL)
 *    così il componente PDF non dipende da fetch interne né da signed URL
 *    scaduti durante il render.
 *  - try/catch con toast di errore + flag `isGenerating`. ⚠️ ANTI-FAIL-SILENZIOSO:
 *    qualunque errore (dati vuoti, render fallito, popup bloccato) produce un
 *    messaggio chiaro all'utente; non "non succede nulla".
 *
 * Le immagini del modello (logo, copertina, chi siamo) stanno nel bucket pubblico
 * `company-photo-library`; foto e allegati del progetto nel bucket privato
 * `progetti-media`, e si firmano qui prima dell'uso. Tutte si inlineano a data URL
 * via `toDataUrl` perché react-pdf supporta solo JPG/PNG e alcune foto possono
 * essere WEBP: la conversione canvas le rende sicure per il renderer.
 */
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getEleTemplatePdf } from "@/hooks/useElettricoProgetto";
import { toDataUrl } from "@/lib/serramenti/pdfImageUtils";
import { immaginiDelModello } from "@/components/preventivi/pdf/immaginiDocumento";
import { eRiferimentoNudo, linkFileRiservati } from "@/lib/storage/fileRiservati";
import { calcTotaliComputo, type ComputoRigaInput } from "@/lib/elettrico/calcoli";
import { calcDetraibile } from "@/lib/preventivi/incentivi";
import type {
  EleProgetto, EleComputoVoce, EleProgettoMedia, EleTemplatePdf,
} from "@/types/elettrico";

// ─── Tipi pre-fetch arricchimento ───────────────────────────────────────────

export interface ElePdfCompany {
  name?: string | null;
  ragione_sociale?: string | null;
  indirizzo?: string | null;
  telefono?: string | null;
  email?: string | null;
  partita_iva?: string | null;
  website?: string | null;
  logo_url?: string | null;
  /** Kit del marchio (Brand & Azienda): colore e logo chiaro per i fondi scuri. */
  colore_marca?: string | null;
  logo_chiaro_url?: string | null;
}

/** Un capitolo del computo con le sue voci e il subtotale (LORDO, pre sconto globale). */
export interface ElePdfCapitolo {
  nome: string;
  voci: EleComputoVoce[];
  subtotale: number;
  costo: number;
}

/** Totali economici complessivi pronti per la stampa. */
export interface ElePdfTotali {
  imponibileLordo: number;
  scontoEur: number;
  imponibile: number;
  iva: number;
  ivaPct: number;
  totale: number;
  scontoPct: number;
  detrazionePct: number;
  detrazioneEur: number;
  costoTot: number;
  margineEur: number;
  marginePct: number;
  /** Il prezzo pieno è quello scritto a mano: il documento non mostra gli importi delle righe. */
  prezzoManuale?: boolean;
}

export interface ElePdfEnriched {
  progetto: EleProgetto;
  template: EleTemplatePdf;
  company: ElePdfCompany | null;
  capitoli: ElePdfCapitolo[];
  totali: ElePdfTotali;
  media: EleProgettoMedia[];
  computoOptions: ElePdfComputoOptions;
}

/** Opzioni di visualizzazione del computo nel PDF — scelte PER PREVENTIVO
 *  (nel preventivatore, step PDF), NON a livello di template. */
export interface ElePdfComputoOptions {
  /** dettagliato = ogni voce; sintetico = solo capitoli+totale; corpo = solo totale. */
  livello: "dettagliato" | "sintetico" | "corpo";
  mostraPrezzi: boolean;
  mostraQta: boolean;
  mostraSubtotali: boolean;
}
export const DEFAULT_COMPUTO_OPTIONS: ElePdfComputoOptions = {
  livello: "dettagliato",
  mostraPrezzi: true,
  mostraQta: true,
  mostraSubtotali: true,
};

export interface ElePdfPayload {
  progetto: EleProgetto;
  computo: EleComputoVoce[];
  media: EleProgettoMedia[];
  /** Se passato si riusa, altrimenti viene riletto fresco da Supabase. */
  template?: EleTemplatePdf | null;
  company?: ElePdfCompany | null;
  /** Come mostrare il computo nel PDF (default: dettagliato, tutto visibile). */
  pdfOptions?: ElePdfComputoOptions;
}

// ─── Helper concurrency (clone leggero da useSerramentoPDF) ──────────────────
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(concurrency, 1), Math.max(items.length, 1)) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        out[idx] = await mapper(items[idx], idx);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

// ─── Enrich ──────────────────────────────────────────────────────────────────
async function enrichForPdf(opts: ElePdfPayload): Promise<ElePdfEnriched> {
  const { progetto, computo, media } = opts;
  const companyId = progetto.company_id;

  // 1) Template: fresco da DB se non passato (riflette l'ultimo salvataggio).
  const template = opts.template ?? (await getEleTemplatePdf(companyId));

  // 2) Company (anagrafica per intestazione/contatti). Best-effort.
  let company: ElePdfCompany | null = opts.company ?? null;
  if (!company && companyId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("companies")
      .select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number, website, logo_url, brand_primary_color, brand_logo_dark_url")
      .eq("id", companyId)
      .maybeSingle();
    if (data) {
      const indirizzo = [
        data.legal_address,
        [data.legal_postal_code, data.legal_city].filter(Boolean).join(" "),
        data.legal_province,
      ].filter(Boolean).join(", ");
      company = {
        name: data.name,
        ragione_sociale: data.business_name ?? data.name,
        indirizzo: indirizzo || null,
        telefono: data.phone,
        email: data.email,
        partita_iva: data.vat_number,
        website: data.website,
        logo_url: data.logo_url,
        colore_marca: data.brand_primary_color ?? null,
        logo_chiaro_url: data.brand_logo_dark_url ?? null,
      };
    }
  }

  // 3) Raggruppa il computo per capitolo (ordine stabile: prima occorrenza).
  const capMap = new Map<string, ElePdfCapitolo>();
  const order: string[] = [];
  for (const v of [...computo].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))) {
    const nome = v.capitolo_nome?.trim() || "Generale";
    if (!capMap.has(nome)) {
      capMap.set(nome, { nome, voci: [], subtotale: 0, costo: 0 });
      order.push(nome);
    }
    const cap = capMap.get(nome)!;
    cap.voci.push(v);
  }
  // Subtotale + costo per capitolo via calcoli puri (coerente con StepEconomia).
  const capitoli = order.map((nome) => {
    const cap = capMap.get(nome)!;
    const righe: ComputoRigaInput[] = cap.voci.map((v) => ({
      capitolo_nome: nome,
      quantita: v.quantita,
      prezzo_unitario: v.prezzo_unitario,
      sconto_pct: v.sconto_pct,
      costo_materiali: v.costo_materiali,
      costo_manodopera: v.costo_manodopera,
    }));
    const t = calcTotaliComputo(righe, { sconto_pct: 0, iva_pct: 0 });
    return { ...cap, subtotale: t.imponibile, costo: t.costoTot };
  });

  // 4) Totali complessivi (single source of truth = calcTotaliComputo).
  const scontoPct = Number(progetto.sconto_pct) || 0;
  const ivaPct = Number(progetto.iva_pct ?? 10);
  const detrazionePct = Number(progetto.detrazione_pct) || 0;
  const allRows: ComputoRigaInput[] = computo.map((v) => ({
    capitolo_nome: v.capitolo_nome,
    quantita: v.quantita,
    prezzo_unitario: v.prezzo_unitario,
    sconto_pct: v.sconto_pct,
    costo_materiali: v.costo_materiali,
    costo_manodopera: v.costo_manodopera,
  }));
  const agg = calcTotaliComputo(allRows, {
    sconto_pct: scontoPct,
    iva_pct: ivaPct,
    // Il prezzo scritto a mano in Economia prende il posto della somma delle righe.
    prezzo_manuale: progetto.prezzo_manuale ?? null,
  });
  // Prezzo pieno prima dello sconto: la somma dei capitoli, o il prezzo scritto.
  const imponibileLordo = agg.imponibileLordo;
  const totali: ElePdfTotali = {
    imponibileLordo,
    scontoEur: imponibileLordo - agg.imponibile,
    imponibile: agg.imponibile,
    iva: agg.iva,
    ivaPct,
    totale: agg.totale,
    scontoPct,
    detrazionePct,
    // Come nello step Economia: la detrazione si calcola entro il massimale di
    // spesa, se c'è. Prima il PDF la prometteva su tutto l'imponibile.
    detrazioneEur: calcDetraibile(agg.imponibile, detrazionePct, progetto.massimale_detrazione ?? null),
    costoTot: agg.costoTot,
    margineEur: agg.margineEur,
    marginePct: agg.marginePct,
    prezzoManuale: agg.prezzoManuale,
  };

  // 5) Inline immagini critiche (logo template→company, cover, chi siamo) + media.
  const [inlinedLogo, inlinedChiSiamo, immaginiModello] = await Promise.all([
    toDataUrl(template.logo_url ?? company?.logo_url ?? null),
    toDataUrl(template.chi_siamo_foto_url ?? null),
    // Copertina (in tinta col colore dell'azienda), logo di copertina e galleria dei lavori.
    immaginiDelModello("elettrico", template as unknown as Record<string, unknown>, company?.logo_chiaro_url ?? null),
  ]);
  const inlinedTemplate = {
    ...template,
    ...immaginiModello,
    logo_url: inlinedLogo ?? template.logo_url,
    chi_siamo_foto_url: inlinedChiSiamo ?? template.chi_siamo_foto_url,
  } as EleTemplatePdf;
  const inlinedCompany: ElePdfCompany | null = company
    ? { ...company, logo_url: inlinedLogo ?? company.logo_url, logo_chiaro_url: (immaginiModello.logo_chiaro_url as string | null) ?? null }
    : null;

  // Inline le immagini media (escludi i PDF allegati: non vanno nel render).
  // Stanno nel bucket privato progetti-media: prima si firmano, con una sola
  // chiamata, poi si convertono. Una foto che non si riesce a firmare resta fuori.
  const imageMedia = [...media]
    .filter((m) => Boolean(m.url) && !/\.pdf($|\?)/i.test(m.url))
    .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
  const linkMedia = await linkFileRiservati(imageMedia.map((m) => m.url));
  const inlinedUrls = await mapWithConcurrency(imageMedia, 4, async (_m, i) => toDataUrl(linkMedia[i]));
  const inlinedMedia: EleProgettoMedia[] = imageMedia
    .map((m, i) => ({ ...m, url: inlinedUrls[i] ?? linkMedia[i] ?? "" }))
    .filter((m) => m.url && !eRiferimentoNudo(m.url));

  return {
    progetto,
    template: inlinedTemplate,
    company: inlinedCompany,
    capitoli,
    totali,
    media: inlinedMedia,
    computoOptions: opts.pdfOptions ?? DEFAULT_COMPUTO_OPTIONS,
  };
}

/**
 * Renderizza il PDF e ritorna un blob URL — per l'ANTEPRIMA LIVE in dialog (iframe).
 * Il chiamante è responsabile di revocare l'URL (URL.revokeObjectURL) quando cambia
 * o al unmount. Non apre tab né scarica: serve solo la sorgente per l'iframe.
 */
export async function renderElePreviewBlobUrl(opts: ElePdfPayload): Promise<string> {
  const enriched = await enrichForPdf(opts);
  const [{ pdf }, { ElettricoPDF }, React] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/elettrico/ElettricoPDF"),
    import("react"),
  ]);
  const element = React.createElement(ElettricoPDF, enriched);
  const blob = await pdf(element).toBlob();
  return URL.createObjectURL(blob);
}

// ─── Hook ──────────────────────────────────────────────────────────────────
function buildFilename(progetto: EleProgetto): string {
  const cliente = [progetto.cliente_nome, progetto.cliente_cognome].filter(Boolean).join("_") || "cliente";
  return `Preventivo-${progetto.code ?? "elettrico"}-${cliente}.pdf`;
}

export function useElettricoPDF() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadPDF = async (opts: ElePdfPayload): Promise<{ ok: boolean }> => {
    setIsGenerating(true);
    try {
      if (opts.computo.length === 0) {
        toast.error("Computo vuoto", {
          description: "Aggiungi almeno una voce nel computo prima di generare il PDF.",
        });
        return { ok: false };
      }
      const enriched = await enrichForPdf(opts);
      const [{ pdf }, { ElettricoPDF }, React] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/elettrico/ElettricoPDF"),
        import("react"),
      ]);
      const element = React.createElement(ElettricoPDF, enriched);
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = buildFilename(opts.progetto);
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoca differita: alcuni browser leggono il blob dopo il click async →
      // revoca immediata = download talvolta vuoto.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success("PDF scaricato", { description: filename });
      return { ok: true };
    } catch (err) {
      console.error("Errore generazione PDF elettrico:", err);
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore nella generazione del PDF", { description: msg });
      return { ok: false };
    } finally {
      setIsGenerating(false);
    }
  };

  const previewPDF = async (opts: ElePdfPayload): Promise<void> => {
    setIsGenerating(true);
    try {
      if (opts.computo.length === 0) {
        toast.error("Computo vuoto", {
          description: "Aggiungi almeno una voce nel computo prima di generare il PDF.",
        });
        return;
      }
      const enriched = await enrichForPdf(opts);
      const [{ pdf }, { ElettricoPDF }, React] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/elettrico/ElettricoPDF"),
        import("react"),
      ]);
      const element = React.createElement(ElettricoPDF, enriched);
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      const revoke = () => { try { URL.revokeObjectURL(url); } catch { /* noop */ } };
      window.setTimeout(revoke, 60_000);
      if (!win) {
        toast.success("PDF generato", {
          description: "Apertura bloccata dal browser.",
          action: { label: "Apri", onClick: () => window.open(url, "_blank") },
          duration: 10000,
        });
      }
    } catch (err) {
      console.error("Errore preview PDF elettrico:", err);
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore nella generazione del PDF", { description: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  return { downloadPDF, previewPDF, isGenerating };
}
