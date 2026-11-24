/**
 * EventoEmailPanel — MP-EMAIL-AI-11 · Rileva appuntamento → bozza evento
 *
 * "Rileva appuntamento" → card con data RISOLTA (mostrata per conferma), luogo,
 * avviso se ambiguo. "Aggiungi in agenda" / "Scarta". Mai evento automatico.
 */
import { CalendarPlus, Loader2, CheckCircle2, XCircle, MapPin, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useRilevaEvento,
  useEventiBozzePerEmail,
  useAggiornaStatoEvento,
} from "@/lib/email-ai/hooks";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

function formatData(iso: string | null, tuttoIlGiorno: boolean, t: (testo: string) => string): string {
  if (!iso) return t("data da definire");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return t("data da definire");
  return tuttoIlGiorno
    ? d.toLocaleDateString(intlCampo(), { weekday: "long", day: "numeric", month: "long" })
    : d.toLocaleString(intlCampo(), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export function EventoEmailPanel({ emailId }: { emailId: string }) {
  const t = useT();
  const rileva = useRilevaEvento();
  const aggiorna = useAggiornaStatoEvento();
  const { data: bozze } = useEventiBozzePerEmail(emailId);
  const visibili = (bozze ?? []).filter((b) => b.stato !== "scartato");

  return (
    <div className="px-3 pb-3 space-y-2">
      {visibili.length === 0 && (
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                disabled={rileva.isPending}
                onClick={() => rileva.mutate({ email_id: emailId })}>
          {rileva.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
          {t("Rileva appuntamento")}
        </Button>
      )}

      {visibili.map((b) => (
        <div key={b.id} className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 text-xs">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-sky-700" />
            <span className="font-semibold text-sky-900">{b.titolo || t("Appuntamento")}</span>
            {b.stato === "aggiunto" && <Badge className="bg-emerald-600 text-[10px]">{t("In agenda")}</Badge>}
            {b.ambiguo && (
              <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800 text-[10px]">
                <AlertTriangle className="h-3 w-3" /> {t("Data da confermare")}
              </Badge>
            )}
          </div>
          <p className="capitalize text-[12px] text-slate-800">{formatData(b.inizio, b.tutto_il_giorno, t)}</p>
          {b.luogo && <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><MapPin className="h-3 w-3" /> {b.luogo}</p>}
          {b.nota && <p className="mt-0.5 text-[11px] italic text-muted-foreground">{b.nota}</p>}

          {b.stato !== "aggiunto" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="h-8 gap-1 bg-sky-600 text-xs hover:bg-sky-700"
                      disabled={aggiorna.isPending || b.ambiguo || !b.inizio}
                      title={b.ambiguo || !b.inizio ? t("Specifica prima una data certa") : undefined}
                      onClick={() => aggiorna.mutate({ id: b.id, stato: "aggiunto", email_id: emailId })}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("Aggiungi in agenda")}
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                      disabled={aggiorna.isPending}
                      onClick={() => aggiorna.mutate({ id: b.id, stato: "scartato", email_id: emailId })}>
                <XCircle className="h-3.5 w-3.5" /> {t("Scarta")}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
