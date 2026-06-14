import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Briefcase, UserPlus, MessageSquareReply } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

/**
 * Attività recenti — timeline unificata degli eventi outreach: opportunità
 * create, contatti aggiunti, risposte ricevute. Unisce fonti esistenti
 * (marketing_opportunities/contacts) + outreach_replies (gated, salta se assente).
 */

type Item = { id: string; kind: "opp" | "contact" | "reply"; label: string; ts: string };

export function OutreachActivityFeed({ companyId }: { companyId: string }) {
  const q = useQuery({
    queryKey: ["outreach-activity", companyId],
    staleTime: 60_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    queryFn: async () => {
      const items: Item[] = [];

      // Tabelle reali: lascia propagare l'errore così react-query RIPROVA
      // (sopravvive ai blip di rete in dev) invece di cachare un feed vuoto.
      const { data: opps } = await supabase.from("marketing_opportunities")
        .select("id,name,created_at").eq("company_id", companyId).is("deleted_at", null)
        .order("created_at", { ascending: false }).limit(10);
      for (const o of opps ?? []) items.push({ id: `o-${o.id}`, kind: "opp", label: `Opportunità: ${o.name}`, ts: o.created_at });

      const { data: cs } = await supabase.from("marketing_contacts")
        .select("id,first_name,last_name,company_name,created_at").eq("company_id", companyId)
        .order("created_at", { ascending: false }).limit(10);
      for (const c of cs ?? []) {
        const who = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Contatto";
        items.push({ id: `c-${c.id}`, kind: "contact", label: `Contatto aggiunto: ${who}`, ts: c.created_at });
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rs } = await (supabase as any).from("outreach_replies")
          .select("id,from_email,received_at").eq("company_id", companyId)
          .order("received_at", { ascending: false }).limit(10);
        for (const r of rs ?? []) items.push({ id: `r-${r.id}`, kind: "reply", label: `Risposta da ${r.from_email}`, ts: r.received_at });
      } catch { /* tabella gated: ignora */ }

      return items.filter((i) => i.ts).sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).slice(0, 15);
    },
  });

  const items = q.data ?? [];
  const ICON = { opp: Briefcase, contact: UserPlus, reply: MessageSquareReply };
  const rel = (iso: string) => { try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: it }); } catch { return ""; } };

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-5 w-5 text-orange-500" /> Attività recenti</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Ancora nessuna attività. Importa lead o crea opportunità per iniziare.</p>
        ) : (
          <ol className="space-y-2.5">
            {items.map((it2) => {
              const Icon = ICON[it2.kind];
              return (
                <li key={it2.id} className="flex items-center gap-3">
                  <div className="rounded-full bg-muted p-1.5"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                  <span className="min-w-0 flex-1 truncate text-sm">{it2.label}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{rel(it2.ts)}</span>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
