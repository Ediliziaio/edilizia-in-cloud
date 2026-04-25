import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, Copy, Lock, Plus, Search, Trash2, UserRound, Variable, X,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BUILTIN_FIELDS,
  FIELD_TYPES,
  FOLDER_COLORS,
  FOLDER_LABELS,
  GROUP_OPTIONS,
  OBJECT_NAME_MAP,
  type UnifiedField,
  toSnakeCase,
} from "@/components/settings/CustomFieldsConfig";
import { formatError } from "@/lib/errors";
import { cn } from "@/lib/utils";

interface PlatformField {
  id: string;
  name: string;
  fieldType: string;
  namespace: string;
  folder: string;
  createdAt: string;
}

const SETTINGS_KEY = "platform_email_custom_fields";
const QUERY_KEY = ["platform-email-custom-fields"] as const;

const ADMIN_OBJECTS = [
  { value: "user", label: "Utente destinatario" },
  { value: "recipient", label: "Destinatario email" },
  { value: "platform", label: "Piattaforma" },
  { value: "admin", label: "Superadmin" },
  { value: "billing", label: "Billing" },
  { value: "support", label: "Supporto" },
  { value: "sales", label: "Vendite" },
];

const CUSTOM_ADMIN_OBJECTS = ADMIN_OBJECTS.filter(
  (item) => item.value !== "user" && item.value !== "recipient",
);

// Tono dei badge per folder — centralizzato in una mappa per DRY
const FOLDER_TONES: Record<string, string> = {
  user:      "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  recipient: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  platform:  "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
  admin:     "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  billing:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  support:   "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
};

function folderBadgeClass(folder: string): string {
  return FOLDER_COLORS[folder] ?? FOLDER_TONES[folder] ?? "bg-muted text-muted-foreground";
}

// Helper preset factory — DRY rispetto al precedente duplicato
function makeAccessUserField(id: string, name: string, varKey: string): UnifiedField {
  return {
    id,
    name,
    object: "Utente destinatario",
    folder: "user",
    folderColor: FOLDER_TONES.user,
    uniqueKey: `{{ ${varKey} }}`,
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  };
}

function makeRecipientField(id: string, name: string, varKey: string): UnifiedField {
  return {
    id,
    name,
    object: "Destinatario email",
    folder: "recipient",
    folderColor: FOLDER_TONES.recipient,
    uniqueKey: `{{ ${varKey} }}`,
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  };
}

const ACCESS_USER_FIELD_PRESETS: UnifiedField[] = [
  makeAccessUserField("sys_access_user_first_name",  "Nome utente",          "user.first_name"),
  makeAccessUserField("sys_access_user_last_name",   "Cognome utente",       "user.last_name"),
  makeAccessUserField("sys_access_user_full_name",   "Nome completo utente", "user.full_name"),
  makeAccessUserField("sys_access_user_email",       "Email utente",         "user.email"),
  makeAccessUserField("sys_access_user_role",        "Ruolo utente",         "user.role_label"),
  makeAccessUserField("sys_access_user_login_url",   "Link accesso utente",  "user.login_url"),
  makeRecipientField("sys_recipient_first_name",     "Nome destinatario",    "recipient.first_name"),
  makeRecipientField("sys_recipient_email",          "Email destinatario",   "recipient.email"),
];

const ADMIN_FIELD_PRESETS: UnifiedField[] = [
  {
    id: "sys_platform_name", name: "Nome piattaforma", object: "Piattaforma",
    folder: "platform", folderColor: FOLDER_TONES.platform,
    uniqueKey: "{{ platform.name }}", createdAt: "2024-01-01", isSystem: true, fieldType: "text",
  },
  {
    id: "sys_platform_support_email", name: "Email supporto piattaforma", object: "Piattaforma",
    folder: "platform", folderColor: FOLDER_TONES.platform,
    uniqueKey: "{{ platform.support_email }}", createdAt: "2024-01-01", isSystem: true, fieldType: "text",
  },
  {
    id: "sys_admin_first_name", name: "Nome superadmin", object: "Superadmin",
    folder: "admin", folderColor: FOLDER_TONES.admin,
    uniqueKey: "{{ admin.first_name }}", createdAt: "2024-01-01", isSystem: true, fieldType: "text",
  },
  {
    id: "sys_billing_mrr", name: "MRR azienda", object: "Billing",
    folder: "billing", folderColor: FOLDER_TONES.billing,
    uniqueKey: "{{ billing.mrr }}", createdAt: "2024-01-01", isSystem: true, fieldType: "number",
  },
  {
    id: "sys_trial_end_date", name: "Scadenza prova", object: "Billing",
    folder: "billing", folderColor: FOLDER_TONES.billing,
    uniqueKey: "{{ billing.trial_end_date }}", createdAt: "2024-01-01", isSystem: true, fieldType: "date",
  },
];

