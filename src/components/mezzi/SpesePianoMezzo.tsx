import { PurchasePaymentsDialog } from "@/components/orders/PurchasePaymentsDialog";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";
import { useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMezziPianoEconomia } from "@/hooks/useMezziPianoEconomia";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/formatters";
import { ViaggioSelect } from "./ViaggioSelect";
export function SpesePianoMezzo({
  orderId,
  pianoId,
  supplierId,
}: {
  orderId: string;
  pianoId: string;
  supplierId?: string | null;
}) {
  const p = usePermissions();
  const enabled = p.canViewCosts && (p.canViewMezzi || p.isAdmin);
  const edit =
    enabled &&
    (p.canEditMezzi || p.isAdmin) &&
    (p.canEditOrders || p.isAdmin) &&
    !p.solaLettura;
  const { fonti, collega } = useMezziPianoEconomia(orderId, enabled);
  const [aperto, setAperto] = useState(false);
  const [paymentCostId,setPaymentCostId] = useState<string|null>(null);
  const [paymentOrderId,setPaymentOrderId] = useState<string|null>(null);
  const [scelta, setScelta] = useState("");
  const [importo, setImporto] = useState("");
  if (!enabled) return null;
  const legami = fonti.data?.legami.filter((l) => l.piano_id === pianoId) ?? [];
  const sorgenti = (fonti.data?.fonti ?? [])
    .filter((f) => Number(f.importo) !== 0)
    .slice()
    .sort(
      (a, b) =>
        Number(b.supplier_id === supplierId) -
        Number(a.supplier_id === supplierId),
    );
  const selezionata = sorgenti.find((f) => f.tipo + ":" + f.id === scelta);
  const scegli = (value: string) => {
    setScelta(value);
    const f = sorgenti.find((f) => f.tipo + ":" + f.id === value);
    if (f) {
      const altri = (fonti.data?.legami ?? [])
        .filter(
          (l) =>
            l.fonte_id === f.id && l.tipo === f.tipo && l.piano_id !== pianoId,
        )
        .reduce((t, l) => t + Number(l.importo), 0);
      setImporto(String(Math.round((Number(f.importo) - altri) * 100) / 100));
    } else setImporto("");
  };
  return (
    <>
    {paymentOrderId && <PurchasePaymentsDialog orderId={paymentOrderId} onClose={()=>setPaymentOrderId(null)}/>}
    {paymentCostId && <ExpensePaymentDialog key={paymentCostId} costId={paymentCostId} onClose={()=>setPaymentCostId(null)}/>}
    <section
      className="space-y-3 rounded-xl border bg-slate-50/60 p-3"
      aria-label="Spese registrate della risorsa"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">
          Costi e fatture già registrati
        </h4>
        {edit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAperto((v) => !v)}
            disabled={fonti.isError || fonti.isLoading}
          >
            <Link2 className="mr-1 h-3.5 w-3.5" />
            {aperto ? "Chiudi collegamento" : "Collega costo o OdA"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Il collegamento riconosce una spesa già inclusa nella commessa. Non crea
        un secondo costo e non registra pagamenti.
      </p>
      {fonti.isError ? (
        <p role="alert" className="text-xs text-destructive">
          Spese non disponibili.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void fonti.refetch()}
          >
            Riprova
          </button>
        </p>
      ) : fonti.isLoading ? (
        <p className="text-xs">Caricamento…</p>
      ) : legami.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nessuna spesa collegata. Il preventivo rimane separato dal consuntivo.
        </p>
      ) : (
        <ul className="divide-y">
          {legami.map((l) => {
            const f = fonti.data?.fonti.find(
              (f) => f.id === l.fonte_id && f.tipo === l.tipo,
            );
            return (
              <li
                key={l.id}
                className="flex items-center justify-between gap-2 py-2 text-xs"
              >
                <span>
                  {f?.nome ?? "Fonte modificata: verifica collegamento"} ·{" "}
                  {formatCurrency(Number(l.importo))}
                </span>
                {f?.tipo === "oda" && <Button type="button" size="sm" variant="outline" onClick={()=>setPaymentOrderId(f.id)}>Pagamenti</Button>}
                {f?.tipo === "costo" && <Button type="button" size="sm" variant="outline" onClick={()=>setPaymentCostId(f.id)}>Pagamenti</Button>}
                {edit && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label={`Scollega ${f?.nome ?? "spesa"}`}
                    disabled={collega.isPending}
                    onClick={() =>
                      collega.mutate({
                        pianoId,
                        tipo: l.tipo,
                        fonteId: l.fonte_id,
                        importo: null,
                      })
                    }
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {aperto && (
        <div className="space-y-3 border-t pt-3">
          <Label>Scegli dalla contabilità della commessa</Label>
          <ViaggioSelect
            label="Costo o OdA registrato"
            value={scelta}
            onValueChange={scegli}
            disabled={collega.isPending}
            emptyMessage="Nessun costo corrispondente. Prima registra o attribuisci la fattura alla commessa."
            options={[
              { value: "", label: "Cerca costo, fattura o numero OdA…" },
              ...sorgenti.map((f) => ({
                value: f.tipo + ":" + f.id,
                label: `${f.tipo === "oda" ? "OdA" : "Costo"} · ${f.nome} · ${formatCurrency(Number(f.importo))}`,
              })),
            ]}
          />
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="quota-spesa-mezzo">
                Quota attribuita alla risorsa € (netta IVA)
              </Label>
              <Input
                id="quota-spesa-mezzo"
                type="number"
                step="0.01"
                value={importo}
                disabled={collega.isPending}
                onChange={(e) => setImporto(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={
                !selezionata ||
                !Number.isFinite(Number(importo)) ||
                Number(importo) === 0 ||
                collega.isPending
              }
              onClick={async () => {
                if (!selezionata) return;
                try {
                  await collega.mutateAsync({
                    pianoId,
                    tipo: selezionata.tipo,
                    fonteId: selezionata.id,
                    importo: Number(importo),
                  });
                  setScelta("");
                  setImporto("");
                  setAperto(false);
                } catch {
                  /* error shown by mutation */
                }
              }}
            >
              Collega
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Puoi attribuire una quota dello stesso documento a più risorse. Un
            OdA e il suo costo/fattura compaiono come un’unica fonte; sono
            esclusi gli OdA in bozza o annullati.
          </p>
        </div>
      )}
    </section>
    </>
  );
}
