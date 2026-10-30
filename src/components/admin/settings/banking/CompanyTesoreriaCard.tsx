import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Search, Link2, AlertCircle, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Tesoreria per azienda: SOLA LETTURA dello stato vero.
 *
 * Prima qui c'era un interruttore che scriveva `companies.tesoreria_enabled`, colonna che nessuno legge:
 * la Tesoreria si accende dalla funzionalità «tesoreria» (resolve_company_feature: eccezione dell'azienda in
 * company_feature_overrides → valore del piano in plan_feature_defaults → piani inclusi nel flag → valore
 * predefinito del flag). L'interruttore mostrava uno stato falso e non accendeva niente (30/10/2026).
 * Ora la scheda ricalcola lo stato con la stessa regola e rimanda a /admin/feature-flags per cambiarlo.
 */

export type LivelloAccesso = "enabled" | "preview" | "disabled";
export type FonteStato = "eccezione" | "piano" | "piano_incluso" | "predefinito";

interface CompanyRow {
  id: string;
  name: string;
  livello: LivelloAccesso;
  fonte: FonteStato;
  active_connections: number;
}

interface Override {
  company_id: string;
  access_level: LivelloAccesso | null;
  is_enabled: boolean | null;
  expires_at: string | null;
}

/** Stessa regola di resolve_company_feature, per una azienda. Esportata per i test. */
export function statoTesoreria(args: {
  override?: Pick<Override, "access_level" | "is_enabled" | "expires_at"> | null;
  pianoDefault?: { access_level: LivelloAccesso | null; is_enabled: boolean | null } | null;
  pianoSlug?: string | null;
  pianiInclusi?: string[] | null;
  predefinito?: boolean | null;
  adesso?: number;
}): { livello: LivelloAccesso; fonte: FonteStato } {
  const adesso = args.adesso ?? Date.now();
  const ov = args.override;
  if (ov && ov.is_enabled !== null && (!ov.expires_at || new Date(ov.expires_at).getTime() > adesso)) {
    return { livello: ov.access_level ?? (ov.is_enabled ? "enabled" : "disabled"), fonte: "eccezione" };
  }
  const pd = args.pianoDefault;
  if (pd) {
    return { livello: pd.access_level ?? (pd.is_enabled ? "enabled" : "disabled"), fonte: "piano" };
  }
  if (args.pianoSlug && args.pianiInclusi?.includes(args.pianoSlug)) {
    return { livello: "enabled", fonte: "piano_incluso" };
  }
  return { livello: args.predefinito ? "enabled" : "disabled", fonte: "predefinito" };
}

const ETICHETTA_LIVELLO: Record<LivelloAccesso, string> = {
  enabled: "Attiva",
  preview: "Anteprima",
  disabled: "Spenta",
};
const ETICHETTA_FONTE: Record<FonteStato, string> = {
  eccezione: "eccezione per l'azienda",
  piano: "dal piano",
  piano_incluso: "inclusa nel piano",
  predefinito: "valore predefinito",
};

