/**
 * AdminSettingsAIMemory — Gestione Memoria Silvio per tutte le aziende.
 * SOLO SuperAdmin. Selettore azienda + visualizzazione fatti + sintesi.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Brain, RefreshCw, Pencil, Trash2, Sparkles, Calendar, Tag, Bot, MessageSquare,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BrainFact {
  id: string;
  company_id: string;
  fact_key: string;
  fact_value: unknown;
  source: string;
  confidence: number;
  notes: string | null;
  updated_at: string;
}

interface ChatSummary {
  id: string;
  company_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  summary: string;
  topics: string[] | null;
  messages_count: number;
  created_at: string;
}

interface CompanyMini { id: string; name: string }

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: "Manuale", color: "bg-blue-100 text-blue-700" },
  auto_chat: { label: "Auto da chat", color: "bg-violet-100 text-violet-700" },
  auto: { label: "Automatico", color: "bg-emerald-100 text-emerald-700" },
  chat: { label: "Da conversazione", color: "bg-violet-100 text-violet-700" },
};

export default function AdminSettingsAIMemory() {
  const qc = useQueryClient();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [editingFact, setEditingFact] = useState<BrainFact | null>(null);
  const [factSearch, setFactSearch] = useState("");

  // Lista aziende con almeno un fatto / summary
  const { data: companies } = useQuery({
    queryKey: ["admin_silvio_memory_companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies" as never)
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as CompanyMini[];
    },
  });

  const { data: facts, isLoading: factsLoading } = useQuery({
    queryKey: ["admin_silvio_brain_facts", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase
        .from("ai_brain_facts" as never)
        .select("id, company_id, fact_key, fact_value, source, confidence, notes, updated_at")
        .eq("company_id", selectedCompanyId)
        .order("confidence", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BrainFact[];
    },
    enabled: !!selectedCompanyId,
  });

  const { data: summaries } = useQuery({
    queryKey: ["admin_silvio_chat_summaries", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const { data, error } = await supabase
        .from("ai_brain_chat_summaries" as never)
        .select("id, company_id, user_id, period_start, period_end, summary, topics, messages_count, created_at")
        .eq("company_id", selectedCompanyId)
        .order("period_end", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as ChatSummary[];
    },
    enabled: !!selectedCompanyId,
  });

  const filteredFacts = useMemo(() => {
    return (facts ?? []).filter(f =>
      !factSearch ||
      f.fact_key.toLowerCase().includes(factSearch.toLowerCase()) ||
      JSON.stringify(f.fact_value).toLowerCase().includes(factSearch.toLowerCase())
    );
  }, [facts, factSearch]);

  const extractMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("silvio-memory-extract", {
        body: { mode: "all", lookback_hours: 168 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      toast.success(`Estrazione globale: ${r.processed}/${r.total_targets} processati, +${r.facts_added_total} fatti`);
      qc.invalidateQueries({ queryKey: ["admin_silvio_brain_facts"] });
      qc.invalidateQueries({ queryKey: ["admin_silvio_chat_summaries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFactMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_brain_facts" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto eliminato");
      qc.invalidateQueries({ queryKey: ["admin_silvio_brain_facts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Alert>
        <Brain className="h-4 w-4" />
        <AlertDescription>
          <strong>Memoria Silvio (SuperAdmin)</strong> — Visualizza e gestisci la memoria long-term
          di Silvio per ogni azienda. I fatti sono iniettati nel system prompt al volo per
          rispondere con contesto. Solo SuperAdmin ha accesso (le aziende non vedono questi dati).
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona azienda…" />
            </SelectTrigger>
            <SelectContent>
              {(companies ?? []).map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          onClick={() => extractMut.mutate()}
          disabled={extractMut.isPending}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", extractMut.isPending && "animate-spin")} />
          {extractMut.isPending ? "Estraggo…" : "Trigger extraction globale"}
        </Button>
      </div>

      {!selectedCompanyId ? (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>Seleziona un'azienda per vedere la sua memoria Silvio.</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardHeader className="pb-2"><CardDescription>Fatti totali</CardDescription></CardHeader>
              <CardContent><div className="text-2xl font-bold">{facts?.length ?? "—"}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Confidence alta</CardDescription></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{(facts ?? []).filter(f => f.confidence >= 0.9).length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Sintesi chat</CardDescription></CardHeader>
              <CardContent><div className="text-2xl font-bold">{summaries?.length ?? "—"}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardDescription>Auto-estratti</CardDescription></CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(facts ?? []).filter(f => f.source.startsWith("auto")).length}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="facts" className="space-y-4">
            <TabsList>
              <TabsTrigger value="facts" className="gap-1.5">
                <Sparkles className="h-4 w-4" /> Fatti ({facts?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="summaries" className="gap-1.5">
                <MessageSquare className="h-4 w-4" /> Sintesi ({summaries?.length ?? 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="facts" className="space-y-3">
              <Input
                placeholder="Cerca chiave o valore…"
                value={factSearch}
                onChange={(e) => setFactSearch(e.target.value)}
                className="max-w-md"
              />
              {factsLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
              ) : !filteredFacts.length ? (
                <Alert>
                  <Bot className="h-4 w-4" />
                  <AlertDescription>Nessun fatto trovato per questa azienda.</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {filteredFacts.map(f => (
                    <Card key={f.id}>
                      <CardContent className="p-3 flex items-start gap-3">
                        <div className="rounded-md ring-1 ring-violet-200 bg-violet-50 p-2 shrink-0">
                          <Sparkles className="h-4 w-4 text-violet-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-mono font-semibold">{f.fact_key}</span>
                            <Badge className={cn("text-[10px]", SOURCE_LABELS[f.source]?.color ?? "bg-slate-100")}>
                              {SOURCE_LABELS[f.source]?.label ?? f.source}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">conf. {f.confidence.toFixed(2)}</Badge>
                          </div>
                          <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words font-mono">
                            {JSON.stringify(f.fact_value, null, 2)}
                          </pre>
                          {f.notes && (
                            <p className="text-[10px] text-muted-foreground mt-1 italic">📝 {f.notes}</p>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingFact(f)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            onClick={() => { if (confirm(`Eliminare "${f.fact_key}"?`)) deleteFactMut.mutate(f.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="summaries">
              {!summaries?.length ? (
                <Alert><MessageSquare className="h-4 w-4" /><AlertDescription>Nessuna sintesi.</AlertDescription></Alert>
              ) : (
                <div className="space-y-2">
                  {summaries.map(s => (
                    <Card key={s.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {new Date(s.period_start).toLocaleDateString("it-IT")} → {new Date(s.period_end).toLocaleDateString("it-IT")}
                          </span>
                          <Badge variant="outline" className="text-[10px]">{s.messages_count} msg</Badge>
                        </div>
                        <p className="text-sm">{s.summary}</p>
                        {s.topics && s.topics.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {s.topics.map((t, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">
                                <Tag className="h-2.5 w-2.5 mr-1" />{t}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {editingFact && (
        <EditFactDialog fact={editingFact} onClose={() => setEditingFact(null)} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

function EditFactDialog({ fact, onClose }: { fact: BrainFact; onClose: () => void }) {
  const qc = useQueryClient();
  const [valueText, setValueText] = useState(JSON.stringify(fact.fact_value, null, 2));
  const [notes, setNotes] = useState(fact.notes ?? "");

  const mut = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try { parsed = JSON.parse(valueText); }
      catch { parsed = valueText; }
      const { error } = await supabase
        .from("ai_brain_facts" as never)
        .update({ fact_value: parsed, notes: notes || null, source: "manual", confidence: 1.0 })
        .eq("id", fact.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto aggiornato");
      qc.invalidateQueries({ queryKey: ["admin_silvio_brain_facts"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifica fatto: {fact.fact_key}</DialogTitle>
          <DialogDescription>Salvato come "manuale" (confidence 1.0).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Valore (JSON)</label>
            <Textarea rows={6} value={valueText} onChange={(e) => setValueText(e.target.value)} className="font-mono text-xs" />
          </div>
          <div>
            <label className="text-sm font-medium">Note</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note opzionali" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Salvo…" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
