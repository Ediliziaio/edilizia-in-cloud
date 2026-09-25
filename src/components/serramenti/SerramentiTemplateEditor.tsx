import { TemplateSectionNavigation } from "@/components/preventivi/TemplateSectionNavigation";
import { SerramentiCoverLayoutPicker } from "./SerramentiCoverLayoutPicker";
import { orderedSectionExcluded } from "@/components/preventivi/templateNavigationState";
import { TemplateCoverDesignControls, COVER_DESIGN_CHOICES } from "@/components/preventivi/TemplateCoverDesignControls";
import { TemplateImageFieldView } from "@/components/preventivi/TemplateImageFieldView";
import { TemplateCoverStylePicker, TemplateCoverTextFields, coverStyleOnly } from "@/components/preventivi/TemplateCoverControls";
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
import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense, type ReactNode } from "react";
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
import { CampoFotoModello } from "@/components/preventivi/CampoFotoModello";
import { templateEditorLayout, TemplateEditorSaveBar, TemplateEditorWorkspace, TemplateEditorNavigation } from "@/components/preventivi/TemplateEditorLayout";
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
import { StandardTextTemplatePicker } from "@/components/preventivi/StandardTextTemplatePicker";
import { InterventionTextPicker } from "@/components/preventivi/modules/InterventionTextPicker";
import { serramentiCopyChoices } from "@/lib/moduli-vendita/serramentiInterventionCopy";
import { serramentiModuleExclusions } from "@/lib/moduli-vendita/serramentiOfferScope";
import type { AiTemplateDraft } from "@/components/preventivi/AiTemplateReviewDialog";
import { useCompanyAnagraficaForTemplate, inheritedPlaceholder, type TemplateCompanyAnagrafica } from "@/hooks/useCompanyAnagraficaForTemplate";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { ImportaCondizioniBar } from "@/components/quote-templates/ImportaCondizioniBar";
import { fotoDellaLibreria } from "../../../supabase/functions/_shared/blocchiPreventivo";
import { useBrandSettings } from "@/hooks/useBrandSettings";
import { SerramentiLivePreviewPanel } from "@/components/serramenti/SerramentiLivePreviewPanel";
import { useTemplatePdf, useUpsertTemplatePdf } from "@/lib/serramenti/queries";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { SrCard, SrCallout } from "@/lib/serramenti/wizardUI";
import { MacroPagineDedicateManager } from "@/components/listino/MacroPagineDedicateManager";
import { FileText } from "lucide-react";
import type { SrTemplatePdfRow, SrEsigenza, SrSoluzioneItem, SrTestimonianza, SrPercorsoCliente, SrPercorsoFase, SrGaranzia } from "@/types/serramenti";
import { SR_PERCORSO_DEFAULT, SR_GARANZIE_DEFAULT, SR_FAQ_DEFAULT, SR_PERCHE_NOI_METRICHE_DEFAULT, normalizePdfPagesOrder, type SrPercheNoiMetrica } from "@/types/serramenti";
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
// M16 · Galleria immagini curate EiC per cover
import { COVER_STOCK_IMAGES, COVER_STOCK_CATEGORIE, type CoverStockImage } from "./coverStockImages";
// M20 · Palette colore intelligente (brand variations + curate)
import { generateBrandPalette, CURATED_PALETTES } from "@/lib/utils/colorPalette";
import { GalleryLavoriEditor } from "@/components/shared/GalleryLavoriEditor";
import { ContenutoPagina } from "@/components/preventivi/ContenutoPagina";
import { conPaginaVisibile, paginaEditor, PAGINE_EDITOR_SERRAMENTI } from "@/components/preventivi/pagineEditor";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { riferimentoImmagine } from "@/lib/storage/immaginiModelloPdf";
import type { GalleryLavoroItem } from "@/types/gallery";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { readLocalTemplateImage } from "@/lib/moduli-vendita/localTemplateImage";
import { findSerramentiTemplateModule, type SerramentiTemplateModuleId } from "@/lib/moduli-vendita/serramentiTemplateModules";
import { createFullSerramentiTemplate } from "@/lib/moduli-vendita/fullSerramentiModules";

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

