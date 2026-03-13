# AUT-UNIF-02 · Pagina Automazioni Unificata + Template Gallery

## Obiettivo
Un'unica pagina `/automazioni` che sostituisce le 3 precedenti.
Contiene: tutte le regole dell'azienda filtrabili per categoria, un rule builder
condiviso, una template gallery con 20+ automazioni pronte da attivare.

---

## Prompt per Lovable

```
Prerequisito: AUT-UNIF-01 completato (tabella automation_rules esiste).
Crea la nuova pagina Automazioni unificata che sostituisce le 3 pagine precedenti.

### STEP 1 — Hook `useAutomazioni.ts`

```typescript
// src/hooks/useAutomazioni.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AutomationCategoria =
  "generale" | "task" | "marketing" | "cantieri" | "crm" | "notifiche";

export interface AutomationRule {
  id: string;
  nome: string;
  descrizione?: string;
  categoria: AutomationCategoria;
  icona?: string;
  colore?: string;
  attiva: boolean;
  is_template: boolean;
  template_id?: string;
  trigger_tipo: string;
  trigger_config: Record<string, unknown>;
  condizioni: unknown[];
  azione_tipo: string;
  azione_config: Record<string, unknown>;
  azioni_secondarie: unknown[];
  esecuzioni_totali: number;
  ultima_esecuzione?: string;
  ultima_esecuzione_ok?: boolean;
  created_at: string;
  updated_at: string;
}

export function useAutomazioni(categoriaFiltro?: AutomationCategoria | "tutte") {
  const { companyId } = useAuth();

  return useQuery<AutomationRule[]>({
    queryKey: ["automazioni", companyId, categoriaFiltro],
    queryFn: async () => {
      let q = supabase
        .from("automation_rules")
        .select("*")
        .eq("company_id", companyId!)
        .eq("is_template", false)
        .order("categoria")
        .order("created_at");

      if (categoriaFiltro && categoriaFiltro !== "tutte") {
        q = q.eq("categoria", categoriaFiltro);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId,
  });
}

export function useAutomationTemplates(categoriaFiltro?: AutomationCategoria | "tutte") {
  return useQuery<AutomationRule[]>({
    queryKey: ["automation-templates", categoriaFiltro],
    queryFn: async () => {
      let q = supabase
        .from("automation_rules")
        .select("*")
        .eq("is_template", true)
        .order("categoria");

      if (categoriaFiltro && categoriaFiltro !== "tutte") {
        q = q.eq("categoria", categoriaFiltro);
      }

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,  // template cambiano raramente
  });
}

export function useToggleAutomazione() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, attiva }: { id: string; attiva: boolean }) => {
      const { error } = await supabase
        .from("automation_rules")
        .update({ attiva })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automazioni"] }),
  });
}

export function useSaveAutomazione() {
  const { companyId, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: Partial<AutomationRule> & { id?: string }) => {
      if (rule.id) {
        const { error } = await supabase
          .from("automation_rules")
          .update(rule)
          .eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("automation_rules")
          .insert({ ...rule, company_id: companyId, created_by: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automazioni"] }),
  });
}

export function useDeleteAutomazione() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("automation_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automazioni"] }),
  });
}

export function useAttivaTemplate() {
  const { companyId, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: AutomationRule) => {
      // Crea copia del template per questa company
      const { id: _, is_template: __, ...rest } = template;
      const { error } = await supabase
        .from("automation_rules")
        .insert({
          ...rest,
          company_id: companyId,
          is_template: false,
          template_id: template.id,
          attiva: true,
          esecuzioni_totali: 0,
          ultima_esecuzione: null,
          created_by: user!.id,
        });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automazioni"] }),
  });
}
```

### STEP 2 — AutomazioniPage.tsx (container)

```typescript
// src/pages/AutomazioniPage.tsx
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, LayoutTemplate } from "lucide-react";
import { AutomazioniList } from "@/components/automazioni/AutomazioniList";
import { AutomazioniTemplateGallery } from "@/components/automazioni/AutomazioniTemplateGallery";
import { AutomazioneFormDrawer } from "@/components/automazioni/AutomazioneFormDrawer";
import { AutomazioniHeader } from "@/components/automazioni/AutomazioniHeader";

export type AutomazioneCategoria =
  "tutte" | "generale" | "task" | "marketing" | "cantieri" | "crm" | "notifiche";

const CATEGORIE: { value: AutomazioneCategoria; label: string; emoji: string }[] = [
  { value: "tutte",      label: "Tutte",       emoji: "⚡" },
  { value: "task",       label: "Task",        emoji: "✅" },
  { value: "marketing",  label: "Marketing",   emoji: "📢" },
  { value: "crm",        label: "CRM",         emoji: "💼" },
  { value: "cantieri",   label: "Cantieri",    emoji: "🏗️" },
  { value: "notifiche",  label: "Notifiche",   emoji: "🔔" },
  { value: "generale",   label: "Generali",    emoji: "🔧" },
];

