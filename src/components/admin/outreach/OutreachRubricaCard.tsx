import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  AnalyticsDashboardCard,
  DashboardStatCard,
  DashboardStatGrid,
  DashboardListRows,
  DashboardInsight,
} from "@/components/ui/analytics-dashboard";
import { Users, ListChecks } from "lucide-react";

/**
 * Rubrica & deliverability come mini-dashboard interattiva (analytics-dashboard):
 * anello = % della rubrica contattabile via email, tab Panoramica / Liste top /
 * Insight con i numeri VERI (stesse queryKey dei contatori del cockpit → cache
 * condivisa, nessuna richiesta doppia; liste dalla RPC outreach_tag_counts).
 * Sostituisce la vecchia griglia di 4 KPI statici.
 */

const LIST_DOT_COLORS = ["bg-orange-500", "bg-amber-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500"];

async function safeCount(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

interface TagList { tag: string; total: number; contactable: number }

export function OutreachRubricaCard({ companyId }: { companyId: string }) {
  const navigate = useNavigate();

  const contacts = useQuery({
    queryKey: ["outreach-count", "contacts", companyId],
    staleTime: 60_000,
    queryFn: () => safeCount(supabase.from("marketing_contacts").select("*", { count: "exact", head: true }).eq("company_id", companyId)),
  });
  const contactable = useQuery({
    queryKey: ["outreach-count", "contactable", companyId],
    staleTime: 60_000,
    queryFn: () =>
      safeCount(
        supabase.from("marketing_contacts").select("*", { count: "exact", head: true })
          .eq("company_id", companyId).eq("optout_email", false)
          .not("email", "is", null).neq("email", ""),
      ),
  });
  const suppressed = useQuery({
    queryKey: ["outreach-count", "suppressed", companyId],
    staleTime: 60_000,
    queryFn: () => safeCount(supabase.from("email_suppressions").select("*", { count: "exact", head: true }).eq("company_id", companyId)),
  });
  const campaigns = useQuery({
    queryKey: ["outreach-count", "campaigns"],
    staleTime: 60_000,
    queryFn: () => safeCount(supabase.from("crm_campaigns").select("*", { count: "exact", head: true })),
  });
  // Liste per tag: stessa RPC/chiave di OutreachLists → cache condivisa.
  const lists = useQuery({
    queryKey: ["outreach-lists", companyId],
    staleTime: 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("outreach_tag_counts", { p_company_id: companyId });
      if (error) throw error;
      return data ?? {};
    },
  });

  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("it-IT"));
  const tot = contacts.data ?? 0;
  const ok = contactable.data ?? 0;
  const pct = tot > 0 ? Math.round((ok / tot) * 100) : 0;

  const topLists: TagList[] = ((lists.data?.lists ?? []) as TagList[])
    .slice(0, 5)
    .map((l) => ({ tag: l.tag, total: Number(l.total) || 0, contactable: Number(l.contactable) || 0 }));

  const bullets = [
    `${pct}% della rubrica è contattabile via email (${fmt(ok)} su ${fmt(tot)}).`,
    `${fmt(Math.max(0, tot - ok))} contatti senza email o con opt-out: lavorabili via telefono/WhatsApp.`,
    ...(topLists[0] ? [`Lista più grande: “${topLists[0].tag}” — ${fmt(topLists[0].contactable)} contattabili su ${fmt(topLists[0].total)}.`] : []),
    ...((suppressed.data ?? 0) > 0 ? [`${fmt(suppressed.data)} indirizzi soppressi (bounce/lamentele): esclusi in automatico dagli invii.`] : []),
  ];

  return (
    <AnalyticsDashboardCard
      title="Rubrica & deliverability"
      subtitle="La salute del tuo database contatti"
      ring={{ value: pct, label: "contattabile" }}
      tabs={[
        {
          key: "panoramica",
          label: "Panoramica",
          content: (
            <>
              <DashboardStatCard
                label="Contattabili via email"
                value={fmt(ok)}
                badge={`${pct}% della rubrica`}
                badgeTone={pct >= 30 ? "good" : "warn"}
                progress={pct}
              />
              <DashboardStatGrid
                metrics={[
                  { label: "Contatti", value: fmt(tot) },
                  { label: "Soppressi", value: fmt(suppressed.data) },
                  { label: "Campagne", value: fmt(campaigns.data) },
                ]}
              />
            </>
          ),
        },
        {
          key: "liste",
          label: "Liste top",
          content: topLists.length > 0 ? (
            <DashboardListRows
              rows={topLists.map((l, i) => ({
                color: LIST_DOT_COLORS[i % LIST_DOT_COLORS.length],
                label: l.tag,
                value: `${fmt(l.contactable)} ✉ / ${fmt(l.total)}`,
              }))}
            />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {lists.isLoading ? "Carico le liste…" : "Nessuna lista ancora: importa un CSV con un tag."}
            </p>
          ),
        },
        {
          key: "insight",
          label: "Insight",
          content: <DashboardInsight title="Cosa dicono i numeri" bullets={bullets} />,
        },
      ]}
      footer={
        <>
          <Button
            className="flex-1 gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
            onClick={() => navigate("/admin/marketing/contatti")}
          >
            <Users className="h-4 w-4" /> Apri contatti
          </Button>
          <Button variant="outline" className="flex-1 gap-1.5" onClick={() => navigate("/admin/marketing/lead-scraper")}>
            <ListChecks className="h-4 w-4" /> Trova nuovi lead
          </Button>
        </>
      }
    />
  );
}
