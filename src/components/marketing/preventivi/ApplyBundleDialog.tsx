/**
 * FASE 10.4 — Apply Bundle Dialog
 *
 * Dialog per applicare un bundle/pacchetto chiavi-in-mano a un preventivo.
 * Espande ogni voce del bundle in QuoteItemPro[]:
 *  - voce famiglia: calcola prezzo via calcolaPrezzoFamiglia (con misure e assi
 *    preimpostati dal bundle) + opzionale riga posa linkata. Se non ci sono
 *    misure/assi configurati nel bundle usa i default della famiglia (o base).
 *  - voce prodotto legacy: usa article_templates.prezzo_vendita come unit_price.
 *  - voce tariffa: usa tariffa.prezzo_vendita come unit_price.
 *
 * Single source of truth: QuoteBuilder resta proprietario di items[].
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Package, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useBundlesList, type Bundle } from "@/hooks/useBundles";
import { useFamilies } from "@/hooks/useFamilies";
import { calcolaPrezzoFamiglia, type GridPoint } from "@/hooks/useFamilyPricing";
import { formatCurrency } from "@/lib/formatters";
import { logger } from "@/utils/logger";
import type { QuoteItemPro } from "@/types/quoteItem";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type { AxisSelection, FamilyWithAxes } from "@/types/articleFamily";

interface Props {
  open: boolean;
  onClose: () => void;
  onAddItems: (items: QuoteItemPro[], nextSortOrder: number) => void;
  currentSortOrder: number;
  tariffe: TariffaPro[];
}

/** Fetch grid points for all families involved in the selected bundle.
 *
 * NOTE schema: colonne reali su `listino_griglia` sono `valore_x`, `valore_y`,
 * `prezzo_vendita`, `prezzo_acquisto` (vedi migration preventivo_pro_v2_part15).
 * Il dominio `GridPoint` usa `prezzo_acquisto_netto` per coerenza con
 * article_templates → mappatura al boundary DB.
 */
