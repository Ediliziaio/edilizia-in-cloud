/**
 * ArticleConfigurator — Preventivatore Unificato (Sprint A §4.8).
 *
 * Configura un `CatalogItemArticle` (sorgente: article_templates) per
 * l'aggiunta al preventivo. Gestisce le quattro modalità di prezzo legacy:
 *   - "pz"            → quantità semplice × prezzo_vendita
 *   - "mq"            → larghezza × altezza × qty × prezzo_mq
 *   - "misura_libera" → larghezza × altezza solo per descrizione (prezzo base × qty)
 *   - "griglia"       → prezzo_vendita come base, qty × prezzo (NB: la griglia
 *                       completa lato articolo è gestita solo dal wizard serramenti
 *                       legacy; qui usiamo il fallback `prezzo_vendita`)
 *
 * Al conferma restituisce 1-2 `ConfiguredItem` (prodotto + montaggio opzionale).
 * Il link `posa_linked` collega la riga montaggio alla riga prodotto tramite
 * `parent_temp_id` (UUID client-side) → il layer di persistenza farà il mapping
 * `parent_temp_id → quote_items.parent_item_id` al SAVE.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/formatters";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type { QuoteItemPro } from "@/types/quoteItem";
import type {
  CatalogItemArticle,
  ConfiguredItem,
  ModalitaPrezzoUnified,
} from "@/types/catalogItem";

interface ArticleConfiguratorProps {
  item: CatalogItemArticle;
  tariffe: TariffaPro[];
  currentSortOrder: number;
  onBack: () => void;
  onAddItems: (items: ConfiguredItem[], nextSortOrder: number) => void;
}

/** Genera un UUID v4 cross-browser (crypto.randomUUID dove disponibile). */
function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function needsMisureXY(modalita: ModalitaPrezzoUnified): boolean {
  return modalita === "mq" || modalita === "misura_libera";
}

