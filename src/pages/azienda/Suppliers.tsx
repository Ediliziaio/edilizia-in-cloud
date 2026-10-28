import { FornitoreEditor } from "@/components/suppliers/FornitoreEditor";
import { SchedaFornitore } from "@/components/suppliers/SchedaFornitore";
import { SupplierWorkspacePanel } from "@/components/suppliers/SupplierWorkspacePanel";
import { confermaNavigazioneImpostazioni } from "@/hooks/useSettingsDraftGuard";
import {
  payloadFornitore,
  ricercaFornitore,
} from "@/lib/suppliers/anagraficaFornitore";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useState, useMemo, useRef, useEffect } from "react";
import {
  useNavigate,
  useParams,
  type NavigateFunction,
} from "react-router-dom";
import { format, isPast, isToday, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListinoFornitoreTab } from "@/components/suppliers/ListinoFornitoreTab";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Truck,
  Search,
  Star,
  ArrowLeft,
  CreditCard,
  Package,
  CalendarClock,
  BookOpen,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  ExternalLink,
} from "lucide-react";
import {
  useOperationalSuppliers,
  useSupplierDetail,
} from "@/hooks/useOperationalSuppliers";
import type { SupplierWithStats } from "@/hooks/useOperationalSuppliers";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";

type DatiDettaglioFornitore = ReturnType<typeof useSupplierDetail>;
type OdaRiga = DatiDettaglioFornitore["oda"][number];
type ScadenzaRiga = DatiDettaglioFornitore["scadenze"][number];
type PrimaNotaRiga = DatiDettaglioFornitore["primaNota"][number];

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating)
    return <span className="text-xs text-muted-foreground">N/A</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= rating ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

