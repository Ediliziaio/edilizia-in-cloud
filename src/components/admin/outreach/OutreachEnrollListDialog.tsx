import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Loader2 } from "lucide-react";
import { arruolaPagine, chiaveArruolamento, cursoreArruolamento } from "./enrollPages";

/**
 * Arruola una LISTA (tag) in una sequenza, scegliendo la sequenza dal menu.
 * È l'entry-point lista→flusso (l'inverso di OutreachEnrollDialog, che parte
 * dalla sequenza). Chiama la stessa edge function outreach-enroll.
 */

export function OutreachEnrollListDialog({ companyId, tag, count, contactable }: { companyId: string; tag: string; count: number; contactable?: number }) {
  const [open, setOpen] = useState(false);
  const [sequenceId, setSequenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<Awaited<ReturnType<typeof arruolaPagine>> | null>(null);
  const criteri = { sequence_id: sequenceId, tag };
  const chiave = chiaveArruolamento(companyId, criteri);
  const riprendi = sequenceId && (cursoreArruolamento(chiave) || esito?.altri);

  const seqs = useQuery({
    queryKey: ["enroll-list-seqs", companyId],
    enabled: open,
    retry: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("outreach_sequences")
        .select("id,name,status").eq("company_id", companyId).neq("status", "archived")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; status: string }[];
    },
  });

  async function enroll() {
    if (!sequenceId) { toast.error("Scegli una sequenza"); return; }
    setBusy(true);
    try {
      const report = await arruolaPagine(criteri, { chiave, quanti: 500, maxGiri: 1 });
      setEsito(report);
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
            <Select value={sequenceId} onValueChange={(id) => { setSequenceId(id); setEsito(null); }} disabled={busy}>
              <SelectTrigger className="h-9"><SelectValue placeholder={seqs.isLoading ? "Carico…" : "Scegli una sequenza"} /></SelectTrigger>
              <SelectContent>
                {(seqs.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} · {s.status}</SelectItem>)}
                {seqs.data && seqs.data.length === 0 && <SelectItem value="__none__" disabled>Nessuna sequenza: creane una nella scheda Sequenze</SelectItem>}
              </SelectContent>
            </Select>
            {seqs.isError && <p role="alert" className="text-sm text-destructive">Sequenze indisponibili. <button type="button" className="underline" onClick={() => void seqs.refetch()}>Riprova</button></p>}
          </div>
          {["draft", "paused"].includes(seqs.data?.find((s) => s.id === sequenceId)?.status ?? "") &&
            <p className="text-xs text-muted-foreground">Gli iscritti aspetteranno la conferma di avvio dalla scheda Sequenze.</p>}
          {esito && <div role="status" className="rounded-md border p-3 text-sm">
            <p className="font-medium">{esito.enrolled} iscritti · {esito.valutati - esito.enrolled} esclusi</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {esito.altri ? "Puoi continuare dalla posizione salvata." : "Hai esaminato tutta la lista."}
            </p>
          </div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Chiudi</Button>
          <Button onClick={enroll} disabled={busy || !sequenceId} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {riprendi ? "Continua dalla posizione salvata" : "Iscrivi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
