import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { riconciliaEmessa } from "@/lib/fatturazione/collegamentiImportate";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function RecuperaClientiImportati({ companyId, invoiceIds }: { companyId: string; invoiceIds: string[] }) {
  const { effectiveCompany } = useAuth();
  const { canEditCustomers, canEditOrders } = usePermissions();
  const qc = useQueryClient();
  const generazione = useRef(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [creaOperativi, setCreaOperativi] = useState(false);
  const [result, setResult] = useState<{ nuove: number; operativi: number; verificate: number; daVerificare: number; errori: number } | null>(null);
  useEffect(() => {
    generazione.current++;
    setOpen(false); setBusy(false); setProgress(0); setResult(null); setCreaOperativi(false);
    return () => { generazione.current++; };
  },[companyId]);
  if (effectiveCompany?.id !== companyId || !(canEditCustomers || canEditOrders) || !invoiceIds.length) return null;
  const recupera = async () => {
    const sessione = generazione.current;
    const ancoraAttivo = () => generazione.current === sessione;
    setBusy(true); setResult(null); setProgress(0);
    const counts = { nuove: 0, operativi: 0, verificate: 0, daVerificare: 0, errori: 0 };
    try {
      for (const [i, id] of invoiceIds.entries()) {
        if (!ancoraAttivo()) break; // cambio azienda/pagina: niente altre creazioni in background
        try {
          const r = await riconciliaEmessa(companyId, id, true);
          if (r.status !== "ok") counts.daVerificare++;
          else {
            counts.verificate++; if (r.crea_anagrafica) counts.nuove++;
            if (ancoraAttivo() && creaOperativi && r.cliente_operativo_mancante) {
              const { data:f, error:readError } = await supabase.from("invoices")
                .select("client_company_name, client_email, client_fiscal_code, client_vat_number, client_address, client_city, client_zip, client_country")
                .eq("company_id",companyId).eq("id",id).is("deleted_at",null).not("external_provider","is",null).single();
              if (readError || !f) throw new Error("Intestatario non disponibile.");
              if (!ancoraAttivo()) break;
              const { data: created, error: createError } = await supabase.functions.invoke("create-customer", { body:{
                company_id:companyId, imported_invoice_id:id, first_name:f.client_company_name || "", last_name:"",
                is_business:!!f.client_vat_number, business_name:f.client_vat_number ? f.client_company_name : null,
                email:f.client_email || null, fiscal_code:f.client_fiscal_code, vat_number:f.client_vat_number,
                address:f.client_address, city:f.client_city, postal_code:f.client_zip, country:f.client_country || "IT",
                create_portal_account:false, send_welcome_email:false,
              } });
              if (createError || !created?.success || !created.customer?.id) throw new Error("Cliente operativo non creato: riprova dal dettaglio.");
              if (!created.reused) counts.operativi++;
              if (!ancoraAttivo()) break;
              const linked = await riconciliaEmessa(companyId,id,true);
              if (linked.status !== "ok" || !linked.customer_id) counts.daVerificare++;
            }
          }
        } catch { counts.errori++; }
        if (ancoraAttivo()) setProgress(i + 1);
      }
      if (ancoraAttivo()) setResult(counts);
      await Promise.all([qc.invalidateQueries({ queryKey: ["collegamenti-emessa",companyId] }), qc.invalidateQueries({ queryKey: ["anagrafiche-native",companyId] }), qc.invalidateQueries({ queryKey: ["fatture-emesse-importate",companyId] }),qc.invalidateQueries({queryKey:["company-customers",companyId]})]);
    } finally { if (ancoraAttivo()) setBusy(false); }
  };
  return <>
    <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Recupera clienti dallo storico</Button>
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
      <DialogContent onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onPointerDownOutside={e => { if (busy) e.preventDefault(); }}>
        <DialogHeader><DialogTitle>Recupera le anagrafiche delle fatture</DialogTitle><DialogDescription>
          Verifichiamo {invoiceIds.length} documenti dell’azienda selezionata. CF/P.IVA identificano il cliente: riusiamo l’anagrafica e completiamo solo i campi vuoti.
        </DialogDescription></DialogHeader>
        <p className="text-sm">Nessun invito o email di benvenuto, nessun nuovo lead o cantiere. Indirizzo lavori e contratto richiedono conferma.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={creaOperativi} disabled={busy} onChange={e => setCreaOperativi(e.target.checked)} className="mt-1" />Crea anche i clienti operativi mancanti per cantieri e lavori, senza accesso al portale. Nome e dati fiscali vengono recuperati dall’intestatario della fattura.</label>
        {busy && <p role="status" className="text-sm">Verifica {progress} / {invoiceIds.length}…</p>}
        {result && <div role="status" className="rounded-lg bg-muted p-3 text-sm space-y-1">
          <p>{result.nuove} nuove anagrafiche fiscali · {result.verificate} fatture verificate.</p>
          {creaOperativi && <p>{result.operativi} nuovi clienti operativi disponibili per i lavori.</p>}
          <p>{result.daVerificare} da verificare manualmente · {result.errori} non elaborate.</p>
          {result.errori > 0 && <p>Puoi riprovare: le anagrafiche già recuperate non vengono duplicate.</p>}
        </div>}
        <Button disabled={busy} onClick={() => void recupera()}>{busy ? "Recupero in corso…" : result ? "Verifica di nuovo" : "Conferma recupero anagrafiche"}</Button>
      </DialogContent>
    </Dialog>
  </>;
}
