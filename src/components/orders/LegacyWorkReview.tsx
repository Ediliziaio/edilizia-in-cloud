import { toast } from "sonner";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
export interface LegacyWorkRow {
  id: string;
  name: string;
  quantity: number;
  unit_price: number | null;
  discount_percent?: number | null;
  natura_riga?: string;
  supplier_id?: string | null;
  stock_item_id?: string | null;
  purchase_price?: number | null;
  status: string;
}
export function LegacyWorkReviewForm({
  items,
  onSave,
  showAmounts = true,
}: {
  items: LegacyWorkRow[];
  showAmounts?: boolean;
  onSave: (ids: string[], kind: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]),
    [kind, setKind] = useState("lavorazione"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rows = items.filter(
    (i) =>
      (i.natura_riga && i.natura_riga !== "materiale") ||
      (!i.supplier_id &&
        !i.stock_item_id &&
        !Number(i.purchase_price) &&
        i.status === "da_ordinare"),
  );
  if (!rows.length) return null;
  return (
    <details className="rounded-xl border border-amber-200 bg-background p-4">
      <summary className="cursor-pointer font-medium">
        Rivedi le righe storiche: lavorazioni o materiali
      </summary>
      <p className="my-3 text-sm text-muted-foreground">
        Le vecchie righe possono contenere una lavorazione completa, anche con
        fornitura e posa. Seleziona solo quelle da riclassificare. Descrizioni,
        quantità e prezzi restano originali: il testo non viene usato per
        ricalcolare gli importi.
      </p>
      <Button
        variant="outline"
        className="mb-3 min-h-11"
        disabled={busy}
        onClick={() =>
          setSelected(
            selected.length === rows.length ? [] : rows.map((i) => i.id),
          )
        }
      >
        {selected.length === rows.length
          ? "Deseleziona tutte"
          : "Seleziona tutte le righe da verificare"}
      </Button>
      <div className="space-y-2">
        {rows.map((i, n) => (
          <div key={i.id} className="rounded-lg border p-3">
            <label className="flex items-start gap-3">
              <input
                className="mt-1"
                type="checkbox"
                aria-label={`Seleziona riga ${n + 1}`}
                checked={selected.includes(i.id)}
                disabled={busy}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, i.id]
                      : selected.filter((id) => id !== i.id),
                  )
                }
              />
              <span className="min-w-0 break-words text-sm font-medium">
                {i.name.split(/\s{2,}/)[0]}
                <span className="block font-normal text-muted-foreground">
                  {i.natura_riga ?? "materiale"}
                  {showAmounts && (
                    <>
                      {" "}
                      ·{" "}
                      {formatCurrency(
                        i.quantity *
                          Number(i.unit_price ?? 0) *
                          (1 - Number(i.discount_percent ?? 0) / 100),
                      )}{" "}
                      · valore originale
                    </>
                  )}
                </span>
              </span>
            </label>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Descrizione originale
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words">{i.name}</p>
            </details>
          </div>
        ))}
      </div>
      <label className="mt-3 block text-sm">
        Classifica le righe selezionate
        <select
          className="mt-1 w-full min-h-11 rounded-md border bg-background p-2"
          aria-label="Natura delle righe"
          value={kind}
          disabled={busy}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="lavorazione">Lavorazioni → fasi del cantiere</option>
          <option value="descrizione">Descrizioni → nessun acquisto</option>
          <option value="materiale">Materiali → acquisti</option>
        </select>
      </label>
      <p className="my-3 text-sm">
        Le righe diventate lavorazioni compaiono nelle fasi, non tra gli
        articoli da ordinare. Righe con acquisti, pagamenti o magazzino
        collegati richiedono una verifica e vengono protette.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        className="min-h-11"
        disabled={busy || !selected.length}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onSave(selected, kind);
            setSelected([]);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Operazione non riuscita.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy
          ? "Aggiornamento…"
          : `Conferma classificazione (${selected.length})`}
      </Button>
    </details>
  );
}
export function LegacyWorkReview({
  items,
  orderId,
  companyId,
  showAmounts,
}: {
  items: LegacyWorkRow[];
  orderId: string;
  companyId: string;
  showAmounts: boolean;
}) {
  const qc = useQueryClient();
  if (items.length && items.every((item) => item.natura_riga === undefined)) {
    return (
      <section className="rounded-xl border bg-background p-4" role="status">
        <h3 className="font-semibold">Righe storiche di commessa</h3>
        <p className="text-sm text-muted-foreground">
          La riclassificazione in lavorazioni richiede l’aggiornamento del
          database. Le righe originali restano visibili e non sono state
          modificate.
        </p>
      </section>
    );
  }
  return (
    <LegacyWorkReviewForm
      items={items}
      showAmounts={showAmounts}
      onSave={async (ids, kind) => {
        const { data, error } = await (supabase as any).rpc(
          "riclassifica_righe_storiche",
          {
            p_company_id: companyId,
            p_order_id: orderId,
            p_item_ids: ids,
            p_natura: kind,
            p_expected: items.filter((i) => ids.includes(i.id)),
          },
        );
        if (error) throw new Error(error.message);
        for (const key of [
          "order-items",
          "order-items-materials",
          "orders",
          "order-phases-economics",
          "order-work-phases",
          "order_work_phases",
          "order-overview-counts",
          "order-conteggi-viste",
        ])
          void qc.invalidateQueries({ queryKey: [key] });
        refreshWorkQueries(qc, orderId, companyId);
        toast.success(
          Number(data) > 0
            ? `${data} righe riclassificate. Importi originali conservati.`
            : "La classificazione era già aggiornata.",
        );
      }}
    />
  );
}
