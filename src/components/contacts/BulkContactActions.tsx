/**
 * BulkContactActions — azioni di massa sui contatti selezionati (stile GHL):
 *  - Modifica tag: aggiungi e/o rimuovi etichette su tutti i selezionati
 *  - Crea opportunità: una nuova opportunità per ogni contatto selezionato,
 *    con pipeline/fase reali, fonte, venditore e call center opzionali.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tags, DollarSign, Loader2, X } from "lucide-react";
import { TagSelector } from "@/components/marketing/TagSelector";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { queryKeys } from "@/lib/queryKeys";
import { perOgniLotto, raccogliALotti, LOTTO_RIGHE } from "@/lib/lottiDiId";

/** Quanti contatti si leggono per proporre i tag da rimuovere. */
const TAG_DA_LEGGERE = 5000;

// ── Modifica tag in blocco ──────────────────────────────────────────────────

export function BulkTagsDialog({ selectedIds }: { selectedIds: Set<string> }) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([]);
  const [tagsToRemove, setTagsToRemove] = useState<string[]>([]);

  const ids = useMemo(() => [...selectedIds], [selectedIds]);
  // Con «Seleziona tutti» gli id sono decine di migliaia: leggerli tutti solo
  // per proporre i tag da togliere costerebbe cinquanta richieste a ogni
  // apertura. Si guardano i primi cinquemila e lo si dice.
  const idsPerTag = useMemo(() => ids.slice(0, TAG_DA_LEGGERE), [ids]);
  const tagTroncati = ids.length > idsPerTag.length;

  // Tag attualmente presenti sui selezionati (per la sezione "rimuovi")
  const { data: existingTags = [] } = useQuery({
    // La chiave non contiene l'elenco: react-query la serializza a ogni
    // render, e 25.000 id sono quasi un megabyte di JSON per volta.
    queryKey: ["bulk-selected-tags", effectiveCompany?.id, idsPerTag.length, idsPerTag[0], idsPerTag[idsPerTag.length - 1]],
    enabled: open && ids.length > 0 && !!effectiveCompany?.id,
    queryFn: async () => {
      const righe = await raccogliALotti(idsPerTag, async (lotto) => {
        const { data, error } = await supabase
          .from("marketing_contacts")
          .select("tags")
          .eq("company_id", effectiveCompany!.id)
          .in("id", lotto);
        if (error) throw error;
        return data ?? [];
      });
      const all = new Set<string>();
      for (const row of righe) for (const t of row.tags ?? []) all.add(t);
      return [...all].sort();
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const rows = await raccogliALotti(ids, async (lotto) => {
        const { data, error } = await supabase
          .from("marketing_contacts")
          .select("id, tags")
          .eq("company_id", effectiveCompany!.id)
          .in("id", lotto);
        if (error) throw error;
        return data ?? [];
      });

      // Stessi tag di partenza, stesso risultato: si raggruppa e si fa un
      // update per gruppo invece di uno per contatto. Su 25.000 selezionati
      // erano 25.000 richieste, adesso sono una manciata.
      const gruppi = new Map<string, { next: string[]; ids: string[] }>();
      for (const row of rows) {
        const current: string[] = row.tags ?? [];
        const next = [...new Set([...current.filter((t) => !tagsToRemove.includes(t)), ...tagsToAdd])];
        // Salta gli invariati: niente update inutili su selezioni grandi
        if (next.length === current.length && next.every((t) => current.includes(t))) continue;
        const chiave = [...next].sort().join("\u0000");
        const gruppo = gruppi.get(chiave) ?? { next, ids: [] };
        gruppo.ids.push(row.id);
        gruppi.set(chiave, gruppo);
      }

      let aggiornati = 0;
      try {
        for (const gruppo of gruppi.values()) {
          await perOgniLotto(gruppo.ids, async (lotto) => {
            const { error: upErr } = await supabase
              .from("marketing_contacts")
              .update({ tags: gruppo.next, updated_at: new Date().toISOString() })
              .eq("company_id", effectiveCompany!.id)
              .in("id", lotto);
            if (upErr) throw upErr;
            aggiornati += lotto.length;
          });
        }
      } catch (errore) {
        // A lotti si può fallire a metà: i tag già scritti restano scritti.
        const causa = errore instanceof Error ? errore.message : String(errore);
        throw new Error(
          aggiornati > 0 ? `Tag aggiornati su ${aggiornati} contatti, poi si è fermato: ${causa}` : causa,
          { cause: errore },
        );
      }
      return aggiornati;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      toast.success(n === 0 ? "Nessun contatto da aggiornare: avevano già questi tag" : `Tag aggiornati su ${n} contatti`);
      setOpen(false);
      setTagsToAdd([]);
      setTagsToRemove([]);
    },
    onError: (e) => toast.error("Errore aggiornamento tag", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Tags className="h-3.5 w-3.5" /> Modifica tag
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Modifica tag in blocco</DialogTitle>
            <DialogDescription className="text-xs">
              {ids.length} contatt{ids.length === 1 ? "o" : "i"} selezionat{ids.length === 1 ? "o" : "i"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Aggiungi tag</Label>
              <TagSelector selectedTags={tagsToAdd} onTagsChange={setTagsToAdd} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Rimuovi tag</Label>
              {existingTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun tag presente sui contatti selezionati.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {existingTags.map((t) => {
                    const marked = tagsToRemove.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTagsToRemove((prev) => marked ? prev.filter((x) => x !== t) : [...prev, t])}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          marked
                            ? "border-red-300 bg-red-50 text-red-700 line-through"
                            : "bg-muted/40 hover:bg-muted"
                        }`}
                      >
                        {t}
                        {marked && <X className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {tagTroncati && (
                <p className="text-[11px] text-muted-foreground">
                  Tag visti nei primi {TAG_DA_LEGGERE.toLocaleString("it-IT")} contatti selezionati; la rimozione vale comunque su tutti e {ids.length.toLocaleString("it-IT")}.
                </p>
              )}
              {tagsToRemove.length > 0 && (
                <p className="text-[11px] text-red-600">{tagsToRemove.length} tag verranno rimossi dai contatti selezionati.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || (tagsToAdd.length === 0 && tagsToRemove.length === 0)}
              className="gap-1.5"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Applica a {ids.length} contatti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Crea opportunità in blocco ──────────────────────────────────────────────

export function BulkCreateOpportunitiesDialog({ selectedIds }: { selectedIds: Set<string> }) {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [source, setSource] = useState("");
  const [value, setValue] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [callCenterId, setCallCenterId] = useState("");

  const ids = useMemo(() => [...selectedIds], [selectedIds]);
  const companyId = effectiveCompany?.id;

  const { data: pipelines = [] } = useQuery({
    queryKey: ["bulk-opp-pipelines", companyId],
    enabled: open && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipelines")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["bulk-opp-stages", pipelineId],
    enabled: open && !!pipelineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipeline_stages")
        .select("id, name")
        .eq("pipeline_id", pipelineId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: staffUsers = [] } = useCompanyStaffUsers(open ? companyId : undefined);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (!pipelineId || !stageId) throw new Error("Seleziona pipeline e fase");
      const contacts = await raccogliALotti(ids, async (lotto) => {
        const { data, error } = await supabase
          .from("marketing_contacts")
          .select("id, first_name, last_name")
          .eq("company_id", companyId)
          .in("id", lotto);
        if (error) throw error;
        return data ?? [];
      });

      const numValue = Number(value.replace(",", ".")) || 0;
      const rows = contacts.map((c) => ({
        company_id: companyId,
        contact_id: c.id,
        pipeline_id: pipelineId,
        stage_id: stageId,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Nuova opportunità",
        value: numValue,
        status: "open",
        source: source.trim() || null,
        assigned_to: assignedTo || null,
        call_center_id: callCenterId || null,
      }));
      await perOgniLotto(rows, async (lotto) => {
        const { error: insErr } = await supabase.from("marketing_opportunities").insert(lotto);
        if (insErr) throw insErr;
      }, LOTTO_RIGHE);
      return rows.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      toast.success(`${n} opportunità create`, { description: "Le trovi nella pipeline selezionata." });
      setOpen(false);
    },
    onError: (e) => toast.error("Errore creazione opportunità", { description: e instanceof Error ? e.message : String(e) }),
  });

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <DollarSign className="h-3.5 w-3.5" /> Crea opportunità
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Crea opportunità in blocco</DialogTitle>
            <DialogDescription className="text-xs">
              Una nuova opportunità per ognuno dei {ids.length} contatti selezionati.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Pipeline <span className="text-destructive">*</span></Label>
                <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId(""); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fase <span className="text-destructive">*</span></Label>
                <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Seleziona…" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fonte</Label>
                <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Es: facebook" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valore (€)</Label>
                <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Venditore</Label>
                <Select value={assignedTo || "__none__"} onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuno</SelectItem>
                    {staffUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Call center</Label>
                <Select value={callCenterId || "__none__"} onValueChange={(v) => setCallCenterId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuno</SelectItem>
                    {staffUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Il nome di ogni opportunità sarà il nome del contatto.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !pipelineId || !stageId}
              className="gap-1.5"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Crea {ids.length} opportunità
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
