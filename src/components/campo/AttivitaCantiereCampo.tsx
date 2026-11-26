/**
 * «Le tue attività qui» nella pagina del cantiere (26/11/2026, richiesta del founder: vedere nella commessa le cose
 * da fare, oltre alle istruzioni dell'ufficio). Le attività assegnate a me su questo cantiere non ancora finite
 * (tasks, le stesse della pagina Attività), da spuntare con un tocco; per la ditta subappaltatrice anche gli
 * ordini di servizio aperti su questo cantiere. Senza niente da fare non occupa posto.
 */
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CheckSquare, Circle, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { cn } from "@/lib/utils";
import { dateFnsCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

interface Attivita { id: string; title: string; due_date: string | null; status: string; priority: string | null }
interface OrdineAperto { id: string; titolo: string; tipo: string; scadenza: string | null }

export function AttivitaCantiereCampo({ orderId, oggi }: { orderId: string; oggi: string }) {
  const t = useT();
  const { user, profile } = useAuth();
  const { isSubappaltatore } = useIsCampo();
  const qc = useQueryClient();
  const companyId = profile?.company_id ?? null;
  const attivita = useQuery({
    queryKey: ["campo-attivita-cantiere", orderId, user?.id],
    enabled: !!user?.id && !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<Attivita[]> => {
      const { data, error } = await supabase.from("tasks").select("id, title, due_date, status, priority")
        .eq("company_id", companyId!).eq("assigned_to", user!.id).eq("order_id", orderId).neq("status", "completata")
        .order("due_date", { ascending: true, nullsFirst: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as Attivita[];
    },
  });
  const ordini = useQuery({
    queryKey: ["campo-ordini-servizio-cantiere", orderId, user?.id],
    enabled: isSubappaltatore && !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<OrdineAperto[]> => {
      const { data, error } = await (supabase as unknown as { from: (t: "ordini_servizio_ditte") => any }).from("ordini_servizio_ditte")
        .select("id, titolo, tipo, scadenza").eq("order_id", orderId).in("stato", ["inviato", "letto", "riaperto"]).limit(20);
      if (error) throw error;
      return (data ?? []) as OrdineAperto[];
    },
  });
  const fatta = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").update({ status: "completata", completed_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    // La riga sparisce subito al tocco (sul cantiere la rete è lenta); se il salvataggio fallisce torna.
    onMutate: async (id: string) => {
      const chiave = ["campo-attivita-cantiere", orderId, user?.id];
      await qc.cancelQueries({ queryKey: chiave });
      const prima = qc.getQueryData<Attivita[]>(chiave);
      qc.setQueryData<Attivita[]>(chiave, (vecchie) => (vecchie ?? []).filter((a) => a.id !== id));
      return { chiave, prima };
    },
    onSuccess: () => {
      toast.success(t("Fatto"));
      void qc.invalidateQueries({ queryKey: ["campo-attivita"] });
    },
    onError: (_e, _id, ctx) => {
      if (ctx) qc.setQueryData(ctx.chiave, ctx.prima);
      toast.error(t("Non sono riuscito a salvare: riprova."));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["campo-attivita-cantiere", orderId] }),
  });

  const lista = attivita.data ?? [];
  const aperti = ordini.data ?? [];
  if (!lista.length && !aperti.length) return null;
  const quando = (d: string) => format(parseISO(d), "d MMM", { locale: dateFnsCampo() });

  return (
    <section aria-labelledby="attivita-cantiere" className="space-y-2 rounded-2xl border bg-background p-3 shadow-sm">
      <h2 id="attivita-cantiere" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <CheckSquare className="size-4 text-primary" aria-hidden="true" />{t("Le tue attività qui")}
      </h2>
      {lista.length > 0 && (
        <ul className="divide-y">
          {lista.map(a => {
            const scaduta = !!a.due_date && a.due_date < oggi;
            return (
              <li key={a.id} className="flex items-center gap-2 py-1.5">
                <button type="button" onClick={() => fatta.mutate(a.id)} aria-label={t("Segna fatta: {titolo}", { titolo: a.title })}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full active:bg-muted">
                  <Circle className="size-5 text-muted-foreground" aria-hidden="true" />
                </button>
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block text-sm font-medium">{a.title}</span>
                  {a.due_date && <span className={cn("block text-xs", scaduta ? "font-semibold text-red-700" : "text-muted-foreground")}>
                    {scaduta ? t("Scaduta il {data}", { data: quando(a.due_date) }) : t("Entro il {data}", { data: quando(a.due_date) })}
                  </span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {aperti.length > 0 && (
        <Link to="/campo/ordini-servizio" className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <ClipboardList className="size-4 shrink-0 text-amber-800" aria-hidden="true" />
          <span className="min-w-0 flex-1">{aperti.length === 1 ? t("1 ordine dall'impresa da chiudere") : t("{n} ordini dall'impresa da chiudere", { n: aperti.length })}</span>
        </Link>
      )}
      <Link to="/campo/attivita" className="block text-xs font-semibold text-primary">{t("Tutte le mie attività")}</Link>
    </section>
  );
}
