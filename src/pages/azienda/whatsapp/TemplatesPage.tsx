// MP04 — Gestione completa template WhatsApp PER NUMERO/WABA.
//
// Regole Meta importanti applicate qui:
//  - I template sono PER WABA. Se l'azienda/admin ha più numeri su WABA diverse,
//    i template NON si mischiano: si sceglie il numero/WABA in alto e tutte le
//    operazioni (lista, crea, modifica, elimina) avvengono SOLO su quella WABA
//    (parametro wa_number_id passato all'edge function whatsapp-templates).
//  - La lista è LIVE da Meta (stato reale APPROVED/PENDING/REJECTED).
//  - "Sincronizza da Meta" aggiorna anche la copia DB (wa_meta_templates) usata
//    dal resto dell'app (broadcast, composer, finestra 24h).

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useWhatsAppNumbers, PURPOSE_LABELS, type WAPurpose } from "@/hooks/whatsapp/useWhatsAppNumbers";
import { useSyncMetaTemplates } from "@/hooks/whatsapp/useWAMetaTemplates";
import { useContactCustomFields } from "@/hooks/useOpportunityDetailData";
import {
  buildTemplateFieldOptions, fieldSample,
  type CustomFieldLike, type TemplateFieldOption,
} from "@/lib/whatsapp/templateVariableFields";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle, Loader2, RefreshCcw, Eye, Search, Plus, Pencil, Trash2,
  Bold, Italic, Variable, Info,
} from "lucide-react";

// ── Tipi locali (shape della risposta Meta /message_templates) ──
interface MetaComponent {
  type: string;
  format?: string;
  text?: string;
  example?: unknown;
  buttons?: unknown[];
  [k: string]: unknown;
}
interface MetaTemplate {
  id?: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: MetaComponent[];
}

interface TemplateForm {
  id?: string;
  name: string;
  category: string;
  language: string;
  headerText: string;
  bodyText: string;
  footerText: string;
  examples: Record<number, string>;
  // posizione variabile → chiave campo contatto ("" = testo fisso da examples).
  mapping: Record<number, string>;
}

const EMPTY_FORM: TemplateForm = {
  name: "", category: "UTILITY", language: "it",
  headerText: "", bodyText: "", footerText: "", examples: {}, mapping: {},
};

function statusColor(status: string | null): string {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED": return "bg-green-100 text-green-800";
    case "PENDING": return "bg-amber-100 text-amber-800";
    case "REJECTED": return "bg-red-100 text-red-800";
    case "PAUSED": return "bg-gray-200 text-gray-700";
    // stati d'allarme Meta: prima cadevano nel default grigio neutro e un
    // template FLAGGED/DISABLED sembrava uno stato sconosciuto, non un problema
    case "DISABLED": return "bg-red-100 text-red-800";
    case "FLAGGED": return "bg-red-100 text-red-800";
    case "IN_APPEAL": return "bg-amber-100 text-amber-800";
    case "PENDING_DELETION": return "bg-gray-200 text-gray-700";
    case "REINSTATED": return "bg-green-100 text-green-800";
    default: return "bg-muted text-muted-foreground";
  }
}
function statusLabel(status: string | null): string {
  switch ((status ?? "").toUpperCase()) {
    case "APPROVED": return "Approvato";
    case "PENDING": return "In attesa";
    case "REJECTED": return "Rifiutato";
    case "PAUSED": return "Sospeso";
    case "DISABLED": return "Disabilitato da Meta";
    case "FLAGGED": return "Segnalato da Meta";
    case "IN_APPEAL": return "In appello";
    case "PENDING_DELETION": return "In eliminazione";
    case "REINSTATED": return "Ripristinato";
    default: return status ?? "—";
  }
}
function categoryLabel(cat: string): string {
  switch ((cat ?? "").toUpperCase()) {
    case "MARKETING": return "Marketing";
    case "UTILITY": return "Utility";
    case "AUTHENTICATION": return "Autenticazione";
    default: return cat || "—";
  }
}

