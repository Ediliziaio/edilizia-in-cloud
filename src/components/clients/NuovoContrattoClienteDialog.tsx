/**
 * «Nuovo contratto» dalla scheda del cliente (09/11/2026).
 *
 * Florin: «lato committente e cliente, se devo fare un nuovo contratto controlla il flusso». Il contratto col cliente
 * nasce da una commessa: si sceglie quella (e il contratto si apre già lì), o se ne apre una nuova.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Commessa { id: string; order_code: string | null; description: string | null }

export function NuovoContrattoClienteDialog({ aperto, onChiudi, clienteId, nomeCliente }: {
  aperto: boolean; onChiudi: () => void; clienteId: string; nomeCliente: string;
}) {
  const navigate = useNavigate();
  const { data: commesse = [], isLoading, error } = useQuery({
    queryKey: ["contratto-commesse-cliente", clienteId],
    enabled: aperto,
    queryFn: async (): Promise<Commessa[]> => {
      const { data, error: e } = await supabase.from("orders").select("id, order_code, description")
        .eq("customer_id", clienteId).is("deleted_at", null).order("created_at", { ascending: false }).limit(30);
      if (e) throw e;
      return (data ?? []) as Commessa[];
    },
  });
  const vai = (dove: string): void => { onChiudi(); navigate(dove); };
  return (
    <Dialog open={aperto} onOpenChange={(o) => { if (!o) onChiudi(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo contratto</DialogTitle>
          <DialogDescription>Per quale commessa di {nomeCliente}?</DialogDescription>
        </DialogHeader>
        {isLoading && <p role="status" className="text-sm text-muted-foreground">Cerco le commesse…</p>}
        {error && <p role="alert" className="text-sm text-destructive">Non riesco a leggere le commesse. Riprova.</p>}
        {!isLoading && !error && commesse.length === 0 && <p className="text-sm text-muted-foreground">Questo cliente non ha ancora commesse: aprine una, poi il contratto si genera da lì.</p>}
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {commesse.map((c) => (
            <button key={c.id} type="button" className="w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/60" onClick={() => vai(`/azienda/ordini/${c.id}?contratto=1`)}>
              <span className="font-medium">{c.order_code || "Commessa"}</span>
              {c.description ? <span className="block truncate text-xs text-muted-foreground">{c.description}</span> : null}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={() => vai(`/azienda/ordini/nuovo?customer_id=${clienteId}&customer_name=${encodeURIComponent(nomeCliente)}&contratto=1`)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Nuova commessa
        </Button>
      </DialogContent>
    </Dialog>
  );
}
