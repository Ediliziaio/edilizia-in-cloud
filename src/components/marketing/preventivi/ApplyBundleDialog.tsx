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
import { calcolaPrezzoFamiglia } from "@/hooks/useFamilyPricing";
import { formatCurrency } from "@/lib/formatters";
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

/** Fetch grid points for all families involved in the selected bundle. */
function useBundleGrids(familyIds: string[]) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["bundle-grids", companyId, familyIds.sort().join(",")],
    enabled: !!companyId && familyIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("listino_griglia" as never)
        .select("family_id, asse_x, asse_y, prezzo_vendita, prezzo_acquisto")
        .in("family_id", familyIds);
      const byFamily = new Map<string, Array<{
        asse_x: number;
        asse_y: number;
        prezzo_vendita: number;
        prezzo_acquisto: number;
      }>>();
      for (const row of (data ?? []) as Array<{
        family_id: string;
        asse_x: number;
        asse_y: number;
        prezzo_vendita: number;
        prezzo_acquisto: number;
      }>) {
        if (!byFamily.has(row.family_id)) byFamily.set(row.family_id, []);
        byFamily.get(row.family_id)!.push({
          asse_x: Number(row.asse_x),
          asse_y: Number(row.asse_y),
          prezzo_vendita: Number(row.prezzo_vendita),
          prezzo_acquisto: Number(row.prezzo_acquisto ?? 0),
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

  const { data: gridsByFamily } = useBundleGrids(familyIdsInSelected);

  const expansion = useMemo(() => {
    if (!selectedBundle) return null;
    const items: QuoteItemPro[] = [];
    const warnings: string[] = [];
    let sort = currentSortOrder;

    const familyMap = new Map<string, FamilyWithAxes>(
      families.map((f) => [f.id, f]),
    );

    for (const voce of (selectedBundle.voci ?? []).sort((a, z) => a.sort_order - z.sort_order)) {
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
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Applica bundle al preventivo
          </DialogTitle>
          <DialogDescription>
            Seleziona un pacchetto pre-configurato. Le voci verranno aggiunte al preventivo,
            puoi modificarle singolarmente dopo l&apos;inserimento.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 mt-2">
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

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button
            onClick={handleConfirm}
            disabled={!expansion || expansion.items.length === 0}
          >
            <Check className="h-4 w-4 mr-1" />
            Aggiungi {expansion ? expansion.items.length : 0} voci
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
      className={`cursor-pointer transition ${
        selected ? "ring-2 ring-primary" : "hover:border-primary/50"
      }`}
      onClick={onSelect}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium">{bundle.nome}</p>
            {bundle.descrizione && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                {bundle.descrizione}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
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
        </div>
      </CardContent>
    </Card>
  );
}
