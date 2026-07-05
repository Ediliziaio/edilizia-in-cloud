/**
 * ColdDbHealthCard — "Salute del database" del CRM freddo (super_admin).
 * Copertura contatti, qualità, distribuzione punteggio ICP, top categorie/regioni.
 * Legge l'RPC aggregata crm_cold_db_health (server-side, un solo scan).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, ChevronDown, Loader2, Mail, Phone, MapPin, Euro, Building2, ShieldAlert, Copy } from "lucide-react";

interface Health {
  total: number; con_email: number; con_tel: number; contattabili: number;
  con_fatturato: number; con_dipendenti: number; geo_esatti: number; geo_totali: number;
  con_piva: number; optout: number; dup_email: number;
  email_verificate?: number; email_no_mx?: number;
  tiers: Record<string, number>;
  categorie: Array<{ k: string; n: number }>;
  regioni: Array<{ k: string; n: number }>;
}

const CAT_LABEL: Record<string, string> = {
  costruzioni: "Costruzioni", impianti_ristrutturazione: "Impianti & Ristrutt.",
  serramenti: "Serramenti", materiali_edili: "Materiali edili",
  carpenteria_metallica: "Carpenteria", schermature: "Schermature",
};
const TIER = [
  { k: "A", label: "A · top", color: "#16a34a" },
  { k: "B", label: "B · buoni", color: "#65a30d" },
  { k: "C", label: "C · medi", color: "#f59e0b" },
  { k: "D", label: "D · bassi", color: "#94a3b8" },
];
const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}k` : String(n ?? 0));

function Bar({ label, value, total, color, icon }: { label: string; value: number; total: number; color: string; icon?: React.ReactNode }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
        <span className="font-semibold tabular-nums">{fmt(value)} <span className="text-muted-foreground">· {pct}%</span></span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export function ColdDbHealthCard({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(true);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["crm-cold-db-health", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("crm_cold_db_health", { p_company: companyId });
      if (error) throw error;
      return data as unknown as Health;
    },
  });

  if (isError) return null;

  return (
    <Card className="overflow-hidden border-orange-100">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <Activity className="h-4 w-4 shrink-0 text-orange-500" />
          <span className="text-sm font-semibold">Salute del database</span>
          {data && <span className="hidden text-xs text-muted-foreground sm:inline">· {fmt(data.total)} contatti · {fmt(data.contattabili)} contattabili</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <CardContent className="p-3 pt-0">
          {isLoading || !data ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Calcolo…</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {/* Copertura */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Copertura</div>
                <Bar label="Email" value={data.con_email} total={data.total} color="#f97316" icon={<Mail className="h-3 w-3" />} />
                <Bar label="Telefono" value={data.con_tel} total={data.total} color="#3b82f6" icon={<Phone className="h-3 w-3" />} />
                <Bar label="Indirizzo esatto" value={data.geo_esatti} total={data.total} color="#16a34a" icon={<MapPin className="h-3 w-3" />} />
                <Bar label="Fatturato" value={data.con_fatturato} total={data.total} color="#8b5cf6" icon={<Euro className="h-3 w-3" />} />
                <Bar label="P.IVA" value={data.con_piva} total={data.total} color="#0ea5e9" icon={<Building2 className="h-3 w-3" />} />
              </div>

              {/* Qualità ICP */}
              <div className="space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Punteggio ICP</div>
                {TIER.map((t) => {
                  const n = data.tiers?.[t.k] ?? 0;
                  return <Bar key={t.k} label={t.label} value={n} total={data.total} color={t.color} />;
                })}
                <div className="flex flex-wrap gap-2 pt-1">
                  {data.dup_email > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"><Copy className="h-3 w-3" /> {fmt(data.dup_email)} email duplicate</span>
                  )}
                  {data.optout > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"><ShieldAlert className="h-3 w-3" /> {fmt(data.optout)} opt-out</span>
                  )}
                  {(data.email_no_mx ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700" title="Dominio email senza record MX: non consegnabili, escluse dagli invii"><ShieldAlert className="h-3 w-3" /> {fmt(data.email_no_mx ?? 0)} email non valide</span>
                  )}
                </div>
              </div>

              {/* Top categorie + regioni */}
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Per categoria</div>
                  <div className="space-y-1">
                    {(data.categorie ?? []).slice(0, 6).map((c) => (
                      <div key={c.k} className="flex items-center justify-between text-xs">
                        <span className="truncate text-muted-foreground">{CAT_LABEL[c.k] ?? c.k}</span>
                        <span className="font-semibold tabular-nums">{fmt(c.n)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Top regioni</div>
                  <div className="space-y-1">
                    {(data.regioni ?? []).slice(0, 5).map((r) => (
                      <div key={r.k} className="flex items-center justify-between text-xs">
                        <span className="truncate text-muted-foreground">{r.k}</span>
                        <span className="font-semibold tabular-nums">{fmt(r.n)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
