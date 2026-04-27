/**
 * WarehouseQuickScanSheet — accesso veloce allo scanner dalle Giacenze.
 *
 * Flusso (mobile-first, Sheet bottom):
 *   1. Apertura → input testuale focused + pulsante Camera
 *   2. Scan/submit → useBarcodeLookup risolve cascata (parser GS1 → RPC → decideUiAction)
 *   3. Risultato:
 *      - accept_unit / accept_item → mostra dettagli + CTA "Filtra in tabella" e "Modifica articolo"
 *      - confirm_ambiguous       → lista candidati cliccabili
 *      - offer_create_new        → CTA "Crea articolo" (apre StockItemDialog con barcode prefilled)
 *   4. Dopo l'azione, l'input torna in focus per la scansione successiva
 *      (continuous flow per inventari massivi).
 *
 * Differenza con il futuro BatchBarcodeScanner (MP2):
 *   - Quick scan = single-shot, focus su LOOKUP+azione contestuale (no carico/scarico batch)
 *   - Batch scanner = continuous, accumula molte scansioni e poi commit unico
 */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ScanLine,
  Camera,
  Loader2,
  CheckCircle2,
  HelpCircle,
  Package,
  AlertCircle,
  Filter,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { useBarcodeLookup, type RawMatchRow } from "@/hooks/warehouse/useBarcodeLookup";

const BarcodeScanner = lazy(() =>
  import("./BarcodeScanner").then((m) => ({ default: m.BarcodeScanner })),
);

interface WarehouseQuickScanSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Callback: filtra/seleziona l'articolo in tabella per ID. */
  onSelectItem: (stockItemId: string) => void;
  /** Callback: apri il dialog di modifica articolo. */
  onEditItem: (stockItemId: string) => void;
  /** Callback: crea nuovo articolo con barcode pre-compilato. */
  onCreateFromBarcode: (barcode: string) => void;
}

