/**
 * Silvio dentro una sezione della commessa (31/10/2026): un pulsante col cervello
 * arancione e un popup. Nel popup Silvio dice cosa manca, punto per punto, con
 * l'azione che lo risolve. Poi si può chiedergli altro: la chat parte con quel
 * quadro già scritto, così risponde su quello che c'è davvero.
 * Usato in Lavorazioni (fasi) e in Materiali e acquisti.
 */
import { forwardRef, useState, type ComponentProps } from "react";
import { AlertTriangle, ArrowRight, Brain, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { quadroPerSilvio, type AzioneSilvio, type PuntoSilvio } from "@/lib/orders/silvioControlli";

/** Apre la chat di Silvio sopra la pagina (SilvioFAB ascolta «silvio:open-chat»). */
export function apriChatSilvio(draft: string) {
  window.dispatchEvent(new CustomEvent("silvio:open-chat", { detail: { draft } }));
}

/** Il pulsante di Silvio: cervello arancione, come nella chat. */
export const SilvioBottone = forwardRef<HTMLButtonElement, ComponentProps<typeof Button> & { etichetta?: string }>(
  ({ etichetta = "Silvio", className, ...props }, ref) => (
    <Button ref={ref} type="button" variant="outline" size="sm"
      className={cn("h-8 gap-1.5 border-orange-200 bg-orange-50/60 text-orange-900 hover:bg-orange-100", className)} {...props}>
      <Brain className="h-4 w-4 text-orange-600" />{etichetta}
    </Button>
  ),
);
SilvioBottone.displayName = "SilvioBottone";

export function SilvioAiuto({ titolo, descrizione, punti, onAzione, domande, intestazioneChat, etichetta, className }: {
  titolo: string;
  descrizione: string;
  punti: PuntoSilvio[];
  onAzione: (a: AzioneSilvio) => void;
  /** Domande pronte da mandare a Silvio. */
  domande: string[];
  /** «Commessa O-0002, fasi:» — apre il quadro che Silvio riceve in chat. */
  intestazioneChat: string;
  etichetta?: string;
  className?: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const chiedi = (domanda: string) => {
    if (!domanda.trim()) return;
    apriChatSilvio(`${quadroPerSilvio(intestazioneChat, punti)}\n\n${domanda.trim()}`);
    setTesto("");
    setAperto(false);
  };
  const alti = punti.filter((p) => p.gravita === "alta").length;
  return (
    <>
      <SilvioBottone etichetta={etichetta} className={className} onClick={() => setAperto(true)}
        aria-label={punti.length ? `${etichetta ?? "Silvio"}: ${punti.length} cose da sistemare` : etichetta ?? "Silvio"} />
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Brain className="h-5 w-5 text-orange-600" />{titolo}</DialogTitle>
            <DialogDescription>{descrizione}</DialogDescription>
          </DialogHeader>
          {punti.length ? (
            <ul className="space-y-2" aria-label="Cosa sistemare">
              {punti.map((p) => (
                <li key={p.chiave} className={cn("flex flex-wrap items-start gap-3 rounded-lg border p-3", p.gravita === "alta" ? "border-orange-200 bg-orange-50/50" : "bg-background")}>
                  <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", p.gravita === "alta" ? "text-orange-600" : "text-slate-400")} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.titolo}</p>
                    <p className="text-xs text-muted-foreground">{p.dettaglio}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => { setAperto(false); onAzione(p.azione); }}>
                    {p.etichettaAzione}<ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />Non vedo niente che manca.
            </p>
          )}
          {alti > 0 && <p className="text-xs text-muted-foreground">Prima i punti in arancione: bloccano il cantiere o il conto della commessa.</p>}
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Chiedi a Silvio</p>
            <div className="flex flex-wrap gap-1.5">
              {domande.map((d) => (
                <button key={d} type="button" onClick={() => chiedi(d)}
                  className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs text-orange-900 hover:bg-orange-100">
                  {d}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Textarea rows={2} value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi cosa vuoi sistemare…" aria-label="Domanda per Silvio"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); chiedi(testo); } }} />
              <Button size="icon" className="h-10 w-10 shrink-0 bg-orange-600 hover:bg-orange-700" aria-label="Manda a Silvio" disabled={!testo.trim()} onClick={() => chiedi(testo)}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">La chat si apre sopra la commessa, con quello che Silvio ha già visto qui.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
