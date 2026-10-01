/**
 * «Ordina materiale per l'assistenza»: crea un ordine fornitore (OdA) in bozza
 * collegato al ticket (e alla commessa, se c'è). Da lì il materiale è tracciato
 * come ogni OdA — arrivo, giacenza — e sul ticket si vede se è arrivato.
 *
 * Stessa finestra usata sul dettaglio (card Merce) e subito dopo aver creato un
 * ticket con «merce da ordinare», così l'OdA parte senza passaggi in più.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface OrdinaMerceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  orderId: string | null;
  companyId: string;
  /** Creato l'OdA: chi ospita aggiorna le sue liste (merce, ticket). */
  onCreated?: (odaId: string) => void;
}

export function OrdinaMerceDialog({ open, onOpenChange, ticketId, orderId, companyId, onCreated }: OrdinaMerceDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [attesa, setAttesa] = useState("");

  const { data: fornitori = [] } = useQuery({
    queryKey: ["fornitori-attivi", companyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers").select("id, name")
        .eq("company_id", companyId).eq("is_active", true)
        .order("name").limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const crea = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error("Scegli il fornitore");
      if (!descrizione.trim()) throw new Error("Scrivi cosa stai ordinando");
      const { data: po, error } = await supabase
        .from("purchase_orders")
        .insert({
          company_id: companyId,
          supplier_id: supplierId,
          order_id: orderId,
          ticket_id: ticketId,
          status: "bozza",
          expected_delivery_date: attesa || null,
          created_by: user?.id,
          notes: `Materiale per assistenza — ${descrizione.trim()}`,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      // Il ticket entra in attesa merce: è lo stato che spiega perché è fermo.
      const { error: tErr } = await supabase
        .from("tickets")
        .update({ merce_richiesta: true, status: "in_attesa_merce" } as never)
        .eq("id", ticketId);
      if (tErr) throw tErr;
      return (po as { id: string }).id;
    },
    onSuccess: (odaId) => {
      qc.invalidateQueries({ queryKey: ["ticket-merce", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket", ticketId] });
      toast.success("Ordine creato: l'assistenza è in attesa merce");
      setSupplierId(""); setDescrizione(""); setAttesa("");
      onOpenChange(false);
      onCreated?.(odaId);
    },
    onError: (e: Error) => toast.error(e.message || "Non sono riuscito a creare l'ordine"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Ordina materiale per l'assistenza</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Fornitore *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Scegli il fornitore" /></SelectTrigger>
              <SelectContent>
                {fornitori.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cosa serve *</Label>
            <Input value={descrizione} onChange={(e) => setDescrizione(e.target.value)}
                   placeholder="Es. maniglia cromata + cerniera anta" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Arrivo previsto</Label>
            <Input type="date" value={attesa} onChange={(e) => setAttesa(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Viene creato un ordine fornitore in bozza collegato a questa assistenza
            {orderId ? " e alla commessa" : ""}. L'assistenza passa in "attesa merce"
            e il materiale è tracciato come ogni ordine (arrivo, magazzino).
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => crea.mutate()} disabled={crea.isPending}>
            {crea.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Crea ordine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
