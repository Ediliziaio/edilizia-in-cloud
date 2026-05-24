export type MediaLibrarySource = "ai_analysis" | "computo" | "attachment";

export type MediaLibraryCategory =
  | "tutti"
  | "inbox_ai"
  | "preventivi"
  | "fiscale"
  | "cantieri"
  | "crm"
  | "foto_media"
  | "riservati"
  | "altro";

export type MediaLibrarySecurityLevel = "standard" | "restricted" | "confidential";

export type MediaLibraryStatusTone = "success" | "warning" | "processing" | "error" | "neutral";

export type MediaLibraryView = MediaLibraryCategory | "da_classificare" | "collegati";

export interface MediaLibraryTimelineEvent {
  label: string;
  at: string | null;
  detail: string | null;
  tone: MediaLibraryStatusTone;
}

export interface MediaLibraryPermissions {
  isAdmin?: boolean;
  canViewOrders?: boolean;
  canViewTickets?: boolean;
  canViewCustomers?: boolean;
  canViewBilling?: boolean;
  canViewPrimaNota?: boolean;
  canViewTesoreria?: boolean;
  canViewCosts?: boolean;
  canViewMarketing?: boolean;
  canViewMarketingContacts?: boolean;
  canViewMarketingOpportunities?: boolean;
  canViewMarketingReports?: boolean;
  canViewMarketingDashboard?: boolean;
  canViewSettingsCustomization?: boolean;
  canViewRenderAi?: boolean;
  canViewWarehouse?: boolean;
  canViewSicurezzaCantiere?: boolean;
  canViewSubappaltatori?: boolean;
  canViewGiornaleLavori?: boolean;
}

export interface BuildMediaLibraryItemInput {
  id: string;
  source: MediaLibrarySource;
  fileName: string | null;
  docType?: string | null;
  docSubtype?: string | null;
  status?: string | null;
  createdAt?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  confidence?: number | null;
  linkedEntityLabel?: string | null;
  linkedEntityTable?: string | null;
  linkedEntityId?: string | null;
  actorId?: string | null;
  actorLabel?: string | null;
  actionLabel?: string | null;
  integrationLabel?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  metadataFacts?: string[];
  errorMessage?: string | null;
}

export interface MediaLibraryItem extends Required<Pick<BuildMediaLibraryItemInput, "id" | "source">> {
  fileName: string;
  docType: string;
  docSubtype: string | null;
  status: string;
  statusTone: MediaLibraryStatusTone;
  createdAt: string | null;
  fileSize: number | null;
  mimeType: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  confidence: number | null;
  category: Exclude<MediaLibraryCategory, "tutti" | "inbox_ai">;
  securityLevel: MediaLibrarySecurityLevel;
  areaLabel: string;
  linkedEntityLabel: string | null;
  linkedEntityTable: string | null;
  linkedEntityId: string | null;
  actorId: string | null;
  actorLabel: string | null;
  actionLabel: string;
  integrationLabel: string;
  updatedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  metadataFacts: string[];
  timeline: MediaLibraryTimelineEvent[];
  errorMessage: string | null;
}

export interface MediaLibrarySummary {
  total: number;
  aiInbox: number;
  reviewRequired: number;
  processing: number;
  linked: number;
  reserved: number;
  errors: number;
}

export interface MediaLibrarySourceBatch {
  label: string;
  items: MediaLibraryItem[];
  errorMessage?: string | null;
}

export interface MediaLibraryLoadResult {
  items: MediaLibraryItem[];
  warnings: string[];
}

const SENSITIVE_DOC_TYPES = new Set([
  "contratto",
  "documento_identita",
  "polizza_assicurativa",
  "verbale_collaudo",
  "tabella_finanziamento",
]);