// ========== LIST VIEW ==========
function SuppliersList({
  onSelectSupplier,
  incorporato = false,
}: {
  onSelectSupplier?: (id: string) => void;
  incorporato?: boolean;
}) {
  const navigate = useNavigate();
  const { suppliers, isLoading, isError, refetch } = useOperationalSuppliers();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    let list = suppliers;
    if (!showInactive) list = list.filter((s) => s.is_active);
    if (search.trim()) {
      list = list.filter((s) => ricercaFornitore(s, search));
    }
    return list;
  }, [suppliers, search, showInactive]);

  const totalDebt = filtered.reduce((s, f) => s + (f.scadenze_importo || 0), 0);
  const overdueCount = filtered.filter(
    (f) => (f.scadenze_importo || 0) > 0,
  ).length;

  if (isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>Ordini e pagamenti non disponibili</AlertTitle>
        <AlertDescription>
          Non riesco a leggere i fornitori o i loro movimenti.
          <Button
            className="ml-3"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
          >
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );

  return (
    <div className="space-y-6">
      {/* Dentro le impostazioni il titolo «Fornitori» c'è già (uno solo per pagina): qui niente titolo né contatore. */}
      {!incorporato && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold">Fornitori</h1>
            <Badge variant="secondary" className="ml-2">
              {filtered.length}
            </Badge>
          </div>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Fornitori attivi</p>
            <p className="text-xl font-bold">
              {suppliers.filter((s) => s.is_active).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Totale OdA</p>
            <p className="text-xl font-bold">
              {formatCurrency(
                suppliers.reduce((s, f) => s + (f.oda_total || 0), 0),
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Debito residuo</p>
            <p
              className={`text-xl font-bold ${totalDebt > 0 ? "text-destructive" : ""}`}
            >
              {formatCurrency(totalDebt)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-xs text-muted-foreground">Con scadenze aperte</p>
            <p className="text-xl font-bold">{overdueCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca fornitore..."
            aria-label="Cerca un fornitore"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant={showInactive ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowInactive(!showInactive)}
        >
          {showInactive ? "Solo attivi" : "Includi inattivi"}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-3 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nessun fornitore trovato.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <Card
              key={s.id}
              role="button"
              tabIndex={0}
              aria-label={`Apri ${s.name}`}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (onSelectSupplier) onSelectSupplier(s.id);
                  else
                    navigate(
                      `/azienda/impostazioni/fornitori?tab=operativo&fornitore=${encodeURIComponent(s.id)}`,
                    );
                }
              }}
              className={`min-w-0 cursor-pointer hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${!s.is_active ? "opacity-60" : ""}`}
              onClick={() =>
                onSelectSupplier
                  ? onSelectSupplier(s.id)
                  : navigate(
                      `/azienda/impostazioni/fornitori?tab=operativo&fornitore=${encodeURIComponent(s.id)}`,
                    )
              }
            >
              <CardContent className="pt-4 pb-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="break-words font-semibold">{s.name}</p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {s.contact_name || "Referente da aggiungere"}
                      {s.contact_role ? ` · ${s.contact_role}` : ""}
                    </p>
                    {s.product_category && (
                      <Badge variant="outline" className="text-xs mt-0.5">
                        {s.product_category}
                      </Badge>
                    )}
                  </div>
                  <RatingStars rating={s.rating} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">OdA</p>
                    <p className="font-medium">
                      {s.oda_count || 0} · {formatCurrency(s.oda_total || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Da pagare</p>
                    <p
                      className={`font-medium ${(s.scadenze_importo || 0) > 0 ? "text-destructive" : ""}`}
                    >
                      {formatCurrency(s.scadenze_importo || 0)}
                    </p>
                  </div>
                </div>

                {!s.is_active && (
                  <Badge variant="secondary" className="text-xs">
                    Inattivo
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== DETAIL VIEW ==========
function SupplierDetail({
  supplierId,
  onBack,
  puoModificare = true,
  incorporato = false,
}: {
  supplierId: string;
  onBack?: () => void;
  /** Senza il permesso la scheda si legge soltanto: niente «Modifica». */
  puoModificare?: boolean;
  /** Dentro le impostazioni il titolo della pagina è già l'h1: il nome del fornitore è un titolo di secondo livello. */
  incorporato?: boolean;
}) {
  const navigate = useNavigate();
  const {
    suppliers,
    isLoading: isSupLoading,
    isError: isSupError,
    refetch: refetchSuppliers,
    update,
  } = useOperationalSuppliers();
  const supplier = suppliers.find((s) => s.id === supplierId);
  const {
    oda,
    isOdaLoading,
    isOdaError,
    scadenze,
    isScadenzeLoading,
    isScadenzeError,
    primaNota,
    isPrimaNotaLoading,
    isPrimaNotaError,
    refetch: refetchDettaglio,
  } = useSupplierDetail(supplierId);
  const [editing, setEditing] = useState(false);
  const [detailTab, setDetailTab] = useState("anagrafica");
  const dettaglioRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isSupLoading)
      dettaglioRef.current?.scrollIntoView?.({ block: "start" });
  }, [supplierId, isSupLoading, supplier?.id]);

  if (isSupLoading) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  if (isSupError)
    return (
      <Alert variant="destructive">
        <AlertTitle>Fornitore non disponibile</AlertTitle>
        <AlertDescription>
          Non riesco a leggere l’anagrafica.
          <Button
            className="ml-3"
            variant="outline"
            size="sm"
            onClick={() => void refetchSuppliers()}
          >
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );

  if (!supplier) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Fornitore non trovato</p>
        <Button
          variant="outline"
          onClick={() => {
            if (confermaNavigazioneImpostazioni()) {
              if (onBack) onBack();
              else navigate("/azienda/fornitori");
            }
          }}
        >
          Torna alla lista
        </Button>
      </div>
    );
  }

  const Titolo = incorporato ? "h2" : "h1";

  const startEdit = () => {
    if (puoModificare) setEditing(true);
  };
  const movimentiErrore = isOdaError || isScadenzeError || isPrimaNotaError;
  const movimentiCaricamento =
    isOdaLoading || isScadenzeLoading || isPrimaNotaLoading;

  // Stats computation
  const totalOda = oda.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalPagato = primaNota
    .filter((e) => e.direction === "uscita")
    .reduce((s: number, e) => s + Number(e.amount), 0);
  const scaduteCount = scadenze.filter(
    (s) => isPast(new Date(s.due_date)) && s.status !== "pagata",
  ).length;
  const openScadenze = scadenze.filter(
    (s) => s.status !== "pagata" && s.status !== "annullata",
  );

  return (
    <div ref={dettaglioRef} className="scroll-mt-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="inline-flex"
          onClick={() => (onBack ? onBack() : navigate("/azienda/fornitori"))}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Fornitori
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <Titolo className="text-2xl font-bold">{supplier.name}</Titolo>
          <div className="flex items-center gap-3 mt-1">
            {supplier.product_category && (
              <Badge variant="outline">{supplier.product_category}</Badge>
            )}
            <RatingStars rating={supplier.rating} />
            {!supplier.is_active && <Badge variant="secondary">Inattivo</Badge>}
            {supplier.is_foreign && <Badge variant="outline">Estero</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {puoModificare && (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="h-4 w-4 mr-1" />
              Modifica
            </Button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      {movimentiErrore ? (
        <Alert variant="destructive">
          <AlertTitle>Movimenti non disponibili</AlertTitle>
          <AlertDescription>
            Nessun totale viene mostrato come zero.
            <Button
              className="ml-3"
              variant="outline"
              size="sm"
              onClick={() => void refetchDettaglio()}
            >
              Riprova movimenti
            </Button>
          </AlertDescription>
        </Alert>
      ) : movimentiCaricamento ? (
        <p
          role="status"
          className="rounded-lg border p-4 text-sm text-muted-foreground"
        >
          Caricamento ordini e pagamenti…
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3" /> Totale OdA
              </p>
              <p className="text-xl font-bold">{formatCurrency(totalOda)}</p>
              <p className="text-xs text-muted-foreground">
                {oda.length} ordini
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CreditCard className="h-3 w-3" /> Totale pagato
              </p>
              <p className="text-xl font-bold">{formatCurrency(totalPagato)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> Scadenze aperte
              </p>
              <p className="text-xl font-bold">{openScadenze.length}</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(supplier.scadenze_importo || 0)} residuo
              </p>
            </CardContent>
          </Card>
          <Card className={scaduteCount > 0 ? "border-destructive" : ""}>
            <CardContent className="pt-3 pb-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Scadute
              </p>
              <p
                className={`text-xl font-bold ${scaduteCount > 0 ? "text-destructive" : ""}`}
              >
                {scaduteCount}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={detailTab}
        onValueChange={(value) => {
          if (confermaNavigazioneImpostazioni()) setDetailTab(value);
        }}
      >
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto [&>button]:shrink-0">
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="contratti">Contratti e ruoli</TabsTrigger>
          <TabsTrigger value="oda">OdA ({oda.length})</TabsTrigger>
          <TabsTrigger value="listino">Listino</TabsTrigger>
          <TabsTrigger value="scadenze">
            Scadenze ({scadenze.length})
          </TabsTrigger>
          <TabsTrigger value="prima-nota">
            Prima Nota ({primaNota.length})
          </TabsTrigger>
          <TabsTrigger value="stats">Statistiche</TabsTrigger>
        </TabsList>

        <TabsContent value="anagrafica" className="mt-4">
          <SchedaFornitore
            supplier={supplier}
            onModifica={puoModificare ? startEdit : undefined}
          />
        </TabsContent>

        <TabsContent value="contratti" className="mt-4">
          <SupplierWorkspacePanel supplierId={supplierId} />
        </TabsContent>

        <TabsContent value="oda" className="mt-4">
          {isOdaError ? (
            <p role="alert">
              Non riesco a leggere gli ordini. Usa «Riprova movimenti».
            </p>
          ) : (
            <OdaTab oda={oda} isLoading={isOdaLoading} navigate={navigate} />
          )}
        </TabsContent>

        <TabsContent value="listino" className="mt-4">
          <ListinoFornitoreTab supplierId={supplierId} />
        </TabsContent>

        <TabsContent value="scadenze" className="mt-4">
          {isScadenzeError ? (
            <p role="alert">
              Non riesco a leggere le scadenze. Usa «Riprova movimenti».
            </p>
          ) : (
            <ScadenzeTab
              scadenze={scadenze}
              isLoading={isScadenzeLoading}
              navigate={navigate}
            />
          )}
        </TabsContent>

        <TabsContent value="prima-nota" className="mt-4">
          {isPrimaNotaError ? (
            <p role="alert">
              Non riesco a leggere la prima nota. Usa «Riprova movimenti».
            </p>
          ) : (
            <PrimaNotaTab
              entries={primaNota}
              isLoading={isPrimaNotaLoading}
              navigate={navigate}
            />
          )}
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          {!movimentiErrore && !movimentiCaricamento && (
            <StatsTab
              supplier={supplier}
              oda={oda}
              scadenze={scadenze}
              primaNota={primaNota}
            />
          )}
        </TabsContent>
      </Tabs>
      <FornitoreEditor
        aperta={editing && puoModificare}
        fornitore={supplier}
        esteroIniziale={supplier.is_foreign}
        fornitori={suppliers}
        categorieEsistenti={[
          ...new Set(
            suppliers
              .map((s) => s.product_category)
              .filter((c): c is string => !!c),
          ),
        ]}
        salvataggio={update.isPending}
        onChiudi={() => setEditing(false)}
        onSalva={(dati) => {
          if (puoModificare)
            update.mutate(
              { id: supplier.id, updates: payloadFornitore(dati) },
              { onSuccess: () => setEditing(false) },
            );
        }}
      />
    </div>
  );
}

// ========== ODA TAB ==========
function OdaTab({
  oda,
  isLoading,
  navigate,
}: {
  oda: OdaRiga[];
  isLoading: boolean;
  navigate: NavigateFunction;
}) {
  if (isLoading)
    return (
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  if (oda.length === 0)
    return (
      <p className="text-center py-8 text-muted-foreground">
        Nessun ordine d'acquisto.
      </p>
    );

  const STATUS_COLORS: Record<string, string> = {
    bozza: "bg-muted text-muted-foreground",
    inviato: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    confermato:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    parziale:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    ricevuto:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    annullato: "bg-destructive/10 text-destructive",
  };

  return (
    <>
      <div className="sm:hidden divide-y border rounded-lg">
        {oda.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 active:bg-muted"
            onClick={() => navigate(`/azienda/ordini-acquisto/${o.id}`)}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium">
                  {o.oda_number}
                </span>
                <Badge className={`text-xs ${STATUS_COLORS[o.status] || ""}`}>
                  {o.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {format(new Date(o.issue_date), "dd/MM/yyyy", { locale: it })}
                {o.expected_delivery_date
                  ? ` · cons. ${format(new Date(o.expected_delivery_date), "dd/MM/yyyy", { locale: it })}`
                  : ""}
              </p>
            </div>
            <span className="font-semibold text-sm shrink-0">
              {formatCurrency(Number(o.total))}
            </span>
          </div>
        ))}
      </div>
      <div className="hidden sm:block rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">N° OdA</th>
              <th className="text-left p-3 font-medium">Data</th>
              <th className="text-left p-3 font-medium">Stato</th>
              <th className="text-right p-3 font-medium">Totale</th>
              <th className="text-left p-3 font-medium">Consegna prevista</th>
              <th className="text-left p-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {oda.map((o) => (
              <tr
                key={o.id}
                className="border-b hover:bg-muted/30 cursor-pointer"
                onClick={() => navigate(`/azienda/ordini-acquisto/${o.id}`)}
              >
                <td className="p-3 font-mono text-xs">{o.oda_number}</td>
                <td className="p-3">
                  {format(new Date(o.issue_date), "dd/MM/yyyy", { locale: it })}
                </td>
                <td className="p-3">
                  <Badge className={`text-xs ${STATUS_COLORS[o.status] || ""}`}>
                    {o.status}
                  </Badge>
                </td>
                <td className="p-3 text-right font-medium">
                  {formatCurrency(Number(o.total))}
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {o.expected_delivery_date
                    ? format(new Date(o.expected_delivery_date), "dd/MM/yyyy", {
                        locale: it,
                      })
                    : "—"}
                </td>
                <td className="p-3">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ========== SCADENZE TAB ==========
function ScadenzeTab({
  scadenze,
  isLoading,
  navigate,
}: {
  scadenze: ScadenzaRiga[];
  isLoading: boolean;
  navigate: NavigateFunction;
}) {
  if (isLoading)
    return (
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  if (scadenze.length === 0)
    return (
      <p className="text-center py-8 text-muted-foreground">
        Nessuna scadenza.
      </p>
    );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/azienda/scadenzario")}
        >
          <CalendarClock className="h-4 w-4 mr-1" /> Vai a Scadenzario
        </Button>
      </div>
      <>
        <div className="sm:hidden divide-y border rounded-lg">
          {scadenze.map((s) => {
            const remaining = Number(s.amount) - Number(s.paid_amount);
            const isOverdue =
              isPast(new Date(s.due_date)) &&
              !isToday(new Date(s.due_date)) &&
              s.status !== "pagata";
            return (
              <div
                key={s.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 ${isOverdue ? "bg-destructive/5" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isOverdue && (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                    {s.status === "pagata" && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    )}
                    <span
                      className={`text-sm font-medium ${isOverdue ? "text-destructive" : ""}`}
                    >
                      {format(new Date(s.due_date), "dd/MM/yyyy", {
                        locale: it,
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {s.description}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-semibold text-sm">
                    {formatCurrency(Number(s.amount))}
                  </span>
                  {s.status !== "pagata" && (
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(remaining)} res.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden sm:block rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Scadenza</th>
                <th className="text-left p-3 font-medium">Descrizione</th>
                <th className="text-right p-3 font-medium">Importo</th>
                <th className="text-right p-3 font-medium">Residuo</th>
                <th className="text-left p-3 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {scadenze.map((s) => {
                const remaining = Number(s.amount) - Number(s.paid_amount);
                const isOverdue =
                  isPast(new Date(s.due_date)) &&
                  !isToday(new Date(s.due_date)) &&
                  s.status !== "pagata";
                return (
                  <tr
                    key={s.id}
                    className={`border-b ${isOverdue ? "bg-destructive/5" : ""}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {isOverdue && (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        )}
                        {s.status === "pagata" && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        )}
                        {format(new Date(s.due_date), "dd/MM/yyyy", {
                          locale: it,
                        })}
                      </div>
                    </td>
                    <td className="p-3 truncate max-w-[200px]">
                      {s.description}
                    </td>
                    <td className="p-3 text-right">
                      {formatCurrency(Number(s.amount))}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {s.status === "pagata" ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                        >
                          Saldato
                        </Badge>
                      ) : (
                        formatCurrency(remaining)
                      )}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          isOverdue
                            ? "destructive"
                            : s.status === "pagata"
                              ? "default"
                              : "outline"
                        }
                        className="text-xs"
                      >
                        {s.status === "pagata"
                          ? "Pagata"
                          : isOverdue
                            ? "Scaduta"
                            : s.status === "parziale"
                              ? "Parziale"
                              : "Aperta"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>
    </div>
  );
}

// ========== PRIMA NOTA TAB ==========
function PrimaNotaTab({
  entries,
  isLoading,
  navigate,
}: {
  entries: PrimaNotaRiga[];
  isLoading: boolean;
  navigate: NavigateFunction;
}) {
  if (isLoading)
    return (
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  if (entries.length === 0)
    return (
      <p className="text-center py-8 text-muted-foreground">
        Nessun movimento.
      </p>
    );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/azienda/prima-nota")}
        >
          <BookOpen className="h-4 w-4 mr-1" /> Vai a Prima Nota
        </Button>
      </div>
      <>
        <div className="sm:hidden divide-y border rounded-lg">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{e.description}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(e.entry_date), "dd/MM/yyyy", { locale: it })}{" "}
                  · {e.account_label || "—"}
                </p>
              </div>
              <span
                className={`font-semibold text-sm shrink-0 font-mono ${e.direction === "entrata" ? "text-green-700 dark:text-green-400" : "text-destructive"}`}
              >
                {e.direction === "uscita" ? "-" : "+"}
                {formatCurrency(Number(e.amount))}
              </span>
            </div>
          ))}
        </div>
        <div className="hidden sm:block rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Data</th>
                <th className="text-left p-3 font-medium">Descrizione</th>
                <th className="text-left p-3 font-medium">Conto</th>
                <th className="text-right p-3 font-medium">Importo</th>
                <th className="text-left p-3 font-medium">Metodo</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="p-3">
                    {format(new Date(e.entry_date), "dd/MM/yyyy", {
                      locale: it,
                    })}
                  </td>
                  <td className="p-3 truncate max-w-[250px]">
                    {e.description}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground capitalize">
                    {e.account_label || "—"}
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span
                      className={
                        e.direction === "entrata"
                          ? "text-green-700 dark:text-green-400"
                          : "text-destructive"
                      }
                    >
                      {e.direction === "uscita" ? "-" : "+"}
                      {formatCurrency(Number(e.amount))}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground capitalize">
                    {e.payment_method || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    </div>
  );
}

// ========== STATS TAB (with chart) ==========
function StatsTab({
  supplier,
  oda,
  scadenze,
  primaNota,
}: {
  supplier: SupplierWithStats;
  oda: OdaRiga[];
  scadenze: ScadenzaRiga[];
  primaNota: PrimaNotaRiga[];
}) {
  const totalOda = oda.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalPagato = primaNota
    .filter((e) => e.direction === "uscita")
    .reduce((s: number, e) => s + Number(e.amount), 0);
  const scaduteCount = scadenze.filter(
    (s) => isPast(new Date(s.due_date)) && s.status !== "pagata",
  ).length;

  // Monthly spending chart (last 6 months)
  const monthlyData = useMemo(() => {
    const now = new Date();
    const months: { month: string; totale: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM yy", { locale: it });
      const tot = primaNota
        .filter(
          (e) => e.direction === "uscita" && e.entry_date?.startsWith(key),
        )
        .reduce((s: number, e) => s + Number(e.amount), 0);
      months.push({ month: label, totale: tot });
    }
    return months;
  }, [primaNota]);

  const hasChartData = monthlyData.some((m) => m.totale > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Totale OdA</p>
            <p className="text-xl font-bold">{formatCurrency(totalOda)}</p>
            <p className="text-xs text-muted-foreground">{oda.length} ordini</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Totale pagato</p>
            <p className="text-xl font-bold">{formatCurrency(totalPagato)}</p>
            <p className="text-xs text-muted-foreground">
              {primaNota.filter((e) => e.direction === "uscita").length}{" "}
              movimenti
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Scadenze aperte</p>
            <p className="text-xl font-bold">
              {
                scadenze.filter(
                  (s) => s.status !== "pagata" && s.status !== "annullata",
                ).length
              }
            </p>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(supplier.scadenze_importo || 0)} residuo
            </p>
          </CardContent>
        </Card>
        <Card className={scaduteCount > 0 ? "border-destructive" : ""}>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Scadute</p>
            <p
              className={`text-xl font-bold ${scaduteCount > 0 ? "text-destructive" : ""}`}
            >
              {scaduteCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly spending chart */}
      {hasChartData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" /> Spesa mensile (ultimi 6 mesi)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={formatCurrencyCompact}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      formatCurrency(value),
                      "Spesa",
                    ]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar
                    dataKey="totale"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ========== EMBEDDED EXPORT (for Settings page) ==========
export function SuppliersOperational({
  puoModificare = true,
  incorporato = false,
  fornitoreId,
  onSeleziona,
}: {
  fornitoreId?: string | null;
  onSeleziona?: (id: string | null) => void;
  /** Senza il permesso la scheda del fornitore si legge soltanto. */
  puoModificare?: boolean;
  /** Dentro le impostazioni il titolo «Fornitori» c'è già: qui non si ripete (e non c'è un secondo h1). */
  incorporato?: boolean;
} = {}) {
  const [locale, setLocale] = useState<string | null>(null);
  const selectedId = fornitoreId === undefined ? locale : fornitoreId;
  const setSelectedId = onSeleziona ?? setLocale;

  if (selectedId) {
    return (
      <SupplierDetail
        supplierId={selectedId}
        onBack={() => setSelectedId(null)}
        puoModificare={puoModificare}
        incorporato={incorporato}
      />
    );
  }
  return (
    <SuppliersList
      onSelectSupplier={(id) => setSelectedId(id)}
      incorporato={incorporato}
    />
  );
}

// ========== MAIN EXPORT ==========
export default function Suppliers() {
  const { id } = useParams();
  if (id) return <SupplierDetail supplierId={id} />;
  return <SuppliersList />;
}