function detectVars(text: string): number[] {
  const nums = [...(text || "").matchAll(/\{\{(\d+)\}\}/g)].map((m) => parseInt(m[1], 10));
  return Array.from(new Set(nums)).sort((a, b) => a - b);
}
function bodyTextOf(t: MetaTemplate): string {
  return t.components?.find((c) => c.type === "BODY")?.text || "";
}
function parseToForm(t: MetaTemplate): TemplateForm {
  const header = t.components?.find((c) => c.type === "HEADER" && c.format === "TEXT");
  const body = t.components?.find((c) => c.type === "BODY");
  const footer = t.components?.find((c) => c.type === "FOOTER");
  return {
    id: t.id,
    name: t.name,
    category: (t.category || "UTILITY").toUpperCase(),
    language: t.language || "it",
    headerText: header?.text ?? "",
    bodyText: body?.text ?? "",
    footerText: footer?.text ?? "",
    examples: {},
    mapping: {},
  };
}
// Valore di esempio per la variabile v: se mappata a un campo usa il sample del
// campo, altrimenti il testo fisso digitato.
function exampleFor(form: TemplateForm, v: number, customFields: CustomFieldLike[]): string {
  const mapped = form.mapping[v];
  if (mapped) return fieldSample(mapped, customFields);
  return (form.examples[v] ?? "").trim();
}
function buildComponents(form: TemplateForm, customFields: CustomFieldLike[]): MetaComponent[] {
  const comps: MetaComponent[] = [];
  if (form.headerText.trim()) {
    comps.push({ type: "HEADER", format: "TEXT", text: form.headerText.trim() });
  }
  const body: MetaComponent = { type: "BODY", text: form.bodyText.trim() };
  const vars = detectVars(form.bodyText);
  if (vars.length && vars.every((v) => exampleFor(form, v, customFields).length > 0)) {
    body.example = { body_text: [vars.map((v) => exampleFor(form, v, customFields))] };
  }
  comps.push(body);
  if (form.footerText.trim()) {
    comps.push({ type: "FOOTER", text: form.footerText.trim() });
  }
  return comps;
}

