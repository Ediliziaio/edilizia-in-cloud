import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyGroups } from "@/hooks/superadmin/useCompanyGroups";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export function AssignCompanyGroup({ companyIds }: { companyIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { data: groups = [] } = useCompanyGroups();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (group: string) => {
      const { error } = await supabase.rpc("admin_set_company_group" as never, { p_company_ids: companyIds, p_group: group } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["admin-company-groups"] });
      client.invalidateQueries({ queryKey: queryKeys.admin.companyTags });
      client.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Gruppo aggiornato");
      setOpen(false);
    },
    onError: (e: Error) => toast.error("Gruppo non aggiornato", { description: e.message }),
  });
  if (!companyIds.length) return null;
  return <>
    <Button variant="outline" size="sm" onClick={() => { setName(""); setOpen(true); }}>Assegna gruppo a {companyIds.length} aziende</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogHeader><DialogTitle>Gruppo aziendale</DialogTitle><DialogDescription>
        Assegna un gruppo alle {companyIds.length} aziende selezionate, sostituendo quello precedente. Dati, accessi e piani restano indipendenti.
      </DialogDescription></DialogHeader>
      <label className="text-sm space-y-2">Nome del gruppo
        <Input aria-label="Nome del gruppo" list="company-group-names" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Es. Scavolo" />
      </label>
      <datalist id="company-group-names">{groups.map(g => <option key={g.name} value={g.name} />)}</datalist>
      <DialogFooter>
        <Button variant="outline" disabled={mutation.isPending || companyIds.length > 200} onClick={() => mutation.mutate("")}>Rimuovi dal gruppo</Button>
        <Button disabled={!name.trim() || mutation.isPending || companyIds.length > 200} onClick={() => mutation.mutate(name.trim())}>{mutation.isPending ? "Salvataggio…" : "Assegna gruppo"}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  </>;
}
