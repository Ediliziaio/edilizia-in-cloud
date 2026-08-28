import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/formatters";
import { useNavigate } from "react-router-dom";
import { useAnagraficheNative } from "@/hooks/useAnagraficheNative";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAnagraficheWithReconciliation,
  useSuggestedMatches,
  useLinkAnagraficaToCliente,
  useUnlinkAnagraficaFromCliente,
} from "@/hooks/billing/useAnagraficaReconciliation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, Search, Upload, Link2, Unlink, ArrowRightLeft,
  Check, RefreshCw, Info, Users,
} from "lucide-react";
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

export default function AnagraficheList({ embedded = false }: AnagraficheListProps = {}) {
  const companyId = useEffectiveCompanyId();
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState<"anagrafiche" | "riconciliazione">("anagrafiche");

  return (
    <div className={cn("space-y-6", !embedded && "p-6")}>
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/40 px-4 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900 sm:text-2xl">Clienti fiscali</h1>
              <p className="mt-0.5 text-sm text-slate-500">Clienti e fornitori fiscali per fatturazione, SDI e riconciliazione.</p>
            </div>
          </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-1" /> Importa Excel
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm hover:from-orange-600 hover:to-amber-600"
            onClick={() => toast.info("Creazione manuale anagrafica non ancora disponibile", {
              description: "Usa l'import Excel o crea l'anagrafica durante l'emissione di un documento.",
            })}
          >
            <Plus className="h-4 w-4 mr-1" /> Nuova anagrafica
          </Button>
        </div>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as typeof mainTab)}>
        <TabsList>
          <TabsTrigger value="anagrafiche">Anagrafiche</TabsTrigger>
          <TabsTrigger value="riconciliazione" className="gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Riconciliazione Clienti
            <SuggestedMatchBadge companyId={companyId} />
          </TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafiche">
          <AnagraficheTable />
        </TabsContent>

        <TabsContent value="riconciliazione">
          <ReconciliazionePanel companyId={companyId} userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Badge count for suggested matches ─────────────────────────

function SuggestedMatchBadge({ companyId }: { companyId: string | null }) {
  const { data: suggestions } = useSuggestedMatches(companyId);
  if (!suggestions?.length) return null;
  return (
    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
      {suggestions.length}
    </Badge>
  );
}

// ─── Anagrafiche Table (existing) ──────────────────────────────

