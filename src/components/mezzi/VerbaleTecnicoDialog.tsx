import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  usePreparaVerbaleTecnico,
  useRegistraVerbaleTecnico,
  useVerbaliTecniciMezzo,
  urlVerbaleTecnico,
} from "@/hooks/useVerbaliTecniciMezzo";
import {
  CATEGORIE_VERBALE_TECNICO,
  normalizzaParametriVerbale,
  erroriParametriVerbale,
  type ParametriVerbaleTecnico,
} from "../../../supabase/functions/_shared/mezziVerbaliTecnici";
import { categoriaDocumentoLabel, formatData } from "@/types/mezzi";

export function VerbaleTecnicoDialog({
  companyId,
  mezzoId,
  manutenzioneId,
  onClose,
  onVaiDocumenti,
}: {
  companyId: string;
  mezzoId: string;
  manutenzioneId: string;
  onClose: () => void;
  onVaiDocumenti?: () => void;
}) {
  const p = usePermissions();
  const q = usePreparaVerbaleTecnico(
    companyId,
    mezzoId,
    manutenzioneId,
    p.canEditMezzi,
  );
  const registro = useVerbaliTecniciMezzo(companyId, mezzoId);
  const salva = useRegistraVerbaleTecnico(companyId, mezzoId);
  const [parametri, setParametri] = useState<ParametriVerbaleTecnico>(() =>
    normalizzaParametriVerbale(null),
  );
  const [richiesta] = useState(() => crypto.randomUUID());
  const [vistoImpronta, setVistoImpronta] = useState<string | null>(null);
  const [confermataImpronta, setConfermataImpronta] = useState<string | null>(
    null,
  );
  const [errore, setErrore] = useState("");
  const impronta = q.data?.fonte.impronta;
  const visto = !!impronta && vistoImpronta === impronta;
  const effettivi = {
    ...parametri,
    conferma_tecnica:
      parametri.conferma_tecnica &&
      !!impronta &&
      confermataImpronta === impronta,
  };
  const busy = salva.isPending;
  const sola = !p.canEditMezzi;
  const giaRegistrato = registro.data?.registrazioni.some(
    (r) =>
      r.manutenzione_id === manutenzioneId &&
      r.fonte_impronta === impronta &&
      r.disponibile,
  );
  const modifica = (patch: Partial<ParametriVerbaleTecnico>) => {
    if (!sola && !busy) {
      setParametri((v) => ({ ...v, conferma_tecnica: false, ...patch }));
      setConfermataImpronta(
        patch.conferma_tecnica === true ? impronta || null : null,
      );
    }
  };
  const errori = erroriParametriVerbale(normalizzaParametriVerbale(effettivi));
  const registra = async () => {
    if (
      sola ||
      busy ||
      !q.data ||
      q.isError ||
      giaRegistrato ||
      !visto ||
      errori.length
    )
      return;
    setErrore("");
    try {
      const r = await salva.mutateAsync({
        manutenzioneId,
        richiestaId: richiesta,
        impronta: q.data.fonte.impronta,
        parametri: normalizzaParametriVerbale(effettivi),
      });
      if (!r.disponibile)
        toast.warning(
          "La registrazione esiste, ma il documento non è più disponibile: controlla la scheda Documenti.",
        );
      else
        toast.success(
          "Verbale tecnico registrato nei documenti della macchina",
        );
      onClose();
      onVaiDocumenti?.();
    } catch (e) {
      setErrore(
        e instanceof Error
          ? e.message
          : "Registrazione non completata. Riprova da questo dialogo.",
      );
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registra un verbale tecnico</DialogTitle>
          <DialogDescription>
            Verifica l’allegato dell’intervento e crea una copia separata nei
            documenti della macchina, selezionabile poi nel POS.
          </DialogDescription>
        </DialogHeader>
        {sola ? (
          <p role="alert">
            Serve il permesso di modifica Mezzi per registrare il verbale.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se l’allegato è una fattura o contiene anche dati economici,
              carica prima un verbale tecnico separato. La classificazione resta
              una tua dichiarazione da verificare.
            </p>
            {q.isLoading && (
              <p role="status">Lettura dell’allegato dell’intervento…</p>
            )}
            {q.isError && (
              <p role="alert">
                {q.error instanceof Error
                  ? q.error.message
                  : "Originale non disponibile"}
              </p>
            )}
            {q.data && !q.isError && (
              <div className="space-y-2 rounded border bg-slate-50 p-3 text-sm">
                <p className="break-words font-medium">
                  {q.data.fonte.file_name}
                </p>
                <p>Intervento del {formatData(q.data.fonte.data)}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || q.isFetching}
                  onClick={() => {
                    setErrore("");
                    try {
                      const url = urlVerbaleTecnico(
                        q.data.url,
                        companyId,
                        mezzoId,
                      );
                      const finestra = window.open("about:blank", "_blank");
                      if (!finestra)
                        throw new Error("Consenti una nuova scheda e riprova");
                      finestra.opener = null;
                      finestra.location.href = url;
                      setVistoImpronta(impronta || null);
                    } catch (e) {
                      setErrore(
                        e instanceof Error
                          ? e.message
                          : "Apertura non disponibile",
                      );
                    }
                  }}
                >
                  Apri allegato da verificare
                </Button>
              </div>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || q.isFetching}
              onClick={() => {
                setVistoImpronta(null);
                modifica({ conferma_tecnica: false });
                void q.refetch();
                void registro.refetch();
              }}
            >
              Rileggi allegato e registrazioni
            </Button>
            {registro.isError && (
              <p role="alert">
                Non riesco a leggere le copie già registrate. Rileggi prima di
                registrare.
              </p>
            )}
            {giaRegistrato ? (
              <div className="space-y-2 rounded border border-green-200 bg-green-50 p-3 text-sm">
                <p>
                  Questo allegato è già registrato nei documenti della macchina.
                </p>
                {onVaiDocumenti && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      onClose();
                      onVaiDocumenti();
                    }}
                  >
                    Vai ai documenti tecnici
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div>
                  <Label htmlFor="verbale-titolo">
                    Titolo del documento tecnico
                  </Label>
                  <Input
                    id="verbale-titolo"
                    maxLength={180}
                    value={parametri.titolo}
                    disabled={busy}
                    onChange={(e) => modifica({ titolo: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="verbale-categoria">
                    Classificazione tecnica
                  </Label>
                  <select
                    id="verbale-categoria"
                    className="h-10 w-full rounded border bg-background px-2 text-sm"
                    value={parametri.categoria}
                    disabled={busy}
                    onChange={(e) => modifica({ categoria: e.target.value })}
                  >
                    <option value="">Scegli dopo aver letto l’allegato</option>
                    {CATEGORIE_VERBALE_TECNICO.map((c) => (
                      <option key={c} value={c}>
                        {categoriaDocumentoLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="verbale-inizio">
                      Valido dal, se indicato
                    </Label>
                    <Input
                      id="verbale-inizio"
                      type="date"
                      value={parametri.data_inizio || ""}
                      disabled={busy}
                      onChange={(e) =>
                        modifica({ data_inizio: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="verbale-scadenza">
                      Scadenza, se indicata
                    </Label>
                    <Input
                      id="verbale-scadenza"
                      type="date"
                      min={parametri.data_inizio || undefined}
                      value={parametri.data_scadenza || ""}
                      disabled={busy}
                      onChange={(e) =>
                        modifica({ data_scadenza: e.target.value || null })
                      }
                    />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={effettivi.conferma_tecnica}
                    disabled={busy || !visto}
                    onChange={(e) =>
                      modifica({ conferma_tecnica: e.target.checked })
                    }
                  />
                  Ho letto l’allegato: è un documento tecnico pertinente alla
                  macchina, separato da fatture o altri dati economici.
                </label>
                <p className="text-xs text-muted-foreground">
                  La copia sarà autonoma dall’allegato dell’intervento. Nel POS
                  serviranno ancora selezione, verifica della revisione e
                  riesame per il cantiere.
                </p>
              </>
            )}
            {errore && (
              <p role="alert" className="text-sm text-red-700">
                {errore}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Annulla
          </Button>
          {!sola && !giaRegistrato && (
            <Button
              type="button"
              disabled={
                busy ||
                !q.data ||
                q.isError ||
                q.isFetching ||
                registro.isError ||
                registro.isLoading ||
                !visto ||
                errori.length > 0
              }
              onClick={() => void registra()}
            >
              {busy ? "Registrazione…" : "Registra copia tecnica"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
