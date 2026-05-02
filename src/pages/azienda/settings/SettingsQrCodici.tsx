/**
 * SettingsQrCodici — pagina di amministrazione del sistema QR Magazzino.
 *
 * 3 tab:
 *   1. Panoramica  — KPI copertura QR e scan events recenti.
 *   2. Per fornitore — tabella copertura barcode per ciascun fornitore.
 *   3. Test scan   — input testuale o scanner per testare la cascata di lookup
 *                    (parser GS1 + RPC warehouse_scan_lookup + decideUiAction).
 *
 * Permessi: company_admin (cliente) e super_admin (impersonation).
 *
 * Si appoggia a:
 *   - useAuth().effectiveCompany per scoping multi-tenant
 *   - queryKeys.warehouse.qrStats / qrBySupplier / scanEvents
 *   - useBarcodeLookup per il flusso "test scan"
 *   - BarcodeScanner per opening della camera (single-shot)
 */

import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useBarcodeLookup } from "@/hooks/warehouse/useBarcodeLookup";
import { format } from "date-fns";
import { it as itLocale } from "date-fns/locale";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  QrCode,
  Camera,
  ScanLine,
  Package,
  TrendingUp,
  Users,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";

const BarcodeScanner = lazy(() =>
  import("@/components/warehouse/BarcodeScanner").then((m) => ({ default: m.BarcodeScanner })),
);

// ────────────────────────────────────────────────────────────
// Tipi locali per le query (evitiamo coupling stretto con types DB)
// ────────────────────────────────────────────────────────────

interface QrStats {
  totalItems: number;
  itemsWithBarcode: number;
  itemsSerialized: number;
  totalUnits: number;
  unitsAvailable: number;
  scans7d: number;
  matchedScans7d: number;
}

interface ScanEventRow {
  id: string;
  created_at: string;
  scanned_code: string;
  scan_type: string;
  resolution_status: string;
  resolved_stock_item_id: string | null;
  resolved_stock_unit_id: string | null;
  warehouse_id: string | null;
  user_id: string | null;
}

interface SupplierCoverageRow {
  id: string;
  name: string;
  uses_gs1: boolean | null;
  default_qr_format: string | null;
  totalItems: number;
  itemsWithBarcode: number;
  coveragePct: number;
}

// ────────────────────────────────────────────────────────────
// Tab 1 — Panoramica
// ────────────────────────────────────────────────────────────

function PanoramicaTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: stats, isLoading: statsLoading, isError: statsIsError, error: statsError, refetch: refetchStats } = useQuery({
    queryKey: queryKeys.warehouse.qrStats(companyId),
    queryFn: async (): Promise<QrStats> => {
      if (!companyId) {
        return {
          totalItems: 0,
          itemsWithBarcode: 0,
          itemsSerialized: 0,
          totalUnits: 0,
          unitsAvailable: 0,
          scans7d: 0,
          matchedScans7d: 0,
        };
      }

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // 4 query in parallelo per i conteggi (head:true → solo metadata, no payload)
      const [items, itemsBc, itemsSer, units, unitsAvail, scans, scansMatched] = await Promise.all([
        supabase.from("warehouse_stock").select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase.from("warehouse_stock").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).not("barcode", "is", null),
        supabase.from("warehouse_stock").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("tracking_mode", "serialized"),
        supabase.from("stock_units").select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase.from("stock_units").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).eq("status", "available"),
        supabase.from("warehouse_scan_events").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).gte("created_at", sevenDaysAgo),
        supabase.from("warehouse_scan_events").select("id", { count: "exact", head: true })
          .eq("company_id", companyId).gte("created_at", sevenDaysAgo).eq("resolution_status", "matched"),
      ]);
      const failedCount = [items, itemsBc, itemsSer, units, unitsAvail, scans, scansMatched].find((res) => res.error);
      if (failedCount?.error) throw failedCount.error;

      return {
        totalItems: items.count ?? 0,
        itemsWithBarcode: itemsBc.count ?? 0,
        itemsSerialized: itemsSer.count ?? 0,
        totalUnits: units.count ?? 0,
        unitsAvailable: unitsAvail.count ?? 0,
        scans7d: scans.count ?? 0,
        matchedScans7d: scansMatched.count ?? 0,
      };
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const { data: recentScans = [], isLoading: scansLoading, isError: scansIsError, error: scansError, refetch: refetchScans } = useQuery({
    queryKey: queryKeys.warehouse.scanEvents(companyId, "recent"),
    queryFn: async (): Promise<ScanEventRow[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("warehouse_scan_events")
        .select("id, created_at, scanned_code, scan_type, resolution_status, resolved_stock_item_id, resolved_stock_unit_id, warehouse_id, user_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as ScanEventRow[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const coveragePct = stats && stats.totalItems > 0
    ? Math.round((stats.itemsWithBarcode / stats.totalItems) * 100)
    : 0;

  const matchRate7d = stats && stats.scans7d > 0
    ? Math.round((stats.matchedScans7d / stats.scans7d) * 100)
    : 0;

  if (statsIsError || scansIsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Impossibile caricare i dati QR</AlertTitle>
        <AlertDescription className="space-y-3">
          <p className="text-xs">
            {(statsError as Error | null)?.message || (scansError as Error | null)?.message || "Errore durante il caricamento delle statistiche QR."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchStats();
              void refetchScans();
            }}
          >
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          icon={Package}
          label="Articoli"
          value={statsLoading ? "…" : String(stats?.totalItems ?? 0)}
          hint={`${stats?.itemsWithBarcode ?? 0} con barcode`}
          accent="primary"
        />
        <KpiCard
          icon={QrCode}
          label="Copertura QR"
          value={statsLoading ? "…" : `${coveragePct}%`}
          hint="articoli con barcode"
          accent={coveragePct >= 50 ? "emerald" : coveragePct >= 20 ? "amber" : "rose"}
        />
        <KpiCard
          icon={Users}
          label="Seriali"
          value={statsLoading ? "…" : String(stats?.unitsAvailable ?? 0)}
          hint={`su ${stats?.totalUnits ?? 0} totali · ${stats?.itemsSerialized ?? 0} articoli`}
          accent="blue"
        />
        <KpiCard
          icon={ScanLine}
          label="Scan 7gg"
          value={statsLoading ? "…" : String(stats?.scans7d ?? 0)}
          hint={`${matchRate7d}% match riusciti`}
          accent="primary"
        />
      </div>

      {/* Recent scan events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Ultime scansioni
          </CardTitle>
          <CardDescription>
            Audit trail delle 50 scansioni più recenti (lookup, carico, scarico).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scansLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : recentScans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ScanLine className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nessuna scansione registrata. Inizia a usare lo scanner dal magazzino.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Quando</TableHead>
                    <TableHead>Codice</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Esito</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentScans.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(s.created_at), "dd MMM HH:mm", { locale: itLocale })}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.scanned_code.length > 32 ? `${s.scanned_code.slice(0, 32)}…` : s.scanned_code}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{s.scan_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <ResolutionBadge status={s.resolution_status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResolutionBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    matched: { label: "Match OK", className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    matched_ambiguous: { label: "Ambiguo", className: "bg-amber-100 text-amber-700 border-amber-200", icon: HelpCircle },
    new_item_created: { label: "Nuovo articolo", className: "bg-blue-100 text-blue-700 border-blue-200", icon: Package },
    unresolved: { label: "Non trovato", className: "bg-zinc-100 text-zinc-700 border-zinc-200", icon: HelpCircle },
    rejected: { label: "Rifiutato", className: "bg-rose-100 text-rose-700 border-rose-200", icon: AlertCircle },
  };
  const c = cfg[status] ?? cfg.unresolved;
  const Icon = c.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-[10px] ${c.className}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof QrCode;
  label: string;
  value: string;
  hint?: string;
  accent: "primary" | "emerald" | "amber" | "rose" | "blue";
}) {
  const accentMap = {
    primary: "border-l-primary",
    emerald: "border-l-emerald-500",
    amber: "border-l-amber-500",
    rose: "border-l-rose-500",
    blue: "border-l-blue-500",
  };
  return (
    <div className={`rounded-lg border-l-4 ${accentMap[accent]} bg-card p-3`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-xl font-bold mt-1">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p> : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab 2 — Per fornitore
// ────────────────────────────────────────────────────────────

function PerFornitoreTab() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: rows = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.warehouse.qrBySupplier(companyId),
    queryFn: async (): Promise<SupplierCoverageRow[]> => {
      if (!companyId) return [];
      // Una sola round-trip: prendiamo fornitori + articoli relativi.
      const { data: suppliers, error: e1 } = await supabase
        .from("suppliers")
        .select("id, name, uses_gs1, default_qr_format")
        .eq("company_id", companyId)
        .order("name");
      if (e1) throw e1;

      const { data: items, error: e2 } = await supabase
        .from("warehouse_stock")
        .select("id, supplier_id, barcode")
        .eq("company_id", companyId);
      if (e2) throw e2;

      // Aggregazione client-side: per ogni supplier, conta items + items con barcode.
      const itemsBySupplier = new Map<string, { total: number; withBc: number }>();
      (items ?? []).forEach((it: { supplier_id: string | null; barcode: string | null }) => {
        if (!it.supplier_id) return;
        const cur = itemsBySupplier.get(it.supplier_id) ?? { total: 0, withBc: 0 };
        cur.total += 1;
        if (it.barcode) cur.withBc += 1;
        itemsBySupplier.set(it.supplier_id, cur);
      });

      return ((suppliers ?? []) as Array<{
        id: string;
        name: string;
        uses_gs1: boolean | null;
        default_qr_format: string | null;
      }>).map((s) => {
        const cnt = itemsBySupplier.get(s.id) ?? { total: 0, withBc: 0 };
        return {
          id: s.id,
          name: s.name,
          uses_gs1: s.uses_gs1,
          default_qr_format: s.default_qr_format,
          totalItems: cnt.total,
          itemsWithBarcode: cnt.withBc,
          coveragePct: cnt.total > 0 ? Math.round((cnt.withBc / cnt.total) * 100) : 0,
        };
      });
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Copertura QR per fornitore
        </CardTitle>
        <CardDescription>
          Quanti articoli per fornitore hanno un barcode/QR registrato.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Impossibile caricare la copertura fornitori</AlertTitle>
            <AlertDescription className="space-y-3">
              <p className="text-xs">{(error as Error | null)?.message || "Errore durante il caricamento."}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
                Riprova
              </Button>
            </AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nessun fornitore configurato. Aggiungi fornitori dalla sezione Fornitori.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornitore</TableHead>
                  <TableHead className="text-right">Articoli</TableHead>
                  <TableHead className="text-right">Con barcode</TableHead>
                  <TableHead className="text-right">Copertura</TableHead>
                  <TableHead>GS1</TableHead>
                  <TableHead>Formato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right text-sm">{r.totalItems}</TableCell>
                    <TableCell className="text-right text-sm">{r.itemsWithBarcode}</TableCell>
                    <TableCell className="text-right">
                      <CoverageBar pct={r.coveragePct} />
                    </TableCell>
                    <TableCell>
                      {r.uses_gs1 ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Sì</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.default_qr_format ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CoverageBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center justify-end gap-2 min-w-[120px]">
      <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs font-medium w-9 text-right">{pct}%</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab 3 — Test scan
// ────────────────────────────────────────────────────────────

function TestScanTab() {
  const lookup = useBarcodeLookup();
  const [manualCode, setManualCode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    lookup.mutate({ rawScan: code });
  };

  const handleCameraScan = (code: string) => {
    setScannerOpen(false);
    setManualCode(code);
    lookup.mutate({ rawScan: code });
  };

  const result = lookup.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScanLine className="h-4 w-4" />
            Test cascata di lookup
          </CardTitle>
          <CardDescription>
            Inserisci un codice o scansiona dalla camera per simulare il flusso di risoluzione
            (parser GS1 → RPC warehouse_scan_lookup → decisione UI).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="test-code" className="text-xs">Codice (incolla o digita)</Label>
              <Input
                id="test-code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Es. 8001234567890 oppure 0108001234567890..."
                autoComplete="off"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2 sm:items-end">
              <Button type="submit" disabled={!manualCode.trim() || lookup.isPending}>
                {lookup.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ScanLine className="h-4 w-4 mr-2" />}
                Risolvi
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setScannerOpen(true)}
                disabled={lookup.isPending}
              >
                <Camera className="h-4 w-4 mr-2" />
                Camera
              </Button>
            </div>
          </form>

          {lookup.isError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Errore nella risoluzione</AlertTitle>
              <AlertDescription className="text-xs">
                {(lookup.error as Error)?.message ?? "Riprova."}
              </AlertDescription>
            </Alert>
          )}

          {result && <TestResultCard result={result} />}
        </CardContent>
      </Card>

      <Suspense fallback={null}>
        {scannerOpen && (
          <BarcodeScanner
            open={scannerOpen}
            onOpenChange={setScannerOpen}
            onScan={handleCameraScan}
          />
        )}
      </Suspense>
    </div>
  );
}

function TestResultCard({ result }: { result: NonNullable<ReturnType<typeof useBarcodeLookup>["data"]> }) {
  const action = result.action;
  return (
    <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[11px] uppercase text-muted-foreground">Input</p>
          <p className="font-mono text-xs break-all">{result.rawScan}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-muted-foreground">Chiave normalizzata</p>
          <p className="font-mono text-xs break-all">{result.parsedPrimary}</p>
        </div>
      </div>

      {result.gs1Detected && result.gs1 && (
        <div className="text-xs space-y-1 border-l-2 border-emerald-300 pl-3">
          <p className="font-medium text-emerald-700">GS1 rilevato</p>
          {result.gs1.gtin && <p>GTIN: <span className="font-mono">{result.gs1.gtin}</span></p>}
          {result.gs1.serialNumber && <p>Seriale: <span className="font-mono">{result.gs1.serialNumber}</span></p>}
          {result.gs1.lotNumber && <p>Lotto: <span className="font-mono">{result.gs1.lotNumber}</span></p>}
          {result.gs1.expiryDate && <p>Scadenza: <span className="font-mono">{result.gs1.expiryDate}</span></p>}
        </div>
      )}

      <div className="border-t pt-3">
        <p className="text-[11px] uppercase text-muted-foreground mb-1">Decisione UI</p>
        <ActionDescription action={action} />
        {action.kind === "confirm_ambiguous" && (
          <ul className="mt-2 space-y-1 text-xs">
            {action.rows.map((r, i) => (
              <li key={`${r.stock_item_id}-${i}`} className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{r.match_type}</Badge>
                <span className="font-medium">{r.item_name ?? "—"}</span>
                {r.supplier_name && (
                  <span className="text-muted-foreground">· {r.supplier_name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActionDescription({ action }: { action: ReturnType<typeof useBarcodeLookup>["data"] extends { action: infer A } ? A : never }) {
  switch (action.kind) {
    case "accept_unit":
      return (
        <div className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Match seriale</p>
            <p className="text-xs text-muted-foreground">
              Il sistema procede automaticamente con questa unità: <code className="font-mono">{action.unitId.slice(0, 8)}…</code>
            </p>
          </div>
        </div>
      );
    case "accept_item":
      return (
        <div className="flex items-start gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Match articolo</p>
            <p className="text-xs text-muted-foreground">
              Articolo identificato: <code className="font-mono">{action.itemId.slice(0, 8)}…</code> — il sistema procede.
            </p>
          </div>
        </div>
      );
    case "confirm_ambiguous":
      return (
        <div className="flex items-start gap-2 text-sm">
          <HelpCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Ambiguo — l'utente deve scegliere</p>
            <p className="text-xs text-muted-foreground">
              {action.rows.length} candidati. Il sistema mostra dialog di conferma.
            </p>
          </div>
        </div>
      );
    case "offer_create_new":
      return (
        <div className="flex items-start gap-2 text-sm">
          <Package className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Nessun match — proponi nuovo articolo</p>
            <p className="text-xs text-muted-foreground">
              Il sistema apre StockItemDialog con barcode pre-compilato.
            </p>
          </div>
        </div>
      );
  }
}

// ────────────────────────────────────────────────────────────
// Pagina principale
// ────────────────────────────────────────────────────────────

export default function SettingsQrCodici() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const [tab, setTab] = useState("panoramica");

  useEffect(() => {
    if (!isAdmin) navigate("/azienda", { replace: true });
  }, [isAdmin, navigate]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <QrCode className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold leading-tight">QR & Codici</h1>
          <p className="text-sm text-muted-foreground">
            Configurazione e monitoraggio del sistema di scansione barcode/QR per il magazzino.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="panoramica">Panoramica</TabsTrigger>
          <TabsTrigger value="per-fornitore">Per fornitore</TabsTrigger>
          <TabsTrigger value="test-scan">Test scan</TabsTrigger>
        </TabsList>
        <TabsContent value="panoramica" className="mt-4">
          <PanoramicaTab />
        </TabsContent>
        <TabsContent value="per-fornitore" className="mt-4">
          <PerFornitoreTab />
        </TabsContent>
        <TabsContent value="test-scan" className="mt-4">
          <TestScanTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