export function WarehouseQuickScanSheet({
  open,
  onOpenChange,
  onSelectItem,
  onEditItem,
  onCreateFromBarcode,
}: WarehouseQuickScanSheetProps) {
  const [code, setCode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const lookup = useBarcodeLookup();
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open: clear input, focus, reset lookup state.
  useEffect(() => {
    if (open) {
      setCode("");
      lookup.reset();
      // Defer focus per dare al Sheet il tempo di animarsi.
      const t = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = useCallback(
    (raw: string) => {
      const c = raw.trim();
      if (!c) return;
      lookup.mutate({ rawScan: c });
    },
    [lookup],
  );

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(code);
  };

  const handleCameraScan = (raw: string) => {
    setScannerOpen(false);
    setCode(raw);
    submit(raw);
  };

  // Dopo aver eseguito un'azione: re-focus input e clear, pronti per il prossimo scan.
  const continueScanning = () => {
    setCode("");
    lookup.reset();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (id: string) => {
    onSelectItem(id);
    onOpenChange(false);
  };

  const handleEdit = (id: string) => {
    onEditItem(id);
    onOpenChange(false);
  };

  const handleCreate = (barcode: string) => {
    onCreateFromBarcode(barcode);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[80svh] sm:h-[70vh] flex flex-col p-0">
          <SheetHeader className="px-4 py-3 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <ScanLine className="h-5 w-5 text-primary" />
              Scansione rapida giacenze
            </SheetTitle>
            <SheetDescription className="text-xs">
              Scansiona o digita un codice. Il sistema lo risolve e propone l'azione.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Input + camera */}
            <form onSubmit={handleManualSubmit} className="space-y-2">
              <Label htmlFor="qs-code" className="text-xs">Codice</Label>
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  id="qs-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Scansiona o digita..."
                  autoComplete="off"
                  inputMode="text"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setScannerOpen(true)}
                  aria-label="Apri fotocamera"
                  disabled={lookup.isPending}
                >
                  <Camera className="h-4 w-4" />
                </Button>
                <Button type="submit" disabled={!code.trim() || lookup.isPending} aria-label="Risolvi codice">
                  {lookup.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ScanLine className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Premi <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Invio</kbd> per risolvere ·
                <kbd className="ml-1 px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd> per chiudere
              </p>
            </form>

            {/* Errore */}
            {lookup.isError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Errore nella risoluzione: {(lookup.error as Error)?.message ?? "Riprova."}
                </AlertDescription>
              </Alert>
            )}

            {/* Risultato */}
            {lookup.data && (
              <ResultPanel
                rawScan={lookup.data.rawScan}
                parsedPrimary={lookup.data.parsedPrimary}
                gs1Detected={lookup.data.gs1Detected}
                action={lookup.data.action}
                onSelect={handleSelect}
                onEdit={handleEdit}
                onCreate={() => handleCreate(lookup.data.rawScan)}
                onContinue={continueScanning}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Suspense fallback={null}>
        {scannerOpen && (
          <BarcodeScanner
            open={scannerOpen}
            onOpenChange={setScannerOpen}
            onScan={handleCameraScan}
          />
        )}
      </Suspense>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Pannello risultato — UX contestuale per ciascuna decisione UI
// ────────────────────────────────────────────────────────────

type Action = NonNullable<ReturnType<typeof useBarcodeLookup>["data"]>["action"];

function ResultPanel({
  rawScan,
  parsedPrimary,
  gs1Detected,
  action,
  onSelect,
  onEdit,
  onCreate,
  onContinue,
}: {
  rawScan: string;
  parsedPrimary: string;
  gs1Detected: boolean;
  action: Action;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border p-3 bg-muted/20 text-xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase text-muted-foreground">Codice</span>
          {gs1Detected && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
              GS1
            </Badge>
          )}
        </div>
        <p className="font-mono break-all">{rawScan}</p>
        {parsedPrimary !== rawScan && (
          <p className="text-muted-foreground">
            → <span className="font-mono">{parsedPrimary}</span>
          </p>
        )}
      </div>

      {action.kind === "accept_unit" && (
        <ActionBlock
          icon={CheckCircle2}
          color="emerald"
          title="Match seriale univoco"
          description="Pezzo identificato dal numero di serie."
        >
          <Button onClick={() => onSelect(action.itemId)} className="w-full">
            <Filter className="h-4 w-4 mr-2" />
            Filtra in tabella
          </Button>
          <Button variant="outline" onClick={() => onEdit(action.itemId)} className="w-full">
            <Pencil className="h-4 w-4 mr-2" />
            Modifica articolo
          </Button>
        </ActionBlock>
      )}

      {action.kind === "accept_item" && (
        <ActionBlock
          icon={CheckCircle2}
          color="emerald"
          title="Articolo trovato"
          description="Match singolo, pronto per filtrare o modificare."
        >
          <Button onClick={() => onSelect(action.itemId)} className="w-full">
            <Filter className="h-4 w-4 mr-2" />
            Filtra in tabella
          </Button>
          <Button variant="outline" onClick={() => onEdit(action.itemId)} className="w-full">
            <Pencil className="h-4 w-4 mr-2" />
            Modifica articolo
          </Button>
        </ActionBlock>
      )}

      {action.kind === "confirm_ambiguous" && (
        <ActionBlock
          icon={HelpCircle}
          color="amber"
          title="Più candidati"
          description={`${action.rows.length} articoli con questo codice. Tocca per scegliere.`}
        >
          <ul className="divide-y rounded-lg border bg-card">
            {action.rows.map((r, i) => (
              <li key={`${r.stock_item_id}-${i}`}>
                <button
                  type="button"
                  onClick={() => r.stock_item_id && onSelect(r.stock_item_id)}
                  className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted transition-colors"
                  disabled={!r.stock_item_id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{r.item_name ?? "—"}</p>
                    {r.supplier_name && (
                      <p className="text-[11px] text-muted-foreground truncate">{r.supplier_name}</p>
                    )}
                  </div>
                  <MatchTypeBadge match={r.match_type} />
                </button>
              </li>
            ))}
          </ul>
        </ActionBlock>
      )}

      {action.kind === "offer_create_new" && (
        <ActionBlock
          icon={Package}
          color="blue"
          title="Codice non riconosciuto"
          description="Nessun articolo in anagrafica con questo barcode."
        >
          <Button onClick={onCreate} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Crea articolo con questo barcode
          </Button>
          <Button variant="ghost" onClick={onContinue} className="w-full">
            <X className="h-4 w-4 mr-2" />
            Ignora e scansiona un altro
          </Button>
        </ActionBlock>
      )}
    </div>
  );
}

function MatchTypeBadge({ match }: { match: RawMatchRow["match_type"] }) {
  if (match === "unit") {
    return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] shrink-0">seriale</Badge>;
  }
  if (match === "item_ambiguous") {
    return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] shrink-0">altro fornitore</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] shrink-0">match</Badge>;
}

function ActionBlock({
  icon: Icon,
  color,
  title,
  description,
  children,
}: {
  icon: typeof CheckCircle2;
  color: "emerald" | "amber" | "blue";
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const colorMap = {
    emerald: "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20",
    amber: "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
    blue: "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
  };
  const iconColorMap = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    blue: "text-blue-600",
  };
  return (
    <div className={`rounded-lg border-l-4 p-3 space-y-3 ${colorMap[color]}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconColorMap[color]}`} />
        <div className="min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
