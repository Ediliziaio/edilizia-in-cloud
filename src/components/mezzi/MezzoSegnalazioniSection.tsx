/**
 * Segnalazioni dal campo: guasti, danni e km aggiornati da chi ha il mezzo in
 * carico, con le foto. L'ufficio le prende in carico e le chiude; le letture
 * dei km nascono già chiuse.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Gauge, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useAggiornaSegnalazione, useMezzoFoto, useMezzoSegnalazioni, type SegnalazioneConChi,
} from "@/hooks/useMezzi";
import {
  formatContatore, formatData, giornoItaliano, statoSegnalazione, tipoSegnalazioneLabel, type ContatoreUnita,
} from "@/types/mezzi";

const ora = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(iso));

interface Props {
  mezzoId: string;
  unita: ContatoreUnita;
  puoModificare: boolean;
}

export function MezzoSegnalazioniSection({ mezzoId, unita, puoModificare }: Props) {
  const { data: segnalazioni = [], isLoading, error, refetch } = useMezzoSegnalazioni(mezzoId);
  const { data: foto = [] } = useMezzoFoto(mezzoId);
  const aggiorna = useAggiornaSegnalazione();
  const [daChiudere, setDaChiudere] = useState<SegnalazioneConChi | null>(null);
  const [nota, setNota] = useState("");
  const [soloKm, setSoloKm] = useState(false);

  const fotoPer = useMemo(() => {
    const m = new Map<string, typeof foto>();
    for (const f of foto) if (f.segnalazione_id) (m.get(f.segnalazione_id) ?? m.set(f.segnalazione_id, []).get(f.segnalazione_id)!).push(f);
    return m;
  }, [foto]);

  const problemi = segnalazioni.filter((s) => s.tipo !== "km");
  const letture = segnalazioni.filter((s) => s.tipo === "km");
  const visibili = soloKm ? letture : problemi;

  const chiudi = async () => {
    if (!daChiudere) return;
    try {
      await aggiorna.mutateAsync({ id: daChiudere.id, stato: "chiusa", nota: nota.trim() || null });
      setDaChiudere(null);
    } catch {
      // l'errore lo mostra la mutation
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Quello che manda dal telefono chi ha il mezzo.</p>
        <div className="flex rounded-lg border p-0.5 text-sm" role="tablist" aria-label="Tipo di segnalazioni">
          <button
            type="button"
            role="tab"
            aria-selected={!soloKm}
            onClick={() => setSoloKm(false)}
            className={`rounded-md px-3 py-1 ${!soloKm ? "bg-slate-900 text-white" : "text-muted-foreground"}`}
          >
            Guasti e danni ({problemi.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={soloKm}
            onClick={() => setSoloKm(true)}
            className={`rounded-md px-3 py-1 ${soloKm ? "bg-slate-900 text-white" : "text-muted-foreground"}`}
          >
            Km ({letture.length})
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Non riesco a caricare le segnalazioni.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>Riprova</button>
        </div>
      ) : visibili.length === 0 ? (
        <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          {soloKm ? <Gauge className="mx-auto mb-2 h-8 w-8 opacity-40" /> : <Wrench className="mx-auto mb-2 h-8 w-8 opacity-40" />}
          {soloKm ? "Nessun aggiornamento dei km dal campo." : "Nessun guasto o danno segnalato."}
        </div>
      ) : (
        <ul className="space-y-2">
          {visibili.map((s) => {
            const st = statoSegnalazione(s.stato);
            const sueFoto = fotoPer.get(s.id) ?? [];
            return (
              <li key={s.id} className="rounded-xl border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {s.tipo === "km" ? (
                    <Gauge className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  )}
                  <span className="text-sm font-medium">{tipoSegnalazioneLabel(s.tipo)}</span>
                  {s.tipo !== "km" && <Badge variant="outline" className={`text-[11px] ${st.cls}`}>{st.label}</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {formatData(giornoItaliano(s.created_at))} alle {ora(s.created_at)}{s.chi ? ` · ${s.chi}` : ""}
                  </span>
                </div>
                {s.descrizione && <p className="mt-1 whitespace-pre-line text-sm">{s.descrizione}</p>}
                {s.contatore != null && (
                  <p className="mt-1 text-sm text-muted-foreground">{formatContatore(s.contatore, unita)}</p>
                )}
                {sueFoto.length > 0 && (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {sueFoto.map((f) =>
                      f.url ? (
                        <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <img src={f.url} alt="Foto della segnalazione" loading="lazy" className="h-20 w-24 rounded-lg border object-cover" />
                        </a>
                      ) : null,
                    )}
                  </div>
                )}
                {s.stato === "chiusa" && s.tipo !== "km" && (
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                    Chiusa{s.chiusa_at ? ` il ${formatData(giornoItaliano(s.chiusa_at))}` : ""}{s.nota_chiusura ? `: ${s.nota_chiusura}` : ""}
                  </p>
                )}
                {puoModificare && s.tipo !== "km" && s.stato !== "chiusa" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.stato === "aperta" && (
                      <Button size="sm" variant="outline" onClick={() => aggiorna.mutate({ id: s.id, stato: "in_lavorazione" })}>
                        Prendo in carico
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        setNota("");
                        setDaChiudere(s);
                      }}
                    >
                      Risolto, chiudi
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!daChiudere} onOpenChange={(o) => !o && setDaChiudere(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chiudi la segnalazione</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="nota-chiusura">Com'è stato risolto (facoltativo)</Label>
            <Textarea
              id="nota-chiusura"
              rows={3}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="es. sostituito il sensore in officina"
            />
            <p className="text-xs text-muted-foreground">Se c'è stato un intervento in officina, segnalo anche in «Tagliandi e interventi» con il costo.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDaChiudere(null)}>Annulla</Button>
            <Button onClick={chiudi} disabled={aggiorna.isPending}>
              {aggiorna.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
