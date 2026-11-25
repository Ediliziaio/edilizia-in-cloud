import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Bot, ChevronRight, PhoneIncoming, PhoneOutgoing, Search, Loader2, UserRound, FileText, Volume2 } from "lucide-react";
import { useCentralinoCalls } from "@/hooks/useCentralinoCalls";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { centralinoCallbackHref, centralinoHistoryFilters } from "@/lib/centralinoNavigation";
import { callElevenLabsProxy } from "@/modules/ai-agents/hooks/useElevenLabsProxy";
import { useCallTranscript } from "@/hooks/useCallTranscript";
import { useFishCallbacks } from "@/lib/fishCallbacks";
import { CallTranscript } from "./CallTranscript";
import { callStatus, type CentralinoCall } from "@/lib/centralinoCalls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { RICERCA_BARRA, TENDINA_STATO_BARRA, BOTTONE_SECONDARIO } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";
const duration=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
interface HistoryProps {
  contactId?: string | null;
  customerId?: string | null;
  phone?: string | null;
  compact?: boolean;
  agentOptions?: { id: string; nome: string }[];
}

export function CentralinoCallHistory(props: HistoryProps) {
  const companyId = useEffectiveCompanyId();
  return <CompanyCallHistory key={companyId} companyId={companyId} {...props} />;
}

