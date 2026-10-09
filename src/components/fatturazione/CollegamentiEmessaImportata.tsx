import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { riconciliaEmessa } from "@/lib/fatturazione/collegamentiImportate";
import { isNotaCredito, tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { CreateCustomerDialog } from "@/components/orders/CreateCustomerDialog";

interface FatturaCliente {
  id: string; invoice_number: string; document_type: string | null; order_id: string | null;
  client_company_name: string | null; client_fiscal_code: string | null; client_vat_number: string | null;
  client_email: string | null; client_address: string | null; client_city: string | null; client_zip: string | null; client_country: string | null;
}
export function CollegamentiEmessaImportata({ companyId, fattura }: { companyId: string; fattura: FatturaCliente }) {
  const { effectiveCompany } = useAuth();
  const { canEditCustomers, canEditOrders } = usePermissions();
  const puoGestire = companyId === effectiveCompany?.id && (canEditCustomers || canEditOrders);
  const qc = useQueryClient();
  const [creaCliente, setCreaCliente] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setCreaCliente(false); setOrderId(""); },[companyId,fattura.id]);
  const verifica = useQuery({
    queryKey: ["collegamenti-emessa", companyId, fattura.id], enabled: puoGestire, retry: false,
    queryFn: () => riconciliaEmessa(companyId, fattura.id),
  });
  const clienteId = verifica.data?.customer_id;
  const commessaId = verifica.data?.order_id || fattura.order_id;
  const ordini = useQuery({
    queryKey: ["commesse-cliente-importata", companyId, clienteId], enabled: puoGestire && canEditOrders && !!clienteId && !commessaId,
    queryFn: () => tutteLePagine((from,to) => supabase.from("orders").select("id, order_code, description, work_address")
      .eq("company_id",companyId).eq("customer_id",clienteId!).is("deleted_at",null).order("id").range(from,to)),
  });
  const salva = async (commessa?: string) => {
    setSaving(true);
    try {
      const result = await riconciliaEmessa(companyId, fattura.id, true, commessa);
      if (result.status !== "ok") throw new Error(result.motivo);
      await Promise.all([qc.invalidateQueries({ queryKey: ["collegamenti-emessa",companyId,fattura.id] }), qc.invalidateQueries({ queryKey: ["anagrafiche-native",companyId] }), qc.invalidateQueries({ queryKey: ["fatture-emesse-importate",companyId] }), qc.invalidateQueries({ queryKey: ["emessa-importata-dettaglio",companyId,fattura.id] })]);
      toast.success(commessa ? "Fattura collegata alla commessa" : "Anagrafica recuperata senza duplicati");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Collegamento non riuscito: riprova."); }
    finally { setSaving(false); }
  };
  if (!puoGestire && !commessaId) return null;
  return <section aria-label="Cliente e lavoro collegati" className="space-y-3 rounded-lg border p-4">
    <h2 className="font-semibold">Cliente e lavoro collegati</h2>
    <p className="text-xs text-muted-foreground">La fattura resta in sola lettura. Recuperiamo solo anagrafiche e collegamenti; nessun nuovo incasso o invio SDI.</p>
    {commessaId && <Button asChild variant="outline" size="sm"><Link to={`/azienda/ordini/${commessaId}`}>Apri commessa</Link></Button>}
    {puoGestire && <>
      {verifica.isPending ? <p role="status" className="text-sm">Verifica anagrafiche…</p> : verifica.isError ?
        <p role="alert" className="text-sm text-destructive">Non riesco a verificare i collegamenti. <Button variant="link" onClick={() => void verifica.refetch()}>Riprova</Button></p> : verifica.data?.status === "da_verificare" ?
        <p role="alert" className="text-sm text-amber-700">{verifica.data.motivo} Nessun dato viene sovrascritto.</p> : <>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={saving} onClick={() => void salva()}>Recupera dati anagrafica</Button>
            {clienteId ? <Button asChild variant="outline" size="sm"><Link to={`/azienda/clienti/${clienteId}`}>Apri cliente</Link></Button> :
              <Button size="sm" disabled={saving} onClick={() => setCreaCliente(true)}>Crea cliente per i lavori</Button>}
          </div>
          {canEditOrders && clienteId && !commessaId && <div className="space-y-2">
            {ordini.isPending ? <p role="status" className="text-sm">Caricamento commesse del cliente…</p> : ordini.isError ?
              <p role="alert" className="text-sm text-destructive">Elenco commesse non disponibile. <Button variant="link" onClick={() => void ordini.refetch()}>Riprova</Button></p> : <>
              {ordini.data && ordini.data.length > 0 && <div className="flex flex-wrap gap-2">
                <select aria-label="Commessa da collegare" className="min-w-0 max-w-full rounded-md border bg-background p-2 text-sm" value={orderId} onChange={e => setOrderId(e.target.value)}>
                  <option value="">Scegli la commessa corretta…</option>
                  {ordini.data.map(o => <option key={o.id} value={o.id}>{o.order_code || "Commessa"} · {o.description.slice(0,80)}{o.work_address ? ` · ${o.work_address}` : ""}</option>)}
                </select>
                <Button variant="outline" size="sm" disabled={!orderId || saving} onClick={() => void salva(orderId)}>Collega</Button>
              </div>}
              {!isNotaCredito(fattura.document_type) && <Button asChild variant="outline" size="sm"><Link to={`/azienda/ordini/nuovo?customer_id=${clienteId}&invoice_id=${fattura.id}`}>Prepara nuovo lavoro</Link></Button>}
            </>}
          </div>}
          <p className="text-xs text-muted-foreground">{isNotaCredito(fattura.document_type) ? "Una nota di credito va collegata al lavoro originale, non crea un nuovo cantiere." : "Stesso cliente non significa stesso cantiere. Conferma indirizzo lavori e valore del contratto prima di salvare una nuova commessa."}</p>
        </>}
      {creaCliente && <CreateCustomerDialog open onOpenChange={setCreaCliente} importedInvoiceId={fattura.id} defaultCreatePortalAccount={false}
        initialValues={{ fullName: fattura.client_company_name || "", fiscalCode: fattura.client_fiscal_code || "", vatNumber: fattura.client_vat_number || "", isBusiness: !!fattura.client_vat_number,
          email: fattura.client_email || "", address: fattura.client_address || "", city: fattura.client_city || "", postalCode: fattura.client_zip || "", country: fattura.client_country || "IT" }}
        onCustomerCreated={() => { setCreaCliente(false); void salva(); }} />}
    </>}
  </section>;
}