function AnagraficheTable() {
  const navigate = useNavigate();
  const [tipoTab, setTipoTab] = useState<TipoTab>("tutti");
  const [search, setSearch] = useState("");
  const [tipoCliente, setTipoCliente] = useState<string>("all");
  const [soloAttivi, setSoloAttivi] = useState(true);

  const { data: rawData, isLoading } = useAnagraficheNative(search || undefined, !soloAttivi);
  const anagrafiche = useMemo(() => (rawData ?? []) as unknown as AnagraficaNative[], [rawData]);

  const filtered = useMemo(() => {
    return anagrafiche.filter((a) => {
      if (tipoTab === "cliente" && a.tipo !== "cliente" && a.tipo !== "entrambi") return false;
      if (tipoTab === "fornitore" && a.tipo !== "fornitore" && a.tipo !== "entrambi") return false;
      if (tipoCliente !== "all" && a.tipo_cliente !== tipoCliente) return false;
      if (soloAttivi && !a.attivo) return false;
      return true;
    });
  }, [anagrafiche, tipoTab, tipoCliente, soloAttivi]);

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
          <Switch id="attivi" checked={soloAttivi} onCheckedChange={setSoloAttivi} />
          <Label htmlFor="attivi" className="text-sm">Solo attivi</Label>
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nessuna anagrafica trovata</div>
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
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/azienda/documenti/anagrafiche/${a.id}`)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(a.ragione_sociale ?? `${a.nome} ${a.cognome}`)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {a.ragione_sociale ?? `${a.nome ?? ""} ${a.cognome ?? ""}`.trim()}
                          </span>
                          {a.cliente_id && (
                            <Link2 className="h-3.5 w-3.5 text-primary" />
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs">{a.partita_iva ?? "—"}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className={TIPO_COLORS[a.tipo_cliente] ?? ""}>
                        {a.tipo_cliente}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono">{formatCurrency(a.fatturato_totale ?? 0)}</td>
                    <td className="p-3 text-right">{a.numero_fatture ?? 0}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {a.ultima_fattura_at ? a.ultima_fattura_at.substring(0, 10) : "—"}
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
    </div>
  );
}

// ─── Riconciliazione Panel ─────────────────────────────────────

function ReconciliazionePanel({ companyId, userId }: { companyId: string | null; userId?: string }) {
  const { data: suggestions, isLoading: loadingSugg } = useSuggestedMatches(companyId);
  const { data: anagrafiche, isLoading: loadingAna } = useAnagraficheWithReconciliation(companyId);
  const linkMutation = useLinkAnagraficaToCliente();
  const unlinkMutation = useUnlinkAnagraficaFromCliente();

  const linked = anagrafiche?.filter((a) => a.cliente_id) ?? [];
  const unlinked = anagrafiche?.filter((a) => !a.cliente_id) ?? [];
  const isLoading = loadingSugg || loadingAna;

  if (!companyId) return null;

  return (
    <div className="space-y-6 mt-4">
      {/* Info banner */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-sm">Collega Anagrafica Fiscale ai Clienti Cantieri</p>
            <p className="text-xs text-muted-foreground mt-1">
              L'anagrafica fiscale e i clienti cantieri sono registri separati.
              Collegandoli puoi associare fatture agli ordini e sincronizzare i dati.
              Il collegamento è opzionale.
            </p>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {/* Suggested matches */}
      {!isLoading && (suggestions?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4 text-primary" />
              Match suggeriti ({suggestions?.length})
              <span className="text-xs font-normal text-muted-foreground">
                — rilevati per Codice Fiscale o nome simile
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestions?.map((s) => (
              <div key={s.anagrafica.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                {/* Anagrafica side */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.anagrafica.ragione_sociale ?? "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {s.anagrafica.partita_iva ?? s.anagrafica.codice_fiscale ?? "—"}
                  </p>
                </div>

                {/* Match indicator */}
                <Badge
                  variant={s.matchType === "exact_cf" ? "default" : "secondary"}
                  className="shrink-0"
                >
                  {s.matchType === "exact_cf" ? "CF esatto" : `${s.confidence}% nome`}
                </Badge>

                {/* Profile side */}
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-sm font-medium truncate">
                    {s.suggestedClient.first_name} {s.suggestedClient.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.suggestedClient.email}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={linkMutation.isPending}
                    onClick={() =>
                      linkMutation.mutate({
                        anagraficaId: s.anagrafica.id,
                        clienteId: s.suggestedClient.id,
                        companyId,
                        performedBy: userId,
                      })
                    }
                  >
                    <Link2 className="h-3.5 w-3.5 mr-1" />
                    Collega
                  </Button>
                  <Button
                    size="sm"
                    disabled={linkMutation.isPending}
                    onClick={() =>
                      linkMutation.mutate({
                        anagraficaId: s.anagrafica.id,
                        clienteId: s.suggestedClient.id,
                        syncFromCliente: true,
                        companyId,
                        performedBy: userId,
                      })
                    }
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Collega + Sync
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Already linked */}
      {!isLoading && linked.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Check className="h-4 w-4 text-green-600" />
              Già collegate ({linked.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">Anagrafica Fiscale</th>
                  <th className="p-3 text-left font-medium">Cliente Cantieri</th>
                  <th className="p-3 text-left font-medium">Sync</th>
                  <th className="p-3 text-right font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {linked.map((a) => (
                  <tr key={a.id} className="border-b">
                    <td className="p-3">
                      <p className="font-medium text-sm">{a.ragione_sociale ?? "—"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{a.partita_iva ?? a.codice_fiscale ?? "—"}</p>
                    </td>
                    <td className="p-3">
                      <p className="text-sm">{a.cliente?.first_name} {a.cliente?.last_name}</p>
                      <p className="text-xs text-muted-foreground">{a.cliente?.email ?? "—"}</p>
                    </td>
                    <td className="p-3">
                      {a.sync_from_cliente ? (
                        <Badge variant="default" className="gap-1">
                          <RefreshCw className="h-3 w-3" /> Attiva
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Solo link</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={unlinkMutation.isPending}
                        onClick={() =>
                          unlinkMutation.mutate({ anagraficaId: a.id, companyId: companyId!, performedBy: userId })
                        }
                      >
                        <Unlink className="h-3.5 w-3.5 mr-1" /> Scollega
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Unlinked — manual search */}
      {!isLoading && unlinked.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-muted-foreground" />
              Non collegate ({unlinked.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <ManualLinkTable
              unlinked={unlinked}
              companyId={companyId}
              userId={userId}
              linkMutation={linkMutation}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Manual Link Table ─────────────────────────────────────────

function ManualLinkTable({
  unlinked,
  companyId,
  userId,
  linkMutation,
}: {
  unlinked: Array<{ id: string; ragione_sociale: string | null; partita_iva: string | null; codice_fiscale: string | null }>;
  companyId: string;
  userId?: string;
  linkMutation: ReturnType<typeof useLinkAnagraficaToCliente>;
}) {
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  const { data: allClienti } = useQuery({
    queryKey: ["clienti-for-reconciliation", companyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, fiscal_code")
        .eq("company_id", companyId)
        .order("last_name");
      return (data ?? []) as unknown as Array<{
        id: string; first_name: string | null; last_name: string; email: string; fiscal_code: string | null;
      }>;
    },
  });

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/50">
          <th className="p-3 text-left font-medium">Anagrafica Fiscale</th>
          <th className="p-3 text-left font-medium">Collega a Cliente</th>
        </tr>
      </thead>
      <tbody>
        {unlinked.map((ana) => {
          const term = searchTerms[ana.id] ?? "";
          const filtered = (allClienti ?? []).filter(
            (c) =>
              !term ||
              `${c.first_name} ${c.last_name}`.toLowerCase().includes(term.toLowerCase()) ||
              (c.fiscal_code ?? "").includes(term) ||
              c.email.toLowerCase().includes(term.toLowerCase())
          );

          return (
            <tr key={ana.id} className="border-b">
              <td className="p-3">
                <p className="font-medium text-sm">{ana.ragione_sociale ?? "—"}</p>
                <p className="text-xs text-muted-foreground font-mono">{ana.partita_iva ?? ana.codice_fiscale ?? "—"}</p>
              </td>
              <td className="p-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Search className="h-3.5 w-3.5" />
                      Cerca cliente...
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2" align="start">
                    <Input
                      placeholder="Cerca per nome, email, CF..."
                      value={term}
                      onChange={(e) => setSearchTerms((s) => ({ ...s, [ana.id]: e.target.value }))}
                      className="mb-2 h-8 text-xs"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {filtered.slice(0, 20).map((c) => (
                        <button
                          key={c.id}
                          className="w-full text-left p-2 rounded hover:bg-muted text-sm flex justify-between items-center"
                          onClick={() =>
                            linkMutation.mutate({ anagraficaId: ana.id, clienteId: c.id, companyId, performedBy: userId })
                          }
                        >
                          <span className="truncate">{c.first_name} {c.last_name}</span>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">
                            {c.fiscal_code ?? c.email}
                          </span>
                        </button>
                      ))}
                      {filtered.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3">Nessun cliente trovato</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