function parseFields(value: string | null): PlatformField[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((field): field is PlatformField => {
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

function fieldObjectLabel(value: string): string {
  return ADMIN_OBJECTS.find((item) => item.value === value)?.label ?? OBJECT_NAME_MAP[value] ?? value;
}

// Chiavi snake_case riservate dal sistema — non usabili per campi custom
const RESERVED_KEYS = new Set(["id", "type", "created_at", "updated_at"]);

// Type cast helper centralizzato — evita la ripetizione del pattern fragile
type SettingsRow = { value: string | null };
type SupabaseUntyped = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: SettingsRow | null;
          error: { message: string } | null;
        }>;
      };
    };
    upsert: (
      rows: Array<{ key: string; value: string }>,
      opts: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
};
const sb = supabase as unknown as SupabaseUntyped;

export function PlatformCustomFieldsPanel() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("all");
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [namespace, setNamespace] = useState("platform");
  const [deleteTarget, setDeleteTarget] = useState<UnifiedField | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fieldsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<PlatformField[]> => {
      const { data, error } = await sb
        .from("platform_settings")
        .select("value")
        .eq("key", SETTINGS_KEY)
        .maybeSingle();
      if (error) throw new Error(error.message || "Errore caricamento campi");
      return parseFields(data?.value ?? null);
    },
    staleTime: 30_000,
  });

  const customFields = useMemo(() => fieldsQuery.data ?? [], [fieldsQuery.data]);

  const allFields = useMemo<UnifiedField[]>(() => {
    const adminCustom: UnifiedField[] = customFields.map((field) => ({
      id: field.id,
      name: field.name,
      object: fieldObjectLabel(field.namespace),
      folder: field.folder,
      folderColor: folderBadgeClass(field.folder),
      uniqueKey: `{{ ${field.namespace}.${toSnakeCase(field.name)} }}`,
      createdAt: field.createdAt,
      isSystem: false,
      fieldType: field.fieldType,
    }));
    return [...ACCESS_USER_FIELD_PRESETS, ...BUILTIN_FIELDS, ...ADMIN_FIELD_PRESETS, ...adminCustom];
  }, [customFields]);

  const filtered = useMemo(() => {
    let result = allFields;
    if (groupBy !== "all") {
      const target = OBJECT_NAME_MAP[groupBy] ?? fieldObjectLabel(groupBy);
      result = result.filter((field) => field.object === target || field.folder === groupBy);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((field) =>
        field.name.toLowerCase().includes(q) ||
        field.object.toLowerCase().includes(q) ||
        field.uniqueKey.toLowerCase().includes(q) ||
        (FOLDER_LABELS[field.folder] ?? field.folder).toLowerCase().includes(q),
      );
    }
    return result;
  }, [allFields, groupBy, search]);

  const saveFields = useMutation({
    mutationFn: async (nextFields: PlatformField[]) => {
      const { error } = await sb
        .from("platform_settings")
        .upsert([{ key: SETTINGS_KEY, value: JSON.stringify(nextFields) }], { onConflict: "key" });
      if (error) throw new Error(error.message || "Errore salvataggio");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (err) => toast.error(`Errore campi personalizzati: ${formatError(err)}`),
  });

  const computedKey = useMemo(() => toSnakeCase(name.trim() || ""), [name]);
  const validationError = useMemo(() => {
    const cleanName = name.trim();
    if (!cleanName) return null; // niente messaggio finché vuoto
    if (cleanName.length < 2) return "Minimo 2 caratteri";
    if (cleanName.length > 60) return "Massimo 60 caratteri";
    if (!computedKey) return "Nome non valido (almeno una lettera o un numero)";
    if (RESERVED_KEYS.has(computedKey)) return `"${computedKey}" è una chiave riservata di sistema`;
    const exists = customFields.some(
      (field) => field.namespace === namespace && toSnakeCase(field.name) === computedKey,
    );
    if (exists) return "Esiste già un campo con questa chiave nella stessa area";
    return null;
  }, [name, namespace, customFields, computedKey]);

  const addField = () => {
    const cleanName = name.trim();
    if (!cleanName || validationError) return;
    // ID uuid per evitare collisioni anche su inserimenti ravvicinati
    const uuid =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const next: PlatformField[] = [
      ...customFields,
      {
        id: `platform-field-${uuid}`,
        name: cleanName,
        fieldType,
        namespace,
        folder: namespace,
        createdAt: new Date().toISOString(),
      },
    ];
    saveFields.mutate(next, {
      onSuccess: () => {
        toast.success("Campo admin aggiunto", {
          description: `Variabile: {{ ${namespace}.${computedKey} }}`,
        });
        setDialogOpen(false);
        setName("");
        setFieldType("text");
        setNamespace("platform");
      },
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    saveFields.mutate(
      customFields.filter((field) => field.id !== deleteTarget.id),
      {
        onSuccess: () => {
          toast.success("Campo admin eliminato", {
            description: "I template che usano questa variabile mostreranno la chiave non risolta.",
          });
          setDeleteTarget(null);
        },
        onError: () => setDeleteTarget(null),
      },
    );
  };

  const copyKey = (key: string) => {
    const cleanKey = key.trim();
    navigator.clipboard.writeText(cleanKey).then(
      () => {
        setCopiedKey(cleanKey);
        toast.success("Variabile copiata");
        setTimeout(() => setCopiedKey((curr) => (curr === cleanKey ? null : curr)), 1500);
      },
      () => toast.error("Impossibile copiare negli appunti"),
    );
  };

  const handleClearFilters = () => {
    setSearch("");
    setGroupBy("all");
  };

  const hasActiveFilters = search.trim() !== "" || groupBy !== "all";
  const isInitialLoad = fieldsQuery.isLoading && customFields.length === 0;

  return (
    <div className="space-y-4">
      {/* ── KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-4">
        <button
          type="button"
          onClick={() => setGroupBy("user")}
          className={cn(
            "rounded-md border p-4 text-left transition-colors hover:bg-blue-50/60",
            groupBy === "user"
              ? "border-blue-300 bg-blue-50 ring-1 ring-blue-300"
              : "border-blue-200 bg-blue-50",
          )}
          aria-pressed={groupBy === "user"}
        >
          <p className="text-xs text-blue-700">Utente che riceve accesso</p>
          <p className="text-2xl font-semibold text-blue-950">{ACCESS_USER_FIELD_PRESETS.length}</p>
        </button>
        <button
          type="button"
          onClick={() => setGroupBy("all")}
          className={cn(
            "rounded-md border p-4 text-left transition-colors hover:bg-muted/40",
            groupBy === "all" ? "ring-1 ring-primary/40 bg-muted/30" : "",
          )}
          aria-pressed={groupBy === "all"}
        >
          <p className="text-xs text-muted-foreground">Campi sistema azienda</p>
          <p className="text-2xl font-semibold">{BUILTIN_FIELDS.length}</p>
        </button>
        <button
          type="button"
          onClick={() => setGroupBy("admin")}
          className={cn(
            "rounded-md border p-4 text-left transition-colors hover:bg-muted/40",
            groupBy === "admin" ? "ring-1 ring-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/20" : "",
          )}
          aria-pressed={groupBy === "admin"}
        >
          <p className="text-xs text-muted-foreground">Campi sistema admin</p>
          <p className="text-2xl font-semibold">{ADMIN_FIELD_PRESETS.length}</p>
        </button>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Campi admin creati</p>
          <p className="text-2xl font-semibold">{customFields.length}</p>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca campo, oggetto o variabile (es. user.email)"
            className="pl-8 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
              aria-label="Pulisci ricerca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Raggruppa per" />
            </SelectTrigger>
            <SelectContent>
              {[
                ...GROUP_OPTIONS,
                ...ADMIN_OBJECTS.filter((item) => !GROUP_OPTIONS.some((group) => group.value === item.value)),
              ].map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="h-9 gap-1 text-xs">
              <X className="h-3 w-3" /> Pulisci filtri
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)} disabled={fieldsQuery.isError}>
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi campo admin
          </Button>
        </div>
      </div>

      {/* ── Tabella ──────────────────────────────────────────────────── */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Campo</TableHead>
              <TableHead>Oggetto</TableHead>
              <TableHead>Cartella</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Variabile email</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isInitialLoad ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Caricamento campi…
                </TableCell>
              </TableRow>
            ) : fieldsQuery.isError ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm">
                  <div className="flex flex-col items-center gap-2 text-destructive">
                    <span>Errore caricamento: {formatError(fieldsQuery.error)}</span>
                    <Button variant="outline" size="sm" onClick={() => fieldsQuery.refetch()}>
                      Riprova
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {hasActiveFilters ? (
                    <div className="space-y-2">
                      <p>Nessun campo corrisponde ai filtri.</p>
                      <Button variant="outline" size="sm" onClick={handleClearFilters}>
                        Pulisci filtri
                      </Button>
                    </div>
                  ) : (
                    <p>Nessun campo configurato. Aggiungi il primo campo admin.</p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((field) => {
                const cleanKey = field.uniqueKey.trim();
                const isCopied = copiedKey === cleanKey;
                return (
                  <TableRow key={field.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {field.isSystem ? (
                          field.folder === "user" || field.folder === "recipient" ? (
                            <UserRound className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Campo di sistema" />
                          )
                        ) : (
                          <Variable className="h-3.5 w-3.5 text-primary" aria-label="Campo personalizzato" />
                        )}
                        <span className="font-medium">{field.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{field.object}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={field.folderColor}>
                        {FOLDER_LABELS[field.folder] ?? fieldObjectLabel(field.folder)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{field.fieldType ?? "text"}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => copyKey(cleanKey)}
                        className={cn(
                          "inline-flex items-center gap-2 rounded px-2 py-1 font-mono text-xs transition-colors",
                          isCopied ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-muted hover:bg-muted/70",
                        )}
                        aria-label={`Copia variabile ${cleanKey}`}
                        title={`Copia ${cleanKey} negli appunti`}
                      >
                        {field.uniqueKey}
                        {isCopied
                          ? <Check className="h-3.5 w-3.5 text-emerald-600" />
                          : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    </TableCell>
                    <TableCell>
                      {!field.isSystem && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => setDeleteTarget(field)}
                          disabled={saveFields.isPending}
                          aria-label={`Elimina campo ${field.name}`}
                          title="Elimina campo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ── Dialog Aggiungi Campo ────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => {
        setDialogOpen(o);
        if (!o) {
          setName("");
          setFieldType("text");
          setNamespace("platform");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo campo personalizzato admin</DialogTitle>
            <DialogDescription>
              Crea una nuova variabile email che potrai usare nei template.
              La chiave snake_case viene generata dal nome.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Area <span className="text-destructive">*</span></Label>
              <Select value={namespace} onValueChange={setNamespace}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOM_ADMIN_OBJECTS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-field-name">Nome campo <span className="text-destructive">*</span></Label>
              <Input
                id="custom-field-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !validationError && name.trim()) {
                    e.preventDefault();
                    addField();
                  }
                }}
                placeholder="es. Owner customer success"
                maxLength={60}
                className={validationError ? "border-destructive" : ""}
                aria-invalid={!!validationError}
                aria-describedby="custom-field-help"
              />
              <div id="custom-field-help" className="space-y-1">
                {name.trim() && !validationError && (
                  <p className="text-xs text-muted-foreground">
                    Variabile generata: <code className="bg-muted px-1.5 py-0.5 rounded">{`{{ ${namespace}.${computedKey} }}`}</code>
                  </p>
                )}
                {validationError && (
                  <p className="text-xs text-destructive">⚠️ {validationError}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo <span className="text-destructive">*</span></Label>
              <Select value={fieldType} onValueChange={setFieldType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saveFields.isPending}>
              Annulla
            </Button>
            <Button
              onClick={addField}
              disabled={!name.trim() || !!validationError || saveFields.isPending}
            >
              {saveFields.isPending ? "Aggiunta…" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirm Dialog Delete ────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il campo?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare il campo <strong>{deleteTarget?.name}</strong>{" "}
              (<code>{deleteTarget?.uniqueKey}</code>).
              <br /><br />
              ⚠️ <strong>Attenzione</strong>: i template email che già usano questa variabile
              continueranno a contenerla, ma <strong>non verrà più sostituita</strong> con un valore
              al momento dell'invio. Verifica i template prima di procedere.
              <br /><br />
              Questa azione è irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saveFields.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={saveFields.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {saveFields.isPending && <Trash2 className="h-4 w-4 mr-2" />}
              Elimina campo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
