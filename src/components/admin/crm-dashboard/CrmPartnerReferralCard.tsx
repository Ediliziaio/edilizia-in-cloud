/**
 * CrmPartnerReferralCard — tab "Partner & Referral".
 *
 * Due reti, dati reali (platform-global, super-admin):
 *  A) Partner REFERRAL — classifica dalla vista `referral_leaderboard`
 *     (clienti attivi, commissione del mese, click, conversione, guadagnato).
 *  B) Partner RIVENDITORI white-label (produttori) — replica del pattern
 *     fetchProduttori: company_branding.whitelabel_tier='agency' → aziende +
 *     conteggio rivenditori figli (companies.parent_company_id).
 *
 * Tabelle non tipizzate nei tipi generati → query cast + fail-open.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Share2, Network, Award, Loader2, Users } from "lucide-react";

const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" }).format(Math.round(n || 0));

interface RefRow {
  id: string;
  name: string | null;
  tier_name: string | null;
  active_companies: number | null;
  current_month_commission: number | null;
  total_earned: number | null;
  total_clicks: number | null;
  conversion_rate: number | null;
}

interface ResellerRow {
  id: string;
  name: string | null;
  status: string | null;
  wholesale_pct: number;
  reseller_limit: number;
  total: number;
  comped: number;
  active: number;
}

function useReferralLeaderboard() {
  return useQuery({
    queryKey: ["crm-dash", "referral-leaderboard"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from("referral_leaderboard") as any)
        .select("id,name,tier_name,active_companies,current_month_commission,total_earned,total_clicks,conversion_rate")
        .order("current_month_commission", { ascending: false })
        .limit(10);
      if (error) return [] as RefRow[];
      return (data ?? []) as RefRow[];
    },
  });
}

function useResellers() {
  return useQuery({
    queryKey: ["crm-dash", "resellers"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ResellerRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: brands, error: bErr } = await sb
        .from("company_branding")
        .select("company_id,whitelabel_tier")
        .eq("whitelabel_tier", "agency");
      if (bErr || !brands || brands.length === 0) return [];
      const ids = brands.map((b: { company_id: string }) => b.company_id).filter(Boolean);
      if (ids.length === 0) return [];

      const [{ data: comps }, { data: kids }] = await Promise.all([
        sb.from("companies").select("id,name,status,reseller_wholesale_pct,reseller_limit").in("id", ids),
        sb.from("companies").select("parent_company_id,billing_comped,status").in("parent_company_id", ids),
      ]);

      const byParent = new Map<string, { total: number; comped: number; active: number }>();
      for (const k of (kids ?? []) as { parent_company_id: string; billing_comped: boolean | null; status: string | null }[]) {
        const e = byParent.get(k.parent_company_id) ?? { total: 0, comped: 0, active: 0 };
        e.total++;
        if (k.billing_comped) e.comped++;
        if (k.status === "active") e.active++;
        byParent.set(k.parent_company_id, e);
      }

      return ((comps ?? []) as { id: string; name: string | null; status: string | null; reseller_wholesale_pct: number | null; reseller_limit: number | null }[])
        .map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          wholesale_pct: c.reseller_wholesale_pct ?? 0,
          reseller_limit: c.reseller_limit ?? 0,
          ...(byParent.get(c.id) ?? { total: 0, comped: 0, active: 0 }),
        }))
        .sort((a, b) => b.total - a.total);
    },
  });
}

export function CrmPartnerReferralCard() {
  const refQ = useReferralLeaderboard();
  const resQ = useResellers();

  const referrals = (refQ.data ?? []).filter((r) => (r.total_clicks ?? 0) > 0 || (r.active_companies ?? 0) > 0 || (r.total_earned ?? 0) > 0);
  const resellers = resQ.data ?? [];

  return (
    <>
      {/* A) Partner referral */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Award className="h-4 w-4" aria-hidden="true" /> Partner referral · classifica
            {referrals.length > 0 && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">top {referrals.length}</span>
            )}
          </div>
          {refQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
          ) : referrals.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun partner referral con attività. La rete cresce con inviti e conversioni.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 font-medium">Partner</th>
                    <th className="pb-2 text-right font-medium">Clienti</th>
                    <th className="pb-2 text-right font-medium">Comm. mese</th>
                    <th className="hidden pb-2 text-right font-medium sm:table-cell">Click</th>
                    <th className="hidden pb-2 text-right font-medium sm:table-cell">Conv.</th>
                    <th className="pb-2 text-right font-medium">Guadagnato</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((r, i) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{r.name || "Partner"}</div>
                            {r.tier_name && <div className="truncate text-[10px] text-muted-foreground">{r.tier_name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 text-right tabular-nums">{r.active_companies ?? 0}</td>
                      <td className="py-2 text-right font-semibold tabular-nums text-emerald-600">{eur(r.current_month_commission ?? 0)}</td>
                      <td className="hidden py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{r.total_clicks ?? 0}</td>
                      <td className="hidden py-2 text-right tabular-nums text-muted-foreground sm:table-cell">{Math.round(r.conversion_rate ?? 0)}%</td>
                      <td className="py-2 text-right tabular-nums">{eur(r.total_earned ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* B) Partner rivenditori white-label */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Network className="h-4 w-4" aria-hidden="true" /> Partner rivenditori · white-label
            {resellers.length > 0 && (
              <span className="ml-auto text-xs font-normal text-muted-foreground">{resellers.length} produttori</span>
            )}
          </div>
          {resQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            </div>
          ) : resellers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun partner rivenditore (produttore white-label) configurato.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {resellers.map((r) => (
                <div key={r.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold leading-tight">{r.name || "Produttore"}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Users className="h-3 w-3" aria-hidden="true" /> {r.total} rivenditori
                        {r.active > 0 && <span>· {r.active} attivi</span>}
                      </div>
                    </div>
                    <span
                      className={
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (r.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")
                      }
                    >
                      {r.status === "active" ? "Attivo" : r.status || "—"}
                    </span>
                  </div>
                  <div className="mt-2 border-t pt-1.5 text-[11px] text-muted-foreground">
                    {r.comped > 0 && <span>{r.comped} a carico fabbrica · </span>}
                    sconto {r.wholesale_pct}%
                    {r.reseller_limit > 0 && <span> · tetto {r.reseller_limit}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <Share2 className="h-3 w-3" aria-hidden="true" />
        Reti di partnership a livello piattaforma. Le opportunità taggate con canale referral/rivenditore alimenteranno l'LTV per canale.
      </p>
    </>
  );
}
