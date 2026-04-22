// ============================================================================
// EmailTemplatesPanel — Editor super_admin per template email transazionali
// ============================================================================
// Lista + editor + preview live dei template in `platform_email_templates`.
//
// Caratteristiche Fase 2:
//   - Live preview con debounce 500 ms (nessun click "Genera")
//   - Toolbar inserimento rapido (bold, link, lista, placeholder più usati)
//   - Selettore variante ruolo (default / super_admin / company_admin / member)
//   - Drawer cronologia revisioni + rollback a una versione specifica
//   - Dirty tracking + guard su navigazione e selezione altri template
//   - Responsive: sidebar collapsabile su schermi piccoli
// ============================================================================

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Eye,
  Save,
  RotateCcw,
  Loader2,
  Info,
  Sparkles,
  CheckCircle2,
  Code2,
  Bold,
  Link as LinkIcon,
  List,
  History,
  UserCog,
  Monitor,
  Smartphone,
  Tablet,
  Undo2,
  Variable,
  Redo2,
} from "lucide-react";

import {
  TEMPLATE_META,
  EDITABLE_TEMPLATE_KEYS,
  applyPlaceholders,
  type TemplateMeta,
  type PlaceholderDef,
} from "@/lib/emailTemplates";
import {
  useEmailTemplates,
  useUpsertEmailTemplate,
  useDeleteEmailTemplate,
  usePreviewEmailTemplate,
  useEmailTemplateHistory,
  useRollbackEmailTemplate,
  type EmailTemplateRow,
  type EmailTemplateHistoryRow,
  type EmailTemplateDesignJson,
} from "@/hooks/useEmailTemplates";
import { BuilderSidebar } from "@/components/email-builder/BuilderSidebar";
import { BuilderCanvas } from "@/components/email-builder/BuilderCanvas";
import { BuilderPropertiesPanel } from "@/components/email-builder/BuilderPropertiesPanel";
import {
  createBlock,
  type BlockType,
  type BuilderBlock as BuilderBlockType,
  type ColumnLayout,
} from "@/components/email-builder/builderTypes";
import { generateEmailBodyHtml } from "@/components/email-builder/builderHtmlGenerator";
import {
  BUILTIN_FIELDS,
  FOLDER_LABELS,
  toSnakeCase,
  type UnifiedField,
} from "@/components/settings/CustomFieldsConfig";
import { supabase } from "@/integrations/supabase/client";

// ── Helpers ─────────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  onboarding: "Onboarding",
  account: "Account",
  documenti: "Documenti",
  notifiche: "Notifiche",
};

const PLACEHOLDER_CATEGORY_LABELS: Record<string, string> = {
  destinatario: "Destinatario",
  contenuto: "Contenuto",
  link: "Link",
  azienda: "Azienda",
  platform: "Piattaforma",
  admin: "Superadmin",
  billing: "Billing",
  support: "Supporto",
  sales: "Vendite",
  user: "Utente destinatario",
  recipient: "Destinatario email",
};

const PLATFORM_CUSTOM_FIELDS_KEY = "platform_email_custom_fields";

interface PlatformEmailCustomField {
  id: string;
  name: string;
  fieldType: string;
  namespace: string;
  folder: string;
  createdAt: string;
}

const ACCESS_USER_PLACEHOLDERS: PlaceholderDef[] = [
  {
    key: "user.first_name",
    label: "Nome utente che riceve l'accesso",
    example: "Marco",
    required: false,
    category: "destinatario",
  },
  {
    key: "user.last_name",
    label: "Cognome utente",
    example: "Rossi",
    required: false,
    category: "destinatario",
  },
  {
    key: "user.full_name",
    label: "Nome completo utente",
    example: "Marco Rossi",
    required: false,
    category: "destinatario",
  },
  {
    key: "user.email",
    label: "Email utente",
    example: "marco@azienda.it",
    required: false,
    category: "destinatario",
  },
  {
    key: "user.role_label",
    label: "Ruolo utente",
    example: "Operaio",
    required: false,
    category: "destinatario",
  },
  {
    key: "user.login_url",
    label: "Link accesso piattaforma",
    example: "https://app.ediliziaincloud.it/login",
    required: false,
    category: "link",
  },
  {
    key: "user.invite_url",
    label: "Link accettazione invito",
    example: "https://app.ediliziaincloud.it/invito?token=abc",
    required: false,
    category: "link",
  },
  {
    key: "company.name",
    label: "Nome azienda",
    example: "Rossi Costruzioni SRL",
    required: false,
    category: "azienda",
  },
  {
    key: "recipient.first_name",
    label: "Nome destinatario email",
    example: "Marco",
    required: false,
    category: "destinatario",
  },
  {
    key: "recipient.email",
    label: "Email destinatario",
    example: "marco@azienda.it",
    required: false,
    category: "destinatario",
  },
];

type EditorTab = "visual" | "split" | "content" | "preview";

const ADMIN_SYSTEM_PLACEHOLDERS: PlaceholderDef[] = [
  {
    key: "platform.name",
    label: "Nome piattaforma",
    example: "Edilizia in Cloud",
    required: false,
    category: "platform",
  },
  {
    key: "platform.support_email",
    label: "Email supporto piattaforma",
    example: "supporto@ediliziaincloud.it",
    required: false,
    category: "platform",
  },
  {
    key: "admin.first_name",
    label: "Nome superadmin",
    example: "Florin",
    required: false,
    category: "admin",
  },
  {
    key: "billing.mrr",
    label: "MRR azienda",
    example: "149,00 EUR",
    required: false,
    category: "billing",
  },
  {
    key: "billing.trial_end_date",
    label: "Scadenza prova",
    example: "30/04/2026",
    required: false,
    category: "billing",
  },
];

/** Varianti ruolo supportate (aggiungere qui nuove varianti). */
const ROLE_VARIANTS: Array<{ value: string; label: string; hint: string }> = [
  { value: "__default__", label: "Default (tutti i ruoli)", hint: "Usato se non esiste una variante specifica" },
  { value: "super_admin", label: "Super admin", hint: "Solo admin di piattaforma" },
  { value: "company_admin", label: "Admin azienda", hint: "Amministratori delle aziende clienti" },
  { value: "company_member", label: "Membro azienda", hint: "Operai / collaboratori" },
  { value: "client", label: "Cliente finale", hint: "Destinatari esterni (clienti delle aziende)" },
];

const DEFAULT_VARIANT = "__default__";

/** Sentinel client-side → valore DB (NULL per default). */
function variantToDb(v: string): string | null {
  return v === DEFAULT_VARIANT ? null : v;
}

function makeBlockId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface TemplateStarter {
  title: string;
  intro: string;
  buttonText: string;
  buttonUrl: string;
}

