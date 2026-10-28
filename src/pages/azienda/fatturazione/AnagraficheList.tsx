import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/formatters";
import { useNavigate } from "react-router-dom";
import { useAnagraficheNative } from "@/hooks/useAnagraficheNative";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { PartnerReconciliationPanel } from "@/components/fatturazione/PartnerReconciliationPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Search, Truck, Link2, ArrowRightLeft, Users } from "lucide-react";
import type { AnagraficaNative } from "@/types/fatturazione";

const TIPO_COLORS: Record<string, string> = {
  B2B: "bg-blue-100 text-blue-700",
  B2C: "bg-green-100 text-green-700",
  PA: "bg-violet-100 text-violet-700",
  Estero: "bg-amber-100 text-amber-700",
};

const TIPO_TAB_VALUES = ["tutti", "cliente", "fornitore"] as const;
type TipoTab = (typeof TIPO_TAB_VALUES)[number];

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type AnagraficheListProps = {
  embedded?: boolean;
};

export default function AnagraficheList({
  embedded = false,
}: AnagraficheListProps = {}) {
  const companyId = useEffectiveCompanyId();
  const navigate = useNavigate();
  const permissions = usePermissions();
  const [mainTab, setMainTab] = useState<"anagrafiche" | "riconciliazione">(
    "anagrafiche",
  );

  return (
    <div className={cn("space-y-6", !embedded && "p-6")}>
      <div className="testata-pagina rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-eic-amber text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                Clienti fiscali
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Clienti e fornitori fiscali per fatturazione, SDI e
                riconciliazione.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {(permissions.isAdmin || permissions.canViewCustomers) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/azienda/clienti")}
              >
                <Users className="mr-1 h-4 w-4" />
                Clienti dei cantieri
              </Button>
            )}
            {(permissions.isAdmin ||
              permissions.canViewSettingsSuppliers ||
              permissions.canEditSettingsSuppliers) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/azienda/impostazioni/fornitori")}
              >
                <Truck className="mr-1 h-4 w-4" />
                Fornitori operativi
              </Button>
            )}
          </div>
        </div>
      </div>

      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as typeof mainTab)}
      >
        <TabsList>
          <TabsTrigger value="anagrafiche">Anagrafiche</TabsTrigger>
          <TabsTrigger value="riconciliazione" className="gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Riconciliazione clienti e fornitori
          </TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafiche">
          <AnagraficheTable />
        </TabsContent>

        <TabsContent value="riconciliazione">
          <PartnerReconciliationPanel companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Anagrafiche Table (existing) ──────────────────────────────

function AnagraficheTable() {
  const navigate = useNavigate();
  const [tipoTab, setTipoTab] = useState<TipoTab>("tutti");
  const [search, setSearch] = useState("");
  const [tipoCliente, setTipoCliente] = useState<string>("all");
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [page, setPage] = useState(0);

  const {
    data: rawData,
    isLoading,
    isError,
    refetch,
  } = useAnagraficheNative(search || undefined, !soloAttivi, true);
  const anagrafiche = useMemo(
    () => (rawData ?? []) as unknown as AnagraficaNative[],
    [rawData],
  );

  const filtered = useMemo(() => {
    return anagrafiche.filter((a) => {
      if (
        tipoTab === "cliente" &&
        a.tipo !== "cliente" &&
        a.tipo !== "entrambi"
      )
        return false;
      if (
        tipoTab === "fornitore" &&
        a.tipo !== "fornitore" &&
        a.tipo !== "entrambi"
      )
        return false;
      if (tipoCliente !== "all" && a.tipo_cliente !== tipoCliente) return false;
      if (soloAttivi && !a.attivo) return false;
      return true;
    });
  }, [anagrafiche, tipoTab, tipoCliente, soloAttivi]);
  const filteredKey = JSON.stringify([
    search,
    tipoTab,
    tipoCliente,
    soloAttivi,
  ]);
  const [lastFilters, setLastFilters] = useState(filteredKey);
  if (lastFilters !== filteredKey) {
    setLastFilters(filteredKey);
    setPage(0);
  }
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 30) - 1),
  );

  return (
    <div className="space-y-4 mt-4">
      <Tabs
        value={tipoTab}
        onValueChange={(v) => {
          if (TIPO_TAB_VALUES.includes(v as TipoTab)) setTipoTab(v as TipoTab);
        }}
      >
        <TabsList>
          <TabsTrigger value="tutti">Tutti</TabsTrigger>
          <TabsTrigger value="cliente">Clienti</TabsTrigger>
          <TabsTrigger value="fornitore">Fornitori</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome, P.IVA, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tipoCliente} onValueChange={setTipoCliente}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            <SelectItem value="B2B">B2B</SelectItem>
            <SelectItem value="B2C">B2C</SelectItem>
            <SelectItem value="PA">PA</SelectItem>
            <SelectItem value="Estero">Estero</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="attivi"
            checked={soloAttivi}
            onCheckedChange={setSoloAttivi}
          />
          <Label htmlFor="attivi" className="text-sm">
            Solo attivi
          </Label>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="divide-y p-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="hidden h-4 w-24 sm:block" />
                <Skeleton className="ml-auto h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : isError ? (
        <div role="alert" className="rounded-xl border p-4">
          Anagrafiche non disponibili: nessun risultato viene mostrato come
          vuoto.
          <Button variant="outline" onClick={() => void refetch()}>
            Riprova
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nessuna anagrafica trovata
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">Anagrafica</th>
                  <th className="p-3 text-left font-medium">P.IVA</th>
                  <th className="p-3 text-left font-medium">Tipo</th>
                  <th className="p-3 text-right font-medium">Fatturato</th>
                  <th className="p-3 text-right font-medium">N. fatture</th>
                  <th className="p-3 text-left font-medium">Ultima fattura</th>
                  <th className="p-3 text-left font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice(currentPage * 30, currentPage * 30 + 30)
                  .map((a) => (
                    <tr
                      key={a.id}
                      className="border-b hover:bg-muted/30 cursor-pointer"
                      onClick={() =>
                        navigate(`/azienda/documenti/anagrafiche/${a.id}`)
                      }
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {getInitials(
                                a.ragione_sociale ?? `${a.nome} ${a.cognome}`,
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {a.ragione_sociale ??
                                `${a.nome ?? ""} ${a.cognome ?? ""}`.trim()}
                            </span>
                            {a.cliente_id && (
                              <Link2 className="h-3.5 w-3.5 text-primary" />
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {a.partita_iva ?? "—"}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="secondary"
                          className={TIPO_COLORS[a.tipo_cliente] ?? ""}
                        >
                          {a.tipo_cliente}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-mono">
                        {formatCurrency(a.fatturato_totale ?? 0)}
                      </td>
                      <td className="p-3 text-right">
                        {a.numero_fatture ?? 0}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {a.ultima_fattura_at
                          ? a.ultima_fattura_at.substring(0, 10)
                          : "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant={a.attivo ? "default" : "secondary"}>
                          {a.attivo ? "Attivo" : "Inattivo"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {!isLoading && !isError && filtered.length > 0 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span>
            {filtered.length} anagrafiche · pagina {currentPage + 1} di{" "}
            {Math.ceil(filtered.length / 30)}
          </span>
          <Button
            variant="outline"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Precedenti
          </Button>
          <Button
            variant="outline"
            disabled={(currentPage + 1) * 30 >= filtered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Successivi
          </Button>
        </div>
      )}
    </div>
  );
}
