/**
 * SilvioProgrammatePanel — "Attività programmate" di Silvio.
 * Mostra i promemoria/follow-up datati (silvio_reminders, status='pending'):
 * crea, completa, annulla. Alla data, il cron li promuove ad alert (campanella
 * + briefing). Sola lettura company-scoped via RLS; create via RPC SECURITY DEFINER.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarClock, Check, X, Plus, Loader2 } from "lucide-react";

interface Reminder {
  id: string;
  title: string;
  note: string | null;
  remind_on: string;
  status: string;
}

export function SilvioProgrammatePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const [titolo, setTitolo] = useState("");
  const [data, setData] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ["silvio-reminders", companyId],
    enabled: !!companyId && open,
    staleTime: 30_000,
    queryFn: async (): Promise<Reminder[]> => {
      const { data, error } = await supabase
        .from("silvio_reminders" as never)
        .select("id, title, note, remind_on, status")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .order("remind_on", { ascending: true })
        .limit(100);
      if (error) return [];
      return (data ?? []) as unknown as Reminder[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("silvio_tool_crea_promemoria" as never, {
        p_company_id: companyId,
        p_user_id: user?.id ?? null,
        p_title: titolo.trim(),
        p_remind_on: data || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setTitolo("");
      setData("");
      qc.invalidateQueries({ queryKey: ["silvio-reminders", companyId] });
      toast.success("Promemoria creato");
    },
    onError: (e: Error) => toast.error("Creazione fallita", { description: e.message }),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("silvio_reminders" as never).update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["silvio-reminders", companyId] }),
    onError: (e: Error) => toast.error("Operazione fallita", { description: e.message }),
  });

  const fmt = (d: string) => {
    try {
      return new Date(`${d}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return d;
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-orange-500" /> Attività programmate
          </SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-xs text-muted-foreground">
          Promemoria e follow-up datati. Alla scadenza riappaiono come avviso (campanella + briefing).
        </p>

        {/* Nuovo promemoria */}
        <div className="mt-4 rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="text-xs font-medium text-slate-600">Nuovo promemoria</div>
          <Input value={titolo} onChange={(e) => setTitolo(e.target.value)} placeholder="Es. Ricontrollare pagamento Rossi" />
          <div className="flex gap-2">
            <Input type="date" value={data} min={today} onChange={(e) => setData(e.target.value)} className="flex-1" />
            <Button className="gap-1.5" disabled={!titolo.trim() || !data || createMut.isPending} onClick={() => createMut.mutate()}>
              {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Aggiungi
            </Button>
          </div>
        </div>

        {/* Lista */}
        <div className="mt-4 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : reminders.length === 0 ? (
            <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nessuna attività programmata. Aggiungi un promemoria o chiedi a Silvio "ricordami…".
            </div>
          ) : (
            reminders.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">{r.title}</div>
                    {r.note && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.note}</div>}
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-orange-600">
                      <CalendarClock className="h-3 w-3" /> {fmt(r.remind_on)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => statusMut.mutate({ id: r.id, status: "done" })} title="Segna come fatto"
                      className="rounded-md p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"><Check className="h-4 w-4" /></button>
                    <button onClick={() => statusMut.mutate({ id: r.id, status: "cancelled" })} title="Annulla"
                      className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default SilvioProgrammatePanel;
