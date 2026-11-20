import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FiscalQueryState } from "@/components/fatturazione/FiscalQueryState";
import { toast } from "sonner";
import { linkFattura, linkTesoreriaMovimento } from "@/lib/finance/collegamentiFinanza";
import { Link } from "react-router-dom";

interface EsitoAllineamento {
  imported_banking: number; imported_invoices: number; linked_existing: number; total: number;
  da_verificare: Array<{ id: string; motivo: string; origine?: string; invoice_id?: string }>; limite_raggiunto: boolean; troncato?: boolean;
}
export function AllineamentoPrimaNota({ company, open, onOpenChange }: { company: string | undefined; open: boolean; onOpenChange: (v: boolean) => void }) {
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
      toast.success(`Prima nota aggiornata: ${r.total} movimenti inseriti, ${r.linked_existing} collegati`, { description: r.limite_raggiunto ? "Resta un altro gruppo da riallineare: controlla l’anteprima aggiornata." : undefined });
    },
    onError: e => toast.error("Prima nota non aggiornata", { description: e.message }),
  });
  const p = preview.data;
  return <Dialog open={open} onOpenChange={v => { if (!allinea.isPending) onOpenChange(v); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Allinea banca, fatture e prima nota</DialogTitle><DialogDescription>Controlla i pagamenti già registrati e i movimenti bancari riconciliati. Un pagamento già presente viene collegato alla banca; i casi ambigui restano da verificare.</DialogDescription></DialogHeader>
    {preview.isPending || preview.isError ? <FiscalQueryState loading={preview.isPending} error={preview.isError} onRetry={() => void preview.refetch()} /> : p && <div className="space-y-3 text-sm" aria-live="polite">
      <p>{p.imported_banking} movimenti bancari da inserire · {p.imported_invoices} incassi da inserire · {p.linked_existing} registrazioni esistenti da collegare.</p>
      {p.troncato && <p role="alert">Il controllo ha raggiunto il limite del gruppo: l’anteprima non comprende ancora tutto lo storico.</p>}
      {p.da_verificare.length > 0 && <details open><summary className="cursor-pointer font-medium">{p.da_verificare.length} casi da verificare</summary><ul className="mt-2 max-h-60 space-y-2 overflow-y-auto">{p.da_verificare.map((c,i) => {
        const link = c.origine === "banca" ? linkTesoreriaMovimento(c.id) : c.origine === "fattura" ? linkFattura(c.id, false) : c.invoice_id ? linkFattura(c.invoice_id, false) : null;
        return <li key={`${c.id}:${i}`}><span>{c.motivo}</span>{link && <Link className="ml-2 text-primary underline" to={link}>Apri origine</Link>}</li>;
      })}</ul></details>}
      {!p.total && !p.linked_existing && !p.da_verificare.length && !p.troncato && <p>Le fonti controllate sono già rappresentate in prima nota.</p>}
    </div>}
    <DialogFooter><Button variant="outline" disabled={allinea.isPending} onClick={() => onOpenChange(false)}>Chiudi</Button><Button disabled={allinea.isPending || preview.isFetching || !p || p.total + p.linked_existing === 0} onClick={() => allinea.mutate()}>{allinea.isPending ? "Riallineamento…" : "Riallinea le corrispondenze certe"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