const TEMPLATE_STARTERS: Record<string, TemplateStarter> = {
  welcome: {
    title: "Benvenuto in {{company.name}}",
    intro:
      "Ciao {{user.first_name}},\n\nil tuo accesso a {{company.name}} e pronto. Entra in piattaforma per completare il profilo e iniziare a lavorare con il tuo ruolo: {{user.role_label}}.",
    buttonText: "Accedi alla piattaforma",
    buttonUrl: "{{user.login_url}}",
  },
  user_invited: {
    title: "Hai ricevuto un invito",
    intro:
      "Ciao {{user.first_name}},\n\n{{inviterName}} ti ha invitato in {{company.name}} come {{user.role_label}}. Accetta l'invito e crea il tuo accesso personale.",
    buttonText: "Accetta invito",
    buttonUrl: "{{user.invite_url}}",
  },
  password_reset: {
    title: "Recupero password",
    intro:
      "Ciao {{user.first_name}},\n\nabbiamo ricevuto una richiesta di recupero password. Usa il pulsante qui sotto entro {{ttlMinutes}} minuti.",
    buttonText: "Reimposta password",
    buttonUrl: "{{resetUrl}}",
  },
  account_verify: {
    title: "Conferma la tua email",
    intro:
      "Ciao {{user.first_name}},\n\nconferma il tuo indirizzo email per attivare correttamente l'account. Il link resta valido per {{expiresIn}}.",
    buttonText: "Conferma email",
    buttonUrl: "{{verifyUrl}}",
  },
  invoice_sent: {
    title: "Fattura {{invoiceNumber}}",
    intro:
      "Ciao {{recipient.first_name}},\n\nabbiamo emesso la fattura {{invoiceNumber}} per un totale di {{totalFormatted}}. Puoi consultarla o scaricarla dal link qui sotto.",
    buttonText: "Apri fattura",
    buttonUrl: "{{invoiceUrl}}",
  },
  invoice_due_soon: {
    title: "Promemoria fattura {{invoiceNumber}}",
    intro:
      "Ciao {{recipient.first_name}},\n\nla fattura {{invoiceNumber}} da {{totalFormatted}} ha scadenza {{dueDate}}. Ti lasciamo qui il link per consultarla.",
    buttonText: "Visualizza fattura",
    buttonUrl: "{{invoiceUrl}}",
  },
  quote_sent: {
    title: "Preventivo {{quoteNumber}}",
    intro:
      "Ciao {{recipient.first_name}},\n\nil preventivo {{quoteNumber}} da {{totalFormatted}} e pronto. Aprilo per consultare i dettagli e procedere con l'accettazione.",
    buttonText: "Apri preventivo",
    buttonUrl: "{{acceptanceUrl}}",
  },
  ddt_sent: {
    title: "DDT {{ddtNumber}}",
    intro:
      "Ciao {{recipient.first_name}},\n\nil documento di trasporto {{ddtNumber}} del {{ddtDate}} e disponibile. Puoi scaricarlo dal link qui sotto.",
    buttonText: "Scarica DDT",
    buttonUrl: "{{ddtUrl}}",
  },
  payment_received: {
    title: "Pagamento ricevuto",
    intro:
      "Ciao {{recipient.first_name}},\n\nabbiamo registrato il pagamento di {{amountFormatted}} per la fattura {{invoiceNumber}} in data {{paidAtFormatted}}.",
    buttonText: "Apri ricevuta",
    buttonUrl: "{{receiptUrl}}",
  },
};

function starterFor(templateKey: string): TemplateStarter {
  const meta = TEMPLATE_META[templateKey];
  return TEMPLATE_STARTERS[templateKey] ?? {
    title: meta?.label ?? "Titolo email",
    intro:
      "Ciao {{user.first_name}},\n\npersonalizza qui il messaggio usando i campi dinamici dell'utente, dell'azienda e del documento.",
    buttonText: "Apri piattaforma",
    buttonUrl: "{{user.login_url}}",
  };
}

function defaultVisualBlocksFor(templateKey: string): BuilderBlockType[] {
  const starter = starterFor(templateKey);
  return [
    {
      id: makeBlockId("title"),
      type: "text",
      props: {
        content: starter.title,
        fontSize: "24px",
        color: "#1a1a1a",
        textAlign: "left",
        fontFamily: "Arial",
        fontWeight: "bold",
      },
    },
    {
      id: makeBlockId("intro"),
      type: "text",
      props: {
        content: starter.intro,
        fontSize: "16px",
        color: "#333333",
        textAlign: "left",
        fontFamily: "Arial",
        fontWeight: "normal",
      },
    },
    {
      id: makeBlockId("button"),
      type: "button",
      props: {
        text: starter.buttonText,
        url: starter.buttonUrl,
        backgroundColor: "#1d4ed8",
        textColor: "#ffffff",
        borderRadius: "6px",
        align: "left",
      },
    },
  ];
}

function htmlToVisualBlocks(html: string, templateKey: string): BuilderBlockType[] {
  if (!html.trim()) return defaultVisualBlocksFor(templateKey);
  return [
    {
      id: makeBlockId("legacy-html"),
      type: "html",
      props: { code: html },
    },
  ];
}

function designToBlocks(design: EmailTemplateDesignJson | null, fallbackHtml: string, templateKey: string): BuilderBlockType[] {
  const maybeBlocks = design?.blocks;
  if (Array.isArray(maybeBlocks)) return maybeBlocks as BuilderBlockType[];
  return fallbackHtml.trim() ? htmlToVisualBlocks(fallbackHtml, templateKey) : defaultVisualBlocksFor(templateKey);
}

function blocksToDesign(blocks: BuilderBlockType[]): EmailTemplateDesignJson {
  return {
    engine: "eic-email-builder",
    version: 1,
    blocks: blocks as unknown as Record<string, unknown>[],
  };
}

const PREVIEW_WIDTHS = {
  desktop: "600px",
  tablet: "480px",
  mobile: "320px",
} as const;

const BUILTIN_FIELD_MOCKS = BUILTIN_FIELDS.reduce<Record<string, string>>((acc, field) => {
  const key = field.uniqueKey.replace(/[{}]/g, "").trim();
  acc[key] = field.name;
  return acc;
}, {
  "contact.first_name": "Marco",
  "contact.last_name": "Rossi",
  "contact.email": "marco.rossi@example.com",
  "company.name": "Rossi Costruzioni SRL",
  "platform.name": "Edilizia in Cloud",
  "platform.support_email": "support@ediliziaincloud.com",
  "admin.first_name": "Florin",
  "billing.mrr": "149,00 EUR",
  "billing.trial_end_date": "30/04/2026",
});

function splitMockName(name: string): { first: string; last: string; full: string } {
  const full = name.trim() || "Marco Rossi";
  const parts = full.split(/\s+/);
  return {
    first: parts[0] || "Marco",
    last: parts.slice(1).join(" ") || "Rossi",
    full,
  };
}

function parsePlatformEmailCustomFields(value: string | null): PlatformEmailCustomField[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((field): field is PlatformEmailCustomField => {
      return (
        typeof field?.id === "string" &&
        typeof field?.name === "string" &&
        typeof field?.fieldType === "string" &&
        typeof field?.namespace === "string" &&
        typeof field?.folder === "string" &&
        typeof field?.createdAt === "string"
      );
    });
  } catch {
    return [];
  }
}

function placeholderFromUnifiedField(field: UnifiedField): PlaceholderDef | null {
  const key = field.uniqueKey.replace(/[{}]/g, "").trim();
  if (!key) return null;
  return {
    key,
    label: field.name,
    example: field.name,
    required: false,
    category: field.folder || "contenuto",
  };
}

function placeholderFromPlatformField(field: PlatformEmailCustomField): PlaceholderDef {
  return {
    key: `${field.namespace}.${toSnakeCase(field.name)}`,
    label: field.name,
    example: field.name,
    required: false,
    category: field.folder || field.namespace,
  };
}

