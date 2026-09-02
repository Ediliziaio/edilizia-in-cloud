/**
 * SerramentiTemplateEditor — editor del template PDF Preventivatore Serramenti.
 *
 * Usato dentro la tab "Template Moduli Vendita" della pagina
 * Impostazioni → Libreria Template Preventivi.
 *
 * Configura:
 *  - Branding (logo, anagrafica azienda, colore)
 *  - Esigenze tipiche / Soluzione (testi pre-compilati)
 *  - USP + Cosa è incluso + Prossimi passi
 *  - Recensioni clienti (compaiono nel PDF pagina 2)
 *  - Default cronoprogramma + anticipo + IVA + validità
 */
import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditorSafe as RichTextEditor } from "@/components/ui/rich-text-editor-safe";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Save, Plus, Trash2, Loader2, MessageCircle, Eye,
  Sparkles, ListChecks, Clock, Quote, Upload, Image as ImageIcon,
  Building2, Wand2, AlertTriangle, CheckCircle2,
} from "lucide-react";
// Lazy load dei 3 sub-editor pesanti.
// PERF: caricati on-demand quando la tab è attiva o il dialog si apre.
// Risparmio: ~50 KB nel chunk principale dell'editor.
const SerramentiTemplatePreviewDialog = lazy(() =>
  import("@/components/serramenti/SerramentiTemplatePreviewDialog")
    .then((m) => ({ default: m.SerramentiTemplatePreviewDialog })),
);
const SerramentiPagesOrderEditor = lazy(() =>
  import("@/components/serramenti/SerramentiPagesOrderEditor")
    .then((m) => ({ default: m.SerramentiPagesOrderEditor })),
);
const SerramentiConversionEditor = lazy(() =>
  import("@/components/serramenti/SerramentiConversionEditor")
    .then((m) => ({ default: m.SerramentiConversionEditor })),
);
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AiTemplateGenerator } from "@/components/preventivi/AiTemplateGenerator";
import type { AiTemplateDraft } from "@/components/preventivi/AiTemplateReviewDialog";
import { useCompanyAnagraficaForTemplate, inheritedPlaceholder } from "@/hooks/useCompanyAnagraficaForTemplate";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { ImportaCondizioniBar } from "@/components/quote-templates/ImportaCondizioniBar";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { SerramentiLivePreviewPanel } from "@/components/serramenti/SerramentiLivePreviewPanel";
import { useTemplatePdf, useUpsertTemplatePdf } from "@/lib/serramenti/queries";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";
import { MacroPagineDedicateManager } from "@/components/listino/MacroPagineDedicateManager";
import { FileText } from "lucide-react";
import type { SrTemplatePdfRow, SrEsigenza, SrSoluzioneItem, SrTestimonianza, SrPercorsoCliente, SrPercorsoFase, SrGaranzia } from "@/types/serramenti";
import { SR_PERCORSO_DEFAULT, SR_GARANZIE_DEFAULT, SR_FAQ_DEFAULT, SR_PERCHE_NOI_METRICHE_DEFAULT, type SrPercheNoiMetrica } from "@/types/serramenti";
import { blankTemplateForKind } from "@/types/quoteTemplate";
import type { QuoteTemplate } from "@/types/quoteTemplate";
import type { SharedLegalTemplateKind, SharedLegalTemplateOption } from "@/components/serramenti/SerramentiConversionEditor";
import {
  PRESET_ESIGENZE, PRESET_ESIGENZE_ALT, PRESET_ESIGENZE_FAMIGLIA,
  PRESET_SOLUZIONE, PRESET_SOLUZIONE_PREMIUM,
  PRESET_PERCHE_NOI, PRESET_PERCHE_NOI_ALT, PRESET_PERCHE_NOI_TRUST,
  PRESET_INCLUSO, PRESET_INCLUSO_PLUS,
  PRESET_PROSSIMI_PASSI, PRESET_PROSSIMI_PASSI_PREMIUM,
} from "@/lib/serramenti/presets";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
// M12 · Preset stili cover 1-click (front-end batches, no migration).
import { COVER_PRESETS, detectActiveCoverPreset } from "./coverPresets";
// M14 · Contrast WCAG check (testo vs sfondo cover)
import { contrastRatio, wcagLevel, suggestBestTextColor } from "@/lib/utils/contrast";
// M16 · Galleria immagini stock (Unsplash free) per cover
import { COVER_STOCK_IMAGES, COVER_STOCK_CATEGORIE, type CoverStockImage } from "./coverStockImages";
// M20 · Palette colore intelligente (brand variations + curate)
import { generateBrandPalette, CURATED_PALETTES } from "@/lib/utils/colorPalette";
import { GalleryLavoriEditor } from "@/components/shared/GalleryLavoriEditor";
import type { GalleryLavoroItem } from "@/types/gallery";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";

const DEFAULT_RENDER_DISCLAIMER =
  "Il render AI è una simulazione indicativa pensata per aiutare il cliente a immaginare il risultato estetico. Non sostituisce rilievo tecnico, schede prodotto e verifica di fattibilità: misure, materiali, colori e finiture definitive vengono confermati prima dell'ordine.";

// Campi personalizzati {placeholder} sostituiti nel PDF (vedi renderSubheroTemplate
// in SerramentoPDF.tsx). Devono restare allineati a quella mappa.
const SR_PLACEHOLDERS = [
  "cliente_nome", "cliente_cognome", "cliente_nome_completo",
  "cantiere_citta", "cantiere_provincia", "num_serramenti",
  "data_consegna_stimata", "tipo_intervento", "anno",
] as const;

/** Chip cliccabili che inseriscono un campo personalizzato nel campo collegato.
 *  Con `targetRef` inserisce al cursore; senza, appende in coda. Riutilizzabile
 *  su qualsiasi Textarea/Input dell'editor. */
function PlaceholderChips({
  value, onChange, targetRef, label = "Inserisci campo personalizzato (cliccabile):",
}: {
  value: string;
  onChange: (next: string) => void;
  targetRef?: { current: HTMLTextAreaElement | HTMLInputElement | null };
  label?: string;
}) {
  const insert = (name: string) => {
    const token = `{${name}}`;
    const el = targetRef?.current;
    const v = value ?? "";
    if (!el || el.selectionStart == null) { onChange(v + token); return; }
    const start = el.selectionStart ?? v.length;
    const end = el.selectionEnd ?? v.length;
    onChange(v.slice(0, start) + token + v.slice(end));
    requestAnimationFrame(() => {
      try { el.focus(); const pos = start + token.length; el.setSelectionRange(pos, pos); } catch { /* input non selezionabile */ }
    });
  };
  return (
    <div className="mt-1.5">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {SR_PLACEHOLDERS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => insert(n)}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 hover:bg-orange-50 hover:border-orange-300 text-slate-600 hover:text-orange-700 transition-colors"
          >
            {`{${n}}`}
          </button>
        ))}
      </div>
    </div>
  );
}

