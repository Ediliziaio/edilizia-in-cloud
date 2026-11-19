import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
export type RataDaPagare = { id: string; stato: string; importo: number; titolo: string };

export function PagaRataDialog({ companyId, scelta, onClose }: { companyId: string; scelta: RataDaPagare; onClose: () => void }) {
  const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const [data,setData] = useState(oggi);
  const client = useQueryClient();
  const paga = useMutation({
    mutationFn: async (r: { id: string; stato: string; importo: number; data: string }) => {
      const { error } = await supabase.from("rate_fornitori")
        .update({ stato: "pagata", pagata_il: r.data })
        .eq("company_id", companyId).eq("id", r.id).eq("stato", r.stato).eq("importo", r.importo).select("id").single();
      if (error) throw error;
    },
    onSuccess: () => { onClose(); refreshFinancialQueries(client); toast.success("Rata segnata pagata"); },
    onError: () => { refreshFinancialQueries(client); toast.error("Rata non aggiornata. Verifica lo stato e i permessi."); },
  });
  return (
    <Dialog open onOpenChange={open => { if (!open && !paga.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Segna rata pagata</DialogTitle><DialogDescription>{scelta?.titolo}</DialogDescription></DialogHeader>
        <form className="space-y-3" onSubmit={e => {
          e.preventDefault();
          if (scelta && data && data <= oggi && !paga.isPending) paga.mutate({ ...scelta, data });
        }}>
          <Label htmlFor="data-rata-pagata">Data effettiva del pagamento</Label>
          <Input id="data-rata-pagata" type="date" required max={oggi} value={data} onChange={e => setData(e.target.value)} />
          <DialogFooter><Button type="button" variant="outline" disabled={paga.isPending} onClick={() => onClose()}>Annulla</Button>
            <Button type="submit" disabled={!data || data > oggi || paga.isPending}>Conferma pagamento</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
