import { UniformSelect } from "@/components/ui/uniform-select";
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
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
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
  const tr = useT();
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
          : tr("Rilettura non riuscita. I dati inseriti sono conservati."),
      );
    } finally {
      setRilettura(false);
    }
  }
  async function registra() {
    if (bloccato) return;
    const e = erroriConsegnaDpi(dati);
    if (!addettoScelto) e.unshift(tr("Scegli l’addetto titolare."));
    if (consegna && !base.versione)
      e.unshift(tr("Rileggi la consegna prima di rettificarla."));
    if (!consegna && addettoScelto?.attivo !== true)
      e.unshift(tr("Per una nuova consegna scegli un addetto attivo."));
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
          : tr("Registrazione non confermata. Conserva i dati e riprova con lo stesso modulo."),
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
            {consegna ? tr("Rettifica consegna DPI") : tr("Registra consegna DPI")}
          </DialogTitle>
          <DialogDescription>
            {base.esterno
              ? tr("Registro dell’impresa esterna.")
              : tr("Registro della propria impresa.")}{" "}
            {tr("La consegna resta dell’addetto e può essere consultata nelle altre commesse a cui è collegato; non è una nuova consegna per ogni cantiere.")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">
            {tr("Contesto letto il {data}", { data: base.contesto.data })} ·{" "}
            {base.esterno && !base.contesto.orderId
              ? tr("fascicolo dell’impresa, nessuna commessa selezionata")
              : base.contesto.faseId
                ? tr("fase selezionata")
                : tr("tutte le fasi")}
            {base.versione ? tr(" · versione {versione}", { versione: String(base.versione ?? "") }) : ""}{tr(". Il salvataggio richiede la versione ancora corrente.")}
          </p>
          <fieldset disabled={bloccato} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="dpi-addetto">{tr("Addetto titolare")}</Label>
              <UniformSelect
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
                <option value="">{tr("Scegli l’addetto…")}</option>
                {base.contesto.addetti
                  .filter((a) => consegna || a.attivo === true)
                  .map((a) => (
                    <option key={a.id} value={a.id}>{tr("{nome} {cognome} · rif. {id}", { nome: String(a.nome ?? ""), cognome: String(a.cognome ?? ""), id: a.id.slice(0, 8) })}</option>
                  ))}
              </UniformSelect>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="dpi-tipo">{tr("Dispositivo")}</Label>
                <UniformSelect
                  id="dpi-tipo"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={dati.tipo}
                  onChange={(e) => cambia("tipo", e.target.value)}
                >
                  <option value="">{tr("Scegli il dispositivo…")}</option>
                  {Object.entries(TIPI_DPI).map(([v, nome]) => (
                    <option key={v} value={v}>
                      {tr(nome)}
                    </option>
                  ))}
                </UniformSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="dpi-stato">{tr("Stato registrato")}</Label>
                <UniformSelect
                  id="dpi-stato"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={dati.stato}
                  onChange={(e) => cambia("stato", e.target.value)}
                >
                  {Object.entries(STATI_DPI).map(([v, nome]) => (
                    <option key={v} value={v}>
                      {tr(nome)}
                    </option>
                  ))}
                </UniformSelect>
              </div>
              {testo("marca", tr("Marca"))}
              {testo("taglia", tr("Taglia"))}
              {testo("matricola", tr("Matricola / identificativo"))}
              {testo("consegnato_il", tr("Data di consegna"), "date")}
              {testo("scade_il", tr("Scadenza, se prevista"), "date")}
              {testo("restituito_il", tr("Data di restituzione"), "date")}
            </div>
            <div className="space-y-1">
              <Label htmlFor="dpi-note">{tr("Note tecniche")}</Label>
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
              {tr("Annulla questa registrazione, conservando lo storico")}
            </label>
            <div className="space-y-1">
              <Label htmlFor="dpi-motivo">
                {tr("Motivo della registrazione o rettifica")}
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
                {tr("Verbale DPI dal fascicolo dell’operaio")}
              </Label>
              <UniformSelect
                id="dpi-verbale"
                className="w-full rounded border bg-background p-2 text-sm"
                value={dati.evidenza_id ?? ""}
                onChange={(e) => scegliVerbale(e.target.value)}
              >
                <option value="">{tr("Nessun verbale collegato")}</option>
                {dati.evidenza_id && !verbale && (
                  <option value={dati.evidenza_id} disabled>
                    {tr("Riferimento precedente da riesaminare")}
                  </option>
                )}
                {verbali.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.titolo} · {v.file_name} · {v.stato}
                    {v.revisione ? tr(" · rev. {revisione}", { revisione: String(v.revisione ?? "") }) : ""} ·{" "}
                    {v.order_id
                      ? tr("commessa specifica")
                      : tr("generale dell’operaio")}
                    {v.fase_id ? ` ${tr("· fase specifica")}` : ""}
                  </option>
                ))}
              </UniformSelect>
              {verbale && (
                <p className="text-xs text-muted-foreground">
                  {tr("Versione letta: {versione} · stato documentale: {stato}", { versione: verbale.updated_at, stato: verbale.stato })}
                  {verbale.data_scadenza
                    ? tr(" · scadenza {data_scadenza}", { data_scadenza: String(verbale.data_scadenza ?? "") })
                    : ""}
                  .
                </p>
              )}
              {verbale &&
                (dati.evidenza_attesa !== verbale.updated_at ||
                  dati.evidenza_impronta !== verbale.impronta) && (
                  <div className="space-y-2">
                    <p role="alert" className="text-sm text-amber-800">
                      {tr("Il riferimento salvato è cambiato. Consulta il fascicolo e conferma esplicitamente la versione letta per ricollegarlo.")}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => scegliVerbale(verbale.id)}
                    >
                      {tr("Usa questa versione del verbale")}
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
                      ? tr("Rilettura verbali…")
                      : tr("Rileggi verbali dal fascicolo")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {tr("Aggiorna i documenti disponibili conservando i dati inseriti. Una versione cambiata richiede conferma; la versione della dotazione resta quella aperta.")}
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
                  {tr("Scegli prima l’operaio titolare.")}
                </p>
              )}
              {addetto && !verbali.length && (
                <p className="text-xs text-muted-foreground">
                  {tr("Nessun verbale con file pertinente disponibile. Classificalo come Verbale di consegna DPI nel fascicolo di questo operaio; non viene copiato un documento di un collega.")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {tr("Il collegamento conserva il riferimento alla versione letta, non verifica firma, contenuto o corrispondenza al dispositivo. L’annullamento può conservare un collegamento precedente; il ripristino richiede di riesaminarlo.")}
              </p>
            </fieldset>
          )}
          <p className="text-xs text-muted-foreground">
            {base.esterno
              ? tr("Il verbale resta nel fascicolo dell’impresa esterna, senza duplicare il file.")
              : base.modulo
                ? tr("Il riferimento al modulo già presente viene conservato.")
                : tr("Nessun modulo di consegna è collegato a questa registrazione.")}{" "}
            {tr("Questa operazione registra dati; non crea una firma, un verbale sottoscritto o una verifica di adeguatezza.")}
          </p>
          {(!p.canViewSicurezzaCantiere || p.solaLettura) && (
            <p role="alert" className="text-sm text-destructive">
              {tr("Il tuo accesso ora è di sola lettura: non puoi salvare.")}
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
            {tr("Annulla")}
          </Button>
          <Button disabled={bloccato} onClick={() => void registra()}>
            {salva.isPending ? tr("Salvataggio…") : tr("Salva nel registro")}
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
  const t = useT();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Storico della consegna DPI")}</DialogTitle>
          <DialogDescription>
            {addetto.nome} {addetto.cognome} ·{" "}
            {TIPI_DPI[consegna.tipo] ? t(TIPI_DPI[consegna.tipo]) : consegna.tipo} {t("· rif.")}{" "}
            {consegna.id.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <p role="status">{t("Caricamento dello storico…")}</p>
        ) : q.isError ? (
          <p role="alert">
            {t("Storico non disponibile.")}{" "}
            <Button variant="link" onClick={() => void q.refetch()}>
              {t("Riprova")}
            </Button>
          </p>
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">
            {t("Nessun evento disponibile. Le registrazioni precedenti all’attivazione dello storico non hanno una cronologia ricostruita automaticamente.")}
          </p>
        ) : (
          q.data.map((e) => (
            <details key={e.id} className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">{t("Versione {versione} · {operazione} · {valore}", { versione: String(e.versione ?? ""), operazione: String(e.operazione ?? ""), valore: new Date(e.registrato_il).toLocaleString(intlCampo(), {
                  timeZone: "Europe/Rome",
                }) })}</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm">{e.motivo}</p>
              <p className="text-xs text-muted-foreground">
                {e.registrato_da
                  ? t("Account rif. {registrato_da}", { registrato_da: e.registrato_da.slice(0, 8) })
                  : t("Operazione di sistema / account non disponibile")}
              </p>
              {e.dopo ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {t("Dati registrati in questa versione, senza ricalcolare lo stato di oggi.")}
                  </p>
                  <p>
                    {TIPI_DPI[e.dopo.tipo] ? t(TIPI_DPI[e.dopo.tipo]) : e.dopo.tipo} ·{" "}
                    {e.dopo.annullata
                      ? t("Registrazione annullata")
                      : t(STATI_DPI[e.dopo.stato as keyof typeof STATI_DPI] ||
                        "Stato da controllare")}
                  </p>
                  <p>
                    {t("Consegna {consegna} · scadenza {scadenza} · reso {reso}", { consegna: e.dopo.consegnato_il, scadenza: e.dopo.scade_il || t("non indicata"), reso: e.dopo.restituito_il || t("non indicato") })}
                  </p>
                  <p>
                    {[e.dopo.marca, e.dopo.taglia, e.dopo.matricola]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="whitespace-pre-wrap">{e.dopo.note}</p>
                  {e.dopo.evidenza_snapshot && (
                    <p>{t("Verbale collegato nella versione: {titolo} · {file_name} · {stato} · riferimento letto {updated_at}", { titolo: String(e.dopo.evidenza_snapshot.titolo ?? ""), file_name: String(e.dopo.evidenza_snapshot.file_name ?? ""), stato: String(e.dopo.evidenza_snapshot.stato ?? ""), updated_at: String(e.dopo.evidenza_snapshot.updated_at ?? "") })}</p>
                  )}
                  {e.dopo.annullata && (
                    <p>{t("Motivo annullamento: {annullamento_motivo}", { annullamento_motivo: String(e.dopo.annullamento_motivo ?? "") })}</p>
                  )}
                  <p>
                    {e.dopo.modulo_registrato
                      ? t("Riferimento al modulo presente in questa versione")
                      : t("Nessun riferimento al modulo in questa versione")}
                  </p>
                </div>
              ) : (
                <p className="text-sm">
                  {t("Registrazione eliminata dal sistema d’origine; l’evento resta nello storico.")}
                </p>
              )}
              {e.prima && (
                <details className="mt-2 rounded border p-2 text-sm">
                  <summary className="cursor-pointer">
                    {t("Dati prima della modifica")}
                  </summary>
                  <p>
                    {TIPI_DPI[e.prima.tipo] ? t(TIPI_DPI[e.prima.tipo]) : e.prima.tipo} ·{" "}
                    {e.prima.annullata
                      ? t("Registrazione annullata")
                      : t(STATI_DPI[e.prima.stato as keyof typeof STATI_DPI] ||
                        "Stato da controllare")}
                  </p>
                  <p>
                    {t("Consegna {consegna} · scadenza {scadenza} · reso {reso}", { consegna: e.prima.consegnato_il, scadenza: e.prima.scade_il || t("non indicata"), reso: e.prima.restituito_il || t("non indicato") })}
                  </p>
                  <p>
                    {[e.prima.marca, e.prima.taglia, e.prima.matricola]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="whitespace-pre-wrap">{e.prima.note}</p>
                  {e.prima.annullata && (
                    <p>{t("Motivo annullamento: {annullamento_motivo}", { annullamento_motivo: String(e.prima.annullamento_motivo ?? "") })}</p>
                  )}
                  <p>
                    {e.prima.modulo_registrato
                      ? t("Riferimento al modulo presente prima della modifica")
                      : t("Nessun riferimento al modulo prima della modifica")}
                  </p>
                </details>
              )}
            </details>
          ))
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Chiudi")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
