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
import { useEffect, useMemo, useRef, useState } from "react";
import { descrizioneCommerciale } from "@/lib/preventivi/configurazioneSemplice";
import { haManodoperaConfigurata } from "@/lib/preventivi/avvisiInserimento";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/formatters";
import { CampoQuantita } from "./CampoQuantita";
import { AzioniProdotto, LayoutConfigurazione, type DopoAggiunta } from "./LayoutConfigurazione";
import type { TariffaPro } from "@/hooks/usePreventivoCosti";
import type { QuoteItemPro } from "@/types/quoteItem";
import type {
  CatalogItemArticle,
  ConfiguredItem,
  ModalitaPrezzoUnified,
} from "@/types/catalogItem";
import { costoTariffa, unitaTariffa } from "@/lib/listino/costoTariffa";

interface ArticleConfiguratorProps {
  confirmLabel?: string;
  item: CatalogItemArticle;
  tariffe: TariffaPro[];
  currentSortOrder: number;
  onBack: () => void;
  onAddItems: (items: ConfiguredItem[], nextSortOrder: number, dopo?: DopoAggiunta) => void;
  /** Popup del preventivo: mostra i pulsanti per continuare a inserire. */
  inserimentoContinuo?: boolean;
  /** Sale a ogni «duplica»: si riparte dalle stesse scelte, con le misure da riscrivere. */
  nuovaMisura?: number;
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
  confirmLabel = "Aggiungi al preventivo",
  item,
  tariffe,
  currentSortOrder,
  onBack,
  onAddItems,
  inserimentoContinuo,
  nuovaMisura = 0,
}: ArticleConfiguratorProps) {
  const article = item.article;
  const modalita = item.modalita_prezzo;
  const showMisure = needsMisureXY(modalita);

  const [larghezza, setLarghezza] = useState<string>("1000");
  const [altezza, setAltezza] = useState<string>("1000");
  const [quantita, setQuantita] = useState<string>("1");
  const campoLarghezza = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!nuovaMisura) return;
    setQuantita("1");
    campoLarghezza.current?.focus();
    campoLarghezza.current?.select();
  }, [nuovaMisura]);
  const [includePosa, setIncludePosa] = useState<boolean>(
    haManodoperaConfigurata(item),
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
    return tariffe.find((t) => t.id === article.montaggio_tariffa_id && t.attivo !== false && t.attiva !== false) ?? null;
  }, [article.montaggio_tariffa_id, tariffe]);

  const posaUnit = tariffaPosa?.prezzo_vendita ?? 0;
  // Costo e unità della posa con le regole uniche (lib/listino/costoTariffa).
  const posaAcq = costoTariffa(tariffaPosa) ?? 0;
  const posaUm = unitaTariffa(tariffaPosa, "h");
  // Per articoli non esiste `posa_quantita_default` come in famiglia →
  // usiamo 1 × qty (posa singola per pezzo). In futuro si può leggere
  // article.montaggio_tipo per raffinare.
  const posaQtyPerPezzo = 1;
  const posaTotale = includePosa && tariffaPosa ? posaUnit * posaQtyPerPezzo * qty : 0;

  const totaleCompleto = totaleVendita + posaTotale;
  const canConfirm = misureValide && qty > 0 && (!includePosa || !!tariffaPosa);

  function handleConfirm(dopo?: DopoAggiunta): void {
    if (!canConfirm) return;
    const prodottoTempId = uuid();
    const baseSort = currentSortOrder;

    // Descrizione arricchita con misure per modalità mq/misura_libera.
    const descrParts: string[] = [];
    if (article.description) descrParts.push(descrizioneCommerciale(article.description));
    if (showMisure) descrParts.push(`${lMm}×${hMm}mm`);
    const descrizione = descrParts.filter(Boolean).join(" — ");

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

    onAddItems(configured, baseSort + configured.length, dopo);
  }

  return (
    <LayoutConfigurazione
      scelte={
        <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 text-muted-foreground max-sm:h-8">
          <ArrowLeft className="mr-1 h-4 w-4" /> Cambia prodotto
        </Button>
        {article.sku && (
          <span className="text-xs text-muted-foreground max-sm:hidden">
            Codice {article.sku}
          </span>
        )}
      </div>

      {descrizioneCommerciale(article.description) && (
        // Telefono no: la descrizione del listino si legge dal computer.
        <p className="text-sm text-muted-foreground max-sm:hidden">{descrizioneCommerciale(article.description)}</p>
      )}

      {showMisure && nuovaMisura > 0 && (
        <p className="text-sm font-medium text-primary">
          Stesse scelte di prima: scrivi le misure del prossimo pezzo.
        </p>
      )}
      {showMisure && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="larghezza">Larghezza (mm)</Label>
            <Input
              id="larghezza"
              ref={campoLarghezza}
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

      {haManodoperaConfigurata(item) && (
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
              {tariffaPosa && `${tariffaPosa.nome} · Prezzo cliente ${formatCurrency(posaUnit)}/${posaUm}. `}
              {item.posa_linked ? "Verrà aggiunta una riga di montaggio collegata al prodotto: quantità ed eliminazione seguiranno il prodotto." : "Verrà aggiunta una riga separata di montaggio, modificabile indipendentemente."}
            </p>
            {!tariffaPosa && <p role="alert" className="text-xs text-destructive">La tariffa di montaggio non è disponibile o è inattiva. Correggi il collegamento oppure deseleziona il montaggio per inserire solo il prodotto.</p>}
            {includePosa && tariffaPosa && posaUnit <= 0 && <p role="status" className="text-xs text-amber-800">Prezzo cliente del montaggio da completare sulla riga. Il costo d’acquisto resta interno.</p>}
          </div>
        </div>
      )}

        </>
      }
      azioni={
        <>
      <CampoQuantita value={quantita} onChange={setQuantita} />

      {unitPriceVendita <= 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Prezzo non impostato nel listino: scrivilo nella riga del preventivo.
        </p>
      )}

      <Card>
        <CardContent className="space-y-1.5 p-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Prezzo unitario</span>
            <span className="font-medium">
              {unitPriceVendita > 0 ? formatCurrency(unitPriceVendita) : "Da completare"}
            </span>
          </div>
          {includePosa && tariffaPosa && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Montaggio</span>
              <span className="font-medium">{formatCurrency(posaTotale)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <span>Totale</span>
            <span>{unitPriceVendita > 0 ? formatCurrency(totaleCompleto) : "Da completare"}</span>
          </div>
        </CardContent>
      </Card>

      <AzioniProdotto
        disabled={!canConfirm}
        confirmLabel={confirmLabel}
        inserimentoContinuo={inserimentoContinuo}
        puoDuplicare={showMisure}
        onConferma={handleConfirm}
      />
        </>
      }
    />
  );
}

export default ArticleConfigurator;
