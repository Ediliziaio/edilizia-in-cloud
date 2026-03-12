import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Building2, Search, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CompanyRow {
  id: string;
  name: string;
  tesoreria_enabled: boolean;
  active_connections: number;
}

export default function CompanyTesoreriaCard() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadCompanies();
  }, []);

  async function loadCompanies() {
    setLoading(true);
    const { data } = await supabase
      .from("companies")
      .select("id, name, tesoreria_enabled")
      .order("name");

    const companiesWithStats = await Promise.all(
      (data || []).map(async (c) => {
        const { count } = await supabase
          .from("bank_connections")
          .select("id", { count: "exact", head: true })
          .eq("company_id", c.id)
          .eq("status", "active");
        return { ...c, tesoreria_enabled: c.tesoreria_enabled || false, active_connections: count || 0 };
      })
    );
    setCompanies(companiesWithStats);
    setLoading(false);
  }

  async function toggleTesoreria(companyId: string, value: boolean) {
    const { error } = await supabase
      .from("companies")
      .update({ tesoreria_enabled: value } as any)
      .eq("id", companyId);
    if (error) {
      toast.error("Errore: " + error.message);
    } else {
      toast.success(value ? "Tesoreria abilitata" : "Tesoreria disabilitata");
      setCompanies((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, tesoreria_enabled: value } : c))
      );
    }
  }

  const enabledCount = companies.filter((c) => c.tesoreria_enabled).length;
  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

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
              <CardDescription>Abilita o disabilita la tesoreria per singola azienda</CardDescription>
            </div>
          </div>
          {!loading && (
            <Badge variant="outline">
              {enabledCount}/{companies.length} abilitate
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
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
                {companies.length === 0 ? "Nessuna azienda trovata" : "Nessun risultato per la ricerca"}
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
                            {c.active_connections} {c.active_connections === 1 ? "connessione attiva" : "connessioni attive"}
                          </span>
                        </div>
                      )}
                    </div>
                    <Switch
                      checked={c.tesoreria_enabled}
                      onCheckedChange={(val) => toggleTesoreria(c.id, val)}
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
