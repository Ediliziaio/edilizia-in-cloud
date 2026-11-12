import { percorsoDocumentoGenerale, useAspettoOperativo } from "./generali/design/ContestoOperativo";
import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { letturaSenzaPrezzi } from "@/lib/acquisti/letturaSenzaPrezzi";
import { ChevronDown, Package, PackageCheck, Link2, Unlink, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { NuovoOdaCommessaDialog } from "./NuovoOdaCommessaDialog";
import { LinkExistingPurchaseOrderDialog } from "./LinkExistingPurchaseOrderDialog";
import { useDDTCountsByPO } from "@/hooks/useDDTRicezione";
import { avanzamentoOrdine, type ProcurementItem } from "@/lib/orders/materialProcurement";
import { usePermissions } from "@/hooks/usePermissions";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { OdaDocumentiDialog, type OdaDellaFinestra } from "./OdaDocumentiDialog";
import { dataIt } from "./OrderDocumentiFornitore";
import { RiquadroCommessa, TabellaCommessa, type ColonnaTabella } from "./TabellaCommessa";

import {
  ODA_STATUS_LABELS as STATUS_LABELS,
  ODA_STATUS_COLORS as STATUS_COLORS,
} from "@/lib/odaStatus";

/**
 * Bolle arrivate: ricevute, già controllate, con merce non conforme o parziali (comunque arrivate).
 * Una bolla resta «parziale» quando l'ordine non era ancora completo al suo arrivo.
 */
const ddtArrivati = (a: { ricevuti: number; verificati: number; non_conformi: number; parziali?: number }) =>
  a.ricevuti + a.verificati + a.non_conformi + (a.parziali ?? 0);


interface OrdineCollegato {
  id: string;
  oda_number: string;
  status: string;
  total: number;
  issue_date: string | null;
  expected_delivery_date: string | null;
  delivery_warehouse_id: string | null;
  suppliers: { name: string } | null;
  righe: Array<{ quantity: number; quantity_received: number }> | null;
}

interface LinkedPurchaseOrdersCardProps {
  orderId: string;
  orderCode?: string | null;
  items: ProcurementItem[];
  /** I numeri dei materiali, dentro lo stesso riquadro come nelle altre viste. */
  riepilogo?: ReactNode;
}

export function LinkedPurchaseOrdersCard({ orderId, orderCode, items, riepilogo }: LinkedPurchaseOrdersCardProps) {
  const aspetto = useAspettoOperativo();
  const { effectiveCompany } = useAuth();
  const queryClient = useQueryClient();
  const companyId = effectiveCompany?.id;
  const { canEditOrders, canViewCosts } = usePermissions();
  const [odaAperto, setOdaAperto] = useState<OdaDellaFinestra | null>(null);
  const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [nuovoOpen, setNuovoOpen] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; oda_number: string } | null>(null);

  // Unlink mutation
  const unlinkMutation = useMutation({
    mutationFn: async (poId: string) => {
      if (!canEditOrders || !companyId) throw new Error("Permessi insufficienti");
      const { error } = await supabase
        .from("purchase_orders")
        .update({ order_id: null })
        .eq("id", poId).eq("company_id", companyId).eq("order_id", orderId);
      if (error) throw error;

      // Diario: senza company_id (NOT NULL) l'insert falliva SEMPRE, e il
      // `void` senza await lo nascondeva — nessun collegamento OdA è mai
      // finito nel diario. L'evento è cronaca, non transazione: se fallisce
      // lo si logga, lo scollegamento resta valido.
      const { error: diaryErr } = await supabase.from("order_events" as never).insert({
        order_id: orderId,
        company_id: companyId,
        event_type: "ordine_fornitore_scollegato",
        payload: { po_id: poId, order_code: orderCode },
      } as never);
      if (diaryErr) logger.error("[LinkedPurchaseOrdersCard] evento diario non registrato:", diaryErr);
    },
    onSuccess: () => {
      refreshMaterialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["linked-purchase-orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["unlinked-purchase-orders", companyId] });
      queryClient.invalidateQueries({ queryKey: ["oes-oda", orderId] });
      toast.success("OdA scollegato dalla commessa");
      setUnlinkTarget(null);
    },
    onError: (e: Error) => {
      toast.error("Errore nello scollegamento", { description: e.message });
      setUnlinkTarget(null);
    },
  });

  const { data: linkedPOs = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["linked-purchase-orders", orderId, companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, oda_number, status, total, issue_date, expected_delivery_date, delivery_warehouse_id, suppliers(name), righe:purchase_order_items(quantity, quantity_received)")
        .eq("order_id", orderId).eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as OrdineCollegato[];
    },
    enabled: !!orderId && !!companyId,
  });

  // DDT aggregato per ODA — evidenzia stato ricezione nei collegamenti
  const { data: ddtCounts = {} } = useDDTCountsByPO();

  const colonne: ColonnaTabella<OrdineCollegato>[] = [
    { titolo: "Ordine", principale: true, cella: (po) => (
      <Link to={percorsoDocumentoGenerale(`/azienda/ordini-acquisto/${po.id}`, aspetto?.generaleId)} className="font-mono font-medium underline-offset-2 hover:underline" aria-label={`Apri l'ordine d'acquisto ${po.oda_number}`}>
        {po.oda_number}
      </Link>
    ) },
    { titolo: "Data", cella: (po) => <span className="whitespace-nowrap">{dataIt(po.issue_date)}</span> },
    { titolo: "Fornitore", cella: (po) => po.suppliers?.name || "—" },
    { titolo: "Stato", cella: (po) => (
      <Link to={percorsoDocumentoGenerale(`/azienda/ordini-acquisto/${po.id}`, aspetto?.generaleId)} title="Apri per cambiare lo stato" aria-label={`Cambia lo stato dell'ordine ${po.oda_number}`}>
        <Badge className={`whitespace-nowrap border-0 text-xs ${STATUS_COLORS[po.status] || ""}`}>{STATUS_LABELS[po.status] || po.status}<ChevronDown className="ml-1 h-3 w-3" aria-hidden="true" /></Badge>
      </Link>
    ) },
    { titolo: "Arrivato", cella: (po) => {
      const a = avanzamentoOrdine(po, oggi);
      const ddt = ddtCounts[po.id];
      return (
        <button type="button" className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline" aria-label={`Bolle e fatture dell'ordine ${po.oda_number}`}
          onClick={() => setOdaAperto({ id: po.id, oda_number: po.oda_number, status: po.status, total: po.total, fornitore: po.suppliers?.name ?? null })}>
          {a.righeTotali > 0 && <p className="whitespace-nowrap">{a.righeArrivate}/{a.righeTotali} righe</p>}
          {ddt && ddt.total > 0 && <p className={`whitespace-nowrap ${ddt.parziali > 0 || ddt.non_conformi > 0 ? "text-amber-700" : ""}`} title={ddt.non_conformi > 0 ? `${ddt.non_conformi} non conformi` : undefined}>{ddtArrivati(ddt)}/{ddt.total} DDT</p>}
        </button>
      );
    } },
    { titolo: "Consegna", cella: (po) => {
      const a = avanzamentoOrdine(po, oggi);
      if (!a.aperto || !po.expected_delivery_date) return <span className="text-muted-foreground">—</span>;
      return <span className={a.inRitardo ? "whitespace-nowrap font-medium text-amber-700 dark:text-amber-400" : "whitespace-nowrap"}>{a.inRitardo ? "In ritardo, " : ""}{dataIt(po.expected_delivery_date)}</span>;
    } },
    ...(letturaSenzaPrezzi() ? [] : [{ titolo: "Importo", destra: true, cella: (po: (typeof linkedPOs)[number]) => <span className="font-medium">{formatCurrency(Number(po.total))}</span> }]),
    { titolo: "Azioni", destra: true, cella: (po) => (
      <div className="flex items-center justify-end gap-1">
        {avanzamentoOrdine(po, oggi).aperto && canEditOrders && (
          <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs">
            {/* L'arrivo si registra dentro l'ordine: si apre già pronto. */}
            <Link to={percorsoDocumentoGenerale(`/azienda/ordini-acquisto/${po.id}?arrivo=1`, aspetto?.generaleId)} aria-label={`Merce arrivata per l'ordine ${po.oda_number}`}>
              <PackageCheck className="h-3.5 w-3.5" /><span className="max-sm:hidden">Merce arrivata</span>
            </Link>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 max-sm:hidden" disabled={!canEditOrders}
          onClick={() => setUnlinkTarget({ id: po.id, oda_number: po.oda_number })} aria-label={`Scollega OdA ${po.oda_number}`}>
          <Unlink className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
    ) },
  ];

  return (
    <>
    <RiquadroCommessa
      icona={<Package className="h-5 w-5 text-primary" aria-hidden="true" />}
      descrizione="Acquisti della commessa, consegne previste e documenti collegati."
      titolo="Ordini ai fornitori" conteggio={linkedPOs.length}
      azioni={<>
        <Button variant="outline" size="sm" disabled={!canEditOrders} onClick={() => setLinkDialogOpen(true)}>
          <Link2 className="mr-1.5 h-4 w-4" />Collega OdA
        </Button>
        {canEditOrders && canViewCosts && (
          <Button size="sm" onClick={() => setNuovoOpen(true)}><Plus className="mr-1.5 h-4 w-4" />Nuovo ordine</Button>
        )}
      </>}
      numeri={riepilogo}
    >
      <NuovoOdaCommessaDialog open={nuovoOpen} onOpenChange={setNuovoOpen} orderId={orderId} orderCode={orderCode} items={items} />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      ) : isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">Impossibile caricare gli ordini collegati.<Button size="sm" variant="outline" disabled={isFetching} onClick={() => refetch()}>Riprova</Button></div>
      ) : linkedPOs.length === 0 ? (
        <p className="commessa-empty text-sm text-muted-foreground">Nessun ordine d'acquisto collegato.</p>
      ) : (
        <TabellaCommessa etichetta="Ordini ai fornitori" colonne={colonne} righe={linkedPOs} chiave={(po) => po.id} />
      )}
    </RiquadroCommessa>

      {/* Clic su un ordine: le sue bolle e fatture, senza lasciare la commessa. */}
      {/* Montata solo quando serve: bolle e fatture si leggono al clic, non a ogni apertura della commessa. */}
      {odaAperto && <OdaDocumentiDialog orderId={orderId} oda={odaAperto} onClose={() => setOdaAperto(null)} mostraImporti={!!canViewCosts} />}

      {/* Link existing PO dialog */}
      <LinkExistingPurchaseOrderDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        orderId={orderId}
        orderCode={orderCode}
      />

      {/* Unlink confirmation */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(open) => !open && setUnlinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scollega OdA</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler scollegare l'ordine d'acquisto{" "}
              <strong>{unlinkTarget?.oda_number}</strong> da questa commessa?
              L'OdA non verrà eliminato, ma non sarà più associato a questa commessa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinkMutation.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unlinkTarget && unlinkMutation.mutate(unlinkTarget.id)}
              disabled={unlinkMutation.isPending}
            >
              {unlinkMutation.isPending ? "Scollegamento..." : "Scollega"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
