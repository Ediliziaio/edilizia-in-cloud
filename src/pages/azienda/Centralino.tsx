import { SilvioAssistanceActivities } from "@/components/silvio/SilvioAssistanceActivities";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useCentralinoCalls } from "@/hooks/useCentralinoCalls";
import { useUnifiedAgents } from "@/hooks/useUnifiedAgents";
import { usePermissions } from "@/hooks/usePermissions";
import { callRecordId, centralinoHistoryFilters } from "@/lib/centralinoNavigation";
import { useSoftphoneOptional } from "@/components/telephony/SoftphoneProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, Delete, Loader2, Settings2, PhoneOutgoing, List, Headset, Grid3X3 } from "lucide-react";
import { CentralinoCallHistory } from "@/components/telephony/CentralinoCallHistory";
import { DisponibilitaOperatore } from "@/components/telephony/DisponibilitaOperatore";
import { RichiamiCentralino } from "@/components/telephony/RichiamiCentralino";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import "@/components/ui/fish-agent-pipeline.css";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
const SEZIONI = [
  { id: "chiamate", label: "Chiamate", icon: List },
  { id: "richiami", label: "Richiami", icon: PhoneOutgoing },
  { id: "telefono", label: "Telefono", icon: Grid3X3 },
  { id: "attivita", label: "Assistenza", icon: Headset },
];

function fmtDur(s: number) {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function Centralino() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const { isAdmin, canViewOrders, canViewMarketingAiAgent } = usePermissions();
  const canViewCalls = isAdmin || canViewMarketingAiAgent;
  const canViewCallbacks = isAdmin || canViewOrders;
  const sections = SEZIONI.filter(({ id }) => id === "richiami" ? canViewCallbacks : canViewCalls);
  const requestedTab = params.get("tab");
  const activeTab = sections.find(({ id }) => id === requestedTab)?.id ?? sections[0]?.id ?? "chiamate";
  const callbackId = callRecordId(params.get("richiamo"));

  function changeTab(value: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (value === "chiamate") next.delete("tab");
      else next.set("tab", value);
      next.delete("richiamo");
      return next;
    });
  }

  return (
    <div className="eic-workspace space-y-4">
      <header className="eic-workspace-header eic-motion-enter flex flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4">
        <div className="flex items-center gap-2.5">
          <span className="eic-workspace-icon"><Phone aria-hidden="true" className="size-5" /></span>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("Centralino")}</h1>
        </div>
        {canViewCalls && (
          <Button asChild variant="outline" size="sm" className="gap-1.5 max-md:hidden">
            <Link to="/azienda/agenti-ai?tab=telefonia"><Settings2 className="h-4 w-4" /> {t("Numeri e collegamenti")}</Link>
          </Button>
        )}
      </header>
      <Tabs value={activeTab} onValueChange={changeTab}>
        <div className="min-w-0 overflow-x-auto px-1 py-1">
          <WorkspaceTabs items={sections.map((s) => ({ ...s, label: t(s.label) }))} selected={activeTab} label={t("Sezioni del centralino")} className="w-full sm:w-auto" />
        </div>
        {canViewCalls && <TabsContent value="chiamate" className="mt-4"><CentralinoChiamate /></TabsContent>}
        {canViewCallbacks && <TabsContent value="richiami" className="mt-4"><RichiamiCentralino callbackId={callbackId} /></TabsContent>}
        {canViewCalls && <TabsContent value="telefono" className="mt-4"><CentralinoTelefono /></TabsContent>}
        {canViewCalls && <TabsContent value="attivita" className="mt-4"><SilvioAssistanceActivities /></TabsContent>}
      </Tabs>
    </div>
  );
}

function CentralinoChiamate() {
  const t = useT();
  const [params] = useSearchParams();
  const { data: agents = [] } = useUnifiedAgents();
  const { data: logs } = useCentralinoCalls(centralinoHistoryFilters(params));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const stats = logs && [
    { label: t("Recenti"), value: logs.length },
    { label: t("Oggi"), value: logs.filter(log => new Date(log.date) >= today).length },
    { label: t("Completate"), value: logs.filter(log => ["completed", "completata"].includes(log.status)).length },
    { label: t("Durata"), value: fmtDur(logs.reduce((seconds, log) => seconds + (log.seconds || 0), 0)) },
  ];

  return (
    <div className="max-w-6xl space-y-3">
      {stats && (
        <dl aria-label={t("Riepilogo delle chiamate recenti")} className="eic-workspace-header grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-4">
          {stats.map(({ label, value }) => (
            <div key={label} className="flex flex-wrap items-baseline gap-x-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="order-first text-lg font-semibold tabular-nums text-sky-950 dark:text-sky-100">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Card><CardContent className="min-w-0 p-4 sm:p-5">
        <CentralinoCallHistory agentOptions={agents.filter(agent => agent.tipo === "vocale" || agent.tipo === "campagna")} />
      </CardContent></Card>
    </div>
  );
}

function CentralinoTelefono() {
  const t = useT();
  const softphone = useSoftphoneOptional();
  const [number, setNumber] = useState("");
  const callBusy = !!softphone && softphone.status !== "idle";
  const canCall = !!softphone && !!number.trim() && !callBusy;

  return (
    <div className="max-w-5xl space-y-4">
      {!softphone && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t("Telefono dal browser non disponibile in questa sessione.")}</p>}
      <div className="grid items-start gap-4 md:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">{t("Tastierino")}</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={event => {
              event.preventDefault();
              if (canCall) softphone?.startCall(number.trim());
            }}>
              <div className="flex items-center gap-2">
                <Input type="tel" aria-label={t("Numero da chiamare")} value={number} placeholder="+39…" inputMode="tel"
                  onChange={event => setNumber(event.target.value.replace(/[^\d+*#]/g, "").slice(0, 20))}
                  className="text-center font-mono text-lg tracking-wide" />
                <Button type="button" variant="ghost" size="icon" onClick={() => setNumber(current => current.slice(0, -1))}
                  disabled={!number} aria-label={t("Cancella ultima cifra")}><Delete className="h-5 w-5" /></Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PAD.map(digit => (
                  <Button key={digit} type="button" variant="outline" className="h-11 text-lg"
                    onClick={() => setNumber(current => (current + digit).slice(0, 20))}>{digit}</Button>
                ))}
              </div>
              <Button type="submit" className="h-11 w-full gap-2" disabled={!canCall}>
                {callBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                {callBusy ? t("Chiamata in corso") : t("Chiama")}
              </Button>
            </form>
          </CardContent>
        </Card>
        <DisponibilitaOperatore />
      </div>
      {import.meta.env.DEV && (
        <details className="rounded-lg border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">{t("Collaudi locali")}</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/azienda/centralino/collaudo-lead">{t("Prova lead e CRM")}</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/azienda/centralino/collaudo-locale">{t("Prova assistenza")}</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/azienda/centralino/collaudo-telefonia">{t("Prova telefonia")}</Link></Button>
          </div>
        </details>
      )}
    </div>
  );
}
