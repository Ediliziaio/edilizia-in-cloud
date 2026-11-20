import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";

const PdfToolkitDialog = lazy(() =>
  import("@/components/documenti/PdfToolkitDialog").then((m) => ({ default: m.PdfToolkitDialog })),
);
import { Link, useNavigate } from "react-router-dom";
import { linkContatto, linkOpportunita } from "@/lib/marketing/linkCrm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  Archive,
  Brain,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Database as DatabaseIcon,
  Download,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Inbox,
  Link2,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { retryWithBackoff } from "@/lib/retryWithBackoff";
import { calcStato as calcStatoHrDoc } from "@/types/hrDocumenti";

import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { UniformSelect } from "@/components/ui/uniform-select";
import { CercaConFiltri, KpiMobili, PannelloFiltri, PilloleFiltro, RigaMobile } from "@/components/mobile/FiltriMobile";
import { CaricaFileDriveDialog } from "@/components/documenti/CaricaFileDriveDialog";
import { attachmentStorage } from "@/components/orders/filePreviewUtils";
import { problemaFile } from "@/lib/commesse/documentiCommessa";
import { SmartDocumentImportModal } from "@/components/documenti/SmartDocumentImportModal";
import { SmartDocumentInboxDialog } from "@/components/documenti/SmartDocumentInboxDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { DriveFileRow, DriveFolderMode } from "@/integrations/supabase/appDatabase";
import { leggiPagineDrive } from "@/lib/leggiPagineDrive";
import type { Database } from "@/integrations/supabase/types";
import { usePermissions } from "@/hooks/usePermissions";
import {
  buildMediaLibraryItem,
  buildDefaultFolderMatchQuery,
  buildMediaLibraryIntegrationCoverage,
  canAccessMediaLibrary,
  combineMediaLibrarySourceBatches,
  createMediaLibraryFolderSlug,
  filterMediaLibraryItemsForPermissions,
  mediaLibraryItemMatchesCustomFolder,
  mediaLibraryItemMatchesSearch,
  mediaLibraryItemMatchesTab,
  pickMediaLibraryDetailItem,
  raggruppaFileDrive,
  resolveMediaLibraryOpenTarget,
  summarizeMediaLibraryItems,
  type MediaLibraryCustomFolderRule,
  type MediaLibraryIntegrationCoverage,
  type MediaLibraryItem,
  type MediaLibraryLoadResult,
  type MediaLibraryStatusTone,
  type MediaLibraryView,
} from "@/lib/mediaLibrary";
import { cn } from "@/lib/utils";

type DocumentAnalysisRow = Pick<
  Database["public"]["Tables"]["document_analysis_results"]["Row"],
  | "id"
  | "doc_type"
  | "doc_subtype"
  | "status"
  | "file_name"
  | "file_size_bytes"
  | "mime_type"
  | "storage_bucket"
  | "storage_path"
  | "classification_confidence"
  | "created_at"
  | "updated_at"
  | "uploaded_by"
  | "parser_used"
  | "processing_time_ms"
  | "pages_count"
  | "cost_eur"
  | "error_message"
>;

type ComputoUploadRow = Pick<
  Database["public"]["Tables"]["computo_uploads"]["Row"],
  | "id"
  | "file_name"
  | "file_size"
  | "file_type"
  | "storage_path"
  | "extraction_status"
  | "extraction_confidence"
  | "created_at"
  | "updated_at"
  | "extraction_completed_at"
  | "extraction_method"
  | "extraction_error"
  | "quote_id"
  | "oggetto_lavori"
  | "committente"
  | "progettista"
  | "data_computo"
  | "uploaded_by"
>;

type EntityAttachmentRow = Pick<
  Database["public"]["Tables"]["entity_attachments"]["Row"],
  | "id"
  | "entity_table"
  | "file_name"
  | "file_size"
  | "mime_type"
  | "storage_bucket"
  | "storage_path"
  | "doc_type"
  | "doc_subtype"
  | "attached_at"
  | "attached_by"
  | "entity_id"
  | "ai_suggested"
  | "user_confirmed"
  | "link_confidence"
  | "link_reasoning"
>;

type ProfileRow = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "first_name" | "last_name" | "email">;

type MediaLibraryFolderRow = Pick<
  Database["public"]["Tables"]["media_library_folders"]["Row"],
  | "id"
  | "name"
  | "slug"
  | "description"
  | "match_query"
  | "icon"
  | "color"
  | "sort_order"
  | "created_at"
  | "created_by"
  | "updated_at"
  | "archived_at"
> & { mode: DriveFolderMode };

type EmailAttachmentRow = Pick<
  Database["public"]["Tables"]["email_attachments"]["Row"],
  "id" | "filename" | "size_bytes" | "mime_type" | "storage_path" | "user_id" | "created_at" | "inbox_id" | "outbox_id"
>;

type MarketingDocumentRow = Pick<
  Database["public"]["Tables"]["marketing_documents"]["Row"],
  "id" | "contact_id" | "opportunity_id" | "file_name" | "file_size" | "file_type" | "file_url" | "created_at" | "uploaded_by"
>;

type FotoCantiereRow = Pick<
  Database["public"]["Tables"]["foto_cantiere"]["Row"],
  | "id"
  | "order_id"
  | "storage_path"
  | "thumbnail_path"
  | "descrizione"
  | "tags"
  | "created_at"
  | "taken_at"
  | "uploaded_by"
  | "ai_qualita_score"
  | "ai_riassunto"
>;

type CompanyPhotoRow = Pick<
  Database["public"]["Tables"]["company_photo_library"]["Row"],
  | "id"
  | "nome"
  | "descrizione"
  | "image_url"
  | "storage_path"
  | "tags"
  | "vertical_slug"
  | "categoria_slug"
  | "tipologia"
  | "created_at"
  | "updated_at"
  | "created_by"
>;

type QuotePdfRow = Pick<
  Database["public"]["Tables"]["quotes"]["Row"],
  | "id"
  | "quote_number"
  | "title"
  | "client_name"
  | "status"
  | "total"
  | "pdf_storage_path"
  | "pdf_generated_at"
  | "created_at"
  | "updated_at"
  | "created_by"
  | "opportunity_id"
  | "contact_id"
  | "signed_at"
>;

type QuoteMaterialRow = Pick<
  Database["public"]["Tables"]["quote_pdf_materials"]["Row"],
  "id" | "name" | "category" | "storage_path" | "file_size_bytes" | "created_at" | "updated_at" | "created_by"
>;

type RenderSessionRow = Pick<
  Database["public"]["Tables"]["render_sessions"]["Row"],
  | "id"
  | "vertical"
  | "status"
  | "original_photo_url"
  | "result_urls"
  | "created_at"
  | "processing_completed_at"
  | "created_by"
  | "contact_id"
  | "opportunity_id"
  | "error_message"
>;

type SerramentiMediaRow = Pick<
  Database["public"]["Tables"]["sr_progetti_media"]["Row"],
  "id" | "kind" | "caption" | "storage_path" | "url" | "created_at" | "progetto_id" | "serramento_id"
>;

type DocumentoDipendenteRow = Pick<
  Database["public"]["Tables"]["documenti_dipendenti"]["Row"],
  "id" | "user_id" | "tipo" | "nome_file" | "url" | "data_scadenza" | "created_at" | "note"
>;

type DocumentoSubappaltatoreRow = Pick<
  Database["public"]["Tables"]["documenti_subappaltatore"]["Row"],
  "id" | "subappaltatore_id" | "tipo" | "nome_file" | "url" | "data_scadenza" | "created_at" | "note"
>;

type DocumentoOperaioRow = Pick<
  Database["public"]["Tables"]["hr_documenti"]["Row"],
  "id" | "hr_profilo_id" | "titolo" | "file_name" | "file_path" | "data_scadenza" | "alert_giorni_prima" | "categoria" | "created_at" | "created_by" | "note"
>;

interface MediaLibraryLoadOptions {
  userId?: string | null;
  completa?: boolean;
  signal: AbortSignal;
}

interface RisultatoDrive extends MediaLibraryLoadResult { altre: boolean }

type DriveTab = MediaLibraryView;

const TAB_LABELS: Record<DriveTab, string> = {
  tutti: "Tutti",
  inbox_ai: "Inbox AI",
  da_classificare: "Da classificare",
  collegati: "Collegati",
  prodotti: "Prodotti",
  finanziamenti: "Finanziaria",
  computi: "Computi metrici",
  render: "Render",
  preventivi: "Preventivi",
  fiscale: "Fiscale",
  cantieri: "Cantieri",
  crm: "CRM",
  foto_media: "Foto & media",
  riservati: "Riservati",
  altro: "Altro",
};

const TABS: DriveTab[] = [
  "tutti",
  "inbox_ai",
  "da_classificare",
  "collegati",
  "prodotti",
  "finanziamenti",
  "computi",
  "render",
  "preventivi",
  "fiscale",
  "cantieri",
  "crm",
  "foto_media",
  "riservati",
  "altro",
];

const TAB_DESCRIPTIONS: Record<DriveTab, string> = {
  tutti: "Archivio completo filtrato per permessi",
  inbox_ai: "Documenti caricati e classificati dall'AI",
  da_classificare: "File da verificare, collegare o correggere",
  collegati: "Documenti agganciati a record operativi",
  prodotti: "Schede prodotto, cataloghi, certificazioni e listini",
  finanziamenti: "Piani finanziari, leasing, noleggi e tabelle rate",
  computi: "Computi metrici e CME importati nei preventivi",
  render: "Render, immagini AI e media di progetto",
  preventivi: "Offerte, proposte e documenti commerciali",
  fiscale: "Fatture, DDT, ricevute e note",
  cantieri: "Foto, verbali, SAL e documenti di commessa",
  crm: "Clienti, contatti, opportunità e lead",
  foto_media: "Foto, video e asset multimediali",
  riservati: "Contratti, identità e documenti sensibili",
  altro: "File generici non ancora classificati",
};

const TAB_ICONS: Record<DriveTab, LucideIcon> = {
  tutti: Archive,
  inbox_ai: Brain,
  da_classificare: AlertTriangle,
  collegati: Link2,
  prodotti: Package,
  finanziamenti: CreditCard,
  computi: Calculator,
  render: ImageIcon,
  preventivi: FileText,
  fiscale: DatabaseIcon,
  cantieri: FolderOpen,
  crm: UserRound,
  foto_media: ImageIcon,
  riservati: Lock,
  altro: Folder,
};

const CARTELLE_PRINCIPALI: DriveTab[] = ["tutti", "cantieri", "foto_media", "da_classificare"];
const CARTELLE_VUOTE: MediaLibraryFolderRow[] = [];
const CAMPI_CARTELLA = "id,name,slug,description,match_query,icon,color,sort_order,created_at,created_by,mode,updated_at,archived_at";

const EMPTY_MEDIA_LOAD_RESULT: RisultatoDrive = { items: [], warnings: [], altre: false };

function createEmptyTabCounts(): Record<DriveTab, number> {
  return {
    tutti: 0,
    inbox_ai: 0,
    da_classificare: 0,
    collegati: 0,
    prodotti: 0,
    finanziamenti: 0,
    computi: 0,
    render: 0,
    preventivi: 0,
    fiscale: 0,
    cantieri: 0,
    crm: 0,
    foto_media: 0,
    riservati: 0,
    altro: 0,
  };
}

const STATUS_TONE_CLASS: Record<MediaLibraryStatusTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  processing: "border-blue-200 bg-blue-50 text-blue-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

const STATUS_DOT_CLASS: Record<MediaLibraryStatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  processing: "bg-blue-500",
  error: "bg-rose-500",
  neutral: "bg-slate-400",
};

function entityLabel(table: string | null | undefined): string | null {
  if (!table) return null;
  const labels: Record<string, string> = {
    orders: "Commessa",
    quotes: "Preventivo",
    customers: "Cliente",
    profiles: "Contatto",
    purchase_orders: "Ordine acquisto",
    suppliers: "Fornitore",
    opportunities: "Opportunità",
    marketing_opportunities: "Opportunità",
    marketing_contacts: "Contatto marketing",
    marketing_documents: "Documento CRM",
    email_inbox: "Email ricevuta",
    email_outbox: "Email inviata",
    invoices: "Fattura",
    documenti_fiscali: "Documento fiscale",
    computo_uploads: "Computo metrico",
    computo_voci_estratte: "Voce computo",
    products: "Prodotto",
    article_families: "Linea prodotto",
    quote_pdf_materials: "Materiale preventivo",
    render_sessions: "Render",
    sr_progetti: "Progetto serramenti",
    company_photo_library: "Foto aziendale",
    documenti_dipendenti: "Documento dipendente",
    documenti_operai: "Documento operaio",
    documenti_subappaltatore: "Documento subappaltatore",
  };
  return labels[table] ?? table.replace(/_/g, " ");
}

/** Dove si apre il record a cui è collegato il documento (se ha una pagina). */
function percorsoRecordCollegato(tabella: string | null, id: string | null): string | null {
  if (!tabella || !id) return null;
  switch (tabella) {
    case "orders":
      return `/azienda/ordini/${encodeURIComponent(id)}`;
    case "customers":
      return `/azienda/clienti/${encodeURIComponent(id)}`;
    case "quotes":
      return `/azienda/marketing/preventivi/${encodeURIComponent(id)}`;
    case "marketing_contacts":
      return linkContatto("/azienda/marketing", id);
    case "marketing_opportunities":
      return linkOpportunita("/azienda/marketing", id);
    default:
      return null;
  }
}

