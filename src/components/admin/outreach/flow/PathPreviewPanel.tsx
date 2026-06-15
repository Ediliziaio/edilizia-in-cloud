import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageCircle, Smartphone, X, Route, AlertTriangle, Flag, CheckCircle2 } from "lucide-react";
import type { PreviewActivity, PreviewChannel, PreviewResult } from "./preview";

/**
 * Pannello "Anteprima percorso": scegli le ipotesi (Ha aperto? · Ha risposto?)
 * → mostra il cammino che il lead seguirebbe (i nodi/edge attivi sono evidenziati
 * sul canvas dal builder) ed elenca i messaggi (email/WhatsApp/SMS) che riceverebbe,
 * con ritardo cumulato. Nessun invio: solo simulazione (la traversata vera è in
 * preview.ts, replica della logica del dispatcher Fase 1).
 */

/** Icona + colore + etichetta per canale del messaggio simulato. */
const CHANNEL_META: Record<PreviewChannel, { Icon: typeof Mail; color: string; label: string }> = {
  email: { Icon: Mail, color: "text-orange-500", label: "Email" },
  whatsapp: { Icon: MessageCircle, color: "text-emerald-500", label: "WhatsApp" },
  sms: { Icon: Smartphone, color: "text-sky-500", label: "SMS" },
};

type Props = {
  activity: PreviewActivity;
  onActivityChange: (next: PreviewActivity) => void;
  result: PreviewResult;
  trackOpens: boolean;
  onClose: () => void;
};

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex overflow-hidden rounded-md border">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${value ? "bg-emerald-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          Sì
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${!value ? "bg-red-500 text-white" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          No
        </button>
      </div>
    </div>
  );
}

export function PathPreviewPanel({ activity, onActivityChange, result, trackOpens, onClose }: Props) {
  const { emails, aborted, reachedEnd } = result;
  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold">Anteprima percorso</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-[11px] text-muted-foreground">
          Simula cosa farebbe il contatto: il cammino risultante è evidenziato sul canvas e qui sotto trovi i messaggi (email, WhatsApp, SMS) che riceverebbe. Nessun invio reale.
        </p>

        <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
          <Toggle label="Ha aperto l'email?" value={activity.opened} onChange={(v) => onActivityChange({ ...activity, opened: v })} />
          <Toggle label="Ha risposto?" value={activity.replied} onChange={(v) => onActivityChange({ ...activity, replied: v })} />
          {activity.opened && !trackOpens && (
            <p className="flex items-start gap-1.5 text-[10px] text-amber-600">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Il tracking aperture è disattivo: in produzione l'apertura sarebbe sempre "non avvenuta", quindi il ramo reale può differire.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase text-muted-foreground">Messaggi ricevuti</span>
            <Badge variant="secondary" className="text-[10px]">{emails.length}</Badge>
          </div>
          {emails.length === 0 ? (
            <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
              Con queste ipotesi il contatto non riceverebbe nessun messaggio.
            </p>
          ) : (
            emails.map((em, i) => {
              const cm = CHANNEL_META[em.channel];
              const Icon = cm.Icon;
              return (
                <div key={em.nodeId} className="rounded-lg border bg-card p-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Icon className={`h-3 w-3 ${cm.color}`} />
                    <span className="font-semibold">#{i + 1}</span>
                    <span className="text-muted-foreground/70">{cm.label}</span>
                    <Badge variant="outline" className="ml-auto text-[9px]">G+{em.cumulativeDays}</Badge>
                  </div>
                  {/* l'oggetto esiste solo per l'email; whatsapp/sms mostrano solo il corpo. */}
                  {em.channel === "email" && (
                    <p className="mt-1 truncate text-xs font-medium text-foreground">{em.subject || "(senza oggetto)"}</p>
                  )}
                  {em.body && <p className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">{em.body}</p>}
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-lg border bg-muted/20 p-2 text-[11px]">
          {aborted ? (
            <span className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Percorso interrotto (ciclo rilevato): controlla i collegamenti.
            </span>
          ) : reachedEnd ? (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <Flag className="h-3.5 w-3.5" /> Il percorso termina correttamente (sequenza completata).
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" /> Percorso valutato.
            </span>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">
            Nota: alla prima risposta la cadenza si ferma automaticamente (stop implicito), anche senza un nodo dedicato.
          </p>
        </div>
      </div>
    </div>
  );
}
