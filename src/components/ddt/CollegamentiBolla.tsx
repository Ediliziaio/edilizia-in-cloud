import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import {
  proponiCollegamenti,
  confrontaRighe,
  unitaComparabile,
  type CommessaProposta,
  type OdaProposto,
} from "@/lib/ddt/proposteImportazione";
import type { BollaLetta } from "@/lib/ddt/importBolle";
import type { RigaOrdine } from "@/lib/ddt/abbinaRigheOrdine";
export function CollegamentiBolla({
  bolla,
  companyId,
  disabled,
  onChange,
}: {
  bolla: BollaLetta;
  companyId: string;
  disabled: boolean;
  onChange: (patch: Partial<BollaLetta>) => void;
}) {
  const commesse = useQuery({
    queryKey: ["ddt-proposte-commesse", companyId],
    queryFn: () =>
      loadCatalogPages<CommessaProposta>((from, to) =>
        supabase
          .from("orders")
          .select("id,order_code,indirizzo_lavori,work_address")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .order("id")
          .range(from, to),
      ),
    staleTime: 60000,
  });
  const oda = useQuery({
    queryKey: ["ddt-proposte-oda", companyId, bolla.supplierId],
    enabled: !!bolla.supplierId,
    queryFn: () =>
      loadCatalogPages<OdaProposto>((from, to) =>
        supabase
          .from("purchase_orders")
          .select("id,oda_number,supplier_id,order_id")
          .eq("company_id", companyId)
          .eq("supplier_id", bolla.supplierId!)
          .neq("status", "annullato")
          .order("id")
          .range(from, to),
      ),
    staleTime: 60000,
  });
  const righe = useQuery({
    queryKey: ["ddt-confronto-oda", companyId, bolla.purchaseOrderId],
    enabled: !!bolla.purchaseOrderId,
    queryFn: () =>
      loadCatalogPages<RigaOrdine>((from, to) =>
        supabase
          .from("purchase_order_items")
          .select(
            "id,description,sku,unit_of_measure,quantity,quantity_received",
          )
          .eq("company_id", companyId)
          .eq("purchase_order_id", bolla.purchaseOrderId!)
          .order("id")
          .range(from, to),
      ),
    staleTime: 30000,
  });
  const proposte = proponiCollegamenti(
    bolla.grezzo,
    bolla.supplierId,
    commesse.data ?? [],
    oda.data ?? [],
  );
  const confronto = confrontaRighe(bolla.righe, righe.data ?? []);
  const mancanti = (righe.data ?? []).filter(
    (o) =>
      !confronto.some((c) => c.ordine?.id === o.id) &&
      Number(o.quantity) > Number(o.quantity_received ?? 0),
  );
  const azzera = () =>
    onChange({
      purchaseOrderId: null,
      righe: bolla.righe.map((r) => ({
        ...r,
        purchase_order_item_id: null as string | null,
        abbinamento: null as "auto" | "manuale" | null,
      })),
    });
  return (
    <details
      className="rounded-lg border bg-muted/20 p-3"
      open={!!bolla.purchaseOrderId}
    >
      <summary className="cursor-pointer text-xs font-medium">
        Associazioni suggerite e confronto con l’OdA
        {bolla.purchaseOrderId
          ? " · ordine collegato"
          : ` · ${proposte.commesse.length + proposte.oda.length} proposte`}
      </summary>
      <div className="mt-3 space-y-3 text-xs">
        {(commesse.isError || oda.isError || righe.isError) && (
          <p role="alert">
            Non riesco a caricare tutte le associazioni. Riprova prima di
            confrontare le righe.
            <Button
              size="sm"
              variant="link"
              onClick={() => {
                void commesse.refetch();
                if (bolla.supplierId) void oda.refetch();
                if (bolla.purchaseOrderId) void righe.refetch();
              }}
            >
              Riprova
            </Button>
          </p>
        )}
        {(commesse.isLoading || oda.isLoading) && (
          <p>Ricerca delle associazioni…</p>
        )}
        {!proposte.commesse.length &&
          !proposte.oda.length &&
          !commesse.isLoading &&
          !oda.isLoading && (
            <p className="text-muted-foreground">
              Nessuna corrispondenza proposta. Puoi scegliere la commessa
              manualmente; scegli prima il fornitore per cercare gli OdA.
            </p>
          )}
        {!bolla.purchaseOrderId &&
          proposte.commesse
            .filter((c) => c.id !== bolla.orderId)
            .slice(0, 5)
            .map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2"
              >
                <span>
                  <strong>{c.order_code}</strong> · {c.motivo}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onChange({ orderId: c.id })}
                >
                  Conferma commessa
                </Button>
              </div>
            ))}
        {proposte.oda
          .filter(
            (o) => !bolla.purchaseOrderId || bolla.purchaseOrderId === o.id,
          )
          .map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2"
            >
              <span>
                <strong>{o.oda_number}</strong> · {o.motivo}
                {o.order_id && (
                  <>
                    {" "}
                    ·{" "}
                    {commesse.data?.find((c) => c.id === o.order_id)
                      ?.order_code ?? "commessa collegata"}
                  </>
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  bolla.purchaseOrderId
                    ? azzera()
                    : onChange({
                        purchaseOrderId: o.id,
                        orderId: o.order_id ?? bolla.orderId,
                        righe: bolla.righe.map((r) => ({
                          ...r,
                          purchase_order_item_id: null as string | null,
                          abbinamento: null as "auto" | "manuale" | null,
                        })),
                      })
                }
              >
                {bolla.purchaseOrderId ? "Scollega OdA" : "Conferma OdA"}
              </Button>
            </div>
          ))}
        {bolla.purchaseOrderId && (
          <>
            <p className="rounded-md bg-blue-50 p-2 text-blue-900">
              Collegare l’OdA conserva il documento. Non registra l’arrivo
              dell’intero ordine e non carica giacenze:{" "}
              {bolla.destinazione === "cantiere"
                ? "la consegna diretta resta documentata sulle righe della bolla."
                : "le quantità effettive si confermano dalla scheda DDT."}
            </p>
            {righe.isLoading ? (
              <p>Caricamento righe ordinate…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2">Bolla</th>
                      <th className="p-2">Ordine / residuo</th>
                      <th className="p-2">Confronto</th>
                      <th className="p-2">Associazione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confronto.map((c, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2">
                          {c.riga.descrizione} · {c.riga.quantita ?? "?"}{" "}
                          {c.riga.unita_misura}
                        </td>
                        <td className="p-2">
                          {c.ordine
                            ? `${c.ordine.description} · residuo ${Math.max(0, Number(c.ordine.quantity) - Number(c.ordine.quantity_received ?? 0))} ${c.ordine.unit_of_measure ?? ""}`
                            : "Non individuato"}
                        </td>
                        <td className="p-2">{c.esito}</td>
                        <td className="p-2">
                          {c.confermata ? (
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              disabled={disabled}
                              onClick={() =>
                                onChange({
                                  righe: bolla.righe.map((r, j) =>
                                    i === j
                                      ? {
                                          ...r,
                                          purchase_order_item_id: null as
                                            | string
                                            | null,
                                          abbinamento: null as
                                            | "auto"
                                            | "manuale"
                                            | null,
                                        }
                                      : r,
                                  ),
                                })
                              }
                            >
                              Annulla conferma
                            </Button>
                          ) : c.ordine &&
                            unitaComparabile(
                              c.riga.unita_misura,
                              c.ordine.unit_of_measure,
                            ) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={disabled}
                              onClick={() =>
                                onChange({
                                  righe: bolla.righe.map((r, j) =>
                                    i === j
                                      ? {
                                          ...r,
                                          purchase_order_item_id: c.propostaId,
                                          abbinamento: "manuale",
                                        }
                                      : r,
                                  ),
                                })
                              }
                            >
                              Conferma riga
                            </Button>
                          ) : (
                            "Da scegliere nella scheda"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {mancanti.length > 0 && (
              <p className="text-muted-foreground">
                Non presenti in questa bolla:{" "}
                {mancanti.map((o) => o.description || o.sku).join("; ")}.
                Potrebbero arrivare con un’altra consegna.
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
