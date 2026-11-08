import { useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PurchaseOrderItem } from "@/hooks/usePurchaseOrders";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { ArticleCombobox, type ArticleTemplateData } from "./ArticleCombobox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { valoriArticoloAcquisto } from "@/lib/orders/articoloAcquisto";
import {
  trovaVoce,
  prezzoNetto,
  type VoceListinoFornitore,
} from "@/lib/listino/listinoFornitore";
import { useInputDraft } from "@/hooks/useInputDraft";
type Patch = TablesUpdate<"purchase_order_items">;
export function PurchaseOrderItemRow({
  item,
  isEditable,
  senzaPrezzi = false,
  showReceived,
  onUpdate,
  onDelete,
  vociFornitore,
  supplierId,
}: {
  item: PurchaseOrderItem;
  isEditable: boolean;
  /** Chi non vede i costi: niente colonne di prezzo, invece di «0,00 €». */
  senzaPrezzi?: boolean;
  showReceived: boolean;
  onUpdate: (patch: Patch) => Promise<unknown>;
  onDelete: () => void;
  vociFornitore?: VoceListinoFornitore[];
  supplierId?: string;
}) {
  const [desc, setDesc] = useInputDraft(item.description);
  const [qty, setQty] = useInputDraft(String(item.quantity));
  const [um, setUm] = useInputDraft(item.unit_of_measure || "pz");
  const [pendingText, setPendingText] = useInputDraft(
    item.price_pending ? "yes" : "no",
  );
  const pending = pendingText === "yes";
  const setPending = (value: boolean) => setPendingText(value ? "yes" : "no");
  const [price, setPrice] = useInputDraft(
    item.price_pending ? "" : String(item.unit_price),
  );
  const [disc, setDisc] = useInputDraft(String(item.discount_percent));
  const [vat, setVat] = useInputDraft(String(item.vat_rate));
  const [received, setReceived] = useInputDraft(String(item.quantity_received));
  const [savingCount, setSavingCount] = useState(0);
  const saving = savingCount > 0;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef<Record<string, number>>({});
  const sequence = useRef(0);
  const save = async (patch: Patch, rollback: () => void) => {
    const id = ++sequence.current;
    Object.keys(patch).forEach((key) => {
      latest.current[key] = id;
    });
    setSavingCount((n) => n + 1);
    const operation = queue.current.then(() => onUpdate(patch));
    queue.current = operation.catch((): void => undefined);
    try {
      await operation;
    } catch {
      if (Object.keys(patch).every((key) => latest.current[key] === id))
        rollback();
    } finally {
      setSavingCount((n) => n - 1);
    }
  };
  const prezzoListino = useMemo(() => {
    const v = vociFornitore?.length
      ? trovaVoce(vociFornitore, { codice: item.sku, descrizione: desc })
      : null;
    return v ? prezzoNetto(v.prezzo, v.sconto_pct) : null;
  }, [vociFornitore, item.sku, desc]);
  const rollbackPrezzo = () => {
    setPrice(item.price_pending ? "" : String(item.unit_price));
    setPending(!!item.price_pending);
  };
  const salvaPrezzo = () => {
    const attesa = price.trim() === "";
    const n = attesa ? 0 : Number(price);
    if (!Number.isFinite(n) || n < 0) {
      toast.error(
        "Il prezzo deve essere positivo o zero, oppure vuoto se da confermare.",
      );
      rollbackPrezzo();
      return;
    }
    setPending(attesa);
    if (attesa !== !!item.price_pending || n !== item.unit_price)
      void save({ unit_price: n, price_pending: attesa }, rollbackPrezzo);
  };
  const scegliArticolo = (name: string, t?: ArticleTemplateData) => {
    const v = t
      ? valoriArticoloAcquisto(t)
      : {
          unit_price: 0,
          unit_of_measure: um,
          vat_rate:
            vat.trim() !== "" && Number.isFinite(Number(vat))
              ? Number(vat)
              : 22,
        };
    const attesa = !t || !(t.standard_cost > 0);
    const quantita = qty.trim() && Number(qty) > 0 ? Number(qty) : 1;
    setQty(String(quantita));
    setDesc(name);
    setPrice(attesa ? "" : String(v.unit_price));
    setPending(attesa);
    setDisc("0");
    setUm(v.unit_of_measure);
    setVat(String(v.vat_rate));
    void save(
      {
        description: name,
        quantity: quantita,
        unit_price: v.unit_price,
        price_pending: attesa,
        unit_of_measure: v.unit_of_measure,
        vat_rate: v.vat_rate,
        discount_percent: 0,
        sku: t?.sku || null,
        article_template_id: t?.id || null,
      },
      () => {
        setDesc(item.description);
        rollbackPrezzo();
        setDisc(String(item.discount_percent));
        setUm(item.unit_of_measure || "pz");
        setVat(String(item.vat_rate));
      },
    );
  };
  const salvaNumero = (
    campo: "quantity" | "discount_percent" | "vat_rate",
    value: string,
    set: (s: string) => void,
    min: number,
    max = Infinity,
  ) => {
    const n = Number(value);
    if (!value.trim() || !Number.isFinite(n) || n < min || n > max) {
      set(String(item[campo]));
      toast.error(
        campo === "quantity"
          ? item.quantity_received > 0
            ? `La quantità non può essere inferiore ai ${item.quantity_received} pezzi già ricevuti.`
            : "Indica una quantità maggiore di zero."
          : "Indica una percentuale tra 0 e 100.",
      );
      return;
    }
    if (n !== item[campo])
      void save({ [campo]: n }, () => set(String(item[campo])));
  };
  const netto =
    qty.trim() !== "" && price.trim() !== ""
      ? Math.round(
          Number(qty) * Number(price) * (1 - Number(disc) / 100) * 100,
        ) / 100
      : null;
  const totaleMostrato = isEditable ? netto : item.line_total;
  const prezzoInAttesa = isEditable ? pending : !!item.price_pending;
  return (
    <tr className="border-b align-top" aria-label={`Articolo ${desc}`}>
      <td className="min-w-[260px] p-1 pl-2">
        {isEditable && !(item.quantity_received > 0) ? (
          <ArticleCombobox
            value={desc}
            modalita="acquisto"
            preferredSupplierId={supplierId}
            onValueChange={scegliArticolo}
            placeholder="Cerca articolo o scrivi una nuova voce…"
          />
        ) : (
          <span className="block p-2">{item.description}</span>
        )}
        {item.misure_testo && (
          <span className="block whitespace-pre-line px-2 pb-1 text-xs text-slate-600">{item.misure_testo}</span>
        )}
        {item.ripartito && (
          <span className="ml-2 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800" title="Prezzo ricavato da un'offerta a corpo, ripartita sui mq delle posizioni">
            Ripartito
          </span>
        )}
        {saving && (
          <span
            role="status"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            Salvataggio…
          </span>
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input
            aria-label="Quantità"
            type="number"
            min={Math.max(0.001, item.quantity_received || 0)}
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={() => salvaNumero("quantity", qty, setQty, Math.max(0.001, item.quantity_received || 0))}
            className="h-8 w-16 text-right text-sm"
          />
        ) : (
          item.quantity
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input
            aria-label="Unità di misura"
            disabled={item.quantity_received > 0}
            value={um}
            onChange={(e) => setUm(e.target.value)}
            onBlur={() => {
              const v = um.trim() || "pz";
              setUm(v);
              if (v !== (item.unit_of_measure || "pz"))
                void save({ unit_of_measure: v }, () =>
                  setUm(item.unit_of_measure || "pz"),
                );
            }}
            className="h-8 w-14 text-sm"
          />
        ) : (
          item.unit_of_measure || "pz"
        )}
      </td>
      {!senzaPrezzi && <>
      <td className="p-1">
        {isEditable ? (
          <div className="min-w-32">
            <Input
              aria-label="Prezzo di acquisto"
              type="number"
              min="0"
              step="0.01"
              value={price}
              placeholder="Da confermare"
              onChange={(e) => {
                setPrice(e.target.value);
                if (e.target.value !== "") setPending(false);
              }}
              onBlur={salvaPrezzo}
              className="h-8 w-full text-right text-sm"
            />
            {prezzoListino != null &&
              (pending || Math.abs(prezzoListino - Number(price)) > 0.004) && (
                <button
                  className="mt-1 block text-[11px] text-primary hover:underline"
                  type="button"
                  onClick={() => {
                    setPrice(String(prezzoListino));
                    setPending(false);
                    void save(
                      { unit_price: prezzoListino, price_pending: false },
                      rollbackPrezzo,
                    );
                  }}
                >
                  Usa listino: {formatCurrency(prezzoListino)}
                </button>
              )}
          </div>
        ) : item.price_pending ? (
          <span className="text-xs text-amber-700">Da confermare</span>
        ) : (
          formatCurrency(item.unit_price)
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input
            aria-label="Sconto percentuale"
            type="number"
            min="0"
            max="100"
            value={disc}
            disabled={pending}
            onChange={(e) => setDisc(e.target.value)}
            onBlur={() =>
              salvaNumero("discount_percent", disc, setDisc, 0, 100)
            }
            className="h-8 w-14 text-right text-sm"
          />
        ) : item.discount_percent ? (
          `${item.discount_percent}%`
        ) : (
          "—"
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input
            aria-label="IVA percentuale"
            type="number"
            min="0"
            max="100"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
            onBlur={() => salvaNumero("vat_rate", vat, setVat, 0, 100)}
            className="h-8 w-14 text-right text-sm"
          />
        ) : (
          `${item.vat_rate}%`
        )}
      </td>
      <td className="whitespace-nowrap p-2 text-right font-medium">
        {prezzoInAttesa ? (
          <span className="text-xs text-amber-700">Da confermare</span>
        ) : totaleMostrato == null || !Number.isFinite(totaleMostrato) ? (
          "—"
        ) : (
          formatCurrency(totaleMostrato)
        )}
      </td>
      </>}
      {isEditable && (
        <td className="p-1">
          <div className="flex items-center justify-end gap-2">
            <label className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-normal text-slate-600" title="Prezzo da confermare">
              <input
                type="checkbox"
                aria-label="Prezzo da confermare"
                checked={pending}
                disabled={saving}
                onChange={(e) => {
                  const p = e.target.checked;
                  setPending(p);
                  setPrice(p ? "" : "0");
                  void save(
                    { unit_price: 0, price_pending: p },
                    rollbackPrezzo,
                  );
                }}
              />
              Da confermare
            </label>
          <Button
            aria-label={`Rimuovi ${desc}`}
            variant="ghost"
            size="sm"
            disabled={saving || item.quantity_received > 0}
            title={item.quantity_received > 0 ? "La riga contiene merce già ricevuta" : undefined}
            className="h-7 w-7 p-0"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          </div>
        </td>
      )}
      {showReceived && (
        <td className="p-1">
          <Input
            aria-label="Quantità ricevuta"
            type="number"
            min="0"
            max={item.quantity}
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            onBlur={() => {
              const n = Number(received);
              if (
                !received.trim() ||
                !Number.isFinite(n) ||
                n < 0 ||
                n > item.quantity
              ) {
                setReceived(String(item.quantity_received));
                toast.error(
                  `Indica una quantità ricevuta tra 0 e ${item.quantity}.`,
                );
                return;
              }
              if (n !== item.quantity_received)
                void save(
                  {
                    quantity_received: n,
                    received_date: format(new Date(), "yyyy-MM-dd"),
                  },
                  () => setReceived(String(item.quantity_received)),
                );
            }}
            className="h-8 w-16 text-right text-sm"
          />
        </td>
      )}
    </tr>
  );
}