const FISCAL_DOC_TYPES = new Set(["fattura", "ricevuta", "ddt", "nota_credito", "documento_fiscale"]);
const QUOTE_DOC_TYPES = new Set(["preventivo", "computo_metrico", "listino_prezzi", "scheda_tecnica"]);
const SITE_DOC_TYPES = new Set(["verbale_cantiere", "rapportino", "sal", "documento_pa"]);
const CRM_DOC_TYPES = new Set(["biglietto_visita", "lead_form", "documento_cliente"]);
const MEDIA_DOC_TYPES = new Set(["foto_generale", "render", "immagine", "video", "audio"]);
const SITE_ENTITY_TABLES = new Set(["orders", "tickets", "giornale_lavori", "sicurezza_cantiere", "subappaltatori"]);
const QUOTE_ENTITY_TABLES = new Set(["quotes", "quote_items", "computo_uploads"]);
const FISCAL_ENTITY_TABLES = new Set(["invoices", "billing_documents", "purchase_orders", "expenses"]);
const CRM_ENTITY_TABLES = new Set(["customers", "profiles", "opportunities", "marketing_contacts", "contacts"]);

function normalizeDocType(docType: string | null | undefined): string {
  return (docType ?? "documento_generico").trim().toLowerCase() || "documento_generico";
}

function normalizeEntityTable(entityTable: string | null | undefined): string {
  return (entityTable ?? "").trim().toLowerCase();
}

function inferStatusTone(status: string | null | undefined): MediaLibraryStatusTone {
  const normalized = (status ?? "").toLowerCase();
  if (["failed", "error", "errore"].includes(normalized)) return "error";
  if (["review_required", "needs_review", "da_verificare"].includes(normalized)) return "warning";
  if (["processing", "pending", "queued", "in_progress"].includes(normalized)) return "processing";
  if (["success", "completed", "attached", "ready"].includes(normalized)) return "success";
  return "neutral";
}

function defaultIntegrationLabel(source: MediaLibrarySource): string {
  if (source === "ai_analysis") return "Inbox documenti AI";
  if (source === "computo") return "Preventivi / computo metrico";
  return "Allegato operativo";
}

function defaultActionLabel(source: MediaLibrarySource, tone: MediaLibraryStatusTone): string {
  if (source === "ai_analysis") {
    if (tone === "processing") return "Analisi AI in corso";
    if (tone === "warning") return "Da verificare in Inbox AI";
    if (tone === "error") return "Analisi AI fallita";
    if (tone === "success") return "Analizzato da AI";
    return "Caricato in Inbox AI";
  }

  if (source === "computo") {
    if (tone === "processing") return "Estrazione computo in corso";
    if (tone === "warning") return "Computo da verificare";
    if (tone === "error") return "Estrazione computo fallita";
    if (tone === "success") return "Computo elaborato";
    return "Computo importato";
  }

  return "Collegato al record";
}

function initialTimelineLabel(source: MediaLibrarySource): string {
  if (source === "computo") return "Importato";
  if (source === "attachment") return "Collegato";
  return "Caricato";
}

function buildTimeline(
  input: BuildMediaLibraryItemInput,
  statusTone: MediaLibraryStatusTone,
  actionLabel: string,
  integrationLabel: string,
): MediaLibraryTimelineEvent[] {
  const actorDetail = input.actorLabel ?? input.actorId ?? null;
  const createdAt = input.createdAt ?? null;
  const activityAt = input.completedAt ?? input.updatedAt ?? null;
  const firstLabel = initialTimelineLabel(input.source);
  const events: MediaLibraryTimelineEvent[] = [];

  if (createdAt) {
    events.push({
      label: firstLabel,
      at: createdAt,
      detail: actorDetail,
      tone: "neutral",
    });
  }

  if (activityAt && (activityAt !== createdAt || (actionLabel !== firstLabel && input.source !== "attachment"))) {
    events.push({
      label: actionLabel,
      at: activityAt,
      detail: integrationLabel,
      tone: statusTone,
    });
  }

  if (!events.length) {
    events.push({
      label: actionLabel,
      at: activityAt,
      detail: integrationLabel,
      tone: statusTone,
    });
  }

  return events;
}

