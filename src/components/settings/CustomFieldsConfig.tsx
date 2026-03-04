import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Search, Copy, FolderPlus, Lock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

/* ───── types ───── */
interface UnifiedField {
  id: string;
  name: string;
  object: string;
  folder: string;
  folderColor: string;
  uniqueKey: string;
  createdAt: string;
  isSystem: boolean;
  fieldType?: string;
  options?: string[];
  section?: string;
}

/* ───── built-in fields ───── */
const FOLDER_COLORS: Record<string, string> = {
  contact: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  general_info: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  additional_info: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  opportunity_details: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
};
const FOLDER_LABELS: Record<string, string> = {
  contact: "Contatto",
  general_info: "General Info",
  additional_info: "Additional Info",
  opportunity_details: "Opportunità Details",
};

const BUILTIN_FIELDS: UnifiedField[] = [
  // Contact fields
  { id: "sys_first_name", name: "First Name", object: "Contatto", folder: "contact", folderColor: FOLDER_COLORS.contact, uniqueKey: "{{ contact.first_name }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_last_name", name: "Last Name", object: "Contatto", folder: "contact", folderColor: FOLDER_COLORS.contact, uniqueKey: "{{ contact.last_name }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_full_name", name: "Full Name", object: "Contatto", folder: "contact", folderColor: FOLDER_COLORS.contact, uniqueKey: "{{ contact.full_name }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_email", name: "Email", object: "Contatto", folder: "contact", folderColor: FOLDER_COLORS.contact, uniqueKey: "{{ contact.email }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_phone", name: "Phone", object: "Contatto", folder: "contact", folderColor: FOLDER_COLORS.contact, uniqueKey: "{{ contact.phone }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_dob", name: "Date Of Birth", object: "Contatto", folder: "contact", folderColor: FOLDER_COLORS.contact, uniqueKey: "{{ contact.date_of_birth }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_source", name: "Contact Source", object: "Contatto", folder: "contact", folderColor: FOLDER_COLORS.contact, uniqueKey: "{{ contact.source }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_type", name: "Contact Type", object: "Contatto", folder: "contact", folderColor: FOLDER_COLORS.contact, uniqueKey: "{{ contact.type }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_company_name", name: "Business Name", object: "Contatto", folder: "general_info", folderColor: FOLDER_COLORS.general_info, uniqueKey: "{{ contact.company_name }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_address", name: "Street Address", object: "Contatto", folder: "general_info", folderColor: FOLDER_COLORS.general_info, uniqueKey: "{{ contact.address }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_city", name: "City", object: "Contatto", folder: "general_info", folderColor: FOLDER_COLORS.general_info, uniqueKey: "{{ contact.city }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_province", name: "State", object: "Contatto", folder: "general_info", folderColor: FOLDER_COLORS.general_info, uniqueKey: "{{ contact.province }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_postal_code", name: "Postal Code", object: "Contatto", folder: "general_info", folderColor: FOLDER_COLORS.general_info, uniqueKey: "{{ contact.postal_code }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_country", name: "Country", object: "Contatto", folder: "general_info", folderColor: FOLDER_COLORS.general_info, uniqueKey: "{{ contact.country }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_website", name: "Website", object: "Contatto", folder: "general_info", folderColor: FOLDER_COLORS.general_info, uniqueKey: "{{ contact.website }}", createdAt: "2024-01-01", isSystem: true },
  // Opportunity fields
  { id: "sys_opp_name", name: "Opportunity Name", object: "Opportunità", folder: "opportunity_details", folderColor: FOLDER_COLORS.opportunity_details, uniqueKey: "{{ opportunity.name }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_opp_pipeline", name: "Pipeline", object: "Opportunità", folder: "opportunity_details", folderColor: FOLDER_COLORS.opportunity_details, uniqueKey: "{{ opportunity.pipeline_id }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_opp_stage", name: "Stage", object: "Opportunità", folder: "opportunity_details", folderColor: FOLDER_COLORS.opportunity_details, uniqueKey: "{{ opportunity.pipeline_stage_id }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_opp_status", name: "Status", object: "Opportunità", folder: "opportunity_details", folderColor: FOLDER_COLORS.opportunity_details, uniqueKey: "{{ opportunity.status }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_opp_value", name: "Lead Value", object: "Opportunità", folder: "opportunity_details", folderColor: FOLDER_COLORS.opportunity_details, uniqueKey: "{{ opportunity.monetary_value }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_opp_owner", name: "Opportunity Owner", object: "Opportunità", folder: "opportunity_details", folderColor: FOLDER_COLORS.opportunity_details, uniqueKey: "{{ opportunity.assigned_to }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_opp_source", name: "Opportunity Source", object: "Opportunità", folder: "opportunity_details", folderColor: FOLDER_COLORS.opportunity_details, uniqueKey: "{{ opportunity.source }}", createdAt: "2024-01-01", isSystem: true },
  { id: "sys_opp_lost_reason", name: "Lost Reason", object: "Opportunità", folder: "opportunity_details", folderColor: FOLDER_COLORS.opportunity_details, uniqueKey: "{{ opportunity.lost_reason }}", createdAt: "2024-01-01", isSystem: true },
];

