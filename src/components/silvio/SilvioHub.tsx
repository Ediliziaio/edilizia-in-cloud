/**
 * SilvioHub — vista unica dell'agente operativo Silvio (per-azienda).
 * Sotto-sezioni: Azioni (cosa può fare) · Da approvare (coda conferme, MP-06) ·
 * In corso (task, MP-04) · Storico (audit, MP-06) · Procedure (playbook, MP-05).
 * Integra nel flusso ciò che Silvio fa; non blocca nulla (viste + approva/rifiuta).
 */
import { Bot, ShieldCheck, ListChecks, History, BookOpen, MailWarning, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SilvioAzioniSettings } from "./SilvioAzioniSettings";
import {
  useSilvioCodaConferme, useRisolviConferma, useSilvioAudit, useSilvioTaskAttivi, useSilvioPlaybook,
} from "@/lib/silvio/hooks";
import { etichettaEsito, etichettaOrigine, anteprimaParametri } from "@/lib/silvio/fiducia";

function Vuoto({ icon: Icon, testo }: { icon: typeof Clock; testo: string }) {
  return (
    <div className="rounded-md border border-dashed bg-slate-50/50 p-5 text-center">
      <Icon className="mx-auto mb-1 h-5 w-5 text-slate-400" />
      <p className="text-xs text-muted-foreground">{testo}</p>
    </div>
  );
}

function DaApprovare() {
  const { data, isLoading } = useSilvioCodaConferme();
  const risolvi = useRisolviConferma();
  if (isLoading) return <p className="text-xs text-muted-foreground">Caricamento…</p>;
  if ((data?.length ?? 0) === 0) return <Vuoto icon={CheckCircle2} testo="Nessuna azione in attesa. Quando Silvio prepara qualcosa di sensibile, lo trovi qui da approvare." />;
  return (
    <div className="space-y-2">
      {data!.map((v) => (
        <div key={v.id} className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-sm font-medium text-slate-800">{v.azione_chiave}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{v.anteprima || anteprimaParametri(v.parametri)}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-8 gap-1.5" disabled={risolvi.isPending}
              onClick={() => risolvi.mutate({ id: v.id, azione: "approvata" })}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Approva
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={risolvi.isPending}
              onClick={() => risolvi.mutate({ id: v.id, azione: "rifiutata" })}>
              <XCircle className="h-3.5 w-3.5" /> Rifiuta
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function InCorso() {
  const { data, isLoading } = useSilvioTaskAttivi();
  if (isLoading) return <p className="text-xs text-muted-foreground">Caricamento…</p>;
  if ((data?.length ?? 0) === 0) return <Vuoto icon={ListChecks} testo="Nessun compito in corso. Qui vedrai cosa Silvio sta gestendo per te, passo per passo." />;
  return (
    <div className="space-y-1.5">
      {data!.map((t) => (
        <div key={t.id} className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-800">{t.titolo || "(compito)"}</p>
            <p className="text-[11px] text-muted-foreground">{etichettaOrigine(t.origine)} · passo {t.passo_corrente + 1}</p>
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">{t.stato}</Badge>
        </div>
      ))}
    </div>
  );
}

function Storico() {
  const { data, isLoading } = useSilvioAudit(50);
  if (isLoading) return <p className="text-xs text-muted-foreground">Caricamento…</p>;
  if ((data?.length ?? 0) === 0) return <Vuoto icon={History} testo="Ancora nessuna azione registrata. Ogni cosa che Silvio fa finirà qui, con il perché." />;
  return (
    <div className="space-y-1">
      {data!.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-md border bg-white px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-slate-800">{a.azione_chiave}</p>
            <p className="text-[11px] text-muted-foreground">
              {etichettaOrigine(a.origine)}{a.motivo ? ` · ${a.motivo}` : ""} · {new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(a.created_at))}
            </p>
          </div>
          <Badge variant="outline" className={`shrink-0 text-[10px] ${a.esito === "eseguita" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : a.esito === "annullata" ? "border-slate-200 bg-slate-50 text-slate-500" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            {etichettaEsito(a.esito)}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function Procedure() {
  const { data, isLoading } = useSilvioPlaybook();
  if (isLoading) return <p className="text-xs text-muted-foreground">Caricamento…</p>;
  if ((data?.length ?? 0) === 0) return <Vuoto icon={BookOpen} testo="Nessuna procedura." />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Le "ricette" che Silvio segue quando scatta un evento (es. arriva una fattura). Passi deterministici, conferme dove serve.</p>
      {data!.map((p) => (
        <div key={p.id} className="rounded-md border bg-white px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{p.nome}</span>
            {p.company_id === null && <Badge variant="outline" className="text-[10px]">predefinita</Badge>}
            {!p.attivo && <Badge variant="outline" className="text-[10px] text-slate-400">disattivata</Badge>}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            quando: {p.innesco} · {p.passi.filter((s) => s.azione_chiave).length} passi
          </p>
        </div>
      ))}
    </div>
  );
}

export function SilvioHub() {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/50 p-3">
        <Bot className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
        <p className="text-xs text-violet-900">
          Silvio è il tuo assistente operativo: prepara bozze, propone azioni e segue le procedure —
          <b> da solo sul sicuro, con la tua conferma sul sensibile</b>. Qui governi cosa fa e vedi tutto ciò che ha fatto.
        </p>
      </div>
      <Tabs defaultValue="approvare" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="approvare" className="gap-1 text-xs"><MailWarning className="h-3.5 w-3.5" /> Da approvare</TabsTrigger>
          <TabsTrigger value="corso" className="gap-1 text-xs"><ListChecks className="h-3.5 w-3.5" /> In corso</TabsTrigger>
          <TabsTrigger value="storico" className="gap-1 text-xs"><History className="h-3.5 w-3.5" /> Storico</TabsTrigger>
          <TabsTrigger value="procedure" className="gap-1 text-xs"><BookOpen className="h-3.5 w-3.5" /> Procedure</TabsTrigger>
          <TabsTrigger value="azioni" className="gap-1 text-xs"><ShieldCheck className="h-3.5 w-3.5" /> Permessi</TabsTrigger>
        </TabsList>
        <TabsContent value="approvare" className="mt-3"><DaApprovare /></TabsContent>
        <TabsContent value="corso" className="mt-3"><InCorso /></TabsContent>
        <TabsContent value="storico" className="mt-3"><Storico /></TabsContent>
        <TabsContent value="procedure" className="mt-3"><Procedure /></TabsContent>
        <TabsContent value="azioni" className="mt-3"><SilvioAzioniSettings /></TabsContent>
      </Tabs>
    </div>
  );
}
