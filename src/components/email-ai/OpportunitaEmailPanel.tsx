/**
 * OpportunitaEmailPanel — MP-EMAIL-AI-08 · Richiesta preventivo → bozza opportunità
 *
 * Bottone "Apri opportunità" → estrae la richiesta (tipo lavoro, indirizzo,
 * tempistiche, vincoli), collega il cliente dal CRM (o propone i dati firma se
 * nuovo) e prepara una bozza. L'AI prepara, NON prezza. Azioni: Apri / Scarta.
 */
import { Sparkles, Briefcase, Loader2, CheckCircle2, XCircle, UserPlus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useApriOpportunita,
  useOpportunitaBozzePerEmail,
  useAggiornaStatoOpportunita,
} from "@/lib/email-ai/hooks";

export function OpportunitaEmailPanel({ emailId }: { emailId: string }) {
  const apri = useApriOpportunita();
  const aggiorna = useAggiornaStatoOpportunita();
  const { data: bozze } = useOpportunitaBozzePerEmail(emailId);
  const visibili = (bozze ?? []).filter((b) => b.stato !== "scartata");

  return (
    <div className="px-3 pb-3 space-y-2">
      {visibili.length === 0 && (
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                disabled={apri.isPending}
                onClick={() => apri.mutate({ email_id: emailId })}>
          {apri.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Briefcase className="h-3.5 w-3.5" />}
          Apri opportunità
        </Button>
      )}

      {visibili.map((b) => (
        <div key={b.id} className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-xs">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <span className="font-semibold text-violet-900">Opportunità preparata</span>
            {b.cliente_match_id ? (
              <Badge variant="outline" className="gap-1 bg-white text-[10px]"><UserCheck className="h-3 w-3" /> Cliente dal CRM</Badge>
            ) : (
              <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800 text-[10px]"><UserPlus className="h-3 w-3" /> Cliente nuovo (da creare)</Badge>
            )}
            {b.stato === "aperta" && <Badge className="bg-emerald-600 text-[10px]">Aperta</Badge>}
          </div>

          {b.richiesta_sintesi && <p className="mb-2 text-[12px] text-slate-800">{b.richiesta_sintesi}</p>}

          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {b.tipo_lavoro && <Field label="Lavoro" value={b.tipo_lavoro} />}
            {b.indirizzo && <Field label="Indirizzo" value={b.indirizzo} />}
            {b.tempistiche && <Field label="Tempistiche" value={b.tempistiche} />}
            {b.vincoli && <Field label="Vincoli" value={b.vincoli} />}
            {!b.cliente_match_id && b.cliente_nuovo?.nome && <Field label="Contatto" value={b.cliente_nuovo.nome} />}
            {!b.cliente_match_id && b.cliente_nuovo?.telefono && <Field label="Telefono" value={b.cliente_nuovo.telefono} />}
          </div>

          {b.stato !== "aperta" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="h-8 gap-1 bg-emerald-600 text-xs hover:bg-emerald-700"
                      disabled={aggiorna.isPending}
                      onClick={() => aggiorna.mutate({ id: b.id, stato: "aperta", email_id: emailId })}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Segna come aperta
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                      disabled={aggiorna.isPending}
                      onClick={() => aggiorna.mutate({ id: b.id, stato: "scartata", email_id: emailId })}>
                <XCircle className="h-3.5 w-3.5" /> Scarta
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-slate-800">{value}</div>
    </div>
  );
}
