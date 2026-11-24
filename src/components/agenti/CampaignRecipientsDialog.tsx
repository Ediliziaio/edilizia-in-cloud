import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { campaignPreparationRequest, readPreparedCampaignRecipients, type PreparedCampaignRecipients } from "@/lib/campaignPreparation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface Contact { id: string; nome: string; telefono: string | null; exclusion: string | null }
interface Props {
  companyId: string;
  campaign: { id: string; nome: string; aggiornato_il: string; metadata?: { preparazione_destinatari?: PreparedCampaignRecipients } | null };
  onClose: () => void;
}
export function CampaignRecipientsDialog({ companyId, campaign, onClose }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(readPreparedCampaignRecipients(campaign.metadata)?.recipients.map(r => r.contact_id) || []));
  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(search); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const contacts = useQuery({
    queryKey: ["ai-campaign-contacts", companyId, debounced, page],
    queryFn: () => campaignPreparationRequest<{ contacts: Contact[]; has_more: boolean }>(companyId, "campaign_contacts", { search: debounced, page }),
    retry: false,
  });
  const save = useMutation({
    mutationFn: () => campaignPreparationRequest<{ prepared: number; excluded: { reason: string }[] }>(companyId, "prepare_campaign", {
      campaign_id: campaign.id, updated_at: campaign.aggiornato_il, contact_ids: [...selected],
    }),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2", companyId] });
      if (!mounted.current) return;
      toast.success(t("{prepared} destinatari preparati. Nessuna chiamata avviata.", { prepared: String(result.prepared ?? "") }));
      if (result.excluded.length) toast.warning(t("{n} contatti esclusi: {motivi}", { n: result.excluded.length, motivi: [...new Set(result.excluded.map(e => e.reason))].join("; ") }));
      onClose();
    },
    onError: (error: Error) => { if (mounted.current) toast.error(error.message); },
  });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>{t("Destinatari — {nome}", { nome: String(campaign.nome ?? "") })}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{t("Seleziona contatti CRM con consenso marketing registrato. Numeri duplicati ed esclusioni sono ricontrollati al salvataggio. Questa lista prepara la bozza, non una coda di chiamate.")}</p>
      <Input aria-label={t("Cerca destinatari CRM")} placeholder={t("Cerca nome, cognome o telefono…")} value={search} onChange={e => setSearch(e.target.value)} disabled={save.isPending} />
      <div className="flex justify-between items-center text-sm"><span>{t("{size} selezionati · massimo 500", { size: String(selected.size ?? "") })}</span>
        <Button variant="ghost" disabled={save.isPending || !selected.size} onClick={() => setSelected(new Set())}>{t("Svuota selezione")}</Button></div>
      {contacts.isError ? <div role="alert" className="text-sm">{contacts.error.message}<Button variant="outline" className="ml-2" onClick={() => contacts.refetch()}>{t("Riprova")}</Button></div>
        : contacts.isLoading ? <p role="status">{t("Caricamento contatti…")}</p>
        : <div className="max-h-80 overflow-y-auto divide-y rounded-md border">
          {contacts.data?.contacts?.length ? contacts.data.contacts.map(c => <label key={c.id} className="flex items-start gap-3 p-3 text-sm">
            <Checkbox aria-label={t("Seleziona {nome}", { nome: c.nome || c.telefono || t("contatto") })} checked={selected.has(c.id)}
              disabled={save.isPending || (!!c.exclusion && !selected.has(c.id)) || (!selected.has(c.id) && selected.size >= 500)}
              onCheckedChange={value => setSelected(previous => { const next = new Set(previous); if (value === true) next.add(c.id); else next.delete(c.id); return next; })} />
            <span><span className="font-medium">{c.nome || t("Senza nome")}</span><span className="block text-muted-foreground">{c.telefono || t("Senza telefono")}</span>
              {c.exclusion && <span className="block text-amber-700">{c.exclusion}</span>}</span>
          </label>) : <p className="p-4 text-sm text-muted-foreground">{t("Nessun contatto trovato. Prova un'altra ricerca.")}</p>}
        </div>}
      <div className="flex justify-between items-center"><Button variant="outline" disabled={!page || contacts.isFetching || save.isPending} onClick={() => setPage(p => p - 1)}>{t("Precedenti")}</Button>
        <span className="text-xs">{t("Pagina {page}", { page: page + 1 })}</span><Button variant="outline" disabled={!contacts.data?.has_more || contacts.isFetching || save.isPending} onClick={() => setPage(p => p + 1)}>{t("Successivi")}</Button></div>
      <p className="text-xs text-muted-foreground">{t("I dati preparati sono una fotografia. Prima di un futuro invio dovranno essere ricontrollati consenso, esclusioni, disponibilità dell'agente, numero e crediti.")}</p>
      {save.isError && <div role="alert" className="text-sm">{save.error.message}
        <Button variant="outline" className="ml-2" onClick={() => { queryClient.invalidateQueries({ queryKey: ["ai-campaigns-v2", companyId] }); onClose(); }}>{t("Ricarica la bozza")}</Button></div>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={save.isPending} onClick={onClose}>{t("Annulla")}</Button>
        <Button disabled={save.isPending || contacts.isError || contacts.isLoading} onClick={() => save.mutate()}>{save.isPending ? t("Salvataggio…") : t("Salva destinatari")}</Button></div>
    </DialogContent>
  </Dialog>;
}