function inferProfile(input: BuildMediaLibraryItemInput): Pick<MediaLibraryItem, "category" | "securityLevel" | "areaLabel"> {
  const docType = normalizeDocType(input.docType);
  const entityTable = normalizeEntityTable(input.linkedEntityTable);

  if (SENSITIVE_DOC_TYPES.has(docType)) {
    return {
      category: "riservati",
      securityLevel: "confidential",
      areaLabel: docType === "tabella_finanziamento" ? "Finanziamenti" : "Legale e firme",
    };
  }

  if (FISCAL_DOC_TYPES.has(docType)) {
    return { category: "fiscale", securityLevel: "restricted", areaLabel: "Finanza" };
  }

  if (QUOTE_DOC_TYPES.has(docType) || input.source === "computo") {
    return { category: "preventivi", securityLevel: "standard", areaLabel: "Preventivi" };
  }

  if (docType === "foto_cantiere") {
    return { category: "foto_media", securityLevel: "standard", areaLabel: "Cantieri" };
  }

  if (SITE_DOC_TYPES.has(docType)) {
    return { category: "cantieri", securityLevel: "standard", areaLabel: "Cantieri" };
  }

  if (CRM_DOC_TYPES.has(docType)) {
    return { category: "crm", securityLevel: "standard", areaLabel: "CRM" };
  }

  if (SITE_ENTITY_TABLES.has(entityTable)) {
    return { category: "cantieri", securityLevel: "standard", areaLabel: "Cantieri" };
  }

  if (QUOTE_ENTITY_TABLES.has(entityTable)) {
    return { category: "preventivi", securityLevel: "standard", areaLabel: "Preventivi" };
  }

  if (FISCAL_ENTITY_TABLES.has(entityTable)) {
    return { category: "fiscale", securityLevel: "restricted", areaLabel: "Finanza" };
  }

  if (CRM_ENTITY_TABLES.has(entityTable)) {
    return { category: "crm", securityLevel: "standard", areaLabel: "CRM" };
  }

  if (MEDIA_DOC_TYPES.has(docType) || (input.mimeType ?? "").startsWith("image/") || (input.mimeType ?? "").startsWith("video/")) {
    return { category: "foto_media", securityLevel: "standard", areaLabel: "Media" };
  }

  return { category: "altro", securityLevel: "standard", areaLabel: "Archivio" };
}

export function buildMediaLibraryItem(input: BuildMediaLibraryItemInput): MediaLibraryItem {
  const profile = inferProfile(input);
  const docType = normalizeDocType(input.docType);
  const statusTone = inferStatusTone(input.status);
  const actionLabel = input.actionLabel?.trim() || defaultActionLabel(input.source, statusTone);
  const integrationLabel = input.integrationLabel?.trim() || defaultIntegrationLabel(input.source);
  const completedAt = input.completedAt ?? null;
  const updatedAt = input.updatedAt ?? null;

  return {
    id: input.id,
    source: input.source,
    fileName: input.fileName?.trim() || "Documento senza nome",
    docType,
    docSubtype: input.docSubtype ?? null,
    status: input.status ?? "ready",
    statusTone,
    createdAt: input.createdAt ?? null,
    fileSize: input.fileSize ?? null,
    mimeType: input.mimeType ?? null,
    storageBucket: input.storageBucket ?? null,
    storagePath: input.storagePath ?? null,
    confidence: input.confidence ?? null,
    category: profile.category,
    securityLevel: profile.securityLevel,
    areaLabel: profile.areaLabel,
    linkedEntityLabel: input.linkedEntityLabel ?? null,
    linkedEntityTable: input.linkedEntityTable ?? null,
    linkedEntityId: input.linkedEntityId ?? null,
    actorId: input.actorId ?? null,
    actorLabel: input.actorLabel ?? null,
    actionLabel,
    integrationLabel,
    updatedAt,
    completedAt,
    lastActivityAt: completedAt ?? updatedAt ?? input.createdAt ?? null,
    metadataFacts: input.metadataFacts?.filter(Boolean) ?? [],
    timeline: buildTimeline(input, statusTone, actionLabel, integrationLabel),
    errorMessage: input.errorMessage ?? null,
  };
}

export function canAccessMediaLibrary(permissions: MediaLibraryPermissions): boolean {
  return Boolean(
    permissions.isAdmin ||
      permissions.canViewOrders ||
      permissions.canViewTickets ||
      permissions.canViewCustomers ||
      permissions.canViewBilling ||
      permissions.canViewPrimaNota ||
      permissions.canViewTesoreria ||
      permissions.canViewCosts ||
      permissions.canViewMarketing ||
      permissions.canViewMarketingContacts ||
      permissions.canViewMarketingOpportunities ||
      permissions.canViewMarketingReports ||
      permissions.canViewMarketingDashboard ||
      permissions.canViewSettingsCustomization ||
      permissions.canViewRenderAi ||
      permissions.canViewWarehouse ||
      permissions.canViewSicurezzaCantiere ||
      permissions.canViewSubappaltatori ||
      permissions.canViewGiornaleLavori,
  );
}