export default function AutomazioniPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const catParam = (searchParams.get("categoria") as AutomazioneCategoria) ?? "tutte";

  const [categoria, setCategoria] = useState<AutomazioneCategoria>(catParam);
  const [viewMode, setViewMode] = useState<"attive" | "template">("attive");
  const [editingRule, setEditingRule] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const handleCategoriaChange = (cat: AutomazioneCategoria) => {
    setCategoria(cat);
    setSearchParams(cat !== "tutte" ? { categoria: cat } : {});
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header con statistiche */}
      <AutomazioniHeader />

      {/* Barra categoria + azioni */}
      <div className="bg-white border-b px-6">
        <div className="flex items-center justify-between py-3">
          {/* Tab categorie */}
          <div className="flex gap-1 overflow-x-auto">
            {CATEGORIE.map(cat => (
              <button
                key={cat.value}
                onClick={() => handleCategoriaChange(cat.value)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                  whitespace-nowrap transition-all
                  ${categoria === cat.value
                    ? "bg-gray-900 text-white"
                    : "text-gray-500 hover:bg-gray-100"
                  }
                `}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          {/* Azioni */}
          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => setViewMode(viewMode === "attive" ? "template" : "attive")}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors
                ${viewMode === "template"
                  ? "border-blue-500 text-blue-600 bg-blue-50"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }
              `}
            >
              <LayoutTemplate className="w-4 h-4" />
              Template
            </button>
            <Button onClick={() => { setEditingRule(null); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-1.5" />
              Nuova automazione
            </Button>
          </div>
        </div>
      </div>

      {/* Contenuto */}
      <div className="flex-1 overflow-auto">
        {viewMode === "attive" ? (
          <AutomazioniList
            categoria={categoria}
            onEdit={rule => { setEditingRule(rule); setShowForm(true); }}
          />
        ) : (
          <AutomazioniTemplateGallery
            categoria={categoria}
            onCustomizza={template => { setEditingRule(template); setShowForm(true); }}
          />
        )}
      </div>

      {/* Drawer form */}
      {showForm && (
        <AutomazioneFormDrawer
          rule={editingRule}
          onClose={() => { setShowForm(false); setEditingRule(null); }}
        />
      )}
    </div>
  );
}
```

### STEP 3 — AutomazioniHeader.tsx (statistiche globali)

```typescript
// src/components/automazioni/AutomazioniHeader.tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Zap, CheckCircle2, AlertCircle, Activity } from "lucide-react";

export function AutomazioniHeader() {
  const { companyId } = useAuth();

  const { data: counts } = useQuery({
    queryKey: ["automation-counts", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_automation_counts", { p_company_id: companyId! });
      if (error) throw error;

      // Calcola totali
      const totale = (data ?? []).reduce((a: number, r: any) => a + Number(r.totale), 0);
      const attive = (data ?? []).reduce((a: number, r: any) => a + Number(r.attive), 0);
      return { totale, attive, inattive: totale - attive };
    },
    enabled: !!companyId,
  });

  const { data: logRecenti } = useQuery({
    queryKey: ["automation-log-recent", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .rpc("get_automation_log_recent", { p_company_id: companyId!, p_limit: 5 });
      return data ?? [];
    },
    enabled: !!companyId,
    refetchInterval: 30_000,
  });

  const erroriRecenti = (logRecenti ?? []).filter((l: any) => l.esito === "errore").length;

  return (
    <div className="bg-white border-b px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Automazioni</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Automatizza i processi aziendali con regole e trigger
          </p>
        </div>

        {/* KPI pillole */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-sm font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {counts?.attive ?? 0} attive
          </div>
          <div className="flex items-center gap-2 bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full text-sm font-medium">
            <Zap className="w-3.5 h-3.5" />
            {counts?.totale ?? 0} totali
          </div>
          {erroriRecenti > 0 && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 px-3 py-1.5 rounded-full text-sm font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              {erroriRecenti} errori recenti
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### STEP 4 — AutomazioniList.tsx (lista regole attive)

```typescript
// src/components/automazioni/AutomazioniList.tsx
import { useAutomazioni, useToggleAutomazione, useDeleteAutomazione } from "@/hooks/useAutomazioni";
import { AutomazioneCard } from "./AutomazioneCard";
import { AutomazioniEmptyState } from "./AutomazioniEmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import type { AutomazioneCategoria } from "@/pages/AutomazioniPage";

interface Props {
  categoria: AutomazioneCategoria;
  onEdit: (rule: any) => void;
}

export function AutomazioniList({ categoria, onEdit }: Props) {
  const { data: rules, isLoading } = useAutomazioni(categoria);
  const toggle = useToggleAutomazione();
  const deleteRule = useDeleteAutomazione();

  if (isLoading) {
    return (
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!rules?.length) {
    return <AutomazioniEmptyState categoria={categoria} />;
  }

  // Raggruppa per categoria se si vedono "tutte"
  const grouped = categoria === "tutte"
    ? rules.reduce((acc, r) => {
        if (!acc[r.categoria]) acc[r.categoria] = [];
        acc[r.categoria].push(r);
        return acc;
      }, {} as Record<string, typeof rules>)
    : { [categoria]: rules };

  const CATEGORIA_LABEL: Record<string, string> = {
    task: "✅ Task", marketing: "📢 Marketing", crm: "💼 CRM",
    cantieri: "🏗️ Cantieri", notifiche: "🔔 Notifiche", generale: "🔧 Generali",
  };

  return (
    <div className="p-6 space-y-8">
      {Object.entries(grouped).map(([cat, catRules]) => (
        <div key={cat}>
          {categoria === "tutte" && (
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {CATEGORIA_LABEL[cat] ?? cat}
            </h2>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {catRules.map(rule => (
              <AutomazioneCard
                key={rule.id}
                rule={rule}
                onEdit={() => onEdit(rule)}
                onToggle={(attiva) => toggle.mutate({ id: rule.id, attiva })}
                onDelete={() => {
                  if (confirm(`Eliminare "${rule.nome}"?`)) deleteRule.mutate(rule.id);
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### STEP 5 — AutomazioneCard.tsx (card singola automazione)

```typescript
// src/components/automazioni/AutomazioneCard.tsx
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal, Edit2, Trash2, Play, Activity, CheckCircle2, XCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { AutomationRule } from "@/hooks/useAutomazioni";

const TRIGGER_LABEL: Record<string, string> = {
  contatto_creato:            "Nuovo contatto/lead",
  opportunita_creata:         "Nuova opportunità",
  opportunita_stage_cambiato: "Cambio fase opportunità",
  appuntamento_confermato:    "Appuntamento confermato",
  appuntamento_completato:    "Appuntamento completato",
  cantiere_fase_completata:   "Fase cantiere completata",
  cantiere_creato:            "Nuovo cantiere",
  task_completato:            "Task completato",
  scadenza_reminder:          "Promemoria scadenza",
  cron:                       "Programmato",
};

const AZIONE_LABEL: Record<string, string> = {
  crea_task:          "→ Crea task",
  invia_notifica:     "→ Invia notifica",
  invia_email:        "→ Invia email",
  invia_sms:          "→ Invia SMS",
  assegna_agente:     "→ Riassegna agente",
  chiama_webhook:     "→ Chiama webhook",
  esegui_agente_ai:   "→ Esegui agente AI",
  crea_opportunita:   "→ Crea opportunità",
  crea_appuntamento:  "→ Crea appuntamento",
  aggiorna_campo:     "→ Aggiorna campo",
  cambia_stato:       "→ Cambia stato",
};

const CATEGORIA_COLOR: Record<string, string> = {
  task:       "bg-emerald-100 text-emerald-700",
  marketing:  "bg-pink-100 text-pink-700",
  crm:        "bg-blue-100 text-blue-700",
  cantieri:   "bg-amber-100 text-amber-700",
  notifiche:  "bg-purple-100 text-purple-700",
  generale:   "bg-gray-100 text-gray-700",
};

interface Props {
  rule: AutomationRule;
  onEdit: () => void;
  onToggle: (attiva: boolean) => void;
  onDelete: () => void;
}

export function AutomazioneCard({ rule, onEdit, onToggle, onDelete }: Props) {
  return (
    <div className={`
      bg-white rounded-xl border p-4 flex flex-col gap-3
      transition-all hover:shadow-md
      ${!rule.attiva ? "opacity-60" : ""}
      ${rule.ultima_esecuzione_ok === false ? "border-red-200" : "border-gray-200"}
    `}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0
          ${rule.attiva ? "bg-gray-900" : "bg-gray-200"}
        `}>
          {rule.icona ?? "⚡"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate text-sm">{rule.nome}</div>
          {rule.descrizione && (
            <div className="text-xs text-gray-500 truncate mt-0.5">{rule.descrizione}</div>
          )}
          <Badge
            variant="outline"
            className={`mt-1 text-[10px] px-1.5 py-0 ${CATEGORIA_COLOR[rule.categoria]}`}
          >
            {rule.categoria}
          </Badge>
        </div>

        {/* Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Edit2 className="w-3.5 h-3.5 mr-2" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem className="text-red-600" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Logica: trigger → azione */}
      <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2 text-gray-600">
          <Play className="w-3 h-3 text-blue-500 flex-shrink-0" />
          <span className="font-medium">
            {TRIGGER_LABEL[rule.trigger_tipo] ?? rule.trigger_tipo}
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-600 pl-5">
          <span>{AZIONE_LABEL[rule.azione_tipo] ?? rule.azione_tipo}</span>
          {rule.azione_tipo === "crea_task" && rule.azione_config?.titolo && (
            <span className="text-gray-400 truncate">
              "{String(rule.azione_config.titolo).substring(0, 30)}"
            </span>
          )}
        </div>
        {(rule.azioni_secondarie as unknown[])?.length > 0 && (
          <div className="text-gray-400 pl-5 text-[10px]">
            +{(rule.azioni_secondarie as unknown[]).length} azione{(rule.azioni_secondarie as unknown[]).length > 1 ? "i" : ""} aggiuntiv{(rule.azioni_secondarie as unknown[]).length > 1 ? "e" : "a"}
          </div>
        )}
      </div>

      {/* Footer: stats + toggle */}
      <div className="flex items-center justify-between mt-auto pt-1 border-t border-gray-100">
        <div className="text-xs text-gray-400 flex items-center gap-1">
          {rule.ultima_esecuzione ? (
            <>
              {rule.ultima_esecuzione_ok
                ? <CheckCircle2 className="w-3 h-3 text-green-500" />
                : <XCircle className="w-3 h-3 text-red-400" />
              }
              {formatDistanceToNow(new Date(rule.ultima_esecuzione), {
                addSuffix: true, locale: it
              })}
            </>
          ) : (
            <>
              <Activity className="w-3 h-3" />
              Mai eseguita
            </>
          )}
          {rule.esecuzioni_totali > 0 && (
            <span className="text-gray-300">· {rule.esecuzioni_totali}×</span>
          )}
        </div>
        <Switch
          checked={rule.attiva}
          onCheckedChange={onToggle}
        />
      </div>
    </div>
  );
}
```

### STEP 6 — AutomazioniTemplateGallery.tsx (20+ template pronti)

```typescript
// src/components/automazioni/AutomazioniTemplateGallery.tsx
import { useState } from "react";
import { useAutomationTemplates, useAttivaTemplate } from "@/hooks/useAutomazioni";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, Search, Zap } from "lucide-react";
import { toast } from "sonner";
import type { AutomazioneCategoria } from "@/pages/AutomazioniPage";

interface Props {
  categoria: AutomazioneCategoria;
  onCustomizza: (template: any) => void;
}

export function AutomazioniTemplateGallery({ categoria, onCustomizza }: Props) {
  const [cerca, setCerca] = useState("");
  const [attivati, setAttivati] = useState<Set<string>>(new Set());
  const { data: templates, isLoading } = useAutomationTemplates(categoria);
  const attivaTemplate = useAttivaTemplate();

  const filtered = (templates ?? []).filter(t =>
    !cerca ||
    t.nome.toLowerCase().includes(cerca.toLowerCase()) ||
    (t.descrizione ?? "").toLowerCase().includes(cerca.toLowerCase())
  );

  const handleAttiva = async (template: any) => {
    await attivaTemplate.mutateAsync(template);
    setAttivati(prev => new Set([...prev, template.id]));
    toast.success(`"${template.nome}" attivata!`);
  };

  return (
    <div className="p-6">
      {/* Intro + ricerca */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Template Automazioni</h2>
          <p className="text-sm text-gray-500 mt-1">
            Attiva in un click automazioni pronte per il settore edilizia.
            Puoi personalizzarle dopo l'attivazione.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Cerca template..."
            className="pl-9"
            value={cerca}
            onChange={e => setCerca(e.target.value)}
          />
        </div>
      </div>

      {/* Grid template */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(template => {
          const isAttivato = attivati.has(template.id);
          return (
            <div
              key={template.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3 hover:shadow-md transition-all"
            >
              {/* Header */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-gray-800 to-gray-600 flex items-center justify-center text-xl flex-shrink-0">
                  {template.icona ?? "⚡"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm leading-snug">
                    {template.nome}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {template.descrizione}
                  </div>
                </div>
              </div>

              {/* Trigger → Azione */}
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-800">
                <span className="font-medium">Quando:</span>{" "}
                {TRIGGER_SHORT[template.trigger_tipo] ?? template.trigger_tipo}
                <br />
                <span className="font-medium">Allora:</span>{" "}
                {AZIONE_SHORT[template.azione_tipo] ?? template.azione_tipo}
                {template.azione_config?.titolo && (
                  <span className="text-blue-600"> → "{String(template.azione_config.titolo).substring(0, 40)}"</span>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-auto">
                <Badge
                  variant="outline"
                  className="text-[10px]"
                >
                  {CATEGORIA_EMOJI[template.categoria]} {template.categoria}
                </Badge>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onCustomizza(template)}
                  >
                    Personalizza
                  </Button>
                  <Button
                    size="sm"
                    className={`h-7 text-xs ${isAttivato ? "bg-green-600 hover:bg-green-700" : ""}`}
                    onClick={() => !isAttivato && handleAttiva(template)}
                    disabled={isAttivato || attivaTemplate.isPending}
                  >
                    {isAttivato ? (
                      <><Check className="w-3.5 h-3.5 mr-1" />Attivata</>
                    ) : (
                      <><Zap className="w-3.5 h-3.5 mr-1" />Attiva</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TRIGGER_SHORT: Record<string, string> = {
  contatto_creato:            "Nuovo lead arriva nel CRM",
  opportunita_creata:         "Nuova opportunità creata",
  opportunita_stage_cambiato: "Opportunità cambia fase",
  appuntamento_confermato:    "Appuntamento viene confermato",
  appuntamento_completato:    "Appuntamento è avvenuto",
  cantiere_fase_completata:   "Fase del cantiere completata",
  cantiere_creato:            "Nuovo cantiere aperto",
  task_completato:            "Task viene completato",
  cron:                       "Ogni giorno/settimana",
};

const AZIONE_SHORT: Record<string, string> = {
  crea_task: "crea un task",
  invia_notifica: "invia notifica in-app",
  invia_email: "invia email",
  esegui_agente_ai: "chiama agente AI",
  assegna_agente: "riassegna a un agente",
};

const CATEGORIA_EMOJI: Record<string, string> = {
  task: "✅", marketing: "📢", crm: "💼", cantieri: "🏗️", notifiche: "🔔", generale: "🔧",
};
```

### STEP 7 — Seed template nel DB

Aggiungi questa migration con i 20+ template predefiniti:

```sql
-- ATTENZIONE: eseguire dopo che la tabella automation_rules esiste
-- Questi template hanno is_template=TRUE, company_id=NULL

INSERT INTO automation_rules (
  nome, descrizione, categoria, icona, colore, attiva, is_template,
  trigger_tipo, trigger_config, condizioni, azione_tipo, azione_config, azioni_secondarie
) VALUES

-- ===================== TASK =====================
(
  'Nuovo lead → Prima chiamata oggi',
  'Quando arriva un nuovo contatto/lead, crea subito il task "Prima chiamata" con scadenza oggi.',
  'task', '📞', '#10B981', true, true,
  'contatto_creato', '{}', '[]',
  'crea_task',
  '{"titolo": "Prima chiamata a {{nome_contatto}}", "priorita": "alta", "assegna_a": "assegnatario_entita", "scadenza_giorni": 0, "tempo_stimato": 15, "categoria": "chiamata"}',
  '[]'
),
(
  'Appuntamento confermato → Prepara presentazione',
  'Quando un appuntamento viene confermato, il venditore riceve il task di preparare la presentazione.',
  'task', '📊', '#3B82F6', true, true,
  'appuntamento_confermato', '{}', '[]',
  'crea_task',
  '{"titolo": "Prepara presentazione per {{nome_contatto}}", "priorita": "alta", "assegna_a": "assegnatario_entita", "scadenza_giorni": 1, "tempo_stimato": 60, "categoria": "preparazione"}',
  '[]'
),
(
  'Appuntamento fatto → Invia offerta entro 48h',
  'Dopo un appuntamento completato, crea il task di inviare l''offerta commerciale.',
  'task', '💌', '#8B5CF6', true, true,
  'appuntamento_completato', '{}', '[]',
  'crea_task',
  '{"titolo": "Invia offerta a {{nome_contatto}}", "priorita": "alta", "assegna_a": "assegnatario_entita", "scadenza_giorni": 2, "tempo_stimato": 30, "categoria": "offerta"}',
  '[]'
),
(
  'Opportunità vinta → Prepara contratto',
  'Quando un''opportunità passa a "Vinta", crea il task di preparare il contratto.',
  'task', '🤝', '#059669', true, true,
  'opportunita_stage_cambiato',
  '{"a_stage": "vinta"}', '[]',
  'crea_task',
  '{"titolo": "Prepara contratto per {{nome_opportunita}}", "priorita": "urgente", "assegna_a": "assegnatario_entita", "scadenza_giorni": 3, "tempo_stimato": 60, "categoria": "contratto"}',
  '[]'
),
(
  'Opportunità inattiva 7gg → Promemoria follow-up',
  'Se un''opportunità non viene aggiornata da 7 giorni, crea task di follow-up.',
  'task', '⏰', '#F59E0B', true, true,
  'cron', '{"cron": "0 9 * * 1", "descrizione": "Ogni lunedì alle 9"}', '[]',
  'crea_task',
  '{"titolo": "Follow-up opportunità {{nome_opportunita}}", "priorita": "media", "assegna_a": "assegnatario_entita", "scadenza_giorni": 0, "tempo_stimato": 15, "categoria": "follow-up"}',
  '[]'
),
(
  'Fase cantiere completata → Ispezione qualità',
  'Quando una fase del cantiere è completata, crea il task di ispezione qualità.',
  'task', '🔍', '#DC2626', true, true,
  'cantiere_fase_completata', '{}', '[]',
  'crea_task',
  '{"titolo": "Ispezione qualità fase: {{nome_cantiere}}", "priorita": "alta", "assegna_a": "creatore", "scadenza_giorni": 2, "tempo_stimato": 120, "categoria": "ispezione"}',
  '[]'
),

-- ===================== MARKETING / CRM =====================
(
  'Lead Facebook → Assegna + Notifica team',
  'I lead da Facebook Ads vengono assegnati automaticamente al primo agente disponibile e notificati al team.',
  'marketing', '📘', '#1877F2', true, true,
  'contatto_creato',
  '{}', '[{"campo": "fonte_lead", "operatore": "=", "valore": "facebook"}]',
  'assegna_agente',
  '{"strategia": "round_robin", "ruolo": "agente"}',
  '[{"tipo": "invia_notifica", "config": {"titolo": "Nuovo lead Facebook: {{nome_contatto}}", "destinatario": "team"}, "ritardo_minuti": 0}]'
),
(
  'Lead Google → Assegna al call center',
  'I lead da Google Ads vengono assegnati automaticamente al primo operatore call center disponibile.',
  'marketing', '🔍', '#4285F4', true, true,
  'contatto_creato',
  '{}', '[{"campo": "fonte_lead", "operatore": "=", "valore": "google"}]',
  'assegna_agente',
  '{"strategia": "round_robin", "ruolo": "call_center"}',
  '[]'
),
(
  'Opportunità creata → Email di benvenuto al lead',
  'Quando nasce un''opportunità, il lead riceve un''email di conferma del contatto ricevuto.',
  'marketing', '📧', '#F97316', true, true,
  'opportunita_creata', '{}', '[]',
  'invia_email',
  '{"template": "benvenuto_lead", "destinatario": "contatto"}',
  '[]'
),
(
  'Opportunità persa → Email di cortesia + richiesta feedback',
  'Se un''opportunità viene persa, invia automaticamente una email di cortesia con richiesta feedback.',
  'crm', '💬', '#6366F1', true, true,
  'opportunita_stage_cambiato',
  '{"a_stage": "persa"}', '[]',
  'invia_email',
  '{"template": "opportunita_persa_feedback", "destinatario": "contatto"}',
  '[]'
),
(
  'Nessun contatto per 30gg → Riattivazione lead',
  'Lead che non vengono contattati da 30 giorni ricevono un''email di riattivazione automatica.',
  'crm', '🔄', '#0EA5E9', true, true,
  'cron', '{"cron": "0 8 * * 1", "descrizione": "Ogni lunedì"}', '[]',
  'invia_email',
  '{"template": "riattivazione_lead", "destinatario": "contatto", "condizione_giorni_inattivi": 30}',
  '[]'
),
(
  'Opportunità in trattativa → Notifica manager',
  'Quando un''opportunità entra in fase di trattativa, il manager riceve una notifica.',
  'crm', '👔', '#7C3AED', true, true,
  'opportunita_stage_cambiato',
  '{"a_stage": "trattativa"}', '[]',
  'invia_notifica',
  '{"titolo": "Opportunità in trattativa: {{nome_opportunita}}", "destinatario": "ruolo:manager"}',
  '[]'
),

-- ===================== CANTIERI =====================
(
  'Nuovo cantiere → Crea checklist avvio lavori',
  'All''apertura di un nuovo cantiere, genera automaticamente la checklist standard di avvio.',
  'cantieri', '📋', '#D97706', true, true,
  'cantiere_creato', '{}', '[]',
  'crea_task',
  '{"titolo": "Checklist avvio cantiere: {{nome_cantiere}}", "priorita": "alta", "assegna_a": "creatore", "scadenza_giorni": 1, "tempo_stimato": 30, "categoria": "avvio"}',
  '[]'
),
(
  'Cantiere avviato → Ordina materiali',
  'Quando il cantiere passa in stato "avviato", crea il task di ordine materiali.',
  'cantieri', '🔨', '#B45309', true, true,
  'cantiere_fase_completata',
  '{"fase": "progettazione"}', '[]',
  'crea_task',
  '{"titolo": "Ordina materiali per {{nome_cantiere}}", "priorita": "urgente", "assegna_a": "creatore", "scadenza_giorni": 2, "tempo_stimato": 60, "categoria": "approvvigionamento"}',
  '[]'
),
(
  'Fine cantiere → Genera fattura finale',
  'Alla chiusura del cantiere, crea il task di emissione fattura finale al cliente.',
  'cantieri', '💰', '#15803D', true, true,
  'cantiere_fase_completata',
  '{"fase_finale": true}', '[]',
  'crea_task',
  '{"titolo": "Emetti fattura finale: {{nome_cantiere}}", "priorita": "urgente", "assegna_a": "creatore", "scadenza_giorni": 1, "tempo_stimato": 30, "categoria": "fatturazione"}',
  '[]'
),

-- ===================== NOTIFICHE =====================
(
  'Scadenza task domani → Promemoria assegnatario',
  'Il giorno prima di una scadenza task, invia un promemoria in-app all''utente assegnato.',
  'notifiche', '⏰', '#EF4444', true, true,
  'scadenza_reminder', '{"giorni_prima": 1}', '[]',
  'invia_notifica',
  '{"titolo": "Task in scadenza domani: {{titolo_task}}", "destinatario": "assegnatario"}',
  '[]'
),
(
  'Task urgente non iniziato → Alert manager',
  'Se un task urgente è ancora "da fare" dopo 4 ore, notifica il manager.',
  'notifiche', '🚨', '#DC2626', true, true,
  'cron', '{"cron": "0 */4 * * *", "descrizione": "Ogni 4 ore"}', '[]',
  'invia_notifica',
  '{"titolo": "Task urgente non iniziato!", "destinatario": "ruolo:manager", "condizione": "task_urgente_non_iniziato_ore_4"}',
  '[]'
),
(
  'Resoconto giornaliero attività team',
  'Ogni sera alle 18, invia un riepilogo delle attività della giornata al manager.',
  'notifiche', '📊', '#6366F1', true, true,
  'cron', '{"cron": "0 18 * * 1-5", "descrizione": "Ogni giorno lavorativo alle 18"}', '[]',
  'invia_notifica',
  '{"titolo": "Resoconto giornata", "destinatario": "ruolo:manager", "tipo": "resoconto_giornaliero"}',
  '[]'
),

-- ===================== GENERALE =====================
(
  'Nuovo utente → Onboarding task',
  'Quando si aggiunge un nuovo membro del team, crea automaticamente i task di onboarding.',
  'generale', '👋', '#0891B2', true, true,
  'contatto_creato', '{}', '[]',
  'crea_task',
  '{"titolo": "Onboarding nuovo membro team", "priorita": "alta", "assegna_a": "creatore", "scadenza_giorni": 3, "tempo_stimato": 120, "categoria": "onboarding"}',
  '[]'
),
(
  'Opportunità alta priorità → Agente AI analisi',
  'Quando arriva un''opportunità con valore > 50.000€, un agente AI la analizza automaticamente.',
  'generale', '🤖', '#7C3AED', true, true,
  'opportunita_creata',
  '{}', '[{"campo": "valore", "operatore": ">", "valore": "50000"}]',
  'esegui_agente_ai',
  '{"agente_id": null, "prompt_template": "Analizza questa opportunità e suggerisci la strategia migliore: Cliente {{nome_contatto}}, Valore {{valore}}, Fonte {{fonte_lead}}"}',
  '[]'
);
```

### STEP 8 — AutomazioneFormDrawer.tsx (form unificato)

```typescript
// src/components/automazioni/AutomazioneFormDrawer.tsx
// Il drawer sostituisce tutti i vecchi modal specifici per categoria.
// Ha: nome, categoria (dropdown), trigger, condizioni (opz.), azione principale,
//     azioni secondarie (fino a 3), stato attiva.

import { useForm, Controller } from "react-hook-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { useSaveAutomazione } from "@/hooks/useAutomazioni";
import { toast } from "sonner";

const TRIGGER_OPTIONS = [
  { group: "CRM", options: [
    { value: "contatto_creato",            label: "👤 Nuovo contatto/lead" },
    { value: "opportunita_creata",         label: "🆕 Nuova opportunità" },
    { value: "opportunita_stage_cambiato", label: "🔄 Cambio fase opportunità" },
  ]},
  { group: "Appuntamenti", options: [
    { value: "appuntamento_confermato",    label: "📅 Appuntamento confermato" },
    { value: "appuntamento_completato",    label: "✅ Appuntamento completato" },
  ]},
  { group: "Cantieri", options: [
    { value: "cantiere_creato",            label: "🏗️ Nuovo cantiere" },
    { value: "cantiere_fase_completata",   label: "🔨 Fase cantiere completata" },
  ]},
  { group: "Task", options: [
    { value: "task_completato",            label: "✅ Task completato" },
    { value: "scadenza_reminder",          label: "⏰ Promemoria scadenza" },
  ]},
  { group: "Programmato", options: [
    { value: "cron",                       label: "🕐 Schedulato (cron)" },
  ]},
];

const AZIONE_OPTIONS = [
  { value: "crea_task",         label: "✅ Crea task" },
  { value: "invia_notifica",    label: "🔔 Invia notifica in-app" },
  { value: "invia_email",       label: "📧 Invia email" },
  { value: "invia_sms",         label: "💬 Invia SMS" },
  { value: "assegna_agente",    label: "👤 Riassegna agente" },
  { value: "esegui_agente_ai",  label: "🤖 Chiama agente AI" },
  { value: "crea_appuntamento", label: "📅 Crea appuntamento" },
  { value: "aggiorna_campo",    label: "✏️ Aggiorna campo" },
  { value: "chiama_webhook",    label: "🔗 Chiama webhook" },
];

export function AutomazioneFormDrawer({
  rule, onClose
}: { rule?: any; onClose: () => void }) {
  const saveAutomazione = useSaveAutomazione();
  const isTemplate = rule?.is_template ?? false;

  const { register, handleSubmit, watch, control, setValue } = useForm({
    defaultValues: {
      nome:           rule?.nome ?? "",
      descrizione:    rule?.descrizione ?? "",
      categoria:      rule?.categoria ?? "generale",
      icona:          rule?.icona ?? "⚡",
      attiva:         rule?.attiva ?? true,
      trigger_tipo:   rule?.trigger_tipo ?? "contatto_creato",
      trigger_config: JSON.stringify(rule?.trigger_config ?? {}, null, 2),
      condizioni:     JSON.stringify(rule?.condizioni ?? [], null, 2),
      azione_tipo:    rule?.azione_tipo ?? "crea_task",
      azione_config:  JSON.stringify(rule?.azione_config ?? {}, null, 2),
    }
  });

  const azioneTipo = watch("azione_tipo");
  const triggerTipo = watch("trigger_tipo");

  const onSubmit = async (data: any) => {
    try {
      await saveAutomazione.mutateAsync({
        id: !isTemplate ? rule?.id : undefined,  // template → crea nuova
        nome:           data.nome,
        descrizione:    data.descrizione,
        categoria:      data.categoria,
        icona:          data.icona,
        attiva:         data.attiva,
        trigger_tipo:   data.trigger_tipo,
        trigger_config: JSON.parse(data.trigger_config || "{}"),
        condizioni:     JSON.parse(data.condizioni || "[]"),
        azione_tipo:    data.azione_tipo,
        azione_config:  JSON.parse(data.azione_config || "{}"),
        template_id:    isTemplate ? rule?.id : rule?.template_id,
      });
      toast.success(rule?.id && !isTemplate ? "Automazione aggiornata" : "Automazione creata");
      onClose();
    } catch {
      toast.error("Errore nel salvataggio");
    }
  };

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent side="right" className="w-full max-w-2xl flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>
            {isTemplate
              ? `Personalizza: ${rule.nome}`
              : rule?.id ? "Modifica automazione" : "Nuova automazione"
            }
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden">
          <Tabs defaultValue="base" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 border-b">
              <TabsList className="h-9 bg-transparent p-0 gap-0">
                {["base", "trigger", "azione", "avanzato"].map(tab => (
                  <TabsTrigger key={tab} value={tab}
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-4 capitalize">
                    {tab === "base" ? "Informazioni" : tab === "trigger" ? "Trigger" : tab === "azione" ? "Azione" : "Avanzato"}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* TAB: Informazioni base */}
              <TabsContent value="base" className="m-0 p-6 space-y-4">
                <div className="grid grid-cols-[auto_1fr] gap-3 items-start">
                  <div>
                    <Label>Icona</Label>
                    <Input {...register("icona")} className="w-16 text-center text-xl" maxLength={2} />
                  </div>
                  <div>
                    <Label>Nome *</Label>
                    <Input {...register("nome", { required: true })} placeholder="Es. Nuovo lead → Prima chiamata" />
                  </div>
                </div>

                <div>
                  <Label>Descrizione</Label>
                  <Textarea {...register("descrizione")} rows={2} placeholder="Cosa fa questa automazione..." />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Categoria</Label>
                    <Controller name="categoria" control={control} render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="task">✅ Task</SelectItem>
                          <SelectItem value="marketing">📢 Marketing</SelectItem>
                          <SelectItem value="crm">💼 CRM</SelectItem>
                          <SelectItem value="cantieri">🏗️ Cantieri</SelectItem>
                          <SelectItem value="notifiche">🔔 Notifiche</SelectItem>
                          <SelectItem value="generale">🔧 Generale</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label>Stato</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Controller name="attiva" control={control} render={({ field }) => (
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        )} />
                        <span className="text-sm text-gray-600">
                          {watch("attiva") ? "Attiva" : "Inattiva"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* TAB: Trigger */}
              <TabsContent value="trigger" className="m-0 p-6 space-y-4">
                <div>
                  <Label>Evento scatenante *</Label>
                  <Controller name="trigger_tipo" control={control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Scegli trigger..." /></SelectTrigger>
                      <SelectContent>
                        {TRIGGER_OPTIONS.map(g => (
                          <div key={g.group}>
                            <div className="px-2 py-1 text-xs text-gray-400 font-semibold uppercase">{g.group}</div>
                            {g.options.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </div>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>

                {triggerTipo === "cron" && (
                  <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 text-sm space-y-2">
                    <p className="font-medium text-yellow-800">⚠️ Automazione schedulata</p>
                    <p className="text-yellow-700">Per automazioni schedulate usa il campo "Configurazione trigger" qui sotto. Esempi:</p>
                    <code className="text-xs bg-yellow-100 px-2 py-1 rounded block">
                      {`{"cron": "0 9 * * 1-5", "descrizione": "Ogni giorno lavorativo alle 9"}`}
                    </code>
                  </div>
                )}

                <div>
                  <Label>Configurazione trigger (JSON avanzato)</Label>
                  <Textarea
                    {...register("trigger_config")}
                    rows={4}
                    className="font-mono text-xs"
                    placeholder='{"a_stage": "trattativa"}'
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Lascia <code>{"{}"}</code> per reagire a qualsiasi evento di questo tipo.
                  </p>
                </div>
              </TabsContent>

              {/* TAB: Azione */}
              <TabsContent value="azione" className="m-0 p-6 space-y-4">
                <div>
                  <Label>Tipo di azione *</Label>
                  <Controller name="azione_tipo" control={control} render={({ field }) => (
                    <Select value={field.value} onValueChange={val => {
                      field.onChange(val);
                      // Pre-compila azione_config in base al tipo
                      const defaults: Record<string, unknown> = {
                        crea_task: { titolo: "", priorita: "media", assegna_a: "assegnatario_entita", scadenza_giorni: 1, tempo_stimato: 15 },
                        invia_notifica: { titolo: "", destinatario: "assegnatario" },
                        invia_email: { template: "", destinatario: "contatto" },
                        assegna_agente: { strategia: "round_robin", ruolo: "agente" },
                        chiama_webhook: { url: "", metodo: "POST" },
                      };
                      if (defaults[val]) {
                        setValue("azione_config", JSON.stringify(defaults[val], null, 2));
                      }
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AZIONE_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>

                {/* Config dinamica in base al tipo azione */}
                {azioneTipo === "crea_task" && (
                  <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Configurazione Task</p>
                    <Label>Titolo task (usa {"{{"} variabili {"}}"})</Label>
                    <Input placeholder='Es. Prima chiamata a {{nome_contatto}}' className="text-sm" />
                    <div className="grid grid-cols-3 gap-2">
                      <div><Label className="text-xs">Priorità</Label>
                        <Select defaultValue="media">
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="urgente">🔴 Urgente</SelectItem>
                            <SelectItem value="alta">🟠 Alta</SelectItem>
                            <SelectItem value="media">🔵 Media</SelectItem>
                            <SelectItem value="bassa">⚪ Bassa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-xs">Scadenza (giorni)</Label>
                        <Input type="number" min={0} max={30} defaultValue={1} className="h-8 text-xs" />
                      </div>
                      <div><Label className="text-xs">Tempo stimato (min)</Label>
                        <Input type="number" min={5} defaultValue={15} className="h-8 text-xs" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      Variabili disponibili: {"{{"} nome_contatto {"}}"}, {"{{"} nome_opportunita {"}}"}, {"{{"} nome_cantiere {"}}"}, {"{{"} fonte_lead {"}}"}
                    </p>
                  </div>
                )}

                <div>
                  <Label>Configurazione azione (JSON)</Label>
                  <Textarea
                    {...register("azione_config")}
                    rows={6}
                    className="font-mono text-xs"
                  />
                </div>
              </TabsContent>

              {/* TAB: Avanzato */}
              <TabsContent value="avanzato" className="m-0 p-6 space-y-4">
                <div>
                  <Label>Condizioni aggiuntive (JSON array)</Label>
                  <p className="text-xs text-gray-400 mb-2">
                    Filtra quando eseguire l'automazione. Tutte le condizioni devono essere vere (AND).
                  </p>
                  <Textarea
                    {...register("condizioni")}
                    rows={4}
                    className="font-mono text-xs"
                    placeholder='[{"campo": "fonte_lead", "operatore": "=", "valore": "facebook"}]'
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Operatori: =, !=, &gt;, &lt;, contains. Lascia <code>[]</code> per nessuna condizione.
                  </p>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          {/* Footer sticky */}
          <div className="border-t px-6 py-4 flex gap-3">
            <Button type="submit" disabled={saveAutomazione.isPending} className="flex-1">
              {saveAutomazione.isPending ? "Salvataggio..." : rule?.id && !isTemplate ? "Aggiorna" : "Crea automazione"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>Annulla</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
```

Verifica che:
1. La pagina `/automazioni` mostri un'unica schermata con tutte le regole
2. I tab categoria (Tutte/Task/Marketing/CRM/Cantieri) filtrino correttamente
3. Il tasto "Template" mostri la gallery con i 20+ template
4. Cliccando "Attiva" su un template, esso appaia nella lista regole attive
5. Il form drawer apra con tutti e 4 i tab (Informazioni/Trigger/Azione/Avanzato)
6. Le vecchie route /automazioni/task e /automazioni/marketing redirigano qui
```

---

## File attesi dopo AUT-UNIF-02

```
src/
  pages/AutomazioniPage.tsx
  components/automazioni/
    ├── AutomazioniHeader.tsx
    ├── AutomazioniList.tsx
    ├── AutomazioneCard.tsx
    ├── AutomazioniTemplateGallery.tsx
    ├── AutomazioniEmptyState.tsx
    └── AutomazioneFormDrawer.tsx
  hooks/
    └── useAutomazioni.ts

supabase/migrations/
  └── YYYYMMDD_automation_templates_seed.sql
```
