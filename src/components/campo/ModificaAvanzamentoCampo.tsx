import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FotoBozzaTecnica } from "@/components/campo/FotoBozzaTecnica";
import { StatoBozzaTecnica } from "@/components/campo/StatoBozzaTecnica";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBozzaTecnica } from "@/hooks/campo/useBozzaTecnica";
import { valoreAttualeAvanzamento, valoreBozzaAvanzamento, type BozzaAvanzamento, type DestinazioneAvanzamento } from "@/lib/campo/bozzaTecnica";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function ModificaAvanzamentoCampo({ target, orderId, companyId, userId, cantiere, onClose, onSaved }: {
  target: DestinazioneAvanzamento;
  orderId: string;
  companyId: string;
  userId: string;
  cantiere: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const numero = new Intl.NumberFormat(intlCampo(), { maximumFractionDigits: 3 });
  const attuale = valoreAttualeAvanzamento(target);
  const bozza = useBozzaTecnica<BozzaAvanzamento>({
    tipo: "avanzamento", target, order_id: orderId, company_id: companyId, user_id: userId, nomeCantiere: cantiere,
    valore: String(attuale), chiusuraRichiesta: false, note: "", foto: [],
  });
  const { dati, modifica } = bozza;
  const occupato = useRef(false);
  const [salvaInCorso, setSalvaInCorso] = useState(false);
  const [fotoInCorso, setFotoInCorso] = useState(false);
  const bloccato = salvaInCorso || fotoInCorso;
  const base = dati?.target;
  const cambiaUnita = Boolean(base?.misura) !== Boolean(target.misura) || base?.misura?.unita !== target.misura?.unita
    || Boolean(base?.derivata) !== Boolean(target.derivata);
  const deveRileggere = !!base && (cambiaUnita || valoreAttualeAvanzamento(base) !== attuale || base.misura?.totale !== target.misura?.totale);
  const { valido, avanzamento } = dati ? valoreBozzaAvanzamento(dati) : { valido: false, avanzamento: null };
  const puoSalvare = valido && (avanzamento !== null || Boolean(dati?.note.trim()) || !!dati?.foto.length);
  const unita = target.misura ? target.misura.unita?.trim() || t("unità") : "%";

  function scegliValore(valore: string, chiudiFase = false) {
    modifica({ valore, chiusuraRichiesta: chiudiFase && !target.completata });
  }

  async function salva(event: FormEvent) {
    event.preventDefault();
    if (occupato.current || fotoInCorso || deveRileggere || !puoSalvare) return;
    occupato.current = true;
    setSalvaInCorso(true);
    try {
      const id = await bozza.accoda();
      if (id) {
        toast.message(t("Aggiornamento in coda"), { id: `invio-campo:${id}` });
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
        <DialogTitle>{target.sottofaseId ? t("Aggiorna sottofase") : t("Aggiorna fase")}</DialogTitle>
        <DialogDescription className="break-words" dir="auto">{target.nome}</DialogDescription>
      </DialogHeader>
      {!dati ? (bozza.errore ? <StatoBozzaTecnica {...bozza} /> : <p role="status" className="text-sm">{t("Carico la bozza…")}</p>) :
        <form onSubmit={salva} className="space-y-3">
          {target.derivata ? <p className="text-sm text-muted-foreground">{t("Avanzamento dalle sottofasi · {n}%", { n: target.percentuale })}</p> :
            <div className="space-y-1.5">
              <Label htmlFor="misura-avanzamento">{target.misura ? t("Eseguito ({unita})", { unita }) : t("Avanzamento (%)")}</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input id="misura-avanzamento" className="h-11 w-24 text-base tabular-nums"
                  inputMode={target.misura ? "decimal" : "numeric"} value={dati.valore} disabled={bloccato || deveRileggere}
                  onChange={event => scegliValore(event.target.value)} aria-invalid={!valido} />
                {!target.misura && <Button type="button" variant="outline" className="min-h-11 px-2.5"
                  disabled={bloccato || deveRileggere} onClick={() => scegliValore("50")}>50%</Button>}
                <Button type="button" variant="outline" className="min-h-11 px-2.5" disabled={bloccato || deveRileggere}
                  onClick={() => scegliValore(String(target.misura ? Math.ceil(target.misura.totale * 1000) / 1000 : 100), true)}>{t("Completata")}</Button>
              </div>
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {target.misura ? t("Attuale {attuale} / {totale} {unita}", { attuale: numero.format(attuale), totale: numero.format(target.misura.totale), unita }) : t("Attuale {n}%", { n: attuale })}
              </p>
            </div>}
          {deveRileggere && <div className="space-y-1 rounded-md border p-2">
            <p role="status" className="text-xs text-muted-foreground">{t("L’avanzamento è cambiato. Controlla il valore prima di inviare.")}</p>
            <Button type="button" variant="outline" className="min-h-11 w-full" disabled={bloccato} onClick={() => {
              modifica({
                target, valore: cambiaUnita || avanzamento === null ? String(attuale) : dati.valore,
                chiusuraRichiesta: !cambiaUnita && !target.completata && dati.chiusuraRichiesta,
              });
            }}>{t("Usa valore attuale")}</Button>
          </div>}
          <div className="space-y-1.5">
            <Label htmlFor="note-avanzamento">{t("Nota")}</Label>
            <Textarea id="note-avanzamento" rows={2} maxLength={3000} className="min-h-16 text-base" value={dati.note}
              onChange={event => modifica({ note: event.target.value })} disabled={bloccato} />
          </div>
          <FotoBozzaTecnica foto={dati.foto} onChange={foto => modifica({ foto })} onBusy={setFotoInCorso} disabled={salvaInCorso} />
          <StatoBozzaTecnica {...bozza} />
          <Button type="submit" className="min-h-11 w-full" disabled={bloccato || deveRileggere || !puoSalvare}>
            {salvaInCorso ? t("Salvo…") : t("Salva aggiornamento")}
          </Button>
        </form>}
    </DialogContent>
  </Dialog>;
}
