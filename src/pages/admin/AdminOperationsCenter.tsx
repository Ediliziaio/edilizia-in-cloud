import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, LifeBuoy, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAdminCommandCenterData, type AdminActionSource } from "@/hooks/useAdminCommandCenterData";
import { cn } from "@/lib/utils";

type Filter = "all" | "critical" | AdminActionSource;

const filters: Array<{ label: string; value: Filter }> = [
  { label: "Tutte", value: "all" },
  { label: "Critiche", value: "critical" },
  { label: "Assistenza", value: "support" },
  { label: "Trial", value: "trial" },
  { label: "Sync", value: "sync" },
  { label: "Revenue", value: "revenue" },
];

export default function AdminOperationsCenter() {
  const { data, isLoading, isError, refetch, isFetching } = useAdminCommandCenterData();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const items = useMemo(() => {
    const source = search.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "critical" && (item.severity === "critical" || item.severity === "high")) ||
        item.source === filter;

      const matchesSearch =
        !source ||
        item.title.toLowerCase().includes(source) ||
        item.description.toLowerCase().includes(source) ||
        item.companyName?.toLowerCase().includes(source);

      return matchesFilter && matchesSearch;
    });
  }, [data?.items, filter, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Centro operativo</h1>
          <p className="text-muted-foreground">
            Una inbox unica per supporto, trial, sync e priorità commerciali.
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
          Aggiorna
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Totale aperte</p>
            <p className="mt-1 text-3xl font-bold">{data?.summary.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Critiche/alte</p>
            <p className="mt-1 text-3xl font-bold text-red-600">
              {(data?.summary.critical ?? 0) + (data?.summary.high ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Assistenza</p>
            <p className="mt-1 text-3xl font-bold text-blue-600">{data?.summary.support ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Trial/revenue</p>
            <p className="mt-1 text-3xl font-bold text-orange-600">
              {(data?.summary.trials ?? 0) + (data?.summary.revenue ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 border-b">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <CardTitle>Priorità operative</CardTitle>
            <div className="relative w-full xl:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cerca azienda, errore o attività..."
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <Button
                key={item.value}
                variant={filter === item.value ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              <div className="h-20 rounded-lg bg-muted animate-pulse" />
              <div className="h-20 rounded-lg bg-muted animate-pulse" />
              <div className="h-20 rounded-lg bg-muted animate-pulse" />
            </div>
          ) : isError ? (
            <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertTriangle className="h-5 w-5" />
              Errore nel caricamento delle priorità operative.
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="font-medium">Nessun elemento da gestire</p>
              <p className="text-sm text-muted-foreground">Il filtro corrente non contiene attività aperte.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <LifeBuoy className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{item.title}</p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          item.severity === "critical" && "border-red-200 bg-red-50 text-red-700",
                          item.severity === "high" && "border-orange-200 bg-orange-50 text-orange-700",
                          item.severity === "medium" && "border-blue-200 bg-blue-50 text-blue-700",
                        )}
                      >
                        {item.severity}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">{item.source}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <Button asChild className="shrink-0" variant="outline">
                    <Link to={item.href}>
                      {item.cta}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