function CompanyCallHistory({ companyId, contactId, customerId, phone, compact = false, agentOptions }: HistoryProps & { companyId: string | null }) {
  const tr = useT();
  const {isAdmin,canViewOrders}=usePermissions();
  const cache=useQueryClient();
  const [limit,setLimit]=useState(100);
  const [params, setParams] = useSearchParams();
  const usesUrlFilters = !compact && !!agentOptions;
  const filters = usesUrlFilters ? centralinoHistoryFilters(params) : {};
  const calls=useCentralinoCalls({contactId,customerId,phone,...filters},limit);
  const [search,setSearch]=useState("");
  const [localKind,setLocalKind]=useState("all");
  const kind = usesUrlFilters ? filters.kind || "all" : localKind;
  const selectedAgent = agentOptions?.find(agent => agent.id === filters.agentId);
  function changeAgent(value: string) {
    setLimit(100);
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const key of ["agente", "agentId", "agent"]) next.delete(key);
      if (value !== "all") {
        next.set("agente", value);
        next.delete("tipo");
      } else if (filters.agentId) {
        next.set("tipo", "ai");
      }
      return next;
    }, { replace: true });
  }
  function changeKind(value: string) {
    if (!usesUrlFilters) { setLocalKind(value); return; }
    setLimit(100);
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value === "all") next.delete("tipo");
      else next.set("tipo", value);
      if (value !== "ai") for (const key of ["agente", "agentId", "agent"]) next.delete(key);
      return next;
    }, { replace: true });
  }
  const [outcome,setOutcome]=useState("all");
  const hasFilters = kind !== "all" || outcome !== "all" || !!search.trim();
  function resetFilters() {
    setSearch("");
    setOutcome("all");
    changeKind("all");
  }
  const [selected,setSelected]=useState<CentralinoCall|null>(null);
  const [partySearch,setPartySearch]=useState("");
  const [saving,setSaving]=useState(false);
  const [tracks,setTracks]=useState<{role:string;url:string}[]>([]);
  const [audioBusy,setAudioBusy]=useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const recordingAttempt = useRef(0);
  function selectCall(call: CentralinoCall | null) {
    recordingAttempt.current += 1;
    setSelected(call);
    setTracks([]);
    setAudioBusy(false);
    setPartySearch("");
  }
  const detail=useCallTranscript(companyId, selected?.kind==="ai" ? selected.id : undefined);
  const transcript=detail.data || selected?.transcript || [];
  const callbacks=useFishCallbacks(companyId, { callId: selected?.id }, selected?.provider==="fish_audio" && !!(isAdmin || canViewOrders));
  const callback=callbacks.data?.[0];
  const recorded = selected?.audio || tracks[0]?.url;
  const parties=useQuery({queryKey:["centralino-party-search",companyId,partySearch],enabled:!!selected && isAdmin && partySearch.trim().length>=2,retry:false,queryFn:async()=>{
    const result=await callFishAgent<{parties:{id:string;kind:string;name:string;phone:string|null}[]}>(companyId!,"","search_call_parties",{query:partySearch.trim()});
    return result.parties;
  }});
  const rows=(calls.data || []).filter(c=>(kind==="all" || kind===c.kind) && (outcome==="all" || (outcome==="missed"?["Senza risposta","Occupato"].includes(callStatus(c.status)):callStatus(c.status)===outcome)) && `${c.number || ""} ${c.name} ${c.who} ${c.summary || ""}`.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it")));
  async function associate(party:any){if(!selected || !companyId)return;setSaving(true);try{await callFishAgent(companyId,selected.agentId || "","associate_call",{kind:selected.kind,call_id:selected.id,contact_id:party.kind==="contact"?party.id:null,customer_id:party.kind==="customer"?party.id:null});selectCall(null);await cache.invalidateQueries({queryKey:["centralino-calls",companyId]});toast.success(tr("Chiamata associata all’anagrafica."));}catch(e){toast.error(e instanceof Error?e.message:tr("Associazione non riuscita"));}finally{setSaving(false);}}
  async function recording() {
    if (!selected || !companyId) return;
    const attempt = ++recordingAttempt.current;
    setAudioBusy(true);
    try {
      if (selected.provider === "fish_audio") {
        const result = await callFishAgent<{tracks:{role:string;url:string|null}[];status:string}>(companyId, selected.agentId!, "call_recording", {call_id:selected.id});
        if (attempt !== recordingAttempt.current) return;
        const available = result.tracks.flatMap(track => track.url?.startsWith("https://") ? [{role:track.role,url:track.url}] : []);
        setTracks(available);
        if (!available.length) toast.info(result.status==="processing" ? tr("La registrazione è in elaborazione.") : tr("Nessuna registrazione disponibile per questa chiamata."));
      } else if (selected.elevenLabsId) {
        const result = await callElevenLabsProxy<{ audio_base64: string; content_type: string }>({
          action: "get_conversation_audio", company_id: companyId,
          payload: { conversation_id: selected.elevenLabsId },
        });
        if (attempt !== recordingAttempt.current) return;
        const format = result.content_type.split(";")[0].trim();
        if (!result.audio_base64 || !/^audio\/[a-z0-9.+-]+$/i.test(format)) throw new Error(tr("Registrazione non disponibile."));
        setTracks([{ role: "recording", url: `data:${format};base64,${result.audio_base64}` }]);
      }
    } catch (error) {
      if (attempt === recordingAttempt.current) toast.error(error instanceof Error ? error.message : tr("Registrazione non disponibile"));
    } finally {
      if (attempt === recordingAttempt.current) setAudioBusy(false);
    }
  }
  return <div className="space-y-4">
    {!compact && (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-semibold">{filters.agentId ? tr("Chiamate dell’agente") : tr("Storico chiamate")}</h2>
            {filters.agentId && <p className="mt-0.5 break-words text-sm text-muted-foreground">{selectedAgent?.nome || tr("Agente selezionato")}</p>}
          </div>
          {selectedAgent && <Button asChild variant="outline" size="sm" className={BOTTONE_SECONDARIO}>
            <Link to={`/azienda/agenti-ai/${selectedAgent.id}`}>{tr("Configura agente")}</Link>
          </Button>}
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
          <div className={cn(RICERCA_BARRA, "col-span-2 max-lg:w-full")}>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label={tr("Cerca nello storico chiamate")} value={search} onChange={event => setSearch(event.target.value)}
              placeholder={tr("Cerca numero, cliente o riepilogo…")} className="h-8 pl-8 text-xs" />
          </div>
          {agentOptions && (
            <Select value={filters.agentId || "all"} onValueChange={changeAgent}>
              <SelectTrigger aria-label={tr("Filtra per agente")} className={cn(TENDINA_STATO_BARRA, "min-w-0 max-lg:w-full")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tr("Tutti gli agenti")}</SelectItem>
                {filters.agentId && !selectedAgent && <SelectItem value={filters.agentId}>{tr("Agente selezionato")}</SelectItem>}
                {agentOptions.map(agent => <SelectItem key={agent.id} value={agent.id}>{agent.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={kind} onValueChange={changeKind}>
            <SelectTrigger aria-label={tr("Tipo chiamata")} className={cn(TENDINA_STATO_BARRA, "min-w-0 max-lg:w-full")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("Tutti i tipi")}</SelectItem>
              <SelectItem value="ai">{tr("Agenti AI")}</SelectItem>
              <SelectItem value="human">{tr("Operatori")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger aria-label={tr("Esito chiamata")} className={cn(TENDINA_STATO_BARRA, "min-w-0 max-lg:w-full")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tr("Tutti gli esiti")}</SelectItem>
              <SelectItem value="Completata">{tr("Completate")}</SelectItem>
              <SelectItem value="In corso">{tr("In corso")}</SelectItem>
              <SelectItem value="missed">{tr("Senza risposta")}</SelectItem>
              <SelectItem value="Fallita">{tr("Fallite")}</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && <Button variant="ghost" size="sm" className={BOTTONE_SECONDARIO} onClick={resetFilters}>{tr("Azzera filtri")}</Button>}
        </div>
      </div>
    )}
    {calls.isLoading ? (
      <div className="flex justify-center p-8"><Loader2 className="size-5 motion-safe:animate-spin" /></div>
    ) : calls.isError ? (
      <div role="alert" className="rounded-xl border p-4 text-sm">
        {calls.error.message}<Button variant="outline" onClick={() => calls.refetch()} className="ml-3">{tr("Riprova")}</Button>
      </div>
    ) : !rows.length ? (
      <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{tr("Nessuna chiamata per questa selezione.")}</div>
    ) : (
      <div className="eic-stagger grid gap-2">
        {rows.map(call => {
          const Icon = call.kind === "ai" ? Bot : call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
          const status = callStatus(call.status);
          const source = call.kind === "ai" ? agentOptions?.find(agent => agent.id === call.agentId)?.nome || tr("Agente AI") : tr("Operatore");
          return (
            <button key={`${call.kind}-${call.id}`} type="button" onClick={() => selectCall(call)}
              data-tone={call.kind === "human" ? "orange" : "blue"}
              className="eic-workspace-card flex w-full min-w-0 items-center gap-2.5 rounded-xl border bg-background p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 sm:gap-3">
              <span className="eic-workspace-icon !size-9"><Icon aria-hidden="true" className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{call.name || call.number || tr("Numero non disponibile")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {source} · {call.direction === "inbound" ? tr("Entrata") : tr("Uscita")} · {new Date(call.date).toLocaleString(intlCampo())}
                </span>
                {call.summary && <span className="mt-1 block truncate text-xs text-muted-foreground">{call.summary}</span>}
              </span>
              <span className="shrink-0 text-right">
                <Badge variant="outline" className="text-[10px]">{tr(status)}</Badge>
                <span className="mt-1 block text-xs tabular-nums text-muted-foreground">{duration(call.seconds)}</span>
              </span>
              <ChevronRight aria-hidden="true" className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
            </button>
          );
        })}
      </div>
    )}
    {!compact && (calls.data?.length || 0)>=limit && <Button variant="outline" onClick={()=>setLimit(n=>n+100)}>{tr("Carica altre chiamate")}</Button>}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)selectCall(null);}}><DialogContent className="eic-workspace-dialog max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-2xl"><DialogHeader><DialogTitle>{selected?.name || selected?.number || tr("Dettaglio chiamata")}</DialogTitle><DialogDescription className="sr-only">{tr("Anagrafica, registrazione e trascrizione della chiamata.")}</DialogDescription></DialogHeader>{selected && <div className="space-y-5"><p className="text-sm text-muted-foreground">{selected.number} · {tr(callStatus(selected.status))} · {duration(selected.seconds)}</p><div className="rounded-xl border p-4"><p className="mb-2 flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4"/>{tr("Anagrafica")}</p>{selected.customerId?<Link className="text-sm underline" to={`/azienda/clienti/${selected.customerId}`}>{tr("Apri scheda cliente")}</Link>:selected.contactId?<Link className="text-sm underline" to={`/azienda/marketing/contatti/${selected.contactId}${compact ? "" : "?pannello=chiamate"}`}>{tr("Apri scheda contatto")}</Link>:<p className="text-sm text-muted-foreground">{tr("Numero non associato. I numeri duplicati richiedono una scelta manuale.")}</p>}{isAdmin && <div className="mt-4 space-y-2"><Input aria-label={tr("Cerca contatto o cliente da associare")} value={partySearch} onChange={e=>setPartySearch(e.target.value)} placeholder={tr("Cerca nome o numero per associare…")}/>{parties.isError && <p role="alert" className="text-xs text-destructive">{parties.error.message}</p>}{parties.data?.map((p:any)=><Button key={`${p.kind}-${p.id}`} variant="ghost" className="h-auto w-full justify-start whitespace-normal text-left" disabled={saving} onClick={()=>associate(p)}>{p.kind==="customer"?tr("Cliente"):tr("Contatto")} · {p.name || p.phone}</Button>)}</div>}</div><div className="rounded-xl border p-4"><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Volume2 className="h-4 w-4"/>{tr("Registrazione")}</h3>{selected.audio?<audio ref={audio} controls preload="none" src={selected.audio} className="w-full"/>:(selected.provider==="fish_audio" || selected.elevenLabsId) && !tracks.length?<Button variant="outline" onClick={recording} disabled={audioBusy}>{audioBusy?tr("Caricamento…"):selected.provider==="fish_audio"?tr("Verifica registrazione Fish"):tr("Carica registrazione")}</Button>:tracks.length?null:<p className="text-sm text-muted-foreground">{tr("Registrazione non disponibile.")}</p>}{tracks.map((t, index)=><div key={t.role} className="mt-3"><p className="mb-1 text-xs text-muted-foreground">{t.role==="agent"?tr("Agente"):t.role==="user"?tr("Chiamante"):t.role==="recording"?tr("Chiamata"):tr("Operatore")}</p><audio ref={index===0?audio:undefined} controls preload="none" src={t.url} className="w-full"/></div>)}</div>{callback && <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:bg-sky-950/20"><p className="text-sm font-semibold">{tr("Richiamo confermato")}</p><Link className="mt-1 inline-block text-sm underline" to={centralinoCallbackHref(callback.id, agentOptions ? params : undefined)}>{tr("Apri richiamo")}</Link></div>}{(selected.caller || selected.called || typeof selected.cost === "number" || selected.sentiment) && <dl className="grid grid-cols-1 gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
      {selected.caller && <div><dt className="text-xs text-muted-foreground">{tr("Chiamante")}</dt><dd>{selected.caller}</dd></div>}
      {selected.called && <div><dt className="text-xs text-muted-foreground">{tr("Chiamato")}</dt><dd>{selected.called}</dd></div>}
      {typeof selected.cost === "number" && <div><dt className="text-xs text-muted-foreground">{tr("Costo")}</dt><dd>{new Intl.NumberFormat(intlCampo(),{style:"currency",currency:"EUR",maximumFractionDigits:4}).format(selected.cost)}</dd></div>}
      {selected.sentiment && <div><dt className="text-xs text-muted-foreground">{tr("Valutazione della chiamata")}</dt><dd>{selected.sentiment}</dd></div>}
    </dl>}{selected.summary && <div className="rounded-xl bg-muted/40 p-4"><h3 className="mb-2 text-sm font-semibold">{tr("Riepilogo")}</h3><p className="text-sm leading-6">{selected.summary}</p></div>}<div><h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4"/>{tr("Trascrizione")}</h3>{detail.isLoading?<p className="text-sm text-muted-foreground">{tr("Caricamento trascrizione…")}</p>:detail.isError?<div role="alert" className="text-sm">{detail.error.message}<Button variant="ghost" onClick={()=>detail.refetch()}>{tr("Riprova")}</Button></div>:<CallTranscript turns={transcript} onSeek={recorded ? time => { if (audio.current) audio.current.currentTime = time; } : undefined} />}</div></div>}</DialogContent></Dialog>
  </div>;
}