function useBundleGrids(familyIds: string[]) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["bundle-grids", companyId, [...familyIds].sort().join(",")],
    enabled: !!companyId && familyIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("listino_griglia")
        .select("family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto")
        .in("family_id", familyIds);
      if (error) {
        // FIX P1-B: non silenziare l'errore. Prima ritornavamo una Map vuota
        // e il preventivo calcolava prezzi default/fallback → corruzione
        // silente dei prezzi quotati al cliente. Ora throw → react-query
        // imposta isError, l'UI mostra alert e blocca il confirm.
        logger.error("[useBundleGrids] errore caricamento griglia", error);
        throw new Error(
          `Impossibile caricare la griglia prezzi: ${error.message ?? "errore sconosciuto"}`,
        );
      }
      const byFamily = new Map<string, GridPoint[]>();
      for (const row of (data ?? []) as Array<{
        family_id: string;
        valore_x: number;
        valore_y: number;
        prezzo_vendita: number;
        prezzo_acquisto: number | null;
      }>) {
        if (!byFamily.has(row.family_id)) byFamily.set(row.family_id, []);
        byFamily.get(row.family_id)!.push({
          valore_x: Number(row.valore_x),
          valore_y: Number(row.valore_y),
          prezzo_vendita: Number(row.prezzo_vendita),
          prezzo_acquisto_netto: row.prezzo_acquisto != null ? Number(row.prezzo_acquisto) : 0,
        });
      }
      return byFamily;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function ApplyBundleDialog({
  open,
  onClose,
  onAddItems,
  currentSortOrder,
  tariffe,
}: Props) {
  const { bundles, isLoading } = useBundlesList();
  const { families } = useFamilies();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeBundles = useMemo(() => bundles.filter((b) => b.attivo), [bundles]);
  const selectedBundle = useMemo(
    () => activeBundles.find((b) => b.id === selectedId) ?? null,
    [activeBundles, selectedId],
  );

  const familyIdsInSelected = useMemo(() => {
    if (!selectedBundle) return [] as string[];
    const ids = new Set<string>();
    for (const v of selectedBundle.voci ?? []) {
      if (v.family_id) ids.add(v.family_id);
    }
    return Array.from(ids);
  }, [selectedBundle]);

  const {
    data: gridsByFamily,
    isLoading: gridsLoading,
    isError: gridsError,
    error: gridsErrorObj,
    refetch: refetchGrids,
  } = useBundleGrids(familyIdsInSelected);

  // Quali voci richiedono griglia (modalita mq/griglia)?
  const anyVoceNeedsGrid = useMemo(() => {
    if (!selectedBundle) return false;
    const familyMap = new Map(families.map((f) => [f.id, f] as const));
    return (selectedBundle.voci ?? []).some((v) => {
      if (!v.family_id) return false;
      const fam = familyMap.get(v.family_id);
      return fam?.modalita_prezzo_base === "mq" || fam?.modalita_prezzo_base === "griglia";
    });
  }, [selectedBundle, families]);

  const gridBlocksConfirm = gridsError && anyVoceNeedsGrid;

  const expansion = useMemo(() => {
    if (!selectedBundle) return null;
    const items: QuoteItemPro[] = [];
    const warnings: string[] = [];
    let sort = currentSortOrder;

    // Kit con prezzo offerta (i kit fotovoltaici): si vende a quel prezzo, come
    // nel preventivatore FV. Prima si sommavano le voci, spesso a 0 €, e un kit
    // senza voci diventava «Aggiungi 0 voci».
    const prezzoKit = Number(selectedBundle.prezzo_offerta ?? 0);
    if (prezzoKit > 0) {
      const dettaglio = (selectedBundle.voci ?? [])
        .map((v) => {
          const nome = v.article_templates?.name ?? v.article_families?.nome ?? v.tariffe_aziendali?.nome;
          return nome ? `${Number(v.quantita) || 1} × ${nome}` : null;
        })
        .filter(Boolean)
        .join(", ");
      items.push({
        item_type: "product",
        item_category: "prodotto",
        name: selectedBundle.nome,
        description: [
          selectedBundle.fv_kwp != null ? `${Number(selectedBundle.fv_kwp).toLocaleString("it-IT")} kWp` : null,
          Number(selectedBundle.fv_accumulo_kwh ?? 0) > 0
            ? `accumulo ${Number(selectedBundle.fv_accumulo_kwh).toLocaleString("it-IT")} kWh`
            : null,
          dettaglio || null,
        ].filter(Boolean).join(" · "),
        quantity: 1,
        unit_price: prezzoKit,
        discount_percent: 0,
        vat_rate: 22,
        unit_of_measure: "kit",
        sort_order: sort++,
        article_template_id: null,
        tariffa_id: null,
        prezzo_acquisto: 0,
        mostra_nel_pdf: true,
        is_optional: false,
      });
      return { items, warnings, totalPreview: prezzoKit, nextSortOrder: sort };
    }

    const familyMap = new Map<string, FamilyWithAxes>(
      families.map((f) => [f.id, f]),
    );

    // Spread prima di sort — .sort() muta in-place, e `voci` arriva dalla React Query cache.
    // Senza copia l'ordine della cache cambierebbe ad ogni `expansion` memoizzata.
    const vociSorted = [...(selectedBundle.voci ?? [])].sort(
      (a, z) => a.sort_order - z.sort_order,
    );
    for (const voce of vociSorted) {
      const qty = Number(voce.quantita) || 1;
      const vanoSuffix = voce.vano_label ? ` — ${voce.vano_label}` : "";

      if (voce.family_id) {
        const family = familyMap.get(voce.family_id);
        if (!family) {
          warnings.push(`Famiglia ${voce.family_id} non trovata, voce saltata.`);
          continue;
        }

        // Axis selection: merge codice→valore string con default della famiglia.
        const axisSel: AxisSelection = {};
        for (const ax of family.axes) {
          // Cerca nel bundle axis_selections (pre-impostazione)
          const preset = voce.axis_selections?.[ax.codice];
          if (preset) {
            // bundle salva `value.valore` — mappa a `value.id`
            const valMatch = ax.values.find((v) => v.valore === preset);
            if (valMatch) {
              axisSel[ax.codice] = valMatch.id;
              continue;
            }
          }
          // Fallback default
          const def = ax.values.find((v) => v.is_default) ?? ax.values[0];
          if (def) axisSel[ax.codice] = def.id;
        }

        const needsXY =
          family.modalita_prezzo_base === "mq" || family.modalita_prezzo_base === "griglia";

        const result = calcolaPrezzoFamiglia(
          {
            family,
            selections: axisSel,
            larghezza_mm: needsXY ? voce.larghezza_mm_default ?? undefined : undefined,
            altezza_mm: needsXY ? voce.altezza_mm_default ?? undefined : undefined,
            quantita: qty,
          },
          needsXY ? gridsByFamily?.get(family.id) : undefined,
        );

        const axisSummary = family.axes
          .map((ax) => {
            const valId = axisSel[ax.codice];
            const v = ax.values.find((x) => x.id === valId);
            return v ? `${ax.nome}: ${v.label}` : null;
          })
          .filter(Boolean)
          .join(" · ");
        const dimSummary = needsXY && voce.larghezza_mm_default && voce.altezza_mm_default
          ? `${voce.larghezza_mm_default}×${voce.altezza_mm_default}mm`
          : "";
        const description = [dimSummary, axisSummary].filter(Boolean).join(" — ");

        items.push({
          item_type: "product",
          item_category: "prodotto",
          name: `${family.nome}${vanoSuffix}`,
          description,
          quantity: qty,
          unit_price: result.unit_price_vendita,
          discount_percent: 0,
          vat_rate: family.vat_rate,
          unit_of_measure: family.unit_of_measure,
          sort_order: sort++,
          article_template_id: null,
          tariffa_id: null,
          prezzo_acquisto: result.unit_price_acquisto,
          mostra_nel_pdf: true,
          is_optional: false,
          misura_x: needsXY ? voce.larghezza_mm_default : null,
          misura_y: needsXY ? voce.altezza_mm_default : null,
        });

        if (result.warnings.length > 0) {
          warnings.push(...result.warnings.map((w) => `${family.nome}: ${w}`));
        }

        // Posa di default
        if (family.posa_tariffa_default_id) {
          const posaTariffa = tariffe.find((t) => t.id === family.posa_tariffa_default_id);
          if (posaTariffa) {
            const posaQty = family.posa_quantita_default * qty;
            items.push({
              item_type: "service",
              item_category: "posa",
              name: posaTariffa.nome,
              description: `Posa di ${family.nome}${vanoSuffix}`,
              quantity: posaQty,
              unit_price: posaTariffa.prezzo_vendita,
              discount_percent: 0,
              vat_rate: 22,
              unit_of_measure: posaTariffa.unita ?? "pz",
              sort_order: sort++,
              article_template_id: null,
              tariffa_id: posaTariffa.id,
              prezzo_acquisto: posaTariffa.prezzo_costo ?? 0,
              mostra_nel_pdf: true,
              is_optional: false,
              _parentIdx: undefined,
            });
          }
        }
      } else if (voce.prodotto_id && voce.article_templates) {
        const art = voce.article_templates;
        items.push({
          item_type: "product",
          item_category: "prodotto",
          name: `${art.name}${vanoSuffix}`,
          description: "",
          quantity: qty,
          unit_price: Number(art.prezzo_vendita ?? art.unit_price ?? 0),
          discount_percent: 0,
          vat_rate: 22,
          unit_of_measure: art.unit_of_measure ?? "pz",
          sort_order: sort++,
          article_template_id: voce.prodotto_id,
          tariffa_id: null,
          prezzo_acquisto: Number(art.prezzo_acquisto_netto ?? 0),
          mostra_nel_pdf: true,
          is_optional: false,
        });
      } else if (voce.tariffa_id && voce.tariffe_aziendali) {
        const t = voce.tariffe_aziendali;
        items.push({
          item_type: "service",
          item_category: "posa",
          name: `${t.nome}${vanoSuffix}`,
          description: "",
          quantity: qty,
          unit_price: Number(t.prezzo_vendita ?? 0),
          discount_percent: 0,
          vat_rate: 22,
          unit_of_measure: t.unita ?? "pz",
          sort_order: sort++,
          article_template_id: null,
          tariffa_id: voce.tariffa_id,
          prezzo_acquisto: 0,
          mostra_nel_pdf: true,
          is_optional: false,
        });
      } else {
        warnings.push("Voce senza tipo valido, saltata.");
      }
    }

    // Applica sconto bundle (discount_percent) a tutte le voci se > 0
    const sconto = Number(selectedBundle.sconto_bundle_pct ?? 0);
    if (sconto > 0) {
      for (const it of items) {
        it.discount_percent = sconto;
      }
    }

    const totalPreview = items.reduce(
      (sum, it) =>
        sum + (it.unit_price * it.quantity * (1 - it.discount_percent / 100)),
      0,
    );

    return { items, warnings, totalPreview, nextSortOrder: sort };
  }, [selectedBundle, families, gridsByFamily, tariffe, currentSortOrder]);

  const handleConfirm = () => {
    if (!expansion || expansion.items.length === 0) return;
    onAddItems(expansion.items, expansion.nextSortOrder);
    toast.success(`Aggiunte ${expansion.items.length} voci dal bundle`);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="p-0 flex flex-col gap-0 w-[96vw] sm:w-full max-w-3xl h-[92vh] sm:h-auto sm:max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 border-b bg-background">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Package className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="truncate">Applica bundle al preventivo</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Seleziona un pacchetto pre-configurato. Le voci verranno aggiunte al preventivo,
            puoi modificarle singolarmente dopo l&apos;inserimento.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-4 sm:px-6 py-3">
          {isLoading && <p className="text-sm text-muted-foreground">Caricamento…</p>}
          {!isLoading && activeBundles.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nessun bundle attivo disponibile.</p>
              <p className="text-xs mt-2">
                Creane uno in Impostazioni → Bundle &amp; Pacchetti, oppure installa i template.
              </p>
            </div>
          )}

          <div className="space-y-2">
            {activeBundles.map((b) => (
              <BundleCard
                key={b.id}
                bundle={b}
                selected={selectedId === b.id}
                onSelect={() => setSelectedId(b.id)}
              />
            ))}
          </div>

          {/* Grid loading / error banner (prima del preview totale) */}
          {selectedBundle && gridsLoading && familyIdsInSelected.length > 0 && (
            <div className="mt-4 rounded-md border p-3 bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Caricamento griglia prezzi…
              </p>
            </div>
          )}
          {selectedBundle && gridsError && (
            <div
              className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 p-3"
              role="alert"
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-destructive">
                      Errore caricamento griglia prezzi
                    </p>
                    <p className="text-xs text-destructive/80 mt-1 break-words">
                      {gridsErrorObj instanceof Error
                        ? gridsErrorObj.message
                        : "Impossibile calcolare i prezzi del bundle."}
                    </p>
                    {anyVoceNeedsGrid && (
                      <p className="text-xs text-destructive/80 mt-1">
                        Il bundle contiene voci che usano la griglia L×H: i prezzi
                        mostrati sarebbero errati. Riprova o rimuovi quelle voci.
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetchGrids()}
                  className="h-9 shrink-0 w-full sm:w-auto"
                >
                  Riprova
                </Button>
              </div>
            </div>
          )}

          {/* Preview totale */}
          {selectedBundle && expansion && (
            <div className="mt-4 rounded-md border p-3 bg-muted/30">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Voci da aggiungere:</span>
                <span className="font-medium">{expansion.items.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Totale stimato:</span>
                <span className="font-bold text-primary">
                  {formatCurrency(expansion.totalPreview)}
                </span>
              </div>
              {Number(selectedBundle.sconto_bundle_pct) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Sconto bundle {selectedBundle.sconto_bundle_pct}% applicato a ogni voce.
                </p>
              )}
              {expansion.warnings.length > 0 && (
                <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">
                    Avvertenze:
                  </p>
                  {expansion.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-800 dark:text-amber-300">
                      · {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2 border-t px-4 sm:px-6 py-3 bg-background">
          <Button
            variant="outline"
            onClick={onClose}
            className="h-10 w-full sm:w-auto"
          >
            Annulla
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={
              !expansion ||
              expansion.items.length === 0 ||
              gridBlocksConfirm ||
              gridsLoading
            }
            title={
              gridBlocksConfirm
                ? "Impossibile aggiungere: griglia prezzi non caricata"
                : undefined
            }
            className="h-10 w-full sm:w-auto"
          >
            <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
            <span className="sm:hidden">
              Aggiungi {expansion ? expansion.items.length : 0}
            </span>
            <span className="hidden sm:inline">
              Aggiungi {expansion ? expansion.items.length : 0} voci
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BundleCardProps {
  bundle: Bundle;
  selected: boolean;
  onSelect: () => void;
}

function BundleCard({ bundle, selected, onSelect }: BundleCardProps) {
  const numVoci = bundle.voci?.length ?? 0;
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Seleziona bundle ${bundle.nome}, ${numVoci} ${numVoci === 1 ? "voce" : "voci"}`}
      className={`cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        selected
          ? "ring-2 ring-primary bg-primary/5"
          : "hover:border-primary/50 hover:shadow-sm"
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm sm:text-base break-words">{bundle.nome}</p>
            {bundle.descrizione && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                {bundle.descrizione}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge variant="outline" className="text-xs">
                {numVoci} {numVoci === 1 ? "voce" : "voci"}
              </Badge>
              {bundle.tipo_lavoro && (
                <Badge variant="secondary" className="text-xs">
                  {bundle.tipo_lavoro}
                </Badge>
              )}
              {Number(bundle.sconto_bundle_pct) > 0 && (
                <Badge variant="default" className="text-xs">
                  -{bundle.sconto_bundle_pct}%
                </Badge>
              )}
              {bundle.is_template && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  template
                </Badge>
              )}
            </div>
          </div>
          {selected && (
            <Check
              className="h-5 w-5 shrink-0 text-primary"
              aria-hidden="true"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
