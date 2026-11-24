import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { lazy, Suspense, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { agganciaSopralluogo, listSurveysByOrder, sopralluoghiDaAgganciare, updateSurvey } from "@/lib/api/surveys";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardCheck, Plus, CalendarDays, Loader2, ArrowRightLeft, Link2, Search } from "lucide-react";
import { OfficeSelect } from "./OfficeSelect";
import { RiquadroCommessa, StatoPill, TabellaCommessa, type ColonnaTabella, type TonoStato } from "./TabellaCommessa";
import { orderVisits, VISIT_GROUPS, type OrderVisit, type VisitGroup, type OrderSurveyContext } from "@/lib/surveys/orderVisits";
import type { AppointmentData } from "@/components/appointments/AppointmentDialog";
import type { SurveyRow } from "@/types/surveys";

const PortaRilievoDialog = lazy(() => import("./PortaRilievoDialog").then(m => ({ default: m.PortaRilievoDialog })));
const SurveyDetailDialog = lazy(() => import("@/components/sopralluoghi/SurveyDetailDialog").then(m => ({ default: m.SurveyDetailDialog })));
const CreateDialog = lazy(() => import("./OrderSurveyCreateDialog").then(m => ({default:m.OrderSurveyCreateDialog})));
const AppointmentDialog = lazy(() => import("@/components/appointments/AppointmentDialog").then(m => ({default:m.AppointmentDialog})));
const PianificaDialog = lazy(() => import("@/components/sopralluoghi/PianificaSopralluogoDialog").then(m => ({default:m.PianificaSopralluogoDialog})));
const TONES: Record<Exclude<VisitGroup,"tutti">,TonoStato> = {da_fissare:"grigio",fissati:"blu",in_corso:"ambra",effettuati:"verde",annullati:"rosso",archiviati:"grigio"};
const LABELS: Record<Exclude<VisitGroup,"tutti">,string> = {da_fissare:"Da fissare",fissati:"Fissato",in_corso:"In corso",effettuati:"Effettuato",annullati:"Annullato",archiviati:"Archiviato"};
const giorno = (value: string | null | undefined, time = false) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return "Da definire";
  return format(new Date(value), time ? "d MMM yyyy · HH:mm" : "d MMM yyyy", {locale:it});
};
interface Props { orderId: string; orderCode?: string | null; clientId?: string | null; clientName?: string | null; address?: string | null }

