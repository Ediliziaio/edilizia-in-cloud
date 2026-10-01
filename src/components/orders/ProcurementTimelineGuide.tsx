import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MONDAY_FRIDAY, todayInRome } from "@/lib/orders/civilDate";
import { planProcurementTimeline } from "@/lib/orders/procurementTimeline";
import type { ProcurementItem } from "@/lib/orders/materialProcurement";

const dateLabel = (date: string | null) => date ? date.split("-").reverse().join("/") : "Da definire";
const days = (raw: string) => raw.trim() === "" ? null : Number(raw);

export function ProcurementTimelineGuide({ items, requiredOnSite }: { items: ProcurementItem[]; requiredOnSite?: string | null }) {
  const [selectedId, setSelectedId] = useState("");
  const item = items.find(i => i.id && i.id === selectedId) ?? items.find(i => i.id);
  if (!item) return null;
  return <details className="rounded-lg border p-4">
    <summary className="cursor-pointer text-sm font-medium">Quando ordinare: simula la fornitura</summary>
    <p className="my-2 text-sm text-muted-foreground">Simula un nuovo fabbisogno dopo aver controllato gli OdA esistenti. La data proposta viene dalla commessa: correggila con la data d’uso del singolo materiale nella sua fase. La firma da sola non avvia la produzione del fornitore.</p>
    <Label htmlFor="timeline-article">Articolo</Label>
    <select id="timeline-article" className="my-2 w-full rounded-md border bg-background p-2 text-sm" value={item.id ?? ""} onChange={e => setSelectedId(e.target.value)}>
      {items.filter(i => i.id).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
    </select>
    <TimelineScenario key={`${item.id}:${item.supplier_id ?? ""}`} item={item} requiredOnSite={requiredOnSite} />
  </details>;
}

function TimelineScenario({ item, requiredOnSite }: { item: ProcurementItem; requiredOnSite?: string | null }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const supplier = useQuery({
    queryKey: ["supplier-timeline-guide", companyId, item.supplier_id],
    enabled: !!companyId && !!item.supplier_id && !item.stock_item_id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("name, lead_time_days")
        .eq("company_id", companyId!).eq("id", item.supplier_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const [contractDate, setContractDate] = useState("");
  const [requiredDate, setRequiredDate] = useState(requiredOnSite ?? "");
  const [gateDate, setGateDate] = useState("");
  const [minOverride, setMinOverride] = useState<string | null>(null);
  const [maxOverride, setMaxOverride] = useState<string | null>(null);
  const [workingDays, setWorkingDays] = useState(false);
  const [buffer, setBuffer] = useState("0");
  const [logistics, setLogistics] = useState("0");
  const [preparation, setPreparation] = useState("0");
  const indicativeDays = supplier.data?.lead_time_days;
  // A legacy default 0 in the registry is unknown until explicitly entered.
  const indicative = indicativeDays != null && Number.isFinite(indicativeDays) && indicativeDays > 0 ? String(indicativeDays) : "";
  const min = minOverride ?? indicative, max = maxOverride ?? indicative;
  if (item.stock_item_id) return <p className="text-sm text-muted-foreground">Articolo collegato a magazzino: verifica quantità riservata, qualità e disponibilità per questa fase. Il collegamento alla giacenza non dimostra da solo la disponibilità; questa simulazione riguarda nuovi acquisti.</p>;
  if (!item.supplier_id) return <p className="text-sm text-muted-foreground">Scegli prima il fornitore dell’articolo. Per servizi o sola manodopera pianifica esecutore, accesso e mezzi nelle Lavorazioni.</p>;
  if (!companyId || supplier.isLoading) return <p role="status" className="text-sm">Caricamento tempi fornitore…</p>;
  if (supplier.isError || !supplier.data) return <p role="alert" className="text-sm text-destructive">Impossibile verificare i tempi del fornitore. Riprova prima di usare questa simulazione.</p>;
  let result: ReturnType<typeof planProcurementTimeline> | null = null, error: string | null = null;
  if (requiredDate) {
    try {
      result = planProcurementTimeline({ asOf: todayInRome(), contractDate: contractDate || null,
        requiredOnSite: requiredDate, leadMinDays: days(min), leadMaxDays: days(max),
        supplierCalendar: workingDays ? MONDAY_FRIDAY : undefined,
        bufferDays: days(buffer) ?? NaN, logisticsDays: days(logistics) ?? NaN, preparationDays: days(preparation) ?? NaN,
        gates: [{ id: "production-ready", label: "Misure/progetto approvati, ordine accettato e acconto richiesto", date: gateDate || null, state: "planned" }] });
    } catch (e) { error = e instanceof Error ? e.message : "Dati non validi"; }
  }
  return <div className="space-y-3">
    <p className="text-xs text-muted-foreground">Fornitore: {supplier.data.name}. Tempi di anagrafica indicativi: verifica giorni solari/lavorativi, chiusure e decorrenza nell’offerta. Tutte le date sotto sono ipotesi di scenario.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <DateField id="timeline-contract" label="Data contratto / autorizzazione acquisto" value={contractDate} onChange={setContractDate} />
      <DateField id="timeline-required" label="Materiale necessario in cantiere" value={requiredDate} onChange={setRequiredDate} />
      <DateField id="timeline-gate" label="Prerequisiti pronti: misure, ordine e acconto" value={gateDate} onChange={setGateDate} />
      <div><Label htmlFor="timeline-calendar">Calendario del fornitore</Label><select id="timeline-calendar" className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={workingDays ? "working" : "civil"} onChange={e => setWorkingDays(e.target.value === "working")}><option value="civil">Giorni solari</option><option value="working">Lunedì–venerdì, senza festività configurate</option></select></div>
      <DaysField id="timeline-min" label="Fornitura: minimo giorni" value={min} onChange={setMinOverride} />
      <DaysField id="timeline-max" label="Fornitura: massimo giorni" value={max} onChange={setMaxOverride} />
      <DaysField id="timeline-preparation" label="Preparazione residua prima dell’ordine (giorni solari)" value={preparation} onChange={setPreparation} />
      <DaysField id="timeline-logistics" label="Trasporto interno e controllo (giorni solari)" value={logistics} onChange={setLogistics} />
      <DaysField id="timeline-buffer" label="Margine di sicurezza (giorni solari)" value={buffer} onChange={setBuffer} />
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!requiredDate && <p className="text-sm text-muted-foreground">Indica la data d’uso per calcolare a ritroso le scadenze.</p>}
    {result && <div aria-label="Risultato simulazione fornitura" className="rounded-md border p-3 text-sm space-y-2">
      <p className="font-medium">{result.status === "incomplete" ? "Scenario incompleto" : result.status === "late" ? `Data d’uso a rischio: ${result.delayDays} giorni di scarto prudenziale` : "Scenario condizionato ai prerequisiti"}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <Result label="Decidere e preparare entro" date={result.latestDecision} />
        <Result label="Ordine e prerequisiti completati entro" date={result.latestLaunch} />
        <Result label="Consegna utile entro" date={result.latestDelivery} />
        <Result label="Avvio possibile nello scenario" date={result.earliestLaunch} />
        <Result label="Consegna stimata: minimo" date={result.earliestDelivery} />
        <Result label="Consegna stimata: massimo" date={result.prudentDelivery} />
      </dl>
      {result.launchDeadlinePassed && <p className="text-destructive">Il termine prudenziale è già passato. Verifica un’altra fornitura, una sequenza diversa o una nuova data concordata.</p>}
      {!!result.missing.length && <p>Dati mancanti: {result.missing.join("; ")}.</p>}
      <p className="text-xs text-muted-foreground">Verifica acconti, saldo e copertura in Tesoreria prima di confermare. Questo calcolo non modifica OdA, appuntamenti o pagamenti; non verifica la capacità di posa e non sostituisce il cronoprogramma della commessa.</p>
    </div>}
  </div>;
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} type="date" value={value} onChange={e => onChange(e.target.value)} /></div>;
}
function DaysField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return <div><Label htmlFor={id}>{label}</Label><Input id={id} type="number" min="0" max="36600" step="1" value={value} onChange={e => onChange(e.target.value)} /></div>;
}
function Result({ label, date }: { label: string; date: string | null }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium">{dateLabel(date)}</dd></div>;
}