export function canViewMediaLibraryCategory(
  category: MediaLibraryItem["category"],
  permissions: MediaLibraryPermissions,
): boolean {
  if (permissions.isAdmin) return true;

  switch (category) {
    case "riservati":
      return Boolean(permissions.canViewSettingsCustomization);
    case "fiscale":
      return Boolean(permissions.canViewBilling || permissions.canViewPrimaNota || permissions.canViewTesoreria || permissions.canViewCosts);
    case "preventivi":
      return Boolean(permissions.canViewMarketingOpportunities || permissions.canViewOrders || permissions.canViewSettingsCustomization);
    case "cantieri":
      return Boolean(
        permissions.canViewOrders ||
          permissions.canViewTickets ||
          permissions.canViewGiornaleLavori ||
          permissions.canViewSicurezzaCantiere ||
          permissions.canViewSubappaltatori,
      );
    case "crm":
      return Boolean(permissions.canViewMarketingContacts || permissions.canViewMarketingOpportunities || permissions.canViewCustomers);
    case "foto_media":
      return Boolean(permissions.canViewRenderAi || permissions.canViewMarketingDashboard || permissions.canViewOrders);
    case "altro":
      return canAccessMediaLibrary(permissions);
  }
}

export function filterMediaLibraryItemsForPermissions(
  items: MediaLibraryItem[],
  permissions: MediaLibraryPermissions,
): MediaLibraryItem[] {
  if (!canAccessMediaLibrary(permissions)) return [];
  return items.filter((item) => canViewMediaLibraryCategory(item.category, permissions));
}

export function mediaLibraryItemMatchesTab(item: MediaLibraryItem, tab: MediaLibraryView): boolean {
  if (tab === "tutti") return true;
  if (tab === "inbox_ai") return item.source === "ai_analysis";
  if (tab === "da_classificare") {
    return (
      item.statusTone === "warning" ||
      item.statusTone === "processing" ||
      item.statusTone === "error" ||
      item.category === "altro" ||
      ((item.source === "ai_analysis" || item.source === "computo") && !item.linkedEntityLabel)
    );
  }
  if (tab === "collegati") return Boolean(item.linkedEntityLabel);
  return item.category === tab;
}

export function mediaLibraryItemMatchesSearch(item: MediaLibraryItem, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    item.fileName,
    item.docType,
    item.areaLabel,
    item.linkedEntityLabel,
    item.linkedEntityTable,
    item.linkedEntityId,
    item.actorLabel,
    item.actorId,
    item.integrationLabel,
    item.actionLabel,
    ...item.metadataFacts,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

export function combineMediaLibrarySourceBatches(batches: MediaLibrarySourceBatch[]): MediaLibraryLoadResult {
  const warnings = batches
    .filter((batch) => Boolean(batch.errorMessage))
    .map((batch) => `${batch.label}: ${batch.errorMessage}`);

  const items = batches
    .flatMap((batch) => batch.items)
    .sort((a, b) => {
      const da = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const db = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return db - da;
    });

  return { items, warnings };
}

export function pickMediaLibraryDetailItem(items: MediaLibraryItem[], selectedId: string | null): MediaLibraryItem | null {
  return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
}

export function summarizeMediaLibraryItems(items: MediaLibraryItem[]): MediaLibrarySummary {
  return {
    total: items.length,
    aiInbox: items.filter((item) => item.source === "ai_analysis").length,
    reviewRequired: items.filter((item) => item.statusTone === "warning").length,
    processing: items.filter((item) => item.statusTone === "processing").length,
    linked: items.filter((item) => Boolean(item.linkedEntityLabel)).length,
    reserved: items.filter((item) => item.securityLevel === "confidential").length,
    errors: items.filter((item) => item.statusTone === "error").length,
  };
}
