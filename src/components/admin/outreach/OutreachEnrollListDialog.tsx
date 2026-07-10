import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Loader2 } from "lucide-react";

/**
 * Arruola una LISTA (tag) in una sequenza, scegliendo la sequenza dal menu.
 * È l'entry-point lista→flusso (l'inverso di OutreachEnrollDialog, che parte
 * dalla sequenza). Chiama la stessa edge function outreach-enroll.
 */

export function OutreachEnrollListDialog({ companyId, tag, count, contactable }: { companyId: string; tag: string; count: number; contactable?: number }) {
  const [open, setOpen] = useState(false);
  const [sequenceId, setSequenceId] = useState("");
  const [busy, setBusy] = useState(false);

  const seqs = useQuery({
    queryKey: ["enroll-list-seqs", companyId],
    enabled: open,
    retry: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any).from("outreach_sequences")
        .select("id,name,status").eq("company_id", companyId).neq("status", "archived")
        .order("created_at", { ascending: false });
      return (data ?? []) as { id: string; name: string; status: string }[];
    },
  });

  async function enroll() {
    if (!sequenceId) { toast.error("Scegli una sequenza"); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-enroll", { body: { sequence_id: sequenceId, tag } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const enrolled = Number(data?.enrolled ?? 0);
      if (enrolled > 0) {
        toast.success(`${enrolled} contatti di "${tag}" iscritti alla sequenza`, {
          description: data?.truncated
            ? "Lista molto grande: iscritti i primi contatti. Rilancia l'arruolamento per continuare con i restanti."
            : undefined,
        });
      } else {
        toast.info("Nessun nuovo iscritto", { description: data?.note ?? "Già iscritti / opt-out / blocklist." });
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore durante l'iscrizione");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 shrink-0 gap-1 px-2 text-xs" title={`Arruola la lista "${tag}" in una sequenza`}>
          <UserPlus className="h-3.5 w-3.5" /> Arruola
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Arruola la lista "{tag}"</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            La lista <strong>{tag}</strong> ha <strong>{count.toLocaleString("it-IT")}</strong> contatti
            {typeof contactable === "number" && (
              <>, di cui <strong className="text-emerald-600">{contactable.toLocaleString("it-IT")}</strong> contattabili via email</>
            )}.
            Verranno iscritti solo questi ultimi: senza email, opt-out, blocklist e già-iscritti sono saltati.
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Sequenza</Label>
            <Select value={sequenceId} onValueChange={setSequenceId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={seqs.isLoading ? "Carico…" : "Scegli una sequenza"} /></SelectTrigger>
              <SelectContent>
                {(seqs.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.status}</SelectItem>)}
                {seqs.data && seqs.data.length === 0 && <SelectItem value="__none__" disabled>Nessuna sequenza: creane una nella scheda Sequenze</SelectItem>}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={enroll} disabled={busy || !sequenceId} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Iscrivi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
