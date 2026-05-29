/**
 * DeliverabilityPanel — MP-EMAIL-AI-15 · SPF/DKIM/DMARC + reputazione
 *
 * "Controlla ora" interroga il DNS reale e segna verde/rosso ciascun record.
 * Per i mancanti, mostra il valore pronto da copiare + istruzioni in italiano.
 */
import { useState } from "react";
import { ShieldCheck, Loader2, CheckCircle2, XCircle, Copy, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useVerificaDeliverability, type DeliverabilityRecord } from "@/lib/email-ai/hooks";

function StatoRiga({ nome, ok, descr }: { nome: string; ok: boolean; descr: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-500" />}
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-slate-800">{nome}</span>
        <span className="ml-2 text-[11px] text-muted-foreground">{descr}</span>
      </div>
      <Badge variant="outline" className={ok ? "border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700" : "border-rose-200 bg-rose-50 text-[10px] text-rose-700"}>
        {ok ? "Configurato" : "Mancante"}
      </Badge>
    </div>
  );
}

function RecordDaAggiungere({ r }: { r: DeliverabilityRecord }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs">
      <div className="mb-1 flex items-center gap-2 font-mono text-[11px]">
        <span className="rounded bg-white px-1.5 py-0.5">{r.tipo}</span>
        <span className="text-muted-foreground">host:</span> <b>{r.host}</b>
      </div>
      <div className="flex items-start gap-2">
        <code className="flex-1 break-all rounded bg-white px-2 py-1 text-[11px]">{r.valore}</code>
        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                onClick={() => { navigator.clipboard?.writeText(r.valore); toast.success("Copiato"); }} aria-label="Copia">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-amber-800">{r.nota}</p>
    </div>
  );
}

export function DeliverabilityPanel() {
  const verifica = useVerificaDeliverability();
  const [dominio, setDominio] = useState("");
  const r = verifica.data;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
        <ShieldCheck className="h-5 w-5 text-blue-600" />
        <p className="text-xs text-blue-900">Se le tue email finiscono in spam, tutto il resto non conta. Verifica che il tuo dominio sia autenticato.</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={dominio}
          onChange={(e) => setDominio(e.target.value)}
          placeholder="dominio (auto se vuoto)"
          className="h-9 flex-1 rounded-md border px-3 text-sm"
        />
        <Button size="sm" className="h-9 gap-1.5" disabled={verifica.isPending}
                onClick={() => verifica.mutate(dominio.trim() ? { domain: dominio.trim() } : {})}>
          {verifica.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
          Controlla ora
        </Button>
      </div>

      {r && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Dominio: <b className="text-slate-800">{r.dominio}</b></p>
          <StatoRiga nome="SPF" ok={r.spf_ok} descr="Quali server possono spedire per te" />
          <StatoRiga nome="DKIM" ok={r.dkim_ok} descr={r.dkim_selector ? `Firma valida (selettore: ${r.dkim_selector})` : "Firma le email così non si falsificano"} />
          <StatoRiga nome="DMARC" ok={r.dmarc_ok} descr={r.dmarc_policy ? `Policy: ${r.dmarc_policy}` : "Cosa fare se qualcuno ti falsifica"} />

          {(r.suggeriti.spf || r.suggeriti.dmarc || r.suggeriti.dkim) && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-slate-700">Record DNS da aggiungere dal tuo registrar (Aruba, Register.it, …):</p>
              {r.suggeriti.spf && <RecordDaAggiungere r={r.suggeriti.spf} />}
              {r.suggeriti.dkim && <RecordDaAggiungere r={r.suggeriti.dkim} />}
              {r.suggeriti.dmarc && <RecordDaAggiungere r={r.suggeriti.dmarc} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
