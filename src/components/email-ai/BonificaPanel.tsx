/**
 * BonificaPanel — MP-EMAIL-AI-12 · Metti in ordine la casella (arretrato)
 *
 * Panoramica del backlog (non lette) per categoria + azione di MASSA "Archivia
 * tutte" per gruppo, con ANNULLA. Sicuro: archivia (reversibile), mai cancella.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, Undo2, Loader2, Inbox, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBonificaOverview, useBonificaArchivia, useBonificaAnnulla } from "@/lib/email-ai/hooks";

const LABEL: Record<string, string> = {
  cliente: "Clienti", fornitore: "Fornitori", preventivo: "Preventivi", fattura: "Fatture",
  opportunita: "Opportunità", supporto: "Supporto", pratica: "Pratiche", newsletter: "Newsletter",
  social: "Social", notifica: "Notifiche", spam: "Spam", operaio: "HR / Operai", altro: "Altro",
};

export function BonificaPanel() {
  const { data: gruppi, isLoading } = useBonificaOverview();
  const archivia = useBonificaArchivia();
  const annulla = useBonificaAnnulla();
  const qc = useQueryClient();
  const [lastAzione, setLastAzione] = useState<{ id: string; categoria: string; count: number } | null>(null);

  const totale = (gruppi ?? []).reduce((s, g) => s + g.n, 0);

  if (isLoading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analizzo l'arretrato…</div>;
  }

  if (totale === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="text-sm font-medium text-slate-700">Casella in ordine</p>
        <p className="text-xs text-muted-foreground">Nessuna email arretrata da smaltire.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
        <Inbox className="h-5 w-5 text-blue-600" />
        <div>
          <p className="text-sm font-semibold text-blue-900">{totale} email arretrate</p>
          <p className="text-xs text-blue-800/80">Archivia a blocchi le categorie che non richiedono azione. Reversibile.</p>
        </div>
      </div>

      {lastAzione && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
          <span className="text-amber-800">Archiviate {lastAzione.count} email ({LABEL[lastAzione.categoria] || lastAzione.categoria}).</span>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                  disabled={annulla.isPending}
                  onClick={() => annulla.mutate({ azione_id: lastAzione.id }, { onSuccess: () => setLastAzione(null) })}>
            <Undo2 className="h-3.5 w-3.5" /> Annulla
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        {(gruppi ?? []).map((g) => {
          const busy = archivia.isPending && archivia.variables?.categoria === g.categoria;
          const archiviabile = ["newsletter", "social", "notifica", "spam"].includes(g.categoria);
          return (
            <div key={g.categoria} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{LABEL[g.categoria] || g.categoria}</span>
                <Badge variant="secondary" className="text-[10px]">{g.n}</Badge>
                {archiviabile && <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">consigliato</Badge>}
              </div>
              <Button size="sm" variant={archiviabile ? "default" : "outline"}
                      className={archiviabile ? "h-7 gap-1 bg-blue-600 text-xs hover:bg-blue-700" : "h-7 gap-1 text-xs"}
                      disabled={busy}
                      onClick={() => archivia.mutate({ categoria: g.categoria }, {
                        onSuccess: (data) => { if (data.azione_id) setLastAzione({ id: data.azione_id, categoria: g.categoria, count: data.count }); void qc.invalidateQueries({ queryKey: ["email-bonifica-overview"] }); },
                      })}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                Archivia tutte
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
