import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import { toast } from "sonner";
import { linkFattura, linkTesoreriaMovimento } from "@/lib/finance/collegamentiFinanza";
import { Link } from "react-router-dom";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface EsitoAllineamento {
  imported_banking: number; imported_invoices: number; linked_existing: number; total: number;
  da_verificare: Array<{ id: string; motivo: string; origine?: string; invoice_id?: string }>; limite_raggiunto: boolean; troncato?: boolean;
}
export function AllineamentoPrimaNota({ company, open, onOpenChange }: { company: string | undefined; open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const esegui = async (anteprima: boolean): Promise<EsitoAllineamento> => {
    const { data, error } = await supabase.rpc("prima_nota_allinea_fonti" as never, { p_company: company, p_anteprima: anteprima, p_origine: "both" } as never);
    if (error) throw new Error(error.message);
    return data as unknown as EsitoAllineamento;
  };
  const preview = useQuery({ queryKey: ["prima-nota-anteprima-allineamento", company], enabled: open && !!company, queryFn: () => esegui(true), staleTime: 0 });
  const allinea = useMutation({
    mutationFn: () => esegui(false),
    onSuccess: async r => {
      refreshFinancialQueries(qc);
      await qc.invalidateQueries({ queryKey: ["contabilita-generale", company] });
      await preview.refetch();
      toast.success(t("Prima nota aggiornata: {total} movimenti inseriti, {linked_existing} collegati", { total: r.total, linked_existing: r.linked_existing }), { description: r.limite_raggiunto ? t("Resta un altro gruppo da riallineare: controlla l’anteprima aggiornata.") : undefined });
    },
    onError: e => toast.error(t("Prima nota non aggiornata"), { description: e.message }),
  });
  const p = preview.data;
  return <Dialog open={open} onOpenChange={v => { if (!allinea.isPending) onOpenChange(v); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{t("Allinea banca, fatture e prima nota")}</DialogTitle><DialogDescription>{t("Controlla i pagamenti già registrati e i movimenti bancari riconciliati. Un pagamento già presente viene collegato alla banca; i casi ambigui restano da verificare.")}</DialogDescription></DialogHeader>
    {preview.isPending || preview.isError ? <FiscalQueryState loading={preview.isPending} error={preview.isError} onRetry={() => void preview.refetch()} /> : p && <div className="space-y-3 text-sm" aria-live="polite">
      <p>{t("{imported_banking} movimenti bancari da inserire · {imported_invoices} incassi da inserire · {linked_existing} registrazioni esistenti da collegare.", { imported_banking: p.imported_banking, imported_invoices: p.imported_invoices, linked_existing: p.linked_existing })}</p>
      {p.troncato && <p role="alert">{t("Il controllo ha raggiunto il limite del gruppo: l’anteprima non comprende ancora tutto lo storico.")}</p>}
      {p.da_verificare.length > 0 && <details open><summary className="cursor-pointer font-medium">{t("{n} casi da verificare", { n: p.da_verificare.length })}</summary><ul className="mt-2 max-h-60 space-y-2 overflow-y-auto">{p.da_verificare.map((c,i) => {
        const link = c.origine === "banca" ? linkTesoreriaMovimento(c.id) : c.origine === "fattura" ? linkFattura(c.id, false) : c.invoice_id ? linkFattura(c.invoice_id, false) : null;
        return <li key={`${c.id}:${i}`}><span>{c.motivo}</span>{link && <Link className="ml-2 text-primary underline" to={link}>{t("Apri origine")}</Link>}</li>;
      })}</ul></details>}
      {!p.total && !p.linked_existing && !p.da_verificare.length && !p.troncato && <p>{t("Le fonti controllate sono già rappresentate in prima nota.")}</p>}
    </div>}
    <DialogFooter><Button variant="outline" disabled={allinea.isPending} onClick={() => onOpenChange(false)}>{t("Chiudi")}</Button><Button disabled={allinea.isPending || preview.isFetching || !p || p.total + p.linked_existing === 0} onClick={() => allinea.mutate()}>{allinea.isPending ? t("Riallineamento…") : t("Riallinea le corrispondenze certe")}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
