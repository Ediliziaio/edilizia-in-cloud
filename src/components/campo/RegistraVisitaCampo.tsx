import { useRef, useState, type FormEvent } from "react";
import { CalendarDays, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { FotoBozzaTecnica } from "@/components/campo/FotoBozzaTecnica";
import { StatoBozzaTecnica } from "@/components/campo/StatoBozzaTecnica";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBozzaTecnica } from "@/hooks/campo/useBozzaTecnica";
import type { BozzaVisita } from "@/lib/campo/bozzaTecnica";
import { campoWorkDay, validWorkDay } from "@/lib/campo/workDay";
import type { TipoVisitaCampo } from "@/lib/campo/schedaCantiere";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function RegistraVisitaCampo({ tipo, orderId, companyId, userId, cantiere, onClose, onSaved }: {
  tipo: TipoVisitaCampo; orderId: string; companyId: string; userId: string; cantiere: string;
  onClose: () => void; onSaved: () => void;
}) {
  const t = useT();
  const dataVisitaCampo = new Intl.DateTimeFormat(intlCampo(), { dateStyle: "medium", timeZone: "Europe/Rome" });
  const oggi = campoWorkDay();
  const bozza = useBozzaTecnica<BozzaVisita>({
    tipo: "rilievo", visita: tipo, order_id: orderId, company_id: companyId, user_id: userId, nomeCantiere: cantiere,
    giorno: oggi, misure: "", note: "", foto: [],
  });
  const { dati, modifica } = bozza;
  const occupato = useRef(false);
  const [salvaInCorso, setSalvaInCorso] = useState(false);
  const [fotoInCorso, setFotoInCorso] = useState(false);
  const bloccato = salvaInCorso || fotoInCorso;
  const valido = dati && validWorkDay(dati.giorno) && dati.giorno <= oggi && Boolean((tipo === "rilievo" ? dati.misure : dati.note).trim());
  const titolo = tipo === "rilievo" ? t("Registra rilievo") : t("Registra sopralluogo");

  async function salva(event: FormEvent) {
    event.preventDefault();
    if (occupato.current || fotoInCorso || !valido) return;
    occupato.current = true;
    setSalvaInCorso(true);
    try {
      const id = await bozza.accoda();
      if (id) {
        toast.message(tipo === "rilievo" ? t("Rilievo in coda") : t("Sopralluogo in coda"), { id: `invio-campo:${id}` });
        onSaved();
      }
    } finally {
      occupato.current = false;
      setSalvaInCorso(false);
    }
  }

  return <Dialog open onOpenChange={open => {
    if (!open && !bloccato && !occupato.current) void bozza.chiudi(onClose);
  }}>
    <DialogContent className="gap-3" onPointerDownOutside={event => event.preventDefault()}>
      <DialogHeader className="pr-8">
        <DialogTitle>{titolo}</DialogTitle>
        <DialogDescription className="break-words" dir="auto">{cantiere}</DialogDescription>
      </DialogHeader>
      {!dati ? (bozza.errore ? <StatoBozzaTecnica {...bozza} /> : <p role="status" className="text-sm">{t("Carico la bozza…")}</p>) :
        <form onSubmit={salva} className="space-y-3">
          <details className="group rounded-lg border px-2.5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium">{t("Data")}</span>
              <span className="ml-auto text-muted-foreground">{dati.giorno === oggi ? t("Oggi")
                : validWorkDay(dati.giorno) ? dataVisitaCampo.format(new Date(`${dati.giorno}T12:00:00Z`)) : t("Da scegliere")}</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
            </summary>
            <Label htmlFor="visita-giorno" className="sr-only">{t("Data della visita")}</Label>
            <Input id="visita-giorno" type="date" max={oggi} className="mb-2 h-11 text-base" value={dati.giorno}
              disabled={bloccato} onChange={event => modifica({ giorno: event.target.value })} />
          </details>
          {tipo === "rilievo" && <div className="space-y-1.5">
            <Label htmlFor="visita-misure">{t("Misure rilevate")}</Label>
            <Textarea id="visita-misure" rows={3} maxLength={3000} required className="text-base" value={dati.misure}
              placeholder={t("Es. Vano cucina 120 × 150 cm")} disabled={bloccato} onChange={event => modifica({ misure: event.target.value })} />
          </div>}
          <div className="space-y-1.5">
            <Label htmlFor="visita-note">{tipo === "rilievo" ? t("Nota facoltativa") : t("Esito del sopralluogo")}</Label>
            <Textarea id="visita-note" rows={2} maxLength={3000} required={tipo === "sopralluogo"} className="text-base"
              value={dati.note} disabled={bloccato} onChange={event => modifica({ note: event.target.value })} />
          </div>
          <FotoBozzaTecnica foto={dati.foto} onChange={foto => modifica({ foto })} onBusy={setFotoInCorso} disabled={salvaInCorso} />
          <StatoBozzaTecnica {...bozza} />
          <Button type="submit" disabled={bloccato || !valido} className="min-h-11 w-full">
            {salvaInCorso ? t("Salvo…") : t("Salva")}
          </Button>
        </form>}
    </DialogContent>
  </Dialog>;
}
