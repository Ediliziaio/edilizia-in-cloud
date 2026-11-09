import { formatCurrency } from "@/lib/formatters";
import { lazy, Suspense, useState } from "react";
import { Mail, Phone, Pencil, Truck, UserRound, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { payloadFornitore, etichettaRuoloReferente, type Supplier, type SupplierFormData } from "@/lib/suppliers/anagraficaFornitore";
import { recapitiFornitore } from "@/lib/documentiOperativi/fornitore";
import { invalidaFornitori } from "@/lib/suppliers/cacheFornitori";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

const FornitoreEditor = lazy(() => import("@/components/suppliers/FornitoreEditor").then(m => ({default:m.FornitoreEditor})));

export function OdaFornitoreCard({supplier}: {supplier?: Supplier | null}) {
  const {effectiveCompany} = useAuth();
  const permissions = usePermissions();
  const client = useQueryClient();
  const [editing,setEditing] = useState(false);
  const [saving,setSaving] = useState(false);
  if (!supplier) return <QuoteCard title="Fornitore" icon={<Truck className="h-4 w-4" />}><p className="text-sm text-slate-500">Fornitore non disponibile.</p></QuoteCard>;
  const recapiti = recapitiFornitore(supplier);
  const save = async (form:SupplierFormData) => {
    if (!effectiveCompany || saving) return;
    setSaving(true);
    try {
      const {error} = await supabase.from("suppliers").update(payloadFornitore(form)).eq("id",supplier.id).eq("company_id",effectiveCompany.id).select("id").single();
      if (error) throw error;
      await Promise.all([invalidaFornitori(client),client.invalidateQueries({queryKey:queryKeys.purchaseOrders.all}),client.invalidateQueries({queryKey:["purchase-order-detail"]}),client.invalidateQueries({queryKey:["rdo-fornitori-anagrafica"]})]);
      setEditing(false);
      toast.success("Anagrafica fornitore aggiornata");
    } catch (e) {
      toast.error("Fornitore non salvato",{description:e instanceof Error ? e.message : "Riprova. Le modifiche restano aperte."});
    } finally {setSaving(false);}
  };
  const dato = (label:string,value?:string | number | null) => <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 break-words text-sm text-slate-800">{value == null || value === "" ? <span className="text-slate-400">Non indicato</span> : value}</dd></div>;
  return <>
    <QuoteCard title="Fornitore" icon={<Truck className="h-4 w-4" />} action={(permissions.canEditSettingsSuppliers || permissions.canManageSuppliers) && <Button variant="outline" size="sm" onClick={()=>setEditing(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Modifica fornitore</Button>}>
      <p className="text-base font-bold text-slate-900">{supplier.name}</p>
      <div className="mt-3 space-y-2 text-sm">
        <p className="flex items-start gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" /><span className="min-w-0 break-all"><span className="block text-xs text-slate-500">Email per gli ordini</span>{recapiti.destinatario.email ? <a className="text-blue-800 hover:underline" href={`mailto:${recapiti.destinatario.email}`}>{recapiti.destinatario.email}</a> : "Non indicata"}</span></p>
        <p className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" /><span><span className="block text-xs text-slate-500">Telefono</span>{supplier.phone ? <a href={`tel:${supplier.phone}`}>{supplier.phone}</a> : "Non indicato"}</span></p>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {dato("Email generale",supplier.email)}{dato("PEC",supplier.pec)}
        {dato("Partita IVA",supplier.vat_number)}{dato("Codice fiscale",supplier.fiscal_code)}
        {dato("Codice SDI",supplier.codice_sdi)}{dato("Nostro codice cliente",supplier.codice_cliente)}
        <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">{dato("Sede",recapiti.destinatario.indirizzo)}</div>
      </dl>
      <div className="mt-4 border-t border-slate-100 pt-4">
        <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><UserRound className="h-3.5 w-3.5" />Referenti</h4>
        {recapiti.referentiFornitore.length ? <div className="space-y-2">{recapiti.referentiFornitore.map((r,i)=><div key={`${r.ruolo}:${i}`} className="rounded-lg bg-slate-50 p-2.5 text-sm"><span className="text-xs text-slate-500">{etichettaRuoloReferente(r.ruolo)}</span><p className="font-medium">{r.nome || "Nome non indicato"}</p>{r.email && <a className="block break-all text-blue-800 hover:underline" href={`mailto:${r.email}`}>{r.email}</a>}{r.telefono && <a className="block" href={`tel:${r.telefono}`}>{r.telefono}</a>}</div>)}</div> : <p className="text-sm text-slate-400">Nessun referente inserito.</p>}
      </div>
      <details className="mt-4 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">Pagamento, ritiro e altre informazioni</summary><dl className="mt-3 grid gap-3">
        {dato("Condizioni concordate",recapiti.pagamento)}{dato("Banca",supplier.bank_name)}{dato("IBAN",supplier.iban)}
        {dato("Sconto concordato",supplier.sconto_percentuale != null ? `${supplier.sconto_percentuale}%` : null)}
        {dato("Tempi di consegna",supplier.lead_time_days != null ? `${supplier.lead_time_days} giorni` : null)}
        {dato("Indirizzo di ritiro",recapiti.ritiroIndirizzo)}{dato("Indicazioni di ritiro",supplier.ritiro_note)}
        {dato("IVA predefinita",supplier.inversione_contabile ? "Reverse charge" : supplier.vat_rate != null ? `${supplier.vat_rate}%` : null)}
        {dato("Ordine minimo",supplier.min_order_amount != null ? formatCurrency(supplier.min_order_amount) : null)}
        {dato("Plafond",supplier.credit_limit != null ? formatCurrency(supplier.credit_limit) : null)}
        {dato("Valutazione",supplier.rating != null ? `${supplier.rating}/5` : null)}
        {dato("Stato",supplier.is_active === false ? "Non attivo" : "Attivo")}
        {dato("Sito web",supplier.website)}{dato("Categoria",supplier.product_category)}{dato("Note del fornitore",supplier.notes)}
      </dl></details>
      {(permissions.canEditSettingsSuppliers || permissions.canManageSuppliers) && <p className="mt-3 text-xs text-slate-500">La modifica aggiorna l’anagrafica condivisa con Impostazioni → Fornitori.</p>}
    </QuoteCard>
    {editing && <Suspense fallback={<p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Apertura anagrafica…</p>}><FornitoreEditor aperta fornitore={supplier} esteroIniziale={!!supplier.is_foreign} fornitori={[supplier]} categorieEsistenti={supplier.product_category ? [supplier.product_category] : []} salvataggio={saving} onChiudi={()=>{if (!saving) setEditing(false);}} onSalva={form=>void save(form)} /></Suspense>}
  </>;
}
