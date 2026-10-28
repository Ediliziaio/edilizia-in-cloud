import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useSalvaDpi, useStoricoDpi } from "@/hooks/useGestioneDpi";
import type { SalvaDpi } from "@/hooks/useGestioneDpi";
import type { VerbaleDpi } from "@/lib/sicurezza/dpiCommessa";
import type { EventoDpi } from "@/lib/sicurezza/gestioneDpi";
import {
  TIPI_DPI,
  type AddettoDpi,
  type ConsegnaDpi,
} from "@/lib/sicurezza/dpiCommessa";
import {
  datiConsegna,
  erroriConsegnaDpi,
  STATI_DPI,
  type DatiConsegnaDpi,
} from "@/lib/sicurezza/gestioneDpi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export interface ContestoGestioneDpi {
  companyId: string;
  orderId: string;
  data: string;
  faseId?: string;
  addetti: AddettoDpi[];
}
/** Mounted for one explicit context; query refreshes cannot advance the open form's base version. */
interface PropsModuloDpi {
  contesto: ContestoGestioneDpi;
  addettoId?: string;
  consegna?: ConsegnaDpi;
  onClose: () => void;
}
export function GestioneDpiDialog(props: PropsModuloDpi) {
  const [b] = useState(() => ({
    companyId: props.contesto.companyId,
    orderId: props.contesto.orderId,
  }));
  const salva = useSalvaDpi(b.companyId, b.orderId);
  return <ModuloConsegnaDpi {...props} salva={salva} />;
}
export function ModuloConsegnaDpi({
  contesto,
  addettoId,
  consegna,
  onClose,
  salva,
  esterno,
}: {
  contesto: ContestoGestioneDpi;
  addettoId?: string;
  consegna?: ConsegnaDpi;
  onClose: () => void;
  salva: { isPending: boolean; mutateAsync: (v: SalvaDpi) => Promise<unknown> };
  esterno?: {
    subId: string;
    evidenze: VerbaleDpi[];
    rileggi?: () => Promise<VerbaleDpi[]>;
  };
}) {
  const [base] = useState(() => ({
    contesto: structuredClone(contesto),
    id: consegna?.id ?? crypto.randomUUID(),
    versione: consegna?.versione ?? null,
    modulo: !!consegna?.modulo_registrato,
    esterno: esterno ? { subId: esterno.subId } : null,
  }));
  const [documentiLetti, setDocumentiLetti] = useState(() =>
    structuredClone(esterno?.evidenze ?? []),
  );
  const [rilettura, setRilettura] = useState(false);
  const [erroreRilettura, setErroreRilettura] = useState("");
  const [addetto, setAddetto] = useState(addettoId ?? "");
  const [dati, setDati] = useState(() => ({
    ...datiConsegna(consegna),
    ...(esterno
      ? {
          evidenza_id: consegna?.evidenza_id ?? null,
          evidenza_impronta: consegna?.evidenza_impronta ?? null,
          evidenza_attesa: consegna?.evidenza_attesa ?? null,
        }
      : {}),
  }));
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const [errore, setErrore] = useState("");
  const p = usePermissions();
  const bloccato =
    salva.isPending ||
    rilettura ||
    !p.canViewSicurezzaCantiere ||
    p.solaLettura;
  const cambia = <K extends keyof DatiConsegnaDpi>(
    k: K,
    v: DatiConsegnaDpi[K],
  ) => {
    setDati((d) => ({ ...d, [k]: v }));
    setRequest(crypto.randomUUID());
    setErrore("");
  };
  const addettoScelto = base.contesto.addetti.find((a) => a.id === addetto);
  const verbali = documentiLetti.filter((e) => e.operaio_id === addetto);
  const verbale = verbali.find((e) => e.id === dati.evidenza_id);
  const scegliVerbale = (id: string) => {
    setDati((d) => ({
      ...d,
      evidenza_id: id || null,
      evidenza_attesa: verbali.find((e) => e.id === id)?.updated_at ?? null,
      evidenza_impronta: verbali.find((e) => e.id === id)?.impronta ?? null,
    }));
    setRequest(crypto.randomUUID());
    setErrore("");
  };
  async function rileggiVerbali() {
    if (bloccato || !esterno?.rileggi) return;
    setRilettura(true);
    setErroreRilettura("");
    try {
      setDocumentiLetti(await esterno.rileggi());
    } catch (e) {
      setErroreRilettura(
        e instanceof Error
          ? e.message
          : "Rilettura non riuscita. I dati inseriti sono conservati.",
      );
    } finally {
      setRilettura(false);
    }
  }
  async function registra() {
    if (bloccato) return;
    const e = erroriConsegnaDpi(dati);
    if (!addettoScelto) e.unshift("Scegli l’addetto titolare.");
    if (consegna && !base.versione)
      e.unshift("Rileggi la consegna prima di rettificarla.");
    if (!consegna && addettoScelto?.attivo !== true)
      e.unshift("Per una nuova consegna scegli un addetto attivo.");
    if (e.length) {
      setErrore(e.join(" "));
      return;
    }
    try {
      await salva.mutateAsync({
        id: base.id,
        titolareId: addetto,
        versione: base.versione,
        requestId: request,
        dataRiferimento: base.contesto.data,
        faseId: base.contesto.faseId,
        dati,
      });
      onClose();
    } catch (e) {
      setErrore(
        e instanceof Error
          ? e.message
          : "Registrazione non confermata. Conserva i dati e riprova con lo stesso modulo.",
      );
    }
  }
  const testo = (
    k:
      | "marca"
      | "taglia"
      | "matricola"
      | "consegnato_il"
      | "scade_il"
      | "restituito_il",
    label: string,
    tipo = "text",
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`dpi-${k}`}>{label}</Label>
      <Input
        id={`dpi-${k}`}
        type={tipo}
        maxLength={tipo === "text" ? 200 : undefined}
        disabled={bloccato}
        value={dati[k]}
        onChange={(e) => cambia(k, e.target.value)}
      />
    </div>
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !salva.isPending) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {consegna ? "Rettifica consegna DPI" : "Registra consegna DPI"}
          </DialogTitle>
          <DialogDescription>
            {base.esterno
              ? "Registro dell’impresa esterna."
              : "Registro della propria impresa."}{" "}
            La consegna resta dell’addetto e può essere consultata nelle altre
            commesse a cui è collegato; non è una nuova consegna per ogni
            cantiere.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">
            Contesto letto il {base.contesto.data} ·{" "}
            {base.esterno && !base.contesto.orderId
              ? "fascicolo dell’impresa, nessuna commessa selezionata"
              : base.contesto.faseId
                ? "fase selezionata"
                : "tutte le fasi"}
            {base.versione ? ` · versione ${base.versione}` : ""}. Il
            salvataggio richiede la versione ancora corrente.
          </p>
          <fieldset disabled={bloccato} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="dpi-addetto">Addetto titolare</Label>
              <select
                id="dpi-addetto"
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={addetto}
                disabled={!!consegna || bloccato}
                onChange={(e) => {
                  setAddetto(e.target.value);
                  if (base.esterno)
                    setDati((d) => ({
                      ...d,
                      evidenza_id: null,
                      evidenza_attesa: null,
                      evidenza_impronta: null,
                    }));
                  setRequest(crypto.randomUUID());
                  setErrore("");
                }}
              >
                <option value="">Scegli l’addetto…</option>
                {base.contesto.addetti
                  .filter((a) => consegna || a.attivo === true)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} {a.cognome} · rif. {a.id.slice(0, 8)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="dpi-tipo">Dispositivo</Label>
                <select
                  id="dpi-tipo"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={dati.tipo}
                  onChange={(e) => cambia("tipo", e.target.value)}
                >
                  <option value="">Scegli il dispositivo…</option>
                  {Object.entries(TIPI_DPI).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="dpi-stato">Stato registrato</Label>
                <select
                  id="dpi-stato"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={dati.stato}
                  onChange={(e) => cambia("stato", e.target.value)}
                >
                  {Object.entries(STATI_DPI).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {testo("marca", "Marca")}
              {testo("taglia", "Taglia")}
              {testo("matricola", "Matricola / identificativo")}
              {testo("consegnato_il", "Data di consegna", "date")}
              {testo("scade_il", "Scadenza, se prevista", "date")}
              {testo("restituito_il", "Data di restituzione", "date")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="dpi-note">Note tecniche</Label>
              <textarea
                id="dpi-note"
                maxLength={2000}
                rows={2}
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={dati.note}
                onChange={(e) => cambia("note", e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dati.annullata}
                onChange={(e) => cambia("annullata", e.target.checked)}
              />
              Annulla questa registrazione, conservando lo storico
            </label>
            <div className="space-y-1">
              <Label htmlFor="dpi-motivo">
                Motivo della registrazione o rettifica
              </Label>
              <textarea
                id="dpi-motivo"
                maxLength={2000}
                rows={2}
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={dati.motivo}
                onChange={(e) => cambia("motivo", e.target.value)}
              />
            </div>
          </fieldset>
          {base.esterno && (
            <fieldset
              disabled={bloccato}
              className="space-y-2 rounded-lg border p-3"
            >
              <Label htmlFor="dpi-verbale">
                Verbale DPI dal fascicolo dell’operaio
              </Label>
              <select
                id="dpi-verbale"
                className="w-full rounded border bg-background p-2 text-sm"
                value={dati.evidenza_id ?? ""}
                onChange={(e) => scegliVerbale(e.target.value)}
              >
                <option value="">Nessun verbale collegato</option>
                {dati.evidenza_id && !verbale && (
                  <option value={dati.evidenza_id} disabled>
                    Riferimento precedente da riesaminare
                  </option>
                )}
                {verbali.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.titolo} · {v.file_name} · {v.stato}
                    {v.revisione ? ` · rev. ${v.revisione}` : ""} ·{" "}
                    {v.order_id
                      ? "commessa specifica"
                      : "generale dell’operaio"}
                    {v.fase_id ? " · fase specifica" : ""}
                  </option>
                ))}
              </select>
              {verbale && (
                <p className="text-xs text-muted-foreground">
                  Versione letta: {verbale.updated_at} · stato documentale:{" "}
                  {verbale.stato}
                  {verbale.data_scadenza
                    ? ` · scadenza ${verbale.data_scadenza}`
                    : ""}
                  .
                </p>
              )}
              {verbale &&
                (dati.evidenza_attesa !== verbale.updated_at ||
                  dati.evidenza_impronta !== verbale.impronta) && (
                  <div className="space-y-2">
                    <p role="alert" className="text-sm text-amber-800">
                      Il riferimento salvato è cambiato. Consulta il fascicolo e
                      conferma esplicitamente la versione letta per
                      ricollegarlo.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => scegliVerbale(verbale.id)}
                    >
                      Usa questa versione del verbale
                    </Button>
                  </div>
                )}
              {esterno?.rileggi && (
                <div className="space-y-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void rileggiVerbali()}
                  >
                    {rilettura
                      ? "Rilettura verbali…"
                      : "Rileggi verbali dal fascicolo"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Aggiorna i documenti disponibili conservando i dati
                    inseriti. Una versione cambiata richiede conferma; la
                    versione della dotazione resta quella aperta.
                  </p>
                  {erroreRilettura && (
                    <p role="alert" className="text-sm text-destructive">
                      {erroreRilettura}
                    </p>
                  )}
                </div>
              )}
              {!addetto && (
                <p className="text-xs text-muted-foreground">
                  Scegli prima l’operaio titolare.
                </p>
              )}
              {addetto && !verbali.length && (
                <p className="text-xs text-muted-foreground">
                  Nessun verbale con file pertinente disponibile. Classificalo
                  come Verbale di consegna DPI nel fascicolo di questo operaio;
                  non viene copiato un documento di un collega.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Il collegamento conserva il riferimento alla versione letta, non
                verifica firma, contenuto o corrispondenza al dispositivo.
                L’annullamento può conservare un collegamento precedente; il
                ripristino richiede di riesaminarlo.
              </p>
            </fieldset>
          )}
          <p className="text-xs text-muted-foreground">
            {base.esterno
              ? "Il verbale resta nel fascicolo dell’impresa esterna, senza duplicare il file."
              : base.modulo
                ? "Il riferimento al modulo già presente viene conservato."
                : "Nessun modulo di consegna è collegato a questa registrazione."}{" "}
            Questa operazione registra dati; non crea una firma, un verbale
            sottoscritto o una verifica di adeguatezza.
          </p>
          {(!p.canViewSicurezzaCantiere || p.solaLettura) && (
            <p role="alert" className="text-sm text-destructive">
              Il tuo accesso ora è di sola lettura: non puoi salvare.
            </p>
          )}
          {errore && (
            <p role="alert" className="text-sm text-destructive">
              {errore}
            </p>
          )}
        </div>
        <DialogFooter className="border-t pt-3">
          <Button
            variant="outline"
            disabled={salva.isPending}
            onClick={onClose}
          >
            Annulla
          </Button>
          <Button disabled={bloccato} onClick={() => void registra()}>
            {salva.isPending ? "Salvataggio…" : "Salva nel registro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export function StoricoDpiDialog({
  companyId,
  addetto,
  consegna,
  onClose,
}: {
  companyId: string;
  addetto: AddettoDpi;
  consegna: ConsegnaDpi;
  onClose: () => void;
}) {
  const q = useStoricoDpi(companyId, addetto.id, consegna.id);
  return (
    <StoricoDpiDialogBase
      addetto={addetto}
      consegna={consegna}
      onClose={onClose}
      q={q}
    />
  );
}
export function StoricoDpiDialogBase({
  addetto,
  consegna,
  onClose,
  q,
}: {
  addetto: AddettoDpi;
  consegna: ConsegnaDpi;
  onClose: () => void;
  q: {
    isLoading: boolean;
    isError: boolean;
    data?: EventoDpi[];
    refetch: () => unknown;
  };
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Storico della consegna DPI</DialogTitle>
          <DialogDescription>
            {addetto.nome} {addetto.cognome} ·{" "}
            {TIPI_DPI[consegna.tipo] || consegna.tipo} · rif.{" "}
            {consegna.id.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p role="status">Caricamento dello storico…</p>
        ) : q.isError ? (
          <p role="alert">
            Storico non disponibile.{" "}
            <Button variant="link" onClick={() => void q.refetch()}>
              Riprova
            </Button>
          </p>
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">
            Nessun evento disponibile. Le registrazioni precedenti
            all’attivazione dello storico non hanno una cronologia ricostruita
            automaticamente.
          </p>
        ) : (
          q.data.map((e) => (
            <details key={e.id} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Versione {e.versione} · {e.operazione} ·{" "}
                {new Date(e.registrato_il).toLocaleString("it-IT", {
                  timeZone: "Europe/Rome",
                })}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm">{e.motivo}</p>
              <p className="text-xs text-muted-foreground">
                {e.registrato_da
                  ? `Account rif. ${e.registrato_da.slice(0, 8)}`
                  : "Operazione di sistema / account non disponibile"}
              </p>
              {e.dopo ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Dati registrati in questa versione, senza ricalcolare lo
                    stato di oggi.
                  </p>
                  <p>
                    {TIPI_DPI[e.dopo.tipo] || e.dopo.tipo} ·{" "}
                    {e.dopo.annullata
                      ? "Registrazione annullata"
                      : STATI_DPI[e.dopo.stato as keyof typeof STATI_DPI] ||
                        "Stato da controllare"}
                  </p>
                  <p>
                    Consegna {e.dopo.consegnato_il} · scadenza{" "}
                    {e.dopo.scade_il || "non indicata"} · reso{" "}
                    {e.dopo.restituito_il || "non indicato"}
                  </p>
                  <p>
                    {[e.dopo.marca, e.dopo.taglia, e.dopo.matricola]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="whitespace-pre-wrap">{e.dopo.note}</p>
                  {e.dopo.evidenza_snapshot && (
                    <p>
                      Verbale collegato nella versione:{" "}
                      {e.dopo.evidenza_snapshot.titolo} ·{" "}
                      {e.dopo.evidenza_snapshot.file_name} ·{" "}
                      {e.dopo.evidenza_snapshot.stato} · riferimento letto{" "}
                      {e.dopo.evidenza_snapshot.updated_at}
                    </p>
                  )}
                  {e.dopo.annullata && (
                    <p>Motivo annullamento: {e.dopo.annullamento_motivo}</p>
                  )}
                  <p>
                    {e.dopo.modulo_registrato
                      ? "Riferimento al modulo presente in questa versione"
                      : "Nessun riferimento al modulo in questa versione"}
                  </p>
                </div>
              ) : (
                <p className="text-sm">
                  Registrazione eliminata dal sistema d’origine; l’evento resta
                  nello storico.
                </p>
              )}
              {e.prima && (
                <details className="mt-2 rounded border p-2 text-sm">
                  <summary className="cursor-pointer">
                    Dati prima della modifica
                  </summary>
                  <p>
                    {TIPI_DPI[e.prima.tipo] || e.prima.tipo} ·{" "}
                    {e.prima.annullata
                      ? "Registrazione annullata"
                      : STATI_DPI[e.prima.stato as keyof typeof STATI_DPI] ||
                        "Stato da controllare"}
                  </p>
                  <p>
                    Consegna {e.prima.consegnato_il} · scadenza{" "}
                    {e.prima.scade_il || "non indicata"} · reso{" "}
                    {e.prima.restituito_il || "non indicato"}
                  </p>
                  <p>
                    {[e.prima.marca, e.prima.taglia, e.prima.matricola]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="whitespace-pre-wrap">{e.prima.note}</p>
                  {e.prima.annullata && (
                    <p>Motivo annullamento: {e.prima.annullamento_motivo}</p>
                  )}
                  <p>
                    {e.prima.modulo_registrato
                      ? "Riferimento al modulo presente prima della modifica"
                      : "Nessun riferimento al modulo prima della modifica"}
                  </p>
                </details>
              )}
            </details>
          ))
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
