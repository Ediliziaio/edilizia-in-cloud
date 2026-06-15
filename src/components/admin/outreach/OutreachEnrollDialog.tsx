import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Loader2, Users } from "lucide-react";

/**
 * Arruola contatti in una sequenza. Chiama l'edge function outreach-enroll
 * (super_admin) che crea le iscrizioni e accoda il primo step email; il
 * dispatcher poi invia e fa avanzare la cadenza. Filtra a monte opt-out,
 * blocklist e già iscritti — qui mostriamo solo un conteggio indicativo.
 */

const CAP = 5000;

export function OutreachEnrollDialog({ companyId, sequenceId, sequenceName, emailStepCount, onEnrolled }: {
  companyId: string;
  sequenceId: string;
  sequenceName: string;
  emailStepCount: number;
  onEnrolled?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"all" | "tag" | "source">("all");
  const [tag, setTag] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  // tag e sorgenti disponibili (aggregazione client-side come la vista Liste)
  const facets = useQuery({
    queryKey: ["enroll-facets", companyId],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("marketing_contacts").select("tags,source").eq("company_id", companyId).limit(CAP);
      const tags = new Set<string>(); const sources = new Set<string>();
      for (const r of (data ?? []) as { tags: string[] | null; source: string | null }[]) {
        for (const t of r.tags ?? []) if (t) tags.add(t);
        if (r.source) sources.add(r.source);
      }
      return { tags: [...tags].sort(), sources: [...sources].sort() };
    },
  });

  // conteggio contattabili per il target scelto (limite superiore: il backend
  // scarta poi opt-out/blocklist/già iscritti)
  const count = useQuery({
    queryKey: ["enroll-count", companyId, mode, tag, source],
    enabled: open && (mode === "all" || (mode === "tag" && !!tag) || (mode === "source" && !!source)),
    queryFn: async () => {
      let q = supabase
        .from("marketing_contacts")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("optout_email", false)
        .not("email", "is", null);
      if (mode === "tag" && tag) q = q.contains("tags", [tag]);
      if (mode === "source" && source) q = q.eq("source", source);
      const { count: c } = await q;
      return c ?? 0;
    },
  });

  const canEnroll = emailStepCount > 0 &&
    (mode === "all" || (mode === "tag" && !!tag) || (mode === "source" && !!source));

  async function enroll() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { sequence_id: sequenceId };
      if (mode === "all") payload.scope = "all";
      else if (mode === "tag") payload.tag = tag;
      else if (mode === "source") payload.source = source;
      const { data, error } = await supabase.functions.invoke("outreach-enroll", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const enrolled = Number(data?.enrolled ?? 0);
      const skips: string[] = [];
      if (data?.skipped_already) skips.push(`${data.skipped_already} già iscritti`);
      if (data?.skipped_optout) skips.push(`${data.skipped_optout} opt-out`);
      if (data?.skipped_suppressed) skips.push(`${data.skipped_suppressed} in blocklist`);
      if (data?.skipped_no_email) skips.push(`${data.skipped_no_email} senza email`);
      if (enrolled > 0) {
        toast.success(`${enrolled} contatti iscritti a "${sequenceName}"`, {
          description: skips.length ? `Saltati: ${skips.join(", ")}.` : undefined,
        });
      } else {
        toast.info("Nessun nuovo iscritto", {
          description: skips.length ? `Saltati: ${skips.join(", ")}.` : (data?.note ?? "Nessun contatto idoneo."),
        });
      }
      if (data?.non_email_steps_skipped) {
        toast.message("Nota cadenza", { description: `${data.non_email_steps_skipped} step non-email saltati: l'invio SMS/WhatsApp non è ancora attivo.` });
      }
      setOpen(false);
      onEnrolled?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore durante l'iscrizione");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" title="Arruola contatti in questa sequenza">
          <UserPlus className="h-3.5 w-3.5" /> Arruola
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Arruola contatti — {sequenceName}</DialogTitle></DialogHeader>

        {emailStepCount === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Questa sequenza non ha ancora <strong>step email</strong>. Aggiungi almeno uno step email prima di iscrivere contatti.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Chi iscrivere</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i contattabili</SelectItem>
                  <SelectItem value="tag">Per lista (tag)</SelectItem>
                  <SelectItem value="source">Per sorgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "tag" && (
              <div className="space-y-1">
                <Label className="text-xs">Lista</Label>
                <Select value={tag} onValueChange={setTag}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={facets.isLoading ? "Carico…" : "Scegli un tag"} /></SelectTrigger>
                  <SelectContent>
                    {(facets.data?.tags ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    {facets.data && facets.data.tags.length === 0 && <SelectItem value="__none__" disabled>Nessun tag</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "source" && (
              <div className="space-y-1">
                <Label className="text-xs">Sorgente</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={facets.isLoading ? "Carico…" : "Scegli una sorgente"} /></SelectTrigger>
                  <SelectContent>
                    {(facets.data?.sources ?? []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    {facets.data && facets.data.sources.length === 0 && <SelectItem value="__none__" disabled>Nessuna sorgente</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2.5 text-sm">
              <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
              {count.isFetching ? (
                <span className="text-muted-foreground">Conteggio…</span>
              ) : count.data != null ? (
                <span><strong>≈ {count.data.toLocaleString("it-IT")}</strong> contatti contattabili</span>
              ) : (
                <span className="text-muted-foreground">Scegli un target per vedere il conteggio</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Verranno saltati automaticamente opt-out, indirizzi in blocklist e chi è già iscritto a questa sequenza.
              Il primo step parte appena entri nella finestra d'invio.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={enroll} disabled={busy || !canEnroll} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Iscrivi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
