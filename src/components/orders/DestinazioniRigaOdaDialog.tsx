import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWarehouses } from "@/hooks/useWarehouses";
import type { AggiornamentoRigaOda, DestinazioneRigaOda, PurchaseOrderItem } from "@/hooks/usePurchaseOrders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CommessaCombobox } from "./CommessaCombobox";
import { OfficeSelect } from "./OfficeSelect";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

type Quota = { chiave: number; tipo: DestinazioneRigaOda["tipo"]; id: string | null; quantita: string };

const quantita = (v: string) => {
  const s = v.trim().replace(",", ".");
  return /^\d{1,9}(\.\d{1,3})?$/.test(s) ? Number(s) : 0;
};

export function DestinazioniRigaOdaDialog({
  item, commessaId, onClose, onSave,
}: {
  item: PurchaseOrderItem;
  commessaId: string | null;
  onClose: () => void;
  onSave: (patch: AggiornamentoRigaOda) => Promise<unknown>;
}) {
  const t = useT();
  const formato = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 3 });
  const { warehouses } = useWarehouses();
  const [quote, setQuote] = useState<Quota[]>(() => item.destinazioni_previste?.length
    ? item.destinazioni_previste.map((q, i) => ({ ...q, quantita: String(q.quantita), chiave: i }))
    : [{ chiave: 0, tipo: "commessa", id: commessaId, quantita: String(item.quantity) }]);
  const [salvaInCorso, setSalvaInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [quantitaOrdinata, setQuantitaOrdinata] = useState(String(item.quantity));
  const totaleQuote = quote.reduce((n, q) => n + Math.round(quantita(q.quantita) * 1000), 0);
  const totale = Math.round(quantita(quantitaOrdinata) * 1000);
  const chiavi = new Set(quote.map(q => `${q.tipo}:${q.id}`));
  const valido = totale > 0 && (quote.length === 0 || (totaleQuote === totale && chiavi.size === quote.length
    && quote.every(q => q.id && quantita(q.quantita) > 0)));

  function cambia(chiave: number, patch: Partial<Quota>) {
    setErrore(null);
    setQuote(v => v.map(q => q.chiave === chiave ? { ...q, ...patch } : q));
  }

  async function salva() {
    setSalvaInCorso(true);
    try {
      await onSave({
        quantity: totale / 1000,
        destinazioni_previste: quote.map(q => ({ tipo: q.tipo, id: q.id!, quantita: quantita(q.quantita) })),
      });
      toast.success(quote.length ? t("Destinazioni salvate") : t("Ripristinata la destinazione dell’ordine"));
      onClose();
    } catch (error) {
      setErrore(error && typeof error === "object" && "message" in error
        ? String(error.message) : t("Non riesco a salvare le destinazioni."));
    } finally {
      setSalvaInCorso(false);
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !salvaInCorso) onClose(); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Destinazioni dell’articolo")}</DialogTitle>
          <DialogDescription>{item.description}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Label htmlFor="quantita-ordinata-destinazioni">{t("Quantità ordinata")}</Label>
          <Input id="quantita-ordinata-destinazioni" className="h-8 w-24 text-right" inputMode="decimal"
            value={quantitaOrdinata} disabled={salvaInCorso} onChange={e => setQuantitaOrdinata(e.target.value)} />
          <span className="text-sm text-muted-foreground">{item.unit_of_measure ?? "pz"}</span>
        </div>
        {commessaId && <p className="text-sm text-muted-foreground">{t("Per usare più destinazioni, rimuovi la commessa dalla testata dell’ordine.")}</p>}
        <div className="min-h-0 space-y-2 overflow-y-auto p-1">
          {quote.map((q, i) => (
            <div key={q.chiave} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <OfficeSelect value={q.tipo} label={t("Tipo destinazione {n}", { n: i + 1 })}
                options={[{ value: "commessa", label: t("Commessa") }, { value: "magazzino", label: t("Magazzino") }]}
                disabled={!!commessaId || salvaInCorso}
                onValueChange={tipo => cambia(q.chiave, { tipo: tipo as Quota["tipo"], id: null })} />
              <div className="min-w-32 flex-1">
                {q.tipo === "commessa" ? (
                  <CommessaCombobox value={q.id} onChange={id => cambia(q.chiave, { id })}
                    ariaLabel={t("Commessa {n}", { n: i + 1 })} nessunaLabel={t("Scegli commessa")} disabled={!!commessaId || salvaInCorso} />
                ) : (
                  <OfficeSelect value={q.id ?? ""} label={t("Magazzino {n}", { n: i + 1 })} placeholder={t("Scegli magazzino")}
                    options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                    disabled={salvaInCorso} onValueChange={id => cambia(q.chiave, { id })} />
                )}
              </div>
              <Input aria-label={t("Quantità destinazione {n}", { n: i + 1 })} className="w-24 text-right"
                inputMode="decimal" disabled={salvaInCorso} value={q.quantita}
                onChange={e => cambia(q.chiave, { quantita: e.target.value })} />
              <Button type="button" size="icon" variant="ghost" aria-label={t("Rimuovi destinazione {n}", { n: i + 1 })}
                disabled={salvaInCorso} onClick={() => setQuote(v => v.filter(r => r.chiave !== q.chiave))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <Button type="button" variant="outline" size="sm" disabled={salvaInCorso || quote.length >= (commessaId ? 1 : 30)}
            onClick={() => setQuote(v => [...v, {
              chiave: Math.max(-1, ...v.map(q => q.chiave)) + 1, tipo: "commessa", id: commessaId,
              quantita: totaleQuote < totale ? String((totale - totaleQuote) / 1000) : "",
            }])}>
            <Plus className="mr-1.5 h-4 w-4" /> {t("Aggiungi destinazione")}
          </Button>
          <span className={quote.length && !valido ? "text-amber-800" : "text-muted-foreground"} aria-live="polite">
            {quote.length ? t("{assegnati} di {totale} assegnati", { assegnati: formato.format(totaleQuote / 1000), totale: formato.format(totale / 1000) }) : t("Usa la destinazione dell’ordine")}
          </span>
        </div>
        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={salvaInCorso} onClick={onClose}>{t("Annulla")}</Button>
          <Button disabled={!valido || salvaInCorso} onClick={() => void salva()}>{salvaInCorso ? t("Salvataggio…") : t("Salva destinazioni")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