function getAvailablePlaceholders(
  meta: TemplateMeta | undefined,
  platformCustomPlaceholders: PlaceholderDef[],
): PlaceholderDef[] {
  const map = new Map<string, PlaceholderDef>();
  const companySystemPlaceholders = BUILTIN_FIELDS
    .map(placeholderFromUnifiedField)
    .filter((field): field is PlaceholderDef => Boolean(field));

  for (const placeholder of [
    ...ACCESS_USER_PLACEHOLDERS,
    ...companySystemPlaceholders,
    ...ADMIN_SYSTEM_PLACEHOLDERS,
    ...platformCustomPlaceholders,
    ...(meta?.placeholders ?? []),
  ]) {
    map.set(placeholder.key, placeholder);
  }
  return Array.from(map.values());
}

function getPreviewMockProps(meta: TemplateMeta | undefined): Record<string, string> {
  const legacy = {
    ...BUILTIN_FIELD_MOCKS,
    ...(meta?.mockProps ?? {}),
  };
  const recipient = splitMockName(legacy.recipientName ?? legacy["contact.full_name"] ?? "Marco Rossi");
  const loginUrl = legacy.loginUrl ?? legacy.acceptUrl ?? legacy.verifyUrl ?? legacy.resetUrl ?? "https://app.ediliziaincloud.it/login";
  return {
    ...legacy,
    userFirstName: recipient.first,
    userLastName: recipient.last,
    userFullName: recipient.full,
    userEmail: legacy.recipientEmail ?? legacy.email ?? "marco@azienda.it",
    userRoleLabel: legacy.roleLabel ?? "Admin azienda",
    userLoginUrl: loginUrl,
    userInviteUrl: legacy.acceptUrl ?? loginUrl,
    recipientFirstName: recipient.first,
    recipientLastName: recipient.last,
    recipientEmail: legacy.recipientEmail ?? legacy.email ?? "marco@azienda.it",
    contactFirstName: legacy.contactFirstName ?? recipient.first,
    contactLastName: legacy.contactLastName ?? recipient.last,
    contactEmail: legacy.contactEmail ?? legacy.recipientEmail ?? "marco@azienda.it",
    companyName: legacy.companyName ?? legacy["company.name"] ?? "Rossi Costruzioni SRL",
  };
}

function buildLocalPreviewHtml(subject: string, htmlBody: string, mockProps: Record<string, string>): string {
  const data: Record<string, unknown> = {
    ...mockProps,
    companyName: mockProps.companyName || "Rossi Costruzioni SRL",
  };
  const renderedSubject = applyPlaceholders(subject, data, false);
  const renderedBody = applyPlaceholders(htmlBody, data, true);
  const companyName = data.companyName ? String(data.companyName) : "Edilizia in Cloud";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:28px 16px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;color:#1e3a5f;font-size:20px;font-weight:700;">${companyName}</td>
            </tr>
            <tr>
              <td style="padding:34px 32px;">
                <div style="display:none;max-height:0;overflow:hidden;">${renderedSubject}</div>
                ${renderedBody}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#f9fafb;color:#64748b;font-size:12px;line-height:1.5;">Email di esempio generata dall'editor.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function placeholderTag(key: string) {
  return key.trim().startsWith("{{") ? key.trim() : `{{${key.trim()}}}`;
}

/** Debounce hook: ritorna un valore che si aggiorna solo dopo `delay` ms di stabilità. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Inserisce testo in una textarea gestita da React preservando la selezione. */
function insertAtCursor(
  textarea: HTMLTextAreaElement,
  insert: string,
  selectionOffset?: number,
): { next: string; caret: number } {
  const { value, selectionStart, selectionEnd } = textarea;
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);
  const finalInsert = insert.includes("$SEL$")
    ? insert.replace("$SEL$", selected || "")
    : insert;
  const next = `${before}${finalInsert}${after}`;
  const caret = before.length + (selectionOffset ?? finalInsert.length);
  return { next, caret };
}

