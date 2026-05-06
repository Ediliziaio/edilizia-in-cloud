/**
 * SilvioMemoryPanel — Visualizza e gestisci la memoria long-term di Silvio
 * (fatti aziendali + sintesi conversazioni).
 *
 * Funzionalità:
 *   - Lista fatti con confidence + source
 *   - Edit valore / Elimina fatto
 *   - Trigger re-extraction manuale
 *   - Lista sintesi chat ultime
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
import { toast } from "sonner";
import {
  Brain, RefreshCw, Pencil, Trash2, Sparkles, Calendar, Tag, Bot, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BrainFact {
  id: string;
  fact_key: string;
  fact_value: unknown;
  source: string;
  confidence: number;
  notes: string | null;
  updated_at: string;
}

interface ChatSummary {
  id: string;
  period_start: string;
  period_end: string;
  summary: string;
  topics: string[] | null;
  key_facts: unknown[] | null;
  messages_count: number;
  created_at: string;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  manual: { label: "Manuale", color: "bg-blue-100 text-blue-700" },
  auto_chat: { label: "Auto da chat", color: "bg-violet-100 text-violet-700" },
  auto: { label: "Automatico", color: "bg-emerald-100 text-emerald-700" },
  chat: { label: "Da conversazione", color: "bg-violet-100 text-violet-700" },
};

export default function SilvioMemoryPanel() {
  const qc = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [editingFact, setEditingFact] = useState<BrainFact | null>(null);

  const { data: facts, isLoading: factsLoading } = useQuery({
    queryKey: ["silvio_brain_facts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("ai_brain_facts" as never)
        .select("id, fact_key, fact_value, source, confidence, notes, updated_at")
        .eq("company_id", companyId)
        .order("confidence", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BrainFact[];
    },
    enabled: !!companyId,
  });

  const { data: summaries, isLoading: summariesLoading } = useQuery({
    queryKey: ["silvio_chat_summaries", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("ai_brain_chat_summaries" as never)
        .select("id, period_start, period_end, summary, topics, key_facts, messages_count, created_at")
        .order("period_end", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as ChatSummary[];
    },
    enabled: !!companyId,
  });

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
      toast.success(`Estrazione completata: +${r.facts_added_total ?? 0} fatti`);
      qc.invalidateQueries({ queryKey: ["silvio_brain_facts"] });
      qc.invalidateQueries({ queryKey: ["silvio_chat_summaries"] });
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
      qc.invalidateQueries({ queryKey: ["silvio_brain_facts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <Alert>
        <Brain className="h-4 w-4" />
        <AlertDescription>
          <strong>Memoria di Silvio</strong> — Fatti persistenti che Silvio usa per contestualizzare
          le risposte. Estratti automaticamente dalle conversazioni o aggiunti manualmente. Più
          fatti = più Silvio diventa preciso e personalizzato.
        </AlertDescription>
      </Alert>

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

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => extractMut.mutate()}
          disabled={extractMut.isPending}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", extractMut.isPending && "animate-spin")} />
          {extractMut.isPending ? "Estraggo dalla chat…" : "Aggiorna memoria dalla chat"}
        </Button>
      </div>

      <Tabs defaultValue="facts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="facts" className="gap-1.5"><Sparkles className="h-4 w-4" /> Fatti ({facts?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="summaries" className="gap-1.5"><MessageSquare className="h-4 w-4" /> Sintesi ({summaries?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="facts">
          {factsLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : !facts || facts.length === 0 ? (
            <Alert>
              <Bot className="h-4 w-4" />
              <AlertDescription>
                Nessun fatto in memoria ancora. Chatta con Silvio per popolarla, o clicca
                <strong> "Aggiorna memoria dalla chat"</strong> sopra.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-2">
              {facts.map(f => (
                <Card key={f.id} className="hover:shadow-sm transition">
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className="rounded-md ring-1 ring-violet-200 bg-violet-50 p-2 shrink-0">
                      <Sparkles className="h-4 w-4 text-violet-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-semibold">{f.fact_key}</span>
                        <Badge className={cn("text-[10px]", SOURCE_LABELS[f.source]?.color ?? "bg-slate-100 text-slate-700")}>
                          {SOURCE_LABELS[f.source]?.label ?? f.source}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          conf. {f.confidence.toFixed(2)}
                        </Badge>
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
                        onClick={() => { if (confirm(`Eliminare il fatto "${f.fact_key}"?`)) deleteFactMut.mutate(f.id); }}
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
          {summariesLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : !summaries || summaries.length === 0 ? (
            <Alert>
              <MessageSquare className="h-4 w-4" />
              <AlertDescription>Nessuna sintesi salvata. Vengono create automaticamente di notte.</AlertDescription>
            </Alert>
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
      try {
        parsed = JSON.parse(valueText);
      } catch {
        parsed = valueText; // fallback: stringa semplice
      }
      const { error } = await supabase
        .from("ai_brain_facts" as never)
        .update({ fact_value: parsed, notes: notes || null, source: "manual", confidence: 1.0 })
        .eq("id", fact.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fatto aggiornato");
      qc.invalidateQueries({ queryKey: ["silvio_brain_facts"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifica fatto: {fact.fact_key}</DialogTitle>
          <DialogDescription>Aggiorna il valore o le note. Sarà salvato come "manuale" (confidence 1.0).</DialogDescription>
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
