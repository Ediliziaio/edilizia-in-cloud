import { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calculateDealHealth, buildDealHealthInput } from "@/lib/dealHealthScore";
import { CheckCircle, AlertTriangle, XCircle, Skull } from "lucide-react";
import { salesOSKeys } from "@/hooks/useSalesOS";
import { Ciambella } from "@/components/charts/grafici/Ciambella";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface DealHealthOverviewProps {
  companyId: string;
  /** Sales OS può guardare una pipeline sola: la salute segue la stessa scelta. */
  pipelineId?: string;
}

export const DealHealthOverview = memo(function DealHealthOverview({ companyId, pipelineId }: DealHealthOverviewProps) {
  const t = useT();
  const { data: opportunities } = useQuery({
    queryKey: [...salesOSKeys.all, 'deal-health', companyId, pipelineId ?? 'tutte'],
    enabled: !!companyId,
    queryFn: async () => {
      // Tutte le aperte e non cancellate: PostgREST ne dà al massimo 1000 per
      // chiamata, e prima le cancellate contavano e oltre le mille si perdeva
      // il resto. Le note si contano nel database come sulle schede del kanban:
      // senza, ogni trattativa perdeva 10 punti per «meno di 2 contatti registrati».
      const righe: any[] = [];
      for (let da = 0; da < 20_000; da += 1000) {
        let query = supabase
          .from('marketing_opportunities')
          .select('id, contact_id, updated_at, last_activity_at, stage_changed_at, next_action, expected_close_date, probability, created_at, contact:marketing_contacts(is_decision_maker), marketing_contact_notes(count)')
          .eq('company_id', companyId)
          .eq('status', 'open')
          .is('deleted_at', null);
        if (pipelineId) query = query.eq('pipeline_id', pipelineId);
        const { data, error } = await query.order('id').range(da, da + 999);
        if (error) throw error;
        righe.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      // 14/11/2026: l'ultima attività e il numero di contatti come la scheda «Ferme»
      // (get_stalled_opportunities): le attività del contatto, non solo le note
      // dell'opportunità (1 nota su 860 attività su Demo 2), e niente updated_at,
      // che cambia a ogni modifica della scheda.
      const contatti = [...new Set(righe.map((r) => r.contact_id).filter(Boolean))] as string[];
      const attivita = new Map<string, { n: number; ultima: string | null }>();
      for (let i = 0; i < contatti.length; i += 200) {
        for (let da = 0; da < 50_000; da += 1000) {
          const { data, error } = await supabase
            .from('marketing_contact_activities')
            .select('contact_id, created_at')
            .eq('company_id', companyId)
            .in('contact_id', contatti.slice(i, i + 200))
            .order('id')
            .range(da, da + 999);
          if (error) throw error;
          for (const a of data ?? []) {
            const v = attivita.get(a.contact_id) ?? { n: 0, ultima: null };
            v.n += 1;
            if (!v.ultima || a.created_at > v.ultima) v.ultima = a.created_at;
            attivita.set(a.contact_id, v);
          }
          if (!data || data.length < 1000) break;
        }
      }
      return righe.map((r) => {
        const a = r.contact_id ? attivita.get(r.contact_id) : undefined;
        const date = [a?.ultima, r.last_activity_at, r.stage_changed_at, r.created_at].filter(Boolean) as string[];
        return {
          ...r,
          last_activity_at: date.length ? date.reduce((x, y) => (y > x ? y : x)) : null,
          attivita_contatto: a?.n ?? 0,
        };
      });
    },
    staleTime: 1000 * 60 * 5,
  });

  const counts = useMemo(() => {
    const c = { healthy: 0, at_risk: 0, critical: 0, dead: 0 };
    if (!opportunities) return c;
    for (const opp of opportunities) {
      const oppRec = opp as typeof opp & {
        contact?: { is_decision_maker?: boolean } | { is_decision_maker?: boolean }[] | null;
        marketing_contact_notes?: { count?: number | null }[] | null;
      };
      const contact = Array.isArray(oppRec.contact) ? oppRec.contact[0] : oppRec.contact;
      const input = buildDealHealthInput({
        ...opp,
        notes_count: (oppRec.marketing_contact_notes?.[0]?.count ?? 0) + (opp.attivita_contatto ?? 0),
        contact_is_decision_maker: contact?.is_decision_maker ?? null,
      });
      const health = calculateDealHealth(input);
      c[health.status]++;
    }
    return c;
  }, [opportunities]);

  const total = counts.healthy + counts.at_risk + counts.critical + counts.dead;
  if (total === 0) return null;

  const items = [
    { label: t("In salute"), count: counts.healthy, icon: CheckCircle, bgClass: 'bg-emerald-50 dark:bg-emerald-950/20', iconClass: 'text-emerald-600', valueClass: 'text-emerald-700 dark:text-emerald-400' },
    { label: t("A rischio"), count: counts.at_risk, icon: AlertTriangle, bgClass: 'bg-amber-50 dark:bg-amber-950/20', iconClass: 'text-amber-600', valueClass: 'text-amber-700 dark:text-amber-400' },
    { label: t("Critici"), count: counts.critical, icon: XCircle, bgClass: 'bg-red-50 dark:bg-red-950/20', iconClass: 'text-red-600', valueClass: 'text-red-700 dark:text-red-400' },
    { label: t("Da recuperare"), count: counts.dead, icon: Skull, bgClass: 'bg-slate-100 dark:bg-slate-900/30', iconClass: 'text-slate-500', valueClass: 'text-slate-700 dark:text-slate-400' },
  ];

  // 14/11/2026: da computer una ciambella con la quota di ogni stato accanto ai
  // quattro numeri; al telefono restano i quattro numeri in una riga.
  const COLORI = ['hsl(142 64% 40%)', 'hsl(38 92% 50%)', 'hsl(0 72% 51%)', 'hsl(215 16% 47%)'];
  const daSistemare = counts.critical + counts.dead;
  return (
    <>
    <div className="grid grid-cols-4 gap-1.5 sm:hidden">
      {items.map((item) => (
        <div key={item.label} className={`flex flex-col items-center rounded-lg px-1 py-2 ${item.bgClass}`}>
          <span className={`text-lg font-bold leading-tight ${item.valueClass}`}>{item.count}</span>
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
    <div className="grid gap-4 rounded-2xl border bg-card p-4 shadow-sm max-sm:hidden lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div>
        <p className="text-sm font-semibold text-foreground">{t("Salute delle trattative aperte")}</p>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("{n} aperte ·", { n: total })} {daSistemare > 0 ? t("{n} da riprendere", { n: daSistemare }) : t("nessuna critica")}
        </p>
        <Ciambella
          titolo={t("Salute delle trattative")}
          etichettaCentro="Aperte"
          dimensione={130}
          formato={(v) => String(v)}
          formatoCentro={(v) => String(v)}
          fette={items.map((item, i) => ({ nome: item.label, valore: item.count, colore: COLORI[i] }))}
        />
      </div>
      <div className="grid grid-cols-2 content-center gap-3 md:grid-cols-4 lg:grid-cols-2">
        {items.map((item) => (
          <div key={item.label} className={`flex items-center gap-3 rounded-xl p-3 ${item.bgClass}`}>
            <item.icon className={`h-5 w-5 shrink-0 ${item.iconClass}`} />
            <div className="min-w-0">
              <p className={`text-2xl font-bold leading-none tabular-nums ${item.valueClass}`}>{item.count}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.label} · {Math.round((item.count / total) * 100)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  );
});
