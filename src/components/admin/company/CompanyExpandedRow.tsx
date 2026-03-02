import React from "react";
import { useNavigate } from "react-router-dom";
import { DollarSign, Calendar, UserCheck, Briefcase, CheckCircle2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { formatCurrency } from "@/lib/formatters";
import { getHealthIndicator, getOnboardingPct } from "@/lib/companyUtils";
import { CompanyTagsCell } from "./CompanyTagsCell";
import { Skeleton } from "@/components/ui/skeleton";

interface CompanyExpandedRowProps {
  company: {
    id: string;
    business_name?: string | null;
    vat_number?: string | null;
    phone?: string | null;
    pec?: string | null;
    sdi_code?: string | null;
    website?: string | null;
    fiscal_code?: string | null;
    trial_ends_at?: string | null;
  };
  orderStats?: { count: number; totalValue: number; lastOrderDate: string | null };
  healthData?: { score: number; health: string; lastOrderDate: string | null; order_count: number; user_count: number; has_customers: boolean; has_staff: boolean };
  sparklineData?: Array<{ month: string; count: number }>;
  latestNote?: { content: string; created_at: string; authorName: string };
  tags: Array<{ id: string; tag: string; color: string }>;
}

export const CompanyExpandedRow = React.memo(function CompanyExpandedRow({
  company, orderStats, healthData: hd, sparklineData, latestNote, tags,
}: CompanyExpandedRowProps) {
  const navigate = useNavigate();
  const lastDate = orderStats?.lastOrderDate ? new Date(orderStats.lastOrderDate) : null;
  const daysSince = lastDate ? differenceInDays(new Date(), lastDate) : null;
  const health = getHealthIndicator(daysSince);
  const onboardingPct = getOnboardingPct(hd);

  return (
    <div className="space-y-4">
      {/* Section 1 — Non-redundant KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={<DollarSign className="h-4 w-4 text-primary" />} iconBg="bg-primary/10" label="Valore Totale" value={formatCurrency(orderStats?.totalValue || 0)} />
        <KpiCard icon={<Calendar className={`h-4 w-4 ${health.color}`} />} iconBg={health.bgColor} label="Ultimo Ordine" value={health.label} valueClass={health.color} />
        <KpiCard icon={<UserCheck className={`h-4 w-4 ${hd?.has_customers ? "text-green-600" : "text-muted-foreground"}`} />} iconBg={hd?.has_customers ? "bg-green-500/10" : "bg-muted"} label="Clienti" value={hd?.has_customers ? "Presenti" : "Nessuno"} />
        <KpiCard icon={<Briefcase className={`h-4 w-4 ${hd?.has_staff ? "text-green-600" : "text-muted-foreground"}`} />} iconBg={hd?.has_staff ? "bg-green-500/10" : "bg-muted"} label="Staff" value={hd?.has_staff ? "Presenti" : "Nessuno"} />
        
        {/* Onboarding */}
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <div className="rounded-md bg-primary/10 p-2"><CheckCircle2 className="h-4 w-4 text-primary" /></div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">Onboarding</p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${onboardingPct}%` }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{onboardingPct}%</span>
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Trend Ordini (6m)</p>
            {sparklineData === undefined ? (
              <Skeleton className="h-8 w-full" />
            ) : sparklineData.some((d) => d.count > 0) ? (
              <div className="h-8 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sparklineData}>
                    <defs>
                      <linearGradient id={`spark-${company.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill={`url(#spark-${company.id})`} strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nessun dato</p>
            )}
          </div>
        </div>
      </div>

      {/* Section 2 — Business info compact */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-2 rounded-lg border bg-card p-3">
        {[
          { label: "Ragione sociale", value: company.business_name },
          { label: "P.IVA", value: company.vat_number },
          { label: "Telefono", value: company.phone },
          { label: "PEC", value: company.pec },
          { label: "SDI", value: company.sdi_code },
          { label: "Sito", value: company.website },
          { label: "C. Fiscale", value: company.fiscal_code },
          { label: "Scadenza Trial", value: company.trial_ends_at ? format(new Date(company.trial_ends_at), "dd/MM/yyyy", { locale: it }) : null },
        ].filter((f) => f.value).map((f) => (
          <div key={f.label}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}</p>
            <p className="text-xs font-medium truncate">{f.value}</p>
          </div>
        ))}
      </div>

      {/* Section 3 — CRM Notes preview + Tags */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 rounded-lg border bg-card p-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium">Ultima Nota CRM</span>
            </div>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/admin/aziende/${company.id}?tab=notes`); }}>
              Vedi tutte →
            </Button>
          </div>
          {latestNote ? (
            <div>
              <p className="text-xs text-foreground line-clamp-2">{latestNote.content}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {latestNote.authorName} · {format(new Date(latestNote.created_at), "dd MMM yyyy, HH:mm", { locale: it })}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Nessuna nota</p>
          )}
        </div>
        <div className="md:w-64 rounded-lg border bg-card p-3">
          <p className="text-xs font-medium mb-1.5">Tag / Segmenti</p>
          <CompanyTagsCell companyId={company.id} tags={tags} />
        </div>
      </div>
    </div>
  );
});

function KpiCard({ icon, iconBg, label, value, valueClass }: { icon: React.ReactNode; iconBg: string; label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div className={`rounded-md p-2 ${iconBg}`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-semibold ${valueClass || ""}`}>{value}</p>
      </div>
    </div>
  );
}