const FIELD_TYPES = [
  { value: "text", label: "Testo" },
  { value: "number", label: "Numero" },
  { value: "date", label: "Data" },
  { value: "select", label: "Selezione" },
];

const CONTACT_SECTIONS = [
  { value: "contact", label: "Contatto" },
  { value: "general_info", label: "Informazioni generali" },
  { value: "additional_info", label: "Informazioni aggiuntive" },
];
const OPPORTUNITY_SECTIONS = [
  { value: "opportunity_details", label: "Opportunità Details" },
];

function toSnakeCase(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/* ───── component ───── */
export function CustomFieldsConfig() {
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [section, setSection] = useState("general_info");
  const [objectType, setObjectType] = useState<"contact" | "opportunity">("contact");
  const [optionsInput, setOptionsInput] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [groupBy, setGroupBy] = useState("all");
  const [pageSize, setPageSize] = useState(200);

  const { data: customFields = [], isLoading } = useQuery({
    queryKey: ["marketing_custom_fields", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_custom_fields")
        .select("*")
        .eq("company_id", companyId)
        .order("section")
        .order("position");
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const allFields = useMemo<UnifiedField[]>(() => {
    const custom: UnifiedField[] = customFields.map((f: any) => {
      const isOpp = f.object_type === "opportunity";
      return {
        id: f.id,
        name: f.name,
        object: isOpp ? "Opportunità" : "Contatto",
        folder: f.section,
        folderColor: FOLDER_COLORS[f.section] || FOLDER_COLORS.additional_info,
        uniqueKey: isOpp
          ? `{{ opportunity.${toSnakeCase(f.name)} }}`
          : `{{ contact.${toSnakeCase(f.name)} }}`,
        createdAt: f.created_at,
        isSystem: false,
        fieldType: f.field_type,
        options: f.options ?? [],
        section: f.section,
      };
    });
    return [...BUILTIN_FIELDS, ...custom];
  }, [customFields]);

  const filtered = useMemo(() => {
    let result = allFields;
    // Filter by group
    if (groupBy === "contact") {
      result = result.filter((f) => f.object === "Contatto");
    } else if (groupBy === "opportunity") {
      result = result.filter((f) => f.object === "Opportunità");
    }
    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.uniqueKey.toLowerCase().includes(q) ||
          f.object.toLowerCase().includes(q) ||
          (FOLDER_LABELS[f.folder] || f.folder).toLowerCase().includes(q)
      );
    }
    return result;
  }, [allFields, search, groupBy]);

  // When objectType changes, reset section to a valid default
  const handleObjectTypeChange = (val: "contact" | "opportunity") => {
    setObjectType(val);
    setSection(val === "opportunity" ? "opportunity_details" : "general_info");
  };

  const availableSections = objectType === "opportunity" ? OPPORTUNITY_SECTIONS : CONTACT_SECTIONS;

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !name.trim()) return;
      const options =
        fieldType === "select"
          ? optionsInput.split(",").map((o) => o.trim()).filter(Boolean)
          : [];
      const { error } = await supabase.from("marketing_custom_fields").insert({
        company_id: companyId,
        name: name.trim(),
        field_type: fieldType,
        options,
        section,
        position: customFields.length,
        object_type: objectType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      toast.success("Campo personalizzato aggiunto");
      setDialogOpen(false);
      setName("");
      setFieldType("text");
      setSection("general_info");
      setObjectType("contact");
      setOptionsInput("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_custom_fields").delete().eq("id", id).eq("company_id", companyId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_custom_fields"] });
      toast.success("Campo eliminato");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Chiave copiata");
  };

  const visibleFields = filtered.slice(0, pageSize);
  const total = filtered.length;

  return (
    <div className="space-y-0">
      {/* ── Header tabs + buttons ── */}
      <div className="flex items-center justify-between border-b pb-0 mb-0">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-transparent h-auto p-0 gap-0">
            <TabsTrigger value="all" className="rounded-none border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 pb-2.5 pt-1">
              Tutti i campi
            </TabsTrigger>
            <TabsTrigger value="folders" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 pb-2.5 pt-1" disabled>
              Cartelle
            </TabsTrigger>
            <TabsTrigger value="deleted" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 pb-2.5 pt-1" disabled>
              Campi eliminati
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 pb-1">
          <Button variant="outline" size="sm" disabled>
            <FolderPlus className="h-4 w-4 mr-1.5" /> Aggiungi cartella
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Aggiungi campo
          </Button>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="flex items-center justify-between gap-3 py-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>Raggruppa per:</span>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-[140px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutto</SelectItem>
              <SelectItem value="contact">Contatto</SelectItem>
              <SelectItem value="opportunity">Opportunità</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <p className="text-muted-foreground text-sm py-12 text-center">Caricamento...</p>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-10 px-3"><Checkbox disabled /></TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Nome Del Campo</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Oggetto</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Cartella</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Chiave Univoca</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Creato Il</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleFields.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                    Nessun campo trovato.
                  </TableCell>
                </TableRow>
              ) : (
                visibleFields.map((f) => (
                  <TableRow key={f.id} className="group">
                    <TableCell className="px-3">
                      {f.isSystem ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground/50" />
                      ) : (
                        <Checkbox />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm">{f.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{f.object}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-xs font-normal ${f.folderColor}`}>
                        {FOLDER_LABELS[f.folder] || f.folder}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{f.uniqueKey}</code>
                        <button
                          onClick={() => copyKey(f.uniqueKey)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(f.createdAt), "dd MMM yyyy", { locale: it })}
                    </TableCell>
                    <TableCell>
                      {!f.isSystem && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteMutation.mutate(f.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-between pt-3 text-sm text-muted-foreground">
        <span>
          Presentazione 1 a {Math.min(pageSize, total)} di {total} risultati
        </span>
        <div className="flex items-center gap-1.5">
          <span>Dimensione pagina:</span>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[80px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Add field dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Campo Personalizzato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Oggetto *</Label>
              <Select value={objectType} onValueChange={(v) => handleObjectTypeChange(v as "contact" | "opportunity")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contatto</SelectItem>
                  <SelectItem value="opportunity">Opportunità</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome del campo *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="es. Tipo di caldaia"
                maxLength={100}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={fieldType} onValueChange={setFieldType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sezione</Label>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableSections.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {fieldType === "select" && (
              <div className="space-y-1.5">
                <Label>Opzioni (separate da virgola)</Label>
                <Input
                  value={optionsInput}
                  onChange={(e) => setOptionsInput(e.target.value)}
                  placeholder="es. Condensazione, Tradizionale, Ibrida"
                  maxLength={200}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => addMutation.mutate()} disabled={!name.trim() || addMutation.isPending}>
              {addMutation.isPending ? "Salvataggio..." : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
