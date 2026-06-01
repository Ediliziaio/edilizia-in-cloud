import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { invalidateAllTariffe } from "@/lib/tariffeQueryKeys";
import {
  computeAdjustedPrices, marginePerc,
  type AdjustTarget, type AdjustMode, type RoundMode, type PriceAdjustOptions,
} from "@/lib/tariffe/priceAdjust";
import type { Tariffa } from "@/pages/azienda/settings/SettingsTariffe/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, AlertTriangle, ArrowRight, Percent, Euro } from "lucide-react";

interface BulkPriceAdjustDialogProps {
  open: boolean;
  onClose: () => void;
  items: Tariffa[];
  isAdmin: boolean;
  companyId: string;
  /** Chiamata a fine applicazione (il parent azzera la selezione). */
  onApplied: () => void;
}

export function BulkPriceAdjustDialog({
  open, onClose, items, isAdmin, companyId, onApplied,
}: BulkPriceAdjustDialogProps) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<AdjustTarget>("vendita");
  const [mode, setMode] = useState<AdjustMode>("percent");
  const [direction, setDirection] = useState<"aumenta" | "diminuisci">("aumenta");
  const [amountStr, setAmountStr] = useState("5");
  const [round, setRound] = useState<RoundMode>("none");

  const amountAbs = useMemo(() => {
    const n = parseFloat(amountStr.replace(",", "."));
    return Number.isFinite(n) ? Math.abs(n) : NaN;
  }, [amountStr]);

  const amount = (direction === "diminuisci" ? -1 : 1) * (Number.isFinite(amountAbs) ? amountAbs : 0);
  const opts: PriceAdjustOptions = useMemo(
    () => ({ target, mode, amount, round }),
    [target, mode, amount, round],
  );

  const preview = useMemo(
    () => items.map((t) => ({ t, res: computeAdjustedPrices(t, opts) })),
    [items, opts],
  );

  const changed = useMemo(
    () => preview.filter((p) => p.res.changedVendita || p.res.changedCosto),
    [preview],
  );

  const sottocostoCount = useMemo(
    () =>
      preview.filter((p) => {
        const m = marginePerc(p.res.prezzo_vendita ?? null, p.res.costo_interno ?? null);
        return m != null && m < 0;
      }).length,
    [preview],
  );

  const amountValid = Number.isFinite(amountAbs) && amountAbs > 0;
  const canApply = amountValid && changed.length > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      // Aggiornamenti per-riga (valori diversi per ogni voce). Eseguiti in
      // parallelo: insieme tipicamente di poche decine di voci.
      await Promise.all(
        changed.map(async ({ t, res }) => {
          const payload: Record<string, unknown> = {};
          if (res.changedVendita) payload.prezzo_vendita = res.prezzo_vendita;
          if (res.changedCosto) {
            payload.costo_interno = res.costo_interno;
            payload.prezzo_costo = res.costo_interno; // mirror legacy
          }
          const { error } = await supabase
            .from("tariffe_aziendali")
            .update(payload as never)
            .eq("id", t.id)
            .eq("company_id", companyId);
          if (error) throw error;
        }),
      );
      return changed.length;
    },
    onSuccess: (count) => {
      invalidateAllTariffe(queryClient);
      toast.success(`Prezzi aggiornati su ${count} ${count === 1 ? "voce" : "voci"}`);
      onApplied();
      onClose();
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento prezzi");
    },
  });

  const segnoLabel = direction === "aumenta" ? "+" : "−";
  const unitLabel = mode === "percent" ? "%" : "€";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adegua prezzi in blocco</DialogTitle>
          <DialogDescription>
            Applica un adeguamento a {items.length} {items.length === 1 ? "voce selezionata" : "voci selezionate"}.
            L'anteprima mostra l'effetto prima di confermare.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cosa adeguare */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Applica a</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={target}
              onValueChange={(v) => v && setTarget(v as AdjustTarget)}
              className="justify-start flex-wrap gap-1"
            >
              <ToggleGroupItem value="vendita" className="data-[state=on]:bg-orange-100 data-[state=on]:text-orange-800">
                Prezzo di vendita
              </ToggleGroupItem>
              {isAdmin && (
                <ToggleGroupItem value="costo" className="data-[state=on]:bg-orange-100 data-[state=on]:text-orange-800">
                  Costo interno
                </ToggleGroupItem>
              )}
              {isAdmin && (
                <ToggleGroupItem value="entrambi" className="data-[state=on]:bg-orange-100 data-[state=on]:text-orange-800">
                  Entrambi
                </ToggleGroupItem>
              )}
            </ToggleGroup>
          </div>

          {/* Direzione + importo + modalità */}
          <div className="grid grid-cols-[auto,1fr,auto] gap-2 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Direzione</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={direction}
                onValueChange={(v) => v && setDirection(v as "aumenta" | "diminuisci")}
              >
                <ToggleGroupItem value="aumenta" aria-label="Aumenta" className="data-[state=on]:bg-emerald-100 data-[state=on]:text-emerald-800">
                  <TrendingUp className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="diminuisci" aria-label="Diminuisci" className="data-[state=on]:bg-rose-100 data-[state=on]:text-rose-800">
                  <TrendingDown className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjust-amount" className="text-xs text-muted-foreground">Valore</Label>
              <div className="relative">
                <Input
                  id="adjust-amount"
                  inputMode="decimal"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  placeholder="es. 5"
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {unitLabel}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={mode}
                onValueChange={(v) => v && setMode(v as AdjustMode)}
              >
                <ToggleGroupItem value="percent" aria-label="Percentuale">
                  <Percent className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="fixed" aria-label="Importo fisso">
                  <Euro className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>

          {/* Arrotondamento */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Arrotonda il risultato</Label>
            <Select value={round} onValueChange={(v) => setRound(v as RoundMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuno (2 decimali)</SelectItem>
                <SelectItem value="0.50">A 0,50 €</SelectItem>
                <SelectItem value="1">All'intero (1 €)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Riepilogo */}
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {amountValid ? (
              <span>
                <span className="font-medium">{segnoLabel}{amountAbs}{unitLabel}</span> su{" "}
                <span className="font-medium">{changed.length}</span> di {items.length}{" "}
                {items.length === 1 ? "voce" : "voci"}
                {changed.length === 0 && " — nessuna voce ha un valore da adeguare per questa scelta"}
              </span>
            ) : (
              <span className="text-muted-foreground">Inserisci un valore maggiore di zero</span>
            )}
          </div>

          {sottocostoCount > 0 && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {sottocostoCount} {sottocostoCount === 1 ? "voce andrebbe" : "voci andrebbero"} sottocosto
                (prezzo di vendita inferiore al costo). Controlla l'anteprima.
              </AlertDescription>
            </Alert>
          )}

          {/* Anteprima */}
          {amountValid && changed.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Anteprima</Label>
              <ScrollArea className="h-44 rounded-md border">
                <div className="divide-y">
                  {changed.map(({ t, res }) => {
                    const m = marginePerc(res.prezzo_vendita ?? null, res.costo_interno ?? null);
                    const sottocosto = m != null && m < 0;
                    return (
                      <div key={t.id} className="px-3 py-2 text-sm">
                        <div className="font-medium truncate">{t.nome}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs">
                          {res.changedVendita && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              Vendita: {formatCurrency(t.prezzo_vendita ?? 0)}
                              <ArrowRight className="h-3 w-3" />
                              <span className="font-medium text-foreground">{formatCurrency(res.prezzo_vendita ?? 0)}</span>
                            </span>
                          )}
                          {res.changedCosto && (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              Costo: {formatCurrency(t.costo_interno ?? t.prezzo_costo ?? 0)}
                              <ArrowRight className="h-3 w-3" />
                              <span className="font-medium text-foreground">{formatCurrency(res.costo_interno ?? 0)}</span>
                            </span>
                          )}
                          {isAdmin && m != null && (
                            <Badge
                              variant="outline"
                              className={sottocosto ? "border-rose-300 text-rose-700" : "border-emerald-300 text-emerald-700"}
                            >
                              margine {m.toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Annulla
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canApply || mutation.isPending}
            className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white"
          >
            {mutation.isPending ? "Applico…" : `Applica a ${changed.length} ${changed.length === 1 ? "voce" : "voci"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