function formatDate(value: string | null): string {
  if (!value) return "Data non disponibile";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "n.d.";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s`;
}

/** Il tipo di documento, se dice qualcosa in più dell'area («render» sotto «Render» no). */
function tipoSeDiversoDallArea(item: Pick<MediaLibraryItem, "docType" | "areaLabel">): string | null {
  const tipo = item.docType.replace(/_/g, " ").trim();
  if (!tipo || tipo.toLowerCase() === item.areaLabel.trim().toLowerCase()) return null;
  return tipo;
}

/**
 * «Render infissi · bagno legno»: la verticale e, se dice qualcosa, il nome
 * della foto di partenza. Prima «Render infissi e68fe4e8», col codice della
 * sessione che non diceva niente (la data è già nella riga).
 */
function nomeRender(row: { vertical: string | null; original_photo_url: string | null }): string {
  const base = `Render ${row.vertical ?? "AI"}`;
  const foto = pathFileName(row.original_photo_url, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d{10,}[_-]?/, "")
    .replace(/^original$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return foto ? `${base} · ${foto}` : base;
}

function compactFacts(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value?.trim()));
}

function pathFileName(path: string | null | undefined, fallback = "Documento"): string {
  if (!path) return fallback;
  const clean = path.split("?")[0] ?? path;
  const rawName = clean.split("/").filter(Boolean).pop() ?? fallback;
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
}

function isExternalUrl(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function storagePathFromMaybeUrl(value: string | null | undefined, bucket: string): string | null {
  if (!value) return null;
  if (!isExternalUrl(value)) return value;
  const marker = `/${bucket}/`;
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return null;
  return decodeURIComponent(value.slice(markerIndex + marker.length).split("?")[0] ?? "");
}

function firstExternalUrl(values: string[] | null | undefined): string | null {
  return values?.find((value) => isExternalUrl(value)) ?? null;
}

function profileLabel(profile: ProfileRow): string {
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  return fullName || profile.email || "Utente azienda";
}

function actorLabel(actorLabels: Map<string, string>, actorId: string | null | undefined): string | null {
  if (!actorId) return null;
  return actorLabels.get(actorId) ?? `Utente ${actorId.slice(0, 8)}`;
}

function attachmentActionLabel(row: EntityAttachmentRow): string {
  if (row.ai_suggested && row.user_confirmed) return "Collegato da AI e confermato";
  if (row.ai_suggested) return "Suggerito da AI";
  if (row.user_confirmed) return "Collegato manualmente";
  return "Allegato operativo";
}

function analysisActionLabel(status: string | null): string {
  const normalized = (status ?? "").toLowerCase();
  if (["failed", "error", "errore"].includes(normalized)) return "Analisi AI fallita";
  if (["processing", "pending", "queued", "in_progress"].includes(normalized)) return "Analisi AI in corso";
  if (["review_required", "needs_review", "da_verificare"].includes(normalized)) return "Da verificare in Inbox AI";
  return "Analizzato da AI";
}

function computoActionLabel(row: ComputoUploadRow): string {
  const normalized = row.extraction_status.toLowerCase();
  if (row.quote_id) return "Computo collegato a preventivo";
  if (["failed", "error", "errore"].includes(normalized)) return "Estrazione computo fallita";
  if (["processing", "pending", "queued", "in_progress"].includes(normalized)) return "Estrazione computo in corso";
  if (["review_required", "needs_review", "da_verificare"].includes(normalized)) return "Computo da verificare";
  return "Computo elaborato";
}

function statusLabel(item: MediaLibraryItem): string {
  if (item.source === "drive_archive") return "Archiviato";
  if (item.statusTone === "error") return "Errore";
  if (item.statusTone === "warning") return "Da verificare";
  if (item.statusTone === "processing") return "In analisi";
  if (item.source === "attachment") return "Collegato";
  return "Pronto";
}

function IconaStatoDrive({ tono }: { tono: MediaLibraryStatusTone }) {
  const className = "mr-1 h-3.5 w-3.5";
  if (tono === "error" || tono === "warning") return <AlertTriangle className={className} aria-hidden="true" />;
  if (tono === "processing") return <Clock3 className={className} aria-hidden="true" />;
  if (tono === "success") return <CheckCircle2 className={className} aria-hidden="true" />;
  return <FileText className={className} aria-hidden="true" />;
}

function IconaFileDrive({ item, className }: { item: MediaLibraryItem; className?: string }) {
  if (item.category === "foto_media") return <ImageIcon className={className} aria-hidden="true" />;
  if (item.category === "riservati") return <Lock className={className} aria-hidden="true" />;
  if (item.source === "ai_analysis") return <Brain className={className} aria-hidden="true" />;
  if (item.source === "attachment") return <Link2 className={className} aria-hidden="true" />;
  return <FileText className={className} aria-hidden="true" />;
}

const EMPTY_QUERY_RESULT = { data: [], error: null as null, altre: false } as const;

async function loadMediaItems(companyId: string, options: MediaLibraryLoadOptions): Promise<RisultatoDrive> {
  const fonte = <T extends { id: string }>(pagina: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, limite: number) =>
    leggiPagineDrive(pagina, limite, options.completa, options.signal);
  // Se non abbiamo userId (utente non loggato), evitiamo del tutto la query e
  // ritorniamo un risultato vuoto tipizzato. Niente race condition fittizia
  // con Promise.resolve "valido": il flusso è esplicitamente skip.
  const emailQuery = options.userId
    ? fonte((da, a) => supabase
        .from("email_attachments")
        .select("id,filename,size_bytes,mime_type,storage_path,user_id,created_at,inbox_id,outbox_id")
        .eq("company_id", companyId)
        .eq("user_id", options.userId)
        .order("created_at", { ascending: false })
        .order("id").range(da, a).abortSignal(options.signal), 80)
    : Promise.resolve(EMPTY_QUERY_RESULT);

  const [
    analysisResult,
    computoResult,
    attachmentResult,
    emailResult,
    marketingDocumentResult,
    sitePhotoResult,
    companyPhotoResult,
    quotePdfResult,
    quoteMaterialResult,
    renderSessionResult,
    serramentiMediaResult,
    employeeDocumentResult,
    subcontractorDocumentResult,
    workerDocumentResult,
    archivedResult,
    orderFilesResult,
  ] = await Promise.all([
    fonte((da, a) => supabase
      .from("document_analysis_results")
      .select(
        "id,doc_type,doc_subtype,status,file_name,file_size_bytes,mime_type,storage_bucket,storage_path,classification_confidence,created_at,updated_at,uploaded_by,parser_used,processing_time_ms,pages_count,cost_eur,error_message",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase
      .from("computo_uploads")
      .select(
        "id,file_name,file_size,file_type,storage_path,extraction_status,extraction_confidence,created_at,updated_at,extraction_completed_at,extraction_method,extraction_error,quote_id,oggetto_lavori,committente,progettista,data_computo,uploaded_by",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase
      .from("entity_attachments")
      .select(
        "id,entity_table,entity_id,file_name,file_size,mime_type,storage_bucket,storage_path,doc_type,doc_subtype,attached_at,attached_by,ai_suggested,user_confirmed,link_confidence,link_reasoning",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("attached_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 120),
    emailQuery,
    fonte((da, a) => supabase
      .from("marketing_documents")
      .select("id,contact_id,opportunity_id,file_name,file_size,file_type,file_url,created_at,uploaded_by")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase
      .from("foto_cantiere")
      .select("id,order_id,storage_path,thumbnail_path,descrizione,tags,created_at,taken_at,uploaded_by,ai_qualita_score,ai_riassunto")
      .eq("company_id", companyId)
      .order("taken_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase
      .from("company_photo_library")
      .select("id,nome,descrizione,image_url,storage_path,tags,vertical_slug,categoria_slug,tipologia,created_at,updated_at,created_by")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase
      .from("quotes")
      .select("id,quote_number,title,client_name,status,total,pdf_storage_path,pdf_generated_at,created_at,updated_at,created_by,opportunity_id,contact_id,signed_at")
      .eq("company_id", companyId)
      .not("pdf_storage_path", "is", null)
      .order("pdf_generated_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase
      .from("quote_pdf_materials")
      .select("id,name,category,storage_path,file_size_bytes,created_at,updated_at,created_by")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase
      .from("render_sessions")
      .select("id,vertical,status,original_photo_url,result_urls,created_at,processing_completed_at,created_by,contact_id,opportunity_id,error_message")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 60),
    fonte((da, a) => supabase
      .from("sr_progetti_media")
      .select("id,kind,caption,storage_path,url,created_at,progetto_id,serramento_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase
      .from("documenti_dipendenti")
      .select("id,user_id,tipo,nome_file,url,data_scadenza,created_at,note")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase
      .from("documenti_subappaltatore")
      .select("id,subappaltatore_id,tipo,nome_file,url,data_scadenza,created_at,note")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    // Il fascicolo del personale vive in hr_documenti (bucket hr-documenti):
    // `documenti_operai` puntava a un bucket mai creato ed è rimasta vuota
    // ovunque, quindi il Drive non ha mai mostrato un solo documento di
    // dipendente.
    fonte((da, a) => supabase
      .from("hr_documenti")
      .select("id,hr_profilo_id,titolo,file_name,file_path,data_scadenza,alert_giorni_prima,categoria,created_at,created_by,note")
      .eq("company_id", companyId)
      .not("file_path", "is", null)
      .order("created_at", { ascending: false })
      .order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase.from("media_library_files")
      .select("id,company_id,folder_id,name,mime_type,size_bytes,storage_path,shared,created_by,created_at")
      .eq("company_id", companyId).order("created_at", { ascending: false }).order("id").range(da, a).abortSignal(options.signal), 80),
    fonte((da, a) => supabase.from("order_attachments")
      .select("id,order_id,file_name,file_type,file_size,file_url,created_at,uploaded_by,access_scope,orders!inner(company_id,order_code)")
      .eq("orders.company_id", companyId).is("orders.deleted_at", null)
      .order("created_at", { ascending: false }).order("id").range(da, a).abortSignal(options.signal), 80),
  ]);

  // FIX P1: log errori di ogni fonte invece di silenziarli — utile in produzione
  // per diagnosticare casi tipo "perché Drive non vede i computi?".
  const sourceResults: Array<{ name: string; error: unknown }> = [
    { name: "analysisResult", error: analysisResult.error },
    { name: "computoResult", error: computoResult.error },
    { name: "attachmentResult", error: attachmentResult.error },
    { name: "emailResult", error: emailResult.error },
    { name: "marketingDocumentResult", error: marketingDocumentResult.error },
    { name: "sitePhotoResult", error: sitePhotoResult.error },
    { name: "companyPhotoResult", error: companyPhotoResult.error },
    { name: "quotePdfResult", error: quotePdfResult.error },
    { name: "quoteMaterialResult", error: quoteMaterialResult.error },
    { name: "renderSessionResult", error: renderSessionResult.error },
    { name: "serramentiMediaResult", error: serramentiMediaResult.error },
    { name: "employeeDocumentResult", error: employeeDocumentResult.error },
    { name: "subcontractorDocumentResult", error: subcontractorDocumentResult.error },
    { name: "workerDocumentResult", error: workerDocumentResult.error },
    { name: "archivedResult", error: archivedResult.error },
    { name: "orderFilesResult", error: orderFilesResult.error },
  ];
  for (const { name, error } of sourceResults) {
    if (error) {
      console.warn(`[EiC Drive] fonte ${name} ha errore:`, (error as { message?: string }).message ?? error);
    }
  }

  const analysisRows = (analysisResult.data ?? []) as DocumentAnalysisRow[];
  const computoRows = (computoResult.data ?? []) as ComputoUploadRow[];
  const attachmentRows = (attachmentResult.data ?? []) as EntityAttachmentRow[];
  const emailRows = (emailResult.data ?? []) as EmailAttachmentRow[];
  const marketingDocumentRows = (marketingDocumentResult.data ?? []) as MarketingDocumentRow[];
  const sitePhotoRows = (sitePhotoResult.data ?? []) as FotoCantiereRow[];
  const companyPhotoRows = (companyPhotoResult.data ?? []) as CompanyPhotoRow[];
  const quotePdfRows = (quotePdfResult.data ?? []) as QuotePdfRow[];
  const quoteMaterialRows = (quoteMaterialResult.data ?? []) as QuoteMaterialRow[];
  const renderSessionRows = (renderSessionResult.data ?? []) as RenderSessionRow[];
  const serramentiMediaRows = (serramentiMediaResult.data ?? []) as SerramentiMediaRow[];
  const employeeDocumentRows = (employeeDocumentResult.data ?? []) as DocumentoDipendenteRow[];
  const subcontractorDocumentRows = (subcontractorDocumentResult.data ?? []) as DocumentoSubappaltatoreRow[];
  const workerDocumentRows = (workerDocumentResult.data ?? []) as DocumentoOperaioRow[];
  const actorIds = Array.from(
    new Set(
      [
        ...analysisRows.map((row) => row.uploaded_by),
        ...computoRows.map((row) => row.uploaded_by),
        ...attachmentRows.map((row) => row.attached_by),
        ...emailRows.map((row) => row.user_id),
        ...marketingDocumentRows.map((row) => row.uploaded_by),
        ...sitePhotoRows.map((row) => row.uploaded_by),
        ...companyPhotoRows.map((row) => row.created_by),
        ...quotePdfRows.map((row) => row.created_by),
        ...quoteMaterialRows.map((row) => row.created_by),
        ...renderSessionRows.map((row) => row.created_by),
        ...employeeDocumentRows.map((row) => row.user_id),
        ...workerDocumentRows.map((row) => row.created_by),
        ...archivedResult.data.map(row => row.created_by),
        ...orderFilesResult.data.map(row => row.uploaded_by),
      ].filter((id): id is string => Boolean(id)),
    ),
  );

  const actorLabels = new Map<string, string>();
  let profileWarning: string | null = null;

  for (let i = 0; i < actorIds.length; i += 80) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,email")
      .in("id", actorIds.slice(i, i + 80)).abortSignal(options.signal);

    if (profileError) {
      profileWarning = profileError.message;
    } else {
      for (const profile of (profileData ?? []) as ProfileRow[]) {
        actorLabels.set(profile.id, profileLabel(profile));
      }
    }
  }

  const analysisItems = analysisRows.map((row) =>
    buildMediaLibraryItem({
      id: `analysis:${row.id}`,
      source: "ai_analysis",
      fileName: row.file_name,
      docType: row.doc_type,
      docSubtype: row.doc_subtype,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fileSize: row.file_size_bytes,
      mimeType: row.mime_type,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      confidence: row.classification_confidence,
      actorId: row.uploaded_by,
      actorLabel: actorLabel(actorLabels, row.uploaded_by),
      actionLabel: analysisActionLabel(row.status),
      integrationLabel: "Inbox documenti AI",
      metadataFacts: compactFacts([
        row.parser_used ? `Parser: ${row.parser_used}` : null,
        row.pages_count ? `Pagine: ${row.pages_count}` : null,
        formatDuration(row.processing_time_ms) ? `Tempo analisi: ${formatDuration(row.processing_time_ms)}` : null,
        typeof row.cost_eur === "number" ? `Costo AI: ${row.cost_eur.toFixed(4)} EUR` : null,
      ]),
      errorMessage: row.error_message,
    }),
  );

  const computoItems = computoRows.map((row) =>
    buildMediaLibraryItem({
      id: `computo:${row.id}`,
      source: "computo",
      fileName: row.file_name,
      docType: "computo_metrico",
      status: row.extraction_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.extraction_completed_at,
      fileSize: row.file_size,
      mimeType: row.file_type,
      storageBucket: "computi",
      storagePath: row.storage_path,
      confidence: row.extraction_confidence,
      actorId: row.uploaded_by,
      actorLabel: actorLabel(actorLabels, row.uploaded_by),
      actionLabel: computoActionLabel(row),
      integrationLabel: "Preventivi / computo metrico",
      linkedEntityLabel: row.quote_id ? "Preventivo collegato" : row.oggetto_lavori,
      linkedEntityTable: row.quote_id ? "quotes" : null,
      linkedEntityId: row.quote_id,
      metadataFacts: compactFacts([
        row.oggetto_lavori ? `Lavoro: ${row.oggetto_lavori}` : null,
        row.committente ? `Committente: ${row.committente}` : null,
        row.progettista ? `Progettista: ${row.progettista}` : null,
        row.data_computo ? `Data computo: ${row.data_computo}` : null,
        row.extraction_method ? `Metodo: ${row.extraction_method}` : null,
      ]),
      errorMessage: row.extraction_error,
    }),
  );

  const emailItems = emailRows.map((row) =>
    buildMediaLibraryItem({
      id: `email:${row.id}`,
      source: "email",
      fileName: row.filename,
      docType: "email_attachment",
      status: "ready",
      createdAt: row.created_at,
      fileSize: row.size_bytes,
      mimeType: row.mime_type,
      storageBucket: "email-attachments",
      storagePath: row.storage_path,
      actorId: row.user_id,
      actorLabel: actorLabel(actorLabels, row.user_id),
      linkedEntityLabel: row.inbox_id ? "Email ricevuta" : row.outbox_id ? "Email inviata" : null,
      linkedEntityTable: row.inbox_id ? "email_inbox" : row.outbox_id ? "email_outbox" : null,
      linkedEntityId: row.inbox_id ?? row.outbox_id,
      metadataFacts: compactFacts([
        row.inbox_id ? "Origine: posta ricevuta" : null,
        row.outbox_id ? "Origine: posta inviata" : null,
        "Visibilita: solo account email collegato",
      ]),
    }),
  );

  const marketingDocumentItems = marketingDocumentRows.map((row) =>
    buildMediaLibraryItem({
      id: `marketing-document:${row.id}`,
      source: "marketing_document",
      fileName: row.file_name,
      docType: "crm_document",
      status: "ready",
      createdAt: row.created_at,
      fileSize: row.file_size,
      mimeType: row.file_type,
      storageBucket: "marketing-attachments",
      storagePath: storagePathFromMaybeUrl(row.file_url, "marketing-attachments") ?? row.file_url,
      actorId: row.uploaded_by,
      actorLabel: actorLabel(actorLabels, row.uploaded_by),
      linkedEntityLabel: row.opportunity_id ? "Opportunità" : "Contatto marketing",
      linkedEntityTable: row.opportunity_id ? "marketing_opportunities" : "marketing_contacts",
      linkedEntityId: row.opportunity_id ?? row.contact_id,
      metadataFacts: compactFacts([row.opportunity_id ? "Associato a opportunità" : "Associato a contatto"]),
    }),
  );

  const sitePhotoItems = sitePhotoRows.map((row) =>
    buildMediaLibraryItem({
      id: `foto-cantiere:${row.id}`,
      source: "site_photo",
      fileName: row.descrizione || pathFileName(row.storage_path, "Foto cantiere"),
      docType: "foto_cantiere",
      status: "ready",
      createdAt: row.created_at ?? row.taken_at,
      updatedAt: row.taken_at,
      fileSize: null,
      mimeType: "image/*",
      storageBucket: "foto-cantiere",
      storagePath: row.storage_path,
      confidence: row.ai_qualita_score,
      actorId: row.uploaded_by,
      actorLabel: actorLabel(actorLabels, row.uploaded_by),
      linkedEntityLabel: row.order_id ? "Commessa" : null,
      linkedEntityTable: row.order_id ? "orders" : null,
      linkedEntityId: row.order_id,
      metadataFacts: compactFacts([
        row.tags?.length ? `Tag: ${row.tags.join(", ")}` : null,
        row.ai_riassunto ? `AI: ${row.ai_riassunto}` : null,
        row.thumbnail_path ? "Thumbnail disponibile" : null,
      ]),
    }),
  );

  const companyPhotoItems = companyPhotoRows.map((row) =>
    buildMediaLibraryItem({
      id: `company-photo:${row.id}`,
      source: "company_photo",
      fileName: row.nome,
      docType: "foto_aziendale",
      status: "ready",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fileSize: null,
      mimeType: "image/*",
      storageBucket: row.storage_path ? "company-photo-library" : null,
      storagePath: row.storage_path,
      externalUrl: row.image_url,
      actorId: row.created_by,
      actorLabel: actorLabel(actorLabels, row.created_by),
      linkedEntityLabel: "Galleria aziendale",
      linkedEntityTable: "company_photo_library",
      linkedEntityId: row.id,
      metadataFacts: compactFacts([
        row.vertical_slug ? `Verticale: ${row.vertical_slug}` : null,
        row.categoria_slug ? `Categoria: ${row.categoria_slug}` : null,
        row.tipologia ? `Tipo: ${row.tipologia}` : null,
        row.descrizione,
        row.tags?.length ? `Tag: ${row.tags.join(", ")}` : null,
      ]),
    }),
  );

  const quotePdfItems = quotePdfRows
    .filter((row) => Boolean(row.pdf_storage_path))
    .map((row) =>
      buildMediaLibraryItem({
        id: `quote-pdf:${row.id}`,
        source: "quote_pdf",
        fileName: `${row.quote_number || "Preventivo"}.pdf`,
        docType: "preventivo_pdf",
        status: "ready",
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.signed_at ?? row.pdf_generated_at,
        fileSize: null,
        mimeType: "application/pdf",
        storageBucket: "quote-pdfs",
        storagePath: row.pdf_storage_path,
        actorId: row.created_by,
        actorLabel: actorLabel(actorLabels, row.created_by),
        actionLabel: row.signed_at ? "Preventivo firmato" : "PDF preventivo generato",
        linkedEntityLabel: row.client_name ? `${row.quote_number} · ${row.client_name}` : row.quote_number,
        linkedEntityTable: "quotes",
        linkedEntityId: row.id,
        metadataFacts: compactFacts([
          row.title ? `Titolo: ${row.title}` : null,
          typeof row.total === "number" ? `Totale: ${row.total.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" })}` : null,
          // Il codice interno (uuid) non diceva niente a chi legge.
          row.opportunity_id ? "Opportunità collegata" : null,
          row.contact_id ? "Contatto collegato" : null,
          row.status ? `Stato preventivo: ${row.status}` : null,
        ]),
      }),
    );

  const quoteMaterialItems = quoteMaterialRows.map((row) =>
    buildMediaLibraryItem({
      id: `quote-material:${row.id}`,
      source: "quote_material",
      fileName: row.name,
      docType: "quote_material",
      status: "ready",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fileSize: row.file_size_bytes,
      mimeType: "application/pdf",
      storageBucket: "quote-materials",
      storagePath: row.storage_path,
      actorId: row.created_by,
      actorLabel: actorLabel(actorLabels, row.created_by),
      linkedEntityLabel: row.category ? `Categoria ${row.category}` : "Materiale preventivo",
      linkedEntityTable: "quote_pdf_materials",
      linkedEntityId: row.id,
      metadataFacts: compactFacts([row.category ? `Categoria: ${row.category}` : null]),
    }),
  );

  const renderSessionItems = renderSessionRows.map((row) => {
    // Si apre il render fatto; la foto di partenza solo se il render non c'è
    // (prima era il contrario: «Apri» su un render mostrava la foto del cliente).
    const risultato = firstExternalUrl(row.result_urls);
    const originaleInArchivio: string | null =
      row.original_photo_url && !isExternalUrl(row.original_photo_url) ? row.original_photo_url : null;
    return buildMediaLibraryItem({
      id: `render-session:${row.id}`,
      source: "render",
      fileName: nomeRender(row),
      docType: "render",
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.processing_completed_at,
      fileSize: null,
      mimeType: "image/*",
      storageBucket: !risultato && originaleInArchivio ? "render-originals" : null,
      storagePath: !risultato ? originaleInArchivio : null,
      externalUrl: risultato ?? (isExternalUrl(row.original_photo_url) ? row.original_photo_url : null),
      actorId: row.created_by,
      actorLabel: actorLabel(actorLabels, row.created_by),
      linkedEntityLabel: row.opportunity_id ? "Opportunità" : row.contact_id ? "Contatto marketing" : null,
      linkedEntityTable: row.opportunity_id ? "marketing_opportunities" : row.contact_id ? "marketing_contacts" : null,
      linkedEntityId: row.opportunity_id ?? row.contact_id,
      metadataFacts: compactFacts([
        row.vertical ? `Verticale: ${row.vertical}` : null,
        row.result_urls?.length ? `Output generati: ${row.result_urls.length}` : null,
      ]),
      errorMessage: row.error_message,
    });
  });

  const serramentiMediaItems = serramentiMediaRows.map((row) =>
    buildMediaLibraryItem({
      id: `sr-media:${row.id}`,
      source: "render",
      fileName: row.caption || pathFileName(row.storage_path, `Media serramenti ${row.kind}`),
      docType: row.kind === "render" ? "render" : "foto_generale",
      status: "ready",
      createdAt: row.created_at,
      fileSize: null,
      mimeType: "image/*",
      storageBucket: row.storage_path.startsWith("render-session:") ? null : "sr-progetti",
      storagePath: row.storage_path.startsWith("render-session:") ? null : row.storage_path,
      externalUrl: isExternalUrl(row.url) ? row.url : null,
      linkedEntityLabel: "Progetto serramenti",
      linkedEntityTable: "sr_progetti",
      linkedEntityId: row.progetto_id,
      metadataFacts: compactFacts([
        `Tipo media: ${row.kind}`,
        row.serramento_id ? `Serramento: ${row.serramento_id}` : null,
      ]),
    }),
  );

  const employeeDocumentItems = employeeDocumentRows.map((row) =>
    buildMediaLibraryItem({
      id: `employee-doc:${row.id}`,
      source: "personnel_document",
      fileName: row.nome_file || pathFileName(row.url, "Documento dipendente"),
      docType: "documento_dipendente",
      docSubtype: row.tipo,
      status: "ready",
      createdAt: row.created_at,
      fileSize: null,
      storageBucket: "documenti-dipendenti",
      storagePath: row.url,
      actorId: row.user_id,
      actorLabel: actorLabel(actorLabels, row.user_id),
      linkedEntityLabel: "Dipendente",
      linkedEntityTable: "documenti_dipendenti",
      linkedEntityId: row.user_id,
      metadataFacts: compactFacts([
        `Tipo: ${row.tipo}`,
        row.data_scadenza ? `Scadenza: ${row.data_scadenza}` : null,
        row.note,
      ]),
    }),
  );

  const subcontractorDocumentItems = subcontractorDocumentRows.map((row) =>
    buildMediaLibraryItem({
      id: `subcontractor-doc:${row.id}`,
      source: "personnel_document",
      fileName: row.nome_file || pathFileName(row.url, "Documento subappaltatore"),
      docType: "documento_subappaltatore",
      docSubtype: row.tipo,
      status: "ready",
      createdAt: row.created_at,
      fileSize: null,
      storageBucket: "subappaltatori-documenti",
      storagePath: row.url,
      linkedEntityLabel: "Subappaltatore",
      linkedEntityTable: "documenti_subappaltatore",
      linkedEntityId: row.subappaltatore_id,
      metadataFacts: compactFacts([
        `Tipo: ${row.tipo}`,
        row.data_scadenza ? `Scadenza: ${row.data_scadenza}` : null,
        row.note,
      ]),
    }),
  );

  const workerDocumentItems = workerDocumentRows.map((row) =>
    buildMediaLibraryItem({
      id: `worker-doc:${row.id}`,
      source: "personnel_document",
      fileName: row.file_name || row.titolo || pathFileName(row.file_path, "Documento dipendente"),
      docType: row.categoria,
      status: calcStatoHrDoc(row.data_scadenza, row.alert_giorni_prima),
      createdAt: row.created_at,
      fileSize: null,
      storageBucket: "hr-documenti",
      storagePath: row.file_path,
      actorId: row.created_by,
      actorLabel: actorLabel(actorLabels, row.created_by),
      linkedEntityLabel: "Dipendente",
      linkedEntityTable: "hr_documenti",
      linkedEntityId: row.hr_profilo_id,
      metadataFacts: compactFacts([
        row.data_scadenza ? `Scadenza: ${row.data_scadenza}` : null,
        row.note,
      ]),
    }),
  );

  const attachmentItems = attachmentRows.map((row) =>
    buildMediaLibraryItem({
      id: `attachment:${row.id}`,
      source: "attachment",
      fileName: row.file_name,
      docType: row.doc_type,
      docSubtype: row.doc_subtype,
      status: "attached",
      createdAt: row.attached_at,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      confidence: row.link_confidence,
      linkedEntityLabel: entityLabel(row.entity_table),
      linkedEntityTable: row.entity_table,
      linkedEntityId: row.entity_id,
      actorId: row.attached_by,
      actorLabel: actorLabel(actorLabels, row.attached_by),
      actionLabel: attachmentActionLabel(row),
      integrationLabel: `${entityLabel(row.entity_table) ?? "Record"} / allegati`,
      metadataFacts: compactFacts([
        row.ai_suggested ? "AI: suggerimento automatico" : null,
        row.user_confirmed ? "Confermato da utente" : null,
        row.link_confidence ? `Confidenza link: ${Math.round(row.link_confidence * 100)}%` : null,
      ]),
      errorMessage: row.link_reasoning,
    }),
  );

  const archivioItems = (archivedResult.data as DriveFileRow[]).map(row => buildMediaLibraryItem({
    id: `drive:${row.id}`, source: "drive_archive", fileName: row.name, status: "ready",
    mimeType: row.mime_type, fileSize: row.size_bytes, folderId: row.folder_id,
    storageBucket: "eic-drive", storagePath: row.storage_path, createdAt: row.created_at,
    actorId: row.created_by, actorLabel: actorLabel(actorLabels, row.created_by), integrationLabel: "Archivio EiC Drive",
    metadataFacts: [row.shared ? "Condiviso con gli utenti del Drive aziendale" : "Visibile a te e agli amministratori"],
  }));
  const ordineItems = orderFilesResult.data.map(row => {
    const { bucket, path } = attachmentStorage(row.file_url);
    const codice = Array.isArray(row.orders) ? row.orders[0]?.order_code : row.orders?.order_code;
    return buildMediaLibraryItem({
      id: `order-file:${row.id}`, source: "attachment", fileName: row.file_name, status: "attached",
      docType: row.access_scope === "riservato" || row.access_scope === "personale" ? "documento_riservato" : "documento_commessa",
      mimeType: row.file_type, fileSize: row.file_size, storageBucket: bucket, storagePath: path,
      createdAt: row.created_at, linkedEntityId: row.order_id, linkedEntityTable: "orders",
      linkedEntityLabel: codice ? `Commessa ${codice}` : "Commessa", integrationLabel: "Documenti commessa",
      actorId: row.uploaded_by, actorLabel: actorLabel(actorLabels, row.uploaded_by),
    });
  });

  const combined = combineMediaLibrarySourceBatches([
    { label: "Analisi AI", items: analysisItems, errorMessage: analysisResult.error?.message },
    { label: "Computi", items: computoItems, errorMessage: computoResult.error?.message },
    { label: "Allegati", items: attachmentItems, errorMessage: attachmentResult.error?.message },
    { label: "Email", items: emailItems, errorMessage: emailResult.error?.message },
    { label: "CRM documenti", items: marketingDocumentItems, errorMessage: marketingDocumentResult.error?.message },
    { label: "Foto cantiere", items: sitePhotoItems, errorMessage: sitePhotoResult.error?.message },
    { label: "Galleria aziendale", items: companyPhotoItems, errorMessage: companyPhotoResult.error?.message },
    { label: "PDF preventivi", items: quotePdfItems, errorMessage: quotePdfResult.error?.message },
    { label: "Materiali preventivi", items: quoteMaterialItems, errorMessage: quoteMaterialResult.error?.message },
    { label: "Render AI", items: renderSessionItems, errorMessage: renderSessionResult.error?.message },
    { label: "Media serramenti", items: serramentiMediaItems, errorMessage: serramentiMediaResult.error?.message },
    { label: "Documenti dipendenti", items: employeeDocumentItems, errorMessage: employeeDocumentResult.error?.message },
    { label: "Documenti subappaltatori", items: subcontractorDocumentItems, errorMessage: subcontractorDocumentResult.error?.message },
    { label: "Documenti operai", items: workerDocumentItems, errorMessage: workerDocumentResult.error?.message },
    { label: "Archivio EiC Drive", items: archivioItems, errorMessage: archivedResult.error?.message },
    { label: "Documenti commessa", items: ordineItems, errorMessage: orderFilesResult.error?.message },
  ]);

  return {
    items: combined.items,
    altre: [analysisResult, computoResult, attachmentResult, emailResult, marketingDocumentResult, sitePhotoResult,
      companyPhotoResult, quotePdfResult, quoteMaterialResult, renderSessionResult, serramentiMediaResult,
      employeeDocumentResult, subcontractorDocumentResult, workerDocumentResult, archivedResult, orderFilesResult].some(result => result.altre),
    warnings: profileWarning ? [...combined.warnings, `Profili utenti: ${profileWarning}`] : combined.warnings,
  };
}

