import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  Brain,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
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

import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SmartDocumentImportModal } from "@/components/documenti/SmartDocumentImportModal";
import { SmartDocumentInboxDialog } from "@/components/documenti/SmartDocumentInboxDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { usePermissions } from "@/hooks/usePermissions";
import {
  buildMediaLibraryItem,
  buildDefaultFolderMatchQuery,
  canAccessMediaLibrary,
  combineMediaLibrarySourceBatches,
  createMediaLibraryFolderSlug,
  filterMediaLibraryItemsForPermissions,
  mediaLibraryItemMatchesCustomFolder,
  mediaLibraryItemMatchesSearch,
  mediaLibraryItemMatchesTab,
  pickMediaLibraryDetailItem,
  summarizeMediaLibraryItems,
  type MediaLibraryCustomFolderRule,
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
>;

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
  crm: "Clienti, contatti, opportunita e lead",
  foto_media: "Foto, video e asset multimediali",
  riservati: "Contratti, identita e documenti sensibili",
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
  fiscale: Database,
  cantieri: FolderOpen,
  crm: UserRound,
  foto_media: ImageIcon,
  riservati: Lock,
  altro: Folder,
};

const EMPTY_MEDIA_LOAD_RESULT: MediaLibraryLoadResult = { items: [], warnings: [] };

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
    opportunities: "Opportunita",
    invoices: "Fattura",
    computo_uploads: "Computo metrico",
    computo_voci_estratte: "Voce computo",
    products: "Prodotto",
    article_families: "Linea prodotto",
  };
  return labels[table] ?? table.replace(/_/g, " ");
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

function compactFacts(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value?.trim()));
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
  if (item.statusTone === "error") return "Errore";
  if (item.statusTone === "warning") return "Da verificare";
  if (item.statusTone === "processing") return "In analisi";
  if (item.source === "attachment") return "Collegato";
  return "Pronto";
}

function statusIcon(tone: MediaLibraryStatusTone) {
  if (tone === "error") return AlertTriangle;
  if (tone === "warning") return AlertTriangle;
  if (tone === "processing") return Clock3;
  if (tone === "success") return CheckCircle2;
  return FileText;
}

function iconForItem(item: MediaLibraryItem) {
  if (item.category === "foto_media") return ImageIcon;
  if (item.category === "riservati") return Lock;
  if (item.source === "ai_analysis") return Brain;
  if (item.source === "attachment") return Link2;
  return FileText;
}

