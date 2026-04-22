import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Lock, Plus, Search, Trash2, UserRound, Variable } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

const ACCESS_USER_FIELD_PRESETS: UnifiedField[] = [
  {
    id: "sys_access_user_first_name",
    name: "Nome utente",
    object: "Utente destinatario",
    folder: "user",
    folderColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    uniqueKey: "{{ user.first_name }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_access_user_last_name",
    name: "Cognome utente",
    object: "Utente destinatario",
    folder: "user",
    folderColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    uniqueKey: "{{ user.last_name }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_access_user_full_name",
    name: "Nome completo utente",
    object: "Utente destinatario",
    folder: "user",
    folderColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    uniqueKey: "{{ user.full_name }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_access_user_email",
    name: "Email utente",
    object: "Utente destinatario",
    folder: "user",
    folderColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    uniqueKey: "{{ user.email }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_access_user_role",
    name: "Ruolo utente",
    object: "Utente destinatario",
    folder: "user",
    folderColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    uniqueKey: "{{ user.role_label }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_access_user_login_url",
    name: "Link accesso utente",
    object: "Utente destinatario",
    folder: "user",
    folderColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    uniqueKey: "{{ user.login_url }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_recipient_first_name",
    name: "Nome destinatario",
    object: "Destinatario email",
    folder: "recipient",
    folderColor: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
    uniqueKey: "{{ recipient.first_name }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_recipient_email",
    name: "Email destinatario",
    object: "Destinatario email",
    folder: "recipient",
    folderColor: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
    uniqueKey: "{{ recipient.email }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
];

const ADMIN_FIELD_PRESETS: UnifiedField[] = [
  {
    id: "sys_platform_name",
    name: "Nome piattaforma",
    object: "Piattaforma",
    folder: "platform",
    folderColor: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
    uniqueKey: "{{ platform.name }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_platform_support_email",
    name: "Email supporto piattaforma",
    object: "Piattaforma",
    folder: "platform",
    folderColor: "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300",
    uniqueKey: "{{ platform.support_email }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_admin_first_name",
    name: "Nome superadmin",
    object: "Superadmin",
    folder: "admin",
    folderColor: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
    uniqueKey: "{{ admin.first_name }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "text",
  },
  {
    id: "sys_billing_mrr",
    name: "MRR azienda",
    object: "Billing",
    folder: "billing",
    folderColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    uniqueKey: "{{ billing.mrr }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "number",
  },
  {
    id: "sys_trial_end_date",
    name: "Scadenza prova",
    object: "Billing",
    folder: "billing",
    folderColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    uniqueKey: "{{ billing.trial_end_date }}",
    createdAt: "2024-01-01",
    isSystem: true,
    fieldType: "date",
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

function folderBadgeClass(folder: string): string {
  if (FOLDER_COLORS[folder]) return FOLDER_COLORS[folder];
  if (folder === "platform") return "bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300";
  if (folder === "admin") return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300";
  if (folder === "billing") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (folder === "support") return "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300";
  if (folder === "user") return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  if (folder === "recipient") return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300";
  return "bg-muted text-muted-foreground";
}

export function PlatformCustomFieldsPanel() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState("all");
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [namespace, setNamespace] = useState("platform");

  const fieldsQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<PlatformField[]> => {
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
        .eq("key", SETTINGS_KEY)
        .maybeSingle();
      if (error) throw new Error(error.message);
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
      const { error } = await (supabase as unknown as {
        from: (table: string) => {
          upsert: (
            rows: Array<{ key: string; value: string }>,
            opts: { onConflict: string },
          ) => Promise<{ error: { message: string } | null }>;
        };
      })
        .from("platform_settings")
        .upsert([{ key: SETTINGS_KEY, value: JSON.stringify(nextFields) }], { onConflict: "key" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error: Error) => toast.error(`Errore campi personalizzati: ${error.message}`),
  });

  const addField = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const exists = customFields.some(
      (field) => field.namespace === namespace && toSnakeCase(field.name) === toSnakeCase(cleanName),
    );
    if (exists) {
      toast.error("Esiste gia un campo admin con questa chiave");
      return;
    }
    const next: PlatformField[] = [
      ...customFields,
      {
        id: `platform-field-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: cleanName,
        fieldType,
        namespace,
        folder: namespace,
        createdAt: new Date().toISOString(),
      },
    ];
    saveFields.mutate(next, {
      onSuccess: () => {
        toast.success("Campo admin aggiunto");
        setDialogOpen(false);
        setName("");
        setFieldType("text");
        setNamespace("platform");
      },
    });
  };

  const deleteField = (id: string) => {
    saveFields.mutate(customFields.filter((field) => field.id !== id), {
      onSuccess: () => toast.success("Campo admin eliminato"),
    });
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Variabile copiata");
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs text-blue-700">Utente che riceve accesso</p>
          <p className="text-2xl font-semibold text-blue-950">{ACCESS_USER_FIELD_PRESETS.length}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Campi sistema azienda</p>
          <p className="text-2xl font-semibold">{BUILTIN_FIELDS.length}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Campi sistema admin</p>
          <p className="text-2xl font-semibold">{ADMIN_FIELD_PRESETS.length}</p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Campi admin creati</p>
          <p className="text-2xl font-semibold">{customFields.length}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca campo o variabile"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="w-[190px]">
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
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi campo admin
          </Button>
        </div>
      </div>

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
            {fieldsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Caricamento campi...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Nessun campo trovato.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((field) => (
                <TableRow key={field.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {field.isSystem ? (
                        field.folder === "user" || field.folder === "recipient" ? (
                          <UserRound className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        )
                      ) : (
                        <Variable className="h-3.5 w-3.5 text-primary" />
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
                      onClick={() => copyKey(field.uniqueKey.replace(/\s+/g, " "))}
                      className="inline-flex items-center gap-2 rounded bg-muted px-2 py-1 font-mono text-xs transition-colors hover:bg-muted/70"
                    >
                      {field.uniqueKey}
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </TableCell>
                  <TableCell>
                    {!field.isSystem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() => deleteField(field.id)}
                        disabled={saveFields.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo campo personalizzato admin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Area</Label>
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
              <Label>Nome campo</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="es. Owner customer success"
                maxLength={100}
              />
              {name.trim() && (
                <p className="text-xs text-muted-foreground">
                  Variabile: <code>{`{{ ${namespace}.${toSnakeCase(name)} }}`}</code>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={addField} disabled={!name.trim() || saveFields.isPending}>
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
