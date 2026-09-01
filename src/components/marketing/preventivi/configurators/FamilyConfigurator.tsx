/**
 * FamilyConfigurator — Preventivatore Unificato (Sprint A §4.7).
 *
 * Configura un'istanza di `FamilyWithAxes` per l'aggiunta al preventivo.
 * Riusa `calcolaPrezzoFamiglia` (FASE 5.1) per il pricing; la logica delle
 * linee prodotto fornitore STEP 6 è volutamente semplificata: se la
 * famiglia ha griglia, viene usato il prezzo `prezzo_vendita` del punto più
 * vicino (nearestGrid) senza ricarico linea — chi usa listini avanzati può
 * continuare col vecchio wizard finché il flag è OFF.
 *
 * Al conferma restituisce 1-2 `ConfiguredItem` (prodotto + posa opzionale).
 */
import { useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import {
  calcolaPrezzoFamiglia,
  useFamilyGrid,
} from "@/hooks/useFamilyPricing";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type { AxisSelection, FamilyWithAxes } from "@/types/articleFamily";
import type { QuoteItemPro } from "@/types/quoteItem";
import type { CatalogItemFamily, ConfiguredItem } from "@/types/catalogItem";

interface FamilyConfiguratorProps {
  item: CatalogItemFamily;
  tariffe: TariffaPro[];
  currentSortOrder: number;
  onBack: () => void;
  onAddItems: (items: ConfiguredItem[], nextSortOrder: number) => void;
}

function defaultSelections(family: FamilyWithAxes): AxisSelection {
  const sel: AxisSelection = {};
  for (const ax of family.axes) {
    const def = ax.values.find((v) => v.is_default && v.attivo);
    if (def) sel[ax.codice] = def.id;
    else if (ax.values.length > 0 && ax.values[0].attivo)
      sel[ax.codice] = ax.values[0].id;
  }
  return sel;
}

function needsMisureXY(family: FamilyWithAxes): boolean {
  return (
    family.modalita_prezzo_base === "mq" ||
    family.modalita_prezzo_base === "griglia"
  );
}

/** Genera un UUID v4 cross-browser (crypto.randomUUID dove disponibile). */
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function FamilyConfigurator({
  item,
  tariffe,
  currentSortOrder,
  onBack,
  onAddItems,
}: FamilyConfiguratorProps) {
  const family = item.family;
  const [larghezza, setLarghezza] = useState<string>("1200");
  const [altezza, setAltezza] = useState<string>("1400");
  const [quantita, setQuantita] = useState<string>("1");
  const [selection, setSelection] = useState<AxisSelection>(() =>
    defaultSelections(family),
  );
  const [includePosa, setIncludePosa] = useState<boolean>(
    item.ha_posa_automatica && item.posa_linked,
  );

  const { data: grigliaPunti = [] } = useFamilyGrid(family.id);

  const lMm = Number(larghezza);
  const hMm = Number(altezza);
  const qty = Math.max(1, Number(quantita) || 1);
  const misureValide =
    !needsMisureXY(family) ||
    (Number.isFinite(lMm) && lMm > 0 && Number.isFinite(hMm) && hMm > 0);

  const pricing = useMemo(() => {
    return calcolaPrezzoFamiglia(
      {
        family,
        selections: selection,
        larghezza_mm: needsMisureXY(family) ? lMm : undefined,
        altezza_mm: needsMisureXY(family) ? hMm : undefined,
        quantita: qty,
      },
      grigliaPunti,
    );
  }, [family, selection, lMm, hMm, qty, grigliaPunti]);

  // ── Manodopera: legge la modalità (tariffa/manuale/nessuna) dalla famiglia.
  // In modalità "manuale" i prezzi sono inline sulla famiglia (no tariffa).
  const manodoperaMod =
    (family as unknown as {
      manodopera_modalita?: "tariffa" | "manuale" | "nessuna" | null;
    }).manodopera_modalita ??
    (family.posa_tariffa_default_id ? "tariffa" : "nessuna");
  const manodoperaManuale = manodoperaMod === "manuale" ? {
    costo: Number(
      (family as unknown as { manodopera_costo_acquisto?: number | null })
        .manodopera_costo_acquisto ?? 0,
    ),
    vendita: Number(
      (family as unknown as { manodopera_prezzo_vendita?: number | null })
        .manodopera_prezzo_vendita ?? 0,
    ),
    unita:
      (family as unknown as { manodopera_unita?: string | null })
        .manodopera_unita ?? "pz",
  } : null;

  /** Tariffa posa default della famiglia (solo in modalità tariffa). */
  const tariffaPosa = useMemo<TariffaPro | null>(() => {
    if (manodoperaMod !== "tariffa") return null;
    if (!family.posa_tariffa_default_id) return null;
    return tariffe.find((t) => t.id === family.posa_tariffa_default_id) ?? null;
  }, [manodoperaMod, family.posa_tariffa_default_id, tariffe]);

  const posaUnit = manodoperaManuale
    ? manodoperaManuale.vendita
    : (tariffaPosa?.prezzo_vendita ?? 0);
  // TariffaPro usa `prezzo_costo`/`costo_interno` (non `prezzo_acquisto`).
  const posaAcq = manodoperaManuale
    ? manodoperaManuale.costo
    : (tariffaPosa?.costo_interno ?? tariffaPosa?.prezzo_costo ?? 0);
  const posaUm = manodoperaManuale
    ? manodoperaManuale.unita
    : (tariffaPosa?.unita_fatturazione ?? tariffaPosa?.unita ?? "h");
  const posaNome = manodoperaManuale
    ? "Manodopera (importo manuale)"
    : (tariffaPosa?.nome ?? "Manodopera");
  const posaQtyUnit = family.posa_quantita_default ?? 1;
  const posaDisponibile = manodoperaManuale
    ? manodoperaManuale.vendita > 0 || manodoperaManuale.costo > 0
    : !!tariffaPosa;
  const posaTotale =
    includePosa && posaDisponibile ? posaUnit * posaQtyUnit * qty : 0;

  const totaleCompleto = pricing.totale_vendita + posaTotale;

  const canConfirm = misureValide && qty > 0;

  function handleConfirm(): void {
    const prodottoTempId = uuid();
    const baseSort = currentSortOrder;

    // Griglia info (se disponibile) per rigenerazione coerente in modifica.
    // Usiamo nearest-neighbor Manhattan sul punto effettivo per recuperare
    // supplier_catalog_id / supplier_product_line_id eventualmente presenti.
    let supplierCatalogId: string | null = null;
    let supplierProductLineId: string | null = null;
    if (family.modalita_prezzo_base === "griglia" && grigliaPunti.length > 0) {
      let nearest = grigliaPunti[0];
      let minDist = Infinity;
      for (const p of grigliaPunti) {
        const d = Math.abs(p.valore_x - lMm) + Math.abs(p.valore_y - hMm);
        if (d < minDist) {
          minDist = d;
          nearest = p;
        }
      }
      supplierCatalogId = nearest.supplier_catalog_id ?? null;
      supplierProductLineId = nearest.supplier_product_line_id ?? null;
    }

    const prodotto: QuoteItemPro = {
      item_type: "product",
      item_category: "prodotto",
      name: family.nome,
      description: family.descrizione ?? "",
      quantity: qty,
      unit_price: pricing.unit_price_vendita,
      discount_percent: 0,
      vat_rate: family.vat_rate,
      unit_of_measure: family.unit_of_measure,
      sort_order: baseSort,
      tariffa_id: null,
      prezzo_acquisto: pricing.unit_price_acquisto,
      mostra_nel_pdf: true,
      is_optional: false,
      misura_x: needsMisureXY(family) ? lMm : null,
      misura_y: needsMisureXY(family) ? hMm : null,
      family_id: family.id,
      axis_selections: selection,
      supplier_catalog_id: supplierCatalogId,
      supplier_product_line_id: supplierProductLineId,
      client_temp_id: prodottoTempId,
      parent_temp_id: null,
      parent_item_id: null,
    };

    const configured: ConfiguredItem[] = [
      {
        client_temp_id: prodottoTempId,
        parent_temp_id: null,
        quote_item: prodotto,
      },
    ];

    if (includePosa && posaDisponibile) {
      const posaTempId = uuid();
      const posaItem: QuoteItemPro = {
        item_type: "service",
        item_category: "posa",
        name: `Manodopera — ${family.nome}`,
        description: posaNome,
        quantity: posaQtyUnit * qty,
        unit_price: posaUnit,
        discount_percent: 0,
        // La tariffa non ha vat_rate proprio: eredita quella della famiglia.
        vat_rate: family.vat_rate,
        unit_of_measure: posaUm,
        sort_order: baseSort + 1,
        // In modalità manuale NON esiste una tariffa DB: tariffa_id = null.
        // La persistenza legge prezzo_acquisto/unit_price inline.
        tariffa_id: tariffaPosa?.id ?? null,
        prezzo_acquisto: posaAcq,
        mostra_nel_pdf: true,
        is_optional: false,
        misura_x: null,
        misura_y: null,
        family_id: null,
        axis_selections: null,
        supplier_catalog_id: null,
        supplier_product_line_id: null,
        // Link client-side: la persistenza mappa `parent_temp_id` → parent_item_id
        client_temp_id: posaTempId,
        parent_temp_id: item.posa_linked ? prodottoTempId : null,
        parent_item_id: null,
      };
      configured.push({
        client_temp_id: posaTempId,
        parent_temp_id: item.posa_linked ? prodottoTempId : null,
        quote_item: posaItem,
      });
    }

    onAddItems(configured, baseSort + configured.length);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Prodotti
        </Button>
        <span className="text-sm text-muted-foreground">›</span>
        <span className="text-sm font-medium">{family.nome}</span>
      </div>

      {needsMisureXY(family) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="larghezza">
              {family.griglia_asse_x_label || "Larghezza (mm)"}
            </Label>
            <Input
              id="larghezza"
              type="number"
              inputMode="numeric"
              value={larghezza}
              onChange={(e) => setLarghezza(e.target.value)}
              min={1}
            />
          </div>
          <div>
            <Label htmlFor="altezza">
              {family.griglia_asse_y_label || "Altezza (mm)"}
            </Label>
            <Input
              id="altezza"
              type="number"
              inputMode="numeric"
              value={altezza}
              onChange={(e) => setAltezza(e.target.value)}
              min={1}
            />
          </div>
        </div>
      )}

      {family.axes.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {family.axes.map((axis) => {
            const values = axis.values.filter((v) => v.attivo);
            return (
              <div key={axis.id}>
                <Label htmlFor={`axis-${axis.id}`}>
                  {axis.nome}
                  {axis.obbligatorio && (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                </Label>
                <Select
                  value={selection[axis.codice] ?? ""}
                  onValueChange={(v) =>
                    setSelection((prev) => ({ ...prev, [axis.codice]: v }))
                  }
                >
                  <SelectTrigger id={`axis-${axis.id}`}>
                    <SelectValue placeholder="Seleziona…" />
                  </SelectTrigger>
                  <SelectContent>
                    {values.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <Label htmlFor="quantita">Quantità</Label>
        <Input
          id="quantita"
          type="number"
          inputMode="numeric"
          value={quantita}
          onChange={(e) => setQuantita(e.target.value)}
          min={1}
          className="max-w-[140px]"
        />
      </div>

      {item.ha_posa_automatica && item.posa_linked && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
          <Checkbox
            id="includi-posa"
            checked={includePosa}
            onCheckedChange={(v) => setIncludePosa(v === true)}
          />
          <div className="space-y-0.5">
            <Label htmlFor="includi-posa" className="cursor-pointer">
              Includi manodopera nel preventivo
            </Label>
            <p className="text-xs text-muted-foreground">
              {manodoperaManuale
                ? `Costo cliente: ${formatCurrency(posaUnit)}/${posaUm}. `
                : tariffaPosa
                  ? `Tariffa: ${tariffaPosa.nome} (${formatCurrency(posaUnit)}/${posaUm}). `
                  : ""}
              La riga manodopera resterà legata a questo prodotto: cambiando
              quantità o eliminandolo, anche la manodopera verrà aggiornata.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="space-y-2 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Prezzo unitario</span>
            <span className="font-medium">
              {formatCurrency(pricing.unit_price_vendita)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Quantità × prezzo</span>
            <span className="font-medium">
              {formatCurrency(pricing.totale_vendita)}
            </span>
          </div>
          {includePosa && posaDisponibile && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Manodopera</span>
              <span className="font-medium">{formatCurrency(posaTotale)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Totale</span>
            <span>{formatCurrency(totaleCompleto)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          Annulla
        </Button>
        <Button variant="brand" disabled={!canConfirm} onClick={handleConfirm}>
          <Check className="mr-1 h-4 w-4" />
          Aggiungi al preventivo
        </Button>
      </div>
    </div>
  );
}

export default FamilyConfigurator;
