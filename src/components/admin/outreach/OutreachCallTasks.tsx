import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Task chiamate — i promemoria generati dai nodi 'call' delle sequenze. Un nodo
 * call non invia nulla: crea qui una riga da lavorare (chiama il contatto). Il
 * commerciale la segna "fatta" o la salta. Lista dei pending, la più vecchia in
 * cima. RLS super_admin (outreach_call_tasks).
 */

interface CallTask {
  id: string;
  contact_id: string | null;
  phone: string | null;
  contact_name: string | null;
  company_name: string | null;
  note: string | null;
  due_at: string;
  created_at: string;
}

export function OutreachCallTasks({ companyId, focusId }: { companyId: string; focusId?: string }) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["outreach-call-tasks", companyId, focusId],
    staleTime: 30_000,
    queryFn: async () => {
      // tabella non nei tipi generati → cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query = (supabase as any)
        .from("outreach_call_tasks")
        .select("id,contact_id,phone,contact_name,company_name,note,due_at,created_at")
        .eq("company_id", companyId)
        .eq("status", "pending");
      if (focusId && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(focusId)) return [];
      const { data, error } = await (focusId
        ? query.eq("id", focusId).limit(1)
        : query.order("due_at", { ascending: true }).limit(100));
      if (error) throw error;
      return (data ?? []) as CallTask[];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "done" | "skipped" }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("outreach_call_tasks")
        .update({ status, done_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId)
        .eq("status", "pending");
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["outreach-call-tasks", companyId] });
      qc.invalidateQueries({ queryKey: ["outreach-oggi", companyId] });
      toast.success(v.status === "done" ? "Chiamata segnata come fatta" : "Task saltato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const tasks = q.data ?? [];
  const fmt = (n: number) => n.toLocaleString("it-IT");

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-400">
          <Phone className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">{focusId ? "Chiamata da fare" : "Task chiamate"}</h3>
          <p className="text-xs text-muted-foreground">Promemoria dai nodi “Chiamata” delle sequenze</p>
        </div>
        {q.data && tasks.length > 0 && (
          <Badge variant="secondary" className="shrink-0 tabular-nums">{fmt(tasks.length)} da fare</Badge>
        )}
        {focusId && <Button asChild size="sm" variant="ghost"><Link to="/admin/marketing?tab=lead">Tutte le chiamate</Link></Button>}
      </header>

      <div className="p-4">
        {q.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : q.isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <p className="text-sm font-medium">Errore nel caricamento dei task</p>
            <Button size="sm" variant="outline" onClick={() => q.refetch()}>Riprova</Button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <Phone className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            <p className="text-sm font-medium">{focusId ? "Chiamata già gestita o non disponibile" : "Nessuna chiamata in coda"}</p>
            {!focusId && <p className="mt-1 text-xs text-muted-foreground">
              Aggiungi un nodo “Chiamata” a una sequenza (Builder visuale): i promemoria compaiono qui.
            </p>}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {tasks.map((t) => {
              const name = t.contact_name || "Contatto";
              return (
                <div key={t.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-sm font-medium">{name}</span>
                      {t.company_name && <span className="truncate text-xs text-muted-foreground">· {t.company_name}</span>}
                    </div>
                    {t.phone && (
                      <a href={`tel:${t.phone}`} className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                        <Phone className="h-3 w-3" /> {t.phone}
                      </a>
                    )}
                    {t.note && <p className="mt-1 line-clamp-2 text-[11px] leading-tight text-muted-foreground">{t.note}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs text-emerald-700"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: t.id, status: "done" })}
                    >
                      <Check className="h-3.5 w-3.5" /> Fatta
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                      title="Salta"
                      aria-label="Salta chiamata"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: t.id, status: "skipped" })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
