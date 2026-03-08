import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Search, Merge, Loader2, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ContactMergeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceContact: { id: string; first_name: string; last_name: string; email?: string; phone?: string } | null;
  companyId: string;
}

export function ContactMergeDialog({ open, onOpenChange, sourceContact, companyId }: ContactMergeDialogProps) {
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [masterId, setMasterId] = useState<string>("source");
  const queryClient = useQueryClient();

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["merge-candidates", companyId, search],
    queryFn: async () => {
      if (!search.trim() || search.length < 2) return [];
      const q = `%${search}%`;
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, email, phone")
        .eq("company_id", companyId)
        .neq("id", sourceContact?.id || "")
        .or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`)
        .limit(10);
      return data || [];
    },
    enabled: open && !!companyId && !!sourceContact && search.length >= 2,
  });

  const mergeContacts = useMutation({
    mutationFn: async () => {
      if (!sourceContact || !targetId) throw new Error("Seleziona un contatto");

      const keepId = masterId === "source" ? sourceContact.id : targetId;
      const removeId = masterId === "source" ? targetId : sourceContact.id;

      // Move opportunities
      await supabase
        .from("marketing_opportunities")
        .update({ contact_id: keepId })
        .eq("contact_id", removeId);

      // Move notes
      await supabase
        .from("marketing_contact_notes")
        .update({ contact_id: keepId })
        .eq("contact_id", removeId);

      // Move activities
      await supabase
        .from("marketing_contact_activities")
        .update({ contact_id: keepId })
        .eq("contact_id", removeId);

      // Move appointments
      await supabase
        .from("appointments")
        .update({ contact_id: keepId })
        .eq("contact_id", removeId);

      // Move documents
      await supabase
        .from("marketing_contact_documents")
        .update({ contact_id: keepId })
        .eq("contact_id", removeId);

      // Move messages
      await supabase
        .from("contact_messages")
        .update({ contact_id: keepId })
        .eq("contact_id", removeId);

      // Delete the merged-away contact
      await supabase
        .from("marketing_contacts")
        .delete()
        .eq("id", removeId);

      return { keepId, removeId };
    },
    onSuccess: () => {
      toast.success("Contatti uniti con successo");
      queryClient.invalidateQueries({ queryKey: ["marketing_contacts"] });
      queryClient.invalidateQueries({ queryKey: ["marketing-contact"] });
      onOpenChange(false);
      setSearch("");
      setTargetId(null);
      setMasterId("source");
    },
    onError: (err: any) => {
      toast.error("Errore durante il merge: " + err.message);
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
            Unisci un contatto duplicato in quello principale. Opportunità, note, attività e documenti verranno spostati.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source contact */}
          <div className="rounded-md border p-2.5">
            <Label className="text-[10px] text-muted-foreground">Contatto corrente</Label>
            <p className="text-sm font-medium">
              {sourceContact?.first_name} {sourceContact?.last_name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {sourceContact?.email || "No email"} · {sourceContact?.phone || "No tel"}
            </p>
          </div>

          {/* Search target */}
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
                      className={`w-full text-left rounded-md border p-2 text-xs transition-colors ${
                        targetId === c.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
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

          {/* Master selection */}
          {targetId && selectedTarget && (
            <div className="space-y-2">
              <Label className="text-xs">Quale contatto mantenere?</Label>
              <RadioGroup value={masterId} onValueChange={setMasterId} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="source" id="keep-source" />
                  <label htmlFor="keep-source" className="text-[11px]">
                    {sourceContact?.first_name} {sourceContact?.last_name} (corrente)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="target" id="keep-target" />
                  <label htmlFor="keep-target" className="text-[11px]">
                    {selectedTarget.first_name} {selectedTarget.last_name}
                  </label>
                </div>
              </RadioGroup>
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