export default function TemplatesPage() {
  const companyId = useEffectiveCompanyId();
  const { data: numbers = [], isLoading: numbersLoading } = useWhatsAppNumbers();
  const queryClient = useQueryClient();
  const sync = useSyncMetaTemplates();
  const { data: customFieldsRaw = [] } = useContactCustomFields();
  const customFields: CustomFieldLike[] = useMemo(
    () => (customFieldsRaw as Array<{ id: string; name: string }>).map((f) => ({ id: f.id, name: f.name })),
    [customFieldsRaw],
  );

  // Numeri usabili per i template: attivi e con WABA collegata.
  const usableNumbers = useMemo(
    () => numbers.filter((n) => n.stato === "active" && n.waba_id),
    [numbers],
  );

  const [waNumberId, setWaNumberId] = useState<string | null>(null);
  useEffect(() => {
    if (!waNumberId && usableNumbers.length > 0) setWaNumberId(usableNumbers[0].id);
    if (waNumberId && !usableNumbers.some((n) => n.id === waNumberId)) {
      setWaNumberId(usableNumbers[0]?.id ?? null);
    }
  }, [usableNumbers, waNumberId]);

  const selectedNumber = usableNumbers.find((n) => n.id === waNumberId) || null;
  // Numeri che CONDIVIDONO la stessa WABA (quindi stessi template).
  const sameWaba = useMemo(
    () => (selectedNumber
      ? usableNumbers.filter((n) => n.waba_id === selectedNumber.waba_id && n.id !== selectedNumber.id)
      : []),
    [usableNumbers, selectedNumber],
  );

  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<MetaTemplate | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; mode: "create" | "edit"; form: TemplateForm }>(
    { open: false, mode: "create", form: EMPTY_FORM },
  );

  // ── Lista LIVE da Meta, filtrata per numero/WABA ──
  const listQuery = useQuery({
    queryKey: ["wa", "templates", "live", companyId, waNumberId],
    enabled: !!companyId && !!waNumberId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
        body: { action: "list", company_id: companyId, wa_number_id: waNumberId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.templates || []) as MetaTemplate[];
    },
  });

  // Mappature variabili già salvate per i template di questo numero (per la modifica).
  const mappingsQuery = useQuery({
    queryKey: ["wa", "templates", "mappings", companyId, waNumberId],
    enabled: !!companyId && !!waNumberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wa_meta_templates")
        .select("template_name, template_language, variable_mapping")
        .eq("company_id", companyId!)
        .eq("wa_number_id", waNumberId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const mappingFor = (name: string, language: string): Record<number, string> => {
    const row = (mappingsQuery.data ?? []).find(
      (r) => r.template_name === name && r.template_language === language,
    );
    const raw = (row?.variable_mapping ?? {}) as Record<string, string>;
    const out: Record<number, string> = {};
    Object.entries(raw).forEach(([k, v]) => {
      const n = parseInt(k, 10);
      if (!Number.isNaN(n) && typeof v === "string") out[n] = v;
    });
    return out;
  };

  const templates = listQuery.data ?? [];
  const filtered = templates.filter((t) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [t.name, t.language, t.category, t.status, bodyTextOf(t)]
      .some((v) => (v ?? "").toLowerCase().includes(q));
  });

  const invalidate = () => {
    // prefisso intero: crea/modifica/elimina devono aggiornare anche la copia
    // DB (useWAMetaTemplates) usata da Composer e Broadcast — prima restava
    // stale finché non si premeva "Sincronizza da Meta".
    queryClient.invalidateQueries({ queryKey: ["wa", "templates"] });
  };

  // ── Mutations (sempre con wa_number_id → niente mix tra WABA) ──
  const saveMutation = useMutation({
    mutationFn: async (form: TemplateForm) => {
      const isEdit = editor.mode === "edit";
      const components = buildComponents(form, customFields);
      // Mappatura posizione → campo (solo variabili presenti nel body e mappate).
      const vars = detectVars(form.bodyText);
      const variable_mapping: Record<string, string> = {};
      vars.forEach((v) => { if (form.mapping[v]) variable_mapping[String(v)] = form.mapping[v]; });

      const body = isEdit
        ? {
            action: "edit", company_id: companyId, wa_number_id: waNumberId, variable_mapping,
            template: {
              id: form.id, name: form.name, language: form.language,
              category: form.category, components,
            },
          }
        : {
            action: "create", company_id: companyId, wa_number_id: waNumberId, variable_mapping,
            template: {
              name: form.name.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
              category: form.category,
              language: form.language,
              components,
            },
          };
      const { data, error } = await supabase.functions.invoke("whatsapp-templates", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success(editor.mode === "edit"
        ? "Template aggiornato (torna in approvazione Meta)"
        : "Template inviato per approvazione");
      setEditor((p) => ({ ...p, open: false }));
      invalidate();
    },
    onError: (err: Error) => toast.error("Errore", { description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (templateName: string) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-templates", {
        body: { action: "delete", company_id: companyId, wa_number_id: waNumberId, template_name: templateName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => { toast.success("Template eliminato"); invalidate(); },
    onError: (err: Error) => toast.error("Errore eliminazione", { description: err.message }),
  });

  const numberLabel = (n: typeof usableNumbers[number]) => {
    const name = n.display_name || n.nome_account || PURPOSE_LABELS[n.purpose as WAPurpose] || "Numero";
    return `${name} · ${n.numero || "—"}`;
  };

  const openCreate = () => setEditor({ open: true, mode: "create", form: EMPTY_FORM });
  const openEdit = (t: MetaTemplate) => {
    const form = parseToForm(t);
    form.mapping = mappingFor(t.name, t.language);
    setEditor({ open: true, mode: "edit", form });
  };

  // ── Empty state: nessun numero collegato ──
  if (!numbersLoading && usableNumbers.length === 0) {
    return (
      <div className="space-y-6 p-4 md:p-0">
        {/* Niente titolo: siamo nella scheda «Template» dell'hub WhatsApp. */}
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
            <p className="font-medium">Nessun numero WhatsApp attivo</p>
            <p className="mt-1 text-sm">
              Collega e verifica un numero nel Centro WhatsApp per poter creare e gestire i template.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    // Da 768 niente margine proprio: lo dà l'hub (prima si sommava a quello
    // della card che conteneva la pagina).
    <div className="space-y-6 p-4 md:p-0">
      {/* Solo le azioni, a destra: il titolo ripeteva la scheda «Template» e la
          frase («Solo gli APPROVED…») lo dice già lo stato di ogni modello. */}
      <div className="flex justify-end">
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => sync.mutate(waNumberId ?? undefined, { onSuccess: () => invalidate() })}
            disabled={sync.isPending}
          >
            {sync.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Sincronizza da Meta
          </Button>
          <Button onClick={openCreate} disabled={!waNumberId}>
            <Plus className="mr-2 h-4 w-4" /> Nuovo template
          </Button>
        </div>
      </div>

      {/* ── Selettore numero / WABA ── */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Numero / Account WhatsApp</Label>
            <Select value={waNumberId ?? undefined} onValueChange={setWaNumberId}>
              <SelectTrigger className="w-full md:w-[420px]">
                <SelectValue placeholder="Seleziona un numero" />
              </SelectTrigger>
              <SelectContent>
                {usableNumbers.map((n) => (
                  <SelectItem key={n.id} value={n.id}>{numberLabel(n)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedNumber && (
            <div className="text-xs text-muted-foreground md:text-right">
              <div>WABA: <span className="font-mono">{selectedNumber.waba_id}</span></div>
              {sameWaba.length > 0 && (
                <div className="mt-1 flex items-center gap-1 text-amber-600">
                  <Info className="h-3 w-3" />
                  Condivide i template con: {sameWaba.map((n) => n.numero).join(", ")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Elenco template</CardTitle>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              placeholder="Cerca nome, testo, stato..."
            />
          </div>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!listQuery.isLoading && listQuery.isError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
              <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
              <p className="font-medium">Template non caricati</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(listQuery.error as Error)?.message || "Errore nel caricamento dei template Meta."}
              </p>
              <Button className="mt-4" variant="outline" onClick={() => listQuery.refetch()} disabled={listQuery.isFetching}>
                <RefreshCcw className={`mr-2 h-4 w-4 ${listQuery.isFetching ? "animate-spin" : ""}`} />
                Riprova
              </Button>
            </div>
          )}
          {!listQuery.isLoading && !listQuery.isError && templates.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nessun template su questo numero. Clicca "Nuovo template" per crearne uno.
            </div>
          )}
          {!listQuery.isLoading && !listQuery.isError && templates.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Lingua</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Variabili</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const vars = detectVars(bodyTextOf(t));
                    return (
                      <TableRow key={(t.id ?? t.name) + t.language}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="uppercase">{t.language}</TableCell>
                        <TableCell>{categoryLabel(t.category)}</TableCell>
                        <TableCell>
                          <Badge className={statusColor(t.status)}>{statusLabel(t.status)}</Badge>
                        </TableCell>
                        <TableCell>{vars.length}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => setPreview(t)} aria-label={`Anteprima ${t.name}`}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              disabled={mappingsQuery.isLoading || mappingsQuery.isError}
                              title={mappingsQuery.isLoading ? "Carico le mappature…" : mappingsQuery.isError ? "Mappature variabili non caricate: riapri la pagina prima di modificare (salvando ora le azzereresti)" : undefined}
                              onClick={() => openEdit(t)} aria-label={`Modifica ${t.name}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (confirm(`Eliminare il template "${t.name}"?`)) deleteMutation.mutate(t.name);
                              }}
                              aria-label={`Elimina ${t.name}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {filtered.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nessun template corrisponde ai filtri.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Anteprima ── */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Anteprima: {preview?.name}</DialogTitle>
            <DialogDescription>
              Lingua {preview?.language?.toUpperCase()} — {categoryLabel(preview?.category ?? "")} — {statusLabel(preview?.status ?? "")}
            </DialogDescription>
          </DialogHeader>
          {preview && <WhatsAppBubblePreview template={preview} />}
          <pre className="mt-3 rounded-md bg-muted p-4 text-xs overflow-x-auto">
            {preview ? JSON.stringify(preview.components, null, 2) : "—"}
          </pre>
        </DialogContent>
      </Dialog>

      {/* ── Editor crea/modifica ── */}
      <TemplateEditorDialog
        open={editor.open}
        mode={editor.mode}
        initial={editor.form}
        isSaving={saveMutation.isPending}
        customFields={customFields}
        onOpenChange={(o) => setEditor((p) => ({ ...p, open: o }))}
        onSubmit={(form) => saveMutation.mutate(form)}
      />
    </div>
  );
}

// ── Anteprima "bolla" WhatsApp del template ──
function WhatsAppBubblePreview({ template }: { template: MetaTemplate | TemplateForm }) {
  const isForm = "bodyText" in template;
  const header = isForm ? template.headerText : template.components?.find((c) => c.type === "HEADER" && c.format === "TEXT")?.text;
  const body = isForm ? template.bodyText : template.components?.find((c) => c.type === "BODY")?.text;
  const footer = isForm ? template.footerText : template.components?.find((c) => c.type === "FOOTER")?.text;
  if (!header && !body && !footer) return null;
  return (
    <div className="rounded-lg bg-[#e5ddd5] p-3">
      <div className="max-w-[85%] rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm">
        {header && <p className="mb-1 font-semibold">{header}</p>}
        {body && <p className="whitespace-pre-wrap text-gray-800">{body}</p>}
        {footer && <p className="mt-1 text-xs text-gray-500">{footer}</p>}
      </div>
    </div>
  );
}

// ── Dialog editor (condiviso crea/modifica) ──
function TemplateEditorDialog({
  open, mode, initial, isSaving, customFields, onOpenChange, onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial: TemplateForm;
  isSaving: boolean;
  customFields: CustomFieldLike[];
  onOpenChange: (o: boolean) => void;
  onSubmit: (form: TemplateForm) => void;
}) {
  const [form, setForm] = useState<TemplateForm>(initial);
  useEffect(() => { if (open) setForm(initial); }, [open, initial]);

  const vars = detectVars(form.bodyText);
  const set = (patch: Partial<TemplateForm>) => setForm((p) => ({ ...p, ...patch }));

  const fieldOptions = buildTemplateFieldOptions(customFields);
  const groupedOptions = fieldOptions.reduce<Record<string, TemplateFieldOption[]>>((acc, o) => {
    (acc[o.group] ??= []).push(o);
    return acc;
  }, {});

  const insertVar = () => {
    const next = (vars.length ? Math.max(...vars) : 0) + 1;
    set({ bodyText: `${form.bodyText}{{${next}}}` });
  };
  const wrap = (sym: string) => set({ bodyText: `${form.bodyText}${sym}testo${sym}` });

  // Meta richiede variabili posizionali CONTIGUE a partire da 1 ({{1}},{{2}},…).
  const varsContiguous = vars.length === 0 || vars.every((v, i) => v === i + 1);

  const canSave = (mode === "edit"
    ? !!form.bodyText.trim()
    : !!form.name.trim() && !!form.bodyText.trim()) && varsContiguous;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Modifica template" : "Nuovo template"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Nome e lingua non sono modificabili. Dopo il salvataggio il template torna in approvazione Meta."
              : "Il template viene inviato a Meta per approvazione (Utility più rapida, Marketing 24-48h)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1.5 md:col-span-1">
              <Label>Nome template *</Label>
              <Input
                placeholder="es. promemoria_appuntamento"
                value={form.name}
                disabled={mode === "edit"}
                onChange={(e) => set({ name: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">minuscole, numeri, _</p>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTILITY">Utility</SelectItem>
                  <SelectItem value="MARKETING">Marketing</SelectItem>
                  <SelectItem value="AUTHENTICATION">Autenticazione</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Lingua</Label>
              <Select value={form.language} onValueChange={(v) => set({ language: v })} disabled={mode === "edit"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="it">Italiano</SelectItem>
                  <SelectItem value="en">Inglese</SelectItem>
                  <SelectItem value="es">Spagnolo</SelectItem>
                  <SelectItem value="de">Tedesco</SelectItem>
                  <SelectItem value="fr">Francese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Intestazione (opzionale)</Label>
            <Input
              placeholder="Titolo in grassetto in cima al messaggio"
              value={form.headerText}
              onChange={(e) => set({ headerText: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Testo del messaggio *</Label>
              <div className="flex gap-1">
                <Button type="button" variant="outline" size="icon" className="h-7 w-7" title="Grassetto" onClick={() => wrap("*")}>
                  <Bold className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="outline" size="icon" className="h-7 w-7" title="Corsivo" onClick={() => wrap("_")}>
                  <Italic className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1" title="Inserisci variabile" onClick={insertVar}>
                  <Variable className="h-3.5 w-3.5" /> Variabile
                </Button>
              </div>
            </div>
            <Textarea
              rows={5}
              placeholder={"Ciao {{1}}, ti ricordiamo l'appuntamento del {{2}}. *Grassetto*, _corsivo_."}
              value={form.bodyText}
              onChange={(e) => set({ bodyText: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              Personalizza con <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>… Formattazione WhatsApp: <code>*grassetto*</code>, <code>_corsivo_</code>, <code>~barrato~</code>.
            </p>
          </div>

          {vars.length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <Label className="text-xs">Variabili — collega ogni {"{{n}}"} a un campo del contatto</Label>
              <p className="text-[11px] text-muted-foreground">
                In fase di invio il valore si compila in automatico dal contatto. Scegli "Testo fisso" per usare un valore uguale per tutti.
              </p>
              {!varsContiguous && (
                <p className="flex items-center gap-1 text-[11px] font-medium text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  Le variabili devono essere numerate in ordine: {"{{1}}, {{2}}, {{3}}…"} senza salti.
                </p>
              )}
              <div className="space-y-2">
                {vars.map((v) => {
                  const mapped = form.mapping[v] || "";
                  return (
                    <div key={v} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                      <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">{`{{${v}}}`}</span>
                      <Select
                        value={mapped || "__fixed__"}
                        onValueChange={(val) =>
                          set({ mapping: { ...form.mapping, [v]: val === "__fixed__" ? "" : val } })
                        }
                      >
                        <SelectTrigger className="h-8 sm:w-60"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__fixed__">Testo fisso…</SelectItem>
                          {Object.entries(groupedOptions).map(([group, opts]) => (
                            <SelectGroup key={group}>
                              <SelectLabel>{group}</SelectLabel>
                              {opts.map((o) => (
                                <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                              ))}
                            </SelectGroup>
                          ))}
                        </SelectContent>
                      </Select>
                      {mapped ? (
                        <span className="text-[11px] text-muted-foreground">
                          es. {fieldSample(mapped, customFields)}
                        </span>
                      ) : (
                        <Input
                          className="h-8 flex-1"
                          placeholder={`Valore di esempio (per Meta)`}
                          value={form.examples[v] ?? ""}
                          onChange={(e) => set({ examples: { ...form.examples, [v]: e.target.value } })}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Piè di pagina (opzionale)</Label>
            <Input
              placeholder="es. Rispondi STOP per annullare"
              value={form.footerText}
              onChange={(e) => set({ footerText: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Anteprima</Label>
            <WhatsAppBubblePreview template={form} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Annulla</Button>
          <Button onClick={() => onSubmit(form)} disabled={!canSave || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "edit" ? "Salva modifiche" : "Invia per approvazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