export default function ContenutiMultimediali() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id ?? null;
  const hasAccess = canAccessMediaLibrary(permissions);
  const puoScrivere = hasAccess && !!companyId && !!user && !permissions.solaLettura;
  const [activeTab, setActiveTab] = useState<DriveTab>("tutti");
  const [activeCustomFolderId, setActiveCustomFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [showPdfTools, setShowPdfTools] = useState(false);
  const [showSmartInbox, setShowSmartInbox] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [cartellaInModifica, setCartellaInModifica] = useState<MediaLibraryFolderRow | null>(null);
  const [modalitaCartella, setModalitaCartella] = useState<DriveFolderMode>("manual");
  const [cercaCartella, setCercaCartella] = useState("");
  const [nuovaCartellaDaArchiviare, setNuovaCartellaDaArchiviare] = useState<MediaLibraryFolderRow | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderMatchQuery, setNewFolderMatchQuery] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [spostamento, setSpostamento] = useState<{ item: MediaLibraryItem; cartella: string } | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState<{ file: File[]; cartellaId: string | null } | null>(null);
  const [analizzati, setAnalizzati] = useState<ReadonlySet<File>>(() => new Set());
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // Mobile: cartella nel pannello filtri, 25 documenti per pagina, dettaglio dal basso.
  const [filtriMobiliAperti, setFiltriMobiliAperti] = useState(false);
  const [paginaMobile, setPaginaMobile] = useState(1);
  const [origineFiltro, setOrigineFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [dettaglioMobile, setDettaglioMobile] = useState<MediaLibraryItem | null>(null);
  const schermoStretto = useSchermoStretto();

  const {
    data: anteprimaArchivio = EMPTY_MEDIA_LOAD_RESULT,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["contenuti-multimediali", companyId, user?.id ?? null],
    enabled: !!companyId && hasAccess && !permissions.isLoading,
    staleTime: 20_000,
    queryFn: ({ signal }) => loadMediaItems(companyId!, { userId: user?.id ?? null, signal }),
  });

  const archivioCompleto = useQuery({
    queryKey: ["contenuti-multimediali", companyId, user?.id ?? null, "completo"],
    enabled: !!companyId && hasAccess && !permissions.isLoading && anteprimaArchivio.altre,
    staleTime: 30_000,
    queryFn: ({ signal }) => loadMediaItems(companyId!, { userId: user?.id ?? null, completa: true, signal }),
  });
  const mediaLoadResult = anteprimaArchivio.altre ? archivioCompleto.data ?? anteprimaArchivio : anteprimaArchivio;
  const sincronizzaArchivio = () => qc.invalidateQueries({ queryKey: ["contenuti-multimediali", companyId, user?.id ?? null] });
  const estensioneArchivio = anteprimaArchivio.altre && archivioCompleto.isFetching;

  const messaggioErrore = error?.message.toLowerCase() ?? "";
  const statusErrore = (error as { status?: number; statusCode?: number } | null)?.status ?? (error as { statusCode?: number } | null)?.statusCode;
  const authExpired = statusErrore === 401 || statusErrore === 403 || /jwt|unauthorized|not authenticated/.test(messaggioErrore);

  const {
    data: tutteCartelle = CARTELLE_VUOTE,
    error: foldersError,
    isFetching: isFetchingFolders,
    refetch: refetchFolders,
  } = useQuery({
    queryKey: ["media-library-folders", companyId, user?.id ?? null],
    enabled: !!companyId && hasAccess && !permissions.isLoading,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("media_library_folders")
        .select(CAMPI_CARTELLA)
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (queryError) throw queryError;
      return (data ?? []) as MediaLibraryFolderRow[];
    },
  });

  const customFolders = useMemo(() => tutteCartelle.filter(folder => !folder.archived_at), [tutteCartelle]);
  const cartelleArchiviate = tutteCartelle.filter(folder => folder.archived_at);
  const cartelleManuali = customFolders.filter(folder => folder.mode === "manual");
  const rawItems = mediaLoadResult.items;
  const isInitialMediaLoading = isLoading && rawItems.length === 0;
  const sourceWarnings = [
    ...mediaLoadResult.warnings,
    ...(foldersError ? [`Cartelle personalizzate: ${foldersError.message}`] : []),
    ...(archivioCompleto.isError && anteprimaArchivio.altre ? ["Pagine precedenti dell’archivio"] : []),
  ];

  const visibleItems = useMemo(
    () => filterMediaLibraryItemsForPermissions(rawItems, permissions),
    [rawItems, permissions],
  );

  const summary = useMemo(() => ({ ...summarizeMediaLibraryItems(visibleItems), total: raggruppaFileDrive(visibleItems).length }), [visibleItems]);
  const integrationCoverage = useMemo(() => buildMediaLibraryIntegrationCoverage(visibleItems), [visibleItems]);
  const activeCustomFolder = useMemo(
    () => customFolders.find((folder) => folder.id === activeCustomFolderId) ?? null,
    [activeCustomFolderId, customFolders],
  );

  const esitiPerCartella = useMemo(() => {
    const conCartella = (item: MediaLibraryItem) => activeCustomFolder?.mode === "manual"
      ? item.folderId === activeCustomFolder.id
      : activeCustomFolder ? mediaLibraryItemMatchesCustomFolder(item, { name: activeCustomFolder.name, matchQuery: activeCustomFolder.match_query })
        : mediaLibraryItemMatchesTab(item, activeTab);
    return visibleItems.filter(conCartella);
  }, [activeCustomFolder, activeTab, visibleItems]);
  const origini = useMemo(() => [...new Set(esitiPerCartella.map(item => item.integrationLabel))].sort((a, b) => a.localeCompare(b, "it")), [esitiPerCartella]);
  const tipi = useMemo(() => [...new Set(esitiPerCartella.map(item => item.docType))].sort((a, b) => a.localeCompare(b, "it")), [esitiPerCartella]);
  const filteredItems = useMemo(() => {
    const coerenti = esitiPerCartella.filter(item => {
      const data = item.lastActivityAt?.slice(0, 10);
      return (!origineFiltro || item.integrationLabel === origineFiltro) && (!tipoFiltro || item.docType === tipoFiltro)
        && (!dal || (data && data >= dal)) && (!al || (data && data <= al));
    });
    return raggruppaFileDrive(coerenti, item => mediaLibraryItemMatchesSearch(item, query));
  }, [esitiPerCartella, query, tipoFiltro, origineFiltro, dal, al]);

  const selectedItem = useMemo(
    () => pickMediaLibraryDetailItem(filteredItems, selectedId),
    [filteredItems, selectedId],
  );

  const countsByTab = useMemo(() => {
    const counts = createEmptyTabCounts();
    for (const tab of TABS) {
      counts[tab] = raggruppaFileDrive(visibleItems.filter((item) => mediaLibraryItemMatchesTab(item, tab))).length;
    }
    return counts;
  }, [visibleItems]);

  const countsByCustomFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of customFolders) {
      const rule: MediaLibraryCustomFolderRule = { name: folder.name, matchQuery: folder.match_query };
      counts.set(folder.id, raggruppaFileDrive(visibleItems.filter(item => folder.mode === "manual" ? item.folderId === folder.id : mediaLibraryItemMatchesCustomFolder(item, rule))).length);
    }
    return counts;
  }, [customFolders, visibleItems]);

  const activeFolderTitle = activeCustomFolder?.name ?? TAB_LABELS[activeTab];
  const activeFolderDescription = activeCustomFolder
    ? activeCustomFolder.description || (activeCustomFolder.mode === "manual" ? "File aggiunti a questa cartella" : activeCustomFolder.match_query || "Raccolta per parole chiave")
    : TAB_DESCRIPTIONS[activeTab];
  const azzeraFiltriAggiuntivi = () => { setOrigineFiltro(""); setTipoFiltro(""); setDal(""); setAl(""); setPaginaMobile(1); };
  const filtriAggiuntivi = Number(!!origineFiltro) + Number(!!tipoFiltro) + Number(!!(dal || al));
  const [filtriDesktopAperti, setFiltriDesktopAperti] = useState(false);

  const selectSystemFolder = (tab: DriveTab) => {
    setActiveTab(tab);
    azzeraFiltriAggiuntivi();
    setActiveCustomFolderId(null);
    setSelectedId(null);
  };

  const selectCustomFolder = (folderId: string) => {
    setActiveCustomFolderId(folderId);
    azzeraFiltriAggiuntivi();
    setSelectedId(null);
  };

  const mostraTutti = () => { setQuery(""); selectSystemFolder("tutti"); };
  const impostazioniFiltro = { origini, tipi, origine: origineFiltro, tipo: tipoFiltro, dal, al,
    onOrigine: (v: string) => { setOrigineFiltro(v); setPaginaMobile(1); },
    onTipo: (v: string) => { setTipoFiltro(v); setPaginaMobile(1); },
    onDal: (v: string) => { setDal(v); setPaginaMobile(1); },
    onAl: (v: string) => { setAl(v); setPaginaMobile(1); },
  };
  const chiudiCaricamento = () => { setCaricamento(null); setAnalizzati(new Set()); };
  const apriCaricamento = useCallback((file: File[] = []) => {
    if (!puoScrivere) return;
    for (const f of file) {
      const errore = problemaFile(f);
      if (errore) toast.error(errore);
    }
    setAnalizzati(new Set());
    setCaricamento({ file, cartellaId: activeCustomFolder?.mode === "manual" ? activeCustomFolder.id : null });
  }, [activeCustomFolder, puoScrivere]);

  // Mobile: pagine da 25 righe (niente elenco con lo scorrimento interno) e
  // cartelle come pillole nel pannello filtri, solo quelle con dei documenti.
  const PER_PAGINA_MOBILE = 25;
  const pagineMobili = Math.max(1, Math.ceil(filteredItems.length / PER_PAGINA_MOBILE));
  const paginaMobileValida = Math.min(paginaMobile, pagineMobili);
  const righeMobili = filteredItems.slice((paginaMobileValida - 1) * PER_PAGINA_MOBILE, paginaMobileValida * PER_PAGINA_MOBILE);
  const cartellaMobile = activeCustomFolder ? `c:${activeCustomFolder.id}` : activeTab;
  const scelteCartelleMobili = [
    ...TABS.filter((tab) => tab === "tutti" || tab === activeTab || (countsByTab[tab] ?? 0) > 0).map((tab) => ({
      value: tab as string,
      label: TAB_LABELS[tab],
      n: countsByTab[tab] ?? 0,
    })),
    ...customFolders.map((folder) => ({
      value: `c:${folder.id}`,
      label: folder.name,
      n: countsByCustomFolder.get(folder.id) ?? 0,
    })),
  ];
  const scegliCartellaMobile = (value: string) => {
    if (value.startsWith("c:")) selectCustomFolder(value.slice(2));
    else selectSystemFolder(value as DriveTab);
    setPaginaMobile(1);
  };

  const updateNewFolderName = (value: string) => {
    setNewFolderName(value);
    setNewFolderMatchQuery((current) => {
      const previousDefault = buildDefaultFolderMatchQuery(newFolderName);
      if (!current.trim() || current === previousDefault) return buildDefaultFolderMatchQuery(value);
      return current;
    });
  };

  const resetNewFolderForm = () => {
    setCartellaInModifica(null);
    setModalitaCartella("manual");
    setNewFolderName("");
    setNewFolderMatchQuery("");
    setNewFolderDescription("");
  };

  const apriCartella = (folder?: MediaLibraryFolderRow) => {
    if (!puoScrivere) return;
    if (folder) {
      setCartellaInModifica(folder);
      setModalitaCartella(folder.mode);
      setNewFolderName(folder.name);
      setNewFolderDescription(folder.description ?? "");
      setNewFolderMatchQuery(folder.match_query ?? "");
    } else resetNewFolderForm();
    setShowFolderDialog(true);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!puoScrivere || !companyId || name.length < 2 || isCreatingFolder) return;
    const match_query = modalitaCartella === "automatic" ? newFolderMatchQuery.trim() || buildDefaultFolderMatchQuery(name) || name : null;
    setIsCreatingFolder(true);
    try {
      const values = { name, description: newFolderDescription.trim() || null, match_query };
      const tabella = supabase.from("media_library_folders");
      const query = cartellaInModifica
        ? tabella.update(values).eq("id", cartellaInModifica.id).eq("company_id", companyId).eq("updated_at", cartellaInModifica.updated_at).is("archived_at", null)
        : tabella.insert({ ...values, mode: modalitaCartella, slug: createMediaLibraryFolderSlug(name), company_id: companyId, created_by: user?.id ?? null });
      const { data, error } = await query.select(CAMPI_CARTELLA).maybeSingle();
      if (error || !data) throw error ?? new Error("La cartella è stata modificata nel frattempo.");
      toast.success(cartellaInModifica ? "Cartella aggiornata" : "Cartella creata");
      resetNewFolderForm();
      setShowFolderDialog(false);
      await refetchFolders();
      selectCustomFolder(data.id);
      setQuery("");
    } catch (err) {
      const error = err as { code?: string; message?: string } | undefined;
      toast.error("Cartella non salvata", { description: error?.code === "23505" ? "Esiste già una cartella con questo nome." : error?.message });
      void refetchFolders();
    } finally { setIsCreatingFolder(false); }
  };

  const cambiaArchivioCartella = async (folder: MediaLibraryFolderRow, archivia: boolean) => {
    if (!puoScrivere || !companyId || isCreatingFolder) return;
    setIsCreatingFolder(true);
    try {
      const { data, error } = await supabase.from("media_library_folders")
        .update({ archived_at: archivia ? new Date().toISOString() : null, archived_by: archivia ? user?.id : null })
        .eq("company_id", companyId).eq("id", folder.id).eq("updated_at", folder.updated_at).select("id").maybeSingle();
      if (error || !data) throw error ?? new Error("La cartella è stata modificata nel frattempo.");
      if (archivia && activeCustomFolderId === folder.id) mostraTutti();
      toast.success(archivia ? "Cartella archiviata" : "Cartella ripristinata");
      setNuovaCartellaDaArchiviare(null);
    } catch (err) {
      toast.error("Stato della cartella non aggiornato", { description: (err as { message?: string })?.message });
      setNuovaCartellaDaArchiviare(null);
    } finally {
      void refetchFolders();
      setIsCreatingFolder(false);
    }
  };

  const puoSpostareFile = (item: MediaLibraryItem) => puoScrivere && item.source === "drive_archive" && (permissions.isAdmin || item.actorId === user?.id);
  const spostaFile = async () => {
    if (!spostamento || !puoSpostareFile(spostamento.item) || !companyId || isCreatingFolder) return;
    setIsCreatingFolder(true);
    try {
      const precedente = spostamento.item.folderId;
      const comando = supabase.from("media_library_files").update({ folder_id: spostamento.cartella || null })
        .eq("company_id", companyId).eq("id", spostamento.item.id.slice("drive:".length));
      const { data, error } = await (precedente ? comando.eq("folder_id", precedente) : comando.is("folder_id", null)).select("id").maybeSingle();
      if (error || !data) throw error ?? new Error("Il file è già stato spostato da un altro utente.");
      setSpostamento(null);
      toast.success("File spostato");
    } catch (err) { toast.error("File non spostato", { description: (err as { message?: string })?.message }); }
    finally { setIsCreatingFolder(false); void sincronizzaArchivio(); }
  };

  const openSignedDocument = async (item: MediaLibraryItem) => {
    const target = resolveMediaLibraryOpenTarget(item);
    if (target.kind === "external") {
      window.open(target.url, "_blank", "noopener,noreferrer");
      return;
    }

    if (target.kind === "missing") {
      toast.error("File non disponibile", {
        description: "Questo record non ha ancora un riferimento storage apribile.",
      });
      return;
    }

    setOpeningId(item.id);
    // La scheda si apre subito, dentro il clic: aperta dopo l'attesa del link
    // firmato (che può anche riprovare per qualche secondo) Safari su iPhone la
    // blocca come popup. Il documento ci entra appena il link è pronto.
    const scheda = window.open("", "_blank");
    if (scheda) scheda.opener = null;
    try {
      const { data, error: signedError } = await retryWithBackoff(
        () => supabase.storage.from(target.storageBucket).createSignedUrl(target.storagePath, 3600),
        {
          maxAttempts: 3,
          onRetry: (attempt, _err, nextMs) => {
            if (attempt === 1) {
              toast.info("Riprovo ad aprire il file...", { description: `Tentativo ${attempt + 1} tra ${Math.round(nextMs / 1000)}s` });
            }
          },
        },
      );

      if (signedError || !data?.signedUrl) {
        throw new Error(signedError?.message ?? "URL firmato non generato");
      }

      if (scheda) scheda.location.replace(data.signedUrl);
      else window.location.assign(data.signedUrl);
    } catch (err) {
      scheda?.close();
      toast.error("Non riesco ad aprire il file", {
        description: err instanceof Error ? err.message : "Verifica permessi e bucket del documento.",
      });
    } finally {
      setOpeningId(null);
    }
  };

  const scaricaFileDrive = async (item: MediaLibraryItem) => {
    const target = resolveMediaLibraryOpenTarget(item);
    if (target.kind !== "storage" || openingId) return;
    setOpeningId(item.id);
    try {
      const { data, error } = await supabase.storage.from(target.storageBucket)
        .createSignedUrl(target.storagePath, 60, { download: item.fileName });
      if (error || !data) throw error ?? new Error("File non disponibile");
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.rel = "noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    } catch { toast.error("Impossibile scaricare il file"); }
    finally { setOpeningId(null); }
  };

  const handleComputoReady = (computoId: string) => {
    navigate(`/azienda/marketing/preventivi?action=import-computo&computo_id=${encodeURIComponent(computoId)}`);
  };

  if (permissions.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <EmptyState
        icon={Lock}
        title="Area documentale non disponibile"
        description="Il tuo ruolo non ha accesso a EiC Drive. Chiedi a un amministratore di aggiornare i permessi."
      />
    );
  }

  return (
    // max-sm:pb-0: sul telefono lo spazio per la barra in basso lo lascia già il layout.
    <div className="space-y-5 pb-20 md:pb-0 max-sm:space-y-3 max-sm:pb-0">
      {/* Titolo e «Carica» su una riga, senza riquadro né descrizione, come
          già sul telefono. Da tablet c'erano quattro bottoni che andavano su
          due righe: «Nuova cartella» è già il + della colonna Cartelle, Inbox
          AI e strumenti PDF stanno nel menu «⋯» (sul telefono restano fuori). */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between max-sm:flex-row max-sm:items-center max-sm:justify-between max-sm:gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-2xl font-bold tracking-tight max-sm:text-lg max-sm:leading-6">EiC Drive</h1>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 max-sm:shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="max-sm:hidden" aria-label="Altre azioni" title="Altre azioni">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2" onSelect={() => setShowSmartInbox(true)}>
                <Inbox className="h-4 w-4" /> Inbox AI
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onSelect={() => setShowPdfTools(true)}>
                <FileText className="h-4 w-4" /> Strumenti PDF
              </DropdownMenuItem>
              {puoScrivere && <DropdownMenuItem className="gap-2" onSelect={() => apriCartella()}>
                <FolderPlus className="h-4 w-4" /> Nuova cartella
              </DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
          {puoScrivere && <Button onClick={() => apriCaricamento()} className="tap-compact max-sm:h-8 max-sm:px-3 max-sm:text-xs">
            <UploadCloud className="mr-2 h-4 w-4 max-sm:mr-1.5" />
            <span className="max-sm:hidden">Carica file</span>
            <span className="sm:hidden">Carica</span>
          </Button>}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5 max-sm:hidden">
        <MetricCard label="Documenti" value={summary.total} icon={Archive} loading={isInitialMediaLoading} />
        <MetricCard label="Inbox AI" value={summary.aiInbox} icon={Brain} loading={isInitialMediaLoading} />
        <MetricCard label="Da verificare" value={summary.reviewRequired} icon={AlertTriangle} tone="warning" loading={isInitialMediaLoading} />
        <MetricCard label="Collegati" value={summary.linked} icon={Link2} tone="success" loading={isInitialMediaLoading} />
        <MetricCard label="Riservati" value={summary.reserved} icon={ShieldCheck} tone="restricted" loading={isInitialMediaLoading} />
      </div>

      {/* Mobile: due numeri; «Da classificare» apre la cartella omonima.
          Dopo i riquadri del desktop: da primo figlio nascosto li sposterebbe. */}
      <KpiMobili
        className="sm:hidden"
        voci={[
          { label: "Documenti", valore: isInitialMediaLoading ? "…" : String(summary.total) },
          {
            label: "Da classificare",
            valore: isInitialMediaLoading ? "…" : String(countsByTab.da_classificare ?? 0),
            tono: (countsByTab.da_classificare ?? 0) > 0 ? "text-amber-600" : undefined,
            onClick: () => scegliCartellaMobile(!activeCustomFolder && activeTab === "da_classificare" ? "tutti" : "da_classificare"),
            attivo: !activeCustomFolder && activeTab === "da_classificare",
          },
        ]}
      />

      {sourceWarnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Archivio caricato parzialmente</div>
              <p className="mt-1 text-xs leading-relaxed max-sm:hidden">
                Alcune fonti non hanno risposto: {sourceWarnings.join(" · ")}. I documenti disponibili restano consultabili.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Cartelle accanto all'elenco già da 768 (prima fino a 1280 stavano
          sopra, a tutta larghezza, e l'elenco partiva mezza pagina più giù);
          il dettaglio va sotto finché non c'è posto per la terza colonna. */}
      <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_360px] max-sm:hidden">
        <Card className="h-fit">
          <CardHeader className="px-3 pb-2 pt-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Cartelle</CardTitle>
              {puoScrivere && <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2" onClick={() => apriCartella()} aria-label="Nuova cartella">
                <FolderPlus className="h-4 w-4" /> Nuova
              </Button>}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-2 pb-3">
            <div className="space-y-0.5">
              {CARTELLE_PRINCIPALI.map(tab => <FolderNavButton key={tab} icon={TAB_ICONS[tab]} label={TAB_LABELS[tab]}
                description={TAB_DESCRIPTIONS[tab]} count={countsByTab[tab] ?? 0} active={!activeCustomFolder && activeTab === tab} onClick={() => selectSystemFolder(tab)} />)}
            </div>
            <details className="rounded-md border px-1" open={!activeCustomFolder && !CARTELLE_PRINCIPALI.includes(activeTab) ? true : undefined}>
              <summary className="cursor-pointer px-2 py-2 text-xs font-medium text-muted-foreground">Altre categorie</summary>
              {TABS.filter(tab => !CARTELLE_PRINCIPALI.includes(tab)).map(tab => <FolderNavButton key={tab} icon={TAB_ICONS[tab]} label={TAB_LABELS[tab]}
                description={TAB_DESCRIPTIONS[tab]} count={countsByTab[tab] ?? 0} active={!activeCustomFolder && activeTab === tab} onClick={() => selectSystemFolder(tab)} />)}
            </details>
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-center justify-between px-2">
                <p className="text-xs font-medium text-muted-foreground">Cartelle personalizzate</p>
                {isFetchingFolders && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              {customFolders.length > 5 && <Input aria-label="Cerca cartella" placeholder="Cerca cartella…" value={cercaCartella} onChange={e => setCercaCartella(e.target.value)} className="h-8 text-xs" />}
              {customFolders.length === 0 && puoScrivere && <Button type="button" variant="ghost" size="sm" onClick={() => apriCartella()} className="w-full justify-start text-xs">Crea la prima cartella</Button>}
              {customFolders.filter(folder => folder.name.toLowerCase().includes(cercaCartella.trim().toLowerCase())).map(folder => (
                <FolderNavButton key={folder.id} icon={folder.mode === "automatic" ? Sparkles : Folder} label={folder.name}
                  description={folder.description || (folder.mode === "automatic" ? "Automatica" : "Manuale")}
                  count={countsByCustomFolder.get(folder.id) ?? 0} active={activeCustomFolder?.id === folder.id} onClick={() => selectCustomFolder(folder.id)} />
              ))}
              {puoScrivere && cartelleArchiviate.length > 0 && <details className="rounded-md border px-2">
                <summary className="cursor-pointer py-2 text-xs text-muted-foreground">Archiviate ({cartelleArchiviate.length})</summary>
                {cartelleArchiviate.map(folder => <div key={folder.id} className="flex items-center gap-1 text-xs"><span className="flex-1 truncate">{folder.name}</span>
                  <Button variant="ghost" size="icon" aria-label={`Ripristina ${folder.name}`} disabled={isCreatingFolder} onClick={() => void cambiaArchivioCartella(folder, false)}><RotateCcw className="h-3.5 w-3.5" /></Button></div>)}
              </details>}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="gap-3 pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">{activeFolderTitle}</CardTitle>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{activeFolderDescription}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeCustomFolder && puoScrivere && <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label="Gestisci cartella"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => apriCartella(activeCustomFolder)}><Pencil className="mr-2 h-4 w-4" /> Modifica cartella</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setNuovaCartellaDaArchiviare(activeCustomFolder)}><Archive className="mr-2 h-4 w-4" /> Archivia cartella</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>}
                <Button variant="outline" size="icon" onClick={() => { void sincronizzaArchivio(); void refetchFolders(); }}
                  aria-label="Aggiorna" disabled={isFetching || estensioneArchivio || isFetchingFolders}>
                  {isFetching || estensioneArchivio || isFetchingFolders ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca per nome, tipo, area o collegamento..."
                className="pl-9 pr-9"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Pulisci ricerca"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
              <Button variant="outline" onClick={() => setFiltriDesktopAperti(!filtriDesktopAperti)} aria-expanded={filtriDesktopAperti}>
                <SlidersHorizontal className="mr-2 h-4 w-4" /> Filtri{filtriAggiuntivi ? ` (${filtriAggiuntivi})` : ""}
              </Button>
            </div>
            {filtriDesktopAperti && <div className="space-y-2 rounded-lg border bg-muted/25 p-3"><FiltriDrive {...impostazioniFiltro} />
              {filtriAggiuntivi > 0 && <Button size="sm" variant="ghost" onClick={azzeraFiltriAggiuntivi}>Azzera filtri</Button>}
            </div>}
            <p role="status" className="text-xs text-muted-foreground">{estensioneArchivio ? "Caricamento delle pagine precedenti…" : `${filteredItems.length} ${filteredItems.length === 1 ? "risultato" : "risultati"}`}</p>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {/* Skeleton "ad forma" della MediaRow vera: icona + nome + 2 badge + 2 azioni */}
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-2/3" />
                      <div className="flex gap-2">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-8 w-20 rounded-md" />
                    <Skeleton className="h-8 w-16 rounded-md" />
                  </div>
                ))}
              </div>
            ) : authExpired ? (
              <EmptyState
                inline
                icon={AlertTriangle}
                title="Sessione scaduta"
                description="La tua sessione è terminata. Accedi di nuovo per continuare a vedere i tuoi documenti."
                action={{ label: "Vai al login", onClick: () => navigate("/login?redirect=/azienda/contenuti-multimediali"), variant: "default" }}
              />
            ) : error ? (
              <EmptyState
                inline
                icon={AlertTriangle}
                title="Archivio non caricato"
                description={`Non riesco a leggere una o più fonti documentali. ${error instanceof Error ? error.message : ""}`.trim()}
                action={{ label: "Riprova", onClick: () => refetch(), variant: "outline" }}
              />
            ) : filteredItems.length === 0 && estensioneArchivio ? (
              <p role="status" className="p-4 text-sm text-muted-foreground">Cerco anche nelle pagine precedenti…</p>
            ) : filteredItems.length === 0 ? (
              rawItems.length === 0 ? (
                // Azienda nuova senza alcun documento: onboarding ricco con 3 azioni
                <div className="space-y-4 p-6">
                  <div className="text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-eic-amber-strong text-white shadow-md">
                      <FileText className="h-8 w-8" />
                    </div>
                    <h3 className="mt-4 text-xl font-bold tracking-tight text-slate-950">Il Drive è vuoto, iniziamo</h3>
                    <p className="mt-1 text-sm text-slate-600">Carica documenti, crea una cartella o apri l’Inbox AI.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => apriCaricamento()}
                      disabled={!puoScrivere}
                      className="flex flex-col items-start gap-2 rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 text-left transition hover:border-orange-400 hover:shadow-md"
                    >
                      <UploadCloud className="h-6 w-6 text-orange-600" />
                      <p className="text-sm font-bold text-slate-900">Carica un documento</p>
                      <p className="text-xs text-slate-600">DDT, fatture, computi, foto, contratti. Archivia i file oppure analizzali con Silvio.</p>
                      <span className="mt-auto text-xs font-semibold text-orange-700">Inizia →</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("inbox_ai")}
                      className="flex flex-col items-start gap-2 rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 text-left transition hover:border-blue-400 hover:shadow-md"
                    >
                      <Inbox className="h-6 w-6 text-blue-600" />
                      <p className="text-sm font-bold text-slate-900">Inbox AI</p>
                      <p className="text-xs text-slate-600">Inoltra documenti via email a un indirizzo dedicato. Silvio li classifica.</p>
                      <span className="mt-auto text-xs font-semibold text-blue-700">Configura →</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => apriCartella()}
                      className="flex flex-col items-start gap-2 rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 text-left transition hover:border-emerald-400 hover:shadow-md"
                    >
                      <FolderPlus className="h-6 w-6 text-emerald-600" />
                      <p className="text-sm font-bold text-slate-900">Crea una cartella</p>
                      <p className="text-xs text-slate-600">Raggruppa i file per progetto, cliente o tipo.</p>
                      <span className="mt-auto text-xs font-semibold text-emerald-700">Crea →</span>
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  inline
                  icon={FileText}
                  title="Nessun contenuto in questa vista"
                  description="Cambia filtro o tab per visualizzare gli allegati già presenti nell'archivio."
                  action={{ label: activeCustomFolder?.mode === "manual" && !query && !filtriAggiuntivi && puoScrivere ? "Carica in questa cartella" : "Mostra tutti",
                    onClick: activeCustomFolder?.mode === "manual" && !query && !filtriAggiuntivi && puoScrivere ? () => apriCaricamento() : mostraTutti, variant: "outline" }}
                />
              )
            ) : (
              <VirtualizedMediaList
                items={filteredItems}
                selectedId={selectedItem?.id ?? null}
                openingId={openingId}
                onSelect={setSelectedId}
                onOpen={openSignedDocument}
              />
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <MediaDetailPanel
            anteprima={!schermoStretto}
            item={selectedItem}
            opening={selectedItem ? openingId === selectedItem.id : false}
            onOpen={selectedItem ? () => openSignedDocument(selectedItem) : undefined}
            onImport={puoScrivere ? () => apriCaricamento() : undefined}
            onInbox={() => setShowSmartInbox(true)}
            onSposta={selectedItem && puoSpostareFile(selectedItem) ? () => setSpostamento({ item: selectedItem, cartella: selectedItem.folderId ?? "" }) : undefined}
            onDownload={selectedItem && resolveMediaLibraryOpenTarget(selectedItem).kind === "storage" ? () => void scaricaFileDrive(selectedItem) : undefined}
          />
        </div>
      </div>

      <IntegrationCoveragePanel coverage={integrationCoverage} loading={isInitialMediaLoading} className="max-sm:hidden" />

      {/* Mobile: ricerca con la cartella nel pannello filtri, documenti a righe
          da ~52px (nome; area e data; stato solo se c'è da fare), dettaglio in
          un foglio dal basso. Niente colonna cartelle, niente pannello fisso. */}
      <div className="space-y-2 sm:hidden">
        <CercaConFiltri
          valore={query}
          onCambia={(v) => { setQuery(v); setPaginaMobile(1); }}
          segnaposto={activeCustomFolder || activeTab !== "tutti" ? `Cerca in ${activeFolderTitle}` : "Cerca documento"}
          filtriAttivi={Number(Boolean(activeCustomFolder || activeTab !== "tutti")) + filtriAggiuntivi}
          onApriFiltri={() => setFiltriMobiliAperti(true)}
        />
        {isLoading ? (
          <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-1.5 px-3 py-2.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : authExpired ? (
          <EmptyState
            inline
            icon={AlertTriangle}
            title="Sessione scaduta"
            action={{ label: "Vai al login", onClick: () => navigate("/login?redirect=/azienda/contenuti-multimediali"), variant: "default" }}
          />
        ) : error ? (
          <EmptyState
            inline
            icon={AlertTriangle}
            title="Archivio non caricato"
            action={{ label: "Riprova", onClick: () => refetch(), variant: "outline" }}
          />
        ) : filteredItems.length === 0 ? (
          <div className="space-y-1 py-3 text-center text-xs text-muted-foreground">
            <p role="status">{estensioneArchivio ? "Cerco anche nelle pagine precedenti…" : rawItems.length === 0 ? "Il Drive è vuoto" : query ? "Nessun documento trovato" : "Nessun documento in questa cartella"}</p>
            {!estensioneArchivio && (query || activeCustomFolder || activeTab !== "tutti" || filtriAggiuntivi > 0) && <Button size="sm" variant="ghost" onClick={mostraTutti}>Mostra tutti</Button>}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
            {righeMobili.map((item) => (
              <RigaMobile
                key={item.id}
                sinistra={<MiniaturaDocumento item={item} className="h-8 w-8" />}
                titolo={item.fileName}
                sottotitolo={[item.areaLabel, item.lastActivityAt ? formatDate(item.lastActivityAt) : null].filter(Boolean).join(" · ")}
                stato={
                  item.statusTone === "warning" || item.statusTone === "error" || item.statusTone === "processing" ? (
                    <span className={item.statusTone === "processing" ? "text-blue-600" : item.statusTone === "error" ? "text-rose-600" : "text-amber-600"}>
                      {statusLabel(item)}
                    </span>
                  ) : undefined
                }
                onClick={() => setDettaglioMobile(item)}
              />
            ))}
          </div>
        )}
        {pagineMobili > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {(paginaMobileValida - 1) * PER_PAGINA_MOBILE + 1}–{Math.min(paginaMobileValida * PER_PAGINA_MOBILE, filteredItems.length)} di {filteredItems.length}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="tap-compact h-8 w-8"
                aria-label="Pagina precedente"
                disabled={paginaMobileValida <= 1}
                onClick={() => setPaginaMobile(paginaMobileValida - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="tap-compact h-8 w-8"
                aria-label="Pagina successiva"
                disabled={paginaMobileValida >= pagineMobili}
                onClick={() => setPaginaMobile(paginaMobileValida + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <PannelloFiltri
        aperto={filtriMobiliAperti}
        onAperto={setFiltriMobiliAperti}
        attivi={Number(Boolean(activeCustomFolder || activeTab !== "tutti")) + filtriAggiuntivi}
        onAzzera={mostraTutti}
        risultati={filteredItems.length}
      >
        <PilloleFiltro titolo="Cartella" valore={cartellaMobile} onScegli={scegliCartellaMobile} scelte={scelteCartelleMobili} />
        <FiltriDrive {...impostazioniFiltro} />
        {puoScrivere && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { setFiltriMobiliAperti(false); apriCartella(); }}>Nuova cartella</Button>
          {activeCustomFolder && <>
            <Button size="sm" variant="outline" onClick={() => { setFiltriMobiliAperti(false); apriCartella(activeCustomFolder); }}>Modifica cartella</Button>
            <Button size="sm" variant="ghost" onClick={() => { setFiltriMobiliAperti(false); setNuovaCartellaDaArchiviare(activeCustomFolder); }}>Archivia cartella</Button>
          </>}
          {cartelleArchiviate.length > 0 && <details className="w-full rounded-md border px-2 py-1"><summary className="text-sm">Cartelle archiviate</summary>
            {cartelleArchiviate.map(folder => <Button key={folder.id} size="sm" variant="ghost" onClick={() => void cambiaArchivioCartella(folder, false)} disabled={isCreatingFolder}>Ripristina {folder.name}</Button>)}
          </details>}
        </div>}
      </PannelloFiltri>

      {/* Mobile: il documento dal basso con i dati che servono e «Apri file». */}
      <Sheet open={!!dettaglioMobile} onOpenChange={(o) => { if (!o) setDettaglioMobile(null); }}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-6">
          {dettaglioMobile && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="break-words pr-6 text-base leading-tight">{dettaglioMobile.fileName}</SheetTitle>
                <SheetDescription className="sr-only">Dettaglio del documento</SheetDescription>
              </SheetHeader>
              <p className="mt-1 text-xs text-muted-foreground">
                {/* Niente doppioni (tipo uguale all'area) né «n.d.» quando manca la dimensione. */}
                {[
                  dettaglioMobile.areaLabel,
                  tipoSeDiversoDallArea(dettaglioMobile),
                  dettaglioMobile.fileSize ? formatFileSize(dettaglioMobile.fileSize) : null,
                  dettaglioMobile.lastActivityAt ? formatDate(dettaglioMobile.lastActivityAt) : null,
                ].filter(Boolean).join(" · ")}
              </p>
              <AnteprimaImmagine key={dettaglioMobile.id} item={dettaglioMobile} className="mt-3 max-h-[45dvh]" />
              <p className="mt-3 text-xs text-muted-foreground">
                {statusLabel(dettaglioMobile)}
                {dettaglioMobile.linkedEntityLabel ? (
                  percorsoRecordCollegato(dettaglioMobile.linkedEntityTable, dettaglioMobile.linkedEntityId) ? (
                    <>
                      {" · collegato a "}
                      <Link
                        to={percorsoRecordCollegato(dettaglioMobile.linkedEntityTable, dettaglioMobile.linkedEntityId)!}
                        className="font-medium text-primary underline underline-offset-2"
                      >
                        {dettaglioMobile.linkedEntityLabel}
                      </Link>
                    </>
                  ) : (
                    ` · collegato a ${dettaglioMobile.linkedEntityLabel}`
                  )
                ) : ""}
                {dettaglioMobile.actorLabel ? ` · ${dettaglioMobile.actorLabel}` : ""}
              </p>
              {dettaglioMobile.errorMessage ? (
                <p className="mt-2 text-xs text-amber-700">{dettaglioMobile.errorMessage}</p>
              ) : null}
              <Button
                className="mt-4 h-10 w-full"
                onClick={() => openSignedDocument(dettaglioMobile)}
                disabled={openingId === dettaglioMobile.id || resolveMediaLibraryOpenTarget(dettaglioMobile).kind === "missing"}
              >
                {openingId === dettaglioMobile.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                Anteprima
              </Button>
              <div className="mt-2 flex flex-wrap gap-2">
                {resolveMediaLibraryOpenTarget(dettaglioMobile).kind === "storage" && <Button variant="outline" size="sm" disabled={!!openingId} onClick={() => void scaricaFileDrive(dettaglioMobile)}><Download className="mr-2 h-4 w-4" /> Scarica</Button>}
                {puoSpostareFile(dettaglioMobile) && <Button variant="outline" size="sm" onClick={() => { setSpostamento({ item: dettaglioMobile, cartella: dettaglioMobile.folderId ?? "" }); setDettaglioMobile(null); }}><Folder className="mr-2 h-4 w-4" /> Sposta file</Button>}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <SmartDocumentInboxDialog
        open={showSmartInbox}
        onOpenChange={setShowSmartInbox}
        onImportNew={() => { if (puoScrivere) setShowSmartImport(true); }}
        onComputoReady={handleComputoReady}
      />

      <Dialog
        open={showFolderDialog}
        onOpenChange={(open) => {
          if (isCreatingFolder) return;
          setShowFolderDialog(open);
          if (!open) resetNewFolderForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{cartellaInModifica ? "Modifica cartella" : "Nuova cartella"}</DialogTitle>
            <DialogDescription>Le cartelle rispettano la visibilità dei singoli documenti.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {!cartellaInModifica && <div className="space-y-1.5">
              <Label htmlFor="media-folder-mode">Tipo di cartella</Label>
              <UniformSelect id="media-folder-mode" className="block w-full rounded-md border bg-background p-2 text-sm" value={modalitaCartella} onChange={e => setModalitaCartella(e.target.value as DriveFolderMode)}>
                <option value="manual">Manuale</option><option value="automatic">Automatica per parole chiave</option>
              </UniformSelect>
              <p className="text-xs text-muted-foreground">{modalitaCartella === "manual" ? "Scegli la cartella quando archivi o sposti un file." : "Raccoglie i documenti che corrispondono alle parole chiave impostate."}</p>
            </div>}
            <div className="space-y-2">
              <Label htmlFor="media-folder-name">Nome cartella</Label>
              <Input
                id="media-folder-name"
                value={newFolderName}
                onChange={(event) => updateNewFolderName(event.target.value)}
                placeholder="Es. Prodotti premium, Finanziarie, Render cliente Rossi"
              />
            </div>
            {modalitaCartella === "automatic" && <div className="space-y-2">
              <Label htmlFor="media-folder-query">Regole di raccolta</Label>
              <Textarea
                id="media-folder-query"
                value={newFolderMatchQuery}
                onChange={(event) => setNewFolderMatchQuery(event.target.value)}
                placeholder="Parole chiave separate da virgola: scheda prodotto, catalogo, render..."
              />
              <p className="text-xs text-muted-foreground">
                Il sistema cerca in nome file, tipo documento, area, record collegato, autore e metadati AI.
              </p>
            </div>}
            <div className="space-y-2">
              <Label htmlFor="media-folder-description">Nota interna</Label>
              <Textarea
                id="media-folder-description"
                value={newFolderDescription}
                onChange={(event) => setNewFolderDescription(event.target.value)}
                placeholder="A cosa serve questa cartella?"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFolderDialog(false)} disabled={isCreatingFolder}>
              Annulla
            </Button>
            <Button onClick={handleCreateFolder} disabled={isCreatingFolder || newFolderName.trim().length < 2}>
              {isCreatingFolder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
              {cartellaInModifica ? "Salva modifiche" : "Crea cartella"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {nuovaCartellaDaArchiviare && <Dialog open onOpenChange={open => { if (!open && !isCreatingFolder) setNuovaCartellaDaArchiviare(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Archivia «{nuovaCartellaDaArchiviare.name}»?</DialogTitle><DialogDescription>I file restano in Tutti. Puoi ripristinare la cartella da Archiviate.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" disabled={isCreatingFolder} onClick={() => setNuovaCartellaDaArchiviare(null)}>Annulla</Button>
            <Button disabled={isCreatingFolder} onClick={() => void cambiaArchivioCartella(nuovaCartellaDaArchiviare, true)}>Archivia cartella</Button></DialogFooter></DialogContent>
      </Dialog>}

      {spostamento && <Dialog open onOpenChange={open => { if (!open && !isCreatingFolder) setSpostamento(null); }}>
        <DialogContent><DialogHeader><DialogTitle>Sposta file</DialogTitle><DialogDescription>{spostamento.item.fileName}</DialogDescription></DialogHeader>
          <UniformSelect aria-label="Cartella di destinazione" value={spostamento.cartella} className="w-full rounded-md border bg-background p-2" disabled={isCreatingFolder}
            onChange={e => setSpostamento({ ...spostamento, cartella: e.target.value })}>
            <option value="">Archivio generale</option>{cartelleManuali.map(cartella => <option key={cartella.id} value={cartella.id}>{cartella.name}</option>)}
          </UniformSelect>
          <DialogFooter><Button variant="outline" disabled={isCreatingFolder} onClick={() => setSpostamento(null)}>Annulla</Button>
            <Button disabled={isCreatingFolder || spostamento.cartella === (spostamento.item.folderId ?? "")} onClick={() => void spostaFile()}>Sposta file</Button></DialogFooter></DialogContent>
      </Dialog>}

      {showPdfTools && (
        <Suspense fallback={null}>
          <PdfToolkitDialog open={showPdfTools} onOpenChange={setShowPdfTools} />
        </Suspense>
      )}

      {caricamento && companyId && user && puoScrivere && <CaricaFileDriveDialog key={`${companyId}:${user.id}`}
        open={!showSmartImport} companyId={companyId} userId={user.id} iniziali={caricamento.file} cartellaIniziale={caricamento.cartellaId}
        cartelle={cartelleManuali} analizzati={analizzati} onClose={chiudiCaricamento}
        onArchiviati={folderId => {
          void sincronizzaArchivio();
          setQuery("");
          if (folderId) selectCustomFolder(folderId);
          else selectSystemFolder("tutti");
        }}
        onAnalizza={file => { setDroppedFile(file); setShowSmartImport(true); }}
      />}
      {showSmartImport && puoScrivere && <SmartDocumentImportModal open onOpenChange={open => {
        setShowSmartImport(open);
        if (!open) setDroppedFile(null);
      }} onComputoReady={handleComputoReady} initialFile={droppedFile}
        onAnalysisReady={file => { setAnalizzati(prev => new Set([...prev, file])); void sincronizzaArchivio(); }}
      />}

      {puoScrivere && !caricamento && !showSmartImport && !showFolderDialog && !showSmartInbox && !showPdfTools
        && !nuovaCartellaDaArchiviare && !spostamento && <PageDropOverlay
        active={isDraggingFile} onFilesDropped={apriCaricamento} onDragStateChange={setIsDraggingFile}
      />}
    </div>
  );
}

function FiltriDrive({ origini, tipi, origine, tipo, dal, al, onOrigine, onTipo, onDal, onAl }: {
  origini: string[]; tipi: string[]; origine: string; tipo: string; dal: string; al: string;
  onOrigine: (v: string) => void; onTipo: (v: string) => void; onDal: (v: string) => void; onAl: (v: string) => void;
}) {
  const id = useId();
  const input = "mt-1 block h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm";
  return <div className="grid gap-2 sm:grid-cols-2">
    <label className="text-xs font-medium" htmlFor={`${id}-origine`}>Origine
      <UniformSelect id={`${id}-origine`} className={input} value={origine} onChange={e => onOrigine(e.target.value)}>
        <option value="">Tutte le origini</option>
        {origini.map(valore => <option key={valore} value={valore}>{valore}</option>)}
      </UniformSelect>
    </label>
    <label className="text-xs font-medium" htmlFor={`${id}-tipo`}>Tipo di documento
      <UniformSelect id={`${id}-tipo`} className={input} value={tipo} onChange={e => onTipo(e.target.value)}>
        <option value="">Tutti i tipi</option>
        {tipi.map(valore => <option key={valore} value={valore}>{valore.replaceAll("_", " ")}</option>)}
      </UniformSelect>
    </label>
    <label className="text-xs font-medium" htmlFor={`${id}-dal`}>Attività dal<Input id={`${id}-dal`} className={input} type="date" value={dal} max={al || undefined} onChange={e => onDal(e.target.value)} /></label>
    <label className="text-xs font-medium" htmlFor={`${id}-al`}>Attività al<Input id={`${id}-al`} className={input} type="date" value={al} min={dal || undefined} onChange={e => onAl(e.target.value)} /></label>
    {dal && al && dal > al && <p className="text-xs text-destructive sm:col-span-2" role="alert">La data finale precede quella iniziale.</p>}
  </div>;
}

function PageDropOverlay({
  active,
  onFilesDropped,
  onDragStateChange,
}: {
  active: boolean;
  onFilesDropped: (files: File[]) => void;
  onDragStateChange: (dragging: boolean) => void;
}) {
  useEffect(() => {
    // Qui il rilascio vale per tutta la pagina: il livello comune si fa da parte.
    document.body.setAttribute("data-rilascio-pagina", "");
    let dragCounter = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragCounter++;
      onDragStateChange(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) onDragStateChange(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault();
      dragCounter = 0;
      onDragStateChange(false);
      onFilesDropped(Array.from(e.dataTransfer.files));
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      document.body.removeAttribute("data-rilascio-pagina");
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFilesDropped, onDragStateChange]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-orange-500/20 backdrop-blur-sm transition-opacity">
      <div className="rounded-3xl border-4 border-dashed border-orange-500 bg-white/95 px-12 py-10 shadow-2xl">
        <div className="flex flex-col items-center gap-3">
          <UploadCloud className="h-16 w-16 text-orange-600" />
          <p className="text-2xl font-bold text-slate-950">Rilascia qui per caricare</p>
          <p className="text-sm text-slate-600">Silvio classifica automaticamente il documento e lo collega.</p>
        </div>
      </div>
    </div>
  );
}

function FolderNavButton({
  icon: Icon,
  label,
  description,
  count,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-orange-50 font-semibold text-orange-700" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">{label}</span>
          <Badge variant="secondary" className="h-5 min-w-6 shrink-0 justify-center text-[10px]">
            {count}
          </Badge>
        </span>
        {/* Sotto 1280 la colonna è di 200-220px: la spiegazione sotto ogni
            cartella andava su tre righe e tagliava i nomi («Da clas…»). */}
        <span className="mt-0.5 line-clamp-2 block text-[11px] font-normal leading-snug opacity-80 max-xl:hidden">{description}</span>
      </span>
    </button>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  loading = false,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "restricted";
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md",
            tone === "success" && "bg-emerald-50 text-emerald-700",
            tone === "warning" && "bg-amber-50 text-amber-700",
            tone === "restricted" && "bg-rose-50 text-rose-700",
            tone === "neutral" && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xl font-semibold leading-tight">
            {loading ? <Skeleton className="h-6 w-12" /> : value}
          </div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationCoveragePanel({
  coverage,
  loading = false,
  className,
}: {
  coverage: MediaLibraryIntegrationCoverage[];
  loading?: boolean;
  className?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const connected = coverage.filter((source) => source.state === "connected").length;
  const missingRequired = coverage.filter((source) => source.required && source.state === "missing").length;
  const connectedCount = coverage.reduce((total, source) => total + source.count, 0);
  const badgeClass = loading
    ? "border-slate-200 bg-muted text-muted-foreground"
    : missingRequired === 0
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  const badgeLabel = loading ? "Verifica in corso" : missingRequired === 0 ? "Copertura completa" : `${missingRequired} da collegare`;

  return (
    <Card className={cn("border-dashed bg-muted/20 shadow-none", className)}>
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                loading ? "bg-slate-300" : missingRequired === 0 ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Copertura Drive</span>
                <Badge variant="outline" className={cn("h-5 text-[10px]", badgeClass)}>
                  {badgeLabel}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {loading
                  ? "Sto verificando fonti, permessi e documenti collegati."
                  : `${connected} fonti attive · ${connectedCount} documenti mappati nelle fonti monitorate.`}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => setIsExpanded((value) => !value)}
            disabled={loading}
          >
            {isExpanded ? "Nascondi dettagli" : "Mostra dettagli"}
          </Button>
        </div>

        {isExpanded ? (
          <div className="grid gap-2 border-t pt-3 md:grid-cols-2 xl:grid-cols-5">
            {coverage.map((source) => {
                const isConnected = source.state === "connected";
                return (
                  <div
                    key={source.key}
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      isConnected ? "border-emerald-100 bg-emerald-50/60" : "border-slate-200 bg-muted/20",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{source.label}</div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                          {source.description}
                        </p>
                      </div>
                      {isConnected ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className={isConnected ? "text-emerald-700" : "text-muted-foreground"}>
                        {isConnected ? "Collegato" : "Nessun file"}
                      </span>
                      <Badge variant="secondary" className="h-5 min-w-6 justify-center text-[10px]">
                        {source.count}
                      </Badge>
                    </div>
                  </div>
                );
              })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function VirtualizedMediaList({
  items,
  selectedId,
  openingId,
  onSelect,
  onOpen,
}: {
  items: MediaLibraryItem[];
  selectedId: string | null;
  openingId: string | null;
  onSelect: (id: string) => void;
  onOpen: (item: MediaLibraryItem) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 6,
  });

  return (
    <div
      ref={parentRef}
      className="h-[min(58vh,620px)] overflow-auto"
      style={{ contain: "strict" }}
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) return null;
          return (
            <div
              key={item.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full border-b border-slate-100"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <MediaRow
                item={item}
                selected={selectedId === item.id}
                opening={openingId === item.id}
                onSelect={() => onSelect(item.id)}
                onOpen={() => onOpen(item)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MediaRow({
  item,
  selected,
  opening,
  onSelect,
  onOpen,
}: {
  item: MediaLibraryItem;
  selected: boolean;
  opening: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const canOpen = resolveMediaLibraryOpenTarget(item).kind !== "missing";

  return (
    <div className={cn("flex items-center gap-2 p-2.5 transition-colors hover:bg-muted/40", selected && "bg-primary/5")}>
      <button type="button" onClick={onSelect} aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <MiniaturaDocumento key={item.id} item={item} className="h-9 w-9" iconaClassName="h-4 w-4" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={item.fileName}>{item.fileName}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {[item.linkedEntityLabel ?? item.areaLabel, item.fileSize ? formatFileSize(item.fileSize) : null, formatDate(item.lastActivityAt)].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      {(item.statusTone === "warning" || item.statusTone === "error" || item.statusTone === "processing") &&
        <Badge variant="outline" className={cn("hidden shrink-0 lg:inline-flex", STATUS_TONE_CLASS[item.statusTone])}><IconaStatoDrive tono={item.statusTone} />{statusLabel(item)}</Badge>}
      <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" aria-label={`Apri ${item.fileName}`} title="Anteprima"
        onClick={onOpen} disabled={opening || !canOpen}>
        {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function MediaDetailPanel({
  item,
  opening,
  onOpen,
  onImport,
  onInbox,
  onSposta,
  onDownload,
  anteprima = true,
}: {
  item: MediaLibraryItem | null;
  opening: boolean;
  onOpen?: () => void;
  onImport?: () => void;
  onInbox: () => void;
  onSposta?: () => void;
  onDownload?: () => void;
  /** Falso sul telefono, dove il pannello è nascosto: l'immagine non si scarica. */
  anteprima?: boolean;
}) {
  if (!item) {
    return (
      <Card className="h-fit">
        <CardContent className="p-6">
          <EmptyState
            inline
            icon={FolderOpen}
            title="Seleziona un contenuto"
            description="Qui vedrai sicurezza, collegamenti, origine e azioni rapide sul file."
            action={onImport ? { label: "Carica file", onClick: onImport } : undefined}
          />
        </CardContent>
      </Card>
    );
  }

  const canOpen = resolveMediaLibraryOpenTarget(item).kind !== "missing";
  const quickFacts =
    item.metadataFacts.length > 0
      ? item.metadataFacts
      : compactFacts([
          `Area: ${item.areaLabel}`,
          `Origine: ${item.integrationLabel}`,
          `Sicurezza: ${item.securityLevel === "confidential" ? "riservato" : item.securityLevel === "restricted" ? "limitato" : "standard"}`,
          item.storageBucket ? `Bucket: ${item.storageBucket}` : null,
          item.externalUrl ? "URL esterno disponibile" : null,
        ]);

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <IconaFileDrive item={item} className="h-5 w-5 text-orange-500" />
          Dettaglio contenuto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="break-words font-semibold">{item.fileName}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline" className={STATUS_TONE_CLASS[item.statusTone]}>{statusLabel(item)}</Badge>
            <Badge variant="secondary">{item.areaLabel}</Badge>
            {item.securityLevel === "confidential" ? (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Riservato</Badge>
            ) : null}
          </div>
        </div>

        {anteprima ? <AnteprimaImmagine key={item.id} item={item} /> : null}

        <div className="grid grid-cols-2 gap-2 text-sm">
          <DetailStat label="Tipo" value={item.docType.replace(/_/g, " ")} />
          <DetailStat label="Dimensione" value={formatFileSize(item.fileSize)} />
          <DetailStat label="Origine" value={item.origins?.join(" · ") ?? item.integrationLabel} />
          <DetailStat label="Ultima attività" value={formatDate(item.lastActivityAt)} />
        </div>

        {typeof item.confidence === "number" ? (
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Confidenza</span>
              <span className="font-semibold">{Math.round(item.confidence * 100)}%</span>
            </div>
          </div>
        ) : null}

        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          <div className="mb-3 flex items-center gap-2 font-medium">
            <DatabaseIcon className="h-4 w-4 text-orange-500" />
            Carta d'identità del documento
          </div>
          <div className="space-y-3">
            {/* Il record collegato si apre da qui; nome della tabella e uuid
                (che erano scritti accanto) non dicevano niente a chi legge. */}
            <DetailLine
              icon={Link2}
              label="Collegato a"
              value={item.linkedEntityLabel ?? "Da collegare a cliente, preventivo, commessa o record operativo."}
              to={item.linkedEntityLabel ? percorsoRecordCollegato(item.linkedEntityTable, item.linkedEntityId) : null}
            />
            <DetailLine icon={UserRound} label="Caricato da" value={item.actorLabel ?? item.actorId ?? "Autore non registrato"} />
            <DetailLine icon={Sparkles} label="Azione" value={item.actionLabel} />
            <DetailLine icon={CalendarClock} label="Quando" value={formatDate(item.lastActivityAt)} />
          </div>
        </div>

        <div className="rounded-md border p-3 text-sm">
          <div className="mb-2 font-medium">Info rapide</div>
          <div className="flex flex-wrap gap-2">
            {quickFacts.map((fact) => (
              <Badge key={fact} variant="secondary" className="max-w-full justify-start whitespace-normal text-left">
                {fact}
              </Badge>
            ))}
          </div>
        </div>

        <div className="rounded-md border p-3 text-sm">
          <div className="mb-2 font-medium">Storia documento</div>
          <div className="space-y-2">
            {item.timeline.map((event, index) => (
              <div key={`${event.label}-${event.at ?? index}`} className="flex gap-2">
                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", STATUS_DOT_CLASS[event.tone])} />
                <div className="min-w-0">
                  <div className="font-medium leading-tight">{event.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(event.at)}
                    {event.detail ? ` · ${event.detail}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {item.errorMessage ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {item.errorMessage}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Button onClick={onOpen} disabled={opening || !canOpen}>
            {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Anteprima
          </Button>
          {onDownload && <Button variant="outline" disabled={opening} onClick={onDownload}><Download className="mr-2 h-4 w-4" /> Scarica</Button>}
          {onSposta && <Button variant="outline" onClick={onSposta}><Folder className="mr-2 h-4 w-4" /> Sposta file</Button>}
          {item.source === "ai_analysis" && <Button variant="outline" onClick={onInbox}>
            <Inbox className="mr-2 h-4 w-4" />
            Inbox documenti AI
          </Button>}
        </div>
      </CardContent>
    </Card>
  );
}

/** Sotto i 640px (`max-sm`): lì la griglia da computer c'è ma è nascosta. */
function useSchermoStretto(): boolean {
  const query = "(max-width: 639px)";
  const [stretto, setStretto] = useState(
    () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const cambia = () => setStretto(mql.matches);
    mql.addEventListener?.("change", cambia);
    return () => mql.removeEventListener?.("change", cambia);
  }, []);
  return stretto;
}

type TrasformazioneImmagine = { width: number; height?: number; resize: "cover" | "contain"; quality: number };

/** Miniatura delle righe: 96px bastano per 40px anche sugli schermi densi. */
const MINIATURA: TrasformazioneImmagine = { width: 96, height: 96, resize: "cover", quality: 60 };
/** Anteprima nella scheda: abbastanza grande da leggerla, non il file intero (un render è 2 MB). */
const ANTEPRIMA: TrasformazioneImmagine = { width: 900, resize: "contain", quality: 75 };

function eImmagineDrive(item: MediaLibraryItem): boolean {
  return (item.mimeType ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif|avif)$/i.test(item.fileName);
}

/** Da «…/storage/v1/object/public/<bucket>/<file>» all'indirizzo ridimensionato da Supabase. */
function urlPubblicoRidimensionato(url: string, t: TrasformazioneImmagine): string | null {
  const segnaposto = "/storage/v1/object/public/";
  const i = url.indexOf(segnaposto);
  if (i < 0) return null;
  const file = url.slice(i + segnaposto.length).split("?")[0];
  const parametri = new URLSearchParams({ width: String(t.width), resize: t.resize, quality: String(t.quality) });
  if (t.height) parametri.set("height", String(t.height));
  return `${url.slice(0, i)}/storage/v1/render/image/public/${file}?${parametri.toString()}`;
}

/**
 * Indirizzo ridimensionato di un'immagine del Drive: per i file in archivio un
 * link firmato di dieci minuti (con la stessa trasformazione dei render), per
 * quelli pubblici l'indirizzo di Supabase che ridimensiona. `ancheOriginale`:
 * per un indirizzo esterno che non si può ridimensionare, usa l'originale.
 */
function useIndirizzoImmagine(
  item: MediaLibraryItem,
  t: TrasformazioneImmagine,
  ancheOriginale: boolean,
  aSchermo = true,
): string | null {
  const target = resolveMediaLibraryOpenTarget(item);
  const attiva = aSchermo && eImmagineDrive(item) && target.kind !== "missing";
  const { data } = useQuery({
    queryKey: ["drive-immagine", item.id, t.width, t.height ?? 0, t.resize],
    enabled: attiva,
    staleTime: 9 * 60 * 1000,
    queryFn: async () => {
      if (target.kind === "external") {
        return urlPubblicoRidimensionato(target.url, t) ?? (ancheOriginale ? target.url : null);
      }
      if (target.kind !== "storage") return null;
      const { data: firmato } = await supabase.storage
        .from(target.storageBucket)
        .createSignedUrl(target.storagePath, 600, { transform: t });
      return firmato?.signedUrl ?? null;
    },
  });
  return attiva ? data ?? null : null;
}

/**
 * Vero quando l'elemento è (quasi) a schermo. Un elemento nascosto (la griglia
 * da computer sul telefono, e viceversa) non ci arriva mai: niente richieste.
 */
function useASchermo<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [aSchermo, setASchermo] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const elemento = ref.current;
    if (!elemento || aSchermo) return;
    const osservatore = new IntersectionObserver(
      (voci) => {
        if (voci.some((voce) => voce.isIntersecting)) {
          setASchermo(true);
          osservatore.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    osservatore.observe(elemento);
    return () => osservatore.disconnect();
  }, [aSchermo]);
  return [ref, aSchermo];
}

/**
 * Accanto al nome: la miniatura se è un'immagine (render, foto di cantiere),
 * altrimenti l'icona del tipo. Stessa misura, così le righe restano allineate.
 */
function MiniaturaDocumento({
  item,
  className,
  iconaClassName = "h-4 w-4",
}: {
  item: MediaLibraryItem;
  className?: string;
  iconaClassName?: string;
}) {
  const [ref, aSchermo] = useASchermo<HTMLSpanElement>();
  const indirizzo = useIndirizzoImmagine(item, MINIATURA, false, aSchermo);
  const [nonCaricata, setNonCaricata] = useState(false);
  return (
    <span
      ref={ref}
      className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background", className)}
      aria-hidden="true"
    >
      {indirizzo && !nonCaricata ? (
        <img src={indirizzo} alt="" decoding="async" onError={() => setNonCaricata(true)} className="h-full w-full object-cover" />
      ) : (
        <IconaFileDrive item={item} className={cn("text-muted-foreground", iconaClassName)} />
      )}
    </span>
  );
}

/**
 * L'immagine dentro la scheda del documento (render, foto di cantiere, foto
 * aziendali): si guarda senza aprirla fuori. Se non si carica, sparisce.
 */
function AnteprimaImmagine({ item, className }: { item: MediaLibraryItem; className?: string }) {
  const indirizzo = useIndirizzoImmagine(item, ANTEPRIMA, true);
  const [nonCaricata, setNonCaricata] = useState(false);
  if (!indirizzo || nonCaricata) return null;
  return (
    <img
      src={indirizzo}
      alt={item.fileName}
      loading="lazy"
      onError={() => setNonCaricata(true)}
      className={cn("max-h-72 w-full rounded-lg border bg-muted object-contain", className)}
    />
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 line-clamp-2 font-medium">{value}</div>
    </div>
  );
}

function DetailLine({ icon: Icon, label, value, to }: { icon: LucideIcon; label: string; value: string; to?: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        {to ? (
          <Link to={to} className="break-words font-medium text-primary underline-offset-2 hover:underline">
            {value}
          </Link>
        ) : (
          <div className="break-words font-medium">{value}</div>
        )}
      </div>
    </div>
  );
}
