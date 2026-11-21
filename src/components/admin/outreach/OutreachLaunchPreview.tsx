import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { outreachRpc } from "./outreachRpc";
import { pianoAvvio, type AnteprimaAvvio } from "./outreachLaunchPlan";

const data = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "long", timeStyle: "short" });
const numero = (n: number) => n.toLocaleString("it-IT");

export function OutreachLaunchPreview({ companyId, sequenceId, sequenceName, resume, onClose, onLaunched }: {
  companyId: string; sequenceId: string; sequenceName: string; resume: boolean;
  onClose: () => void; onLaunched: () => void;
}) {
  const args = { p_company: companyId, p_sequence: sequenceId };
  const preview = useQuery({
    queryKey: ["outreach-launch-preview", companyId, sequenceId],
    queryFn: () => outreachRpc<AnteprimaAvvio>("outreach_anteprima_avvio", args),
    retry: false,
  });
  const conferma = useMutation({
    mutationFn: (versione: string) => outreachRpc<void>("outreach_conferma_avvio", { ...args, p_versione: versione }),
    onSuccess: onLaunched,
  });
  const d = preview.data;
  const piano = d ? pianoAvvio(d) : null;
  const blocco = d?.blocco ?? (piano?.finestraNonValida ? "Correggi il fuso orario della finestra di invio del brand." : null);
  const azione = resume ? "Riprendi" : "Attiva";

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !conferma.isPending) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{azione} {sequenceName}</DialogTitle>
          <DialogDescription>Controlla il pubblico, il mittente e i tempi prima di confermare.</DialogDescription>
        </DialogHeader>
        {preview.isPending && <p role="status" className="text-sm text-muted-foreground">Calcolo dell’anteprima…</p>}
        {preview.isError && <p role="alert" className="text-sm text-destructive">{preview.error.message}</p>}
        {d && piano && (
          <div className="space-y-4 text-sm">
            {blocco && <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{blocco}
            </p>}
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Destinatari", d.destinatari], ["Messaggi in coda", d.invii],
                ["Contatti esclusi", d.esclusi], ["Email arretrate", d.arretrati_email],
              ].map(([titolo, valore]) => (
                <div key={titolo} className="rounded-md border p-2.5">
                  <dt className="text-xs text-muted-foreground">{titolo}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{numero(Number(valore))}</dd>
                </div>
              ))}
            </dl>
            {(d.altri_canali > 0 || d.chiamate > 0) && <p className="text-xs text-muted-foreground">
              {d.altri_canali > 0 && <span>{numero(d.altri_canali)} messaggi SMS/WhatsApp seguono i limiti dei rispettivi canali. </span>}
              {d.chiamate > 0 && <span>{numero(d.chiamate)} promemoria di chiamata in coda.</span>}
            </p>}
            {d.esclusi > 0 && <details className="rounded-md border px-3 py-2">
              <summary className="cursor-pointer font-medium">Motivi delle esclusioni</summary>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {Object.entries(d.cause).map(([motivo, n]) => <li key={motivo}>{numero(n)} · {motivo}</li>)}
              </ul>
            </details>}
            <div className="space-y-2">
              <h3 className="font-semibold">{d.brand ?? "Brand da assegnare"}</h3>
              {(d.mittente || d.risposte_a) && <p className="text-xs text-muted-foreground">
                {[d.mittente, d.risposte_a ? `Risposte a ${d.risposte_a}` : null].filter(Boolean).join(" · ")}
              </p>}
              <p>
                <strong>{numero(piano.residuo)} posti email residui</strong> oggi nel brand,
                di cui fino a <strong>{numero(piano.primi)}</strong> per primi contatti.
              </p>
              {piano.caselle.length > 0 && <details>
                <summary className="cursor-pointer text-muted-foreground">{piano.caselle.length} caselle pronte</summary>
                <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs">
                  {piano.caselle.map((c) => <li key={c.id} className="break-all">{c.email} · {c.residuo} posti residui</li>)}
                </ul>
              </details>}
            </div>
            {d.email > 0 && !blocco && <div className="rounded-md bg-muted/50 p-3">
              <p className="font-medium">{piano.prima ? `Prima finestra utile ${data.format(piano.prima)}` : "In attesa di una finestra utile"}</p>
              {d.arretrati_email > 0 && <p className="mt-1 text-xs text-muted-foreground">
                Il motore recupera gli arretrati nelle finestre del brand, con fino a {numero(piano.arretratiOggi)} posti oggi.
                La capacità è condivisa tra le campagne e il resto passa alle finestre successive. Gli invii futuri mantengono la data programmata.
              </p>}
            </div>}
            {conferma.isError && <p role="alert" className="text-sm text-destructive">{conferma.error.message}</p>}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={conferma.isPending}>Chiudi</Button>
          <Button variant="outline" onClick={() => { conferma.reset(); void preview.refetch(); }} disabled={preview.isFetching || conferma.isPending}>Aggiorna anteprima</Button>
          <Button onClick={() => { if (d && !blocco) conferma.mutate(d.versione); }}
            disabled={!d || !!blocco || preview.isFetching || preview.isError || conferma.isPending || conferma.isError}>
            <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />{conferma.isPending ? "Conferma in corso…" : `Conferma e ${azione.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
