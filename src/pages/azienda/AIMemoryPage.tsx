/**
 * AIMemoryPage — GAP 9b
 *
 * Pagina admin per gestire la memoria delle 18 personas AI.
 * Mostra le memory esistenti per persona + permette CRUD manuale.
 *
 * Le memory sono auto-popolate dal feedback loop ai-orchestrator (per ora
 * solo lettura), ma il company_admin può:
 *   - Aggiungere fact/preference/decision/pattern/avoid manuali
 *   - Editare content/type/confidence
 *   - Disabilitare/abilitare entry
 *   - Eliminare definitivamente
 *
 * Filtri: persona, memory_type, search content.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Brain, Plus, Search, Trash2, Edit2, EyeOff, Eye, Sparkles, AlertCircle,
} from "lucide-react";

interface MemoryRow {
  id: string;
  company_id: string;
  user_id: string | null;
  persona_key: string;
  memory_type: "fact" | "preference" | "decision" | "pattern" | "avoid";
  content: string;
  source: string | null;
  confidence: number | null;
  enabled: boolean;
  hits_count: number;
  last_used_at: string | null;
  created_at: string;
}

interface PersonaLite {
  persona_key: string;
  display_name: string;
  category: string;
}

const TYPE_LABEL: Record<MemoryRow["memory_type"], { label: string; color: string }> = {
  fact:       { label: "Fatto",        color: "bg-blue-100 text-blue-700 border-blue-300" },
  preference: { label: "Preferenza",    color: "bg-violet-100 text-violet-700 border-violet-300" },
  decision:   { label: "Decisione",     color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  pattern:    { label: "Pattern",       color: "bg-amber-100 text-amber-700 border-amber-300" },
  avoid:      { label: "Da evitare",    color: "bg-rose-100 text-rose-700 border-rose-300" },
};

interface FormData {
  id?: string;
  persona_key: string;
  memory_type: MemoryRow["memory_type"];
  content: string;
  source: string;
  confidence: number;
}

const EMPTY_FORM: FormData = {
  persona_key: "",
  memory_type: "fact",
  content: "",
  source: "user_explicit",
  confidence: 1.0,
};

export default function AIMemoryPage() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  // Personas list
  const { data: personas = [] } = useQuery({
    queryKey: ["memory-personas"],
    queryFn: async (): Promise<PersonaLite[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("ai_personas_public")
        .select("persona_key, display_name, category")
        .eq("enabled", true)
        .order("category");
      return (data ?? []) as PersonaLite[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Memory rows
  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["ai-persona-memory", effectiveCompany?.id, filterPersona, filterType, showDisabled],
    enabled: !!effectiveCompany?.id,
    queryFn: async (): Promise<MemoryRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("ai_persona_memory")
        .select("id, company_id, user_id, persona_key, memory_type, content, source, confidence, enabled, hits_count, last_used_at, created_at")
        .eq("company_id", effectiveCompany!.id)
        .order("hits_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (filterPersona !== "all") q = q.eq("persona_key", filterPersona);
      if (filterType !== "all") q = q.eq("memory_type", filterType);
      if (!showDisabled) q = q.eq("enabled", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MemoryRow[];
    },
  });

  const filteredMemories = memories.filter((m) =>
    !search || m.content.toLowerCase().includes(search.toLowerCase())
  );

  // Mutations
  const upsertMut = useMutation({
    mutationFn: async (data: FormData) => {
      if (!effectiveCompany?.id) throw new Error("no_company");
      if (data.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("ai_persona_memory")
          .update({
            persona_key: data.persona_key,
            memory_type: data.memory_type,
            content: data.content.trim(),
            source: data.source,
            confidence: data.confidence,
          })
          .eq("id", data.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).rpc("record_persona_memory", {
          p_company_id: effectiveCompany.id,
          p_user_id: null, // memory globale per company (non user-specific)
          p_persona_key: data.persona_key,
          p_memory_type: data.memory_type,
          p_content: data.content.trim(),
          p_source: data.source,
          p_confidence: data.confidence,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Memory salvata");
      setEditOpen(false);
      setForm(EMPTY_FORM);
      void qc.invalidateQueries({ queryKey: ["ai-persona-memory"] });
    },
    onError: (e) => toast.error("Errore", { description: String(e) }),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("ai_persona_memory")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai-persona-memory"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("ai_persona_memory")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Memory eliminata");
      void qc.invalidateQueries({ queryKey: ["ai-persona-memory"] });
    },
  });

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, persona_key: filterPersona !== "all" ? filterPersona : (personas[0]?.persona_key ?? "") });
    setEditOpen(true);
  };

  const openEdit = (m: MemoryRow) => {
    setForm({
      id: m.id,
      persona_key: m.persona_key,
      memory_type: m.memory_type,
      content: m.content,
      source: m.source ?? "user_explicit",
      confidence: m.confidence ?? 1.0,
    });
    setEditOpen(true);
  };

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Brain className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Memoria AI Personas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cose che le 18 AI personas ricordano della tua azienda. Auto-popolate dal feedback loop o aggiunte manualmente.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Aggiungi memoria
        </Button>
      </div>

      <Card className="bg-violet-50/40 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            Come funziona
          </CardTitle>
          <CardDescription className="text-xs space-y-1">
            <p>
              Ogni volta che chiedi qualcosa a una persona AI (es. CFO), il sistema carica le sue
              top-5 memory rilevanti e le inietta nel prompt come "Cose che sai dell'utente".
            </p>
            <p>
              Esempi: il CFO ricorda "Florin preferisce vedere il P&L mensile vs settimanale".
              Il PM Cantiere ricorda "il cantiere XYZ va sempre in ritardo per Bianchi Srl".
            </p>
            <p>
              <strong>Hits count:</strong> quante volte una memory è stata caricata. Le più usate
              hanno priorità nella selezione top-5.
            </p>
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterPersona} onValueChange={setFilterPersona}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le personas</SelectItem>
            {personas.map((p) => (
              <SelectItem key={p.persona_key} value={p.persona_key}>{p.display_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            {Object.entries(TYPE_LABEL).map(([key, t]) => (
              <SelectItem key={key} value={key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca nel contenuto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9"
          />
        </div>

        <Button
          variant={showDisabled ? "default" : "outline"}
          size="sm"
          onClick={() => setShowDisabled(!showDisabled)}
          className="h-9 gap-2"
        >
          {showDisabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showDisabled ? "Mostra disabilitate" : "Solo attive"}
        </Button>

        <Badge variant="outline" className="ml-auto text-xs">
          {filteredMemories.length} entries
        </Badge>
      </div>

      {/* Memory list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filteredMemories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Nessuna memoria per questi filtri</p>
            <p className="text-xs mt-1">
              Le memory si auto-popolano usando le AI personas, oppure puoi aggiungerle manualmente.
            </p>
            <Button onClick={openCreate} className="mt-4 gap-2" size="sm">
              <Plus className="h-3.5 w-3.5" />
              Aggiungi prima memoria
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredMemories.map((m) => {
            const persona = personas.find((p) => p.persona_key === m.persona_key);
            const typeBadge = TYPE_LABEL[m.memory_type];
            return (
              <div
                key={m.id}
                className={cn(
                  "rounded-lg border p-3 flex items-start gap-3 hover:bg-muted/30 transition-colors",
                  !m.enabled && "opacity-50",
                )}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px]", typeBadge.color)}>
                      {typeBadge.label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {persona?.display_name ?? m.persona_key}
                    </Badge>
                    {!m.enabled && (
                      <Badge variant="outline" className="text-[10px] gap-1 bg-slate-100 text-slate-600">
                        <EyeOff className="h-2.5 w-2.5" />
                        Disabilitata
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {m.hits_count} hits · creata il {new Date(m.created_at).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                  <p className="text-sm leading-snug">{m.content}</p>
                  {m.source && m.confidence != null && (
                    <p className="text-[10px] text-muted-foreground">
                      Fonte: {m.source} · Confidence: {(m.confidence * 100).toFixed(0)}%
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => toggleMut.mutate({ id: m.id, enabled: !m.enabled })}
                    title={m.enabled ? "Disabilita" : "Riattiva"}
                  >
                    {m.enabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => openEdit(m)}
                    title="Modifica"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-rose-600 hover:text-rose-700"
                    onClick={() => {
                      if (confirm("Eliminare definitivamente questa memoria? L'azione è irreversibile.")) {
                        deleteMut.mutate(m.id);
                      }
                    }}
                    title="Elimina"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifica memoria" : "Aggiungi memoria"}</DialogTitle>
            <DialogDescription>
              Una memory che la persona AI ricorderà nelle prossime conversazioni.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Persona</Label>
              <Select value={form.persona_key} onValueChange={(v) => setForm({ ...form, persona_key: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Scegli persona" />
                </SelectTrigger>
                <SelectContent>
                  {personas.map((p) => (
                    <SelectItem key={p.persona_key} value={p.persona_key}>{p.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={form.memory_type} onValueChange={(v) => setForm({ ...form, memory_type: v as FormData["memory_type"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([key, t]) => (
                    <SelectItem key={key} value={key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Contenuto</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="es. Florin preferisce vedere il P&L mensile vs settimanale"
                rows={3}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Scrivi una frase chiara e breve. Verrà iniettata nel prompt della persona.
              </p>
            </div>
            <div>
              <Label className="text-xs">Confidence ({(form.confidence * 100).toFixed(0)}%)</Label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.1"
                value={form.confidence}
                onChange={(e) => setForm({ ...form, confidence: Number(e.target.value) })}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annulla</Button>
            <Button
              onClick={() => upsertMut.mutate(form)}
              disabled={upsertMut.isPending || !form.persona_key || !form.content.trim()}
            >
              {upsertMut.isPending ? "Salvo…" : (form.id ? "Salva modifiche" : "Crea memoria")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10 dark:border-amber-900">
        <CardContent className="p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>Privacy:</strong> le memory sono multi-tenant (visibili solo nella tua azienda).
            Quelle con <code className="bg-muted px-1 rounded">user_id NULL</code> sono globali per
            tutti gli utenti della company. Per memory user-specific (preferenze personali), usa la
            chat con la persona — l'AI le creerà automaticamente quando rileva pattern stabili.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
