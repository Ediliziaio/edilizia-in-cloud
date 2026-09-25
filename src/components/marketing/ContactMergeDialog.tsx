import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Merge, Loader2, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ContactMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceContact: { id: string; first_name: string; last_name: string; email?: string; phone?: string } | null;
  companyId: string;
  /** Chiamato dopo un merge riuscito con l'id del contatto SOPRAVVISSUTO (per navigare). */
  onMerged?: (keepId: string) => void;
}

export function ContactMergeDialog({ open, onOpenChange, sourceContact, companyId, onMerged }: ContactMergeDialogProps) {
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [masterId, setMasterId] = useState<"source" | "target">("source");
  const queryClient = useQueryClient();

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["merge-candidates", companyId, search],
    queryFn: async () => {
      if (!search.trim() || search.length < 2) return [];
      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .neq("id", sourceContact?.id || "");
      for (const filtro of filtriRicercaContatti(search)) query = query.or(filtro);
      const { data } = await query.limit(10);
      return data || [];
    },
    enabled: open && !!companyId && !!sourceContact && search.length >= 2,
  });

  const mergeContacts = useMutation({
    mutationFn: async () => {
      if (!sourceContact || !targetId) throw new Error("Seleziona un contatto");
      if (!companyId) throw new Error("Azienda non selezionata");

      const keepId = masterId === "source" ? sourceContact.id : targetId;
      const removeId = masterId === "source" ? targetId : sourceContact.id;

      // Tutto nel database, in una transazione (unisci_contatti_marketing):
      // ogni riga che punta al doppione — opportunità, note, WhatsApp, email,
      // preventivi, fatture, attività... — passa al contatto che resta, poi il
      // doppione si cancella. Prima il browser spostava cinque tabelle: il
      // resto si cancellava col doppione o restava legato a un contatto che
      // non c'era più (i WhatsApp sparivano dalla scheda e da Conversazioni).
      const { data, error } = await supabase.rpc("unisci_contatti_marketing" as never, {
        p_tieni: keepId,
        p_togli: removeId,
      } as never);
      if (error) throw error;
      const esito = data as { totale?: number } | null;

      return { keepId, removeId, spostati: Number(esito?.totale ?? 0) };
    },
    onSuccess: (result) => {
      toast.success("Contatti uniti", {
        description: result.spostati > 0
          ? `${result.spostati} ${result.spostati === 1 ? "elemento spostato" : "elementi spostati"} sul contatto che resta`
          : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });
      queryClient.invalidateQueries({ queryKey: ["marketing_contact"] });
      // Cronologia, WhatsApp, opportunità del contatto che resta: ogni query
      // con il suo id nella chiave.
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes(result.keepId) });
      onOpenChange(false);
      setSearch("");
      setTargetId(null);
      setMasterId("source");
      // Se il contatto aperto è stato fuso (rimosso), il parent naviga al
      // contatto sopravvissuto per non restare su una scheda eliminata.
      onMerged?.(result.keepId);
    },
    onError: (err: any) => {
      toast.error("Unione non riuscita: " + err.message);
    },
  });

  const selectedTarget = candidates.find((c: any) => c.id === targetId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-4 w-4" /> Unisci contatti
          </DialogTitle>
          <DialogDescription>
            Unisci un contatto duplicato in quello principale. Tutto quello che è legato al doppione (opportunità, note, messaggi anche WhatsApp, email, preventivi, fatture, appuntamenti) passa al contatto che resta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-2.5">
            <Label className="text-[10px] text-muted-foreground">Contatto corrente</Label>
            <p className="text-sm font-medium">
              {sourceContact?.first_name} {sourceContact?.last_name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {sourceContact?.email || "No email"} · {sourceContact?.phone || "No tel"}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Cerca il contatto da unire</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Nome, email o telefono..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            {isLoading && <p className="text-[10px] text-muted-foreground">Ricerca...</p>}

            {candidates.length > 0 && (
              <ScrollArea className="max-h-40">
                <div className="space-y-1">
                  {candidates.map((c: any) => (
                    <button
                      key={c.id}
                      className={cn(
                        "w-full text-left rounded-md border p-2 text-xs transition-colors",
                        targetId === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      )}
                      onClick={() => setTargetId(c.id)}
                    >
                      <span className="font-medium">{c.first_name} {c.last_name}</span>
                      <span className="text-muted-foreground ml-2">
                        {c.email || ""} {c.phone ? `· ${c.phone}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {targetId && selectedTarget && (
            <div className="space-y-2">
              <Label className="text-xs">Quale contatto mantenere?</Label>
              <div className="space-y-1.5">
                <button
                  className={cn(
                    "w-full text-left rounded-md border p-2 text-[11px] transition-colors",
                    masterId === "source" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                  onClick={() => setMasterId("source")}
                >
                  {sourceContact?.first_name} {sourceContact?.last_name} (corrente)
                </button>
                <button
                  className={cn(
                    "w-full text-left rounded-md border p-2 text-[11px] transition-colors",
                    masterId === "target" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  )}
                  onClick={() => setMasterId("target")}
                >
                  {selectedTarget.first_name} {selectedTarget.last_name}
                </button>
              </div>
            </div>
          )}

          {targetId && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2 text-[10px] text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                Il contatto non mantenuto verrà eliminato definitivamente. Questa azione è irreversibile.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            size="sm"
            disabled={!targetId || mergeContacts.isPending}
            onClick={() => mergeContacts.mutate()}
          >
            {mergeContacts.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Unisci contatti
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
