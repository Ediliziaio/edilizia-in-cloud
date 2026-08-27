/**
 * CrmNetworksStrip — striscia "Reti & canali" del cockpit Overview: unisce a
 * colpo d'occhio le reti partner (referral + rivenditori/produttori white-label)
 * con l'outreach. Numeri reali platform-global; il dettaglio sta nel tab Partner.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Award, Wallet, Factory, Store, Loader2 } from "lucide-react";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Math.round(n || 0));

interface Networks {
  referralPartners: number;
  commissioneMese: number;
  produttori: number;
  rivenditori: number;
  rivenditoriAttivi: number;
}

export function CrmNetworksStrip() {
  const q = useQuery({
    queryKey: ["crm-dash", "networks-strip"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Networks> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const [lead, brands] = await Promise.all([
        sb.from("referral_leaderboard").select("id,total_earned,total_clicks,active_companies,current_month_commission").limit(500),
        sb.from("company_branding").select("company_id,whitelabel_tier").eq("whitelabel_tier", "agency"),
      ]);
      const rows = (lead.error ? [] : lead.data ?? []) as { total_earned: number | null; total_clicks: number | null; active_companies: number | null; current_month_commission: number | null }[];
      const referralPartners = rows.filter((r) => (r.total_clicks ?? 0) > 0 || (r.active_companies ?? 0) > 0 || (r.total_earned ?? 0) > 0).length;
      const commissioneMese = rows.reduce((s, r) => s + (r.current_month_commission ?? 0), 0);

      const ids = (brands.error ? [] : brands.data ?? []).map((b: { company_id: string }) => b.company_id).filter(Boolean);
      let rivenditori = 0;
      let rivenditoriAttivi = 0;
      if (ids.length) {
        const kids = await sb.from("companies").select("status").in("parent_company_id", ids);
        const krows = (kids.error ? [] : kids.data ?? []) as { status: string | null }[];
        rivenditori = krows.length;
        rivenditoriAttivi = krows.filter((k) => k.status === "active").length;
      }
      return { referralPartners, commissioneMese, produttori: ids.length, rivenditori, rivenditoriAttivi };
    },
  });

  const d = q.data;
  const items = [
    { icon: Award, label: "Partner referral", value: d ? String(d.referralPartners) : "—", color: "hsl(262 83% 58%)" },
    { icon: Wallet, label: "Commissione mese", value: d ? eur(d.commissioneMese) : "—", color: "hsl(160 84% 39%)" },
    { icon: Factory, label: "Produttori", value: d ? String(d.produttori) : "—", color: "hsl(217 91% 60%)" },
    { icon: Store, label: "Rivenditori", value: d ? String(d.rivenditori) : "—", hint: d && d.rivenditori ? `${d.rivenditoriAttivi} attivi` : undefined, color: "hsl(43 96% 56%)" },
  ];

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Store className="h-4 w-4" aria-hidden="true" /> Reti &amp; canali
          <span className="ml-auto text-xs font-normal text-muted-foreground">referral + white-label · dettaglio nel tab Partner</span>
        </div>
        {q.isLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <div key={it.label} className="flex items-center gap-2.5 rounded-lg border p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border" style={{ color: it.color }}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-muted-foreground">{it.label}</div>
                    <div className="text-lg font-bold leading-tight">{it.value}</div>
                    {it.hint && <div className="text-[11px] text-muted-foreground">{it.hint}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