function buildTemplateQualityItems(
  form: Partial<SrTemplatePdfRow>,
  companyAnagrafica?: Pick<TemplateCompanyAnagrafica, "ragione_sociale" | "telefono" | "email"> | null,
): TemplateQualityItem[] {
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

  const ragioneSocialeEffettiva = form.ragione_sociale || companyAnagrafica?.ragione_sociale;
  const telefonoEffettivo = form.telefono || companyAnagrafica?.telefono;
  const emailEffettiva = form.email || companyAnagrafica?.email;

  if (!hasReadableText(ragioneSocialeEffettiva, 3)) {
    items.push({
      level: "warning",
      title: "Ragione sociale mancante",
      detail: "Aggiungi il nome azienda: rende il PDF più riconoscibile e professionale.",
      section: "Brand",
    });
  }
  if (!hasReadableText(telefonoEffettivo, 6) && !hasReadableText(emailEffettiva, 6)) {
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
      section: "Dicono di noi",
    });
  }
  if (recensioni.length > 0 && recensioni.some((r) => !hasReadableText(r.quote, 35) || !hasReadableText(r.autore, 2) || isReviewDraft(r))) {
    items.push({
      level: "critical",
      title: "Recensioni da verificare",
      detail: "Una o più recensioni sembrano bozze o mancano di autore/testo reale. Sistemarle prima di inviare il PDF.",
      section: "Dicono di noi",
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
      section: "Le nostre garanzie",
    });
  }
  if (faq.filter((f) => hasReadableText(f.domanda, 10) && hasReadableText(f.risposta, 35)).length < 4) {
    items.push({
      level: "warning",
      title: "FAQ poco utili",
      detail: "Aggiungi almeno 4 obiezioni reali: prezzo, tempi, misure, posa, render, pagamento.",
      section: "Domande frequenti",
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
  /** Compatibilità con i pannelli incorporati: la barra di salvataggio resta disponibile. */
  embedded?: boolean;
  localModule?: {
    id: SerramentiTemplateModuleId;
    template: Partial<SrTemplatePdfRow>;
    saved: boolean;
    onDirtyChange: (dirty: boolean) => void;
    save: (template: Partial<SrTemplatePdfRow>) => void;
  };
}

export function SerramentiTemplateEditor({ embedded: _embedded = false, localModule }: SerramentiTemplateEditorProps) {
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
  const moduleDefaults = useMemo(() => localModule ? createFullSerramentiTemplate(localModule.template, localModule.id) : undefined, [localModule?.id]);

  const [form, setForm] = useState<Partial<SrTemplatePdfRow>>(() => localModule?.template ?? {});
  const [dirty, setDirty] = useState(false);
  const [localSaved, setLocalSaved] = useState(localModule?.saved ?? true);
  const onDirtyChange = localModule?.onDirtyChange;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  // Preset stili copertina: collassati di default (occupavano troppo spazio in cima).
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
  const qualityItems = useMemo(() => {
    const items = buildTemplateQualityItems(form, companyAnagrafica);
    if (localModule && (!form.condizioni_legali_attivo || !form.condizioni_legali_testo?.trim())) {
      items.unshift({ level: "critical", title: "Condizioni dell'offerta da completare", detail: "Prima dell'invio, inserisci e verifica i testi approvati dall'azienda: pagamenti, validità, inclusioni, esclusioni e condizioni applicabili. Il modello locale non è ancora collegato al preventivatore.", section: "Condizioni contrattuali" });
    }
    return items;
  }, [form, companyAnagrafica, !!localModule]);
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
    if (localModule) return;
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
  }, [template, isLoading, localModule]);

  // PERF: useCallback stabilizza l'identity di `update` tra i re-render.
  // Senza, ogni keystroke creava una nuova function reference → i sub-editor
  // memoizzati (ConversionEditor, PagesOrderEditor) si re-renderizzavano
  // comunque perché la prop cambiava. Con useCallback (deps vuote, setState
  // funzionale + setDirty sono entrambi stabili) la reference è permanente.
  const update = useCallback(<K extends keyof SrTemplatePdfRow>(key: K, value: SrTemplatePdfRow[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  // I blocchi del preventivo (come è fatto un serramento, protezione…) si
  // modificano dall'ordine delle pagine. Callback stabili: l'editor delle pagine è memoizzato.
  const aggiornaBlocchi = useCallback((v: Record<string, unknown>) => update("pdf_blocchi", v), [update]);
  const campoFotoBlocco = useCallback((valore: string | null, onChange: (url: string | null) => void) => (
    <CampoFotoModello localOnly={!!localModule} valore={valore} onChange={onChange} bucket="sr-progetti" cartella={companyId ? `${companyId}/template-blocchi` : null} />
  ), [companyId, localModule]);

  // Mappa il draft AI (13 campi generici) sui campi del template Serramenti.
  const applyGeneratedSr = useCallback((d: AiTemplateDraft) => {
    const toText = (h?: string | null) => (h ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (d.cover_title) update("pdf_cover_hero", d.cover_title);
    if (d.cover_subtitle) update("pdf_cover_subhero", d.cover_subtitle);
    if (d.chi_siamo) update("chi_siamo_testo", toText(d.chi_siamo));
    if (d.esigenze?.length) update("esigenze_default", d.esigenze.map((i) => ({ titolo: i.titolo, descrizione: i.descrizione ?? "" })));
    if (d.soluzione?.length) update("soluzione_default", d.soluzione.map((i) => ({ titolo: i.titolo, descrizione: i.descrizione ?? "" })));
    if (d.usp?.length) update("perche_noi_default", d.usp.map((i) => (i.descrizione ? `${i.titolo}: ${i.descrizione}` : i.titolo)));
    if (d.garanzie?.length) update("garanzie", d.garanzie.map((g) => ({ icona: "shield" as const, titolo: g.titolo, descrizione: g.descrizione ?? "" })));
    if (d.faq?.length) update("faq_items", d.faq.map((f) => ({ domanda: f.domanda, risposta: f.risposta })));
    if (d.percorso?.length) update("prossimi_passi_default", d.percorso.map((item) => `${item.titolo}${item.descrizione ? `: ${item.descrizione}` : ""}`));
    if (d.payment_terms_text || d.validity_text) {
      update("condizioni_legali_attivo", true);
      update("condizioni_legali_testo", [d.payment_terms_text, d.validity_text].filter(Boolean).map(toText).join("\n\n"));
    }
    const validityDays = d.validity_text?.match(/(\d+)\s*giorni/i)?.[1];
    if (validityDays) update("valido_giorni_default", Number(validityDays));
    if (d.footer_text) update("pdf_cta_finale_passi", [toText(d.footer_text)]);
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
    if (localModule) { toast.info("Dai modelli della libreria le condizioni non si salvano tra quelle condivise."); return; }
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
  }, [form.condizioni_legali_testo, upsertQuoteTemplate, localModule]);

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
    if (localModule) {
      try {
        if (companyId !== localModule.template.company_id) throw new Error("L'azienda è cambiata. Riapri il modulo.");
        if (!form.pdf_cover_hero?.trim()) throw new Error("Inserisci un titolo di copertina.");
        localModule.save(form);
        setLocalSaved(true);
        setDirty(false);
        toast.success("Modello salvato");
      } catch (error) { toast.error(error instanceof Error ? error.message : "Salvataggio non riuscito."); }
      return;
    }
    upsertMut.mutate(form, {
      onSuccess: () => setDirty(false),
    });
  };

  // ─── M12 · Applica preset cover ────────────────────────────────────────
  // Setta in batch tutti i campi pdf_cover_* del preset selezionato.
  // L'immagine sfondo NON viene toccata (è un asset uploadato).
  const applyCoverPreset = useCallback((presetId: string) => {
    const preset = COVER_PRESETS.find(item => item.id === presetId);
    if (!preset) return;
    setForm(prev => prev ? { ...prev, ...coverStyleOnly(preset.patch) } : prev);
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
    // Le pagine nuove del documento, una sezione ciascuna (vedi pagineEditor.ts).
    | "page_come_funziona" | "page_protezione" | "page_controlli" | "page_documenti" | "page_diario"
    | "page_garanzie" | "page_confronto" | "page_lavori" | "page_faq"
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
        { id: "brand", label: "Azienda e stile", emoji: "🏢", descr: "Logo, colori, anagrafica" },
      ],
    },
    {
      label: "Pagine del PDF",
      // Una sezione per pagina, nell'ordine in cui escono nel documento: le pagine nuove
      // stanno qui come le altre, non solo in «Ordine pagine» (vedi pagineEditor.ts).
      items: PAGINE_EDITOR_SERRAMENTI.map((p) => ({ id: p.id as EditorSection,
        label: p.voce,
        emoji: p.emoji,
        descr: localModule && p.id === "page_come_funziona" ? "Caratteristiche e scelte di questo intervento" : p.descrizione })),
    },
    {
      label: "Dati & contenuti",
      items: [
        { id: "contenuti", label: "Contenuti commerciali", emoji: "📝", descr: "Esigenze, USP, incluso" },
        { id: "macro",     label: "Linee prodotto",        emoji: "📦", descr: "Pagine dedicate macrocategoria" },
        { id: "garanzie",  label: "Metriche & perché noi",  emoji: "📊", descr: "Numeri e USP della pagina proposta" },
        { id: "condizioni", label: "Condizioni contrattuali", emoji: "📜", descr: "Termini di vendita nel PDF" },
        { id: "default",   label: "Impostazioni tecniche", emoji: "⚙️", descr: "IVA, anticipo, validità" },
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
  // Le sezioni che c'erano già stanno nella scheda con le linguette; le pagine nuove
  // hanno la loro, più sotto.
  const isPageSection = (s: EditorSection) => s.startsWith("page_") && (paginaEditor("serramenti", s)?.esistente ?? false);
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


  // ─── M16 · Stock images dialog state ───────────────────────────────────
  // Dialog modale per scegliere fra le immagini locali curate. Categoria
  // filtrabile, click → setta pdf_cover_image_url con un asset riproducibile.
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [stockCategory, setStockCategory] = useState<CoverStockImage["categoria"] | "all">("all");
  const stockFiltered = useMemo(
    () => localModule && moduleDefaults?.pdf_blocchi?.modulo_foto ? fotoDellaLibreria("serramenti", moduleDefaults.pdf_blocchi).map((f, i): CoverStockImage => ({ id: `modulo-${i}`, url: f.url, thumb: f.url, label: f.nome, categoria: "serramenti" })) : stockCategory === "all"
      ? COVER_STOCK_IMAGES
      : COVER_STOCK_IMAGES.filter((img) => img.categoria === stockCategory),
    [stockCategory, localModule, moduleDefaults],
  );
  const applyStockImage = useCallback((img: CoverStockImage) => {
    setForm((prev) => ({ ...prev, pdf_cover_image_url: img.url }));
    setDirty(true);
    setStockDialogOpen(false);
    toast.success(`Immagine "${img.label}" impostata`);
  }, []);

  // ─── Logo upload ──────────────────────────────────────────────────────────
  const handleLogoUpload = async (file: File) => {
    if (localModule) {
      try { update("logo_url", await readLocalTemplateImage(file)); } catch (error) { toast.error(String(error)); }
      return;
    }
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

      // Nel modello il percorso del file, non un link firmato che scade: si
      // firma quando serve (supabase/functions/_shared/immaginiModelloPdf.ts).
      update("logo_url", riferimentoImmagine("sr-progetti", storagePath));
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
   * (bucket sr-progetti, nel modello il percorso del file). Salva in chi_siamo_foto_url.
   */
  const handleChiSiamoUpload = async (file: File) => {
    if (localModule) {
      try { update("chi_siamo_foto_url", await readLocalTemplateImage(file)); } catch (error) { toast.error(String(error)); }
      return;
    }
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

      update("chi_siamo_foto_url", riferimentoImmagine("sr-progetti", storagePath));
      toast.success("Foto azienda caricata. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] chi-siamo upload", e);
      toast.error("Errore upload foto", { description: String(e) });
    } finally {
      setUploadingChiSiamo(false);
      if (chiSiamoInputRef.current) chiSiamoInputRef.current.value = "";
    }
  };

  /** Upload foto opzionale di una recensione. Stesso pattern (bucket sr-progetti,
   *  nel modello il percorso del file). Salva in testimonianze_default[idx].foto_url. */
  const [uploadingTestFoto, setUploadingTestFoto] = useState<number | null>(null);
  const [selectedSharedLegalId, setSelectedSharedLegalId] = useState("");
  const handleTestimonianzaFotoUpload = async (idx: number, file: File) => {
    if (localModule) {
      try { updateTestimonianza(idx, "foto_url", await readLocalTemplateImage(file)); } catch (error) { toast.error(String(error)); }
      return;
    }
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
      updateTestimonianza(idx, "foto_url", riferimentoImmagine("sr-progetti", storagePath));
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
   * Stesso pattern logo/chi-siamo: bucket sr-progetti, nel modello il percorso del file.
   */
  const handleCoverUpload = async (file: File) => {
    if (localModule) {
      try { update("pdf_cover_image_url", await readLocalTemplateImage(file)); } catch (error) { toast.error(String(error)); }
      return;
    }
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

      update("pdf_cover_image_url", riferimentoImmagine("sr-progetti", storagePath));
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
    if (localModule) {
      try { update("pdf_cover_logo_url", await readLocalTemplateImage(file)); } catch (error) { toast.error(String(error)); }
      return;
    }
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

      update("pdf_cover_logo_url", riferimentoImmagine("sr-progetti", storagePath));
      toast.success("Logo copertina caricato. Salva per applicare.");
    } catch (e) {
      console.error("[serramenti-template-editor] cover logo upload", e);
      toast.error("Errore upload logo copertina", { description: String(e) });
    } finally {
      setUploadingCoverLogo(false);
      if (coverLogoInputRef.current) coverLogoInputRef.current.value = "";
    }
  };

  if (!localModule && isLoading) {
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
    moduleField,
  }: {
    label: string;
    presets: { label: string; value: T }[];
    currentValue: T;
    onApply: (v: T) => void;
    moduleField?: keyof SrTemplatePdfRow;
  }) => {
    const choices = moduleDefaults && moduleField
      ? [{ label: "Testi dedicati a questo intervento", value: moduleDefaults[moduleField] as T }]
      : presets;
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
          {choices.map((p, i) => (
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

  // Il contenuto delle pagine nuove, per sezione: la sezione lo mostra sotto
  // occhiello, titolo e introduzione della pagina (vedi ContenutoPagina).
  const contenutiPagine: Partial<Record<EditorSection, ReactNode>> = {
    page_recensioni: (
      <div className="space-y-3">
      <label className="flex items-center gap-1.5 cursor-pointer text-xs">
        <input
          type="checkbox"
          checked={form.recensioni_attivo !== false}
          onChange={(e) => update("recensioni_attivo", e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Mostra le parole dei clienti (spento, la pagina mostra solo il voto)
      </label>
      <SrCard
        title="Recensioni e testimonianze"
        description="Escono nella pagina «Dicono di noi» del PDF, sotto il voto su Google o Trustpilot."
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
                    <ImgRiservata src={t.foto_url} alt="" className="h-10 w-10 rounded-full object-cover border" />
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
      </div>
    ),
    page_lavori: (
      <GalleryLavoriEditor
        localOnly={!!localModule}
        items={(form.gallery_lavori ?? []) as GalleryLavoroItem[]}
        onChange={(items) => update("gallery_lavori", items)}
        bucket="sr-progetti"
        uploadPath={`${companyId}/gallery-lavori`}
      />
    ),
    page_garanzie: <SerramentiConversionEditor defaults={moduleDefaults} form={form} update={update} companyAnagrafica={companyAnagrafica} sezioni={["garanzie"]} />,
    page_confronto: <SerramentiConversionEditor defaults={moduleDefaults} form={form} update={update} companyAnagrafica={companyAnagrafica} sezioni={["confronto"]} hideConfrontoVisibility />,
    page_faq: <SerramentiConversionEditor defaults={moduleDefaults} form={form} update={update} companyAnagrafica={companyAnagrafica} sezioni={["faq"]} />,
  };
  // La sezione aperta, se è una pagina del documento, e se la pagina esce.
  const paginaSrBase = paginaEditor("serramenti", activeSection);
  const paginaSr = localModule && paginaSrBase?.id === "page_come_funziona"
    ? { ...paginaSrBase, descrizione: "Caratteristiche e scelte di questo intervento" }
    : paginaSrBase;
  const IconaPaginaSr = paginaSr?.icona ?? ImageIcon;
  const ordinePagineSr = normalizePdfPagesOrder(form.pdf_pages_order ?? null);
  const paginaSrVisibile = paginaSr?.pagina ? !orderedSectionExcluded("serramenti", ordinePagineSr, activeSection, form) : false;

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
            <span className="text-muted-foreground">{localModule ? findSerramentiTemplateModule(localModule.id)?.title : "Template PDF Serramenti"}</span>
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
              {localSaved ? "✓ Salvato" : "Modello pronto · non ancora salvato"}
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
          {localModule && moduleDefaults && <InterventionTextPicker title={moduleDefaults.pdf_cover_eyebrow || "Serramenti"} choices={serramentiCopyChoices(localModule.id, moduleDefaults)} onApply={patch => { setForm(prev => ({ ...prev, ...patch })); setDirty(true); }} />}
          {!localModule && <AiTemplateGenerator
            settoreFn="ai-genera-template-serramenti"
            onApply={applyGeneratedSr}
            className="gap-1.5 h-9 px-3 text-sm bg-orange-500 hover:bg-orange-600"
          />}
          {!localModule && <StandardTextTemplatePicker
            module="serramenti"
            onApply={applyGeneratedSr}
            snapshot={form as unknown as Record<string, unknown>}
            className="h-9 px-3 text-sm"
          />}
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
            disabled={(!dirty && localSaved) || upsertMut.isPending}
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
          - Proporzioni condivise: sidebar / form / preview = 2 / 6 / 4 su desktop xl
          - Il form renderizza solo la sezione attiva
          - Mobile (<md): sidebar collassa in un drawer apribile dall'header
          - Deeplink: ?section=brand|pagine|… per share-friendly URL */}

      {/* Mobile: bottone selettore sezione (hamburger) */}


      <TemplateEditorWorkspace moduleId={localModule?.id}>
        {/* ── SIDEBAR ──────────────────────────────────────────────── */}
        <TemplateEditorNavigation>
          <nav className={templateEditorLayout.navigationPanel}>
            <TemplateSectionNavigation groups={SECTION_GROUPS} activeSection={activeSection} onSelect={setActiveSection} isExcluded={id => orderedSectionExcluded("serramenti", ordinePagineSr, id, form)} />
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
        </TemplateEditorNavigation>

        {/* ── CONTENT PANEL ────────────────────────────────────────── */}
        <div className={templateEditorLayout.content} data-template-content data-template-editor-content="serramenti">

      {/* === SEZIONE: BRAND === */}
      {activeSection === "brand" && (<>
      <SectionHeader
        title="🏢 Azienda e stile"
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
                <ImgRiservata loading="lazy" src={form.logo_url} alt="" className="w-full h-full object-contain p-2" />
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
            moduleField="esigenze_default"
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
        description={localModule ? "Prodotti, componenti e lavorazioni di questo intervento. Personalizza le descrizioni in base a ciò che l'azienda propone realmente." : "Tutte le soluzioni che proponi (su misura, posa qualificata, vetri premium...). Le sceglierai una per una per ogni preventivo."}
        icon={<Sparkles className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<SrSoluzioneItem[]>
            moduleField="soluzione_default"
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
            moduleField="perche_noi_default"
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
            moduleField="incluso_default"
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

      {localModule && <SrCard title="Esclusioni e opere da confermare" description="Questo testo compare vicino al prezzo nel PDF. Indica cosa non è compreso o richiede una voce separata; non sostituisce le condizioni contrattuali." icon={<ListChecks className="h-4 w-4" />}>
        <Label htmlFor="module-exclusions">Esclusioni del modulo</Label>
        <Textarea id="module-exclusions" className="mt-2" rows={4} value={serramentiModuleExclusions(form)} onChange={event => update("pdf_blocchi", { ...form.pdf_blocchi, modulo_esclusioni: event.target.value })} />
        <Button className="mt-2" variant="outline" size="sm" onClick={() => {
          if (window.confirm("Ripristinare le esclusioni di questo intervento? Il testo corrente verrà sostituito nella bozza.")) update("pdf_blocchi", { ...form.pdf_blocchi, modulo_esclusioni: serramentiModuleExclusions(moduleDefaults) });
        }}>Ripristina testo del modulo</Button>
      </SrCard>}

      {/* Prossimi passi */}
      <SrCard
        title="Libreria 'Prossimi passi' (chiusura PDF)"
        description="Tutti i possibili step del tuo processo di vendita. Nel preventivo scegli quali mostrare al cliente specifico."
        icon={<ListChecks className="h-4 w-4" />}
      >
        <div className="flex justify-end mb-3">
          <PresetMenu<string[]>
            moduleField="prossimi_passi_default"
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
        {localModule ? <p className="text-sm text-muted-foreground">Le schede prodotto vengono dal listino del preventivo. Questo modello non modifica il catalogo condiviso.</p> : <MacroPagineDedicateManager vertical="serramentista" />}
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
          {/* The sidebar owns keyboard navigation. These labels only retain
              Radix panel associations; no second invisible focusable menu. */}
          <TabsList className="hidden" aria-hidden="true">
            <TabsTrigger value="cover">Copertina</TabsTrigger>
            <TabsTrigger value="chi-siamo">Chi siamo</TabsTrigger>
            <TabsTrigger value="percorso">Come lavoriamo</TabsTrigger>
            <TabsTrigger value="consulente">Consulente</TabsTrigger>
            <TabsTrigger value="render">Simulazione prima e dopo</TabsTrigger>
            <TabsTrigger value="cta">I prossimi passi</TabsTrigger>
            <TabsTrigger value="conversione">⚡ Conversione</TabsTrigger>
            <TabsTrigger value="ordine-pagine">Ordine e pagine</TabsTrigger>
          </TabsList>

          {/* ═══ COVER ═══════════════════════════════════════════════════════ */}
          <TabsContent value="cover" className="mt-4 space-y-3">
            <SerramentiCoverLayoutPicker value={form.pdf_blocchi} onChange={aggiornaBlocchi} />
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
            <TemplateCoverStylePicker presets={COVER_PRESETS} activeId={activeCoverPresetId} onApply={applyCoverPreset} />
<div className="my-4"><TemplateCoverTextFields value={{ eyebrow: form.pdf_cover_eyebrow, title: form.pdf_cover_hero, subtitle: form.pdf_cover_subhero, dynamicSubtitle: form.pdf_cover_subhero_template }} onChange={(field, value) => { if (field === "eyebrow") { update("pdf_cover_eyebrow", (value ?? "") || null); }
if (field === "title") { update("pdf_cover_hero", (value ?? "") || null); }
if (field === "subtitle") { update("pdf_cover_subhero", (value ?? "") || null); }
if (field === "dynamicSubtitle") { update("pdf_cover_subhero_template", (value ?? "") || null); } }} dynamicSubtitle  placeholders={(value, onChange) => <PlaceholderChips value={value} onChange={onChange}  />} /></div>

            <div className="grid grid-cols-12 gap-4 md:items-start">
              {/* PREVIEW LIVE — formato A4 portrait scalato.
                  REDESIGN pilota: pannello a DESTRA e STICKY (segue lo scroll dei
                  campi, sempre visibile mentre modifichi); larghezza ridotta a col-4
                  per dare più spazio alla parte di creazione (campi a col-8). */}
              {/* Anteprima HTML interna copertina: NASCOSTA — sostituita dal
                  pannello globale "Anteprima live PDF" a destra (mostra tutte le pagine). */}


              {/* CONTROLLI EDITOR — REDESIGN slice 3: raggruppati in card leggibili
                  (Sfondo · Testi); la card "Tipografia & layout" è subito sotto. */}
              <div className="col-span-12 md:order-1 space-y-3">
                {/* ══ Card: Sfondo copertina ══ */}
                <div data-cover-media className="space-y-3"><TemplateImageFieldView imageComponent={ImgRiservata} label="Immagine copertina" value={form.pdf_cover_image_url ?? null} busy={uploadingCover} localOnly={!!localModule} inputRef={coverInputRef} onFile={file => { if (file) return handleCoverUpload(file); }} onRemove={() => update("pdf_cover_image_url", null)} /><Button type="button" size="sm" variant="outline" onClick={() => setStockDialogOpen(true)}>Scegli dalla libreria</Button><div className="col-span-12 md:col-span-4">
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
                          <ImgRiservata
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
                </div></div>{/* ══ fine Card: Sfondo copertina ══ */}

                {/* ══ Card: Testi copertina ══ */}
                {/* ══ fine Card: Testi copertina ══ */}

            {/* ══ Card: Logo, tipografia & layout — dentro la colonna sinistra così
                l'anteprima sticky resta visibile anche mentre modifichi qui ══ */}
            <TemplateCoverDesignControls hasImage={!!form.pdf_cover_image_url} fields={[
{id:"eyebrowSize",kind:"range",value:form.pdf_cover_eyebrow_size ?? 11,min:8,max:20,step:1,unit:"pt",onChange:value=>update("pdf_cover_eyebrow_size", value)},
{id:"titleSize",kind:"range",value:form.pdf_cover_title_size ?? 40,min:22,max:64,step:1,unit:"pt",onChange:value=>update("pdf_cover_title_size", value)},
{id:"subtitleSize",kind:"range",value:form.pdf_cover_subtitle_size ?? 13,min:9,max:22,step:1,unit:"pt",onChange:value=>update("pdf_cover_subtitle_size", value)},
{id:"logoSize",kind:"range",value:form.pdf_cover_logo_size ?? 100,min:60,max:160,step:5,unit:"%",onChange:value=>update("pdf_cover_logo_size", value)},
{id:"overlayOpacity",kind:"range",value:form.pdf_cover_overlay_opacity ?? 65,min:0,max:100,step:5,unit:"%",onChange:value=>update("pdf_cover_overlay_opacity", value)},
{id:"textAlign",kind:"choice",value:form.pdf_cover_text_align ?? "left",choices:COVER_DESIGN_CHOICES.textAlign,onChange:value=>update("pdf_cover_text_align", value as typeof form.pdf_cover_text_align)},
{id:"textVertical",kind:"choice",value:form.pdf_cover_text_vertical ?? "bottom",choices:COVER_DESIGN_CHOICES.textVertical,onChange:value=>update("pdf_cover_text_vertical", value as typeof form.pdf_cover_text_vertical)},
{id:"logoPosition",kind:"choice",value:form.pdf_cover_logo_position ?? "top_left",choices:COVER_DESIGN_CHOICES.logoPosition,onChange:value=>update("pdf_cover_logo_position", value as typeof form.pdf_cover_logo_position)},
{id:"overlayStyle",kind:"choice",value:form.pdf_cover_overlay_style ?? "flat",choices:COVER_DESIGN_CHOICES.overlayStyle,onChange:value=>update("pdf_cover_overlay_style", value as typeof form.pdf_cover_overlay_style)},
{id:"decorationStyle",kind:"choice",value:form.pdf_cover_decoration_style ?? "square",choices:COVER_DESIGN_CHOICES.decorationStyle,onChange:value=>update("pdf_cover_decoration_style", value as typeof form.pdf_cover_decoration_style)},
{id:"textColor",kind:"color",value:form.pdf_cover_text_color,fallback:"#FFFFFF",onChange:value=>update("pdf_cover_text_color", value || null),onReset:()=>update("pdf_cover_text_color", null)},
{id:"backgroundColor",kind:"color",value:form.pdf_cover_bg_color,fallback:"#0F2A2E",onChange:value=>update("pdf_cover_bg_color", value || null),onReset:()=>update("pdf_cover_bg_color", null)},
{id:"eyebrowColor",kind:"color",value:form.pdf_cover_eyebrow_color,fallback:form.colore_primario || "#2D7D5C",onChange:value=>update("pdf_cover_eyebrow_color", value || null),onReset:()=>update("pdf_cover_eyebrow_color", null)},
{id:"titleColor",kind:"color",value:form.pdf_cover_title_color,fallback:form.pdf_cover_text_color || "#FFFFFF",onChange:value=>update("pdf_cover_title_color", value || null),onReset:()=>update("pdf_cover_title_color", null)},
{id:"subtitleColor",kind:"color",value:form.pdf_cover_subtitle_color,fallback:"#D1D5DB",onChange:value=>update("pdf_cover_subtitle_color", value || null),onReset:()=>update("pdf_cover_subtitle_color", null)},
{id:"showDecoration",kind:"toggle",value:form.pdf_cover_show_decoration !== false,onChange:value=>update("pdf_cover_show_decoration", value)},
{id:"showClientCard",kind:"toggle",value:form.pdf_cover_show_client_card !== false,onChange:value=>update("pdf_cover_show_client_card", value)}
]}>{!form.pdf_cover_image_url && (<div className="mt-2 space-y-1.5">
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
                    </div>)}<div className="col-span-12 flex justify-end">
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
                </div></TemplateCoverDesignControls>
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
                      <ImgRiservata loading="lazy"
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
                defaults={moduleDefaults}
                form={form}
                update={update}
                companyAnagrafica={companyAnagrafica}
                sezioni={["urgenza", "certificazioni", "bonus", "firma"]}
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
                  defaults={moduleDefaults?.pdf_pages_order ?? undefined}
                  intervention={!!localModule}
                  value={form.pdf_pages_order ?? null}
                  onChange={(next) => update("pdf_pages_order", next)}
                  blocchi={form.pdf_blocchi}
                  onBlocchi={aggiornaBlocchi}
                  campoFoto={campoFotoBlocco}
                  apriSezione={(sezione) => setActiveSection(sezione as EditorSection)}
                />
              </Suspense>
            </div>
          </TabsContent>
        </Tabs>
      </SrCard>
      </>)}{/* === END SEZIONE PAGINE PDF === */}

      {/* === SEZIONE: LE PAGINE NUOVE ===
          Una sezione per pagina, come le altre (vedi pagineEditor.ts): i blocchi, le
          garanzie, il confronto, i lavori, «Dicono di noi», le domande. Per le pagine
          che una sezione ce l'avevano già (percorso, pagina finale), la loro foto. */}
      {paginaSr && !paginaSr.esistente && (<>
      <SectionHeader title={`${paginaSr.emoji} ${paginaSr.voce}`} description={paginaSr.descrizione} number={4} />
      <SrCard title={paginaSr.voce} icon={<IconaPaginaSr className="h-4 w-4" />}>
        <ContenutoPagina
          pagina={paginaSr}
          motore="serramenti"
          settore="serramenti"
          blocchi={form.pdf_blocchi}
          onBlocchi={aggiornaBlocchi}
          contenuto={contenutiPagine[paginaSr.id as EditorSection]}
          campoFoto={campoFotoBlocco}
          visibile={paginaSr.pagina ? {
            valore: paginaSrVisibile,
            onChange: (v) => {
              update("pdf_pages_order", conPaginaVisibile(ordinePagineSr, paginaSr.pagina as string, v));
              if (paginaSr.id === "page_confronto") update("confronto_attivo", v);
            },
          } : undefined}
        />
      </SrCard>
      </>)}
      {paginaSr?.esistente && paginaSr.foto ? (
        <SrCard title="Foto della pagina" icon={<ImageIcon className="h-4 w-4" />}>
          <ContenutoPagina pagina={paginaSr} motore="serramenti" settore="serramenti" blocchi={form.pdf_blocchi} onBlocchi={aggiornaBlocchi} campoFoto={campoFotoBlocco} soloFoto />
        </SrCard>
      ) : null}

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
        number={5}
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
              disabled={!!localModule || !form.condizioni_legali_testo?.trim() || upsertQuoteTemplate.isPending}
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
                localOnly={!!localModule}
                soloImport
                compatto
                companyId={companyId}
                testoAttuale={String(form.condizioni_legali_testo ?? "")}
                onTesto={(md) => update("condizioni_legali_testo", md)}
              />
              {!localModule && <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const cur = String(form.condizioni_legali_testo ?? "").trim();
                  if (cur && !window.confirm("Sovrascrivere il testo attuale con il modello standard serramentista?")) return;
                  update("condizioni_legali_testo", CONDIZIONI_STANDARD_SERRAMENTI);
                }}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Inserisci modello standard serramentista
              </Button>}
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
              {/* Il modulo di recesso è una scelta dell'azienda, spenta di serie (21/09/2026). */}
              <label className="flex items-start gap-2 cursor-pointer rounded-md border bg-background px-3 py-2">
                <Switch
                  checked={form.modulo_recesso_attivo === true}
                  onCheckedChange={(checked) => update("modulo_recesso_attivo", checked)}
                  aria-label="Allega il modulo di recesso"
                />
                <div>
                  <span className="text-sm font-medium">Allega il modulo di recesso</span>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Serve quando firmi con un privato a casa sua o a distanza (online, al telefono): senza, il cliente può
                    arrivare a recedere fino a 12 mesi dopo, anche a lavori finiti. A chi vende ad aziende o fa firmare in
                    sede non serve.
                  </p>
                </div>
              </label>
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
              onChange={(e) => update("anticipo_pct_default", e.target.value === "" ? 40 : Number(e.target.value))}
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
              onChange={(e) => update("iva_percentuale_default", e.target.value === "" ? 22 : Number(e.target.value))}
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

          <TemplateEditorSaveBar>
            <span role="status" className={dirty ? "text-xs text-amber-600" : "text-xs text-muted-foreground"}>
              {dirty ? "Modifiche non salvate" : localSaved ? "Tutto salvato" : "Modello da salvare"}
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)} className="gap-1.5" aria-label="Apri anteprima PDF">
                <Eye className="h-4 w-4" /> Anteprima PDF
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={(!dirty && localSaved) || upsertMut.isPending}
                className="bg-orange-500 hover:bg-orange-600 gap-1.5"
              >
                {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {localModule ? "Salva modello" : "Salva impostazioni"}
              </Button>
            </div>
          </TemplateEditorSaveBar>
        </div>{/* /content-panel */}

        {/* ── ANTEPRIMA LIVE PDF — colonna persistente (desktop xl), sotto su tablet.
            Mostra il PDF vero completo (tutte le pagine) e si aggiorna ~1s dopo
            ogni modifica, così l'utente vede il risultato mentre lavora. ── */}
        <aside data-template-preview className={templateEditorLayout.preview}>
          <div className={templateEditorLayout.previewPanel}>
            <SerramentiLivePreviewPanel
              moduleId={localModule?.id}
              template={form}
              companyName={form.ragione_sociale}
              companyLogoUrl={form.logo_url}
              companyLogoDarkUrl={brand?.brand_logo_dark_url ?? null}
              companyBrandColor={brand?.brand_primary_color ?? null}
              companyIndirizzo={form.indirizzo_completo}
              activeSection={activeSection}
            />
          </div>
        </aside>
      </TemplateEditorWorkspace>

      {/* Dialog anteprima PDF — generato on-the-fly con dati demo + template corrente.
          PERF: render condizionale `{previewOpen && ...}` per non montare mai il
          dialog quando l'utente non lo sta usando. Senza questa guard, il dialog
          era sempre montato e i suoi useEffect (con JSON.stringify(template))
          si re-eseguivano ad ogni keystroke nel form padre. */}
      {previewOpen && (
        <Suspense fallback={null}>
          <SerramentiTemplatePreviewDialog
            moduleId={localModule?.id}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            template={form}
            companyName={form.ragione_sociale}
            companyLogoUrl={form.logo_url}
            companyLogoDarkUrl={brand?.brand_logo_dark_url ?? null}
            companyBrandColor={brand?.brand_primary_color ?? null}
            companyIndirizzo={form.indirizzo_completo}
          />
        </Suspense>
      )}

      {/* M16 · Dialog galleria immagini curate EiC */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 pb-3 border-b">
            <DialogTitle className="text-base">📷 Galleria immagini stock</DialogTitle>
            <DialogDescription className="text-xs">
              Click su un'immagine per usarla come sfondo cover. Sono immagini
              curate e incluse nella libreria locale del modulo.
            </DialogDescription>
            {/* Filtri categoria */}
            <div className="flex flex-wrap gap-1 pt-2">
              {COVER_STOCK_CATEGORIE.filter(cat => !localModule || cat.value === "all").map((cat) => {
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