// ── Sub-component: placeholder chip list ────────────────────────────────────
function PlaceholderChips({
  placeholders,
  onInsert,
}: {
  placeholders: PlaceholderDef[];
  onInsert: (key: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filteredPlaceholders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return placeholders;
    return placeholders.filter((placeholder) => {
      return (
        placeholder.key.toLowerCase().includes(q) ||
        placeholder.label.toLowerCase().includes(q) ||
        (placeholder.category ?? "").toLowerCase().includes(q) ||
        (FOLDER_LABELS[placeholder.category ?? ""] ?? "").toLowerCase().includes(q)
      );
    });
  }, [placeholders, query]);

  const byCategory = useMemo(() => {
    const groups: Record<string, PlaceholderDef[]> = {};
    for (const p of filteredPlaceholders) {
      (groups[p.category] ??= []).push(p);
    }
    return groups;
  }, [filteredPlaceholders]);

  return (
    <div className="space-y-3">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Cerca variabile, campo o oggetto"
        className="h-8 text-xs"
      />
      {filteredPlaceholders.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Nessuna variabile trovata.
        </p>
      )}
      {Object.entries(byCategory).map(([cat, items]) => (
        <div key={cat}>
          <p className="text-xs font-medium text-muted-foreground mb-1.5">
            {PLACEHOLDER_CATEGORY_LABELS[cat] ?? FOLDER_LABELS[cat] ?? cat}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => onInsert(p.key)}
                className="text-xs font-mono px-2 py-1 rounded-md bg-muted hover:bg-muted/80 border text-left transition-colors"
                title={`${p.label}${p.required ? " (obbligatorio)" : ""} — es. ${p.example}`}
              >
                {`{{${p.key}}}`}
                {p.required && (
                  <span aria-label="Obbligatorio" className="ml-1 text-destructive">
                    *
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SubjectVariableButton({
  placeholders,
  onInsert,
}: {
  placeholders: PlaceholderDef[];
  onInsert: (tag: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return placeholders;
    return placeholders.filter((placeholder) =>
      placeholder.key.toLowerCase().includes(normalized) ||
      placeholder.label.toLowerCase().includes(normalized) ||
      (placeholder.category ?? "").toLowerCase().includes(normalized),
    );
  }, [placeholders, query]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs">
          <Variable className="mr-1 h-3 w-3" />
          Variabili
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[340px] w-[320px] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b bg-background p-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder="Cerca variabile"
            className="h-8 text-xs"
          />
        </div>
        {filtered.slice(0, 120).map((placeholder) => {
          const tag = placeholderTag(placeholder.key);
          return (
            <DropdownMenuItem key={placeholder.key} onClick={() => onInsert(tag)}>
              <span className="mr-2 min-w-0 flex-1 truncate font-mono text-xs text-primary">{tag}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{placeholder.label}</span>
            </DropdownMenuItem>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-3 py-5 text-center text-xs text-muted-foreground">
            Nessuna variabile trovata.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Sub-component: history list ─────────────────────────────────────────────
function HistoryList({
  templateId,
  onRollback,
  onClose,
}: {
  templateId: string | null;
  onRollback: (row: EmailTemplateHistoryRow) => void;
  onClose: () => void;
}) {
  const historyQuery = useEmailTemplateHistory(templateId);

  if (!templateId) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessuna cronologia disponibile: questo template non ha ancora una
        personalizzazione salvata.
      </p>
    );
  }

  if (historyQuery.isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (historyQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Errore caricamento cronologia: {(historyQuery.error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  const rows = historyQuery.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ancora nessuna modifica salvata dopo la prima versione.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="border rounded-md p-3 space-y-2 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">
                  v{row.version}
                </Badge>
                <Badge
                  variant={
                    row.change_type === "restore"
                      ? "default"
                      : row.change_type === "delete"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {row.change_type === "update"
                    ? "Modifica"
                    : row.change_type === "restore"
                      ? "Ripristino"
                      : "Rimosso"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(row.changed_at).toLocaleString("it-IT")}
                </span>
              </div>
              <p className="text-sm mt-1 truncate font-medium">
                {row.subject}
              </p>
              {row.notes && (
                <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-2">
                  {row.notes}
                </p>
              )}
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="shrink-0">
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Ripristina
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Ripristinare la versione {row.version}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Il contenuto corrente verrà sostituito con lo snapshot
                    del <strong>{new Date(row.changed_at).toLocaleString("it-IT")}</strong>.
                    La versione attuale viene archiviata nella cronologia e
                    puoi sempre tornare indietro.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onRollback(row);
                      onClose();
                    }}
                  >
                    Ripristina versione {row.version}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────
export function EmailTemplatesPanel() {
  const templatesQuery = useEmailTemplates();
  const upsert = useUpsertEmailTemplate();
  const del = useDeleteEmailTemplate();
  const preview = usePreviewEmailTemplate();
  const rollback = useRollbackEmailTemplate();
  const platformFieldsQuery = useQuery({
    queryKey: ["platform-email-custom-fields"],
    queryFn: async (): Promise<PlatformEmailCustomField[]> => {
      const { data, error } = await (supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              maybeSingle: () => Promise<{
                data: { value: string | null } | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      })
        .from("platform_settings")
        .select("value")
        .eq("key", PLATFORM_CUSTOM_FIELDS_KEY)
        .maybeSingle();

      if (error) throw new Error(error.message);
      return parsePlatformEmailCustomFields(data?.value ?? null);
    },
    retry: 1,
    staleTime: 30_000,
  });

  // Map (template_key + role_variant) → row DB
  const dbMap = useMemo(() => {
    const m = new Map<string, EmailTemplateRow>();
    for (const row of templatesQuery.data ?? []) {
      const key = `${row.template_key}::${row.role_variant ?? "__default__"}`;
      m.set(key, row);
    }
    return m;
  }, [templatesQuery.data]);

  /** Ritorna quante varianti esistono in DB per una template_key. */
  const variantCountByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of templatesQuery.data ?? []) {
      m.set(row.template_key, (m.get(row.template_key) ?? 0) + 1);
    }
    return m;
  }, [templatesQuery.data]);

  // Selection
  const [selectedKey, setSelectedKey] = useState<string>(EDITABLE_TEMPLATE_KEYS[0]);
  const [selectedVariant, setSelectedVariant] = useState<string>(DEFAULT_VARIANT);

  // Form state
  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [textBody, setTextBody] = useState("");
  const [notes, setNotes] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [designBlocks, setDesignBlocks] = useState<BuilderBlockType[]>([]);
  const [lastEditedMode, setLastEditedMode] = useState<"visual" | "html">("visual");
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTab>("visual");

  // History drawer
  const [historyOpen, setHistoryOpen] = useState(false);

  // Preview cache (HTML renderizzato)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewIsLocal, setPreviewIsLocal] = useState(false);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);

  const htmlBodyRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedMeta = TEMPLATE_META[selectedKey];
  const selectedRow = dbMap.get(`${selectedKey}::${selectedVariant}`);
  const platformCustomPlaceholders = useMemo(
    () => (platformFieldsQuery.data ?? []).map(placeholderFromPlatformField),
    [platformFieldsQuery.data],
  );
  const availablePlaceholders = useMemo(
    () => getAvailablePlaceholders(selectedMeta, platformCustomPlaceholders),
    [selectedMeta, platformCustomPlaceholders],
  );

  // ── Sync form quando cambia selezione o dati DB ──
  useEffect(() => {
    if (selectedRow) {
      setSubject(selectedRow.subject);
      setHtmlBody(selectedRow.html_body);
      setTextBody(selectedRow.text_body ?? "");
      setNotes(selectedRow.notes ?? "");
      setEnabled(selectedRow.enabled);
      setDesignBlocks(designToBlocks(selectedRow.design_json, selectedRow.html_body, selectedKey));
      setLastEditedMode(selectedRow.design_json ? "visual" : "html");
    } else {
      setSubject(selectedMeta?.label ?? "");
      const blocks = defaultVisualBlocksFor(selectedKey);
      setDesignBlocks(blocks);
      setHtmlBody(generateEmailBodyHtml(blocks));
      setTextBody("");
      setNotes("");
      setEnabled(true);
      setLastEditedMode("visual");
    }
    setDirty(false);
    setPreviewHtml(null);
    setPreviewIsLocal(false);
    setPreviewWarning(null);
  }, [selectedKey, selectedVariant, selectedRow, selectedMeta]);

  // ── Live preview con debounce 500 ms ──
  const debouncedSubject = useDebounced(subject, 500);
  const debouncedHtml = useDebounced(htmlBody, 500);
  const debouncedText = useDebounced(textBody, 500);

  useEffect(() => {
    if (activeEditorTab !== "split" && activeEditorTab !== "preview") return;
    if (!debouncedSubject.trim() || !debouncedHtml.trim()) {
      setPreviewHtml(null);
      setPreviewIsLocal(false);
      setPreviewWarning(null);
      return;
    }
    const mockProps = getPreviewMockProps(selectedMeta);
    const localPreview = buildLocalPreviewHtml(debouncedSubject, debouncedHtml, mockProps);

    // Evita race: salva il "current request id" in closure
    let cancelled = false;
    preview.mutate(
      {
        subject: debouncedSubject,
        htmlBody: debouncedHtml,
        textBody: debouncedText.trim() ? debouncedText : null,
        mockProps,
        roleVariant: variantToDb(selectedVariant),
      },
      {
        onSuccess: (data) => {
          if (!cancelled) {
            setPreviewHtml(data.html);
            setPreviewIsLocal(false);
            setPreviewWarning(null);
          }
        },
        onError: (error) => {
          if (!cancelled) {
            setPreviewHtml(localPreview);
            setPreviewIsLocal(true);
            setPreviewWarning(
              error instanceof Error
                ? error.message
                : "Preview completa non disponibile",
            );
          }
        },
      },
    );
    return () => {
      cancelled = true;
    };
    // preview è stabile (hook result) — non serve in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditorTab, debouncedSubject, debouncedHtml, debouncedText, selectedKey, selectedVariant, selectedMeta]);

  // ── Azioni form ──
  const markDirty = useCallback(() => setDirty(true), []);

  const insertIntoHtml = useCallback(
    (snippet: string) => {
      const el = htmlBodyRef.current;
      if (!el) {
        setHtmlBody((prev) => `${prev}${snippet.replace("$SEL$", "")}`);
        setLastEditedMode("html");
        markDirty();
        return;
      }
      const { next, caret } = insertAtCursor(el, snippet);
      setHtmlBody(next);
      setLastEditedMode("html");
      markDirty();
      // ripristina focus + cursore dopo il re-render
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [markDirty],
  );

  const handleInsertPlaceholder = (key: string) => {
    insertIntoHtml(`{{${key}}}`);
  };

  const handleFormatBold = () => insertIntoHtml(`<strong>$SEL$</strong>`);
  const handleFormatLink = () =>
    insertIntoHtml(`<a href="https://" style="color:#F97316;">$SEL$</a>`);
  const handleFormatList = () =>
    insertIntoHtml(
      `<ul style="margin:0 0 16px 0;padding-left:20px;">\n  <li>$SEL$</li>\n  <li></li>\n</ul>`,
    );

  const handleSave = () => {
    if (!selectedKey || !subject.trim() || !htmlBody.trim()) return;
    upsert.mutate(
      {
        template_key: selectedKey,
        role_variant: variantToDb(selectedVariant),
        subject,
        html_body: htmlBody,
        text_body: textBody.trim() ? textBody : null,
        design_json: lastEditedMode === "visual" ? blocksToDesign(designBlocks) : null,
        enabled,
        notes: notes.trim() ? notes : null,
      },
      { onSuccess: () => setDirty(false) },
    );
  };

  const handleResetToDefault = () => {
    if (!selectedRow) return;
    del.mutate(selectedRow.id);
  };

  const handleRollback = (row: EmailTemplateHistoryRow) => {
    rollback.mutate(row.id);
  };

  /** Guard quando si cambia template con modifiche non salvate. */
  const handleSelectKey = (key: string) => {
    if (dirty) {
      const ok = window.confirm(
        "Ci sono modifiche non salvate. Cambiare template le perderà. Continuare?",
      );
      if (!ok) return;
    }
    setSelectedKey(key);
  };

  const handleSelectVariant = (variant: string) => {
    if (dirty) {
      const ok = window.confirm(
        "Ci sono modifiche non salvate. Cambiare variante le perderà. Continuare?",
      );
      if (!ok) return;
    }
    setSelectedVariant(variant);
  };

  // ── Render ──
  if (templatesQuery.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <Skeleton className="h-[500px]" />
        <Skeleton className="h-[500px]" />
      </div>
    );
  }

  if (templatesQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Errore nel caricamento dei template: {(templatesQuery.error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Personalizza oggetto e corpo delle email transazionali. Le modifiche
          sono salvate per variante di ruolo: se una variante specifica non
          esiste, viene usato il <em>Default</em>. Il layout esterno (header,
          logo, footer) è gestito automaticamente e identico per tutti.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        {/* ── Sidebar lista ── */}
        <Card className="h-fit md:sticky md:top-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Template disponibili
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {EDITABLE_TEMPLATE_KEYS.map((key) => {
                const meta = TEMPLATE_META[key];
                if (!meta) return null;
                const isSelected = key === selectedKey;
                const variantCount = variantCountByKey.get(key) ?? 0;
                const hasAnyOverride = variantCount > 0;
                const defaultRow = dbMap.get(`${key}::${DEFAULT_VARIANT}`);

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleSelectKey(key)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      isSelected
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/50 border border-transparent"
                    }`}
                    aria-pressed={isSelected}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{meta.label}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {CATEGORY_LABELS[meta.category] ?? meta.category}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {hasAnyOverride && (
                          <Badge
                            variant={
                              defaultRow && !defaultRow.enabled
                                ? "secondary"
                                : "default"
                            }
                            className="text-xs h-5 gap-1"
                          >
                            <Sparkles className="h-3 w-3" />
                            {variantCount > 1 ? `${variantCount} var.` : "Custom"}
                          </Badge>
                        )}
                        {!hasAnyOverride && (
                          <span className="text-xs text-muted-foreground">Default</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Editor principale ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base">
                  {selectedMeta?.label ?? selectedKey}
                </CardTitle>
                <CardDescription className="mt-1">
                  {selectedMeta?.description}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {selectedRow && (
                  <Badge variant="outline" className="text-xs">
                    v{selectedRow.version}
                  </Badge>
                )}

                {/* Bottone cronologia */}
                <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!selectedRow}
                      title={
                        selectedRow
                          ? "Mostra cronologia revisioni"
                          : "Disponibile dopo il primo salvataggio"
                      }
                    >
                      <History className="h-4 w-4 mr-1" />
                      Cronologia
                    </Button>
                  </SheetTrigger>
                  <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Cronologia revisioni
                      </SheetTitle>
                      <SheetDescription>
                        Ultime 50 modifiche al template{" "}
                        <strong>{selectedMeta?.label}</strong>{" "}
                        ({ROLE_VARIANTS.find((r) => r.value === selectedVariant)?.label}).
                        Puoi ripristinare qualsiasi versione in un click.
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mt-4">
                      <HistoryList
                        templateId={selectedRow?.id ?? null}
                        onRollback={handleRollback}
                        onClose={() => setHistoryOpen(false)}
                      />
                    </div>
                  </SheetContent>
                </Sheet>

                <div className="flex items-center gap-2">
                  <Switch
                    id={`enabled-${selectedKey}-${selectedVariant}`}
                    checked={enabled}
                    onCheckedChange={(v) => {
                      setEnabled(v);
                      markDirty();
                    }}
                    aria-label="Personalizzazione attiva"
                  />
                  <Label
                    htmlFor={`enabled-${selectedKey}-${selectedVariant}`}
                    className="text-xs cursor-pointer"
                  >
                    {enabled ? "Attivo" : "Disattivato"}
                  </Label>
                </div>
              </div>
            </div>

            {/* Variant selector */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <UserCog className="h-4 w-4 text-muted-foreground" />
              <Label className="text-xs text-muted-foreground mr-1">
                Variante ruolo:
              </Label>
              <Select value={selectedVariant} onValueChange={handleSelectVariant}>
                <SelectTrigger className="w-[260px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_VARIANTS.map((r) => {
                    const hasRow = dbMap.has(`${selectedKey}::${r.value}`);
                    return (
                      <SelectItem key={r.value} value={r.value}>
                        <div className="flex items-center gap-2">
                          {hasRow && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0"
                              aria-label="Variante salvata"
                            />
                          )}
                          <div>
                            <p className="text-sm">{r.label}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {r.hint}
                            </p>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            <Tabs value={activeEditorTab} onValueChange={(value) => setActiveEditorTab(value as EditorTab)} className="space-y-4">
              <TabsList>
                <TabsTrigger value="visual" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Design visuale
                </TabsTrigger>
                <TabsTrigger value="split" className="gap-2">
                  <Eye className="h-4 w-4" />
                  HTML + Anteprima
                </TabsTrigger>
                <TabsTrigger value="content" className="gap-2">
                  <Code2 className="h-4 w-4" />
                  HTML avanzato
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Solo anteprima
                </TabsTrigger>
              </TabsList>

              <TabsContent value="visual" className="space-y-4">
                <VisualTemplateBuilder
                  templateKey={selectedKey}
                  subject={subject}
                  setSubject={(v) => {
                    setSubject(v);
                    markDirty();
                  }}
                  blocks={designBlocks}
                  setBlocks={(blocks) => {
                    setDesignBlocks(blocks);
                    setHtmlBody(generateEmailBodyHtml(blocks));
                    setLastEditedMode("visual");
                    markDirty();
                  }}
                  placeholders={availablePlaceholders}
                  canSave={
                    !!subject.trim() &&
                    !!htmlBody.trim() &&
                    dirty &&
                    !upsert.isPending
                  }
                  saving={upsert.isPending}
                  dirty={dirty}
                  onSave={handleSave}
                />
                <ActionBar
                  canSave={
                    !!subject.trim() &&
                    !!htmlBody.trim() &&
                    dirty &&
                    !upsert.isPending
                  }
                  saving={upsert.isPending}
                  dirty={dirty}
                  hasSavedRow={!!selectedRow}
                  deleting={del.isPending}
                  onSave={handleSave}
                  onReset={handleResetToDefault}
                />
              </TabsContent>

              {/* ── TAB SPLIT: editor sx + preview dx, live ── */}
              <TabsContent value="split" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <EditorForm
                    subject={subject}
                    setSubject={(v) => {
                      setSubject(v);
                      markDirty();
                    }}
                    htmlBody={htmlBody}
                    setHtmlBody={(v) => {
                      setHtmlBody(v);
                      setLastEditedMode("html");
                      markDirty();
                    }}
                    textBody={textBody}
                    setTextBody={(v) => {
                      setTextBody(v);
                      markDirty();
                    }}
                    notes={notes}
                    setNotes={(v) => {
                      setNotes(v);
                      markDirty();
                    }}
                    placeholders={availablePlaceholders}
                    onInsertPlaceholder={handleInsertPlaceholder}
                    onFormatBold={handleFormatBold}
                    onFormatLink={handleFormatLink}
                    onFormatList={handleFormatList}
                    htmlRef={htmlBodyRef}
                    compact
                  />
                  <LivePreview
                    html={previewHtml}
                    isLoading={preview.isPending}
                    warning={previewWarning}
                    isLocal={previewIsLocal}
                  />
                </div>
                <ActionBar
                  canSave={
                    !!subject.trim() &&
                    !!htmlBody.trim() &&
                    dirty &&
                    !upsert.isPending
                  }
                  saving={upsert.isPending}
                  dirty={dirty}
                  hasSavedRow={!!selectedRow}
                  deleting={del.isPending}
                  onSave={handleSave}
                  onReset={handleResetToDefault}
                />
              </TabsContent>

              {/* ── TAB CONTENT: solo editor a piena larghezza ── */}
              <TabsContent value="content" className="space-y-4">
                <EditorForm
                  subject={subject}
                  setSubject={(v) => {
                    setSubject(v);
                    markDirty();
                  }}
                  htmlBody={htmlBody}
                  setHtmlBody={(v) => {
                    setHtmlBody(v);
                    setLastEditedMode("html");
                    markDirty();
                  }}
                  textBody={textBody}
                  setTextBody={(v) => {
                    setTextBody(v);
                    markDirty();
                  }}
                  notes={notes}
                  setNotes={(v) => {
                    setNotes(v);
                    markDirty();
                  }}
                  placeholders={availablePlaceholders}
                  onInsertPlaceholder={handleInsertPlaceholder}
                  onFormatBold={handleFormatBold}
                  onFormatLink={handleFormatLink}
                  onFormatList={handleFormatList}
                  htmlRef={htmlBodyRef}
                />
                <ActionBar
                  canSave={
                    !!subject.trim() &&
                    !!htmlBody.trim() &&
                    dirty &&
                    !upsert.isPending
                  }
                  saving={upsert.isPending}
                  dirty={dirty}
                  hasSavedRow={!!selectedRow}
                  deleting={del.isPending}
                  onSave={handleSave}
                  onReset={handleResetToDefault}
                />
              </TabsContent>

              {/* ── TAB PREVIEW: solo anteprima a piena larghezza ── */}
              <TabsContent value="preview" className="space-y-3">
                <LivePreview
                  html={previewHtml}
                  isLoading={preview.isPending}
                  warning={previewWarning}
                  isLocal={previewIsLocal}
                  tall
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VisualTemplateBuilder({
  templateKey,
  subject,
  setSubject,
  blocks,
  setBlocks,
  placeholders,
  canSave,
  saving,
  dirty,
  onSave,
}: {
  templateKey: string;
  subject: string;
  setSubject: (value: string) => void;
  blocks: BuilderBlockType[];
  setBlocks: (blocks: BuilderBlockType[]) => void;
  placeholders: PlaceholderDef[];
  canSave: boolean;
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
}) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedChildBlock, setSelectedChildBlock] = useState<BuilderBlockType | null>(null);
  const [previewMode, setPreviewMode] = useState<keyof typeof PREVIEW_WIDTHS>("desktop");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<BuilderBlockType[][]>([]);
  const [redoStack, setRedoStack] = useState<BuilderBlockType[][]>([]);
  const isUndoRedoAction = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const previewHtml = useMemo(
    () => buildLocalPreviewHtml(
      subject,
      generateEmailBodyHtml(blocks),
      getPreviewMockProps(TEMPLATE_META[templateKey]),
    ),
    [blocks, subject, templateKey],
  );

  const updateBlocks = useCallback(
    (next: BuilderBlockType[]) => {
      if (!isUndoRedoAction.current) {
        setUndoStack((prev) => [...prev.slice(-24), blocks]);
        setRedoStack([]);
      }
      isUndoRedoAction.current = false;
      setBlocks(next);
    },
    [blocks, setBlocks],
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, blocks]);
    isUndoRedoAction.current = true;
    setBlocks(previous);
  }, [blocks, setBlocks, undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, blocks]);
    isUndoRedoAction.current = true;
    setBlocks(next);
  }, [blocks, redoStack, setBlocks]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        active?.isContentEditable;
      const isMod = event.metaKey || event.ctrlKey;

      if (isMod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canSave) onSave();
        return;
      }

      if (!isMod || isEditable) return;

      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      } else if (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canSave, handleRedo, handleUndo, onSave]);

  const handleAddChildBlock = useCallback(
    (parentId: string, colIndex: number, childType: BlockType) => {
      const next = blocks.map((block) => {
        if (block.id !== parentId) return block;
        const children = block.children ? block.children.map((col) => [...col]) : [];
        if (children[colIndex]) children[colIndex].push(createBlock(childType));
        return { ...block, children };
      });
      updateBlocks(next);
    },
    [blocks, updateBlocks],
  );

  const handleDeleteChildBlock = useCallback(
    (parentId: string, colIndex: number, childId: string) => {
      const next = blocks.map((block) => {
        if (block.id !== parentId) return block;
        const children = block.children
          ? block.children.map((col, index) => (index === colIndex ? col.filter((child) => child.id !== childId) : [...col]))
          : [];
        return { ...block, children };
      });
      updateBlocks(next);
      if (selectedChildBlock?.id === childId) setSelectedChildBlock(null);
    },
    [blocks, selectedChildBlock, updateBlocks],
  );

  const handleSelectBlock = useCallback((id: string | null) => {
    setSelectedBlockId(id);
    setSelectedChildBlock(null);
  }, []);

  const handleSelectChildBlock = useCallback((child: BuilderBlockType) => {
    setSelectedBlockId(null);
    setSelectedChildBlock(child);
  }, []);

  const handleUpdateChildBlockProps = useCallback(
    (blockId: string, partial: Record<string, unknown>) => {
      const next = blocks.map((block) => {
        if (!block.children) return block;
        return {
          ...block,
          children: block.children.map((col) =>
            col.map((child) =>
              child.id === blockId ? { ...child, props: { ...child.props, ...partial } } : child,
            ),
          ),
        };
      });
      updateBlocks(next);
      setSelectedChildBlock((prev) =>
        prev && prev.id === blockId ? { ...prev, props: { ...prev.props, ...partial } } : prev,
      );
    },
    [blocks, updateBlocks],
  );

  const handleInlineEdit = useCallback(
    (blockId: string, partial: Record<string, unknown>) => {
      const isRoot = blocks.some((block) => block.id === blockId);
      if (isRoot) {
        updateBlocks(
          blocks.map((block) =>
            block.id === blockId ? { ...block, props: { ...block.props, ...partial } } : block,
          ),
        );
        return;
      }
      handleUpdateChildBlockProps(blockId, partial);
    },
    [blocks, handleUpdateChildBlockProps, updateBlocks],
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data?.current;
    if (activeData?.type) {
      const blockType = activeData.type as BlockType;
      const newBlock = createBlock(blockType);
      if (blockType === "columns" && activeData.layout) {
        (newBlock.props as { layout: ColumnLayout }).layout = activeData.layout as ColumnLayout;
        const colCount = activeData.layout === "1" ? 1 : String(activeData.layout).split("-").length;
        newBlock.children = Array.from({ length: colCount }, (): BuilderBlockType[] => []);
      }
      const overIndex = blocks.findIndex((block) => block.id === over.id);
      const next = [...blocks];
      if (overIndex >= 0) next.splice(overIndex, 0, newBlock);
      else next.push(newBlock);
      updateBlocks(next);
      handleSelectBlock(newBlock.id);
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) updateBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const handleDuplicateBlock = (blockId: string) => {
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return;
    const original = blocks[index];
    const duplicate: BuilderBlockType = {
      ...original,
      id: makeBlockId("block"),
      props: { ...original.props },
      children: original.children?.map((col) =>
        col.map((child) => ({ ...child, id: makeBlockId("block"), props: { ...child.props } })),
      ),
    };
    const next = [...blocks];
    next.splice(index + 1, 0, duplicate);
    updateBlocks(next);
    handleSelectBlock(duplicate.id);
  };

  const handleDeleteBlock = (blockId: string) => {
    updateBlocks(blocks.filter((block) => block.id !== blockId));
    if (selectedBlockId === blockId) handleSelectBlock(null);
  };

  const handleMoveBlock = (blockId: string, direction: "up" | "down") => {
    const index = blocks.findIndex((block) => block.id === blockId);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return;
    updateBlocks(arrayMove(blocks, index, nextIndex));
  };

  const handleUpdateBlockProps = (blockId: string, partial: Record<string, unknown>) => {
    const next = blocks.map((block) => {
      if (block.id !== blockId) return block;
      const updated: BuilderBlockType = { ...block, props: { ...block.props, ...partial } };
      if (block.type === "columns" && partial.layout && partial.layout !== (block.props as { layout?: string }).layout) {
        const newColCount = partial.layout === "1" ? 1 : String(partial.layout).split("-").length;
        const oldChildren = block.children ?? [];
        const newChildren: BuilderBlockType[][] = [];
        for (let i = 0; i < newColCount; i += 1) newChildren.push(oldChildren[i] ? [...oldChildren[i]] : []);
        for (let i = newColCount; i < oldChildren.length; i += 1) {
          if (oldChildren[i]?.length) newChildren[newColCount - 1].push(...oldChildren[i]);
        }
        updated.children = newChildren;
      }
      return updated;
    });
    updateBlocks(next);
  };

  const handleInsertVariableBlock = useCallback(
    (tag: string) => {
      const block = createBlock("text");
      block.props = {
        ...block.props,
        content: tag,
        fontSize: "16px",
        color: "#334155",
        textAlign: "left",
        fontFamily: "Arial",
        fontWeight: "normal",
      } as BuilderBlockType["props"];
      updateBlocks([...blocks, block]);
      handleSelectBlock(block.id);
    },
    [blocks, handleSelectBlock, updateBlocks],
  );

  const handleApplySuggestedLayout = useCallback(() => {
    const next = defaultVisualBlocksFor(templateKey);
    updateBlocks(next);
    handleSelectBlock(next[1]?.id ?? next[0]?.id ?? null);
  }, [handleSelectBlock, templateKey, updateBlocks]);

  const handleAddQuickSection = useCallback(
    (kind: "greeting" | "cta" | "signature") => {
      const block = kind === "cta" ? createBlock("button") : createBlock("text");
      if (kind === "greeting") {
        block.props = {
          ...block.props,
          content: "Ciao {{user.first_name}},\n\n",
          fontSize: "16px",
          color: "#334155",
          textAlign: "left",
          fontFamily: "Arial",
          fontWeight: "normal",
        } as BuilderBlockType["props"];
      }
      if (kind === "cta") {
        block.props = {
          ...block.props,
          text: "Apri piattaforma",
          url: "{{user.login_url}}",
          backgroundColor: "#1d4ed8",
          textColor: "#ffffff",
          borderRadius: "6px",
          align: "left",
        } as BuilderBlockType["props"];
      }
      if (kind === "signature") {
        block.props = {
          ...block.props,
          content: "A presto,\nIl team di {{company.name}}",
          fontSize: "15px",
          color: "#475569",
          textAlign: "left",
          fontFamily: "Arial",
          fontWeight: "normal",
        } as BuilderBlockType["props"];
      }
      updateBlocks([...blocks, block]);
      handleSelectBlock(block.id);
    },
    [blocks, handleSelectBlock, updateBlocks],
  );

  const resolvedSelectedBlock = selectedChildBlock
    ? (() => {
        for (const block of blocks) {
          if (!block.children) continue;
          for (const col of block.children) {
            const found = col.find((child) => child.id === selectedChildBlock.id);
            if (found) return found;
          }
        }
        return selectedChildBlock;
      })()
    : blocks.find((block) => block.id === selectedBlockId) ?? null;

  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="visual-subject">Oggetto *</Label>
            <SubjectVariableButton
              placeholders={placeholders}
              onInsert={(tag) => setSubject(subject ? `${subject} ${tag}` : tag)}
            />
          </div>
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
            <Input
              id="visual-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="es. Ciao {{contact.first_name}}, benvenuto"
              className="max-w-2xl"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {dirty ? (
                <span>Modifiche non salvate</span>
              ) : (
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  Builder sincronizzato
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={handleApplySuggestedLayout}>
            <Sparkles className="mr-2 h-4 w-4" />
            Layout consigliato
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={undoStack.length === 0} onClick={handleUndo} title="Annulla">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={redoStack.length === 0} onClick={handleRedo} title="Ripristina">
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="flex items-center rounded-md border">
            {([
              { mode: "desktop" as const, icon: Monitor, label: "Desktop" },
              { mode: "tablet" as const, icon: Tablet, label: "Tablet" },
              { mode: "mobile" as const, icon: Smartphone, label: "Mobile" },
            ]).map(({ mode, icon: Icon, label }) => (
              <Button
                key={mode}
                variant={previewMode === mode ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-none first:rounded-l-md last:rounded-r-md"
                onClick={() => setPreviewMode(mode)}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="h-8" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-2 h-4 w-4" />
            Anteprima
          </Button>
          <Button size="sm" className="h-8" onClick={onSave} disabled={!canSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salva
          </Button>
        </div>
      </div>

      <div className="flex h-[780px] overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <BuilderSidebar />
          <BuilderCanvas
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            onSelectBlock={handleSelectBlock}
            onDuplicateBlock={handleDuplicateBlock}
            onDeleteBlock={handleDeleteBlock}
            onMoveBlock={handleMoveBlock}
            previewWidth={PREVIEW_WIDTHS[previewMode]}
            onAddChildBlock={handleAddChildBlock}
            onDeleteChildBlock={handleDeleteChildBlock}
            onSelectChildBlock={handleSelectChildBlock}
            selectedChildBlockId={selectedChildBlock?.id ?? null}
            onInlineEdit={handleInlineEdit}
          />
          <DragOverlay>
            {activeDragId ? (
              <div className="rounded-md border-2 border-dashed border-primary bg-primary/10 px-4 py-2 text-xs font-medium text-primary">
                Rilascia sul canvas
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <BuilderPropertiesPanel
          block={resolvedSelectedBlock}
          onUpdate={selectedChildBlock ? handleUpdateChildBlockProps : handleUpdateBlockProps}
          placeholders={placeholders}
          onInsertVariable={handleInsertVariableBlock}
          onAddQuickSection={handleAddQuickSection}
        />
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Anteprima template</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Preview completa del template con dati esempio utente, azienda e documento.
            </p>
            <div className="flex items-center rounded-md border">
              {([
                { mode: "desktop" as const, icon: Monitor, label: "Desktop" },
                { mode: "tablet" as const, icon: Tablet, label: "Tablet" },
                { mode: "mobile" as const, icon: Smartphone, label: "Mobile" },
              ]).map(({ mode, icon: Icon, label }) => (
                <Button
                  key={`dialog-${mode}`}
                  variant={previewMode === mode ? "default" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded-none first:rounded-l-md last:rounded-r-md"
                  onClick={() => setPreviewMode(mode)}
                  title={label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              ))}
            </div>
          </div>
          <div className="flex justify-center rounded-md border bg-muted/20 p-4">
            <iframe
              srcDoc={previewHtml}
              title="Anteprima template email"
              className="h-[72vh] max-w-full rounded-md border bg-white"
              style={{ width: PREVIEW_WIDTHS[previewMode] }}
              sandbox=""
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Editor form (estratto) ──────────────────────────────────────────────────
function EditorForm({
  subject,
  setSubject,
  htmlBody,
  setHtmlBody,
  textBody,
  setTextBody,
  notes,
  setNotes,
  placeholders,
  onInsertPlaceholder,
  onFormatBold,
  onFormatLink,
  onFormatList,
  htmlRef,
  compact,
}: {
  subject: string;
  setSubject: (v: string) => void;
  htmlBody: string;
  setHtmlBody: (v: string) => void;
  textBody: string;
  setTextBody: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  placeholders: PlaceholderDef[];
  onInsertPlaceholder: (key: string) => void;
  onFormatBold: () => void;
  onFormatLink: () => void;
  onFormatList: () => void;
  htmlRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-4" : "grid gap-4 lg:grid-cols-[1fr_240px]"}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label htmlFor="subject">Oggetto *</Label>
            <SubjectVariableButton
              placeholders={placeholders}
              onInsert={(tag) => setSubject(subject ? `${subject} ${tag}` : tag)}
            />
          </div>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="es. Benvenuto in {{companyName}}"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Label htmlFor="htmlBody">Corpo HTML *</Label>
            {/* Toolbar formatting */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={onFormatBold}
                title="Grassetto"
                aria-label="Grassetto"
              >
                <Bold className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={onFormatLink}
                title="Link"
                aria-label="Inserisci link"
              >
                <LinkIcon className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={onFormatList}
                title="Elenco puntato"
                aria-label="Elenco puntato"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Textarea
            id="htmlBody"
            ref={htmlRef}
            value={htmlBody}
            onChange={(e) => setHtmlBody(e.target.value)}
            rows={compact ? 12 : 14}
            className="font-mono text-sm"
            placeholder="<h1>Titolo</h1>..."
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Solo il <strong>contenuto centrale</strong>. Header/logo/footer sono
            aggiunti dal layout.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="textBody">Testo plain (opzionale)</Label>
          <Textarea
            id="textBody"
            value={textBody}
            onChange={(e) => setTextBody(e.target.value)}
            rows={4}
            placeholder="Fallback testo per client che non supportano HTML. Se vuoto è generato automaticamente."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Note interne (opzionale)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Es. testato su Gmail + Outlook 365 il 12/04"
          />
        </div>

        {/* Placeholder chips inline in modo compact */}
        {compact && placeholders.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Placeholder disponibili
            </p>
            <PlaceholderChips
              placeholders={placeholders}
              onInsert={onInsertPlaceholder}
            />
          </div>
        )}
      </div>

      {!compact && (
        <div className="lg:border-l lg:pl-4">
          <p className="text-sm font-medium mb-2">Placeholder disponibili</p>
          <p className="text-xs text-muted-foreground mb-3">
            Click per aggiungere al corpo. L'asterisco indica campi obbligatori.
          </p>
          {placeholders.length > 0 && (
            <PlaceholderChips
              placeholders={placeholders}
              onInsert={onInsertPlaceholder}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Live preview pane ───────────────────────────────────────────────────────
function LivePreview({
  html,
  isLoading,
  warning,
  isLocal,
  tall,
}: {
  html: string | null;
  isLoading: boolean;
  warning?: string | null;
  isLocal?: boolean;
  tall?: boolean;
}) {
  const frameHeight = tall ? "h-[760px]" : "h-[600px]";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-2">
          Anteprima
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : html ? (
            <CheckCircle2 className="h-3 w-3 text-green-600" />
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {isLocal ? "Dati esempio · fallback locale" : "Dati di esempio"}
        </p>
      </div>

      {warning && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Preview server non disponibile: sto mostrando una preview locale.
          </AlertDescription>
        </Alert>
      )}

      {html ? (
        <div className={`rounded-md border overflow-hidden bg-white ${frameHeight}`}>
          <iframe
            srcDoc={html}
            title="Anteprima email"
            className="w-full h-full border-0"
            sandbox=""
          />
        </div>
      ) : (
        <div
          className={`rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground ${frameHeight} flex items-center justify-center`}
        >
          Scrivi oggetto e corpo per vedere l'anteprima.
        </div>
      )}
    </div>
  );
}

// ── Action bar ──────────────────────────────────────────────────────────────
function ActionBar({
  canSave,
  saving,
  dirty,
  hasSavedRow,
  deleting,
  onSave,
  onReset,
}: {
  canSave: boolean;
  saving: boolean;
  dirty: boolean;
  hasSavedRow: boolean;
  deleting: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
      <Button onClick={onSave} disabled={!canSave}>
        {saving ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Save className="h-4 w-4 mr-2" />
        )}
        Salva personalizzazione
      </Button>

      {hasSavedRow && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={deleting}>
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Ripristina default
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Ripristinare il default?</AlertDialogTitle>
              <AlertDialogDescription>
                La personalizzazione corrente verrà rimossa e il template tornerà
                al contenuto hardcoded di default. La cronologia salverà
                comunque una copia dello stato attuale.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={onReset}>Ripristina</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {dirty && (
        <span className="text-xs text-muted-foreground ml-auto">
          Modifiche non salvate
        </span>
      )}
      {!dirty && hasSavedRow && (
        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-green-600" />
          Salvato
        </span>
      )}
    </div>
  );
}
