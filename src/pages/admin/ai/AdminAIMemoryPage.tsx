/**
 * AdminAIMemoryPage — vista cross-company delle memorie AI personas.
 *
 * Differenze rispetto a /azienda/impostazioni/ai-memoria:
 *   - Filtro company aggiuntivo (all / specifica) per super_admin
 *   - Stats aggregate cross-company nel header
 *   - Colonna "Azienda" mostrata in ogni memory card
 *   - Realtime subscription globale (no filtro company_id)
 *   - CRUD: company_id sempre obbligatorio (no default da effectiveCompany)
 *
 * Ispirazione: grafo conoscenza dello stile graphify — qui resta una vista
 * tabellare ma con stats che mostrano l'intero ecosistema. Vista grafo
 * vera è out-of-scope per ora.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
  Brain, Plus, Search, Trash2, Edit2, EyeOff, Eye, Sparkles, Building2,
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

interface CompanyLite {
  id: string;
  name: string;
}

interface PersonaLite {
  persona_key: string;
  display_name: string;
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
  company_id: string;
  persona_key: string;
  memory_type: MemoryRow["memory_type"];
  content: string;
  source: string;
  confidence: number;
}

const EMPTY_FORM: FormData = {
  company_id: "",
  persona_key: "",
  memory_type: "fact",
  content: "",
  source: "user_explicit",
  confidence: 1.0,
};

export default function AdminAIMemoryPage() {
  const qc = useQueryClient();
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterPersona, setFilterPersona] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  // Companies list (per filtro + per dialog form)
  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-list"],
    queryFn: async (): Promise<CompanyLite[]> => {
      const { data } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      return (data ?? []) as CompanyLite[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Personas list
  const { data: personas = [] } = useQuery({
    queryKey: ["memory-personas"],
    queryFn: async (): Promise<PersonaLite[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("ai_personas_public")
        .select("persona_key, display_name")
        .eq("enabled", true)
        .order("display_name");
      return (data ?? []) as PersonaLite[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Memory rows — cross-company
  const { data: memories = [], isLoading } = useQuery({
    queryKey: ["admin-ai-persona-memory", filterCompany, filterPersona, filterType, showDisabled],
    queryFn: async (): Promise<MemoryRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("ai_persona_memory")
        .select("id, company_id, user_id, persona_key, memory_type, content, source, confidence, enabled, hits_count, last_used_at, created_at")
        .order("hits_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (filterCompany !== "all") q = q.eq("company_id", filterCompany);
      if (filterPersona !== "all") q = q.eq("persona_key", filterPersona);
      if (filterType !== "all") q = q.eq("memory_type", filterType);
      if (!showDisabled) q = q.eq("enabled", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as MemoryRow[];
    },
  });

  // Realtime: invalida la query quando una memoria cambia ovunque nel sistema.
  // Per super_admin non filtriamo per company_id — segue tutti gli aggiornamenti.
  useEffect(() => {
    const ch = supabase
      .channel("admin-ai-persona-memory-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_persona_memory" },
        () => void qc.invalidateQueries({ queryKey: ["admin-ai-persona-memory"] }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [qc]);

  const filteredMemories = memories.filter((m) =>
    !search || m.content.toLowerCase().includes(search.toLowerCase())
  );

  // Lookup company name (memoized perché chiamato per ogni row)
  const companyNameById = useMemo(() => {
    const map = new Map<string, string>();
    companies.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [companies]);

  // Stats cross-company
  const stats = useMemo(() => {
    const byType: Record<MemoryRow["memory_type"], number> = {
      fact: 0, preference: 0, decision: 0, pattern: 0, avoid: 0,
    };
    const byCompany = new Map<string, number>();
    const byPersona = new Map<string, number>();
    let manual = 0;
    let auto = 0;
    let hits = 0;
    for (const m of memories) {
      byType[m.memory_type] = (byType[m.memory_type] ?? 0) + 1;
      byCompany.set(m.company_id, (byCompany.get(m.company_id) ?? 0) + 1);
      byPersona.set(m.persona_key, (byPersona.get(m.persona_key) ?? 0) + 1);
      const isManual = !m.source || m.source === "user_explicit" || m.source === "manual";
      if (isManual) manual++;
      else auto++;
      hits += m.hits_count ?? 0;
    }
    // Top persona per uso (hits)
    const topPersonas = [...byPersona.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return {
      total: memories.length,
      byType,
      companies: byCompany.size,
      manual,
      auto,
      hits,
      topPersonas,
    };
  }, [memories]);

  // Mutations
  const upsertMut = useMutation({
    mutationFn: async (data: FormData) => {
      if (!data.company_id) throw new Error("Seleziona un'azienda");
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
          p_company_id: data.company_id,
          p_user_id: null,
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
      void qc.invalidateQueries({ queryKey: ["admin-ai-persona-memory"] });
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
      void qc.invalidateQueries({ queryKey: ["admin-ai-persona-memory"] });
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
      void qc.invalidateQueries({ queryKey: ["admin-ai-persona-memory"] });
    },
  });

  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      company_id: filterCompany !== "all" ? filterCompany : (companies[0]?.id ?? ""),
      persona_key: filterPersona !== "all" ? filterPersona : (personas[0]?.persona_key ?? ""),
    });
    setEditOpen(true);
  };

  const openEdit = (m: MemoryRow) => {
    setForm({
      id: m.id,
      company_id: m.company_id,
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
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Memoria AI Personas — Cross Company</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vista super_admin: tutte le memorie delle 18 AI personas su TUTTE le aziende.
            Aggiornamento in tempo reale.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2" disabled={companies.length === 0}>
          <Plus className="h-4 w-4" />
          Aggiungi memoria
        </Button>
      </div>

      {/* Stats cross-company */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Memorie totali</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5">{stats.total}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {stats.manual} manuali · {stats.auto} auto
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Aziende attive</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5">{stats.companies}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">su {companies.length} totali</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Utilizzi totali</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5">{stats.hits}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">caricate nei prompt</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Top personas</div>
          <div className="space-y-0.5 mt-1">
            {stats.topPersonas.length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              stats.topPersonas.map(([key, n]) => (
                <div key={key} className="text-[11px] flex justify-between">
                  <span className="truncate">{personas.find((p) => p.persona_key === key)?.display_name ?? key}</span>
                  <span className="font-semibold tabular-nums ml-2">{n}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo memorie</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {Object.entries(stats.byType).filter(([, n]) => n > 0).map(([t, n]) => (
              <Badge key={t} variant="outline" className={cn("text-[10px] h-5 px-1.5", TYPE_LABEL[t as MemoryRow["memory_type"]].color)}>
                {TYPE_LABEL[t as MemoryRow["memory_type"]].label}: {n}
              </Badge>
            ))}
            {stats.total === 0 && <span className="text-xs text-muted-foreground">—</span>}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="h-9 w-56">
            <SelectValue placeholder="Tutte le aziende" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le aziende ({companies.length})</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPersona} onValueChange={setFilterPersona}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="Tutte le personas" />
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
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Cerca nel contenuto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Button
          variant={showDisabled ? "default" : "outline"}
          size="sm"
          onClick={() => setShowDisabled((v) => !v)}
          className="h-9 gap-1.5"
        >
          {showDisabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          Disabilitate
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : filteredMemories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nessuna memoria trovata con questi filtri.
            {filterCompany === "all" && filterPersona === "all" && filterType === "all" && !search && (
              <p className="mt-2">L'ecosistema è vuoto — nessuna AI persona ha ancora memorizzato nulla.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredMemories.map((m) => (
            <Card key={m.id} className={cn("transition-opacity", !m.enabled && "opacity-50")}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <Badge variant="outline" className={cn("text-[10px] h-5", TYPE_LABEL[m.memory_type].color)}>
                        {TYPE_LABEL[m.memory_type].label}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                        <Building2 className="h-2.5 w-2.5" />
                        {companyNameById.get(m.company_id) ?? m.company_id.slice(0, 8)}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] h-5">
                        {personas.find((p) => p.persona_key === m.persona_key)?.display_name ?? m.persona_key}
                      </Badge>
                      {m.confidence !== null && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          conf. {(m.confidence * 100).toFixed(0)}%
                        </Badge>
                      )}
                      {m.hits_count > 0 && (
                        <Badge variant="outline" className="text-[10px] h-5">
                          🔥 {m.hits_count} hit
                        </Badge>
                      )}
                      {m.source && m.source !== "user_explicit" && m.source !== "manual" && (
                        <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 text-amber-700">
                          auto · {m.source}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">{m.content}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => toggleMut.mutate({ id: m.id, enabled: !m.enabled })}
                      title={m.enabled ? "Disabilita" : "Riabilita"}
                    >
                      {m.enabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifica memoria" : "Nuova memoria (super_admin)"}</DialogTitle>
            <DialogDescription>
              {form.id ? "Aggiorna i campi della memoria." : "Aggiungi una nuova memoria per la persona AI scelta. Cross-company: seleziona l'azienda destinataria."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!form.id && (
              <div>
                <Label>Azienda</Label>
                <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleziona azienda…" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Persona</Label>
              <Select value={form.persona_key} onValueChange={(v) => setForm({ ...form, persona_key: v })}>
                <SelectTrigger><SelectValue placeholder="Seleziona persona…" /></SelectTrigger>
                <SelectContent>
                  {personas.map((p) => (
                    <SelectItem key={p.persona_key} value={p.persona_key}>{p.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.memory_type} onValueChange={(v) => setForm({ ...form, memory_type: v as MemoryRow["memory_type"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contenuto</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={3}
                placeholder="Es. 'Il cliente Bianchi Srl preferisce ricevere SAL mensili invece che bimestrali.'"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Confidence</Label>
                <Input
                  type="number" min={0} max={1} step={0.1}
                  value={form.confidence}
                  onChange={(e) => setForm({ ...form, confidence: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>Source</Label>
                <Input
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  placeholder="user_explicit"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annulla</Button>
            <Button
              onClick={() => upsertMut.mutate(form)}
              disabled={!form.company_id || !form.persona_key || !form.content.trim() || upsertMut.isPending}
            >
              {upsertMut.isPending ? "Salvataggio…" : (form.id ? "Aggiorna" : "Crea")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