export function ArticleConfigurator({
  item,
  tariffe,
  currentSortOrder,
  onBack,
  onAddItems,
}: ArticleConfiguratorProps) {
  const article = item.article;
  const modalita = item.modalita_prezzo;
  const showMisure = needsMisureXY(modalita);

  const [larghezza, setLarghezza] = useState<string>("1000");
  const [altezza, setAltezza] = useState<string>("1000");
  const [quantita, setQuantita] = useState<string>("1");
  const [includePosa, setIncludePosa] = useState<boolean>(
    item.ha_montaggio_automatico && item.posa_linked,
  );

  const lMm = Number(larghezza);
  const hMm = Number(altezza);
  const qty = Math.max(1, Number(quantita) || 1);
  const misureValide =
    !showMisure ||
    (Number.isFinite(lMm) && lMm > 0 && Number.isFinite(hMm) && hMm > 0);

  const prezzoBaseVendita = article.prezzo_vendita ?? 0;
  const prezzoBaseAcquisto = article.prezzo_acquisto_netto ?? 0;
  const vatRate = article.vat_rate ?? 22;
  const unitOfMeasure = article.unit_of_measure ?? "pz";

  // Calcolo prezzo unitario e totale per modalità.
  const { unitPriceVendita, unitPriceAcquisto, totaleVendita } = useMemo(() => {
    // mq: prezzo_vendita è €/mq → unit price = prezzo × (m² pezzo singolo)
    if (modalita === "mq" && misureValide) {
      const mqPerPezzo = (lMm / 1000) * (hMm / 1000);
      const unitV = prezzoBaseVendita * mqPerPezzo;
      const unitA = prezzoBaseAcquisto * mqPerPezzo;
      return {
        unitPriceVendita: unitV,
        unitPriceAcquisto: unitA,
        totaleVendita: unitV * qty,
      };
    }
    // pz / griglia / misura_libera: prezzo_vendita è il prezzo unitario finale.
    // (La vera griglia lato articolo è usata solo dal wizard serramenti legacy;
    // qui il nuovo Preventivatore Unificato v1 tratta "griglia" come "pz" col
    // prezzo base. Utenti avanzati continuano a usare il wizard finché il flag
    // PREVENTIVATORE_UNIFIED_V1 è spento.)
    return {
      unitPriceVendita: prezzoBaseVendita,
      unitPriceAcquisto: prezzoBaseAcquisto,
      totaleVendita: prezzoBaseVendita * qty,
    };
  }, [modalita, misureValide, lMm, hMm, qty, prezzoBaseVendita, prezzoBaseAcquisto]);

  /** Tariffa montaggio default dell'articolo (se configurata). */
  const tariffaPosa = useMemo<TariffaPro | null>(() => {
    if (!article.montaggio_tariffa_id) return null;
    return tariffe.find((t) => t.id === article.montaggio_tariffa_id) ?? null;
  }, [article.montaggio_tariffa_id, tariffe]);

  const posaUnit = tariffaPosa?.prezzo_vendita ?? 0;
  const posaAcq = tariffaPosa?.costo_interno ?? tariffaPosa?.prezzo_costo ?? 0;
  const posaUm = tariffaPosa?.unita_fatturazione ?? tariffaPosa?.unita ?? "h";
  // Per articoli non esiste `posa_quantita_default` come in famiglia →
  // usiamo 1 × qty (posa singola per pezzo). In futuro si può leggere
  // article.montaggio_tipo per raffinare.
  const posaQtyPerPezzo = 1;
  const posaTotale = includePosa && tariffaPosa ? posaUnit * posaQtyPerPezzo * qty : 0;

  const totaleCompleto = totaleVendita + posaTotale;
  const canConfirm = misureValide && qty > 0;

  function handleConfirm(): void {
    const prodottoTempId = uuid();
    const baseSort = currentSortOrder;

    // Descrizione arricchita con misure per modalità mq/misura_libera.
    const descrParts: string[] = [];
    if (article.description) descrParts.push(article.description);
    if (showMisure) descrParts.push(`${lMm}×${hMm}mm`);
    const descrizione = descrParts.join(" — ");

    const prodotto: QuoteItemPro = {
      item_type: "product",
      item_category: "prodotto",
      name: article.name,
      description: descrizione,
      quantity: qty,
      unit_price: unitPriceVendita,
      discount_percent: 0,
      vat_rate: vatRate,
      unit_of_measure: unitOfMeasure,
      sort_order: baseSort,
      article_template_id: article.id,
      tariffa_id: null,
      prezzo_acquisto: unitPriceAcquisto,
      mostra_nel_pdf: true,
      is_optional: false,
      misura_x: showMisure ? lMm : null,
      misura_y: showMisure ? hMm : null,
      family_id: null,
      axis_selections: null,
      supplier_catalog_id: null,
      supplier_product_line_id: null,
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

    if (includePosa && tariffaPosa) {
      const posaTempId = uuid();
      const posaItem: QuoteItemPro = {
        item_type: "service",
        item_category: "posa",
        name: `Montaggio — ${article.name}`,
        description: tariffaPosa.nome,
        quantity: posaQtyPerPezzo * qty,
        unit_price: posaUnit,
        discount_percent: 0,
        vat_rate: vatRate,
        unit_of_measure: posaUm,
        sort_order: baseSort + 1,
        article_template_id: null,
        tariffa_id: tariffaPosa.id,
        prezzo_acquisto: posaAcq,
        mostra_nel_pdf: true,
        is_optional: false,
        misura_x: null,
        misura_y: null,
        family_id: null,
        axis_selections: null,
        supplier_catalog_id: null,
        supplier_product_line_id: null,
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
        <span className="text-sm font-medium">{article.name}</span>
        {article.sku && (
          <span className="text-xs text-muted-foreground">
            ({article.sku})
          </span>
        )}
      </div>

      {article.description && (
        <p className="text-sm text-muted-foreground">{article.description}</p>
      )}

      {showMisure && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="larghezza">Larghezza (mm)</Label>
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
            <Label htmlFor="altezza">Altezza (mm)</Label>
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

      {item.ha_montaggio_automatico && item.posa_linked && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3">
          <Checkbox
            id="includi-posa"
            checked={includePosa}
            onCheckedChange={(v) => setIncludePosa(v === true)}
          />
          <div className="space-y-0.5">
            <Label htmlFor="includi-posa" className="cursor-pointer">
              Includi montaggio nel preventivo
            </Label>
            <p className="text-xs text-muted-foreground">
              Il montaggio resterà legato a questo prodotto: cambiando quantità
              o eliminandolo, anche il montaggio verrà aggiornato.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="space-y-2 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Prezzo unitario</span>
            <span className="font-medium">
              {formatCurrency(unitPriceVendita)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Quantità × prezzo</span>
            <span className="font-medium">{formatCurrency(totaleVendita)}</span>
          </div>
          {includePosa && tariffaPosa && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Montaggio</span>
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
        <Button disabled={!canConfirm} onClick={handleConfirm}>
          <Check className="mr-1 h-4 w-4" />
          Aggiungi al preventivo
        </Button>
      </div>
    </div>
  );
}

export default ArticleConfigurator;
