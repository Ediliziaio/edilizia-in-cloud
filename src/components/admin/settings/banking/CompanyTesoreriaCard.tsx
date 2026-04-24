import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Search, Link2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CompanyRow {
  id: string;
  name: string;
  tesoreria_enabled: boolean;
  active_connections: number;
}

/**
 * FIX: prima il componente faceva N+1 queries (1 per ogni azienda) per contare
 * le connessioni bancarie attive. Con 100 aziende significava 100 round-trip.
 * Ora due query parallele + aggregazione client-side.
 */
function useCompaniesWithTesoreria() {
  return useQuery({
    queryKey: ["admin", "companies-tesoreria"],
    queryFn: async (): Promise<CompanyRow[]> => {
      const [companiesRes, connectionsRes] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, tesoreria_enabled")
          .order("name"),
        supabase
          .from("bank_connections")
          .select("company_id")
          .eq("status", "active"),
      ]);

      if (companiesRes.error) throw new Error(companiesRes.error.message);
      if (connectionsRes.error) throw new Error(connectionsRes.error.message);

      // Aggregazione in-memory: O(N) sul numero di connessioni
      const counts = new Map<string, number>();
      for (const row of connectionsRes.data ?? []) {
        const id = (row as { company_id: string }).company_id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }

      return (companiesRes.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        tesoreria_enabled: c.tesoreria_enabled ?? false,
        active_connections: counts.get(c.id) ?? 0,
      }));
    },
    staleTime: 2 * 60 * 1000,
  });
}

function useToggleTesoreria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, value }: { companyId: string; value: boolean }) => {
      const { error } = await supabase
        .from("companies")
        .update({ tesoreria_enabled: value } as never)
        .eq("id", companyId);
      if (error) throw new Error(error.message);
      return { companyId, value };
    },
    // Optimistic update: toggle istantaneo in UI; rollback se la server call fallisce
    onMutate: async ({ companyId, value }) => {
      await qc.cancelQueries({ queryKey: ["admin", "companies-tesoreria"] });
      const prev = qc.getQueryData<CompanyRow[]>(["admin", "companies-tesoreria"]);
      qc.setQueryData<CompanyRow[]>(["admin", "companies-tesoreria"], (rows) =>
        (rows ?? []).map((r) =>
          r.id === companyId ? { ...r, tesoreria_enabled: value } : r,
        ),
      );
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(["admin", "companies-tesoreria"], ctx.prev);
      }
      toast.error("Errore: " + err.message);
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.value ? "Tesoreria abilitata" : "Tesoreria disabilitata");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "companies-tesoreria"] });
    },
  });
}

export default function CompanyTesoreriaCard() {
  const { data: companies = [], isLoading, error } = useCompaniesWithTesoreria();
  const toggleMutation = useToggleTesoreria();
  const [search, setSearch] = useState("");

  const enabledCount = useMemo(
    () => companies.filter((c) => c.tesoreria_enabled).length,
    [companies],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Impossibile caricare le aziende:{" "}
          {error instanceof Error ? error.message : "errore sconosciuto"}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Aziende con Tesoreria</CardTitle>
              <CardDescription>
                Abilita o disabilita la tesoreria per singola azienda
              </CardDescription>
            </div>
          </div>
          {!isLoading && (
            <Badge variant="outline">
              {enabledCount}/{companies.length} abilitate
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            {companies.length > 5 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca azienda..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            )}
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                {companies.length === 0
                  ? "Nessuna azienda trovata"
                  : "Nessun risultato per la ricerca"}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {filtered.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between py-3 px-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{c.name}</p>
                      {c.tesoreria_enabled && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Link2 className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {c.active_connections}{" "}
                            {c.active_connections === 1
                              ? "connessione attiva"
                              : "connessioni attive"}
                          </span>
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={c.tesoreria_enabled}
                      disabled={toggleMutation.isPending}
                      onCheckedChange={(val) =>
                        toggleMutation.mutate({ companyId: c.id, value: val })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