function useCompaniesWithTesoreria() {
  return useQuery({
    queryKey: ["admin", "companies-tesoreria-stato"],
    queryFn: async (): Promise<CompanyRow[]> => {
      const [companiesRes, connectionsRes, overridesRes, defaultsRes, flagRes, plansRes] = await Promise.all([
        supabase.from("companies").select("id, name, subscription_plan_id").order("name"),
        supabase.from("bank_connections").select("company_id").eq("status", "active"),
        supabase
          .from("company_feature_overrides")
          .select("company_id, access_level, is_enabled, expires_at")
          .eq("feature_key", "tesoreria"),
        supabase
          .from("plan_feature_defaults")
          .select("plan_id, access_level, is_enabled")
          .eq("feature_key", "tesoreria"),
        supabase
          .from("platform_feature_flags")
          .select("default_value, plans_included")
          .eq("key", "tesoreria")
          .maybeSingle(),
        supabase.from("subscription_plans").select("id, slug"),
      ]);

      for (const r of [companiesRes, connectionsRes, overridesRes, defaultsRes, flagRes, plansRes]) {
        if (r.error) throw new Error(r.error.message);
      }

      const counts = new Map<string, number>();
      for (const row of connectionsRes.data ?? []) {
        const id = (row as { company_id: string }).company_id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const overrides = new Map(
        ((overridesRes.data ?? []) as unknown as Override[]).map((o) => [o.company_id, o]),
      );
      const defaults = new Map(
        ((defaultsRes.data ?? []) as unknown as Array<{ plan_id: string; access_level: LivelloAccesso | null; is_enabled: boolean | null }>)
          .map((d) => [d.plan_id, d]),
      );
      const slugs = new Map(((plansRes.data ?? []) as Array<{ id: string; slug: string | null }>).map((p) => [p.id, p.slug]));
      const flag = flagRes.data as { default_value: boolean | null; plans_included: string[] | null } | null;

      return ((companiesRes.data ?? []) as Array<{ id: string; name: string; subscription_plan_id: string | null }>).map((c) => {
        const stato = statoTesoreria({
          override: overrides.get(c.id) ?? null,
          pianoDefault: c.subscription_plan_id ? defaults.get(c.subscription_plan_id) ?? null : null,
          pianoSlug: c.subscription_plan_id ? slugs.get(c.subscription_plan_id) ?? null : null,
          pianiInclusi: flag?.plans_included ?? null,
          predefinito: flag?.default_value ?? false,
        });
        return {
          id: c.id,
          name: c.name,
          livello: stato.livello,
          fonte: stato.fonte,
          active_connections: counts.get(c.id) ?? 0,
        };
      });
    },
    staleTime: 2 * 60 * 1000,
  });
}

type Filtro = "tutte" | LivelloAccesso;

export default function CompanyTesoreriaCard() {
  const { data: companies = [], isLoading, error } = useCompaniesWithTesoreria();
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutte");

  const conteggi = useMemo(() => {
    const c = { enabled: 0, preview: 0, disabled: 0 };
    for (const r of companies) c[r.livello] += 1;
    return c;
  }, [companies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter(
      (c) => (filtro === "tutte" || c.livello === filtro) && (!q || c.name.toLowerCase().includes(q)),
    );
  }, [companies, search, filtro]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Non riesco a leggere le aziende: {error instanceof Error ? error.message : "errore sconosciuto"}
        </AlertDescription>
      </Alert>
    );
  }

  const filtri: Array<{ id: Filtro; label: string; n: number }> = [
    { id: "tutte", label: "Tutte", n: companies.length },
    { id: "enabled", label: "Attiva", n: conteggi.enabled },
    { id: "preview", label: "Anteprima", n: conteggi.preview },
    { id: "disabled", label: "Spenta", n: conteggi.disabled },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 max-sm:hidden">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">Tesoreria per azienda</CardTitle>
              <CardDescription className="max-sm:hidden">
                Stato vero della funzionalità «Tesoreria». Si cambia da Funzionalità, non da qui.
              </CardDescription>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/feature-flags">
              Cambia in Funzionalità
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1 [scrollbar-width:none]" role="group" aria-label="Filtra per stato">
                {filtri.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filtro === f.id}
                    onClick={() => setFiltro(f.id)}
                    className={cn(
                      "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium",
                      filtro === f.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label} <span className="tabular-nums text-muted-foreground">{f.n}</span>
                  </button>
                ))}
              </div>
              {companies.length > 5 && (
                <div className="relative sm:ml-auto sm:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Cerca azienda…"
                    aria-label="Cerca azienda"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              )}
            </div>
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {companies.length === 0 ? "Nessuna azienda" : "Nessuna azienda con questi filtri"}
              </p>
            ) : (
              <ul className="grid max-h-[520px] grid-cols-1 gap-1.5 overflow-y-auto lg:grid-cols-2 2xl:grid-cols-3">
                {filtered.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <span>{ETICHETTA_FONTE[c.fonte]}</span>
                        {c.active_connections > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <Link2 className="h-3 w-3" />
                            {c.active_connections} {c.active_connections === 1 ? "conto collegato" : "conti collegati"}
                          </>
                        )}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0",
                        c.livello === "enabled" && "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
                        c.livello === "preview" && "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
                      )}
                    >
                      {ETICHETTA_LIVELLO[c.livello]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