/** Agenda e rilievi originali della commessa, senza duplicare le visite già collegate. */
export function OrderSurveysCard({orderId, orderCode, clientId, clientName, address}: Props) {
  const { solaLettura, canViewSopralluoghi, canViewOrders, canEditOrders } = usePermissions();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const writable = !solaLettura && !!companyId;
  const [selected, setSelected] = useState<{id:string;edit:boolean}|null>(null);
  const [daPortare, setDaPortare] = useState<string|null>(null);
  const [daPianificare, setDaPianificare] = useState<SurveyRow|null>(null);
  const [creation, setCreation] = useState<OrderSurveyContext|null>(null);
  const [calendar, setCalendar] = useState<{appointment:AppointmentData|null}|null>(null);
  const [filter, setFilter] = useState<VisitGroup>("tutti");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recenti");
  const context: OrderSurveyContext = {orderId,orderCode,clientId,clientName,address};
  const surveys = useQuery({queryKey:["order-surveys",orderId,companyId], enabled:!!companyId && canViewSopralluoghi,
    queryFn:()=>listSurveysByOrder(orderId,companyId!),staleTime:30_000});
  // Stessa chiave e stessi dati dell'agenda nella Panoramica: le due viste si aggiornano insieme.
  const agenda = useQuery({queryKey:["order-appointments",orderId,companyId],enabled:!!companyId && canViewSopralluoghi,staleTime:60_000,
    queryFn:async ():Promise<AppointmentData[]> => {
      const rows:AppointmentData[]=[];
      for(let offset=0;;offset+=500) {
        const {data,error}=await supabase.from("appointments").select("*").eq("company_id",companyId!).eq("order_id",orderId)
          .order("appointment_date").order("id").range(offset,offset+499);
        if(error) throw error;
        rows.push(...(data??[]));
        if((data?.length??0)<500) return rows;
      }
    }});
  const staff = useCompanyStaffUsers(canViewSopralluoghi ? companyId : null);
  const people = new Map((staff.data??[]).map(p=>[p.id,[p.first_name,p.last_name].filter(Boolean).join(" ")]));
  const daAgganciare = useQuery({queryKey:["order-surveys-da-agganciare",orderId,companyId],
    queryFn:()=>sopralluoghiDaAgganciare(orderId),enabled:!!companyId && canViewSopralluoghi && canViewOrders && canEditOrders && !solaLettura,staleTime:30_000});
  const aggiorna = () => {
    for (const key of [["order-surveys",orderId],["order-surveys-da-agganciare",orderId],["order-appointments",orderId],["sopralluoghi-bacheca"]]) void qc.invalidateQueries({queryKey:key});
  };
  const aggancia = useMutation({mutationFn:(id:string)=>agganciaSopralluogo(id,orderId),onSuccess:()=>{aggiorna();toast.success("Sopralluogo collegato alla commessa");},onError:(e:Error)=>toast.error(e.message || "Sopralluogo non collegato")});
  const ruolo = useMutation({mutationFn:(p:{id:string;ruolo:"preliminare"|"definitivo"|null})=>updateSurvey(p.id,{ruolo_misure:p.ruolo}),onSuccess:aggiorna,onError:()=>toast.error("Tipo di misure non aggiornato")});
  const visits = orderVisits(surveys.data??[],agenda.data??[]);
  const counts = Object.fromEntries(VISIT_GROUPS.map(([key])=>[key,key==="tutti" ? visits.length : visits.filter(v=>v.group===key).length]));
  const visible = visits.filter(v=>(filter==="tutti" || v.group===filter) && `${v.code} ${v.address} ${people.get(v.technicianId||"")||""}`.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it")));
  if(sort==="prossimi") visible.sort((a,b)=>String(a.when||"9999").localeCompare(String(b.when||"9999")));
  const openVisit = (v:OrderVisit) => v.survey ? setSelected({id:v.survey.id,edit:false}) : setCalendar({appointment:v.appointment!});
  const columns:ColonnaTabella<OrderVisit>[] = [
    {titolo:"Sopralluogo",principale:true,cella:v=><div><button type="button" aria-haspopup="dialog" className="text-left font-medium text-primary hover:underline" onClick={()=>openVisit(v)}>{v.code}</button><p className="mt-1 text-xs text-muted-foreground">{v.survey ? (v.survey.tipo === "commerciale" ? "Sopralluogo commerciale" : "Rilievo tecnico") : "Appuntamento · rilievo da compilare"}</p></div>},
    {titolo:"Stato",cella:v=><div><StatoPill tono={TONES[v.group]}>{LABELS[v.group]}</StatoPill>{v.survey?.status==="signed" && <p className="mt-1 text-xs text-muted-foreground">Firmato</p>}</div>},
    {titolo:"Data e tecnico",cella:v=><div className="space-y-1"><p>{giorno(v.when,v.appointment ? !!v.appointment.appointment_time : !!v.survey?.scheduled_at)}</p>{v.survey?.completed_at && <p className="text-xs text-muted-foreground">Effettuato il {giorno(v.survey.completed_at)}</p>}<p className="text-xs text-muted-foreground">{v.technicianId ? people.get(v.technicianId)||"Tecnico assegnato" : "Tecnico da assegnare"}</p></div>},
    {titolo:"Cantiere",cella:v=><span className="text-xs text-muted-foreground">{v.address || address || "Indirizzo da completare"}</span>},
    {titolo:"Misure",cella:v=>v.survey ? <OfficeSelect label={`Tipo di misure del sopralluogo ${v.code}`} className="h-9 w-[118px] min-w-[118px] px-2 text-xs" disabled={!writable || ruolo.isPending} value={v.survey.ruolo_misure??""} onValueChange={value=>ruolo.mutate({id:v.survey!.id,ruolo:(value||null) as "preliminare"|"definitivo"|null})} options={[{value:"",label:"Non indicate"},{value:"preliminare",label:"Preliminari"},{value:"definitivo",label:"Definitive"}]} /> : <span className="text-xs text-muted-foreground">Da rilevare</span>},
    {titolo:"Azioni",destra:true,cella:v=><div className="flex flex-wrap justify-end gap-1.5">
      <Button size="sm" variant="outline" onClick={()=>openVisit(v)}>{v.survey ? "Apri" : writable && canEditOrders ? "Appuntamento" : "Dettagli"}</Button>
      {writable && v.group!=="annullati" && v.group!=="archiviati" && <Button size="sm" variant="outline" onClick={()=>v.survey ? setSelected({id:v.survey.id,edit:true}) : setCreation({...context,appointment:v.appointment})}>{v.survey ? "Compila" : "Compila rilievo"}</Button>}
      {writable && canEditOrders && v.survey && ["da_fissare","fissati"].includes(v.group) && <Button size="sm" variant="ghost" onClick={()=>setDaPianificare(v.survey!)}>{v.when ? "Sposta" : "Pianifica"}</Button>}
      {writable && canEditOrders && v.survey && <Button size="sm" variant="ghost" title="Porta le misure in commessa" aria-label={`Porta le misure di ${v.code} in commessa`} onClick={()=>setDaPortare(v.survey!.id)}><ArrowRightLeft className="h-4 w-4" /></Button>}
    </div>},
  ];
  if(!canViewSopralluoghi) return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Per consultare i rilievi serve il permesso «Sopralluoghi».</p>;
  return <RiquadroCommessa icona={<ClipboardCheck className="h-4 w-4 text-orange-500" />} titolo="Rilievi e sopralluoghi" conteggio={visits.length}
    azioni={<><Button size="sm" variant="outline" disabled={!writable || !canEditOrders} onClick={()=>setCalendar({appointment:null})}><CalendarDays className="mr-1.5 h-4 w-4" />Fissa sopralluogo</Button><Button size="sm" disabled={!writable} onClick={()=>setCreation(context)}><Plus className="mr-1.5 h-4 w-4" />Nuovo sopralluogo</Button></>}>
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Stato dei sopralluoghi">{VISIT_GROUPS.map(([key,label])=><Button key={key} size="sm" variant={filter===key ? "default" : "ghost"} aria-pressed={filter===key} aria-label={`${label}: ${counts[key]} ${counts[key] === 1 ? "sopralluogo" : "sopralluoghi"}`} onClick={()=>setFilter(key)}>{label}<span className="ml-2 text-xs opacity-70">{counts[key]}</span></Button>)}</div>
      <div className="flex flex-wrap gap-2"><div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Cerca sopralluoghi della commessa" placeholder="Cerca codice, cantiere o tecnico…" className="pl-9" value={search} onChange={e=>setSearch(e.target.value)} /></div><OfficeSelect label="Ordina sopralluoghi" className="w-full shrink-0 sm:w-48" value={sort} onValueChange={setSort} options={[{value:"recenti",label:"Più recenti"},{value:"prossimi",label:"Prima i meno recenti"}]} /></div>
      {(surveys.isLoading || agenda.isLoading) && <p role="status" className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carico agenda e rilievi…</p>}
      {(surveys.isError || agenda.isError) && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{surveys.isError ? "Rilievi non disponibili." : "Agenda non disponibile."} L'elenco potrebbe essere incompleto.<Button size="sm" variant="outline" onClick={()=>{void surveys.refetch();void agenda.refetch();}}>Riprova</Button></div>}
      {visible.length>0 && <TabellaCommessa etichetta="Sopralluoghi della commessa" colonne={columns} righe={visible} chiave={v=>v.id} />}
      {!surveys.isLoading && !agenda.isLoading && visible.length===0 && <div className="rounded-lg border border-dashed p-6 text-center"><p className="text-sm font-medium">{visits.length || search || filter!=="tutti" ? "Nessun sopralluogo con questi filtri" : surveys.isError || agenda.isError ? "Nessun sopralluogo nei dati disponibili" : "Non ci sono ancora sopralluoghi"}</p><p className="mt-1 text-xs text-muted-foreground">Fissa una visita in agenda o crea il rilievo per compilare misure, foto e note.</p>{(search || filter!=="tutti") && <Button variant="link" size="sm" onClick={()=>{setSearch("");setFilter("tutti");}}>Azzera filtri</Button>}</div>}
      {canEditOrders && writable && !!daAgganciare.data?.length && <details className="rounded-lg border border-dashed p-3"><summary className="cursor-pointer text-sm font-medium">Sopralluoghi del cliente da collegare ({daAgganciare.data.length})</summary><div className="mt-3 space-y-2">{daAgganciare.data.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{s.code || "Sopralluogo"} · {giorno(s.completed_at??s.created_at)}</span><Button size="sm" variant="outline" disabled={aggancia.isPending} onClick={()=>aggancia.mutate(s.id)}><Link2 className="mr-1 h-3.5 w-3.5" />Collega</Button></div>)}</div></details>}
    </div>
    <Suspense fallback={<p role="status" className="p-4 text-sm text-muted-foreground">Apro la finestra…</p>}>
      {daPortare && <PortaRilievoDialog surveyId={daPortare} orderId={orderId} onClose={()=>setDaPortare(null)} />}
      {selected && <SurveyDetailDialog key={`${companyId}:${orderId}:${selected.id}`} surveyId={selected.id} orderId={orderId} initialEditing={selected.edit} onClose={()=>{setSelected(null);aggiorna();}} />}
      {creation && companyId && <CreateDialog key={`${companyId}:${orderId}:${creation.appointment?.id||"nuovo"}`} companyId={companyId} commessa={creation} onClose={()=>setCreation(null)} onCreated={id=>{setCreation(null);aggiorna();setSelected({id,edit:true});}} />}
      {calendar && <AppointmentDialog open onOpenChange={open=>{if(!open)setCalendar(null);}} appointment={calendar.appointment} onSaved={aggiorna} onDeleted={aggiorna} defaultOrderId={orderId} showOrderSelect={false} defaultAppointmentType="rilievo_tecnico" riferimentoTitolo={orderCode} defaultAddress={address} requireTime hideMarketingFields readOnly={!writable || !canEditOrders} dialogHeading={calendar.appointment ? "Appuntamento del sopralluogo" : "Fissa un sopralluogo"} />}
      {daPianificare && <PianificaDialog sopralluogo={daPianificare} onClose={()=>{setDaPianificare(null);aggiorna();}} />}
    </Suspense>
  </RiquadroCommessa>;
}
