import { useMemo, useRef, useState } from "react";
import { Trash2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import type { AggiornamentoRigaOda, PurchaseOrderItem } from "@/hooks/usePurchaseOrders";
import type { ResiduiDestinazioniRiga } from "@/hooks/useControlloOrdiniDDT";
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
import { giornoItaliano } from "@/lib/listino/validitaListino";
import { useInputDraft } from "@/hooks/useInputDraft";
import { OfficeSelect } from "./OfficeSelect";
import { DestinazioniRigaOdaDialog } from "./DestinazioniRigaOdaDialog";
import {
  aliquotaNormalizzata,
  opzioniAliquota,
  opzioniUnita,
  unitaNormalizzata,
  type OpzioneRiga,
} from "@/lib/orders/rigaAcquisto";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

/** La sigla si legge nella casella, la spiegazione solo a menu aperto. */
const voceMenu = (o: OpzioneRiga) => ({
  value: o.value,
  label: (
    <>
      {o.breve}
      {o.nota && <span className="spiega"> — {o.nota}</span>}
    </>
  ),
});
type Patch = AggiornamentoRigaOda;
export function PurchaseOrderItemRow({
  item,
  isEditable,
  inversioneContabile = false,
  senzaPrezzi = false,
  showReceived,
  onUpdate,
  onDelete,
  vociFornitore,
  supplierId,
  commessaPrincipaleId = null,
  residuiDestinazioni,
}: {
  item: PurchaseOrderItem;
  isEditable: boolean;
  /** Ordine in reverse charge: l'aliquota è zero per tutte le righe e non si tocca qui. */
  inversioneContabile?: boolean;
  /** Chi non vede i costi: niente colonne di prezzo, invece di «0,00 €». */
  senzaPrezzi?: boolean;
  showReceived: boolean;
  onUpdate: (patch: Patch) => Promise<unknown>;
  onDelete: () => void;
  vociFornitore?: VoceListinoFornitore[];
  supplierId?: string;
  commessaPrincipaleId?: string | null;
  residuiDestinazioni?: ResiduiDestinazioniRiga;
}) {
  const tr = useT();
  const [desc, setDesc] = useInputDraft(item.description);
  const [qty, setQty] = useInputDraft(String(item.quantity));
  const [destinazioniAperte, setDestinazioniAperte] = useState(false);
  const destinazioni = item.destinazioni_previste ?? [];
  const riepilogoDestinazioni = destinazioni.map(d =>
    `${d.nome ?? (d.tipo === "commessa" ? tr("Commessa") : tr("Magazzino"))} · ${d.quantita.toLocaleString(intlCampo(), { maximumFractionDigits: 3 })}`,
  ).join(" / ");
  const quantitaLocale = (n: number) => n.toLocaleString(intlCampo(), { maximumFractionDigits: 3 });
  const [um, setUm] = useInputDraft(unitaNormalizzata(item.unit_of_measure) || "pz");
  const [pendingText, setPendingText] = useInputDraft(
    item.price_pending ? "yes" : "no",
  );
  const pending = pendingText === "yes";
  const setPending = (value: boolean) => setPendingText(value ? "yes" : "no");
  const [price, setPrice] = useInputDraft(
    item.price_pending ? "" : String(item.unit_price),
  );
  const [disc, setDisc] = useInputDraft(String(item.discount_percent));
  const [vat, setVat] = useInputDraft(aliquotaNormalizzata(item.vat_rate));
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
  // La voce del listino, col suo prezzo netto e la scadenza del listino da cui
  // viene: un prezzo di un listino scaduto si propone lo stesso, ma dicendolo.
  const daListino = useMemo(() => {
    const v = vociFornitore?.length
      ? trovaVoce(vociFornitore, { codice: item.sku, descrizione: desc })
      : null;
    return v ? { prezzo: prezzoNetto(v.prezzo, v.sconto_pct), scadutoIl: v.listinoScadutoIl ?? null } : null;
  }, [vociFornitore, item.sku, desc]);
  const prezzoListino = daListino?.prezzo ?? null;
  const rollbackPrezzo = () => {
    setPrice(item.price_pending ? "" : String(item.unit_price));
    setPending(!!item.price_pending);
  };
  const salvaPrezzo = () => {
    const attesa = price.trim() === "";
    const n = attesa ? 0 : Number(price);
    if (!Number.isFinite(n) || n < 0) {
      toast.error(
        tr("Il prezzo deve essere positivo o zero, oppure vuoto se da confermare."),
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
        setVat(aliquotaNormalizzata(item.vat_rate));
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
            ? tr("La quantità non può essere inferiore ai {n} pezzi già ricevuti.", { n: item.quantity_received })
            : tr("Indica una quantità maggiore di zero.")
          : tr("Indica una percentuale tra 0 e 100."),
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
    <tr className="border-b align-top" aria-label={tr("Articolo {nome}", { nome: desc })}>
      <td className="min-w-[260px] p-1 pl-2">
        {isEditable && !(item.quantity_received > 0) ? (
          <ArticleCombobox
            value={desc}
            modalita="acquisto"
            preferredSupplierId={supplierId}
            onValueChange={scegliArticolo}
            placeholder={tr("Cerca articolo o scrivi una nuova voce…")}
          />
        ) : (
          <span className="block p-2">{item.description}</span>
        )}
        {item.misure_testo && (
          <span className="block whitespace-pre-line px-2 pb-1 text-xs text-slate-600">{item.misure_testo}</span>
        )}
        {riepilogoDestinazioni && (
          <span className="block px-2 pb-1 text-xs text-muted-foreground">{riepilogoDestinazioni}</span>
        )}
        {residuiDestinazioni && <ul className="space-y-0.5 px-2 pb-1 text-xs text-muted-foreground">
          {residuiDestinazioni.destinazioni.map(d => <li key={`${d.tipo}:${d.id}`}>
            {d.nome ?? (d.tipo === "commessa" ? tr("Commessa") : tr("Magazzino"))} · {tr("{n} da consegnare", { n: quantitaLocale(d.residua) })}
            {d.eccedenza > 0 && ` · ${tr("{n} in più", { n: quantitaLocale(d.eccedenza) })}`}
          </li>)}
          {residuiDestinazioni.non_attribuita > 0 && <li>{tr("{n} ricevuti con destinazione da attribuire.", { n: quantitaLocale(residuiDestinazioni.non_attribuita) })}</li>}
          {residuiDestinazioni.fuori_piano > 0 && <li>{tr("{n} consegnati fuori piano.", { n: quantitaLocale(residuiDestinazioni.fuori_piano) })}</li>}
          {residuiDestinazioni.da_verificare && residuiDestinazioni.non_attribuita === 0 && <li>{tr("Verifica le quantità registrate.")}</li>}
        </ul>}
        {destinazioniAperte && (
          <DestinazioniRigaOdaDialog item={item} commessaId={commessaPrincipaleId}
            onSave={onUpdate} onClose={() => setDestinazioniAperte(false)} />
        )}
        {item.ripartito && (
          <span className="ml-2 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800" title={tr("Prezzo ricavato da un'offerta a corpo, ripartita sui mq delle posizioni")}>
            {tr("Ripartito")}
          </span>
        )}
        {saving && (
          <span
            role="status"
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500"
          >
            <Loader2 className="h-3 w-3 animate-spin" />
            {tr("Salvataggio…")}
          </span>
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input
            aria-label={tr("Quantità")}
            title={destinazioni.length ? tr("Modifica la quantità dalle destinazioni dell’articolo.") : undefined}
            disabled={destinazioni.length > 0}
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
          <OfficeSelect
            label={tr("Unità di misura")}
            disabled={item.quantity_received > 0}
            value={um}
            onValueChange={(v) => {
              setUm(v);
              if (v !== (item.unit_of_measure || "pz"))
                void save({ unit_of_measure: v }, () =>
                  setUm(unitaNormalizzata(item.unit_of_measure) || "pz"),
                );
            }}
            className="h-8 w-24 px-2 text-sm [&_.spiega]:hidden"
            options={opzioniUnita(um).map(voceMenu)}
          />
        ) : (
          item.unit_of_measure || "pz"
        )}
      </td>
      {showReceived && (
        <>
        <td className="whitespace-nowrap p-2 text-right tabular-nums">
          {(item.quantity_received ?? 0).toLocaleString(intlCampo(), { maximumFractionDigits: 4 })}
        </td>
        <td className="whitespace-nowrap p-2 text-right tabular-nums">
          {Math.max(0, item.quantity - (item.quantity_received ?? 0)).toLocaleString(intlCampo(), { maximumFractionDigits: 4 })}
        </td>
        </>
      )}
      {!senzaPrezzi && <>
      <td className="p-1">
        {isEditable ? (
          <div className="min-w-32">
            <Input
              aria-label={tr("Prezzo di acquisto")}
              type="number"
              min="0"
              step="0.01"
              value={price}
              placeholder={tr("Da confermare")}
              onChange={(e) => {
                setPrice(e.target.value);
                if (e.target.value !== "") setPending(false);
              }}
              onBlur={salvaPrezzo}
              className="h-8 w-full text-right text-sm"
            />
            {prezzoListino !== null &&
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
                  {tr("Usa listino: {prezzo}", { prezzo: formatCurrency(prezzoListino) })}
                  {daListino?.scadutoIl ? ` (${tr("non aggiornato")})` : ""}
                </button>
              )}
            {prezzoListino !== null && daListino?.scadutoIl && (
              <span className="mt-0.5 block text-[11px] text-amber-700">
                {tr("Listino scaduto il {data}: controlla il prezzo col fornitore.", { data: giornoItaliano(daListino.scadutoIl) })}
              </span>
            )}
          </div>
        ) : item.price_pending ? (
          <span className="text-xs text-amber-700">{tr("Da confermare")}</span>
        ) : (
          formatCurrency(item.unit_price)
        )}
      </td>
      <td className="p-1">
        {isEditable ? (
          <Input
            aria-label={tr("Sconto percentuale")}
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
        {inversioneContabile ? (
          <span className="text-xs text-slate-600">{tr("Inv. cont.")}</span>
        ) : isEditable ? (
          <OfficeSelect
            label={tr("IVA percentuale")}
            value={vat}
            onValueChange={(v) => {
              setVat(v);
              if (Number(v) !== Number(item.vat_rate))
                void save({ vat_rate: Number(v) }, () =>
                  setVat(aliquotaNormalizzata(item.vat_rate)),
                );
            }}
            className="h-8 w-20 px-2 text-sm [&_.spiega]:hidden"
            options={opzioniAliquota(vat).map(voceMenu)}
          />
        ) : (
          `${item.vat_rate}%`
        )}
      </td>
      <td className="whitespace-nowrap p-2 text-right font-medium">
        {prezzoInAttesa ? (
          <span className="text-xs text-amber-700">{tr("Da confermare")}</span>
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
            {!Number(item.quantity_received) && (
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0"
                title={tr("Destinazioni")} aria-label={tr("Destinazioni per {nome}", { nome: item.description })}
                disabled={saving} onClick={() => setDestinazioniAperte(true)}>
                <MapPin className="h-4 w-4" />
              </Button>
            )}
            <label className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-normal text-slate-600" title={tr("Prezzo da confermare")}>
              <input
                type="checkbox"
                aria-label={tr("Prezzo da confermare")}
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
              {tr("Da confermare")}
            </label>
          <Button
            aria-label={tr("Rimuovi {nome}", { nome: desc })}
            variant="ghost"
            size="sm"
            disabled={saving || item.quantity_received > 0}
            title={item.quantity_received > 0 ? tr("La riga contiene merce già ricevuta") : undefined}
            className="h-7 w-7 p-0"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          </div>
        </td>
      )}

    </tr>
  );
}