async function loadMediaItems(companyId: string): Promise<MediaLibraryLoadResult> {
  const [analysisResult, computoResult, attachmentResult] = await Promise.all([
    supabase
      .from("document_analysis_results")
      .select(
        "id,doc_type,doc_subtype,status,file_name,file_size_bytes,mime_type,storage_bucket,storage_path,classification_confidence,created_at,updated_at,uploaded_by,parser_used,processing_time_ms,pages_count,cost_eur,error_message",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("computo_uploads")
      .select(
        "id,file_name,file_size,file_type,storage_path,extraction_status,extraction_confidence,created_at,updated_at,extraction_completed_at,extraction_method,extraction_error,quote_id,oggetto_lavori,committente,progettista,data_computo,uploaded_by",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("entity_attachments")
      .select(
        "id,entity_table,entity_id,file_name,file_size,mime_type,storage_bucket,storage_path,doc_type,doc_subtype,attached_at,attached_by,ai_suggested,user_confirmed,link_confidence,link_reasoning",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("attached_at", { ascending: false })
      .limit(120),
  ]);

  const analysisRows = analysisResult.error ? [] : ((analysisResult.data ?? []) as DocumentAnalysisRow[]);
  const computoRows = computoResult.error ? [] : ((computoResult.data ?? []) as ComputoUploadRow[]);
  const attachmentRows = attachmentResult.error ? [] : ((attachmentResult.data ?? []) as EntityAttachmentRow[]);
  const actorIds = Array.from(
    new Set(
      [
        ...analysisRows.map((row) => row.uploaded_by),
        ...computoRows.map((row) => row.uploaded_by),
        ...attachmentRows.map((row) => row.attached_by),
      ].filter((id): id is string => Boolean(id)),
    ),
  );

  const actorLabels = new Map<string, string>();
  let profileWarning: string | null = null;

  if (actorIds.length > 0) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id,first_name,last_name,email")
      .in("id", actorIds);

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

  const combined = combineMediaLibrarySourceBatches([
    { label: "Analisi AI", items: analysisItems, errorMessage: analysisResult.error?.message },
    { label: "Computi", items: computoItems, errorMessage: computoResult.error?.message },
    { label: "Allegati", items: attachmentItems, errorMessage: attachmentResult.error?.message },
  ]);

  return {
    items: combined.items,
    warnings: profileWarning ? [...combined.warnings, `Profili utenti: ${profileWarning}`] : combined.warnings,
  };
}

export default function ContenutiMultimediali() {
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const companyId = effectiveCompany?.id ?? null;
  const hasAccess = canAccessMediaLibrary(permissions);
  const [activeTab, setActiveTab] = useState<DriveTab>("tutti");
  const [activeCustomFolderId, setActiveCustomFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [showSmartInbox, setShowSmartInbox] = useState(false);
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderMatchQuery, setNewFolderMatchQuery] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const {
    data: mediaLoadResult = EMPTY_MEDIA_LOAD_RESULT,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["contenuti-multimediali", companyId],
    enabled: !!companyId && hasAccess && !permissions.isLoading,
    staleTime: 20_000,
    queryFn: () => loadMediaItems(companyId!),
  });

  const {
    data: customFolders = [],
    error: foldersError,
    isFetching: isFetchingFolders,
    refetch: refetchFolders,
  } = useQuery({
    queryKey: ["media-library-folders", companyId],
    enabled: !!companyId && hasAccess && !permissions.isLoading,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("media_library_folders")
        .select("id,name,slug,description,match_query,icon,color,sort_order,created_at,created_by")
        .eq("company_id", companyId!)
        .is("archived_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (queryError) throw queryError;
      return (data ?? []) as MediaLibraryFolderRow[];
    },
  });

  const rawItems = mediaLoadResult.items;
  const sourceWarnings = foldersError
    ? [...mediaLoadResult.warnings, `Cartelle personalizzate: ${foldersError.message}`]
    : mediaLoadResult.warnings;

  const visibleItems = useMemo(
    () => filterMediaLibraryItemsForPermissions(rawItems, permissions),
    [rawItems, permissions],
  );

  const summary = useMemo(() => summarizeMediaLibraryItems(visibleItems), [visibleItems]);
  const activeCustomFolder = useMemo(
    () => customFolders.find((folder) => folder.id === activeCustomFolderId) ?? null,
    [activeCustomFolderId, customFolders],
  );

  const filteredItems = useMemo(() => {
    const folderRule: MediaLibraryCustomFolderRule | null = activeCustomFolder
      ? { name: activeCustomFolder.name, matchQuery: activeCustomFolder.match_query }
      : null;

    return visibleItems.filter((item) => {
      const matchesFolder = folderRule
        ? mediaLibraryItemMatchesCustomFolder(item, folderRule)
        : mediaLibraryItemMatchesTab(item, activeTab);
      return matchesFolder && mediaLibraryItemMatchesSearch(item, query);
    });
  }, [activeCustomFolder, activeTab, query, visibleItems]);

  const selectedItem = useMemo(
    () => pickMediaLibraryDetailItem(filteredItems, selectedId),
    [filteredItems, selectedId],
  );

  const countsByTab = useMemo(() => {
    const counts = createEmptyTabCounts();
    for (const tab of TABS) {
      counts[tab] = visibleItems.filter((item) => mediaLibraryItemMatchesTab(item, tab)).length;
    }
    return counts;
  }, [visibleItems]);

  const countsByCustomFolder = useMemo(() => {
    const counts = new Map<string, number>();
    for (const folder of customFolders) {
      const rule: MediaLibraryCustomFolderRule = { name: folder.name, matchQuery: folder.match_query };
      counts.set(folder.id, visibleItems.filter((item) => mediaLibraryItemMatchesCustomFolder(item, rule)).length);
    }
    return counts;
  }, [customFolders, visibleItems]);

  const activeFolderTitle = activeCustomFolder?.name ?? TAB_LABELS[activeTab];
  const activeFolderDescription = activeCustomFolder?.description || activeCustomFolder?.match_query || TAB_DESCRIPTIONS[activeTab];

  const selectSystemFolder = (tab: DriveTab) => {
    setActiveTab(tab);
    setActiveCustomFolderId(null);
    setSelectedId(null);
  };

  const selectCustomFolder = (folderId: string) => {
    setActiveCustomFolderId(folderId);
    setSelectedId(null);
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
    setNewFolderName("");
    setNewFolderMatchQuery("");
    setNewFolderDescription("");
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!companyId) return;
    if (name.length < 2) {
      toast.error("Nome cartella troppo corto", { description: "Inserisci almeno 2 caratteri." });
      return;
    }

    const matchQuery = (newFolderMatchQuery.trim() || buildDefaultFolderMatchQuery(name)).trim();
    setIsCreatingFolder(true);

    try {
      const payload: Database["public"]["Tables"]["media_library_folders"]["Insert"] = {
        company_id: companyId,
        name,
        slug: createMediaLibraryFolderSlug(name),
        description: newFolderDescription.trim() || null,
        match_query: matchQuery || null,
        icon: "folder",
        color: "orange",
        created_by: user?.id ?? null,
      };

      const { data, error: insertError } = await supabase
        .from("media_library_folders")
        .insert(payload)
        .select("id,name,slug,description,match_query,icon,color,sort_order,created_at,created_by")
        .single();

      if (insertError) throw insertError;

      toast.success("Cartella creata", {
        description: matchQuery ? "La cartella raccogliera automaticamente i documenti coerenti." : "Puoi usarla come contenitore operativo.",
      });
      resetNewFolderForm();
      setShowFolderDialog(false);
      await refetchFolders();
      if (data?.id) setActiveCustomFolderId(data.id);
    } catch (err) {
      toast.error("Non riesco a creare la cartella", {
        description: err instanceof Error ? err.message : "Verifica permessi e connessione.",
      });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const openSignedDocument = async (item: MediaLibraryItem) => {
    if (!item.storageBucket || !item.storagePath) {
      toast.error("File non disponibile", {
        description: "Questo record non ha ancora un riferimento storage apribile.",
      });
      return;
    }

    setOpeningId(item.id);
    try {
      const { data, error: signedError } = await supabase.storage
        .from(item.storageBucket)
        .createSignedUrl(item.storagePath, 3600);

      if (signedError || !data?.signedUrl) {
        throw new Error(signedError?.message ?? "URL firmato non generato");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error("Non riesco ad aprire il file", {
        description: err instanceof Error ? err.message : "Verifica permessi e bucket del documento.",
      });
    } finally {
      setOpeningId(null);
    }
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
        description="Il tuo ruolo non ha accesso ai contenuti multimediali aziendali. Chiedi a un amministratore di aggiornare i permessi."
      />
    );
  }

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      <div className="flex flex-col gap-4 rounded-md border bg-background p-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-500 text-white">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Contenuti Multimediali</h1>
              <p className="text-sm text-muted-foreground">
                Drive aziendale per documenti, foto, computi, allegati e import AI.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowFolderDialog(true)}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Nuova cartella
          </Button>
          <Button variant="outline" onClick={() => setShowSmartInbox(true)}>
            <Inbox className="mr-2 h-4 w-4" />
            Inbox AI
          </Button>
          <Button onClick={() => setShowSmartImport(true)}>
            <UploadCloud className="mr-2 h-4 w-4" />
            Carica documento
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <MetricCard label="Documenti" value={summary.total} icon={Archive} />
        <MetricCard label="Inbox AI" value={summary.aiInbox} icon={Brain} />
        <MetricCard label="Da verificare" value={summary.reviewRequired} icon={AlertTriangle} tone="warning" />
        <MetricCard label="Collegati" value={summary.linked} icon={Link2} tone="success" />
        <MetricCard label="Riservati" value={summary.reserved} icon={ShieldCheck} tone="restricted" />
      </div>

      {sourceWarnings.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Archivio caricato parzialmente</div>
              <p className="mt-1 text-xs leading-relaxed">
                Alcune fonti non hanno risposto: {sourceWarnings.join(" · ")}. I documenti disponibili restano consultabili.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Cartelle</CardTitle>
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setShowFolderDialog(true)}>
                <FolderPlus className="h-4 w-4" />
                <span className="sr-only">Nuova cartella</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sistema</div>
              {TABS.map((tab) => (
                <FolderNavButton
                  key={tab}
                  icon={TAB_ICONS[tab]}
                  label={TAB_LABELS[tab]}
                  description={TAB_DESCRIPTIONS[tab]}
                  count={countsByTab[tab] ?? 0}
                  active={!activeCustomFolder && activeTab === tab}
                  onClick={() => selectSystemFolder(tab)}
                />
              ))}
            </div>

            <div className="space-y-1 border-t pt-3">
              <div className="flex items-center justify-between px-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Personalizzate</div>
                {isFetchingFolders ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
              </div>
              {customFolders.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setShowFolderDialog(true)}
                  className="w-full rounded-md border border-dashed px-3 py-3 text-left text-xs text-muted-foreground transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                >
                  Crea una cartella per raggruppare documenti per parola chiave, reparto o progetto.
                </button>
              ) : (
                customFolders.map((folder) => (
                  <FolderNavButton
                    key={folder.id}
                    icon={Folder}
                    label={folder.name}
                    description={folder.match_query || folder.description || "Cartella personalizzata"}
                    count={countsByCustomFolder.get(folder.id) ?? 0}
                    active={activeCustomFolder?.id === folder.id}
                    onClick={() => selectCustomFolder(folder.id)}
                  />
                ))
              )}
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refetch();
                  void refetchFolders();
                }}
                disabled={isFetching || isFetchingFolders}
              >
                {isFetching || isFetchingFolders ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Aggiorna
              </Button>
            </div>
            <div className="relative">
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
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : error ? (
              <EmptyState
                inline
                icon={AlertTriangle}
                title="Archivio non caricato"
                description="Non riesco a leggere una o piu fonti documentali. Riprova tra poco."
                action={{ label: "Riprova", onClick: () => refetch(), variant: "outline" }}
              />
            ) : filteredItems.length === 0 ? (
              <EmptyState
                inline
                icon={FileText}
                title="Nessun contenuto in questa vista"
                description="Carica un documento o cambia filtro per visualizzare gli allegati gia presenti."
                action={{ label: "Carica documento", onClick: () => setShowSmartImport(true) }}
              />
            ) : (
              <ScrollArea className="h-[min(58vh,620px)]">
                <div className="divide-y">
                  {filteredItems.map((item) => (
                    <MediaRow
                      key={item.id}
                      item={item}
                      selected={selectedItem?.id === item.id}
                      opening={openingId === item.id}
                      onSelect={() => setSelectedId(item.id)}
                      onOpen={() => openSignedDocument(item)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <MediaDetailPanel
          item={selectedItem}
          opening={selectedItem ? openingId === selectedItem.id : false}
          onOpen={selectedItem ? () => openSignedDocument(selectedItem) : undefined}
          onImport={() => setShowSmartImport(true)}
          onInbox={() => setShowSmartInbox(true)}
        />
      </div>

      <SmartDocumentInboxDialog
        open={showSmartInbox}
        onOpenChange={setShowSmartInbox}
        onImportNew={() => setShowSmartImport(true)}
        onComputoReady={handleComputoReady}
      />

      <Dialog
        open={showFolderDialog}
        onOpenChange={(open) => {
          setShowFolderDialog(open);
          if (!open) resetNewFolderForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova cartella</DialogTitle>
            <DialogDescription>
              Crea una cartella intelligente: resta filtrata dai permessi utente e raccoglie automaticamente i file che combaciano con le parole chiave.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="media-folder-name">Nome cartella</Label>
              <Input
                id="media-folder-name"
                value={newFolderName}
                onChange={(event) => updateNewFolderName(event.target.value)}
                placeholder="Es. Prodotti premium, Finanziarie, Render cliente Rossi"
              />
            </div>
            <div className="space-y-2">
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
            </div>
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
              Crea cartella
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SmartDocumentImportModal
        open={showSmartImport}
        onOpenChange={(open) => {
          setShowSmartImport(open);
          if (!open) void refetch();
        }}
        onComputoReady={handleComputoReady}
      />
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
        <span className="mt-0.5 line-clamp-2 block text-[11px] font-normal leading-snug opacity-80">{description}</span>
      </span>
    </button>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "restricted";
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
          <div className="text-xl font-semibold leading-tight">{value}</div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
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
  const Icon = iconForItem(item);
  const StatusIcon = statusIcon(item.statusTone);
  const activityLabel = item.actorLabel ? `${item.actionLabel} da ${item.actorLabel}` : item.actionLabel;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-3 p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 md:flex-row md:items-center md:justify-between",
        selected && "bg-orange-50/70",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{item.fileName}</p>
            <Badge variant="outline" className={cn("h-6", STATUS_TONE_CLASS[item.statusTone])}>
              <StatusIcon className="mr-1 h-3.5 w-3.5" />
              {statusLabel(item)}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{item.areaLabel}</span>
            <span>{item.docType.replace(/_/g, " ")}</span>
            <span>{item.integrationLabel}</span>
            <span>{formatFileSize(item.fileSize)}</span>
            <span>{formatDate(item.lastActivityAt)}</span>
            <span>{activityLabel}</span>
            {item.linkedEntityLabel ? <span>Collegato a {item.linkedEntityLabel}</span> : null}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2 md:justify-end" onClick={(event) => event.stopPropagation()}>
        <Button type="button" variant="outline" size="sm" onClick={onSelect}>
          <Eye className="mr-2 h-4 w-4" />
          Dettagli
        </Button>
        <Button type="button" size="sm" onClick={onOpen} disabled={opening || !item.storageBucket || !item.storagePath}>
          {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Apri
        </Button>
      </div>
    </div>
  );
}

function MediaDetailPanel({
  item,
  opening,
  onOpen,
  onImport,
  onInbox,
}: {
  item: MediaLibraryItem | null;
  opening: boolean;
  onOpen?: () => void;
  onImport: () => void;
  onInbox: () => void;
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
            action={{ label: "Carica documento", onClick: onImport }}
          />
        </CardContent>
      </Card>
    );
  }

  const Icon = iconForItem(item);
  const quickFacts =
    item.metadataFacts.length > 0
      ? item.metadataFacts
      : compactFacts([
          `Area: ${item.areaLabel}`,
          `Origine: ${item.integrationLabel}`,
          `Sicurezza: ${item.securityLevel === "confidential" ? "riservato" : item.securityLevel === "restricted" ? "limitato" : "standard"}`,
          item.storageBucket ? `Bucket: ${item.storageBucket}` : null,
        ]);

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5 text-orange-500" />
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

        <div className="grid grid-cols-2 gap-2 text-sm">
          <DetailStat label="Tipo" value={item.docType.replace(/_/g, " ")} />
          <DetailStat label="Dimensione" value={formatFileSize(item.fileSize)} />
          <DetailStat label="Origine" value={item.integrationLabel} />
          <DetailStat label="Ultima attivita" value={formatDate(item.lastActivityAt)} />
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
            <Database className="h-4 w-4 text-orange-500" />
            Carta identita documento
          </div>
          <div className="space-y-3">
            <DetailLine
              icon={Link2}
              label="Collegato a"
              value={
                item.linkedEntityLabel
                  ? `${item.linkedEntityLabel}${item.linkedEntityTable ? ` (${item.linkedEntityTable})` : ""}`
                  : "Da collegare a cliente, preventivo, commessa o record operativo."
              }
            />
            <DetailLine icon={UserRound} label="Caricato da" value={item.actorLabel ?? item.actorId ?? "Autore non registrato"} />
            <DetailLine icon={Sparkles} label="Azione" value={item.actionLabel} />
            <DetailLine icon={CalendarClock} label="Quando" value={formatDate(item.lastActivityAt)} />
          </div>
          {item.linkedEntityId ? (
            <div className="mt-3 rounded-md bg-background px-2 py-1.5 text-[11px] text-muted-foreground">
              ID collegato: <span className="font-mono">{item.linkedEntityId}</span>
            </div>
          ) : null}
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
          <Button onClick={onOpen} disabled={opening || !item.storageBucket || !item.storagePath}>
            {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Apri file
          </Button>
          <Button variant="outline" onClick={onInbox}>
            <Inbox className="mr-2 h-4 w-4" />
            Inbox documenti AI
          </Button>
          <Button variant="outline" onClick={onImport}>
            <Sparkles className="mr-2 h-4 w-4" />
            Nuovo import AI
          </Button>
        </div>
      </CardContent>
    </Card>
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

function DetailLine({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="break-words font-medium">{value}</div>
      </div>
    </div>
  );
}
