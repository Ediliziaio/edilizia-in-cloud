import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useWarehouseOperation } from "@/hooks/warehouse/useWarehouseOperations";
import type { RegistroMateriale } from "@/hooks/useMaterialiOperazione";
import { supabase } from "@/integrations/supabase/client";
import { riservaMaterialeOperazione } from "@/lib/distinta/registroMaterialiOperazione";
import { unitaConsumoConfrontabile } from "@/lib/distinta/consumiMateriali";
import { formattaQuantitaMovimento as numero, leggiQuantitaNonNegativa } from "@/lib/magazzino/quantitaMovimento";
import { unitaMateriale } from "@/lib/orders/materialProcurement";

export function RiservaMaterialeOperazione({ generaleId, riga, stockId, suggerita, commessa, chiudi, salvata }: {
  generaleId: string;
  riga: RegistroMateriale;
  stockId: string;
  suggerita: number;
  commessa: string;
  chiudi: () => void;
  salvata: (quantita: number) => void;
}) {
  const companyId = useEffectiveCompanyId();
  const attuale = riservaMaterialeOperazione(riga);
  const [valore, setValore] = useState(String(riga.piano.daScorta > 0 ? attuale : suggerita).replace(".", ","));
  const [avviso, setAvviso] = useState<string>();
  const operazione = useWarehouseOperation("reserve-operation-material");
  const giacenza = useQuery({
    queryKey: ["warehouse", "reserve-stock-operazione", companyId, stockId],
    enabled: !!companyId,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouse_stock")
        .select("id,name,quantity_available,quantity,unita_misura,tracking_mode, warehouses(name)")
        .eq("id", stockId).eq("company_id", companyId!).single();
      if (error) throw error;
      return data;
    },
  });

  const um = unitaMateriale(riga);
  const q = leggiQuantitaNonNegativa(valore);
  const max = Math.max(0, Math.min(riga.piano.remaining + attuale, Number(giacenza.data?.quantity_available ?? 0) + attuale));
  const quantitaIntera = giacenza.data?.tracking_mode === "serialized" || unitaConsumoConfrontabile(um) === "pz";
  const valido = q !== null && q <= max + 1e-8
    && Math.abs(q * 10_000 - Math.round(q * 10_000)) < 1e-7 && (!quantitaIntera || Number.isInteger(q));
  const modificata = valido && q !== attuale;
  const residuo = q === null ? null : Math.max(0, riga.piano.remaining + attuale - q);

  async function conferma() {
    if (!companyId || !giacenza.data || !modificata || q === null || operazione.isPending) return;
    setAvviso(undefined);
    try {
      await operazione.mutateAsync({
        rpc: "commessa_riserva_materiale",
        payload: { p_generale: generaleId, p_order_item_id: riga.id, p_stock_item_id: stockId, p_quantity: q, p_riserva_attesa: attuale },
      });
      salvata(q);
    } catch (error) {
      setAvviso(error && typeof error === "object" && "message" in error ? String(error.message) : "Salvataggio non confermato.");
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !operazione.isPending) chiudi(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{attuale > 0 ? "Modifica riserva di magazzino" : "Riserva dal magazzino"}</DialogTitle>
        <DialogDescription>{riga.name} · {commessa}</DialogDescription>
      </DialogHeader>
      {giacenza.isPending ? <p role="status" className="text-sm text-muted-foreground">Verifico la disponibilità…</p>
        : giacenza.isError ? <p role="alert" className="text-sm text-destructive">Disponibilità non verificabile.{" "}
          <Button size="sm" variant="link" onClick={() => void giacenza.refetch()}>Riprova</Button></p>
        : <div className="space-y-3">
          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <p className="font-medium">{giacenza.data?.name}</p>
            <p className="text-xs text-muted-foreground">{[
              giacenza.data?.warehouses?.name,
              `${numero(Number(giacenza.data?.quantity_available ?? 0))} ${um} liberi`,
              `${numero(attuale)} ${um} già riservati alla riga`,
            ].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="riserva-materiale-quantita">Quantità da tenere riservata ({um})</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input id="riserva-materiale-quantita" autoComplete="off" inputMode={quantitaIntera ? "numeric" : "decimal"}
                value={valore} onChange={e => setValore(e.target.value)} disabled={operazione.isPending} className="w-36" />
              {attuale > 0 && <Button type="button" size="sm" variant="outline" disabled={operazione.isPending} onClick={() => setValore("0")}>
                Libera riserva
              </Button>}
            </div>
            <p className="text-xs text-muted-foreground">Massimo prenotabile {numero(max)} {um}{quantitaIntera && " · Quantità intere"}</p>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>Da ordinare dopo la riserva</span>
            <strong className="tabular-nums">{valido && residuo !== null ? `${numero(residuo)} ${um}` : "—"}</strong>
          </div>
        </div>}
      {avviso && <p role="alert" className="text-sm text-destructive">{avviso}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={operazione.isPending} onClick={chiudi}>Annulla</Button>
        <Button type="button" disabled={!modificata || giacenza.isPending || giacenza.isError || operazione.isPending}
          onClick={() => void conferma()}>{operazione.isPending ? "Salvo…" : q === 0 ? "Conferma rilascio" : "Conferma riserva"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
