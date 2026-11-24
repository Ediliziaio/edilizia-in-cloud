import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { oggiRoma } from "@/hooks/useOperai";
import { formatDateIt } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const key = "periodi-cantiere-operaio";
interface Periodo { id: string; cantiere_id: string; start_date: string; end_date: string }

export function PeriodiInCommessa({ companyId, orderId }: { companyId: string; orderId: string }) {
  const t = useT();
  const query = useQuery({
    queryKey: [key, companyId, "commessa", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cantiere_allocations")
        .select("id,start_date,end_date,employees(first_name,last_name)")
        .eq("company_id", companyId).eq("cantiere_id", orderId).eq("resource_type", "employee")
        .neq("status", "cancelled").order("start_date");
      if (error) throw error;
      return data;
    },
  });
  if (query.isError) return <p role="alert">{t("Impossibile caricare i periodi degli operai.")} <Button variant="link" onClick={() => query.refetch()}>{t("Riprova")}</Button></p>;
  if (!query.data?.length) return null;
  return <section className="rounded-lg border px-3 py-2 text-sm">
    <h3 className="font-semibold">{t("Operai pianificati")}</h3>
    <ul className="divide-y">{query.data.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-2">
      <span>{row.employees ? [row.employees.first_name, row.employees.last_name].join(" ") : t("Operaio")}</span>
      <span>{t("Dal {start_date} al {end_date}", { start_date: formatDateIt(row.start_date), end_date: formatDateIt(row.end_date) })}</span>
    </li>)}</ul>
  </section>;
}

export function PeriodiOperaio({ companyId, employeeId, modificabile, linkCommesse }: {
  companyId: string; employeeId: string; modificabile: boolean; linkCommesse: boolean;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo | null>(null);
  const [nuovo, setNuovo] = useState(false);
  const query = useQuery({
    queryKey: [key, companyId, "operaio", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("cantiere_allocations")
        .select("id,cantiere_id,start_date,end_date,orders(order_code,client_name,description)")
        .eq("company_id", companyId).eq("employee_id", employeeId).eq("resource_type", "employee")
        .neq("status", "cancelled").order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const salva = useMutation({
    mutationFn: async (p: Periodo) => {
      if (!modificabile || !p.cantiere_id || !p.start_date || !p.end_date || p.end_date < p.start_date) throw new Error("Controlla la commessa e le date.");
      const conflitto = query.data?.some(row => row.id !== p.id && row.cantiere_id === p.cantiere_id && row.start_date <= p.end_date && row.end_date >= p.start_date);
      if (conflitto) throw new Error("Questo operaio è già previsto nella commessa in quelle date.");
      const table = supabase.from("cantiere_allocations");
      const result = nuovo
        ? await table.insert({...p, employee_id: employeeId, company_id: companyId, resource_type: "employee"}).select("id").single()
        : await table.update({start_date: p.start_date, end_date: p.end_date}).eq("id", p.id).eq("company_id", companyId).eq("employee_id", employeeId).select("id").single();
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({queryKey: [key, companyId]});
      setPeriodo(null);
      toast.success(t("Periodo salvato"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("Salvataggio non riuscito. Verifica i permessi e riprova.")),
  });
  return <>
    {query.isError && <p role="alert">{t("Periodi non disponibili.")} <Button variant="link" onClick={() => query.refetch()}>{t("Riprova")}</Button></p>}
    <ul className="divide-y">{query.data?.map(row => {
      const nome = [row.orders?.order_code, row.orders?.client_name || row.orders?.description].filter(Boolean).join(" · ") || "Commessa";
      return <li key={row.id} className="flex items-center justify-between gap-2 py-2 text-sm">
        <div className="min-w-0">{linkCommesse ? <Link className="block truncate font-medium hover:underline" to={`/azienda/ordini/${row.cantiere_id}`}>{nome}</Link> : <span>{nome}</span>}
        <span className="text-xs text-muted-foreground">{t("Dal {start_date} al {end_date}", { start_date: formatDateIt(row.start_date), end_date: formatDateIt(row.end_date) })}</span></div>
        {modificabile && <Button variant="ghost" size="sm" onClick={() => {setNuovo(false); setPeriodo(row);}}>{t("Modifica date")}</Button>}
      </li>;
    })}</ul>
    {modificabile && <Button variant="outline" size="sm" disabled={!query.isSuccess} onClick={() => {
      setNuovo(true);
      setPeriodo({id: crypto.randomUUID(), cantiere_id: "", start_date: oggiRoma(), end_date: ""});
    }}>{t("Assegna a commessa")}</Button>}
    {periodo && <Dialog open onOpenChange={open => {if (!open && !salva.isPending) setPeriodo(null);}}>
      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{nuovo ? t("Assegna a commessa") : t("Modifica periodo")}</DialogTitle>
        <DialogDescription>{t("Indica i giorni in cui questo operaio lavora nel cantiere.")}</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={e => {e.preventDefault(); if (!salva.isPending) salva.mutate(periodo);}}>
          <div><span className="text-sm font-medium">{t("Commessa")}</span><CommessaCombobox className="w-full" disabled={!nuovo} nessunaLabel={t("Scegli la commessa")} value={periodo.cantiere_id || null} onChange={id => setPeriodo({...periodo, cantiere_id: id || ""})}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label htmlFor="periodo-dal">{t("Dal")}</Label><Input type="date" id="periodo-dal" required value={periodo.start_date} onChange={e => setPeriodo({...periodo, start_date: e.target.value})}/></div>
            <div><Label htmlFor="periodo-al">{t("Al")}</Label><Input type="date" id="periodo-al" min={periodo.start_date} required value={periodo.end_date} onChange={e => setPeriodo({...periodo, end_date: e.target.value})}/></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" disabled={salva.isPending} onClick={() => setPeriodo(null)}>{t("Annulla")}</Button>
          <Button disabled={salva.isPending || !periodo.cantiere_id || !periodo.start_date || !periodo.end_date || periodo.end_date < periodo.start_date}>{t("Salva periodo")}</Button></DialogFooter>
        </form>
      </DialogContent></Dialog>}
  </>;
}
