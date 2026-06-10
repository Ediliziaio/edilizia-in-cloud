/**
 * KbQaTestsTab — Ground truth Q&A regression tests per la KB.
 *
 * Funzionalità:
 *   - CRUD Q&A pairs (question, expected, must_cite, forbidden_phrases)
 *   - Run all / run single via edge function kb-qa-test-runner (embedding reale)
 *   - Visualizza risultati ultimo run con pass rate aggregato
 *   - Filter per status (ok/ko/never_run/error)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Play, Plus, CheckCircle2, XCircle, Clock, AlertCircle, Trash2, Pencil, RefreshCw,
} from "lucide-react";

interface QaPair {
  id: string;
  question: string;
  expected_answer: string;
  must_cite_doc_ids: string[] | null;
  forbidden_phrases: string[] | null;
  category: string | null;
  min_similarity: number;
  last_status: "never_run" | "ok" | "ko" | "stale" | "error";
  last_run_at: string | null;
  last_run_details: Record<string, unknown> | null;
  enabled: boolean;
  created_at: string;
}

const STATUS_CFG: Record<QaPair["last_status"], { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  ok:         { label: "Pass",   color: "border-emerald-300 text-emerald-700 bg-emerald-50", icon: CheckCircle2 },
  ko:         { label: "Fail",   color: "border-rose-300 text-rose-700 bg-rose-50",          icon: XCircle },
  error:      { label: "Errore", color: "border-amber-300 text-amber-700 bg-amber-50",       icon: AlertCircle },
  never_run:  { label: "Mai eseguito", color: "border-muted text-muted-foreground",          icon: Clock },
  stale:      { label: "Stale",  color: "border-muted text-muted-foreground",                icon: Clock },
};

export function KbQaTestsTab() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [editPair, setEditPair] = useState<QaPair | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [running, setRunning] = useState(false);

  const { data: pairs, isLoading } = useQuery({
    queryKey: ["admin-kb-qa-pairs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_kb_qa_pairs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as QaPair[];
    },
  });

  const runAllMutation = useMutation({
    mutationFn: async () => {
      setRunning(true);
      const { data, error } = await supabase.functions.invoke("kb-qa-test-runner", {
        body: { run_all: true, top_k: 5 },
      });
      if (error) throw error;
      return data as {
        results: Array<{ qa_pair_id: string; status: string; question: string }>;
        summary: { total: number; ok: number; ko: number; error: number; pass_rate: number };
      };
    },
    onSuccess: (data) => {
      const s = data.summary;
      toast.success(`Test completati: ${s.ok}/${s.total} pass (${s.pass_rate}%)`, {
        description: s.ko + s.error > 0 ? `${s.ko} fail, ${s.error} errori` : "Tutti i test sono passati 🎉",
      });
      queryClient.invalidateQueries({ queryKey: ["admin-kb-qa-pairs"] });
    },
    onError: (e) => toast.error("Errore esecuzione test", { description: String(e) }),
    onSettled: () => setRunning(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_kb_qa_pairs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Q&A pair eliminato");
      queryClient.invalidateQueries({ queryKey: ["admin-kb-qa-pairs"] });
    },
  });

  const summary = pairs ? {
    total: pairs.length,
    ok: pairs.filter((p) => p.last_status === "ok").length,
    ko: pairs.filter((p) => p.last_status === "ko").length,
    error: pairs.filter((p) => p.last_status === "error").length,
    never_run: pairs.filter((p) => p.last_status === "never_run").length,
  } : null;

  const passRate = summary && summary.total > 0
    ? Math.round((summary.ok / summary.total) * 100)
    : null;

  return (
    <div className="space-y-4">
      {/* Header + run button */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Q&A Regression Tests</h3>
          <p className="text-xs text-muted-foreground">
            Ground truth: domande con risposta attesa per verificare che la KB risponda correttamente.
            Esegui dopo ogni modifica significativa.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreate(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Nuovo
          </Button>
          <Button
            size="sm"
            onClick={() => runAllMutation.mutate()}
            disabled={running || !pairs?.length}
          >
            {running ? (
              <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1.5" />
            )}
            Esegui tutti
          </Button>
        </div>
      </div>

      {/* Summary */}
      {summary && summary.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <SummaryCard label="Totali" value={summary.total} />
          <SummaryCard label="Pass" value={summary.ok} tone="emerald" />
          <SummaryCard label="Fail" value={summary.ko} tone={summary.ko > 0 ? "rose" : "muted"} />
          <SummaryCard label="Errori" value={summary.error} tone={summary.error > 0 ? "amber" : "muted"} />
          <SummaryCard
            label="Pass rate"
            value={passRate !== null ? `${passRate}%` : "—"}
            tone={passRate && passRate >= 80 ? "emerald" : passRate && passRate >= 50 ? "amber" : "rose"}
          />
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : !pairs || pairs.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Nessun Q&A pair configurato. Crea il primo per iniziare a testare la KB.
            </p>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Crea primo Q&A
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pairs.map((p) => {
            const cfg = STATUS_CFG[p.last_status];
            const Icon = cfg.icon;
            return (
              <Card key={p.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className={`${cfg.color} shrink-0 mt-0.5`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {cfg.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{p.question}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        Atteso: {p.expected_answer}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] text-muted-foreground">
                        {p.category && <span>📂 {p.category}</span>}
                        {p.must_cite_doc_ids && p.must_cite_doc_ids.length > 0 && (
                          <span>🔗 {p.must_cite_doc_ids.length} must-cite</span>
                        )}
                        {p.forbidden_phrases && p.forbidden_phrases.length > 0 && (
                          <span>🚫 {p.forbidden_phrases.length} forbidden</span>
                        )}
                        {p.last_run_at && (
                          <span>⏱ {new Date(p.last_run_at).toLocaleString("it-IT")}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditPair(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={async () => {
                          if (await confirm({
                            title: `Eliminare il Q&A "${p.question.slice(0, 50)}…"?`,
                            confirmLabel: "Elimina",
                            variant: "destructive",
                          })) {
                            deleteMutation.mutate(p.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {(editPair || showCreate) && (
        <QaPairDialog
          pair={editPair}
          onClose={() => {
            setEditPair(null);
            setShowCreate(false);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-kb-qa-pairs"] });
            setEditPair(null);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "emerald" | "rose" | "amber" | "muted";
}) {
  const colorMap: Record<string, string> = {
    default: "",
    emerald: "text-emerald-600",
    rose: "text-rose-600",
    amber: "text-amber-600",
    muted: "text-muted-foreground",
  };
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-0.5 ${colorMap[tone]}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function QaPairDialog({
  pair,
  onClose,
  onSaved,
}: {
  pair: QaPair | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [question, setQuestion] = useState(pair?.question ?? "");
  const [expectedAnswer, setExpectedAnswer] = useState(pair?.expected_answer ?? "");
  const [category, setCategory] = useState(pair?.category ?? "");
  const [forbiddenPhrasesText, setForbiddenPhrasesText] = useState(
    (pair?.forbidden_phrases ?? []).join("\n")
  );
  const [minSimilarity, setMinSimilarity] = useState(String(pair?.min_similarity ?? 0.30));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const forbidden = forbiddenPhrasesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        question,
        expected_answer: expectedAnswer,
        category: category || null,
        forbidden_phrases: forbidden,
        min_similarity: Number(minSimilarity) || 0.30,
        enabled: true,
      };

      if (pair) {
        const { error } = await supabase
          .from("ai_kb_qa_pairs")
          .update(payload)
          .eq("id", pair.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ai_kb_qa_pairs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(pair ? "Q&A aggiornato" : "Q&A creato");
      onSaved();
    },
    onError: (e) => toast.error("Errore salvataggio", { description: String(e) }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{pair ? "Modifica Q&A" : "Nuovo Q&A test"}</DialogTitle>
          <DialogDescription>
            La domanda viene embeddata e cercata nella KB. Il test passa se almeno uno
            dei doc attesi è nei top-k risultati e nessuna frase proibita è presente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Domanda *</Label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Es: Qual è l'aliquota IVA standard?"
            />
          </div>
          <div>
            <Label className="text-xs">Risposta attesa (per riferimento manuale)</Label>
            <Textarea
              value={expectedAnswer}
              onChange={(e) => setExpectedAnswer(e.target.value)}
              placeholder="Es: L'aliquota IVA standard in Italia è 22%."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Categoria</Label>
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Es: fiscale"
              />
            </div>
            <div>
              <Label className="text-xs">Min similarity (0–1)</Label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={minSimilarity}
                onChange={(e) => setMinSimilarity(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Frasi proibite (una per riga)</Label>
            <Textarea
              value={forbiddenPhrasesText}
              onChange={(e) => setForbiddenPhrasesText(e.target.value)}
              placeholder="Una frase per riga&#10;Es: 20%&#10;Es: aliquota ridotta"
              rows={3}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Se uno di questi termini compare nei chunks recuperati, il test fallisce.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!question.trim() || !expectedAnswer.trim()}>
            {pair ? "Salva" : "Crea"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
