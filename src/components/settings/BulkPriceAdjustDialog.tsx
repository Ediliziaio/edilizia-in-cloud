import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { costoTariffaConosciuto, formatPrezzoUnitario as formatCurrency, semaforoMargineTariffa } from "@/lib/tariffe/economiaTariffa";
import { costoPieno, marginePrezzo, prezzoDaRicarico } from "@/lib/tariffe/prezzoDalCosto";
import { testoErrore } from "@/lib/impostazioni/testoErrore";
import { invalidateAllTariffe } from "@/lib/tariffeQueryKeys";
import {
  computeAdjustedPrices,
  type AdjustTarget, type AdjustMode, type RoundMode, type PriceAdjustOptions, type TariffaPriceResult,
} from "@/lib/tariffe/priceAdjust";
import type { Tariffa } from "@/pages/azienda/settings/SettingsTariffe/types";
import { parseImporto } from "@/lib/listino/listinoFornitore";
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
  sogliaMinima?: number;
  /** spese generali % di «Prezzo e margini», per ricalcolare le voci «dal costo» */
  speseGenerali?: number;
  /** Chiamata a fine applicazione (il parent azzera la selezione). */
  onApplied: () => void;
}

export function BulkPriceAdjustDialog({
  open, onClose, items, isAdmin, companyId, onApplied, sogliaMinima = 15, speseGenerali = 0,
}: BulkPriceAdjustDialogProps) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<AdjustTarget>("vendita");
  const [mode, setMode] = useState<AdjustMode>("percent");
  const [direction, setDirection] = useState<"aumenta" | "diminuisci">("aumenta");
  const [amountStr, setAmountStr] = useState("5");
  const [round, setRound] = useState<RoundMode>("none");
  const [piano, setPiano] = useState<{ righe: Array<{t: Tariffa; res: TariffaPriceResult; segueCosto: boolean; diventaLibera: boolean}>; totale: number } | null>(null);
  const [salvate, setSalvate] = useState<Set<string>>(new Set());
  const [erroreApplicazione, setErroreApplicazione] = useState<string | null>(null);

  // Virgola decimale e punto delle migliaia come negli altri campi del listino
  // (parseImporto): con parseFloat «1.234,5» diventava 1,234 (05/10/2026).
  const amountAbs = useMemo(() => {
    const n = parseImporto(amountStr);
    return Number.isFinite(n) ? Math.abs(n) : NaN;
  }, [amountStr]);

  const amount = (direction === "diminuisci" ? -1 : 1) * (Number.isFinite(amountAbs) ? amountAbs : 0);
  const opts: PriceAdjustOptions = useMemo(
    () => ({ target, mode, amount, round }),
    [target, mode, amount, round],
  );

  // Il costo di partenza è quello che la pagina mostra (costoTariffa): con il
  // solo costo_interno, lo 0 di default delle voci col costo in prezzo_costo
  // restava 0 dopo ogni rincaro e l'anteprima diceva «Costo: 0» (05/10/2026).
  //
  // Le voci «dal costo» (22/10/2026): se cambia solo il costo il prezzo lo
  // segue col suo ricarico, e l'anteprima mostra il prezzo che si scriverà
  // davvero; se cambia il prezzo (o il costo va a zero) la voce diventa a
  // prezzo libero, e lo si dice.
  const preview = useMemo(
    () => piano?.righe ?? items.map((t) => {
      const res = computeAdjustedPrices({ prezzo_vendita: t.prezzo_vendita, costo_interno: costoTariffaConosciuto(t) }, opts);
      if (t.prezzo_modo !== "dal_costo") return { t, res, segueCosto: false, diventaLibera: false };
      if (res.changedVendita) return { t, res, segueCosto: false, diventaLibera: true };
      if (res.changedCosto) {
        const nuovo = (res.costo_interno ?? 0) > 0 && t.ricarico_pct != null
          ? prezzoDaRicarico(costoPieno(res.costo_interno, speseGenerali), Number(t.ricarico_pct))
          : null;
        // senza un costo positivo il prezzo non può seguirlo: resta quello e la voce diventa libera
        if (nuovo == null) return { t, res, segueCosto: false, diventaLibera: true };
        return { t, res: { ...res, prezzo_vendita: nuovo, changedVendita: nuovo !== Number(t.prezzo_vendita ?? 0) }, segueCosto: true, diventaLibera: false };
      }
      return { t, res, segueCosto: false, diventaLibera: false };
    }),
    [items, opts, piano, speseGenerali],
  );
  /** margine sul costo pieno, come la pagina: con le spese generali un +4,8% sul costo diretto può essere una perdita */
  const margineVoce = (res: { prezzo_vendita?: number | null; costo_interno?: number | null }) =>
    marginePrezzo(res.prezzo_vendita ?? null, costoPieno(res.costo_interno ?? null, speseGenerali));
  const diventanoLibere = preview.filter((p) => p.diventaLibera && (p.res.changedVendita || p.res.changedCosto)).length;

  const changed = useMemo(
    () => preview.filter((p) => p.res.changedVendita || p.res.changedCosto),
    [preview],
  );

  const sottocostoCount = useMemo(
    () =>
      preview.filter((p) => {
        const m = margineVoce(p.res);
        return m != null && m < 0;
      }).length,
    [preview, speseGenerali],
  );

  // Un ribasso del 100% o più porta ogni prezzo a zero: non è un adeguamento.
  const ribassoTroppo = mode === "percent" && direction === "diminuisci" && amountAbs >= 100;
  const amountValid = Number.isFinite(amountAbs) && amountAbs > 0 && !ribassoTroppo;
  const fuoriLimite = changed.some(({res}) => [res.prezzo_vendita, res.costo_interno].some(n => n != null && (!Number.isFinite(n) || n >= 1e8)));
  const rimanenti = changed.filter(({t}) => !salvate.has(t.id));
  const canApply = (piano != null || amountValid) && rimanenti.length > 0 && !fuoriLimite;

  const mutation = useMutation({
    mutationFn: async (righe: typeof changed) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (!isAdmin && righe.some(({res}) => res.changedCosto)) throw new Error("Non hai il permesso di modificare i costi.");
      const completate = new Set(salvate);
      // Valori assoluti congelati dalla prima anteprima: il retry non ricalcola
      // il rincaro sulle righe già aggiornate, nemmeno dopo il refetch parziale.
      for (const {t, res, diventaLibera} of righe) {
          if (completate.has(t.id)) continue;
          const payload: Record<string, unknown> = {};
          if (res.changedVendita) payload.prezzo_vendita = res.prezzo_vendita;
          if (res.changedCosto) {
            payload.costo_interno = res.costo_interno;
            payload.costo_default = res.costo_interno;
            payload.prezzo_costo = res.costo_interno; // mirror legacy
          }
          // Le voci «dal costo»: il prezzo che segue il costo è già in res
          // (calcolato nell'anteprima); quelle che non possono seguirlo diventano libere.
          if (diventaLibera) {
            payload.prezzo_modo = "libero";
            payload.ricarico_pct = null;
          }
          const { data, error } = await supabase
            .from("tariffe_aziendali")
            .update(payload as never)
            .eq("id", t.id)
            .eq("company_id", companyId).select("id").single();
          if (error) throw error;
          if (!data) throw new Error(`Voce non aggiornata: ${t.nome}. Verifica i permessi e riprova.`);
          completate.add(t.id);
          setSalvate(new Set(completate));
      }
      return completate.size;
    },
    onSuccess: (count) => {
      invalidateAllTariffe(queryClient);
      toast.success(`Prezzi aggiornati su ${count} ${count === 1 ? "voce" : "voci"}`);
      onApplied();
      onClose();
    },
    onError: (err: unknown) => {
      invalidateAllTariffe(queryClient);
      const testo = testoErrore(err, "Errore aggiornamento prezzi");
      setErroreApplicazione(testo);
      toast.error(testo);
    },
  });

  const segnoLabel = direction === "aumenta" ? "+" : "−";
  const unitLabel = mode === "percent" ? "%" : "€";
  const parametriBloccati = mutation.isPending || piano != null;
  const numeroSelezionate = piano?.totale ?? items.length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !mutation.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adegua prezzi in blocco</DialogTitle>
          <DialogDescription>
            Applica un adeguamento a {numeroSelezionate} {numeroSelezionate === 1 ? "voce selezionata" : "voci selezionate"}.
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
              disabled={parametriBloccati}
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
                disabled={parametriBloccati}
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
                  disabled={parametriBloccati}
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
                disabled={parametriBloccati}
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
            <Select disabled={parametriBloccati} value={round} onValueChange={(v) => setRound(v as RoundMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Mantieni la precisione (4 decimali)</SelectItem>
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
                <span className="font-medium">{changed.length}</span> di {numeroSelezionate}{" "}
                {numeroSelezionate === 1 ? "voce" : "voci"}
                {changed.length === 0 && " — nessuna voce ha un valore da adeguare per questa scelta"}
              </span>
            ) : ribassoTroppo ? (
              <span className="text-muted-foreground">Un ribasso deve stare sotto il 100%: oltre, i prezzi andrebbero a zero</span>
            ) : (
              <span className="text-muted-foreground">Inserisci un valore maggiore di zero</span>
            )}
          </div>

          {fuoriLimite && <Alert variant="destructive"><AlertDescription>Il risultato supera il limite di importo di una tariffa. Riduci l’adeguamento.</AlertDescription></Alert>}
          {erroreApplicazione && <Alert variant="destructive"><AlertDescription>{salvate.size} di {changed.length} voci aggiornate. {erroreApplicazione} Riprova per completare le {rimanenti.length} voci rimaste con i prezzi dell’anteprima.</AlertDescription></Alert>}
          {sottocostoCount > 0 && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {sottocostoCount} {sottocostoCount === 1 ? "voce andrebbe" : "voci andrebbero"} sottocosto
                (prezzo di vendita inferiore al costo). Controlla l'anteprima.
              </AlertDescription>
            </Alert>
          )}

          {diventanoLibere > 0 && (
            <p className="text-xs text-amber-700">
              {diventanoLibere} {diventanoLibere === 1 ? "voce con prezzo dal costo diventa" : "voci con prezzo dal costo diventano"} a
              prezzo libero: il prezzo non seguirà più il costo.
            </p>
          )}

          {/* Anteprima */}
          {amountValid && changed.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Anteprima</Label>
              <ScrollArea className="h-44 rounded-md border">
                <div className="divide-y">
                  {changed.map(({ t, res }) => {
                    const m = margineVoce(res);
                    const sem = semaforoMargineTariffa(m, sogliaMinima);
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
                              Costo: {formatCurrency(costoTariffaConosciuto(t) ?? 0)}
                              <ArrowRight className="h-3 w-3" />
                              <span className="font-medium text-foreground">{formatCurrency(res.costo_interno ?? 0)}</span>
                            </span>
                          )}
                          {isAdmin && m != null && (
                            <Badge
                              variant="outline"
                              title={sem.label}
                              className={sem.text}
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
            onClick={() => { const operazione = piano ?? { righe: changed, totale: items.length }; setPiano(operazione); setErroreApplicazione(null); mutation.mutate(operazione.righe); }}
            disabled={!canApply || mutation.isPending}
            className="bg-gradient-to-br from-orange-500 to-eic-amber hover:from-orange-600 hover:to-amber-500 text-white"
          >
            {mutation.isPending ? `Applico… ${salvate.size}/${changed.length}` : `${piano ? (rimanenti.length === 1 ? "Riprova sulla" : "Riprova sulle") : "Applica a"} ${rimanenti.length} ${rimanenti.length === 1 ? "voce" : "voci"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