// Modello standard di condizioni contrattuali per serramentista (base editabile).
const CONDIZIONI_STANDARD_SERRAMENTI = [
  "1. OGGETTO — Il presente preventivo ha per oggetto la fornitura e posa in opera dei serramenti e accessori indicati, secondo quantità, materiali e finiture descritti nelle pagine precedenti.",
  "",
  "2. VALIDITÀ — L'offerta è valida per il periodo indicato in copertina. Trascorso tale termine, prezzi e disponibilità potranno essere riconfermati.",
  "",
  "3. PAGAMENTO — 30% di acconto alla firma del contratto, 60% all'avviso di merce pronta / inizio posa, saldo 10% alla consegna e collaudo. Modalità: bonifico bancario.",
  "",
  "4. TEMPI DI CONSEGNA — I tempi indicati sono stimati e decorrono dalla firma del contratto e dal versamento dell'acconto. Eventuali ritardi dei fornitori non imputabili all'azienda saranno comunicati tempestivamente.",
  "",
  "5. POSA IN OPERA — La posa è eseguita a regola d'arte secondo la norma UNI 11673. Salvo diversa indicazione sono escluse opere murarie, elettriche, da imbianchino e lo smaltimento di serramenti preesistenti oltre il primo.",
  "",
  "6. GARANZIA — 10 anni sul prodotto e 10 anni sulla posa. La garanzia non copre danni da uso improprio, mancata manutenzione o interventi di terzi.",
  "",
  "7. RECESSO — Ai sensi degli artt. 52 e segg. del D.Lgs. 206/2005 il cliente consumatore può recedere entro 14 giorni dalla conclusione del contratto, salvo le esclusioni previste per beni realizzati su misura.",
  "",
  "8. RESPONSABILITÀ — Misure e quote definitive sono confermate in fase di rilievo tecnico prima dell'ordine. L'azienda non risponde di difformità derivanti da misure fornite dal cliente.",
  "",
  "9. FORO COMPETENTE — Per ogni controversia è competente il Foro della sede legale dell'azienda, fatte salve le competenze inderogabili a tutela del consumatore.",
].join("\n");

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeSharedLegalTemplateBody(template: QuoteTemplate): string {
  const raw = String(
    template.body_html ??
      (template.kind === "condizioni" ? template.contractual_terms_text : template.legal_terms_text) ??
      "",
  );
  if (!raw.trim()) return "";

  return decodeHtmlEntities(raw)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function hasLegacyCopy(value: unknown, markers: string[]) {
  const text = JSON.stringify(value ?? "");
  return markers.some((marker) => text.includes(marker));
}

function isEmptyArray(value: unknown) {
  return Array.isArray(value) && value.length === 0;
}

type TemplateQualityLevel = "ok" | "warning" | "critical";

interface TemplateQualityItem {
  level: TemplateQualityLevel;
  title: string;
  detail: string;
  section?: string;
}

function plainText(value: unknown): string {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasReadableText(value: unknown, minLength = 8): boolean {
  return plainText(value).length >= minLength;
}

function isReviewDraft(value: unknown): boolean {
  return hasLegacyCopy(value, [
    "Cliente residenziale",
    "Cliente privato",
    "Cliente verificato",
    "Bozza",
    "Da completare",
    "testimonianza reale",
  ]);
}

function buildTemplateQualityItems(form: Partial<SrTemplatePdfRow>): TemplateQualityItem[] {
  const items: TemplateQualityItem[] = [];
  const esigenze = (form.esigenze_default ?? []) as SrEsigenza[];
  const soluzioni = (form.soluzione_default ?? []) as SrSoluzioneItem[];
  const percheNoi = (form.perche_noi_default ?? []) as string[];
  const incluso = (form.incluso_default ?? []) as string[];
  const prossimiPassi = (form.prossimi_passi_default ?? []) as string[];
  const recensioni = (form.testimonianze_default ?? []) as SrTestimonianza[];
  const percorso = (form.percorso_cliente as SrPercorsoCliente | null) ?? null;
  const garanzie = (form.garanzie ?? SR_GARANZIE_DEFAULT) as SrGaranzia[];
  const faq = (form.faq_items ?? SR_FAQ_DEFAULT) as NonNullable<SrTemplatePdfRow["faq_items"]>;
  const ctaPassi = (form.pdf_cta_finale_passi ?? []) as string[];

  if (!hasReadableText(form.ragione_sociale, 3)) {
    items.push({
      level: "warning",
      title: "Ragione sociale mancante",
      detail: "Aggiungi il nome azienda: rende il PDF più riconoscibile e professionale.",
      section: "Brand",
    });
  }
  if (!hasReadableText(form.telefono, 6) && !hasReadableText(form.email, 6)) {
    items.push({
      level: "warning",
      title: "Contatto aziendale assente",
      detail: "Inserisci almeno telefono o email, così il cliente sa come procedere dopo il preventivo.",
      section: "Brand",
    });
  }
  if (esigenze.filter((e) => hasReadableText(e.titolo) && hasReadableText(e.descrizione, 16)).length < 3) {
    items.push({
      level: "critical",
      title: "Proposta cliente poco completa",
      detail: "Servono almeno 3 esigenze con descrizione concreta per spiegare il problema che stai risolvendo.",
      section: "Contenuti",
    });
  }
  if (soluzioni.filter((s) => hasReadableText(s.titolo) && hasReadableText(s.descrizione, 16)).length < 3) {
    items.push({
      level: "critical",
      title: "Soluzione tecnica da completare",
      detail: "Aggiungi almeno 3 punti chiari su prodotto, posa e vantaggi della soluzione proposta.",
      section: "Contenuti",
    });
  }
  if (percheNoi.filter((v) => hasReadableText(v, 12)).length < 3) {
    items.push({
      level: "warning",
      title: "Perché scegliere voi debole",
      detail: "Inserisci almeno 3 motivi verificabili, evitando numeri non dimostrabili.",
      section: "Contenuti",
    });
  }
  if (incluso.filter((v) => hasReadableText(v, 10)).length < 4) {
    items.push({
      level: "warning",
      title: "Incluso nel preventivo troppo corto",
      detail: "Elenca almeno 4 voci incluse: rilievo, posa, assistenza, documenti o gestione cantiere.",
      section: "Contenuti",
    });
  }
  if (form.chi_siamo_attivo && (!hasReadableText(form.chi_siamo_titolo, 8) || !hasReadableText(form.chi_siamo_testo, 80))) {
    items.push({
      level: "critical",
      title: "Pagina Chi siamo attiva ma incompleta",
      detail: "Completa titolo e descrizione azienda oppure disattiva la pagina.",
      section: "Chi siamo",
    });
  }
  if (form.recensioni_attivo !== false && recensioni.length === 0) {
    items.push({
      level: "warning",
      title: "Recensioni assenti",
      detail: "Va bene così se non hai testimonianze reali. Evita recensioni inventate: puoi nascondere la pagina.",
      section: "Recensioni",
    });
  }
  if (recensioni.length > 0 && recensioni.some((r) => !hasReadableText(r.quote, 35) || !hasReadableText(r.autore, 2) || isReviewDraft(r))) {
    items.push({
      level: "critical",
      title: "Recensioni da verificare",
      detail: "Una o più recensioni sembrano bozze o mancano di autore/testo reale. Sistemarle prima di inviare il PDF.",
      section: "Recensioni",
    });
  }
  if (!percorso?.attivo || !hasReadableText(percorso?.titolo, 8) || (percorso?.fasi ?? []).filter((f) => hasReadableText(f.nome, 3) && f.step.some((s) => hasReadableText(s, 8))).length < 4) {
    items.push({
      level: "warning",
      title: "Percorso cliente da rifinire",
      detail: "Mantieni 4 fasi con step pratici: analisi, rilievo, conferma, posa/collaudo.",
      section: "Percorso",
    });
  }
  if (garanzie.filter((g) => hasReadableText(g.titolo, 5) && hasReadableText(g.descrizione, 30)).length < 4) {
    items.push({
      level: "warning",
      title: "Garanzie troppo deboli",
      detail: "Servono almeno 4 garanzie concrete: prodotto, rilievo, posa, assistenza o documenti finali.",
      section: "Garanzie",
    });
  }
  if (faq.filter((f) => hasReadableText(f.domanda, 10) && hasReadableText(f.risposta, 35)).length < 4) {
    items.push({
      level: "warning",
      title: "FAQ poco utili",
      detail: "Aggiungi almeno 4 obiezioni reali: prezzo, tempi, misure, posa, render, pagamento.",
      section: "FAQ",
    });
  }
  if (!hasReadableText(form.render_disclaimer, 60)) {
    items.push({
      level: "critical",
      title: "Disclaimer render mancante",
      detail: "Il render AI deve essere chiaramente indicato come simulazione non vincolante.",
      section: "Render",
    });
  }
  if (prossimiPassi.filter((v) => hasReadableText(v, 8)).length < 3 && ctaPassi.filter((v) => hasReadableText(v, 8)).length < 3) {
    items.push({
      level: "warning",
      title: "Prossimi passi poco chiari",
      detail: "Indica cosa deve fare il cliente dopo il preventivo: dubbi, conferma, firma, acconto, ordine.",
      section: "CTA finale",
    });
  }

  if (items.length === 0) {
    items.push({
      level: "ok",
      title: "Template pronto",
      detail: "I contenuti principali sono completi e non risultano bozze evidenti.",
    });
  }

  return items;
}

function normalizeSerramentiTemplateCopy(template: Partial<SrTemplatePdfRow>): {
  next: Partial<SrTemplatePdfRow>;
  changed: boolean;
} {
  const next: Partial<SrTemplatePdfRow> = { ...template };
  let changed = false;

  const replace = <K extends keyof SrTemplatePdfRow>(key: K, value: SrTemplatePdfRow[K]) => {
    next[key] = value;
    changed = true;
  };

  if (isEmptyArray(next.esigenze_default) || hasLegacyCopy(next.esigenze_default, ["Già a ottobre", "ringiovaniscono la facciata di 15 anni"])) {
    replace("esigenze_default", PRESET_ESIGENZE as SrTemplatePdfRow["esigenze_default"]);
  }
  if (isEmptyArray(next.soluzione_default) || hasLegacyCopy(next.soluzione_default, ["Niente cataloghi standard", "Il 60% dei problemi"])) {
    replace("soluzione_default", PRESET_SOLUZIONE as SrTemplatePdfRow["soluzione_default"]);
  }
  if (isEmptyArray(next.perche_noi_default) || hasLegacyCopy(next.perche_noi_default, ["1.200 finestre", "[N] stelle", "non muovi un dito"])) {
    replace("perche_noi_default", PRESET_PERCHE_NOI as SrTemplatePdfRow["perche_noi_default"]);
  }
  if (isEmptyArray(next.incluso_default) || hasLegacyCopy(next.incluso_default, ["zero infiltrazioni", "ENEA entro 90 giorni", "mai subappaltata"])) {
    replace("incluso_default", PRESET_INCLUSO as SrTemplatePdfRow["incluso_default"]);
  }
  if (isEmptyArray(next.prossimi_passi_default) || hasLegacyCopy(next.prossimi_passi_default, ["Ti chiamiamo per fissare", "Firmi solo se sei convinto"])) {
    replace("prossimi_passi_default", PRESET_PROSSIMI_PASSI as SrTemplatePdfRow["prossimi_passi_default"]);
  }
  if (!next.percorso_cliente || hasLegacyCopy(next.percorso_cliente, ["Chiamata conoscitiva", "Ricerca prodotto", "Pratica ENEA"])) {
    replace("percorso_cliente", SR_PERCORSO_DEFAULT as SrTemplatePdfRow["percorso_cliente"]);
  }
  if (isEmptyArray(next.garanzie) || hasLegacyCopy(next.garanzie, ["Garanzia prodotto chiara", "Tempi condivisi in anticipo"])) {
    replace("garanzie", SR_GARANZIE_DEFAULT as SrTemplatePdfRow["garanzie"]);
  }
  if (isEmptyArray(next.faq_items) || hasLegacyCopy(next.faq_items, ["E se piove durante la posa?", "Devo lasciarvi le chiavi?"])) {
    replace("faq_items", SR_FAQ_DEFAULT as SrTemplatePdfRow["faq_items"]);
  }
  if (hasLegacyCopy(next.testimonianze_default, ["Andrea e Silvia M.", "Marco e Chiara G.", "Roberto P.", "Famiglia Rossi", "Ing. Lorenzo T."])) {
    replace("testimonianze_default", [] as SrTemplatePdfRow["testimonianze_default"]);
  }
  if (!next.render_disclaimer) {
    replace("render_disclaimer", DEFAULT_RENDER_DISCLAIMER as SrTemplatePdfRow["render_disclaimer"]);
  }

  return { next, changed };
}

interface SerramentiTemplateEditorProps {
  /** Se true, nasconde lo sticky bottom save (usato dentro Tabs con bottone proprio) */
  embedded?: boolean;
}

export function SerramentiTemplateEditor({ embedded: _embedded = false }: SerramentiTemplateEditorProps) {
  const { data: template, isLoading } = useTemplatePdf();
  const upsertMut = useUpsertTemplatePdf();
  const { templates: quoteTemplates, upsertTemplate: upsertQuoteTemplate } = useQuoteTemplates();
  // Dati ereditati dal Profilo azienda → placeholder anagrafica (UX allineata).
  const companyAnagrafica = useCompanyAnagraficaForTemplate();
  // Usato dagli upload handler: punta all'azienda impersonata se super_admin.
  const companyId = useEffectiveCompanyId();
  // Logo "versione chiara" (per copertine su sfondo scuro) ora si gestisce in
  // Brand & Azienda: la copertina lo eredita, non lo carica più qui.
  const { brand } = useBrandSettings(companyId ?? undefined);

  const [form, setForm] = useState<Partial<SrTemplatePdfRow>>({});
  const [dirty, setDirty] = useState(false);
  // Preset stili copertina: collassati di default (occupavano troppo spazio in cima).
  const [showPresets, setShowPresets] = useState(false);
  // Chiudere/ricaricare la scheda con modifiche non salvate ora chiede conferma
  // (il salvataggio qui è solo manuale: prima si perdeva tutto in silenzio).
  useBeforeUnload(dirty);
  const [delTestIdx, setDelTestIdx] = useState<number | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingChiSiamo, setUploadingChiSiamo] = useState(false);
  const chiSiamoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingCoverLogo, setUploadingCoverLogo] = useState(false);
  const coverLogoInputRef = useRef<HTMLInputElement | null>(null);
  // Anteprima PDF live: il bottone "Anteprima PDF" apre un dialog con il
  // template renderizzato + dati cliente demo. Aggiornamento auto su edit
  // (debounced 300ms) — vedi SerramentiTemplatePreviewDialog.
  const [previewOpen, setPreviewOpen] = useState(false);
  const qualityItems = useMemo(() => buildTemplateQualityItems(form), [form]);
  const qualityCriticalCount = qualityItems.filter((item) => item.level === "critical").length;
  const qualityWarningCount = qualityItems.filter((item) => item.level === "warning").length;
  const sharedLegalTemplates = useMemo<SharedLegalTemplateOption[]>(() => {
    return quoteTemplates
      .filter((template) => template.is_active !== false && (template.kind === "condizioni" || template.kind === "legali"))
      .map((template) => ({
        id: template.id,
        kind: template.kind as SharedLegalTemplateKind,
        name: template.name,
        body: normalizeSharedLegalTemplateBody(template),
      }))
      .filter((template) => template.body.length > 0);
  }, [quoteTemplates]);

  useEffect(() => {
    if (template) {
      const normalized = normalizeSerramentiTemplateCopy(template);
      setForm(normalized.next);
      setDirty(normalized.changed);
      // Reset UID delle bullet list: dopo "Scarta modifiche" / reload
      // dal server, le posizioni degli item potrebbero non coincidere
      // piu' con gli UID accumulati -> rebuild lazy al prossimo render.
      listUidsRef.current = {};
    } else if (!isLoading) {
      setForm({
        colore_primario: "#2D7D5C",
        esigenze_default: PRESET_ESIGENZE,
        soluzione_default: PRESET_SOLUZIONE,
        perche_noi_default: PRESET_PERCHE_NOI,
        incluso_default: PRESET_INCLUSO,
        prossimi_passi_default: PRESET_PROSSIMI_PASSI,
        testimonianze_default: [],
        percorso_cliente: SR_PERCORSO_DEFAULT,
        garanzie: SR_GARANZIE_DEFAULT,
        faq_items: SR_FAQ_DEFAULT,
        render_disclaimer: DEFAULT_RENDER_DISCLAIMER,
        iva_percentuale_default: 22,
        anticipo_pct_default: 40,
        valido_giorni_default: 15,
        crono_giorni_produzione_default: 30,
        crono_giorni_posa_per_pezzo_default: 0.8,
        crono_giorni_collaudo_default: 1,
      });
    }
  }, [template, isLoading]);

  // PERF: useCallback stabilizza l'identity di `update` tra i re-render.
  // Senza, ogni keystroke creava una nuova function reference → i sub-editor
  // memoizzati (ConversionEditor, PagesOrderEditor) si re-renderizzavano
  // comunque perché la prop cambiava. Con useCallback (deps vuote, setState
  // funzionale + setDirty sono entrambi stabili) la reference è permanente.
  const update = useCallback(<K extends keyof SrTemplatePdfRow>(key: K, value: SrTemplatePdfRow[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  // Mappa il draft AI (13 campi generici) sui campi del template Serramenti.
  const applyGeneratedSr = useCallback((d: AiTemplateDraft) => {
    const toText = (h?: string | null) => (h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (d.cover_title) update("pdf_cover_hero", d.cover_title);
    if (d.chi_siamo) update("chi_siamo_testo", toText(d.chi_siamo));
    if (d.esigenze?.length) update("esigenze_default", d.esigenze.map((i) => ({ titolo: i.titolo, descrizione: i.descrizione ?? "" })));
    if (d.soluzione?.length) update("soluzione_default", d.soluzione.map((i) => ({ titolo: i.titolo, descrizione: i.descrizione ?? "" })));
    if (d.usp?.length) update("perche_noi_default", d.usp.map((i) => (i.descrizione ? `${i.titolo}: ${i.descrizione}` : i.titolo)));
    if (d.garanzie?.length) update("garanzie", d.garanzie.map((g) => ({ icona: "shield" as const, titolo: g.titolo, descrizione: g.descrizione ?? "" })));
    if (d.faq?.length) update("faq_items", d.faq.map((f) => ({ domanda: f.domanda, risposta: f.risposta })));
  }, [update]);

  const applySharedLegalTemplate = useCallback((templateId: string, mode: "replace" | "append") => {
    const templateToApply = sharedLegalTemplates.find((templateOption) => templateOption.id === templateId);
    if (!templateToApply) {
      toast.error("Template non disponibile", {
        description: "Il blocco scelto non è più presente nella libreria Template offerte.",
      });
      return;
    }

    setForm((prev) => {
      const current = String(prev.condizioni_legali_testo ?? "").trim();
      const nextText = mode === "append" && current
        ? `${current}\n\n${templateToApply.body}`
        : templateToApply.body;
      return {
        ...prev,
        condizioni_legali_attivo: true,
        condizioni_legali_testo: nextText,
      };
    });
    setDirty(true);
    toast.success(
      mode === "append" ? "Blocco aggiunto alle condizioni serramenti" : "Condizioni serramenti aggiornate",
      { description: templateToApply.name },
    );
  }, [sharedLegalTemplates]);

  const saveSharedLegalTemplate = useCallback(async (kind: SharedLegalTemplateKind) => {
    const text = String(form.condizioni_legali_testo ?? "").trim();
    if (!text) {
      toast.error("Inserisci prima un testo da salvare");
      return;
    }

    const base = blankTemplateForKind(kind);
    await upsertQuoteTemplate.mutateAsync({
      ...base,
      kind,
      name: kind === "condizioni" ? "Condizioni e termini legali serramenti" : "Termini legali serramenti",
      description: "Creato dal template preventivo serramenti.",
      body_html: text,
      body_format: "plain",
      is_default: false,
      is_active: true,
    });
    toast.success(kind === "condizioni" ? "Salvato nei Template offerte (Condizioni e termini legali)" : "Termini legali salvati nei Template offerte", {
      description: "Ora il blocco è riutilizzabile anche nei preventivi standard.",
    });
  }, [form.condizioni_legali_testo, upsertQuoteTemplate]);

  // UID stabili per le bullet/object list dei renderListEditor /
  // renderBulletObjectEditor. Prima usavano key={idx} -> rimuovendo una
  // bullet centrale gli input "scivolavano" coi valori del posto
  // precedente (perdita focus + valori sbagliati). Con UID stabili ogni
  // riga conserva identita' React indipendentemente da add/remove.
  // L'array UID viene tenuto in sync via pushListItemUid/removeListItemUid.
  const listUidsRef = useRef<Record<string, string[]>>({});
  const ensureListItemUids = useCallback((listKey: string, length: number) => {
    const uids = listUidsRef.current[listKey] ?? [];
    while (uids.length < length) {
      uids.push(`li-${Math.random().toString(36).slice(2, 10)}`);
    }
    listUidsRef.current[listKey] = uids;
    return uids;
  }, []);
  const getListItemUid = useCallback((listKey: string, idx: number, currentLength: number): string => {
    const uids = ensureListItemUids(listKey, currentLength);
    return uids[idx] ?? `li-fallback-${idx}`;
  }, [ensureListItemUids]);
  const removeListItemUid = useCallback((listKey: string, idx: number) => {
    const uids = listUidsRef.current[listKey];
    if (!uids) return;
    uids.splice(idx, 1);
  }, []);
  const pushListItemUid = useCallback((listKey: string) => {
    const uids = listUidsRef.current[listKey] ?? [];
    uids.push(`li-${Math.random().toString(36).slice(2, 10)}`);
    listUidsRef.current[listKey] = uids;
  }, []);

  const handleSave = () => {
    upsertMut.mutate(form, {
      onSuccess: () => setDirty(false),
    });
  };

  // ─── M12 · Applica preset cover ────────────────────────────────────────
  // Setta in batch tutti i campi pdf_cover_* del preset selezionato.
  // L'immagine sfondo NON viene toccata (è un asset uploadato).
  const applyCoverPreset = useCallback((presetId: string) => {
    const preset = COVER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setForm((prev) => ({ ...prev, ...preset.patch }));
    setDirty(true);
  }, []);

  // Detection live del preset attivo (per evidenziare la card selezionata).
  // Restituisce null se l'utente ha customizzato fuori dai preset.
  const activeCoverPresetId = useMemo(() => detectActiveCoverPreset(form), [form]);

  // ─── REFACTOR · Sidebar navigation sezioni ─────────────────────────────
  // Trasforma il "mappazzone" verticale in un layout app-like:
  // sidebar a sinistra + content panel a destra. Una sezione visibile alla
  // volta — niente più scroll infinito.
  //
  // Deeplink via URL `?section=brand|contenuti|macro|pagine|garanzie|default`.
  // Default 'brand' alla prima apertura.
  type EditorSection =
    | "brand"
    // Sub-sezioni delle "Pagine PDF" — corrispondono 1:1 ai value della
    // <Tabs value={...}> interna alla card "Personalizzazione PDF preventivo".
    // L'utente le vede flat nella sidebar invece di annidate nelle tab.
    | "page_cover"
    | "page_chi_siamo"
    | "page_percorso"
    | "page_consulente"
    | "page_recensioni"
    | "page_render"
    | "page_cta"
    | "page_conversione"
    | "page_ordine"
    | "contenuti" | "macro" | "garanzie" | "default" | "condizioni";

  // Sezioni raggruppate per UX: la sidebar mostra 3 gruppi con header,
  // le voci della famiglia "Pagine PDF" sono ora top-level (no più tab interne).
  const SECTION_GROUPS: Array<{
    label: string;
    items: Array<{ id: EditorSection; label: string; emoji: string; descr?: string }>;
  }> = [
    {
      label: "Azienda",
      items: [
        { id: "brand", label: "Brand & azienda", emoji: "🏢", descr: "Logo, colori, anagrafica" },
      ],
    },
    {
      label: "Pagine del PDF",
      items: [
        { id: "page_cover",       label: "Cover",           emoji: "🖼️", descr: "Prima pagina del preventivo" },
        { id: "page_chi_siamo",   label: "Chi siamo",       emoji: "👋", descr: "Presentazione azienda" },
        { id: "page_percorso",    label: "Il tuo percorso", emoji: "🗺️", descr: "Fasi e step cliente" },
        { id: "page_consulente",  label: "Consulente",      emoji: "👤", descr: "Dati commerciale" },
        { id: "page_recensioni",  label: "Recensioni",      emoji: "⭐", descr: "Testimonianze cliente" },
        { id: "page_render",      label: "Render AI",       emoji: "🪄", descr: "Prima/dopo + disclaimer" },
        { id: "page_cta",         label: "CTA finale",      emoji: "✅", descr: "Prossimi passi" },
        { id: "page_conversione", label: "Conversione",     emoji: "⚡", descr: "Urgenza, garanzie, bonus" },
        { id: "page_ordine",      label: "Ordine pagine",   emoji: "📋", descr: "Drag-drop riordino" },
      ],
    },
    {
      label: "Dati & contenuti",
      items: [
        { id: "contenuti", label: "Contenuti commerciali", emoji: "📝", descr: "Esigenze, USP, incluso" },
        { id: "macro",     label: "Linee prodotto",        emoji: "📦", descr: "Pagine dedicate macrocategoria" },
        { id: "garanzie",  label: "Metriche & perché noi",  emoji: "📊", descr: "Numeri e USP della pagina proposta" },
        { id: "condizioni", label: "Condizioni contrattuali", emoji: "📜", descr: "Termini di vendita nel PDF" },
        { id: "default",   label: "Default tecnici",       emoji: "⚙️", descr: "IVA, anticipo, validità" },
      ],
    },
  ];
  // Flat list per lookup veloce (label/emoji nei breadcrumb, ecc.)
  const SECTIONS = SECTION_GROUPS.flatMap((g) => g.items);
  // Map sezione "page_*" → value Tabs interna (per controllo programmatico)
  const sectionToPdfTab = (s: EditorSection): string | null => {
    if (!s.startsWith("page_")) return null;
    return s.replace(/^page_/, "").replace("chi_siamo", "chi-siamo").replace("ordine", "ordine-pagine");
  };
  const isPageSection = (s: EditorSection) => s.startsWith("page_");
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionFromUrl = (searchParams.get("section") ?? "brand") as EditorSection;
  const activeSection: EditorSection = SECTIONS.some((s) => s.id === sectionFromUrl)
    ? sectionFromUrl
    : ("brand" as EditorSection);
  const setActiveSection = (id: EditorSection) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("section", id);
      return next;
    }, { replace: true });
    // NB: nessuno scroll-to-top al cambio sezione — si resta nella posizione di
    // scroll corrente (richiesta utente: "torno in alto non va bene").
  };
  // Mobile sidebar drawer open state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ─── M16 · Stock images dialog state ───────────────────────────────────
  // Dialog modale per scegliere fra le 18 immagini Unsplash. Categoria
  // filtrabile, click → setta pdf_cover_image_url con URL Unsplash.
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockCategory, setStockCategory] = useState<CoverStockImage["categoria"] | "all">("all");
  const stockFiltered = useMemo(
    () => stockCategory === "all"
      ? COVER_STOCK_IMAGES
      : COVER_STOCK_IMAGES.filter((img) => img.categoria === stockCategory),
    [stockCategory],
  );
  const applyStockImage = useCallback((img: CoverStockImage) => {
    setForm((prev) => ({ ...prev, pdf_cover_image_url: img.url }));
    setDirty(true);
    setStockDialogOpen(false);
    toast.success(`Immagine "${img.label}" impostata`);
  }, []);

  // ─── Logo upload ──────────────────────────────────────────────────────────
  const handleLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File troppo grande (max 5 MB)");
      return;
    }
    setUploadingLogo(true);
    try {
      if (!companyId) throw new Error("Profilo senza azienda");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "png";
      const storagePath = `${companyId}/template-logos/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("sr-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("sr-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const logoUrl = signed?.signedUrl ?? "";

      update("logo_url", logoUrl);
      toast.success("Logo caricato. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] logo upload", e);
      toast.error("Errore upload logo", { description: String(e) });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  /**
   * Upload diretto foto "Chi siamo" — riusa lo stesso pattern del logo
   * (bucket sr-progetti, signed URL 1 anno). Salva in chi_siamo_foto_url.
   */
  const handleChiSiamoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File troppo grande (max 8 MB)");
      return;
    }
    setUploadingChiSiamo(true);
    try {
      if (!companyId) throw new Error("Profilo senza azienda");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
      const storagePath = `${companyId}/template-chi-siamo/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("sr-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("sr-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? "";

      update("chi_siamo_foto_url", url);
      toast.success("Foto azienda caricata. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] chi-siamo upload", e);
      toast.error("Errore upload foto", { description: String(e) });
    } finally {
      setUploadingChiSiamo(false);
      if (chiSiamoInputRef.current) chiSiamoInputRef.current.value = "";
    }
  };

  /** Upload foto opzionale di una recensione. Stesso pattern (bucket sr-progetti +
   *  signed URL 1 anno). Salva in testimonianze_default[idx].foto_url. */
  const [uploadingTestFoto, setUploadingTestFoto] = useState<number | null>(null);
  const [selectedSharedLegalId, setSelectedSharedLegalId] = useState("");
  const handleTestimonianzaFotoUpload = async (idx: number, file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Carica un file immagine (PNG, JPG, WebP)"); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error("File troppo grande (max 8 MB)"); return; }
    setUploadingTestFoto(idx);
    try {
      if (!companyId) throw new Error("Profilo senza azienda");
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
      const storagePath = `${companyId}/template-recensioni/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("sr-progetti").upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);
      const { data: signed } = await supabase.storage
        .from("sr-progetti").createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      updateTestimonianza(idx, "foto_url", signed?.signedUrl ?? "");
      toast.success("Foto recensione caricata. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] testimonianza foto upload", e);
      toast.error("Errore upload foto", { description: String(e) });
    } finally {
      setUploadingTestFoto(null);
    }
  };

  /**
   * Upload immagine di sfondo cover (pagina 1 del PDF).
   * Stesso pattern logo/chi-siamo: bucket sr-progetti + signed URL 1 anno.
   */
  const handleCoverUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File troppo grande (max 8 MB)");
      return;
    }
    setUploadingCover(true);
    try {
      if (!companyId) throw new Error("Profilo senza azienda");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "jpg";
      const storagePath = `${companyId}/template-cover/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("sr-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("sr-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const url = signed?.signedUrl ?? "";

      update("pdf_cover_image_url", url);
      toast.success("Immagine cover caricata. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] cover upload", e);
      toast.error("Errore upload cover", { description: String(e) });
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleCoverLogoUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Carica un file immagine (PNG, JPG, WebP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File troppo grande (max 5 MB)");
      return;
    }
    setUploadingCoverLogo(true);
    try {
      if (!companyId) throw new Error("Profilo senza azienda");

      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "png";
      const storagePath = `${companyId}/template-cover-logos/${crypto.randomUUID()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("sr-progetti")
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadErr) throw new Error(`Upload fallito: ${uploadErr.message}`);

      const { data: signed } = await supabase.storage
        .from("sr-progetti")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365);
      const logoUrl = signed?.signedUrl ?? "";

      update("pdf_cover_logo_url", logoUrl);
      toast.success("Logo copertina caricato. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] cover logo upload", e);
      toast.error("Errore upload logo copertina", { description: String(e) });
    } finally {
      setUploadingCoverLogo(false);
      if (coverLogoInputRef.current) coverLogoInputRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  // ─── Preset Dropdown helper ──────────────────────────────────────────────
  // Mostra un menu "Applica template" con N varianti. Avverte se sovrascrive.
  const PresetMenu = <T,>({
    label,
    presets,
    currentValue,
    onApply,
  }: {
    label: string;
    presets: { label: string; value: T }[];
    currentValue: T;
    onApply: (v: T) => void;
  }) => {
    const hasContent = Array.isArray(currentValue) && (currentValue as unknown as unknown[]).length > 0;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1 border-orange-300 text-orange-600 hover:bg-orange-50">
            <Wand2 className="h-3.5 w-3.5" />
            {label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs">Scegli un template</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {presets.map((p, i) => (
            <DropdownMenuItem
              key={i}
              className="cursor-pointer text-xs"
              onClick={() => {
                if (hasContent && !confirm(`Sovrascrivere il contenuto attuale con il template "${p.label}"?`)) return;
                onApply(p.value);
                toast.success(`Template "${p.label}" applicato`);
              }}
            >
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // ─── Testimonianze ────────────────────────────────────────────────────────

  const testimonianze = (form.testimonianze_default ?? []) as SrTestimonianza[];

  const addTestimonianza = () => {
    update("testimonianze_default", [
      ...testimonianze,
      { quote: "", autore: "", citta: "", intervento: "" } as SrTestimonianza,
    ]);
  };

  const updateTestimonianza = (idx: number, field: keyof SrTestimonianza, value: string) => {
    const next = [...testimonianze];
    next[idx] = { ...next[idx], [field]: value };
    update("testimonianze_default", next);
  };

  const removeTestimonianza = (idx: number) => {
    const next = testimonianze.filter((_, i) => i !== idx);
    update("testimonianze_default", next);
    setDelTestIdx(null);
  };

  // ─── Helpers liste e oggetti ──────────────────────────────────────────────

  const renderListEditor = (
    label: string,
    key: "perche_noi_default" | "incluso_default" | "prossimi_passi_default",
    placeholder: string,
  ) => {
    const items = ((form[key] as string[]) ?? []);
    const updateItem = (idx: number, value: string) => {
      const next = [...items];
      while (next.length <= idx) next.push("");
      next[idx] = value;
      update(key, next);
    };
    const removeItem = (idx: number) => {
      removeListItemUid(key, idx);
      update(key, items.filter((_, i) => i !== idx));
    };
    const addItem = () => {
      pushListItemUid(key);
      update(key, [...items, ""]);
    };
    return (
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={getListItemUid(key, idx, items.length)} className="flex items-start gap-2">
            <span className="h-7 w-7 mt-1 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold shrink-0">
              {idx + 1}
            </span>
            <Input
              value={item}
              onChange={(e) => updateItem(idx, e.target.value)}
              placeholder={placeholder}
              className="h-9 text-xs flex-1"
            />
            <Button size="icon" variant="ghost" onClick={() => removeItem(idx)} className="h-9 w-9 shrink-0">
              <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            </Button>
          </div>
        ))}
        <Button onClick={addItem} variant="outline" size="sm" className="w-full border-dashed gap-1">
          <Plus className="h-3.5 w-3.5" /> Aggiungi {label.toLowerCase()}
        </Button>
      </div>
    );
  };

  const renderBulletObjectEditor = (
    label: string,
    key: "esigenze_default" | "soluzione_default",
  ) => {
    const items = ((form[key] as Array<SrEsigenza | SrSoluzioneItem>) ?? []);
    const updateItem = (idx: number, field: "titolo" | "descrizione", value: string) => {
      const next = [...items];
      while (next.length <= idx) next.push({ titolo: "", descrizione: "" });
      next[idx] = { ...next[idx], [field]: value };
      update(key, next);
    };
    const removeItem = (idx: number) => {
      removeListItemUid(key, idx);
      update(key, items.filter((_, i) => i !== idx));
    };
    const addItem = () => {
      pushListItemUid(key);
      update(key, [...items, { titolo: "", descrizione: "" }]);
    };
    return (
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={getListItemUid(key, idx, items.length)} className="border-l-4 border-orange-200 pl-3 py-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Titolo</Label>
              <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="h-7 px-2 text-xs text-rose-600">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
              </Button>
            </div>
            <Input
              value={item.titolo ?? ""}
              onChange={(e) => updateItem(idx, "titolo", e.target.value)}
              placeholder={`Titolo ${label.toLowerCase()} ${idx + 1}`}
              className="h-9 mb-2"
            />
            <Label className="text-xs">Descrizione</Label>
            <Textarea
              value={item.descrizione ?? ""}
              onChange={(e) => updateItem(idx, "descrizione", e.target.value)}
              placeholder="Cosa risolve / vantaggio"
              rows={2}
            />
          </div>
        ))}
        <Button onClick={addItem} variant="outline" size="sm" className="w-full border-dashed gap-1">
          <Plus className="h-3.5 w-3.5" /> Aggiungi {label.toLowerCase()}
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* TOOLBAR STICKY in alto: sempre visibile durante lo scroll.
          Include: stato modifiche · ANTEPRIMA PDF (prominent) · Salva.
          Prima il bottone Anteprima esisteva solo nel footer sticky in basso
          → fuori dalla viewport quando l'utente è in cima. Ora è in cima E
          in basso. */}
      <div className="sticky top-0 z-20 -mx-1 px-1 py-2.5 bg-background/95 backdrop-blur border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-xs hidden sm:flex items-center gap-1.5 min-w-0">
            <span className="text-muted-foreground">Template PDF Serramenti</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-semibold text-orange-700 truncate">
              {SECTIONS.find(s => s.id === activeSection)?.emoji} {SECTIONS.find(s => s.id === activeSection)?.label}
            </span>
          </div>
          {dirty ? (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
              ● Modifiche non salvate
            </span>
          ) : (
            <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 font-medium hidden sm:inline-block">
              ✓ Salvato
            </span>
          )}
          <span
            className={
              "text-xs border rounded-full px-2 py-0.5 font-medium hidden lg:inline-flex items-center gap-1 " +
              (qualityCriticalCount > 0
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : qualityWarningCount > 0
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200")
            }
          >
            {qualityCriticalCount > 0 ? "!" : qualityWarningCount > 0 ? "!" : "✓"}
            Qualità: {qualityCriticalCount > 0 ? `${qualityCriticalCount} da sistemare` : qualityWarningCount > 0 ? `${qualityWarningCount} avvisi` : "pronto"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AiTemplateGenerator
            settoreFn="ai-genera-template-serramenti"
            onApply={applyGeneratedSr}
            className="gap-1.5 h-9 px-3 text-sm bg-orange-500 hover:bg-orange-600"
          />
          <Button
            onClick={() => setPreviewOpen(true)}
            variant="outline"
            size="sm"
            className="gap-1.5 border-orange-300 text-orange-600 hover:bg-orange-50"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Anteprima PDF</span>
            <span className="sm:hidden">Anteprima</span>
          </Button>
          <Button
            onClick={handleSave}
            disabled={!dirty || upsertMut.isPending}
            className="bg-orange-600 hover:bg-orange-500 gap-1"
            size="sm"
          >
            {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salva
          </Button>
        </div>
      </div>

      <TemplateQualityPanel items={qualityItems} />

      {/* ─── REFACTOR · Layout sidebar + content ─────────────────────────
          Sostituisce lo scroll infinito mono-pagina con una UI app-like:
          - Sidebar sticky a sinistra (col-span-3) con 6 sezioni navigabili
          - Content panel a destra (col-span-9) renderizza solo la sezione attiva
          - Mobile (<md): sidebar collassa in un drawer apribile dall'header
          - Deeplink: ?section=brand|pagine|… per share-friendly URL */}

      {/* Mobile: bottone selettore sezione (hamburger) */}
      <div className="md:hidden flex items-center justify-between gap-2 bg-orange-50 border border-orange-200 rounded-lg p-2">
        <div className="text-xs text-orange-800 truncate">
          <span className="font-semibold">{SECTIONS.find(s => s.id === activeSection)?.emoji} {SECTIONS.find(s => s.id === activeSection)?.label}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="h-7 text-[11px] border-orange-300"
        >
          {mobileSidebarOpen ? "Chiudi sezioni" : "Cambia sezione"}
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <aside className={
          "md:col-span-3 col-span-12 " +
          (mobileSidebarOpen ? "block" : "hidden md:block")
        }>
          <nav className="sticky top-[68px] bg-white border border-slate-200 rounded-lg p-2 max-h-[calc(100vh-90px)] overflow-y-auto">
            {SECTION_GROUPS.map((group, gi) => (
              <div key={group.label} className={gi > 0 ? "mt-3 pt-2 border-t border-slate-100" : ""}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 py-1.5 mb-0.5">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((s) => {
                    const isActive = activeSection === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setActiveSection(s.id);
                          setMobileSidebarOpen(false);
                        }}
                        className={
                          "w-full text-left rounded-md px-2 py-1.5 transition-all flex items-center gap-2 " +
                          (isActive
                            ? "bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-sm"
                            : "hover:bg-orange-50 text-slate-700")
                        }
                      >
                        <span className="text-sm leading-none">{s.emoji}</span>
                        <span className={"text-[12px] font-medium leading-tight flex-1 truncate " + (isActive ? "text-white" : "text-slate-800")}>
                          {s.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* Footer sidebar: scorciatoia Anteprima PDF */}
            <div className="mt-3 pt-2 border-t border-slate-100">
              <Button
                onClick={() => setPreviewOpen(true)}
                variant="outline"
                size="sm"
                className="w-full gap-1.5 border-orange-300 text-orange-600 hover:bg-orange-50 h-8"
              >
                <Eye className="h-3.5 w-3.5" />
                Anteprima PDF
              </Button>
            </div>
          </nav>
        </aside>

        {/* ── CONTENT PANEL ────────────────────────────────────────── */}
        <div className="md:col-span-9 xl:col-span-5 col-span-12 space-y-4 min-w-0">

      {/* === SEZIONE: BRAND === */}
      {activeSection === "brand" && (<>
      <SectionHeader
        title="🏢 Brand & azienda"
        description="Logo, dati anagrafici, colori e linee prodotto che compaiono in ogni PDF."
        number={1}
      />

      {/* Anagrafica + branding */}
      <SrCard
        title="Anagrafica e branding azienda"
        description="Logo, dati e colore primario che compaiono nell'header e footer di ogni preventivo PDF."
        icon={<Building2 className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
          {/* Logo */}
          <div className="col-span-12 md:col-span-3">
            <Label className="text-xs mb-1 block">Logo PDF</Label>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLogoUpload(e.target.files[0])}
            />
            <div
              className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-muted/20 hover:border-orange-300 hover:bg-orange-50/30 cursor-pointer flex items-center justify-center overflow-hidden relative"
              onClick={() => !uploadingLogo && logoInputRef.current?.click()}
            >
              {form.logo_url ? (
                <img loading="lazy" src={form.logo_url} alt="" className="w-full h-full object-contain p-2" />
              ) : (
                <div className="text-center p-3">
                  <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                  <p className="text-[10px] text-muted-foreground">Clicca per caricare</p>
                </div>
              )}
              {uploadingLogo && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                </div>
              )}
            </div>
            <div className="flex gap-1 mt-1">
              <Button
                size="sm" variant="outline"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="flex-1 h-7 text-[11px]"
              >
                <Upload className="h-3 w-3 mr-1" />
                {form.logo_url ? "Cambia" : "Carica"}
              </Button>
              {form.logo_url && (
                <Button
                  size="sm" variant="outline"
                  onClick={() => update("logo_url", null)}
                  className="h-7 text-[11px] text-rose-600"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">PNG/JPG, max 5 MB. Sfondo trasparente consigliato.</p>
          </div>

          <div className="col-span-12 md:col-span-9 grid grid-cols-12 gap-3">
            {/* I dati arrivano dal Profilo azienda: lascia vuoto per ereditarli. */}
            <div className="col-span-12 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2.5 text-[11px] text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Questi dati arrivano dal{" "}
                <Link to="/azienda/impostazioni/profilo" className="font-medium underline">Profilo azienda</Link>.
                Lascia un campo vuoto per usarli in automatico; compila solo per sovrascriverli.
              </span>
            </div>
            <div className="col-span-12">
              <Label className="text-xs">Ragione sociale</Label>
              <Input
                value={form.ragione_sociale ?? ""}
                onChange={(e) => update("ragione_sociale", e.target.value)}
                placeholder={inheritedPlaceholder(companyAnagrafica?.ragione_sociale, "Es. Showroom Demo Srl")}
                className="h-9"
              />
            </div>
            <div className="col-span-12">
              <Label className="text-xs">Indirizzo completo</Label>
              <Input
                value={form.indirizzo_completo ?? ""}
                onChange={(e) => update("indirizzo_completo", e.target.value)}
                placeholder={inheritedPlaceholder(companyAnagrafica?.indirizzo_completo, "Es. Via Roma 42 · 20121 Milano (MI)")}
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">Telefono</Label>
              <Input
                value={form.telefono ?? ""}
                onChange={(e) => update("telefono", e.target.value)}
                placeholder={inheritedPlaceholder(companyAnagrafica?.telefono, "+39 02 1234 5678")}
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">Email</Label>
              <Input
                value={form.email ?? ""}
                onChange={(e) => update("email", e.target.value)}
                placeholder={inheritedPlaceholder(companyAnagrafica?.email, "info@azienda.it")}
                className="h-9"
                type="email"
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <Label className="text-xs">P.IVA</Label>
              <Input
                value={form.partita_iva ?? ""}
                onChange={(e) => update("partita_iva", e.target.value)}
                placeholder={inheritedPlaceholder(companyAnagrafica?.partita_iva, "IT12345670156")}
                className="h-9"
              />
            </div>
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Colore primario (verde elegante consigliato)</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={form.colore_primario ?? "#2D7D5C"}
                  onChange={(e) => update("colore_primario", e.target.value)}
                  className="h-9 w-14 p-1 cursor-pointer"
                />
                <Input
                  value={form.colore_primario ?? "#2D7D5C"}
                  onChange={(e) => update("colore_primario", e.target.value)}
                  className="h-9 flex-1 font-mono"
                />
              </div>
            </div>
            {/* Milestone 1 · Typography refresh: selettore font PDF.
                Helvetica = built-in react-pdf, zero rete, sempre disponibile.
                Inter/Roboto = self-host /public/fonts/ (TTF). Se il font scelto
                non è disponibile a runtime, fallback automatico a Helvetica. */}
            <div className="col-span-12 md:col-span-6">
              <Label className="text-xs">Tipografia PDF</Label>
              <select
                value={form.pdf_font_family ?? "helvetica"}
                onChange={(e) => update("pdf_font_family", e.target.value as "helvetica" | "inter" | "roboto")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="helvetica">Helvetica · classico business (default)</option>
                <option value="inter">Inter · moderno digital-first</option>
                <option value="roboto">Roboto · pulito leggibile</option>
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Inter/Roboto richiedono font self-hosted: se non disponibili il PDF userà Helvetica come fallback automatico.
              </p>
            </div>
            {/* Milestone 2: toggle versioning footer */}
            <div className="col-span-12">
              <div className="flex items-start gap-3 p-3 rounded-md border bg-slate-50/50">
                <Switch
                  checked={form.pdf_show_revision_footer !== false}
                  onCheckedChange={(checked) => update("pdf_show_revision_footer", checked)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium block">Mostra info versione nel footer</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Aggiunge su ogni pagina del PDF: <code className="font-mono text-[10px] bg-white px-1 rounded">Preventivo SR-001 · v2 · pagina 3/8 · data</code>.
                    Utile per distinguere tra revisioni multiple dello stesso preventivo.
                  </p>
                </div>
              </div>
            </div>
            {/* Milestone 3: toggle footer legale esteso */}
            <div className="col-span-12">
              <div className="flex items-start gap-3 p-3 rounded-md border bg-slate-50/50">
                <Switch
                  checked={form.pdf_show_legal_footer === true}
                  onCheckedChange={(checked) => update("pdf_show_legal_footer", checked)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium block">Mostra footer legale esteso (B2B)</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Aggiunge in fondo a ogni pagina: <code className="font-mono text-[10px] bg-white px-1 rounded">Cap. Soc. €X · REA Y · PEC: ...</code>.
                    I dati sono presi da <strong>Impostazioni → Profilo aziendale</strong>: compila prima REA, capitale sociale e PEC. Default off.
                  </p>
                </div>
              </div>
            </div>
            {/* Milestone 7: toggle box prezzo arricchito */}
            <div className="col-span-12 md:col-span-6">
              <div className="flex items-start gap-3 p-3 rounded-md border bg-slate-50/50 h-full">
                <Switch
                  checked={form.pdf_mostra_rata_mensile === true}
                  onCheckedChange={(checked) => update("pdf_mostra_rata_mensile", checked)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium block">Mostra rata mensile nel box prezzo</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Sotto al totale, in piccolo: <code className="font-mono text-[10px] bg-white px-1 rounded">≈ da € 89/mese in 60 mesi</code>.
                    Richiede almeno un piano di finanziamento configurato sul preventivo. Off di default.
                  </p>
                </div>
              </div>
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="flex items-start gap-3 p-3 rounded-md border bg-slate-50/50 h-full">
                <Switch
                  checked={form.pdf_mostra_recupero_fiscale !== false}
                  onCheckedChange={(checked) => update("pdf_mostra_recupero_fiscale", checked)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium block">Mostra netto dopo recupero fiscale</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Sotto al totale, in evidenza: <code className="font-mono text-[10px] bg-white px-1 rounded">Netto dopo detrazione 50% (prima casa): € 7.450</code>.
                    Richiede aliquota detrazione configurata sul preventivo. <strong>On di default</strong>.
                  </p>
                </div>
              </div>
            </div>
            {/* Milestone 8: toggle tabella ecobonus 10 anni */}
            <div className="col-span-12">
              <div className="flex items-start gap-3 p-3 rounded-md border bg-slate-50/50">
                <Switch
                  checked={form.pdf_mostra_tabella_ecobonus === true}
                  onCheckedChange={(checked) => update("pdf_mostra_tabella_ecobonus", checked)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium block">Mostra tabella detrazione 10 anni</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Sotto la card "Detrazione fiscale" del PDF compare una mini-tabella 5×2 con
                    quota annuale e cumulato per ogni anno. <strong>Off di default</strong> — utile per
                    clienti residenziali che chiedono esplicitamente il calendario fiscale.
                  </p>
                </div>
              </div>
            </div>
            {/* Milestone 9: toggle pagine foto-tecniche per articolo */}
            <div className="col-span-12">
              <div className="flex items-start gap-3 p-3 rounded-md border bg-slate-50/50">
                <Switch
                  checked={form.pdf_pagine_articolo_dedicate === true}
                  onCheckedChange={(checked) => update("pdf_pagine_articolo_dedicate", checked)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium block">Pagine foto-tecniche dedicate per articolo</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Per ogni gruppo serramento con almeno una foto di sopralluogo o render AI,
                    il PDF aggiunge una pagina A4 dedicata: layout 2 colonne (Prima | Dopo) +
                    scheda tecnica completa (modello, materiale, vetro, dimensioni, colori, quantità) +
                    note tecniche libere. <strong>Off di default</strong> — aumenta il numero di pagine.
                    Le foto vanno caricate sul preventivo legate al singolo serramento.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SrCard>
      </>)}{/* === END SEZIONE BRAND === */}

      {/* === SEZIONE: CONTENUTI COMMERCIALI === */}
      {activeSection === "contenuti" && (<>
      <SectionHeader
        title="📝 Contenuti commerciali"
        description="Le librerie da cui pesca il consulente: esigenze, soluzioni, USP, incluso, prossimi passi."
        number={2}
      />

      {/* Esigenze */}
      <SrCard
        title="Libreria esigenze tipiche del cliente"
        description="Aggiungi qui tutte le esigenze più comuni dei tuoi clienti. Nel preventivo sceglierai quali includere per ogni cliente specifico."
        icon={<MessageCircle className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<SrEsigenza[]>
            label="Applica template standard"
            currentValue={(form.esigenze_default ?? []) as SrEsigenza[]}
            presets={[
              { label: "🏠 Comfort termico — Spifferi · Condensa · Estetica", value: PRESET_ESIGENZE },
              { label: "💰 Risparmio + sicurezza — Bollette · Rumore · Punti accessibili", value: PRESET_ESIGENZE_ALT },
              { label: "👶 Famiglia — Sicurezza · Comfort estivo · Manutenzione ridotta", value: PRESET_ESIGENZE_FAMIGLIA },
            ]}
            onApply={(v) => update("esigenze_default", v)}
          />
        </div>
        {renderBulletObjectEditor("esigenza", "esigenze_default")}
      </SrCard>

      {/* Soluzione */}
      <SrCard
        title="Libreria soluzioni / argomenti di vendita"
        description="Tutte le soluzioni che proponi (su misura, posa qualificata, vetri premium...). Le sceglierai una per una per ogni preventivo."
        icon={<Sparkles className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<SrSoluzioneItem[]>
            label="Applica template standard"
            currentValue={(form.soluzione_default ?? []) as SrSoluzioneItem[]}
            presets={[
              { label: "💎 Standard (Rilievo tecnico + posa chiara)", value: PRESET_SOLUZIONE },
              { label: "🏆 Premium (Vetri, profili e posa documentata)", value: PRESET_SOLUZIONE_PREMIUM },
            ]}
            onApply={(v) => update("soluzione_default", v)}
          />
        </div>
        {renderBulletObjectEditor("soluzione", "soluzione_default")}
      </SrCard>

      {/* Perché noi */}
      <SrCard
        title="Libreria USP — Perché scegliere noi"
        description="Tutti i punti forti della tua azienda. Nel preventivo selezionerai quelli più rilevanti per ogni cliente."
        icon={<ListChecks className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<string[]>
            label="Applica template standard"
            currentValue={(form.perche_noi_default ?? []) as string[]}
            presets={[
              { label: "✅ Servizio chiaro (referente unico · documenti · passaggi scritti)", value: PRESET_PERCHE_NOI },
              { label: "🏆 Metodo operativo (showroom · rilievo · posa · assistenza)", value: PRESET_PERCHE_NOI_ALT },
              { label: "🛡️ Fiducia verificabile (dati aziendali · certificazioni · recensioni reali)", value: PRESET_PERCHE_NOI_TRUST },
            ]}
            onApply={(v) => update("perche_noi_default", v)}
          />
        </div>
        {renderListEditor("USP", "perche_noi_default", "Es. Posa eseguita a regola d'arte con sigillature certificate")}
      </SrCard>

      {/* Incluso */}
      <SrCard
        title="Libreria 'Cosa è incluso nel preventivo'"
        description="Tutte le voci che possono essere incluse nelle tue offerte. Nel preventivo scegli quali sono attive per quel cliente."
        icon={<ListChecks className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<string[]>
            label="Applica template standard"
            currentValue={(form.incluso_default ?? []) as string[]}
            presets={[
              { label: "📦 Standard (5 voci — rilievo, posa, sigillature, collaudo)", value: PRESET_INCLUSO },
              { label: "⭐ Plus (8 voci — documenti, foto, pulizia e assistenza)", value: PRESET_INCLUSO_PLUS },
            ]}
            onApply={(v) => update("incluso_default", v)}
          />
        </div>
        {renderListEditor("voce", "incluso_default", "Es. Rilievo dimensionale a casa tua senza costi aggiuntivi")}
      </SrCard>

      {/* Prossimi passi */}
      <SrCard
        title="Libreria 'Prossimi passi' (chiusura PDF)"
        description="Tutti i possibili step del tuo processo di vendita. Nel preventivo scegli quali mostrare al cliente specifico."
        icon={<ListChecks className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<string[]>
            label="Applica template standard"
            currentValue={(form.prossimi_passi_default ?? []) as string[]}
            presets={[
              { label: "👋 Standard (4 step — Chiamata → Sopralluogo → Piano → Firma)", value: PRESET_PROSSIMI_PASSI },
              { label: "🏆 Premium (5 step con showroom e prezzo bloccato)", value: PRESET_PROSSIMI_PASSI_PREMIUM },
            ]}
            onApply={(v) => update("prossimi_passi_default", v)}
          />
        </div>
        {renderListEditor("step", "prossimi_passi_default", "Es. Ci vediamo a casa tua per la consulenza tecnica")}
      </SrCard>
      </>)}{/* === END SEZIONE CONTENUTI === */}

      {/* === SEZIONE: MACROCATEGORIE === */}
      {activeSection === "macro" && (<>
      <SectionHeader
        title="📦 Linee prodotto (macrocategorie)"
        description="Le pagine dedicate macrocategoria che vengono inserite nel PDF dopo la composizione tecnica."
        number={3}
      />

      {/* Pagine dedicate macrocategoria — sincronizzate con il listino */}
      <SrCard
        title="Pagine dedicate macrocategoria"
        description="Quando un articolo di una macro attivata è nel preventivo, il PDF aggiunge una pagina dedicata (foto + descrizione estesa). Le modifiche qui sono sincronizzate con il listino."
        icon={<FileText className="h-4 w-4" />}
      >
        <MacroPagineDedicateManager vertical="serramentista" />
      </SrCard>
      </>)}{/* === END SEZIONE MACRO === */}

      {/* === SEZIONE: PAGINE PDF (Cover/Chi siamo/... ora 9 sezioni separate)
           La <Tabs> interna è controllata dall'esterno via activeSection;
           la <TabsList> è nascosta (sr-only) perché la navigazione è in sidebar. */}
      {isPageSection(activeSection) && (<>
      {/* Header sezione dinamico — mostra il nome della pagina PDF attiva. */}
      <SectionHeader
        title={`${SECTIONS.find(s => s.id === activeSection)?.emoji ?? "📄"} ${SECTIONS.find(s => s.id === activeSection)?.label ?? ""}`}
        description={SECTIONS.find(s => s.id === activeSection)?.descr ?? ""}
        number={4}
      />

      {/* Editor pagina specifica del PDF — Tabs controllata dall'esterno */}
      <SrCard
        title="Editor pagina PDF"
        description="Modifica i contenuti della pagina selezionata dalla sidebar."
        icon={<FileText className="h-4 w-4" />}
      >
        <Tabs
          value={sectionToPdfTab(activeSection) ?? "cover"}
          onValueChange={(v) => {
            // Mappatura inversa: value Tabs → EditorSection
            const mapping: Record<string, EditorSection> = {
              "cover": "page_cover",
              "chi-siamo": "page_chi_siamo",
              "percorso": "page_percorso",
              "consulente": "page_consulente",
              "recensioni": "page_recensioni",
              "render": "page_render",
              "cta": "page_cta",
              "conversione": "page_conversione",
              "ordine-pagine": "page_ordine",
            };
            if (mapping[v]) setActiveSection(mapping[v]);
          }}
          className="w-full"
        >
          {/* TabsList nascosto: la navigazione è in sidebar. Manteniamo
              il componente per accessibilità ARIA (Radix richiede TabsList
              come parent di TabsTrigger anche se invisibile). */}
          <TabsList className="sr-only">
            <TabsTrigger value="cover">Cover</TabsTrigger>
            <TabsTrigger value="chi-siamo">Chi siamo</TabsTrigger>
            <TabsTrigger value="percorso">Il tuo percorso</TabsTrigger>
            <TabsTrigger value="consulente">Consulente</TabsTrigger>
            <TabsTrigger value="recensioni">Recensioni</TabsTrigger>
            <TabsTrigger value="render">Render AI</TabsTrigger>
            <TabsTrigger value="cta">CTA finale</TabsTrigger>
            <TabsTrigger value="conversione">⚡ Conversione</TabsTrigger>
            <TabsTrigger value="ordine-pagine">Ordine pagine</TabsTrigger>
          </TabsList>

          {/* ═══ COVER ═══════════════════════════════════════════════════════ */}
          <TabsContent value="cover" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Editor visuale · anteprima in tempo reale · tutti i parametri sotto
              </div>
            </div>

            {/* ─── Preset stili cover ────────────────────────────────────
                 Gallery con 8 preset di LAYOUT (no solo colore):
                 ogni preset combina bg/immagine + posizione testo (top/center/
                 bottom) + decorazione + overlay. Divisi in 2 gruppi visuali:
                 🎨 Solid (4) e 📷 Photo (4). Click → applica in batch.
                 Le card mostrano una mini-anteprima A4 con bg, accent,
                 posizione testo e indicatore di tipo (solid vs photo). */}
            <SrCard
              title="Preset stili — 1 click"
              description="Configurazione completa (colori, font, layout) in un click. L'immagine di sfondo non viene modificata."
              icon={<Sparkles className="h-4 w-4" />}
            >
            <div className="space-y-3">
              {activeCoverPresetId && (
                <div className="flex justify-end">
                  <Badge variant="outline" className="bg-orange-50 border-orange-200 text-orange-700 gap-1 text-[10px] h-5">
                    <span className="text-sm leading-none">{COVER_PRESETS.find(p => p.id === activeCoverPresetId)?.emoji}</span>
                    Attivo: {COVER_PRESETS.find(p => p.id === activeCoverPresetId)?.nome}
                  </Badge>
                </div>
              )}
              {/* Toggle: i preset sono collassati di default per non occupare tutta la cima */}
              <button
                type="button"
                onClick={() => setShowPresets((v) => !v)}
                className="w-full flex items-center justify-between rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition-colors"
              >
                <span>{showPresets ? "Nascondi preset stili" : "Scegli un preset pronto (8 stili · 1 click)"}</span>
                <span className="text-slate-400 text-[10px]">{showPresets ? "▲ chiudi" : "▼ apri"}</span>
              </button>
              {showPresets && (<>
              {/* Helper per render di una singola card preset (riusato da entrambi i gruppi). */}
              {(["solid", "photo"] as const).map((cat) => {
                const presetsInCat = COVER_PRESETS.filter((p) => p.category === cat);
                if (presetsInCat.length === 0) return null;
                const catLabel = cat === "solid"
                  ? { emoji: "🎨", title: "Solo colore (no immagine)", subtitle: "Background solido con titolo e accent" }
                  : { emoji: "📷", title: "Con immagine sfondo", subtitle: "Foto come sfondo + overlay scuro per leggibilità" };
                return (
                  <div key={cat} className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm">{catLabel.emoji}</span>
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-700">{catLabel.title}</span>
                      <span className="text-[10px] text-muted-foreground">{catLabel.subtitle}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                      {presetsInCat.map((p) => {
                        const isActive = activeCoverPresetId === p.id;
                        const tv = p.patch.pdf_cover_text_vertical ?? "bottom";
                        const ta = p.patch.pdf_cover_text_align ?? "left";
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => applyCoverPreset(p.id)}
                            title={p.descrizione}
                            className={
                              "group relative rounded-lg overflow-hidden transition-all text-left focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white border-2 " +
                              (isActive
                                ? "border-orange-500 shadow-md ring-2 ring-orange-300"
                                : "border-slate-200 hover:border-orange-300 hover:shadow-sm")
                            }
                          >
                            {/* Mini-anteprima A4 — aspect 210/297, scala miniatura */}
                            <div
                              className="relative w-full overflow-hidden flex flex-col p-2"
                              style={{
                                aspectRatio: "210/297",
                                backgroundColor: p.swatchBg,
                                color: p.swatchText,
                              }}
                            >
                              {/* Per preset photo: simulazione immagine sfondo con gradient subtile */}
                              {p.category === "photo" && (
                                <div
                                  className="absolute inset-0 pointer-events-none opacity-40"
                                  style={{
                                    backgroundImage:
                                      "linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.25) 100%)",
                                  }}
                                />
                              )}
                              {/* Badge tipo preset (solo colore vs con foto) */}
                              <div
                                className="absolute top-1.5 left-1.5 text-[7px] font-bold uppercase tracking-wider px-1 py-px rounded-sm z-10"
                                style={{
                                  backgroundColor: "rgba(255,255,255,0.92)",
                                  color: "#475569",
                                }}
                              >
                                {p.category === "solid" ? "● colore" : "📷 foto"}
                              </div>

                              {/* Contenitore del blocco testo con justify-content
                                  dinamico per simulare top/center/bottom. */}
                              <div className="relative flex-1 flex flex-col z-[1]" style={{
                                justifyContent:
                                  tv === "top" ? "flex-start"
                                  : tv === "center" ? "center"
                                  : "flex-end",
                              }}>
                                {/* Logo placeholder posizione: per top_center,
                                    sopra il contenuto */}
                                {tv === "top" && (
                                  <div className="flex items-center gap-1 mb-2"
                                    style={{
                                      justifyContent: p.patch.pdf_cover_logo_position === "top_right" ? "flex-end"
                                        : p.patch.pdf_cover_logo_position === "top_center" ? "center"
                                        : "flex-start",
                                    }}
                                  >
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.swatchAccent, opacity: 0.7 }} />
                                    <div className="h-1 w-5 rounded-full opacity-30" style={{ backgroundColor: p.swatchText }} />
                                  </div>
                                )}
                                {/* Eyebrow + Titolo + Card cliente simulati */}
                                <div style={{ textAlign: ta === "center" ? "center" : "left" }}>
                                  <div
                                    className="font-bold uppercase tracking-wider mb-1"
                                    style={{ fontSize: 5, color: p.swatchAccent, opacity: 0.9 }}
                                  >
                                    ★ Proposta
                                  </div>
                                  <div
                                    className="font-bold leading-tight whitespace-pre-line"
                                    style={{
                                      fontSize: Math.max(7, (p.patch.pdf_cover_title_size ?? 40) * 0.16),
                                    }}
                                  >
                                    {p.sampleTitle}
                                  </div>
                                  {p.patch.pdf_cover_show_client_card !== false && (
                                    <div
                                      className="mt-1 rounded-sm px-1 py-0.5 inline-block"
                                      style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
                                    >
                                      <div className="h-0.5 w-3 rounded-full opacity-50" style={{ backgroundColor: p.swatchText }} />
                                      <div className="h-1 w-4 rounded-full mt-0.5" style={{ backgroundColor: p.swatchText }} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* Footer card con nome + tag */}
                            <div className="px-2 py-1.5 bg-white border-t border-slate-100">
                              <div className="flex items-center gap-1">
                                <span className="text-sm leading-none">{p.emoji}</span>
                                <span className="text-[11px] font-semibold text-slate-900 truncate">{p.nome}</span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[8px] uppercase tracking-wide bg-slate-100 text-slate-600 px-1 py-px rounded font-semibold">
                                  {p.tag}
                                </span>
                              </div>
                            </div>
                            {/* Check icon su attivo */}
                            {isActive && (
                              <div className="absolute top-1.5 right-1.5 bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow-md z-10">
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!activeCoverPresetId && (
                <p className="text-[10px] text-amber-700 bg-amber-100/60 rounded px-2 py-1 inline-block">
                  💡 Configurazione personalizzata — non corrisponde a nessun preset. I tuoi valori vengono mantenuti.
                </p>
              )}
              </>)}
            </div>
            </SrCard>

            <div className="grid grid-cols-12 gap-4 md:items-start">
              {/* PREVIEW LIVE — formato A4 portrait scalato.
                  REDESIGN pilota: pannello a DESTRA e STICKY (segue lo scroll dei
                  campi, sempre visibile mentre modifichi); larghezza ridotta a col-4
                  per dare più spazio alla parte di creazione (campi a col-8). */}
              {/* Anteprima HTML interna copertina: NASCOSTA — sostituita dal
                  pannello globale "Anteprima live PDF" a destra (mostra tutte le pagine). */}
              <div className="hidden">
                <Label className="text-xs mb-1.5 block flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-orange-500" /> Anteprima live · si aggiorna mentre modifichi
                </Label>
                <div
                  className="relative w-full overflow-hidden rounded-lg border-2 border-slate-200 shadow-sm"
                  style={{
                    aspectRatio: "210/297",
                    backgroundColor: form.pdf_cover_bg_color || "#0F2A2E",
                  }}
                >
                  {/* Immagine di sfondo */}
                  {form.pdf_cover_image_url && (
                    <img loading="lazy"
                      src={form.pdf_cover_image_url}
                      alt="cover bg"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  {/* Overlay scuro su immagine — M13 con stile selezionabile.
                       L'anteprima HTML usa CSS gradient per replicare il PDF SVG. */}
                  {form.pdf_cover_image_url && (() => {
                    const op = (form.pdf_cover_overlay_opacity ?? 65) / 100;
                    const style = form.pdf_cover_overlay_style ?? "flat";
                    let bgValue = "#000000";
                    let opacityValue: number = op;
                    if (style === "gradient") {
                      bgValue = `linear-gradient(to bottom, rgba(0,0,0,${op * 0.15}) 0%, rgba(0,0,0,${op * 0.55}) 55%, rgba(0,0,0,${op}) 100%)`;
                      opacityValue = 1;
                    } else if (style === "gradient_diag") {
                      bgValue = `linear-gradient(135deg, rgba(0,0,0,${op * 0.2}) 0%, rgba(0,0,0,${op}) 100%)`;
                      opacityValue = 1;
                    } else if (style === "vignette") {
                      bgValue = `radial-gradient(ellipse at center, rgba(0,0,0,${op * 0.1}) 0%, rgba(0,0,0,${op * 0.5}) 70%, rgba(0,0,0,${op * 0.95}) 100%)`;
                      opacityValue = 1;
                    }
                    return (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: bgValue, opacity: opacityValue }}
                      />
                    );
                  })()}
                  {/* Decoro in alto a destra — FEDELE al PDF (CoverDecorationSvg):
                      rispetta pdf_cover_decoration_style (finestra/anelli/linea/
                      pattern) e usa il colore del TESTO cover, che armonizza
                      sempre col fondo. Prima era un blocco piatto in colore brand
                      (ignorava lo stile e stonava). */}
                  {form.pdf_cover_show_decoration !== false && (() => {
                    const v = form.pdf_cover_decoration_style ?? "square";
                    if (v === "none") return null;
                    const c = form.pdf_cover_text_color || "#FFFFFF";
                    return (
                      <svg viewBox="0 0 180 180" aria-hidden className="absolute top-3 right-3 w-11 h-11 pointer-events-none">
                        {v === "circle" ? (
                          <>
                            <circle cx={90} cy={90} r={80} stroke={c} strokeWidth={3} fill="none" opacity={0.7} />
                            <circle cx={90} cy={90} r={56} stroke={c} strokeWidth={1.5} fill="none" opacity={0.4} />
                            <circle cx={90} cy={90} r={32} stroke={c} strokeWidth={1} fill="none" opacity={0.25} />
                          </>
                        ) : v === "line" ? (
                          <>
                            <path d="M 90 10 L 90 170" stroke={c} strokeWidth={2.5} opacity={0.7} />
                            <path d="M 70 40 L 110 40" stroke={c} strokeWidth={1.5} opacity={0.5} />
                            <path d="M 70 140 L 110 140" stroke={c} strokeWidth={1.5} opacity={0.5} />
                          </>
                        ) : v === "pattern" ? (
                          <g opacity={0.45} fill={c}>
                            {Array.from({ length: 25 }).map((_, i) => (
                              <circle key={i} cx={30 + (i % 5) * 30} cy={30 + Math.floor(i / 5) * 30} r={3} />
                            ))}
                          </g>
                        ) : (
                          <>
                            <g opacity={0.7} stroke={c} fill="none">
                              <rect x={20} y={20} width={140} height={140} rx={6} strokeWidth={3} />
                              <path d="M 90 25 L 90 155" strokeWidth={2} />
                              <path d="M 25 90 L 155 90" strokeWidth={2} />
                            </g>
                            <circle cx={84} cy={90} r={3} fill={c} opacity={0.7} />
                            <g opacity={0.3} stroke={c}>
                              <path d="M 0 90 L 18 90" strokeWidth={1.5} />
                              <path d="M 162 90 L 180 90" strokeWidth={1.5} />
                              <path d="M 90 0 L 90 18" strokeWidth={1.5} />
                              <path d="M 90 162 L 90 180" strokeWidth={1.5} />
                            </g>
                          </>
                        )}
                      </svg>
                    );
                  })()}
                  {/* Contenuto testuale */}
                  <div
                    className="absolute inset-0 p-4 flex flex-col"
                    style={{
                      color: form.pdf_cover_text_color || "#FFFFFF",
                      textAlign: form.pdf_cover_text_align === "center" ? "center" : "left",
                      alignItems: form.pdf_cover_text_align === "center" ? "center" : "flex-start",
                    }}
                  >
                    {/* Logo + company name */}
                    {/* M17 · Posizione logo configurabile (preview HTML).
                        hidden → blocco non renderizzato; top_left/right/center
                        → justify-* gestisce l'allineamento orizzontale. */}
                    {(form.pdf_cover_logo_position ?? "top_left") !== "hidden" && (
                      <div
                        className="flex items-center gap-2 mb-auto w-full"
                        style={{
                          justifyContent:
                            form.pdf_cover_logo_position === "top_right"
                              ? "flex-end"
                              : form.pdf_cover_logo_position === "top_center"
                                ? "center"
                                : "flex-start",
                        }}
                      >
                        {(() => {
                          const sz = Math.round(28 * ((form.pdf_cover_logo_size ?? 100) / 100));
                          const coverLogo = form.pdf_cover_logo_url ?? brand?.brand_logo_dark_url ?? form.logo_url;
                          return coverLogo ? (
                            <img
                              loading="lazy"
                              src={coverLogo}
                              alt="logo"
                              className="object-contain rounded bg-white/10 p-0.5 shrink-0"
                              style={{ width: sz, height: sz }}
                            />
                          ) : (
                            <div
                              className="rounded-full bg-white/20 flex items-center justify-center font-bold shrink-0"
                              style={{ width: sz, height: sz, fontSize: Math.max(7, Math.round(10 * (form.pdf_cover_logo_size ?? 100) / 100)) }}
                            >
                              A
                            </div>
                          );
                        })()}
                        <span className="text-[10px] font-semibold uppercase tracking-wide">
                          {form.indirizzo_completo ? "Azienda" : "Il tuo brand"}
                        </span>
                      </div>
                    )}

                    {/* Eyebrow + Title + Subtitle — M18 vertical-align */}
                    <div
                      className="mb-4 w-full"
                      style={{
                        marginTop:
                          (form.pdf_cover_text_vertical ?? "bottom") === "top"
                            ? 0
                            : "auto",
                        marginBottom:
                          form.pdf_cover_text_vertical === "center" ? "auto" : "1rem",
                      }}
                    >
                      <div
                        className="font-semibold uppercase tracking-wider mb-2"
                        style={{
                          color: form.pdf_cover_eyebrow_color || form.colore_primario || "#2D7D5C",
                          fontSize: `${(form.pdf_cover_eyebrow_size ?? 11) * 0.6}px`,
                        }}
                      >
                        {form.pdf_cover_eyebrow ||
                          "★ La tua proposta personalizzata"}
                      </div>
                      <div
                        className="font-bold leading-tight whitespace-pre-wrap mb-1.5"
                        style={{
                          color: form.pdf_cover_title_color || form.pdf_cover_text_color || "#FFFFFF",
                          fontSize: `${(form.pdf_cover_title_size ?? 40) * 0.5}px`,
                        }}
                      >
                        {form.pdf_cover_hero ||
                          "La tua casa,\nfinalmente al caldo."}
                      </div>
                      <div
                        className="line-clamp-2"
                        style={{
                          color: form.pdf_cover_subtitle_color || "#D1D5DB",
                          fontSize: `${(form.pdf_cover_subtitle_size ?? 13) * 0.6}px`,
                        }}
                      >
                        {form.pdf_cover_subhero ||
                          "Sintesi auto-generata del preventivo"}
                      </div>
                      {form.pdf_cover_show_client_card !== false && (
                        <div className="mt-3 bg-white/10 rounded-md p-2 backdrop-blur-sm text-left">
                          <div className="text-[8px] uppercase opacity-70">
                            Preparato per
                          </div>
                          <div className="text-xs font-semibold">
                            Mario Rossi
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Anteprima approssimativa · il PDF finale può differire
                  leggermente per tipografia
                </p>
              </div>

              {/* CONTROLLI EDITOR — REDESIGN slice 3: raggruppati in card leggibili
                  (Sfondo · Testi); la card "Tipografia & layout" è subito sotto. */}
              <div className="col-span-12 md:order-1 space-y-3">
                {/* ══ Card: Sfondo copertina ══ */}
                <SrCard title="Sfondo copertina" icon={<ImageIcon className="h-4 w-4" />}>
                <div className="space-y-3">
                {/* Immagine di sfondo */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Immagine di sfondo cover (opzionale)
                  </Label>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && handleCoverUpload(e.target.files[0])
                    }
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploadingCover}
                      className="flex-1 min-w-[120px] h-8 text-xs"
                    >
                      {uploadingCover ? (
                        <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3 mr-1.5" />
                      )}
                      {form.pdf_cover_image_url
                        ? "Cambia"
                        : "Carica"}
                    </Button>
                    {/* M16 · Galleria stock images (18 immagini Unsplash) */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStockDialogOpen(true)}
                      className="flex-1 min-w-[120px] h-8 text-xs border-orange-200 text-orange-700 hover:bg-orange-50"
                    >
                      📷 Galleria stock
                    </Button>
                    {form.pdf_cover_image_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update("pdf_cover_image_url", null)}
                        className="h-8 text-xs text-rose-600"
                      >
                        Rimuovi
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Carica file (PNG/JPG max 8 MB) o scegli dalle 18 immagini stock free.
                  </p>
                </div>

                {/* Overlay opacity + M13 stile (visibili solo con immagine) */}
                {form.pdf_cover_image_url && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs flex items-center justify-between mb-1">
                        <span>Opacità overlay scuro</span>
                        <span className="font-mono text-muted-foreground">
                          {form.pdf_cover_overlay_opacity ?? 65}%
                        </span>
                      </Label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={form.pdf_cover_overlay_opacity ?? 65}
                        onChange={(e) =>
                          update(
                            "pdf_cover_overlay_opacity",
                            Number(e.target.value),
                          )
                        }
                        className="w-full accent-orange-500"
                      />
                    </div>
                    {/* M13 · Tipo overlay (flat / gradient / vignette) */}
                    <div>
                      <Label className="text-xs mb-1 block">Stile overlay</Label>
                      <div className="grid grid-cols-4 gap-1">
                        {([
                          { v: "flat",          label: "Piatto",     hint: "Nero uniforme" },
                          { v: "gradient",      label: "Gradient ↓", hint: "Trasparente in alto, scuro in basso" },
                          { v: "gradient_diag", label: "Gradient ↘", hint: "Diagonale alto-sx → basso-dx" },
                          { v: "vignette",      label: "Vignette",   hint: "Centro chiaro, angoli scuri" },
                        ] as const).map((opt) => {
                          const isActive = (form.pdf_cover_overlay_style ?? "flat") === opt.v;
                          return (
                            <button
                              key={opt.v}
                              type="button"
                              title={opt.hint}
                              onClick={() => update("pdf_cover_overlay_style", opt.v)}
                              className={
                                "rounded border text-[10px] py-1 px-1 transition-all " +
                                (isActive
                                  ? "bg-orange-500 text-white border-orange-500 font-semibold"
                                  : "bg-white border-slate-200 hover:border-orange-300 text-slate-700")
                              }
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Gradient migliora la leggibilità del testo su foto chiare.
                      </p>
                    </div>
                  </div>
                )}

                {/* Colore di sfondo (solo quando non c'è immagine) */}
                {!form.pdf_cover_image_url && (
                  <div>
                    <Label className="text-xs mb-1 block">
                      Colore di sfondo cover
                    </Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.pdf_cover_bg_color || "#0F2A2E"}
                        onChange={(e) =>
                          update("pdf_cover_bg_color", e.target.value)
                        }
                        className="h-8 w-12 rounded border cursor-pointer"
                      />
                      <Input
                        value={form.pdf_cover_bg_color ?? ""}
                        onChange={(e) =>
                          update(
                            "pdf_cover_bg_color",
                            e.target.value || null,
                          )
                        }
                        placeholder="#0F2A2E"
                        className="h-8 text-xs font-mono flex-1"
                      />
                      {form.pdf_cover_bg_color && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => update("pdf_cover_bg_color", null)}
                          className="h-8 text-[11px]"
                        >
                          Reset
                        </Button>
                      )}
                    </div>

                    {/* M20 · Palette intelligente: brand variations + curate.
                        Solo quando non c'è immagine (palette serve per il bg solido). */}
                    <div className="mt-2 space-y-1.5">
                      {/* Brand palette: 4 variazioni dal colore_primario aziendale */}
                      {form.colore_primario && (
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                            🎨 Brand · variazioni da {form.colore_primario}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {generateBrandPalette(form.colore_primario).map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => update("pdf_cover_bg_color", c)}
                                title={c}
                                className={
                                  "w-7 h-7 rounded border-2 transition-all hover:scale-110 " +
                                  (form.pdf_cover_bg_color === c
                                    ? "border-orange-500 ring-1 ring-orange-300"
                                    : "border-slate-200 hover:border-orange-300")
                                }
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Palette curate (3 set) */}
                      {CURATED_PALETTES.map((p) => (
                        <div key={p.name}>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                            {p.emoji} {p.name}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {p.colors.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => update("pdf_cover_bg_color", c)}
                                title={c}
                                className={
                                  "w-7 h-7 rounded border-2 transition-all hover:scale-110 " +
                                  (form.pdf_cover_bg_color === c
                                    ? "border-orange-500 ring-1 ring-orange-300"
                                    : "border-slate-200 hover:border-orange-300")
                                }
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                </div>
                </SrCard>{/* ══ fine Card: Sfondo copertina ══ */}

                {/* ══ Card: Testi copertina ══ */}
                <SrCard title="Testi copertina" icon={<Quote className="h-4 w-4" />}>
                <div className="space-y-3">
                {/* Eyebrow */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Eyebrow (testo piccolo sopra il titolo)
                  </Label>
                  <Input
                    value={form.pdf_cover_eyebrow ?? ""}
                    onChange={(e) =>
                      update("pdf_cover_eyebrow", e.target.value || null)
                    }
                    placeholder="★ La tua proposta personalizzata"
                    className="h-8 text-xs"
                  />
                  <PlaceholderChips
                    value={form.pdf_cover_eyebrow ?? ""}
                    onChange={(v) => update("pdf_cover_eyebrow", v || null)}
                  />
                </div>

                {/* Titolo */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Titolo hero (a capo per due righe)
                  </Label>
                  <Textarea
                    value={form.pdf_cover_hero ?? ""}
                    onChange={(e) =>
                      update("pdf_cover_hero", e.target.value || null)
                    }
                    placeholder="La tua casa, finalmente al caldo."
                    rows={2}
                    className="text-sm"
                  />
                  <PlaceholderChips
                    value={form.pdf_cover_hero ?? ""}
                    onChange={(v) => update("pdf_cover_hero", v || null)}
                  />
                </div>

                {/* Sottotitolo */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Sottotitolo (opzionale)
                  </Label>
                  <Textarea
                    value={form.pdf_cover_subhero ?? ""}
                    onChange={(e) =>
                      update("pdf_cover_subhero", e.target.value || null)
                    }
                    placeholder="Lascia vuoto per usare la sintesi auto-generata del preventivo"
                    rows={2}
                    className="text-sm"
                  />
                </div>

                {/* Milestone 4: subhero template con placeholder dinamici. */}
                <div>
                  <Label className="text-xs mb-1 block flex items-center justify-between">
                    <span>Sottotitolo dinamico (con placeholder) — opzionale</span>
                    <span className="text-[10px] font-normal text-muted-foreground">override del sottotitolo sopra</span>
                  </Label>
                  <Textarea
                    value={form.pdf_cover_subhero_template ?? ""}
                    onChange={(e) =>
                      update("pdf_cover_subhero_template", e.target.value || null)
                    }
                    placeholder="Per la casa di {cliente_nome_completo} a {cantiere_citta} · {num_serramenti} serramenti · Consegna entro {data_consegna_stimata}"
                    rows={2}
                    className="text-sm font-mono"
                  />
                  <PlaceholderChips
                    value={form.pdf_cover_subhero_template ?? ""}
                    onChange={(v) => update("pdf_cover_subhero_template", v || null)}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                    Clicca un campo per aggiungerlo. Questi campi funzionano anche negli altri
                    testi e titoli del template (cover, Chi siamo, CTA): scrivi es. {"{cliente_nome}"} e
                    verrà sostituito nel PDF.
                  </p>
                </div>
                </div>
                </SrCard>{/* ══ fine Card: Testi copertina ══ */}

            {/* ══ Card: Logo, tipografia & layout — dentro la colonna sinistra così
                l'anteprima sticky resta visibile anche mentre modifichi qui ══ */}
            <SrCard title="Logo, tipografia & layout" icon={<Sparkles className="h-4 w-4" />} className="mt-2">
              <div className="grid grid-cols-12 gap-3">
                {/* Font size + colore — Eyebrow */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] flex items-center justify-between mb-1">
                    <span>Eyebrow</span>
                    <span className="font-mono text-muted-foreground">
                      {form.pdf_cover_eyebrow_size ?? 11}pt
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={8}
                    max={20}
                    step={1}
                    value={form.pdf_cover_eyebrow_size ?? 11}
                    onChange={(e) => update("pdf_cover_eyebrow_size", Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      type="color"
                      value={form.pdf_cover_eyebrow_color || form.colore_primario || "#2D7D5C"}
                      onChange={(e) => update("pdf_cover_eyebrow_color", e.target.value)}
                      className="h-5 w-8 rounded border cursor-pointer shrink-0"
                      title="Colore eyebrow"
                    />
                    <Input
                      value={form.pdf_cover_eyebrow_color ?? ""}
                      onChange={(e) => update("pdf_cover_eyebrow_color", e.target.value || null)}
                      placeholder="Brand color"
                      className="h-5 text-[10px] font-mono flex-1 px-1"
                    />
                    {form.pdf_cover_eyebrow_color && (
                      <button
                        type="button"
                        onClick={() => update("pdf_cover_eyebrow_color", null)}
                        className="text-[10px] text-muted-foreground hover:text-destructive shrink-0"
                        title="Ripristina colore brand"
                      >✕</button>
                    )}
                  </div>
                </div>
                {/* Font size + colore — Titolo */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] flex items-center justify-between mb-1">
                    <span>Titolo hero</span>
                    <span className="font-mono text-muted-foreground">
                      {form.pdf_cover_title_size ?? 40}pt
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={22}
                    max={64}
                    step={1}
                    value={form.pdf_cover_title_size ?? 40}
                    onChange={(e) => update("pdf_cover_title_size", Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      type="color"
                      value={form.pdf_cover_title_color || form.pdf_cover_text_color || "#FFFFFF"}
                      onChange={(e) => update("pdf_cover_title_color", e.target.value)}
                      className="h-5 w-8 rounded border cursor-pointer shrink-0"
                      title="Colore titolo"
                    />
                    <Input
                      value={form.pdf_cover_title_color ?? ""}
                      onChange={(e) => update("pdf_cover_title_color", e.target.value || null)}
                      placeholder="Colore testo"
                      className="h-5 text-[10px] font-mono flex-1 px-1"
                    />
                    {form.pdf_cover_title_color && (
                      <button
                        type="button"
                        onClick={() => update("pdf_cover_title_color", null)}
                        className="text-[10px] text-muted-foreground hover:text-destructive shrink-0"
                        title="Ripristina colore testo"
                      >✕</button>
                    )}
                  </div>
                </div>
                {/* Font size + colore — Sottotitolo */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] flex items-center justify-between mb-1">
                    <span>Sottotitolo</span>
                    <span className="font-mono text-muted-foreground">
                      {form.pdf_cover_subtitle_size ?? 13}pt
                    </span>
                  </Label>
                  <input
                    type="range"
                    min={9}
                    max={22}
                    step={1}
                    value={form.pdf_cover_subtitle_size ?? 13}
                    onChange={(e) => update("pdf_cover_subtitle_size", Number(e.target.value))}
                    className="w-full accent-orange-500"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <input
                      type="color"
                      value={form.pdf_cover_subtitle_color || "#D1D5DB"}
                      onChange={(e) => update("pdf_cover_subtitle_color", e.target.value)}
                      className="h-5 w-8 rounded border cursor-pointer shrink-0"
                      title="Colore sottotitolo"
                    />
                    <Input
                      value={form.pdf_cover_subtitle_color ?? ""}
                      onChange={(e) => update("pdf_cover_subtitle_color", e.target.value || null)}
                      placeholder="#D1D5DB"
                      className="h-5 text-[10px] font-mono flex-1 px-1"
                    />
                    {form.pdf_cover_subtitle_color && (
                      <button
                        type="button"
                        onClick={() => update("pdf_cover_subtitle_color", null)}
                        className="text-[10px] text-muted-foreground hover:text-destructive shrink-0"
                        title="Ripristina colore default"
                      >✕</button>
                    )}
                  </div>
                </div>
                {/* Allineamento testo */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] mb-1 block">Allineamento testo</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant={(form.pdf_cover_text_align ?? "left") === "left" ? "default" : "outline"}
                      onClick={() => update("pdf_cover_text_align", "left")}
                      className={`h-7 text-[11px] ${(form.pdf_cover_text_align ?? "left") === "left" ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                    >
                      Sinistra
                    </Button>
                    <Button
                      size="sm"
                      variant={form.pdf_cover_text_align === "center" ? "default" : "outline"}
                      onClick={() => update("pdf_cover_text_align", "center")}
                      className={`h-7 text-[11px] ${form.pdf_cover_text_align === "center" ? "bg-orange-500 hover:bg-orange-600" : ""}`}
                    >
                      Centro
                    </Button>
                  </div>
                </div>

                {/* Logo copertina — REDESIGN: la versione chiara del logo (per sfondo
                    scuro) si gestisce ora in Brand & Azienda, un unico posto per tutti
                    i template. La copertina la EREDITA. Resta un override facoltativo
                    solo-per-questo-template per i casi particolari. */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] mb-1 block">Logo copertina</Label>
                  <input
                    ref={coverLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleCoverLogoUpload(e.target.files[0])}
                  />
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 dark:border-blue-900/40 dark:bg-blue-950/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-11 w-11 rounded bg-slate-900 flex items-center justify-center overflow-hidden shrink-0 p-1 relative">
                        {(form.pdf_cover_logo_url ?? brand?.brand_logo_dark_url ?? form.logo_url) ? (
                          <img
                            loading="lazy"
                            src={(form.pdf_cover_logo_url ?? brand?.brand_logo_dark_url ?? form.logo_url) ?? ""}
                            alt="Logo copertina"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-slate-500" />
                        )}
                        {uploadingCoverLogo && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] text-blue-900 dark:text-blue-200 leading-snug flex-1 min-w-0">
                        Il logo e la sua <strong>versione chiara</strong> (per sfondo scuro) si impostano in{" "}
                        <strong>Brand&nbsp;&amp;&nbsp;Azienda</strong>. La copertina li eredita.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to="/azienda/impostazioni/branding"
                        className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline"
                      >
                        Gestisci in Brand &amp; Azienda →
                      </Link>
                      <button
                        type="button"
                        onClick={() => coverLogoInputRef.current?.click()}
                        disabled={uploadingCoverLogo}
                        className="ml-auto text-[10px] text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                      >
                        Logo solo qui
                      </button>
                    </div>
                    {form.pdf_cover_logo_url && (
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-blue-200/60 dark:border-blue-900/40">
                        <span className="text-[9px] text-amber-700 dark:text-amber-400">Override specifico attivo</span>
                        <button
                          type="button"
                          onClick={() => update("pdf_cover_logo_url", null)}
                          className="text-[10px] text-rose-600 hover:underline"
                        >
                          Rimuovi override
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* M17 · Posizione logo cover */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] mb-1 block">Posizione logo</Label>
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      { v: "top_left",   icon: "◰", title: "Alto sinistra" },
                      { v: "top_center", icon: "◓", title: "Alto centro" },
                      { v: "top_right",  icon: "◳", title: "Alto destra" },
                      { v: "hidden",     icon: "✕", title: "Nascosto" },
                    ] as const).map((opt) => {
                      const isActive = (form.pdf_cover_logo_position ?? "top_left") === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          title={opt.title}
                          onClick={() => update("pdf_cover_logo_position", opt.v)}
                          className={
                            "h-7 rounded border text-sm font-bold transition-all " +
                            (isActive
                              ? "bg-orange-500 text-white border-orange-500"
                              : "bg-white border-slate-200 hover:border-orange-300 text-slate-700")
                          }
                        >
                          {opt.icon}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dimensione logo cover (scala %) — subito dopo posizione, nascosta se logo hidden */}
                {(form.pdf_cover_logo_position ?? "top_left") !== "hidden" && (
                  <div className="col-span-12 md:col-span-4">
                    <Label className="text-[11px] flex items-center justify-between mb-1">
                      <span>Dimensione logo</span>
                      <span className="font-mono text-muted-foreground">
                        {form.pdf_cover_logo_size ?? 100}%
                      </span>
                    </Label>
                    <input
                      type="range"
                      min={60}
                      max={160}
                      step={5}
                      value={form.pdf_cover_logo_size ?? 100}
                      onChange={(e) => update("pdf_cover_logo_size", Number(e.target.value))}
                      className="w-full accent-orange-500"
                    />
                  </div>
                )}

                {/* M18 · Allineamento verticale blocco testo */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] mb-1 block">Posizione testo (verticale)</Label>
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { v: "top",    label: "↑ Alto",   title: "Testo subito sotto al logo" },
                      { v: "center", label: "↕ Centro", title: "Testo centrato verticalmente" },
                      { v: "bottom", label: "↓ Basso",  title: "Testo in fondo, pre-footer (default)" },
                    ] as const).map((opt) => {
                      const isActive = (form.pdf_cover_text_vertical ?? "bottom") === opt.v;
                      return (
                        <button
                          key={opt.v}
                          type="button"
                          title={opt.title}
                          onClick={() => update("pdf_cover_text_vertical", opt.v)}
                          className={
                            "h-7 rounded border text-[10px] font-semibold transition-all " +
                            (isActive
                              ? "bg-orange-500 text-white border-orange-500"
                              : "bg-white border-slate-200 hover:border-orange-300 text-slate-700")
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Colore testo override + M14 contrast check */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[11px] mb-1 block flex items-center justify-between gap-1">
                    <span>Colore testo</span>
                    {/* M14 · Badge contrast WCAG. Calcolato live tra testo e
                        sfondo (immagine: usa overlay-darkened bg; tinta unita:
                        usa bg color). Con quick-fix se FAIL. */}
                    {(() => {
                      const textColor = form.pdf_cover_text_color || "#FFFFFF";
                      // Sfondo "effettivo": se c'è immagine assumiamo overlay scuro
                      // (#000 mediamente, semplificazione conservativa). Se no, bg solido.
                      const bgColor = form.pdf_cover_image_url
                        ? "#000000"
                        : form.pdf_cover_bg_color || "#0F2A2E";
                      const ratio = contrastRatio(textColor, bgColor);
                      // Il titolo cover è "large text" (≥ 22pt) → soglia AA = 3.0
                      const level = wcagLevel(ratio, true);
                      const badgeCls =
                        level === "AAA"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                          : level === "AA"
                            ? "bg-amber-100 text-amber-700 border-amber-300"
                            : "bg-rose-100 text-rose-700 border-rose-300";
                      const emoji = level === "AAA" ? "✅" : level === "AA" ? "⚠️" : "❌";
                      return (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded border font-mono font-semibold ${badgeCls}`}
                          title={`Contrast ratio ${ratio.toFixed(1)}:1 · WCAG ${level} (large text). Suggerito ≥ 4.5:1 per leggibilità ottimale.`}
                        >
                          {emoji} {ratio.toFixed(1)}:1 · {level}
                        </span>
                      );
                    })()}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={form.pdf_cover_text_color || "#FFFFFF"}
                      onChange={(e) => update("pdf_cover_text_color", e.target.value)}
                      className="h-7 w-9 rounded border cursor-pointer"
                    />
                    <Input
                      value={form.pdf_cover_text_color ?? ""}
                      onChange={(e) => update("pdf_cover_text_color", e.target.value || null)}
                      placeholder="#FFFFFF"
                      className="h-7 text-[11px] font-mono flex-1"
                    />
                  </div>
                  {/* Auto-fix: se FAIL, mostra il pulsante che applica miglior contrasto */}
                  {(() => {
                    const textColor = form.pdf_cover_text_color || "#FFFFFF";
                    const bgColor = form.pdf_cover_image_url
                      ? "#000000"
                      : form.pdf_cover_bg_color || "#0F2A2E";
                    const ratio = contrastRatio(textColor, bgColor);
                    if (wcagLevel(ratio, true) !== "FAIL") return null;
                    const suggested = suggestBestTextColor(bgColor);
                    return (
                      <button
                        type="button"
                        onClick={() => update("pdf_cover_text_color", suggested)}
                        className="mt-1 w-full text-[10px] py-1 px-2 rounded bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 font-medium"
                        title="Imposta automaticamente il colore con miglior contrasto su questo sfondo"
                      >
                        🔧 Fix automatico → {suggested === "#FFFFFF" ? "Bianco" : "Nero"}
                      </button>
                    );
                  })()}
                </div>

                {/* Toggle decorazione + card cliente */}
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label className="text-[11px] mb-1 block">Elementi visibili</Label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={form.pdf_cover_show_decoration !== false}
                      onChange={(e) => update("pdf_cover_show_decoration", e.target.checked)}
                      className="h-3.5 w-3.5 accent-orange-500"
                    />
                    Decorazione SVG (alto destra)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-[11px]">
                    <input
                      type="checkbox"
                      checked={form.pdf_cover_show_client_card !== false}
                      onChange={(e) => update("pdf_cover_show_client_card", e.target.checked)}
                      className="h-3.5 w-3.5 accent-orange-500"
                    />
                    Card "Preparato per" (cliente)
                  </label>
                </div>

                {/* M19 · Variante decorazione (visibile solo se decoration ON) */}
                {form.pdf_cover_show_decoration !== false && (
                  <div className="col-span-12 md:col-span-8">
                    <Label className="text-[11px] mb-1 block">Stile decorazione</Label>
                    <div className="grid grid-cols-5 gap-1">
                      {([
                        { v: "square",  label: "⊞ Finestra", title: "Finestra stilizzata 4 ante (default)" },
                        { v: "circle",  label: "◯ Cerchio",  title: "Cerchi concentrici outline" },
                        { v: "line",    label: "│ Linea",    title: "Linea verticale + tick" },
                        { v: "pattern", label: "⋮⋮ Dots",    title: "Pattern 5×5 dots geometrico" },
                        { v: "none",    label: "✕ None",     title: "Nessuna decorazione" },
                      ] as const).map((opt) => {
                        const isActive = (form.pdf_cover_decoration_style ?? "square") === opt.v;
                        return (
                          <button
                            key={opt.v}
                            type="button"
                            title={opt.title}
                            onClick={() => update("pdf_cover_decoration_style", opt.v)}
                            className={
                              "h-7 rounded border text-[10px] font-semibold transition-all " +
                              (isActive
                                ? "bg-orange-500 text-white border-orange-500"
                                : "bg-white border-slate-200 hover:border-orange-300 text-slate-700")
                            }
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reset tipografia */}
                <div className="col-span-12 flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      update("pdf_cover_eyebrow_size", null);
                      update("pdf_cover_title_size", null);
                      update("pdf_cover_subtitle_size", null);
                      update("pdf_cover_text_color", null);
                      update("pdf_cover_text_align", null);
                      update("pdf_cover_show_decoration", null);
                      update("pdf_cover_show_client_card", null);
                    }}
                    className="h-7 text-[11px] text-muted-foreground"
                  >
                    Ripristina default tipografia
                  </Button>
                </div>
              </div>
            </SrCard>
              </div>{/* ══ fine colonna sinistra controlli ══ */}
            </div>{/* ══ fine griglia cover: anteprima sticky + controlli ══ */}
          </TabsContent>

          {/* ═══ CHI SIAMO ═══════════════════════════════════════════════════ */}
          <TabsContent value="chi-siamo" className="mt-4 space-y-3">
            <SrCard
              title={'Pagina "Chi siamo"'}
              description="Pagina opzionale mostrata subito dopo la copertina."
              icon={<Building2 className="h-4 w-4" />}
            >
              <label className="flex items-center gap-2 cursor-pointer text-xs mb-3 pb-3 border-b">
                <input
                  type="checkbox"
                  checked={!!form.chi_siamo_attivo}
                  onChange={(e) => update("chi_siamo_attivo", e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium">Attiva questa pagina nel PDF</span>
              </label>
            {form.chi_siamo_attivo && (
              <div className="grid grid-cols-12 gap-3">
                {/* Foto azienda — upload diretto (no più URL incollato) */}
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs mb-1 block">Foto azienda</Label>
                  <input
                    ref={chiSiamoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleChiSiamoUpload(e.target.files[0])}
                  />
                  <div
                    className="min-h-[160px] max-h-[280px] rounded-md border-2 border-dashed border-slate-200 bg-muted/20 hover:border-orange-300 hover:bg-orange-50/30 cursor-pointer flex items-center justify-center overflow-hidden relative"
                    onClick={() => !uploadingChiSiamo && chiSiamoInputRef.current?.click()}
                  >
                    {form.chi_siamo_foto_url ? (
                      <img loading="lazy"
                        src={form.chi_siamo_foto_url}
                        alt="Foto azienda"
                        className="w-full h-auto max-h-[280px] object-contain"
                      />
                    ) : (
                      <div className="text-center p-3">
                        <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/40 mb-1" />
                        <p className="text-[10px] text-muted-foreground">Clicca per caricare</p>
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5">orizzontale, verticale o panoramica</p>
                      </div>
                    )}
                    {uploadingChiSiamo && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 mt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => chiSiamoInputRef.current?.click()}
                      disabled={uploadingChiSiamo}
                      className="flex-1 h-7 text-[11px]"
                    >
                      <Upload className="h-3 w-3 mr-1" />
                      {form.chi_siamo_foto_url ? "Cambia" : "Carica"}
                    </Button>
                    {form.chi_siamo_foto_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => update("chi_siamo_foto_url", null)}
                        className="h-7 text-[11px] text-rose-600"
                      >
                        Rimuovi
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    PNG/JPG/WebP fino a 8 MB · qualsiasi proporzione (l'immagine viene
                    mostrata intera nel PDF, senza ritagli).
                  </p>
                </div>

                {/* Titolo + testo a destra */}
                <div className="col-span-12 md:col-span-8 space-y-2">
                  <div>
                    <Label className="text-xs">Titolo pagina</Label>
                    <Input
                      value={form.chi_siamo_titolo ?? ""}
                      onChange={(e) => update("chi_siamo_titolo", e.target.value || null)}
                      placeholder="Es. Serramenti su misura, posati con metodo"
                      className="h-9 text-xs"
                    />
                    <PlaceholderChips
                      value={form.chi_siamo_titolo ?? ""}
                      onChange={(v) => update("chi_siamo_titolo", v || null)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Testo descrizione azienda</Label>
                    <RichTextEditor
                      value={form.chi_siamo_testo ?? ""}
                      onChange={(html) => update("chi_siamo_testo", html || null)}
                      placeholder="Racconta in poche righe chi siete, che tipo di lavori seguite, come gestite rilievo, posa e assistenza. Inserisci solo dati reali: anni di attività, certificazioni, zona servita e punti di forza verificabili."
                      minHeight={160}
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Usa la toolbar per cambiare dimensione testo, font, grassetto, allineamento, liste.
                    </p>
                  </div>
                </div>
              </div>
            )}
            </SrCard>
          </TabsContent>

          {/* ═══ CONSULENTE ══════════════════════════════════════════════════ */}
          <TabsContent value="consulente" className="mt-4 space-y-3">
            <SrCard
              title={'Sezione "La tua consulenza"'}
              description="Frase personale mostrata sotto nome e ruolo del consulente."
              icon={<MessageCircle className="h-4 w-4" />}
            >
            <Label className="text-xs">Descrizione del consulente (mostrata sotto nome + ruolo)</Label>
            <RichTextEditor
              value={form.consulente_descrizione_default ?? ""}
              onChange={(html) => update("consulente_descrizione_default", html || null)}
              placeholder="Es. Ti accompagnerò personalmente dal primo sopralluogo fino al collaudo finale. Per qualunque domanda o necessità, sono il tuo punto di riferimento."
              minHeight={100}
            />
            <p className="text-[10px] text-muted-foreground">
              Frase generica per dare un tono personale. Nome e foto del consulente
              vengono presi automaticamente dal profilo dell'utente che fa il preventivo
              (Impostazioni → Mio profilo → Foto).
            </p>
            </SrCard>
          </TabsContent>

          {/* ═══ RECENSIONI ══════════════════════════════════════════════════ */}
          <TabsContent value="recensioni" className="mt-4 space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                Recensioni nel PDF
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={form.recensioni_attivo !== false}
                  onChange={(e) => update("recensioni_attivo", e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Mostra recensioni
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Le recensioni qui sotto vengono incluse nella pagina finale del PDF solo se
              "Mostra recensioni" è attivo.
            </p>

            {/* Testimonianze */}
            <SrCard
              title="Recensioni e testimonianze"
              description="Pagina 2 del PDF — sezione 'Cosa dicono i nostri clienti'."
              icon={<Quote className="h-4 w-4" />}
              variant="highlight"
            >
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Usa questa pagina solo con testimonianze reali. Se non hai recensioni verificabili,
                lasciala vuota o nascondila: è più professionale di una recensione generica.
              </div>
              <div className="space-y-3">
                {testimonianze.length === 0 && (
                  <SrCallout variant="info">
                    Nessuna recensione caricata. Va bene lasciare la pagina vuota finché non hai testimonianze reali: meglio nessuna recensione che una recensione inventata.
                  </SrCallout>
                )}
                {testimonianze.map((t, idx) => (
                  <Card key={idx} className="bg-orange-50/30 border-orange-200">
                    <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-xs uppercase tracking-wide text-orange-600">
                        Recensione {idx + 1}
                      </CardTitle>
                      <Button size="sm" variant="ghost" onClick={() => setDelTestIdx(idx)} className="h-7 px-2 text-xs text-rose-600">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Rimuovi
                      </Button>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 grid grid-cols-12 gap-2">
                      <div className="col-span-12">
                        <Label className="text-xs">Citazione</Label>
                        <Textarea
                          value={t.quote ?? ""}
                          onChange={(e) => updateTestimonianza(idx, "quote", e.target.value)}
                          placeholder={'"Ci hanno spiegato bene materiali, tempi e posa prima della firma..."'}
                          rows={3}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-4">
                        <Label className="text-xs">Autore</Label>
                        <Input
                          value={t.autore ?? ""}
                          onChange={(e) => updateTestimonianza(idx, "autore", e.target.value)}
                          placeholder="Nome cliente o iniziali reali"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="col-span-6 md:col-span-3">
                        <Label className="text-xs">Città</Label>
                        <Input
                          value={t.citta ?? ""}
                          onChange={(e) => updateTestimonianza(idx, "citta", e.target.value)}
                          placeholder="Città"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="col-span-6 md:col-span-5">
                        <Label className="text-xs">Tipo intervento</Label>
                        <Input
                          value={t.intervento ?? ""}
                          onChange={(e) => updateTestimonianza(idx, "intervento", e.target.value)}
                          placeholder="Tipo intervento"
                          className="h-9 text-xs"
                        />
                      </div>
                      <div className="col-span-12 flex items-center gap-2">
                        {t.foto_url ? (
                          <img src={t.foto_url} alt="" className="h-10 w-10 rounded-full object-cover border" />
                        ) : (
                          <span className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                          </span>
                        )}
                        <label className="text-xs">
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded border cursor-pointer hover:bg-muted">
                            {uploadingTestFoto === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {t.foto_url ? "Cambia foto" : "Foto cliente (opzionale)"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTestimonianzaFotoUpload(idx, f); e.target.value = ""; }}
                          />
                        </label>
                        {t.foto_url && (
                          <button type="button" onClick={() => updateTestimonianza(idx, "foto_url", "")} className="text-xs text-rose-600 hover:underline">
                            Rimuovi
                          </button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button
                  onClick={addTestimonianza}
                  variant="outline"
                  className="w-full border-dashed border-2 border-orange-300 hover:bg-orange-50 gap-1"
                >
                  <Plus className="h-4 w-4" /> Aggiungi recensione
                </Button>
              </div>
            </SrCard>

            <SrCard
              title="Gallery lavori"
              description="Foto di lavori realizzati, mostrate nel PDF."
              icon={<ImageIcon className="h-4 w-4" />}
            >
              <GalleryLavoriEditor
                items={(form.gallery_lavori ?? []) as GalleryLavoroItem[]}
                onChange={(items) => update("gallery_lavori", items)}
                bucket="sr-progetti"
                uploadPath={`${companyId}/gallery-lavori`}
              />
            </SrCard>
          </TabsContent>

          {/* ═══ RENDER AI ═══════════════════════════════════════════════════ */}
          <TabsContent value="render" className="mt-4 space-y-3">
            <SrCard
              title="Disclaimer Render AI"
              description="Testo legale mostrato sotto i render generati con l'AI."
              icon={<Sparkles className="h-4 w-4" />}
            >
            <Label className="text-xs">Testo legale sotto i render AI (lascia vuoto per il default)</Label>
            <RichTextEditor
              value={form.render_disclaimer ?? ""}
              onChange={(html) => update("render_disclaimer", html || null)}
              placeholder="Il render AI è una simulazione indicativa pensata per aiutare il cliente a immaginare il risultato estetico. Non sostituisce rilievo tecnico, schede prodotto e verifica di fattibilità."
              minHeight={120}
            />
            </SrCard>
          </TabsContent>

          {/* ═══ CTA FINALE ══════════════════════════════════════════════════ */}
          <TabsContent value="cta" className="mt-4 space-y-3">
            <SrCard
              title={'Box CTA finale "Cosa fare adesso"'}
              description="Chiusura del preventivo con i prossimi passi per il cliente."
              icon={<ListChecks className="h-4 w-4" />}
            >
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12">
                <Label className="text-xs">Titolo del box</Label>
                <Input
                  value={form.pdf_cta_finale_titolo ?? ""}
                  onChange={(e) => update("pdf_cta_finale_titolo", e.target.value || null)}
                  placeholder="Cosa fare adesso (default)"
                  className="h-9 text-xs"
                />
                <PlaceholderChips
                  value={form.pdf_cta_finale_titolo ?? ""}
                  onChange={(v) => update("pdf_cta_finale_titolo", v || null)}
                />
              </div>
              <div className="col-span-12">
                <Label className="text-xs">Passi (uno per riga)</Label>
                <Textarea
                  value={(form.pdf_cta_finale_passi ?? []).join("\n")}
	                  onChange={(e) => {
	                    const lines = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
	                    update("pdf_cta_finale_passi", lines.length > 0 ? lines : null);
	                  }}
	                  rows={5}
	                  placeholder={
	                    "Chiarisci eventuali dubbi tecnici o commerciali\nConferma misure, finiture e condizioni definitive\nFirma il preventivo e versa l'acconto concordato\nAvviamo ordine, produzione e pianificazione della posa"
	                  }
	                  className="text-xs"
	                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Ogni riga è uno step numerato. Lascia vuoto per usare i 4 step default.
                </p>
              </div>
            </div>
            </SrCard>
          </TabsContent>

          {/* ═══ PERCORSO CLIENTE ═══════════════════════════════════════════ */}
          {(() => {
            const percorso = (form.percorso_cliente as SrPercorsoCliente | null) ?? SR_PERCORSO_DEFAULT;
            const updatePercorso = (next: SrPercorsoCliente) => update("percorso_cliente", next);
            const ICONE: Array<{ value: SrPercorsoFase["icona"]; label: string }> = [
              { value: "chiamata", label: "📞 Consulenza" },
              { value: "proposta", label: "📄 Proposta" },
              { value: "produzione", label: "🏭 Produzione" },
              { value: "montaggio", label: "🔧 Montaggio" },
              { value: "custom", label: "✦ Generica" },
            ];
            const totalStep = percorso.fasi.reduce((acc, f) => acc + f.step.length, 0);
            return (
              <TabsContent value="percorso" className="mt-4 space-y-4">
              {/* Toggle attivo + titolo + sottotitolo + counter */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!percorso.attivo}
                    onChange={(e) => updatePercorso({ ...percorso, attivo: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">Mostra pagina nel PDF</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  {percorso.fasi.length} {percorso.fasi.length === 1 ? "fase" : "fasi"} ·{" "}
                  {totalStep} {totalStep === 1 ? "passaggio" : "passaggi"}
                </span>
              </div>

              {percorso.attivo && (
                <>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-xs">Titolo pagina</Label>
                      <Input
                        value={percorso.titolo}
                        onChange={(e) => updatePercorso({ ...percorso, titolo: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-7">
                      <Label className="text-xs">Sottotitolo</Label>
                      <Input
                        value={percorso.sottotitolo}
                        onChange={(e) => updatePercorso({ ...percorso, sottotitolo: e.target.value })}
                        className="h-9 text-xs"
                        placeholder="Frase breve sotto al titolo"
                      />
                    </div>
                  </div>

                  {/* Lista fasi */}
                  <div className="space-y-3">
                    {percorso.fasi.map((fase, fi) => (
                      <div key={fi} className="rounded-lg border bg-card p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="h-7 w-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold">
                            {fi + 1}
                          </span>
                          <Input
                            value={fase.nome}
                            onChange={(e) => {
                              const next = [...percorso.fasi];
                              next[fi] = { ...next[fi], nome: e.target.value };
                              updatePercorso({ ...percorso, fasi: next });
                            }}
                            className="h-8 text-sm font-semibold flex-1 min-w-[180px]"
                            placeholder="Nome fase"
                          />
                          <select
                            value={fase.icona}
                            onChange={(e) => {
                              const next = [...percorso.fasi];
                              next[fi] = { ...next[fi], icona: e.target.value as SrPercorsoFase["icona"] };
                              updatePercorso({ ...percorso, fasi: next });
                            }}
                            className="h-8 text-xs rounded-md border border-input bg-background px-2"
                          >
                            {ICONE.map((ic) => (
                              <option key={ic.value} value={ic.value}>{ic.label}</option>
                            ))}
                          </select>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              const next = percorso.fasi.filter((_, i) => i !== fi);
                              updatePercorso({ ...percorso, fasi: next });
                            }}
                            disabled={percorso.fasi.length <= 1}
                            className="h-8 w-8 text-rose-600"
                            title="Elimina fase"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {/* Step della fase */}
                        <div className="space-y-1 pl-9">
                          {fase.step.map((step, si) => (
                            <div key={si} className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-muted-foreground w-6">
                                {String(si + 1).padStart(2, "0")}
                              </span>
                              <Input
                                value={step}
                                onChange={(e) => {
                                  const nextFasi = [...percorso.fasi];
                                  const nextStep = [...nextFasi[fi].step];
                                  nextStep[si] = e.target.value;
                                  nextFasi[fi] = { ...nextFasi[fi], step: nextStep };
                                  updatePercorso({ ...percorso, fasi: nextFasi });
                                }}
                                className="h-7 text-xs"
                                placeholder="Es. Chiamata conoscitiva"
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  const nextFasi = [...percorso.fasi];
                                  nextFasi[fi] = {
                                    ...nextFasi[fi],
                                    step: nextFasi[fi].step.filter((_, i) => i !== si),
                                  };
                                  updatePercorso({ ...percorso, fasi: nextFasi });
                                }}
                                disabled={fase.step.length <= 1}
                                className="h-7 w-7 text-rose-600"
                                title="Elimina step"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const nextFasi = [...percorso.fasi];
                              nextFasi[fi] = { ...nextFasi[fi], step: [...nextFasi[fi].step, ""] };
                              updatePercorso({ ...percorso, fasi: nextFasi });
                            }}
                            className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="h-3 w-3 mr-1" /> Aggiungi step
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        updatePercorso({
                          ...percorso,
                          fasi: [
                            ...percorso.fasi,
                            { nome: "Nuova fase", icona: "custom", step: [""] },
                          ],
                        });
                      }}
                      className="w-full gap-1 border-dashed border-2"
                    >
                      <Plus className="h-4 w-4" /> Aggiungi fase
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => updatePercorso(SR_PERCORSO_DEFAULT)}
                      className="text-xs text-muted-foreground"
                    >
                      Ripristina template di default
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          );
          })()}

          {/* ═══ CONVERSIONE (CRO playbook) ═════════════════════════════════ */}
          <TabsContent value="conversione" className="mt-4">
            <Suspense fallback={<div className="h-20 flex items-center justify-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Caricamento…</div>}>
              <SerramentiConversionEditor
                form={form}
                update={update}
                companyAnagrafica={companyAnagrafica}
              />
            </Suspense>
          </TabsContent>

          {/* ═══ ORDINE PAGINE ═══════════════════════════════════════════════ */}
          <TabsContent value="ordine-pagine" className="mt-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                Ordine e visibilità delle pagine
              </div>
              <p className="text-[11px] text-muted-foreground">
                Definisci la sequenza delle pagine del PDF preventivo cliente
                e quali mostrare/nascondere. Modifiche visibili in Anteprima PDF.
              </p>
            </div>
            <div className="mt-3">
              <Suspense fallback={<div className="h-20 flex items-center justify-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Caricamento…</div>}>
                <SerramentiPagesOrderEditor
                  value={form.pdf_pages_order ?? null}
                  onChange={(next) => update("pdf_pages_order", next)}
                />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </SrCard>
      </>)}{/* === END SEZIONE PAGINE PDF === */}

      {/* === SEZIONE: METRICHE & PERCHÉ NOI === */}
      {activeSection === "garanzie" && (<>
      <SectionHeader
        title="📊 Metriche & perché noi"
        description="I numeri 'Perché noi' mostrati come big-number nella pagina Proposta del PDF. Le garanzie si modificano nella sezione Conversione."
        number={5}
      />

      {/* Milestone 10: Perché noi data-driven — riga di big-number metriche
          mostrate sopra la lista USP nella pagina "Proposta". Max 4 per
          motivi di layout A4. La metrica "anni di esperienza" può essere
          auto-derivata dall'anno_fondazione dell'azienda. */}
      <SrCard
        title='Metriche "Perché noi" (PDF)'
        description="Big-number card mostrate sopra la lista USP nella pagina 'Proposta'. Max 4. Vuoto = non mostrate. La metrica con auto_anni_fondazione viene calcolata dall'anno di fondazione (sul profilo azienda)."
        icon={<FileText className="h-4 w-4" />}
      >
        <div className="space-y-2">
          {((form.pdf_perche_noi_metriche ?? []) as SrPercheNoiMetrica[]).slice(0, 4).map((m, idx) => {
            const list = (form.pdf_perche_noi_metriche ?? []) as SrPercheNoiMetrica[];
            const setField = <K extends keyof SrPercheNoiMetrica>(field: K, val: SrPercheNoiMetrica[K]) => {
              const next = [...list];
              next[idx] = { ...next[idx], [field]: val };
              update("pdf_perche_noi_metriche", next);
            };
            const removeMetrica = () => {
              update("pdf_perche_noi_metriche", list.filter((_, i) => i !== idx));
            };
            return (
              <div key={idx} className="rounded-md border p-3 grid grid-cols-12 gap-2 bg-slate-50/50 relative">
                <div className="col-span-12 md:col-span-1">
                  <Label className="text-[10px]">Icona</Label>
                  <Input
                    value={m.icon ?? ""}
                    onChange={(e) => setField("icon", e.target.value || null)}
                    className="h-9 text-xs text-center"
                    placeholder="🏗️"
                    maxLength={2}
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <Label className="text-[10px]">Valore</Label>
                  <Input
                    value={m.value}
                    onChange={(e) => setField("value", e.target.value)}
                    className="h-9 text-xs"
                    placeholder="127"
                    disabled={m.auto_kind === "auto_anni_fondazione"}
                  />
                </div>
                <div className="col-span-6 md:col-span-2">
                  <Label className="text-[10px]">Suffisso</Label>
                  <Input
                    value={m.suffix ?? ""}
                    onChange={(e) => setField("suffix", e.target.value || null)}
                    className="h-9 text-xs"
                    placeholder="+ oppure /10"
                  />
                </div>
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-[10px]">Etichetta</Label>
                  <Input
                    value={m.label}
                    onChange={(e) => setField("label", e.target.value)}
                    className="h-9 text-xs"
                    placeholder="cantieri completati"
                  />
                </div>
                <div className="col-span-9 md:col-span-2">
                  <Label className="text-[10px]">Tipo</Label>
                  <select
                    value={m.auto_kind ?? ""}
                    onChange={(e) => setField("auto_kind", (e.target.value || null) as SrPercheNoiMetrica["auto_kind"])}
                    className="h-9 w-full text-xs rounded-md border bg-background px-2"
                  >
                    <option value="">Manuale</option>
                    <option value="auto_anni_fondazione">Auto · anni fondazione</option>
                  </select>
                </div>
                <div className="col-span-3 md:col-span-1 flex items-end">
                  <Button type="button" variant="ghost" size="sm" onClick={removeMetrica} className="h-9 w-full text-xs text-red-600 hover:text-red-700">
                    Elimina
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap justify-between items-center gap-2 pt-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const list = (form.pdf_perche_noi_metriche ?? []) as SrPercheNoiMetrica[];
                  if (list.length >= 4) return;
                  update("pdf_perche_noi_metriche", [...list, { value: "", label: "", icon: null, suffix: null, auto_kind: null }]);
                }}
                disabled={((form.pdf_perche_noi_metriche ?? []) as SrPercheNoiMetrica[]).length >= 4}
                className="text-xs"
              >
                + Aggiungi metrica
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => update("pdf_perche_noi_metriche", SR_PERCHE_NOI_METRICHE_DEFAULT)}
                className="text-xs"
              >
                Usa preset suggerito
              </Button>
              {((form.pdf_perche_noi_metriche ?? []) as SrPercheNoiMetrica[]).length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => update("pdf_perche_noi_metriche", [])}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Svuota
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Compila <strong>anno di fondazione</strong> nel profilo azienda per usare la metrica auto.
            </p>
          </div>
        </div>
      </SrCard>
      </>)}{/* === END SEZIONE GARANZIE & METRICHE === */}

      {/* === SEZIONE: CONDIZIONI CONTRATTUALI === */}
      {activeSection === "condizioni" && (<>
      <SectionHeader
        title="📜 Condizioni contrattuali"
        description="I termini di vendita stampati come pagina dedicata in fondo al preventivo PDF. Puoi partire da un template salvato in libreria, dal modello standard o scrivere da zero."
      />

      {/* ── Libreria condivisa ─────────────────────────────────────────── */}
      <SrCard
        title="Libreria Template offerte"
        description={'Riusa i blocchi "Condizioni e termini legali" già salvati (clausole + privacy, recesso, foro). Puoi applicarli direttamente qui senza passare per altri tab.'}
        icon={<FileText className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <select
              value={selectedSharedLegalId}
              onChange={(e) => setSelectedSharedLegalId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-xs"
            >
              <option value="">
                {sharedLegalTemplates.length > 0
                  ? "Seleziona un blocco dalla tua libreria…"
                  : "Nessun blocco salvato ancora — scrivi le condizioni e salvale sotto"}
              </option>
              {sharedLegalTemplates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.kind === "condizioni" ? "📜 Condizioni e termini legali" : "⚖️ Termini legali (vecchio tipo)"} · {tpl.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedSharedLegalId}
                onClick={() => {
                  const tpl = sharedLegalTemplates.find((t) => t.id === selectedSharedLegalId);
                  if (tpl) applySharedLegalTemplate(tpl.id, "replace");
                }}
              >
                Sostituisci testo
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedSharedLegalId}
                onClick={() => {
                  const tpl = sharedLegalTemplates.find((t) => t.id === selectedSharedLegalId);
                  if (tpl) applySharedLegalTemplate(tpl.id, "append");
                }}
              >
                Aggiungi in coda
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              disabled={!form.condizioni_legali_testo?.trim() || upsertQuoteTemplate.isPending}
              onClick={() => saveSharedLegalTemplate("condizioni")}
            >
              Salva nella libreria come "Condizioni e termini legali"
            </Button>
          </div>
        </div>
      </SrCard>

      {/* ── Testo condizioni ───────────────────────────────────────────── */}
      <SrCard>
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <Switch
              checked={form.condizioni_legali_attivo !== false}
              onCheckedChange={(checked) => update("condizioni_legali_attivo", checked)}
            />
            <span className="text-sm font-medium">Mostra la pagina &ldquo;Condizioni&rdquo; nel PDF</span>
          </label>
          {form.condizioni_legali_attivo !== false && (
            <>
              <ImportaCondizioniBar
                soloImport
                compatto
                companyId={companyId}
                testoAttuale={String(form.condizioni_legali_testo ?? "")}
                onTesto={(md) => update("condizioni_legali_testo", md)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const cur = String(form.condizioni_legali_testo ?? "").trim();
                  if (cur && !window.confirm("Sovrascrivere il testo attuale con il modello standard serramentista?")) return;
                  update("condizioni_legali_testo", CONDIZIONI_STANDARD_SERRAMENTI);
                }}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Inserisci modello standard serramentista
              </Button>
              <Textarea
                value={form.condizioni_legali_testo ?? ""}
                onChange={(e) => update("condizioni_legali_testo", e.target.value || null)}
                placeholder={
                  "Es.\n1. PAGAMENTO — 30% acconto alla firma, saldo alla consegna.\n" +
                  "2. TEMPI — Consegna stimata in X giorni lavorativi.\n" +
                  "3. GARANZIA — 10 anni prodotto, 10 anni posa (UNI 11673).\n" +
                  "4. RECESSO — entro 14 giorni (D.Lgs. 206/2005), salvo beni su misura.\n" +
                  "5. FORO COMPETENTE — Foro della sede legale."
                }
                rows={16}
                className="text-xs font-mono"
              />
              <PlaceholderChips
                value={form.condizioni_legali_testo ?? ""}
                onChange={(v) => update("condizioni_legali_testo", v || null)}
              />
              <p className="text-[11px] text-muted-foreground">
                Puoi usare segnaposto come {"{cliente_nome_completo}"}.
                Salva il testo nella libreria (sopra) per riutilizzarlo in altri template.
              </p>
            </>
          )}

          {/* Firma online — rimasto dalla vecchia sezione Conversione */}
          <div className="border-t pt-3 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={!!form.pdf_mostra_firma_online}
                onCheckedChange={(checked) => update("pdf_mostra_firma_online", checked)}
              />
              <div>
                <span className="text-sm font-medium">Mostra blocco &ldquo;Firma e conferma online&rdquo; nel PDF</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Aggiunge nel preventivo il link alla pagina pubblica per la conferma digitale. Disattivo di default.
                </p>
              </div>
            </label>
          </div>
        </div>
      </SrCard>
      </>)}{/* === END SEZIONE CONDIZIONI CONTRATTUALI === */}

      {/* === SEZIONE: DEFAULT TECNICI === */}
      {activeSection === "default" && (<>
      <SectionHeader
        title="⚙️ Default tecnici"
        description="Valori di partenza usati su ogni nuovo preventivo: validità offerta, anticipo, IVA."
        number={6}
      />

      <SrCard title="Default economia" icon={<Clock className="h-4 w-4" />}>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs">Validità offerta (giorni)</Label>
            <Input
              type="number"
              value={form.valido_giorni_default ?? 15}
              onChange={(e) => update("valido_giorni_default", Number(e.target.value) || 15)}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Numero giorni di validità del preventivo dopo l'invio al cliente.
            </p>
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs">Anticipo % default</Label>
            <Input
              type="number" min={0} max={100} step={5}
              value={form.anticipo_pct_default ?? 40}
              onChange={(e) => update("anticipo_pct_default", Number(e.target.value) || 40)}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Percentuale di acconto pre-impostata in ogni nuovo preventivo.
            </p>
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs">IVA % default</Label>
            <Input
              type="number"
              value={form.iva_percentuale_default ?? 22}
              onChange={(e) => update("iva_percentuale_default", Number(e.target.value) || 22)}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Aliquota IVA standard (22% in Italia). Personalizzabile per ristrutturazioni 10%.
            </p>
          </div>
          {/* Campi giorni produzione/posa/collaudo rimossi: dopo aver tolto
              il cronoprogramma dal PDF e dal wizard (Fase 1), questi default
              non hanno più destinazione user-facing. Restano nel DB ma il
              consulente non li vede né li modifica. */}
        </div>
      </SrCard>
      </>)}{/* === END SEZIONE DEFAULT === */}

        </div>{/* /content-panel */}

        {/* ── ANTEPRIMA LIVE PDF — colonna persistente (desktop xl), sotto su tablet.
            Mostra il PDF vero completo (tutte le pagine) e si aggiorna ~1s dopo
            ogni modifica, così l'utente vede il risultato mentre lavora. ── */}
        <aside className="col-span-12 xl:col-span-4 min-w-0">
          <div className="xl:sticky xl:top-[68px] xl:self-start xl:h-[calc(100vh-96px)] h-[75vh]">
            <SerramentiLivePreviewPanel
              template={form}
              companyName={form.ragione_sociale}
              companyLogoUrl={form.logo_url}
              companyLogoDarkUrl={brand?.brand_logo_dark_url ?? null}
              companyIndirizzo={form.indirizzo_completo}
              activeSection={sectionToPdfTab(activeSection) ?? undefined}
            />
          </div>
        </aside>
      </div>{/* /grid */}

      {/* Sticky footer: mantiene solo il salvataggio sempre raggiungibile.
          L'anteprima PDF resta accessibile dalla sidebar/header, senza duplicare
          un bottone fisso in basso che copreva la lettura delle impostazioni. */}
      <div className="sticky bottom-4 flex justify-end gap-3 z-10 pointer-events-none">
        <Button
          onClick={handleSave}
          disabled={!dirty || upsertMut.isPending}
          className="bg-orange-600 hover:bg-orange-500 gap-1 shadow-lg pointer-events-auto"
          size="lg"
        >
          {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva impostazioni
        </Button>
      </div>

      {/* Dialog anteprima PDF — generato on-the-fly con dati demo + template corrente.
          PERF: render condizionale `{previewOpen && ...}` per non montare mai il
          dialog quando l'utente non lo sta usando. Senza questa guard, il dialog
          era sempre montato e i suoi useEffect (con JSON.stringify(template))
          si re-eseguivano ad ogni keystroke nel form padre. */}
      {previewOpen && (
        <Suspense fallback={null}>
          <SerramentiTemplatePreviewDialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            template={form}
            companyName={form.ragione_sociale}
            companyLogoUrl={form.logo_url}
            companyLogoDarkUrl={brand?.brand_logo_dark_url ?? null}
            companyIndirizzo={form.indirizzo_completo}
          />
        </Suspense>
      )}

      {/* M16 · Dialog galleria immagini stock (18 immagini Unsplash) */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 pb-3 border-b">
            <DialogTitle className="text-base">📷 Galleria immagini stock</DialogTitle>
            <DialogDescription className="text-xs">
              Click su un'immagine per usarla come sfondo cover. Tutte le immagini sono
              libere da licenza (Unsplash) — uso commerciale incluso.
            </DialogDescription>
            {/* Filtri categoria */}
            <div className="flex flex-wrap gap-1 pt-2">
              {COVER_STOCK_CATEGORIE.map((cat) => {
                const isActive = stockCategory === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setStockCategory(cat.value)}
                    className={
                      "text-[11px] px-2 py-1 rounded-md border transition-all gap-1 inline-flex items-center " +
                      (isActive
                        ? "bg-orange-500 text-white border-orange-500 font-semibold"
                        : "bg-white border-slate-200 hover:border-orange-300 text-slate-700")
                    }
                  >
                    <span>{cat.emoji}</span>
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {stockFiltered.map((img) => {
                const isActive = form.pdf_cover_image_url === img.url;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => applyStockImage(img)}
                    className={
                      "group relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all focus:outline-none focus:ring-2 focus:ring-orange-400 " +
                      (isActive
                        ? "border-orange-500 shadow-md ring-2 ring-orange-300"
                        : "border-slate-200 hover:border-orange-300 hover:shadow-sm")
                    }
                    title={img.label}
                  >
                    <img
                      src={img.thumb}
                      alt={img.label}
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                      <span className="text-[10px] font-semibold text-white">{img.label}</span>
                    </div>
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center shadow">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {stockFiltered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nessuna immagine in questa categoria.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={delTestIdx !== null} onOpenChange={(o) => !o && setDelTestIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere la recensione?</AlertDialogTitle>
            <AlertDialogDescription>
              Non comparirà più nei nuovi preventivi. I preventivi già generati non saranno modificati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => delTestIdx !== null && removeTestimonianza(delTestIdx)}
            >
              Rimuovi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateQualityPanel({ items }: { items: TemplateQualityItem[] }) {
  const critical = items.filter((item) => item.level === "critical");
  const warnings = items.filter((item) => item.level === "warning");
  const isReady = critical.length === 0 && warnings.length === 0;
  const visibleItems = isReady ? items : [...critical, ...warnings].slice(0, 5);

  return (
    <div
      className={
        "rounded-lg border p-3 shadow-sm " +
        (isReady
          ? "border-emerald-200 bg-emerald-50/70"
          : critical.length > 0
            ? "border-rose-200 bg-rose-50/70"
            : "border-amber-200 bg-amber-50/70")
      }
    >
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-2 min-w-0">
          <div
            className={
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border " +
              (isReady
                ? "border-emerald-200 bg-white text-emerald-700"
                : critical.length > 0
                  ? "border-rose-200 bg-white text-rose-700"
                  : "border-amber-200 bg-white text-amber-700")
            }
          >
            {isReady ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">Controllo qualità template</p>
              <Badge variant="outline" className={isReady ? "border-emerald-300 text-emerald-700" : critical.length > 0 ? "border-rose-300 text-rose-700" : "border-amber-300 text-amber-700"}>
                {isReady ? "Pronto" : `${critical.length} errori · ${warnings.length} avvisi`}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              {isReady
                ? "I blocchi principali sono compilati e non risultano bozze evidenti."
                : "Prima di inviare un preventivo, controlla questi punti: non bloccano il lavoro, ma evitano PDF generici o poco credibili."}
            </p>
          </div>
        </div>
      </div>

      {!isReady && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {visibleItems.map((item) => (
            <div
              key={`${item.level}-${item.section ?? "generale"}-${item.title}`}
              className="rounded-md border border-white/80 bg-white/75 px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <span className={item.level === "critical" ? "mt-0.5 text-rose-600" : "mt-0.5 text-amber-600"}>
                  {item.level === "critical" ? "●" : "•"}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-900">{item.title}</p>
                    {item.section && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        {item.section}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">{item.detail}</p>
                </div>
              </div>
            </div>
          ))}
          {[...critical, ...warnings].length > visibleItems.length && (
            <div className="rounded-md border border-white/80 bg-white/60 px-3 py-2 text-[11px] text-slate-600">
              + {[...critical, ...warnings].length - visibleItems.length} altri punti da controllare nelle sezioni laterali.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SectionHeader ───────────────────────────────────────────────────────────
// Helper visivo che divide l'editor in macro-sezioni numerate. Aiuta l'utente
// a orientarsi su una pagina che altrimenti sembrerebbe un muro di SrCard.

function SectionHeader({
  title, description, number,
}: {
  title: string;
  description: string;
  number: number;
}) {
  return (
    <div className="flex items-start gap-3 pt-3 pb-1 border-t-2 border-orange-100 first:border-t-0 first:pt-0">
      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
        {number}
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-bold text-slate-900 leading-tight">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}
