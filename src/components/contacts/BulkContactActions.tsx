/**
 * BulkContactActions — azioni di massa sui contatti selezionati (stile GHL):
 *  - Modifica tag: aggiungi e/o rimuovi etichette su tutti i selezionati
 *  - Crea opportunità: una nuova opportunità per ogni contatto selezionato,
 *    con pipeline/fase reali, fonte, venditore e call center opzionali.
 */
import { useMemo, useRef, useState } from "react";
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
import { refreshCrmContacts } from "@/lib/refreshCrmContacts";
import { perOgniLotto, raccogliALotti } from "@/lib/lottiDiId";
import { improntaOpportunitaInBlocco, salvaOpportunitaInBlocco } from "@/lib/marketing/opportunitaInBlocco";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

/** Quanti contatti si leggono per proporre i tag da rimuovere. */
const TAG_DA_LEGGERE = 5000;

// ── Modifica tag in blocco ──────────────────────────────────────────────────

export function BulkTagsDialog({ selectedIds }: { selectedIds: Set<string> }) {
  const tr = useT();
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
        const causa = messaggioErrore(errore);
        throw new Error(
          aggiornati > 0 ? tr("Tag aggiornati su {n} contatti, poi si è fermato: {causa}", { n: aggiornati, causa }) : causa,
          { cause: errore },
        );
      }
      return aggiornati;
    },
    onSuccess: (n) => {
      void refreshCrmContacts(qc, effectiveCompany?.id);
      toast.success(n === 0 ? tr("Nessun contatto da aggiornare: avevano già questi tag") : tr("Tag aggiornati su {n} contatti", { n }));
      setOpen(false);
      setTagsToAdd([]);
      setTagsToRemove([]);
    },
    onError: (e) => toast.error(tr("Errore aggiornamento tag"), { description: messaggioErrore(e) }),
  });

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Tags className="h-3.5 w-3.5" /> {tr("Modifica tag")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{tr("Modifica tag in blocco")}</DialogTitle>
            <DialogDescription className="text-xs">
              {(ids.length === 1 ? tr("{n} contatto selezionato", { n: ids.length }) : tr("{n} contatti selezionati", { n: ids.length }))}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{tr("Aggiungi tag")}</Label>
              <TagSelector selectedTags={tagsToAdd} onTagsChange={setTagsToAdd} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{tr("Rimuovi tag")}</Label>
              {existingTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">{tr("Nessun tag presente sui contatti selezionati.")}</p>
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
                <p className="text-[11px] text-muted-foreground">{tr("Tag visti nei primi {max} contatti selezionati; la rimozione vale comunque su tutti e {n}.", { max: TAG_DA_LEGGERE.toLocaleString(intlCampo()), n: ids.length.toLocaleString(intlCampo()) })}</p>
              )}
              {tagsToRemove.length > 0 && (
                <p className="text-[11px] text-red-600">{tr("{n} tag verranno rimossi dai contatti selezionati.", { n: tagsToRemove.length })}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{tr("Annulla")}</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || (tagsToAdd.length === 0 && tagsToRemove.length === 0)}
              className="gap-1.5"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {tr("Applica a {n} contatti", { n: ids.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Crea opportunità in blocco ──────────────────────────────────────────────

export function BulkCreateOpportunitiesDialog({ selectedIds }: { selectedIds: Set<string> }) {
  const t = useT();
  const { effectiveCompany, user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pipelineId, setPipelineId] = useState("");
  const [stageId, setStageId] = useState("");
  const [source, setSource] = useState("");
  const [value, setValue] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [callCenterId, setCallCenterId] = useState("");
  const operazioniInCorso = useRef(new Map<string, string>());

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
      if (!companyId || !user?.id) throw new Error(t("Sessione aziendale non disponibile"));
      if (!pipelineId || !stageId) throw new Error(t("Seleziona pipeline e fase"));
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
      const fonte = source.trim() || null;
      const impronta = await improntaOpportunitaInBlocco(JSON.stringify([
        pipelineId, stageId, fonte, numValue, assignedTo, callCenterId, [...ids].sort(),
      ]));
      const chiave = `crm:opportunita-in-blocco:${companyId}:${user.id}:${impronta}`;
      let operazione = operazioniInCorso.current.get(chiave);
      if (!operazione) {
        try { operazione = sessionStorage.getItem(chiave) ?? undefined; } catch { /* Il tentativo resta in memoria. */ }
        operazione ??= crypto.randomUUID();
        operazioniInCorso.current.set(chiave, operazione);
        try { sessionStorage.setItem(chiave, operazione); } catch { /* Il tentativo resta in memoria. */ }
      }
      const rows = contacts.map((c) => ({
        company_id: companyId,
        contact_id: c.id,
        pipeline_id: pipelineId,
        stage_id: stageId,
        name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Nuova opportunità",
        value: numValue,
        status: "open",
        source: fonte,
        assigned_to: assignedTo || null,
        call_center_id: callCenterId || null,
      }));
      const confermate = await salvaOpportunitaInBlocco(companyId, rows, operazione);
      operazioniInCorso.current.delete(chiave);
      try { sessionStorage.removeItem(chiave); } catch { /* Il salvataggio è già confermato. */ }
      return { confermate, richieste: ids.length };
    },
    onSuccess: ({ confermate, richieste }) => {
      qc.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      qc.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      qc.invalidateQueries({ queryKey: queryKeys.marketing.all });
      if (confermate < richieste) toast.info(t("{confermate} opportunità create su {richieste} contatti", { confermate: String(confermate ?? ""), richieste: String(richieste ?? "") }));
      else toast.success(t("{confermate} opportunità create", { confermate: String(confermate ?? "") }), { description: t("Le trovi nella pipeline selezionata.") });
      setOpen(false);
    },
    onError: (e) => toast.error(t("Salvataggio interrotto"), {
      description: e && typeof e === "object" && "message" in e && typeof e.message === "string"
        ? t("{message} Puoi riprovare con gli stessi dati.", { message: String(e.message ?? "") })
        : t("Puoi riprovare con gli stessi dati."),
    }),
  });

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <DollarSign className="h-3.5 w-3.5" /> {t("Crea opportunità")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{t("Crea opportunità in blocco")}</DialogTitle>
            <DialogDescription className="text-xs">{t("Una nuova opportunità per ognuno dei {n} contatti selezionati.", { n: ids.length })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("Pipeline")} <span className="text-destructive">*</span></Label>
                <Select value={pipelineId} onValueChange={(v) => { setPipelineId(v); setStageId(""); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("Seleziona…")} /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Fase")} <span className="text-destructive">*</span></Label>
                <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("Seleziona…")} /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("Fonte")}</Label>
                <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder={t("Es: facebook")} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Valore (€)")}</Label>
                <Input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0" className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("Venditore")}</Label>
                <Select value={assignedTo || "__none__"} onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("Nessuno")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("Nessuno")}</SelectItem>
                    {staffUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Call center")}</Label>
                <Select value={callCenterId || "__none__"} onValueChange={(v) => setCallCenterId(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder={t("Nessuno")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("Nessuno")}</SelectItem>
                    {staffUsers.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {t("Il nome di ogni opportunità sarà il nome del contatto.")}
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("Annulla")}</Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || !pipelineId || !stageId}
              className="gap-1.5"
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("Crea {n} opportunità", { n: ids.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
